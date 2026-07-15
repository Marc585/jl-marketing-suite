"""SQLite-Speicher für Konten, Consents und deduplizierte Transaktionen."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    uid           TEXT PRIMARY KEY,      -- Enable-Banking-UID oder 'csv:<IBAN>'
    iban          TEXT,
    name          TEXT,
    currency      TEXT,
    source        TEXT NOT NULL DEFAULT 'api'
);

CREATE TABLE IF NOT EXISTS consents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT,
    aspsp_name    TEXT,
    aspsp_country TEXT,
    valid_until   TEXT,
    created_at    TEXT,
    status        TEXT NOT NULL DEFAULT 'active'   -- active | expired | revoked
);

CREATE TABLE IF NOT EXISTS transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint      TEXT NOT NULL UNIQUE,
    account_uid      TEXT NOT NULL REFERENCES accounts(uid),
    booking_date     TEXT,               -- ISO YYYY-MM-DD
    value_date       TEXT,
    amount_cents     INTEGER NOT NULL,   -- negativ = Ausgabe
    currency         TEXT NOT NULL DEFAULT 'EUR',
    direction        TEXT NOT NULL,      -- in | out
    counterpart_name TEXT,
    counterpart_iban TEXT,
    remittance       TEXT,               -- Verwendungszweck
    status           TEXT,               -- BOOK | PDNG
    entry_reference  TEXT,
    source           TEXT NOT NULL,      -- api | csv
    raw_json         TEXT,
    imported_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_booking ON transactions(booking_date);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_uid, booking_date);

CREATE TABLE IF NOT EXISTS pending_auth (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    state         TEXT NOT NULL,
    aspsp_name    TEXT NOT NULL,
    aspsp_country TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def upsert_account(conn, uid: str, iban: str | None, name: str | None,
                   currency: str | None, source: str) -> None:
    conn.execute(
        """INSERT INTO accounts (uid, iban, name, currency, source)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(uid) DO UPDATE SET
             iban = COALESCE(excluded.iban, iban),
             name = COALESCE(excluded.name, name),
             currency = COALESCE(excluded.currency, currency)""",
        (uid, iban, name, currency, source),
    )


def save_consent(conn, session_id: str, aspsp_name: str, aspsp_country: str,
                 valid_until: str) -> None:
    conn.execute("UPDATE consents SET status = 'expired' WHERE status = 'active'")
    conn.execute(
        """INSERT INTO consents (session_id, aspsp_name, aspsp_country, valid_until, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (session_id, aspsp_name, aspsp_country, valid_until, now_iso()),
    )


def active_consent(conn):
    return conn.execute(
        "SELECT * FROM consents WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    ).fetchone()


def mark_consent_expired(conn, consent_id: int) -> None:
    conn.execute("UPDATE consents SET status = 'expired' WHERE id = ?", (consent_id,))


def set_pending_auth(conn, state: str, aspsp_name: str, aspsp_country: str) -> None:
    conn.execute(
        """INSERT INTO pending_auth (id, state, aspsp_name, aspsp_country, created_at)
           VALUES (1, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             state = excluded.state, aspsp_name = excluded.aspsp_name,
             aspsp_country = excluded.aspsp_country, created_at = excluded.created_at""",
        (state, aspsp_name, aspsp_country, now_iso()),
    )


def pop_pending_auth(conn):
    row = conn.execute("SELECT * FROM pending_auth WHERE id = 1").fetchone()
    conn.execute("DELETE FROM pending_auth WHERE id = 1")
    return row


def insert_transactions(conn, txs: list[dict]) -> tuple[int, int]:
    """Fügt normalisierte Transaktionen ein. Rückgabe: (neu, übersprungen)."""
    added = skipped = 0
    for tx in txs:
        try:
            conn.execute(
                """INSERT INTO transactions
                   (fingerprint, account_uid, booking_date, value_date, amount_cents,
                    currency, direction, counterpart_name, counterpart_iban,
                    remittance, status, entry_reference, source, raw_json, imported_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    tx["fingerprint"], tx["account_uid"], tx.get("booking_date"),
                    tx.get("value_date"), tx["amount_cents"], tx.get("currency", "EUR"),
                    tx["direction"], tx.get("counterpart_name"), tx.get("counterpart_iban"),
                    tx.get("remittance"), tx.get("status"), tx.get("entry_reference"),
                    tx["source"], json.dumps(tx.get("raw"), ensure_ascii=False) if tx.get("raw") else None,
                    now_iso(),
                ),
            )
            added += 1
        except sqlite3.IntegrityError:
            skipped += 1
    return added, skipped


def latest_booking_date(conn, account_uid: str) -> str | None:
    row = conn.execute(
        "SELECT MAX(booking_date) AS d FROM transactions WHERE account_uid = ?",
        (account_uid,),
    ).fetchone()
    return row["d"] if row and row["d"] else None


def set_meta(conn, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def get_meta(conn, key: str) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None
