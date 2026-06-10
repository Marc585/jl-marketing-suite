"""CLI entrypoint.

Subcommands:
  login      Log in once (use --headful to complete 2FA interactively) and
             persist the session.
  discover   Log in, record the API calls the web app makes, and write
             endpoints.json. Run this once (and re-run if USC changes things).
  run        Start the watchlist sniper loop (the daemon you run on Hetzner).
  inspect    Print the discovered endpoints + current account watchlist.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from .booker import Booker
from .config import load_config
from .notify import Notifier
from .session import DiscoveredEndpoints, SessionManager


def _setup_logging(debug: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


async def cmd_login(cfg, headful: bool) -> None:
    sm = SessionManager(cfg)
    await sm.ensure_logged_in(headless=not headful, force=True)
    await sm.close()
    print("Login complete; session saved to", cfg.path(cfg.session_file))


async def cmd_discover(cfg, headful: bool) -> None:
    sm = SessionManager(cfg)
    await sm.ensure_logged_in(headless=not headful)
    ep = await sm.discover_endpoints()
    ep.save(cfg.path(cfg.endpoints_file))
    await sm.close()
    print("Discovery complete.")
    print(f"  availability candidates: {len(ep.availability)}")
    print(f"  booking candidates:      {len(ep.booking)}")
    print(f"  my-bookings candidates:  {len(ep.my_bookings)}")
    if not (ep.availability and ep.booking and ep.my_bookings):
        print("\n⚠️  Some endpoint groups are empty. Open endpoints.json and the "
              "logs, then trigger the relevant action once in --headful mode so "
              "the call gets recorded. See README troubleshooting.")


async def cmd_inspect(cfg) -> None:
    ep_path = cfg.path(cfg.endpoints_file)
    if not ep_path.exists():
        print("No endpoints.json yet — run `discover` first.")
        return
    ep = DiscoveredEndpoints.load(ep_path)
    print("== Discovered endpoints ==")
    for group in ("availability", "booking", "my_bookings"):
        items = getattr(ep, group)
        print(f"\n[{group}] ({len(items)})")
        for it in items[:5]:
            print(f"  {it['method']:4} {it['url']}")
    print("\n[auth_headers]", list(ep.auth_headers.keys()))


async def cmd_run(cfg) -> None:
    ep_path = cfg.path(cfg.endpoints_file)
    if not ep_path.exists():
        print("No endpoints.json — run `discover` first.", file=sys.stderr)
        sys.exit(1)
    ep = DiscoveredEndpoints.load(ep_path)
    sm = SessionManager(cfg)
    await sm.ensure_logged_in(headless=True)
    notifier = Notifier(cfg.telegram)
    booker = Booker(cfg, sm, ep, notifier)
    await notifier.send("🚀 USC waitlist sniper started.")
    try:
        await booker.start()
    finally:
        await sm.close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="usc-bot", description=__doc__)
    parser.add_argument("-c", "--config", default="config.yaml")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_login = sub.add_parser("login", help="log in and persist session")
    p_login.add_argument("--headful", action="store_true",
                         help="show the browser (needed for 2FA)")
    p_disc = sub.add_parser("discover", help="record API endpoints")
    p_disc.add_argument("--headful", action="store_true")
    sub.add_parser("inspect", help="print discovered endpoints")
    p_run = sub.add_parser("run", help="start the sniper daemon")
    p_run.add_argument("--dry-run", action="store_true",
                       help="watch + detect open spots but never actually book")

    args = parser.parse_args(argv)
    cfg_path = Path(args.config)
    if not cfg_path.exists():
        print(f"Config not found: {cfg_path}. Copy config.example.yaml -> config.yaml",
              file=sys.stderr)
        sys.exit(1)
    cfg = load_config(cfg_path)
    _setup_logging(cfg.debug)

    if args.cmd == "login":
        asyncio.run(cmd_login(cfg, args.headful))
    elif args.cmd == "discover":
        asyncio.run(cmd_discover(cfg, args.headful))
    elif args.cmd == "inspect":
        asyncio.run(cmd_inspect(cfg))
    elif args.cmd == "run":
        if getattr(args, "dry_run", False):
            cfg.dry_run = True
        asyncio.run(cmd_run(cfg))


if __name__ == "__main__":
    main()
