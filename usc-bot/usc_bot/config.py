"""Configuration loading and typed access."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class PollingCfg:
    idle_interval_seconds: float = 15.0
    hot_interval_seconds: float = 0.7
    hot_window_minutes: int = 180
    jitter_seconds: float = 0.3
    give_up_minutes_after_start: int = 5


@dataclass
class BookingCfg:
    enable_playwright_fallback: bool = True
    refresh_watchlist_minutes: int = 30


@dataclass
class TelegramCfg:
    enabled: bool = False
    bot_token: str = ""
    chat_id: str = ""


@dataclass
class WatchEntry:
    venue: str | None = None
    title: str | None = None
    weekday: str | None = None
    start_time: str | None = None


@dataclass
class Config:
    email: str
    password: str
    base_url: str = "https://urbansportsclub.com"
    polling: PollingCfg = field(default_factory=PollingCfg)
    booking: BookingCfg = field(default_factory=BookingCfg)
    telegram: TelegramCfg = field(default_factory=TelegramCfg)
    auto_watch_waitlisted: bool = True
    watchlist: list[WatchEntry] = field(default_factory=list)
    endpoints_file: str = "endpoints.json"
    session_file: str = "session_state.json"
    debug: bool = False
    # directory the config lives in, used to resolve relative paths
    base_dir: Path = field(default_factory=Path.cwd)

    def path(self, name: str) -> Path:
        p = Path(name)
        return p if p.is_absolute() else self.base_dir / p


def _env_override(value: str) -> str:
    """Allow values like ${USC_PASSWORD} to be pulled from the environment."""
    if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
        return os.environ.get(value[2:-1], "")
    return value


def load_config(path: str | os.PathLike[str]) -> Config:
    path = Path(path)
    with path.open("r", encoding="utf-8") as fh:
        raw: dict[str, Any] = yaml.safe_load(fh) or {}

    creds = raw.get("credentials", {})
    polling = PollingCfg(**(raw.get("polling") or {}))
    booking = BookingCfg(**(raw.get("booking") or {}))
    tele_raw = (raw.get("notifications") or {}).get("telegram") or {}
    telegram = TelegramCfg(**tele_raw)
    watch = [WatchEntry(**w) for w in (raw.get("watchlist") or [])]

    return Config(
        email=_env_override(creds.get("email", "")),
        password=_env_override(creds.get("password", "")),
        base_url=raw.get("base_url", "https://urbansportsclub.com").rstrip("/"),
        polling=polling,
        booking=booking,
        telegram=telegram,
        auto_watch_waitlisted=raw.get("auto_watch_waitlisted", True),
        watchlist=watch,
        endpoints_file=raw.get("endpoints_file", "endpoints.json"),
        session_file=raw.get("session_file", "session_state.json"),
        debug=raw.get("debug", False),
        base_dir=path.resolve().parent,
    )
