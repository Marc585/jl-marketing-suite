"""Kommandozeile des Konto-Trackers.

Ablauf beim ersten Einrichten:
    python -m kontotracker check        # Zugangsdaten testen
    python -m kontotracker banks        # Bankname bei Enable Banking finden
    python -m kontotracker connect      # Autorisierungs-URL erzeugen → im Browser öffnen
    python -m kontotracker authorize "<Redirect-URL nach dem Bank-Login>"
    python -m kontotracker fetch        # Transaktionen abrufen (danach regelmäßig per Cron)
"""

import argparse
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import db
from .config import Config
from .normalize import assign_fingerprints, normalize_api_transaction


def _client(cfg: Config):
    missing = cfg.require_api()
    if missing:
        print("Fehlende Konfiguration für den API-Zugang:")
        for m in missing:
            print(f"  - {m}")
        print("\nSiehe .env.example und README.md (Enable-Banking-Einrichtung).")
        sys.exit(2)
    from .enable_banking import EnableBankingClient
    return EnableBankingClient(cfg.application_id, cfg.private_key_path, cfg.api_origin)


def _fmt_eur(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}{cents // 100},{cents % 100:02d} €"


# -- Befehle -------------------------------------------------------------------


def cmd_check(cfg: Config, args) -> None:
    client = _client(cfg)
    app = client.application()
    print("✓ Zugangsdaten gültig.")
    print(f"  Application: {app.get('name', cfg.application_id)}")
    print(f"  Umgebung:    {app.get('environment', 'unbekannt')}")
    redirects = app.get("redirect_urls") or []
    if redirects:
        print(f"  Registrierte Redirect-URLs: {', '.join(redirects)}")
        if cfg.redirect_url not in redirects:
            print(f"  ⚠ EB_REDIRECT_URL ({cfg.redirect_url}) ist NICHT registriert!")


def cmd_banks(cfg: Config, args) -> None:
    client = _client(cfg)
    banks = client.aspsps(args.country)
    needle = (args.filter or "").lower()
    hits = [b for b in banks if needle in b.get("name", "").lower()]
    if not hits:
        print(f"Keine Bank mit '{args.filter}' in {args.country} gefunden.")
        return
    for b in hits:
        print(f"  {b['name']}  (Land: {b.get('country')}, "
              f"max. Consent: {b.get('maximum_consent_validity', '?')} s)")


def cmd_connect(cfg: Config, args) -> None:
    client = _client(cfg)
    banks = client.aspsps(args.country)
    needle = args.bank.lower()
    exact = [b for b in banks if b.get("name", "").lower() == needle]
    hits = exact or [b for b in banks if needle in b.get("name", "").lower()]
    if not hits:
        print(f"Bank '{args.bank}' nicht gefunden. Tipp: python -m kontotracker banks --filter {args.bank}")
        sys.exit(1)
    if len(hits) > 1:
        print("Mehrere Banken passen — bitte exakten Namen mit --bank angeben:")
        for b in hits:
            print(f"  --bank \"{b['name']}\"")
        sys.exit(1)

    bank = hits[0]
    max_validity = bank.get("maximum_consent_validity")
    days = cfg.consent_days
    if max_validity:
        days = min(days, max(1, int(max_validity) // 86400))
    valid_until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(timespec="seconds")

    state = str(uuid.uuid4())
    url = client.start_auth(bank["name"], bank.get("country", args.country),
                            cfg.redirect_url, state, valid_until)

    conn = db.connect(cfg.db_path)
    with conn:
        db.set_pending_auth(conn, state, bank["name"], bank.get("country", args.country))
    conn.close()

    print(f"Bank: {bank['name']} — Consent gültig bis {valid_until} ({days} Tage)\n")
    print("1. Öffne diese URL im Browser und autorisiere den Zugriff bei deiner Bank:\n")
    print(f"   {url}\n")
    print("2. Nach dem Login wirst du auf deine Redirect-URL weitergeleitet.")
    print("   Kopiere die KOMPLETTE Adresszeile und führe aus:\n")
    print('   python -m kontotracker authorize "<eingefügte-URL>"')


def cmd_authorize(cfg: Config, args) -> None:
    raw = args.code.strip()
    if raw.startswith("http"):
        query = parse_qs(urlparse(raw).query)
        code = (query.get("code") or [""])[0]
        returned_state = (query.get("state") or [""])[0]
    else:
        code, returned_state = raw, ""
    if not code:
        print("Kein 'code'-Parameter in der übergebenen URL gefunden.")
        sys.exit(1)

    conn = db.connect(cfg.db_path)
    pending = db.pop_pending_auth(conn)
    if pending and returned_state and pending["state"] != returned_state:
        print("⚠ 'state' stimmt nicht mit der gestarteten Autorisierung überein — Abbruch.")
        sys.exit(1)

    client = _client(cfg)
    session = client.create_session(code)

    aspsp = session.get("aspsp") or {}
    valid_until = (session.get("access") or {}).get("valid_until", "")
    with conn:
        db.save_consent(conn, session.get("session_id", ""),
                        aspsp.get("name", pending["aspsp_name"] if pending else ""),
                        aspsp.get("country", pending["aspsp_country"] if pending else ""),
                        valid_until)
        for acc in session.get("accounts", []):
            account_id = acc.get("account_id") or {}
            db.upsert_account(conn, acc["uid"], account_id.get("iban"),
                              acc.get("name") or acc.get("product"),
                              acc.get("currency"), "api")
    conn.close()

    print(f"✓ Verbunden mit {aspsp.get('name', '?')} — Consent gültig bis {valid_until}")
    print(f"  {len(session.get('accounts', []))} Konto/Konten verknüpft:")
    for acc in session.get("accounts", []):
        account_id = acc.get("account_id") or {}
        print(f"    {account_id.get('iban', acc['uid'])}  {acc.get('name') or ''}")
    print("\nJetzt Transaktionen abrufen:  python -m kontotracker fetch")


def cmd_accounts(cfg: Config, args) -> None:
    conn = db.connect(cfg.db_path)
    rows = conn.execute("SELECT * FROM accounts ORDER BY source, iban").fetchall()
    if not rows:
        print("Noch keine Konten. Erst 'connect' + 'authorize' ausführen (oder import-csv).")
        return
    for r in rows:
        count = conn.execute("SELECT COUNT(*) AS n FROM transactions WHERE account_uid = ?",
                             (r["uid"],)).fetchone()["n"]
        print(f"  [{r['source']}] {r['iban'] or r['uid']}  {r['name'] or ''}  ({count} Umsätze)")
    conn.close()


def cmd_fetch(cfg: Config, args) -> None:
    from .enable_banking import SessionExpiredError

    conn = db.connect(cfg.db_path)
    consent = db.active_consent(conn)
    if not consent:
        print("Kein aktiver Bank-Consent. Erst 'connect' + 'authorize' ausführen.")
        sys.exit(1)

    _warn_if_expiring(consent)

    accounts = conn.execute("SELECT * FROM accounts WHERE source = 'api'").fetchall()
    if not accounts:
        print("Keine API-Konten verknüpft.")
        sys.exit(1)

    client = _client(cfg)
    total_added = total_skipped = 0
    for acc in accounts:
        if args.date_from:
            date_from = args.date_from
        else:
            last = db.latest_booking_date(conn, acc["uid"])
            if last:
                # kleiner Überlapp, damit nachträglich gebuchte Umsätze nicht fehlen
                date_from = (date.fromisoformat(last) - timedelta(days=5)).isoformat()
            else:
                date_from = (date.today() - timedelta(days=cfg.first_fetch_days)).isoformat()

        label = acc["iban"] or acc["uid"]
        print(f"Hole Umsätze für {label} ab {date_from} …")
        try:
            raw_txs = client.transactions(acc["uid"], date_from=date_from)
        except SessionExpiredError:
            with conn:
                db.mark_consent_expired(conn, consent["id"])
            print("\n✗ Session/Consent abgelaufen — bitte neu autorisieren:")
            print("  python -m kontotracker connect")
            sys.exit(3)

        booked = [t for t in raw_txs if t.get("status") in (None, "BOOK")]
        txs = assign_fingerprints([normalize_api_transaction(acc["uid"], t) for t in booked])
        with conn:
            added, skipped = db.insert_transactions(conn, txs)
        total_added += added
        total_skipped += skipped
        print(f"  {len(raw_txs)} erhalten, {len(booked)} gebucht, "
              f"{added} neu gespeichert, {skipped} bereits vorhanden")

    with conn:
        db.set_meta(conn, "last_fetch", db.now_iso())
    conn.close()
    print(f"\n✓ Fertig: {total_added} neue Umsätze, {total_skipped} Duplikate übersprungen.")


def cmd_import_csv(cfg: Config, args) -> None:
    from .csv_import import parse_dkb_csv

    path = Path(args.file)
    if not path.is_file():
        print(f"Datei nicht gefunden: {path}")
        sys.exit(1)

    account_uid = f"csv:{args.iban}" if args.iban else "csv:unbekannt"
    txs = assign_fingerprints(parse_dkb_csv(path, account_uid))

    conn = db.connect(cfg.db_path)
    with conn:
        db.upsert_account(conn, account_uid, args.iban, "CSV-Import", "EUR", "csv")
        added, skipped = db.insert_transactions(conn, txs)
    conn.close()
    print(f"✓ {path.name}: {len(txs)} Buchungen gelesen, "
          f"{added} neu gespeichert, {skipped} bereits vorhanden.")


def cmd_list(cfg: Config, args) -> None:
    conn = db.connect(cfg.db_path)
    rows = conn.execute(
        """SELECT booking_date, amount_cents, counterpart_name, remittance
           FROM transactions ORDER BY booking_date DESC, id DESC LIMIT ?""",
        (args.limit,),
    ).fetchall()
    conn.close()
    if not rows:
        print("Noch keine Umsätze gespeichert.")
        return
    for r in rows:
        zweck = (r["remittance"] or "")[:60]
        print(f"  {r['booking_date']}  {_fmt_eur(r['amount_cents']):>14}  "
              f"{(r['counterpart_name'] or '?')[:35]:<35}  {zweck}")


def cmd_status(cfg: Config, args) -> None:
    conn = db.connect(cfg.db_path)
    consent = db.active_consent(conn)
    n = conn.execute("SELECT COUNT(*) AS n FROM transactions").fetchone()["n"]
    span = conn.execute(
        "SELECT MIN(booking_date) AS a, MAX(booking_date) AS b FROM transactions"
    ).fetchone()
    last_fetch = db.get_meta(conn, "last_fetch")
    conn.close()

    print(f"Datenbank:    {cfg.db_path}")
    print(f"Umsätze:      {n}" + (f"  ({span['a']} bis {span['b']})" if n else ""))
    print(f"Letzter Pull: {last_fetch or '—'}")
    if consent:
        print(f"Consent:      {consent['aspsp_name']} — gültig bis {consent['valid_until']}")
        _warn_if_expiring(consent)
    else:
        print("Consent:      keiner aktiv (connect + authorize ausführen)")


def _warn_if_expiring(consent) -> None:
    try:
        valid_until = datetime.fromisoformat(consent["valid_until"].replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return
    remaining = valid_until - datetime.now(timezone.utc)
    if remaining.days < 0:
        print("⚠ Der Bank-Consent ist ABGELAUFEN — bitte neu autorisieren (connect).")
    elif remaining.days <= 14:
        print(f"⚠ Der Bank-Consent läuft in {remaining.days} Tagen ab — "
              "bald neu autorisieren (connect).")


# -- Entry point ----------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="kontotracker",
        description="DKB-Umsätze automatisiert abrufen und lokal speichern.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="Enable-Banking-Zugangsdaten testen")

    p = sub.add_parser("banks", help="Banken bei Enable Banking suchen")
    p.add_argument("--country", default="DE")
    p.add_argument("--filter", default="DKB")

    p = sub.add_parser("connect", help="Bank-Autorisierung starten (URL ausgeben)")
    p.add_argument("--country", default="DE")
    p.add_argument("--bank", default="DKB")

    p = sub.add_parser("authorize", help="Autorisierung abschließen (Redirect-URL übergeben)")
    p.add_argument("code", help="Komplette Redirect-URL aus dem Browser (oder nur der Code)")

    sub.add_parser("accounts", help="Verknüpfte Konten anzeigen")

    p = sub.add_parser("fetch", help="Neue Transaktionen abrufen")
    p.add_argument("--from", dest="date_from", default=None,
                   help="Abruf ab Datum (YYYY-MM-DD), sonst automatisch inkrementell")

    p = sub.add_parser("import-csv", help="DKB-CSV-Export importieren (Fallback)")
    p.add_argument("file")
    p.add_argument("--iban", default=None, help="IBAN des Kontos (für die Zuordnung)")

    p = sub.add_parser("list", help="Letzte Umsätze anzeigen")
    p.add_argument("--limit", type=int, default=25)

    sub.add_parser("status", help="Consent-Gültigkeit und Datenbestand anzeigen")

    args = parser.parse_args(argv)
    cfg = Config.from_env(Path(__file__).resolve().parent.parent)

    commands = {
        "check": cmd_check,
        "banks": cmd_banks,
        "connect": cmd_connect,
        "authorize": cmd_authorize,
        "accounts": cmd_accounts,
        "fetch": cmd_fetch,
        "import-csv": cmd_import_csv,
        "list": cmd_list,
        "status": cmd_status,
    }
    commands[args.command](cfg, args)


if __name__ == "__main__":
    main()
