"""Orchestration: read the account, build the watchlist, run the polling loops."""
from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from .client import AuthExpired, ClassState, FastClient, _coerce_int, _deep_find
from .config import Config
from .notify import Notifier
from .session import DiscoveredEndpoints, SessionManager

log = logging.getLogger("usc.booker")

# keys commonly used to identify a class and whether it is waitlisted
_WAITLIST_FLAG_KEYS = ("is_waitlisted", "isWaitlisted", "on_waitlist", "waitlisted")
_START_KEYS = ("start", "start_time", "startTime", "starts_at", "startsAt", "date", "begin")
_ID_KEYS = ("id", "class_id", "classId", "event_id", "eventId", "booking_id", "appointment_id")
_TITLE_KEYS = ("title", "name", "class_name", "course", "activity")
_URL_KEYS = ("url", "web_url", "link", "booking_url", "deeplink", "href")


@dataclass
class WatchedClass:
    cid: str
    title: str
    start: datetime | None
    availability_url: str
    booking: dict[str, Any]
    web_url: str | None
    waitlisted: bool

    def key(self) -> str:
        return self.cid


class Booker:
    def __init__(self, cfg: Config, session: SessionManager,
                 endpoints: DiscoveredEndpoints, notifier: Notifier) -> None:
        self.cfg = cfg
        self.session = session
        self.endpoints = endpoints
        self.notifier = notifier
        self.client: FastClient | None = None
        self._booked: set[str] = set()
        self._tasks: dict[str, asyncio.Task] = {}

    async def start(self) -> None:
        cookies = await self.session.export_cookies()
        self.client = FastClient(
            base_url=self.cfg.base_url,
            cookies=cookies,
            auth_headers=self.endpoints.auth_headers,
            debug=self.cfg.debug,
        )
        # supervisor loop: periodically refresh the watchlist and (re)spawn tasks
        while True:
            try:
                watched = await self._build_watchlist()
            except AuthExpired:
                await self._reauth()
                continue
            except Exception as exc:  # noqa: BLE001
                log.exception("watchlist refresh failed: %s", exc)
                watched = []

            for wc in watched:
                if wc.key() in self._booked:
                    continue
                if wc.key() not in self._tasks or self._tasks[wc.key()].done():
                    log.info("Watching: %s (start=%s, waitlisted=%s)",
                             wc.title, wc.start, wc.waitlisted)
                    self._tasks[wc.key()] = asyncio.create_task(self._watch_class(wc))

            await asyncio.sleep(self.cfg.booking.refresh_watchlist_minutes * 60)

    # -- watchlist construction ---------------------------------------------

    async def _build_watchlist(self) -> list[WatchedClass]:
        """Pull the account's bookings and keep the waitlisted ones."""
        assert self.client is not None
        results: list[WatchedClass] = []

        for cand in self.endpoints.my_bookings:
            url = cand["url"]
            try:
                r = await self.client._client.get(url)
            except Exception as exc:  # noqa: BLE001
                log.debug("my-bookings fetch error: %s", exc)
                continue
            if r.status_code in (401, 403):
                raise AuthExpired(r.status_code)
            if r.status_code >= 400:
                continue
            try:
                data = r.json()
            except Exception:
                continue
            results.extend(self._parse_bookings(data))
            if results:
                break  # first endpoint that yields entries wins

        # de-duplicate by class id
        seen: dict[str, WatchedClass] = {}
        for wc in results:
            if self.cfg.auto_watch_waitlisted and not wc.waitlisted:
                # if user only wants waitlisted classes, skip already-booked ones
                if not self._matches_explicit(wc):
                    continue
            seen.setdefault(wc.cid, wc)
        return list(seen.values())

    def _parse_bookings(self, data: Any) -> list[WatchedClass]:
        """Walk the response and turn class-like objects into WatchedClass."""
        out: list[WatchedClass] = []
        for obj in _iter_class_objects(data):
            cid = _stringify(_deep_find(obj, _ID_KEYS))
            if not cid:
                continue
            title = _stringify(_deep_find(obj, _TITLE_KEYS)) or "Unknown class"
            start = _parse_dt(_deep_find(obj, _START_KEYS))
            waitlisted = bool(_deep_find(obj, _WAITLIST_FLAG_KEYS))
            web_url = _stringify(_deep_find(obj, _URL_KEYS))

            avail_url, booking = self._endpoints_for(cid, obj)
            out.append(WatchedClass(
                cid=cid, title=title, start=start,
                availability_url=avail_url, booking=booking,
                web_url=web_url, waitlisted=waitlisted,
            ))
        return out

    def _endpoints_for(self, cid: str, obj: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        """Build the availability URL and booking request for a class id.

        Uses the discovered templates and substitutes the class id. The {id}
        placeholder is inserted by replacing any numeric id segment found in the
        discovered sample URL.
        """
        avail_url = ""
        if self.endpoints.availability:
            avail_url = _substitute_id(self.endpoints.availability[0]["url"], cid)
        booking = {}
        if self.endpoints.booking:
            sample = self.endpoints.booking[0]
            booking = {
                "method": sample.get("method", "POST"),
                "url": _substitute_id(sample["url"], cid),
                "post_data": _substitute_id(sample.get("post_data"), cid)
                if sample.get("post_data") else None,
                "headers": {k: v for k, v in (sample.get("headers") or {}).items()
                            if k.lower() in ("content-type", "authorization",
                                             "x-csrf-token", "x-xsrf-token")},
            }
        return avail_url, booking

    def _matches_explicit(self, wc: WatchedClass) -> bool:
        for w in self.cfg.watchlist:
            if w.venue and (w.venue.lower() not in wc.title.lower()):
                continue
            if w.title and (w.title.lower() not in wc.title.lower()):
                continue
            return True
        return False

    # -- per-class polling loop ---------------------------------------------

    async def _watch_class(self, wc: WatchedClass) -> None:
        assert self.client is not None
        if wc.availability_url:
            await self.client.prewarm(wc.availability_url)

        while True:
            now = datetime.now(timezone.utc)
            if wc.start:
                mins_to_start = (wc.start - now).total_seconds() / 60
                if mins_to_start < -self.cfg.polling.give_up_minutes_after_start:
                    log.info("Class %s already started; stop watching.", wc.title)
                    return
                hot = mins_to_start <= self.cfg.polling.hot_window_minutes
            else:
                hot = True  # unknown start -> stay fast to be safe

            interval = (self.cfg.polling.hot_interval_seconds if hot
                        else self.cfg.polling.idle_interval_seconds)
            interval += random.uniform(0, self.cfg.polling.jitter_seconds)

            try:
                state = await self.client.fetch_state(wc.availability_url) \
                    if wc.availability_url else None
            except AuthExpired:
                await self._reauth()
                continue

            if state and state.is_open:
                await self._attempt_booking(wc, state)
                return

            await asyncio.sleep(interval)

    async def _attempt_booking(self, wc: WatchedClass, state: ClassState) -> None:
        assert self.client is not None
        log.info("SPOT OPEN for %s — booking now!", wc.title)
        ok, detail = False, "no booking endpoint"
        if wc.booking.get("url"):
            ok, detail = await self.client.book(wc.booking)

        if not ok and self.cfg.booking.enable_playwright_fallback and wc.web_url:
            log.warning("HTTP booking failed (%s); trying Playwright fallback.", detail)
            ok = await self.session.booking_fallback(wc.web_url)
            detail = "playwright fallback" + (" OK" if ok else " FAILED")

        if ok:
            self._booked.add(wc.key())
            await self.notifier.send(f"✅ Booked <b>{wc.title}</b> ({wc.start})")
            log.info("BOOKED %s", wc.title)
        else:
            await self.notifier.send(
                f"⚠️ Spot opened for <b>{wc.title}</b> but booking failed: {detail}")
            log.error("Booking FAILED for %s: %s", wc.title, detail)

    async def _reauth(self) -> None:
        log.warning("Session expired — re-authenticating via Playwright.")
        await self.session.ensure_logged_in(headless=True, force=True)
        cookies = await self.session.export_cookies()
        if self.client:
            self.client.update_cookies(cookies)
        await self.notifier.send("🔄 USC session refreshed.")


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _iter_class_objects(data: Any):
    """Yield dicts that look like a class/booking entry."""
    stack = [data]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            if any(k in cur for k in _ID_KEYS) and any(k in cur for k in _TITLE_KEYS):
                yield cur
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)


def _substitute_id(template: str | None, cid: str) -> str | None:
    if template is None:
        return None
    if "{id}" in template:
        return template.replace("{id}", cid)
    # replace a trailing/standalone numeric id segment with the target id
    import re
    return re.sub(r"(?<=/)\d{3,}(?=/|$|\?)", cid, template, count=1)


def _stringify(v: Any) -> str | None:
    if v is None:
        return None
    return str(v)


def _parse_dt(v: Any) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        # epoch seconds or ms
        ts = v / 1000 if v > 1e12 else v
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    if isinstance(v, str):
        s = v.strip().replace("Z", "+00:00")
        for fmt in (None,):  # try ISO first
            try:
                dt = datetime.fromisoformat(s)
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except Exception:
                pass
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d.%m.%Y %H:%M"):
            try:
                return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
            except Exception:
                pass
    return None
