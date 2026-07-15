"""Normalisierung von Transaktionen aus API und CSV in ein einheitliches Format.

Der Fingerprint dient der Deduplizierung und ist bewusst quellenunabhängig
(Inhalts-Hash), damit ein CSV-Import und ein API-Abruf derselben Buchung
möglichst nicht doppelt landen. Referenzen (entry_reference/Kundenreferenz)
fließen mit ein, wenn vorhanden — so bleiben zwei inhaltsgleiche echte Käufe
am selben Tag in der Regel unterscheidbar. Für identische Buchungen ohne
Referenz innerhalb eines Batches wird ein Laufindex angehängt.
"""

import hashlib
import re


def _norm_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip().lower()


def fingerprint(account_uid: str, booking_date: str | None, amount_cents: int,
                counterpart_name: str | None, remittance: str | None,
                reference: str | None, occurrence: int = 0) -> str:
    parts = [
        account_uid,
        booking_date or "",
        str(amount_cents),
        _norm_text(counterpart_name),
        _norm_text(remittance)[:80],
        _norm_text(reference),
        str(occurrence) if occurrence else "",
    ]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def assign_fingerprints(txs: list[dict]) -> list[dict]:
    """Berechnet Fingerprints und löst Duplikate innerhalb des Batches per Laufindex."""
    seen: dict[str, int] = {}
    for tx in txs:
        base = fingerprint(
            tx["account_uid"], tx.get("booking_date"), tx["amount_cents"],
            tx.get("counterpart_name"), tx.get("remittance"),
            tx.get("entry_reference"),
        )
        occ = seen.get(base, 0)
        seen[base] = occ + 1
        tx["fingerprint"] = base if occ == 0 else fingerprint(
            tx["account_uid"], tx.get("booking_date"), tx["amount_cents"],
            tx.get("counterpart_name"), tx.get("remittance"),
            tx.get("entry_reference"), occurrence=occ,
        )
    return txs


def normalize_api_transaction(account_uid: str, raw: dict) -> dict:
    """Enable-Banking-Transaktion → einheitliches Format."""
    amount_str = (raw.get("transaction_amount") or {}).get("amount", "0")
    currency = (raw.get("transaction_amount") or {}).get("currency", "EUR")
    cents = _amount_to_cents(amount_str)

    indicator = raw.get("credit_debit_indicator")  # CRDT = Eingang, DBIT = Ausgang
    if indicator == "DBIT" and cents > 0:
        cents = -cents
    direction = "in" if cents >= 0 else "out"

    if direction == "out":
        party = raw.get("creditor") or {}
        party_account = raw.get("creditor_account") or {}
    else:
        party = raw.get("debtor") or {}
        party_account = raw.get("debtor_account") or {}

    remittance = raw.get("remittance_information")
    if isinstance(remittance, list):
        remittance = " ".join(x for x in remittance if x)

    return {
        "account_uid": account_uid,
        "booking_date": raw.get("booking_date"),
        "value_date": raw.get("value_date"),
        "amount_cents": cents,
        "currency": currency,
        "direction": direction,
        "counterpart_name": party.get("name"),
        "counterpart_iban": party_account.get("iban"),
        "remittance": remittance,
        "status": raw.get("status"),
        "entry_reference": raw.get("entry_reference"),
        "source": "api",
        "raw": raw,
    }


def _amount_to_cents(value: str | float) -> int:
    """'12.34' oder 12.34 → 1234 (API liefert Dezimalpunkt-Strings)."""
    s = str(value).strip()
    negative = s.startswith("-")
    s = s.lstrip("+-")
    if "." in s:
        whole, _, frac = s.partition(".")
        frac = (frac + "00")[:2]
    else:
        whole, frac = s, "00"
    cents = int(whole or "0") * 100 + int(frac or "0")
    return -cents if negative else cents
