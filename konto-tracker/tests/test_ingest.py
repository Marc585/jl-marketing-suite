import tempfile
import unittest
from pathlib import Path

from kontotracker import db
from kontotracker.normalize import (assign_fingerprints,
                                    normalize_api_transaction)

API_TX = {
    "entry_reference": "2026071412345",
    "transaction_amount": {"amount": "-54.30", "currency": "EUR"},
    "creditor": {"name": "REWE Markt GmbH"},
    "creditor_account": {"iban": "DE111111"},
    "credit_debit_indicator": "DBIT",
    "status": "BOOK",
    "booking_date": "2026-07-14",
    "value_date": "2026-07-14",
    "remittance_information": ["REWE SAGT DANKE"],
}

API_TX_IN = {
    "transaction_amount": {"amount": "120.00", "currency": "EUR"},
    "debtor": {"name": "Techniker Krankenkasse"},
    "debtor_account": {"iban": "DE222222"},
    "credit_debit_indicator": "CRDT",
    "status": "BOOK",
    "booking_date": "2026-07-13",
    "remittance_information": ["Erstattung Rechnung 4711"],
}


class TestNormalize(unittest.TestCase):
    def test_debit(self):
        tx = normalize_api_transaction("acc-1", API_TX)
        self.assertEqual(tx["amount_cents"], -5430)
        self.assertEqual(tx["direction"], "out")
        self.assertEqual(tx["counterpart_name"], "REWE Markt GmbH")
        self.assertEqual(tx["remittance"], "REWE SAGT DANKE")

    def test_credit(self):
        tx = normalize_api_transaction("acc-1", API_TX_IN)
        self.assertEqual(tx["amount_cents"], 12000)
        self.assertEqual(tx["direction"], "in")
        self.assertEqual(tx["counterpart_name"], "Techniker Krankenkasse")

    def test_dbit_indicator_flips_positive_amount(self):
        raw = dict(API_TX, transaction_amount={"amount": "54.30", "currency": "EUR"})
        tx = normalize_api_transaction("acc-1", raw)
        self.assertEqual(tx["amount_cents"], -5430)


class TestDedup(unittest.TestCase):
    def setUp(self):
        self.db_path = Path(tempfile.mkdtemp()) / "test.db"
        self.conn = db.connect(self.db_path)
        db.upsert_account(self.conn, "acc-1", "DE02", "Giro", "EUR", "api")

    def tearDown(self):
        self.conn.close()

    def _txs(self):
        return assign_fingerprints([
            normalize_api_transaction("acc-1", API_TX),
            normalize_api_transaction("acc-1", API_TX_IN),
        ])

    def test_reimport_is_skipped(self):
        added, skipped = db.insert_transactions(self.conn, self._txs())
        self.assertEqual((added, skipped), (2, 0))
        added, skipped = db.insert_transactions(self.conn, self._txs())
        self.assertEqual((added, skipped), (0, 2))
        n = self.conn.execute("SELECT COUNT(*) AS n FROM transactions").fetchone()["n"]
        self.assertEqual(n, 2)

    def test_identical_tx_in_same_batch_kept_apart(self):
        # Zwei inhaltsgleiche Buchungen ohne Referenz am selben Tag
        raw = dict(API_TX_IN)
        txs = assign_fingerprints([
            normalize_api_transaction("acc-1", raw),
            normalize_api_transaction("acc-1", dict(raw)),
        ])
        self.assertNotEqual(txs[0]["fingerprint"], txs[1]["fingerprint"])
        added, _ = db.insert_transactions(self.conn, txs)
        self.assertEqual(added, 2)

    def test_csv_and_api_same_tx_dedup(self):
        # Gleiche Buchung einmal via API, einmal via CSV → gleicher Fingerprint,
        # wenn Datum/Betrag/Name/Zweck/Referenz übereinstimmen
        api_tx = normalize_api_transaction("acc-1", API_TX)
        csv_tx = {
            "account_uid": "acc-1",
            "booking_date": "2026-07-14",
            "amount_cents": -5430,
            "currency": "EUR",
            "direction": "out",
            "counterpart_name": "REWE Markt GmbH",
            "counterpart_iban": "DE111111",
            "remittance": "REWE SAGT DANKE",
            "status": "BOOK",
            "entry_reference": "2026071412345",
            "source": "csv",
            "raw": None,
        }
        batch1 = assign_fingerprints([api_tx])
        batch2 = assign_fingerprints([csv_tx])
        self.assertEqual(batch1[0]["fingerprint"], batch2[0]["fingerprint"])
        db.insert_transactions(self.conn, batch1)
        added, skipped = db.insert_transactions(self.conn, batch2)
        self.assertEqual((added, skipped), (0, 1))


class TestLatestBookingDate(unittest.TestCase):
    def test_incremental_anchor(self):
        conn = db.connect(Path(tempfile.mkdtemp()) / "t.db")
        db.upsert_account(conn, "acc-1", None, None, None, "api")
        self.assertIsNone(db.latest_booking_date(conn, "acc-1"))
        db.insert_transactions(conn, assign_fingerprints(
            [normalize_api_transaction("acc-1", API_TX)]))
        self.assertEqual(db.latest_booking_date(conn, "acc-1"), "2026-07-14")
        conn.close()


if __name__ == "__main__":
    unittest.main()
