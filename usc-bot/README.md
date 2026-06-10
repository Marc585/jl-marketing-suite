# USC Waitlist Sniper

Automatically books **Urban Sports Club** classes the instant a spot opens on a
waitlist you are on. Built for unattended operation on a server (e.g. your
Hetzner box).

## How it works (and why it's fast)

Waitlist spots disappear in under a second, so the design avoids every avoidable
delay:

1. **Login + session (Playwright, slow path, run rarely).** Logs in with your
   credentials and saves the session to `session_state.json`. This mirrors the
   real website, so it keeps working across most site changes.
2. **Endpoint auto-discovery (run once).** While logged in, the bot records the
   JSON API calls the web app actually makes on your bookings/search pages and
   writes them to `endpoints.json`. This learns the real availability + booking
   URLs for *your* account — no manual DevTools digging.
3. **Hot loop (raw HTTP, the fast path).** A single HTTP/2 connection is kept
   warm (TLS handshake paid once). The bot polls the watched class's
   availability endpoint and fires a **pre-built booking request** the moment a
   spot is free — a single round-trip, typically well under a second.
4. **Playwright fallback.** If the raw booking call ever returns something
   unexpected, it falls back to clicking the real "Buchen" flow so a booking
   still goes through.
5. **Adaptive polling.** Slow polling when the class is far off, ramping to
   sub-second inside a configurable window before class start (where almost all
   cancellations happen). Keeps load/footprint low without sacrificing speed.

The watchlist is built automatically from the classes you are **waitlisted**
for; you can also pin specific classes in `config.yaml`.

## Setup (local first, to log in / discover)

```bash
cd usc-bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium

cp config.example.yaml config.yaml
# edit config.yaml: email, password, (optional) Telegram

# 1) log in once. Use --headful if your account has 2FA, so you can complete it.
python -m usc_bot.main login --headful

# 2) discover the API endpoints for your account (once; re-run if USC changes).
python -m usc_bot.main discover --headful
python -m usc_bot.main inspect      # sanity-check what was discovered
```

`inspect` should show non-empty `availability`, `booking`, and `my_bookings`
candidates. If a group is empty, see Troubleshooting.

## Run

```bash
python -m usc_bot.main run
```

Leave it running. When you join a waitlist in the USC app, the bot picks it up
on the next refresh (default every 30 min; tune `refresh_watchlist_minutes`) and
starts sniping. On success you get a Telegram message (if configured).

## Testing it safely

Test in layers, cheapest first — don't validate by sniping a real popular class.

**1. Parser logic (offline, no account needed).**
```bash
python -m tests.test_parsers
```
Confirms availability detection, watchlist building, id substitution and date
parsing work.

**2. Login + discovery (against the real site, read-only).**
```bash
python -m usc_bot.main login --headful
python -m usc_bot.main discover --headful
python -m usc_bot.main inspect
```
`inspect` should list non-empty `availability`, `booking` and `my_bookings`
candidates. This proves the bot can log in and found the right endpoints — it
books nothing.

**3. Dry run (full pipeline, never books).**
```bash
python -m usc_bot.main run --dry-run
```
The bot logs in, finds the classes you're waitlisted for, polls availability for
real, and when a spot opens it logs/notifies **"would book"** instead of sending
the booking request. Set `debug: true` in `config.yaml` to also see raw API
responses. Let this run against a class you're actually waitlisted for: if you
see it detect the open spot, the live path will book it.

**4. Live, low-stakes.** Waitlist a class that is *not* hyper-competitive, run
without `--dry-run`, and confirm a real booking + Telegram message. Only then
point it at the classes that vanish in a second.

## Deploy on Hetzner (systemd)

```bash
# on the server, as root
adduser --system --group usc
mkdir -p /opt/usc-bot && chown usc:usc /opt/usc-bot
# copy this folder to /opt/usc-bot, then:
sudo -u usc python3 -m venv /opt/usc-bot/.venv
sudo -u usc /opt/usc-bot/.venv/bin/pip install -r /opt/usc-bot/requirements.txt
sudo -u usc /opt/usc-bot/.venv/bin/python -m playwright install --with-deps chromium

# bring over config.yaml, session_state.json and endpoints.json you generated
# locally (so you don't need a browser/2FA on the headless server), then:
cp deploy/usc-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now usc-bot
journalctl -u usc-bot -f
```

Tip: generate `session_state.json` + `endpoints.json` on your Mac (where you can
solve 2FA in a real browser) and copy them to the server. The server then never
needs an interactive login until the session expires — at which point the bot
re-logs-in headlessly with your stored credentials.

## Configuration reference

See `config.example.yaml`. Key knobs:

- `polling.hot_interval_seconds` / `hot_window_minutes` — how fast and how long
  before class start to poll aggressively.
- `auto_watch_waitlisted` — auto-add every class you're waitlisted for.
- `booking.enable_playwright_fallback` — keep the click-through safety net.
- `notifications.telegram` — booking confirmations to your phone.

## Troubleshooting

- **Empty endpoint group after `discover`.** The relevant call wasn't triggered
  during discovery. Re-run `discover --headful`, and while the browser is open,
  navigate to *My Bookings* and open a class detail page so those XHRs fire.
  Then re-run `inspect`. Set `debug: true` to log raw responses.
- **Booking returns HTTP 4xx.** The booking payload template needs your
  account's exact body. Set `debug: true`, watch a real booking in `--headful`,
  and copy the captured `booking` entry from `endpoints.json`. The fallback
  click-flow keeps you covered in the meantime.
- **Session keeps expiring.** Normal; the bot re-authenticates automatically. If
  2FA blocks headless re-login, refresh `session_state.json` from your Mac.

## Important notes

- **Terms of Service.** Automated booking very likely violates USC's ToS; the
  realistic risk is account suspension, especially with aggressive polling. The
  defaults are deliberately moderate (jittered, ramped). Use at your own risk.
- Keep `config.yaml`, `session_state.json`, and `endpoints.json` private — they
  contain your credentials/session. They are git-ignored.
