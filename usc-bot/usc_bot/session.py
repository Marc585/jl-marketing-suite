"""Login + session persistence + endpoint auto-discovery via Playwright.

Playwright is used only for the slow, robust parts:
  * logging in (handles cookies / CSRF / an optional manual 2FA pause),
  * recording which JSON/XHR endpoints the web app actually calls so the fast
    HTTP client knows the real URLs for *your* account,
  * an optional booking fallback (clicking the real "Buchen" flow).

The latency-critical polling and booking happen in client.py over raw HTTP.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import Config

log = logging.getLogger("usc.session")

# Heuristics for recognising the interesting API calls among all XHRs the SPA
# fires. Discovery records every JSON request and then classifies them.
_AVAIL_HINTS = re.compile(r"(availab|schedule|class|course|event|slot|spot|venue)", re.I)
_BOOKING_HINTS = re.compile(r"(book|reserv|waitlist|enrol|register|checkout)", re.I)
_MYBOOKINGS_HINTS = re.compile(r"(my[-_/]?booking|reservation|waitlist|membership|me\b|profile)", re.I)


@dataclass
class CapturedRequest:
    method: str
    url: str
    headers: dict[str, str]
    post_data: str | None
    resource_type: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "method": self.method,
            "url": self.url,
            "headers": self.headers,
            "post_data": self.post_data,
            "resource_type": self.resource_type,
        }


@dataclass
class DiscoveredEndpoints:
    """Best-guess endpoint templates discovered from live traffic."""

    availability: list[dict[str, Any]] = field(default_factory=list)
    booking: list[dict[str, Any]] = field(default_factory=list)
    my_bookings: list[dict[str, Any]] = field(default_factory=list)
    # auth headers (e.g. Authorization: Bearer ...) seen on API calls
    auth_headers: dict[str, str] = field(default_factory=dict)

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(self.__dict__, indent=2), encoding="utf-8")
        log.info("Saved discovered endpoints -> %s", path)

    @classmethod
    def load(cls, path: Path) -> "DiscoveredEndpoints":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(**data)


class SessionManager:
    """Owns the Playwright browser context and the persisted login state."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._captured: list[CapturedRequest] = []

    # -- login / persistence -------------------------------------------------

    async def ensure_logged_in(self, headless: bool = True, force: bool = False):
        """Return a fresh browser context that is logged in.

        Reuses session_state.json if present and still valid, otherwise drives
        the login form and persists the new state.
        """
        from playwright.async_api import async_playwright

        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(headless=headless)

        state_path = self.cfg.path(self.cfg.session_file)
        ctx_kwargs: dict[str, Any] = {
            "user_agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "locale": "de-DE",
        }
        if state_path.exists() and not force:
            ctx_kwargs["storage_state"] = str(state_path)

        self._context = await self._browser.new_context(**ctx_kwargs)
        page = await self._context.new_page()

        await page.goto(f"{self.cfg.base_url}/en/my-bookings", wait_until="domcontentloaded")
        if await self._looks_logged_out(page):
            log.info("No valid session — logging in.")
            await self._perform_login(page)
            await self._context.storage_state(path=str(state_path))
            log.info("Login OK, session persisted -> %s", state_path)
        else:
            log.info("Reused existing session.")

        await page.close()
        return self._context

    async def _looks_logged_out(self, page) -> bool:
        url = page.url.lower()
        if any(k in url for k in ("login", "signin", "sign-in", "anmelden")):
            return True
        # presence of a password field is a strong "logged out" signal
        try:
            return await page.locator("input[type=password]").count() > 0
        except Exception:
            return False

    async def _perform_login(self, page) -> None:
        await page.goto(f"{self.cfg.base_url}/en/login", wait_until="domcontentloaded")
        # cookie banners get in the way of clicks
        for sel in (
            "button:has-text('Accept')",
            "button:has-text('Akzeptieren')",
            "#onetrust-accept-btn-handler",
        ):
            try:
                if await page.locator(sel).count():
                    await page.locator(sel).first.click(timeout=2000)
                    break
            except Exception:
                pass

        await page.fill("input[type=email], input[name=email]", self.cfg.email)
        await page.fill("input[type=password], input[name=password]", self.cfg.password)
        await page.click(
            "button[type=submit], button:has-text('Log in'), button:has-text('Anmelden')"
        )
        # Allow time for a possible 2FA / redirect. If 2FA is required and we are
        # headful, the user can complete it during this window.
        try:
            await page.wait_for_url(re.compile(r"(my-bookings|dashboard|home)"), timeout=60_000)
        except Exception:
            log.warning("Did not reach a logged-in URL within 60s; check credentials/2FA.")

    # -- endpoint discovery --------------------------------------------------

    async def discover_endpoints(self) -> DiscoveredEndpoints:
        """Visit the bookings/waitlist area and record JSON API calls."""
        self._captured.clear()
        page = await self._context.new_page()

        def _on_request(req) -> None:
            try:
                rt = req.resource_type
                if rt not in ("xhr", "fetch"):
                    return
                self._captured.append(
                    CapturedRequest(
                        method=req.method,
                        url=req.url,
                        headers=dict(req.headers),
                        post_data=req.post_data,
                        resource_type=rt,
                    )
                )
            except Exception:
                pass

        page.on("request", _on_request)

        for sub in ("/en/my-bookings", "/en/search", "/en/dashboard"):
            try:
                await page.goto(f"{self.cfg.base_url}{sub}", wait_until="networkidle")
                await page.wait_for_timeout(1500)
            except Exception as exc:  # noqa: BLE001
                log.debug("Discovery visit %s failed: %s", sub, exc)

        await page.close()
        return self._classify()

    def _classify(self) -> DiscoveredEndpoints:
        ep = DiscoveredEndpoints()
        for c in self._captured:
            entry = c.as_dict()
            # harvest auth headers from any API call
            for hk, hv in c.headers.items():
                if hk.lower() in ("authorization", "x-csrf-token", "x-xsrf-token"):
                    ep.auth_headers[hk] = hv
            u = c.url
            if c.method in ("POST", "PUT") and _BOOKING_HINTS.search(u):
                ep.booking.append(entry)
            if _AVAIL_HINTS.search(u) and c.method == "GET":
                ep.availability.append(entry)
            if _MYBOOKINGS_HINTS.search(u) and c.method == "GET":
                ep.my_bookings.append(entry)

        log.info(
            "Discovery: %d availability, %d booking, %d my-bookings candidates",
            len(ep.availability), len(ep.booking), len(ep.my_bookings),
        )
        return ep

    # -- cookies for the fast client ----------------------------------------

    async def export_cookies(self) -> dict[str, str]:
        cookies = await self._context.cookies()
        return {c["name"]: c["value"] for c in cookies}

    async def booking_fallback(self, class_url: str) -> bool:
        """Robust fallback: open the class page and click through the booking flow."""
        page = await self._context.new_page()
        booked = False
        try:
            await page.goto(class_url, wait_until="domcontentloaded")
            for sel in (
                "button:has-text('Book')",
                "button:has-text('Buchen')",
                "a:has-text('Book')",
                "a:has-text('Buchen')",
            ):
                loc = page.locator(sel)
                if await loc.count():
                    await loc.first.click(timeout=4000)
                    await page.wait_for_timeout(800)
            # confirm step (the second/third button in the flow)
            for sel in (
                "button:has-text('Confirm')",
                "button:has-text('Bestätigen')",
                "button:has-text('Book now')",
                "button:has-text('Jetzt buchen')",
            ):
                loc = page.locator(sel)
                if await loc.count():
                    await loc.first.click(timeout=4000)
                    booked = True
                    await page.wait_for_timeout(800)
        except Exception as exc:  # noqa: BLE001
            log.warning("Playwright fallback failed: %s", exc)
        finally:
            await page.close()
        return booked

    async def close(self) -> None:
        try:
            await self._context.close()
            await self._browser.close()
            await self._pw.stop()
        except Exception:
            pass
