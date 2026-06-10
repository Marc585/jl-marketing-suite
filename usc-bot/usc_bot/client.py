"""Latency-critical HTTP client: poll availability, fire the booking POST.

This is where the "within one second" requirement is met:
  * a single long-lived HTTP/2 connection is kept warm (TLS handshake paid once),
  * the booking request is pre-built so firing it is a single round-trip,
  * availability parsing is cheap and tolerant of unknown response shapes.

Endpoint URLs and the booking payload template come from endpoints.json, which
is produced by session.discover_endpoints(). Cookies come from the persisted
Playwright login and are injected here.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

log = logging.getLogger("usc.client")

# keys that commonly carry the free-spot count / bookable flag in fitness APIs
_FREE_COUNT_KEYS = ("free_spots", "freeSpots", "available", "availableSpots",
                    "spots_available", "remaining", "places_left", "openSpots")
_BOOKABLE_KEYS = ("bookable", "is_bookable", "can_book", "canBook", "isBookable")
_WAITLIST_KEYS = ("waitlist_position", "waitlistPosition", "position")


@dataclass
class ClassState:
    raw: dict[str, Any]
    free_spots: int | None
    bookable: bool | None
    waitlist_position: int | None

    @property
    def is_open(self) -> bool:
        if self.bookable is True:
            return True
        if self.free_spots is not None and self.free_spots > 0:
            return True
        return False


def _deep_find(obj: Any, keys: tuple[str, ...]) -> Any:
    """Find the first value for any of `keys` anywhere in a nested dict/list."""
    stack = [obj]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if k in keys:
                    return v
                stack.append(v)
        elif isinstance(cur, list):
            stack.extend(cur)
    return None


class FastClient:
    def __init__(self, base_url: str, cookies: dict[str, str],
                 auth_headers: dict[str, str] | None = None,
                 debug: bool = False) -> None:
        self.base_url = base_url.rstrip("/")
        self.debug = debug
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        }
        if auth_headers:
            headers.update(auth_headers)
        # keepalive + http2 so repeated polls reuse one warm connection
        limits = httpx.Limits(max_keepalive_connections=4, keepalive_expiry=120)
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            cookies=cookies,
            http2=True,
            timeout=httpx.Timeout(8.0, connect=4.0),
            limits=limits,
            follow_redirects=True,
        )

    async def prewarm(self, url: str) -> None:
        """Pay the TLS/connection cost once before the hot loop starts."""
        try:
            await self._client.get(url)
        except Exception as exc:  # noqa: BLE001
            log.debug("prewarm failed (non-fatal): %s", exc)

    def update_cookies(self, cookies: dict[str, str]) -> None:
        self._client.cookies.update(cookies)

    async def fetch_state(self, availability_url: str) -> ClassState | None:
        try:
            r = await self._client.get(availability_url)
        except Exception as exc:  # noqa: BLE001
            log.debug("availability fetch error: %s", exc)
            return None
        if r.status_code in (401, 403):
            raise AuthExpired(r.status_code)
        if r.status_code >= 400:
            log.debug("availability HTTP %s", r.status_code)
            return None
        try:
            data = r.json()
        except Exception:
            return None
        if self.debug:
            log.info("RAW availability: %s", json.dumps(data)[:1500])

        free = _coerce_int(_deep_find(data, _FREE_COUNT_KEYS))
        bookable = _deep_find(data, _BOOKABLE_KEYS)
        pos = _coerce_int(_deep_find(data, _WAITLIST_KEYS))
        return ClassState(raw=data, free_spots=free,
                          bookable=bool(bookable) if bookable is not None else None,
                          waitlist_position=pos)

    async def book(self, booking: dict[str, Any]) -> tuple[bool, str]:
        """Fire the pre-built booking request. Returns (success, detail)."""
        method = booking.get("method", "POST").upper()
        url = booking["url"]
        body = booking.get("post_data")
        headers = booking.get("headers") or {}
        try:
            if isinstance(body, str):
                # post_data captured as a raw string (could be JSON or form)
                content = body
                r = await self._client.request(method, url, content=content, headers=headers)
            else:
                r = await self._client.request(method, url, json=body, headers=headers)
        except Exception as exc:  # noqa: BLE001
            return False, f"exception: {exc}"

        ok = 200 <= r.status_code < 300
        detail = f"HTTP {r.status_code}: {r.text[:300]}"
        # some APIs return 200 with an error body; check for obvious failures
        if ok and re.search(r"(error|failed|fehler|not available)", r.text, re.I):
            ok = False
        return ok, detail

    async def aclose(self) -> None:
        await self._client.aclose()


class AuthExpired(Exception):
    def __init__(self, status: int) -> None:
        super().__init__(f"auth expired ({status})")
        self.status = status


def _coerce_int(v: Any) -> int | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str) and v.strip().lstrip("-").isdigit():
        return int(v.strip())
    return None
