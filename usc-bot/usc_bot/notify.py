"""Lightweight notifications (Telegram)."""
from __future__ import annotations

import logging

import httpx

from .config import TelegramCfg

log = logging.getLogger("usc.notify")


class Notifier:
    def __init__(self, tele: TelegramCfg) -> None:
        self.tele = tele

    async def send(self, text: str) -> None:
        log.info("NOTIFY: %s", text)
        if not (self.tele.enabled and self.tele.bot_token and self.tele.chat_id):
            return
        url = f"https://api.telegram.org/bot{self.tele.bot_token}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    url,
                    json={"chat_id": self.tele.chat_id, "text": text, "parse_mode": "HTML"},
                )
        except Exception as exc:  # noqa: BLE001
            log.warning("Telegram send failed: %s", exc)
