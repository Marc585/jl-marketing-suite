"""Import von DKB-CSV-Exporten (Fallback, wenn die API nicht verfügbar ist).

Unterstützt das neue Format (ab 2023, z. B. Spalten „Buchungsdatum",
„Zahlungsempfänger*in", „Betrag (€)") und das alte Format („Buchungstag",
„Auftraggeber / Begünstigter", „Betrag (EUR)"). Die Kopfzeile wird in der
Datei gesucht, davorstehende Metazeilen (Kontostand etc.) werden ignoriert.
"""

import csv
import io
import re
from datetime import datetime
from pathlib import Path

# Spaltenname (kleingeschrieben, ohne Sonderzeichen-Varianten) → Feldname
_COLUMN_MAP = {
    "buchungsdatum": "booking_date",
    "buchungstag": "booking_date",
    "wertstellung": "value_date",
    "status": "csv_status",
    "zahlungspflichtige*r": "payer",
    "zahlungspflichtiger": "payer",
    "auftraggeber / begünstigter": "counterpart_any",
    "auftraggeber / beguenstigter": "counterpart_any",
    "zahlungsempfänger*in": "payee",
    "zahlungsempfängerin": "payee",
    "zahlungsempfaenger*in": "payee",
    "verwendungszweck": "remittance",
    "umsatztyp": "tx_type",
    "buchungstext": "tx_type",
    "iban": "counterpart_iban",
    "kontonummer": "counterpart_iban",
    "betrag (€)": "amount",
    "betrag (eur)": "amount",
    "kundenreferenz": "reference",
    "mandatsreferenz": "mandate_reference",
}

_AMOUNT_COLUMNS = {"betrag (€)", "betrag (eur)"}


class CsvFormatError(ValueError):
    pass


def _read_text(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "cp1252", "iso-8859-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CsvFormatError(f"Encoding von {path} nicht erkannt")


def _parse_amount_cents(value: str) -> int:
    """'‑1.234,56' → -123456. Toleriert €-Zeichen und Leerzeichen."""
    s = value.replace("\xa0", "").replace(" ", "").replace("€", "").strip()
    if not s:
        raise CsvFormatError(f"Leerer Betrag: {value!r}")
    negative = s.startswith("-")
    s = s.lstrip("+-").replace(".", "")
    whole, _, frac = s.partition(",")
    cents = int(whole or "0") * 100 + int((frac + "00")[:2] or "0")
    return -cents if negative else cents


def _parse_date(value: str) -> str | None:
    """'15.07.26' / '15.07.2026' → '2026-07-15'."""
    s = value.strip().strip('"')
    if not s:
        return None
    for fmt in ("%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _find_header(lines: list[str]) -> tuple[int, str]:
    """Sucht die Kopfzeile; Rückgabe: (Zeilenindex, Delimiter)."""
    for i, line in enumerate(lines):
        low = line.lower()
        if ("buchungsdatum" in low or "buchungstag" in low) and "betrag" in low:
            delimiter = ";" if line.count(";") >= line.count(",") else ","
            return i, delimiter
    raise CsvFormatError("Keine DKB-Kopfzeile gefunden (Buchungsdatum/Buchungstag + Betrag)")


def parse_dkb_csv(path: Path, account_uid: str) -> list[dict]:
    """Liest einen DKB-Export und liefert normalisierte Transaktionen.

    Vorgemerkte Umsätze werden übersprungen (dedupliziert wird nur Gebuchtes).
    """
    text = _read_text(path)
    lines = text.splitlines()
    header_idx, delimiter = _find_header(lines)

    reader = csv.reader(io.StringIO("\n".join(lines[header_idx:])), delimiter=delimiter)
    rows = list(reader)
    header = [re.sub(r"\s+", " ", h).strip().lower() for h in rows[0]]

    fields = {}
    for idx, col in enumerate(header):
        if col in _COLUMN_MAP:
            fields[_COLUMN_MAP[col]] = idx
        elif col.startswith("betrag"):  # z. B. 'betrag (€)' mit kaputtem Encoding
            fields["amount"] = idx
    if "booking_date" not in fields or "amount" not in fields:
        raise CsvFormatError(f"Pflichtspalten fehlen, gefunden: {header}")

    def get(row: list[str], key: str) -> str:
        idx = fields.get(key)
        if idx is None or idx >= len(row):
            return ""
        return row[idx].strip()

    txs: list[dict] = []
    for row in rows[1:]:
        if not row or all(not c.strip() for c in row):
            continue
        booking = _parse_date(get(row, "booking_date"))
        if booking is None:
            continue  # Fußzeilen o. Ä.
        status = get(row, "csv_status").lower()
        if status and status != "gebucht":
            continue

        cents = _parse_amount_cents(get(row, "amount"))
        direction = "in" if cents >= 0 else "out"
        counterpart = (
            get(row, "counterpart_any")
            or (get(row, "payee") if direction == "out" else get(row, "payer"))
        )

        txs.append({
            "account_uid": account_uid,
            "booking_date": booking,
            "value_date": _parse_date(get(row, "value_date")),
            "amount_cents": cents,
            "currency": "EUR",
            "direction": direction,
            "counterpart_name": counterpart or None,
            "counterpart_iban": get(row, "counterpart_iban") or None,
            "remittance": get(row, "remittance") or None,
            "status": "BOOK",
            "entry_reference": get(row, "reference") or None,
            "source": "csv",
            "raw": None,
        })
    return txs
