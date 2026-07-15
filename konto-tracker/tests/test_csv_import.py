import tempfile
import unittest
from pathlib import Path

from kontotracker.csv_import import parse_dkb_csv, _parse_amount_cents, _parse_date

NEW_FORMAT = '''"Girokonto";"DE02120300000000202051"
""
"Kontostand vom 14.07.2026:";"1.234,56 EUR"
""
"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"
"14.07.26";"14.07.26";"Gebucht";"Max Mustermann";"REWE Markt GmbH";"REWE SAGT DANKE";"Ausgang";"DE111111";"-54,30";"";"";"REF-1"
"13.07.26";"13.07.26";"Gebucht";"Techniker Krankenkasse";"Max Mustermann";"Erstattung Rechnung 4711";"Eingang";"DE222222";"120,00";"";"";"REF-2"
"15.07.26";"15.07.26";"Vorgemerkt";"Max Mustermann";"AMAZON";"Bestellung";"Ausgang";"";"-19,99";"";"";""
'''

OLD_FORMAT = '''"Kontonummer:";"DE02120300000000202051 / Girokonto";
"Zeitraum:";"01.06.2026 - 30.06.2026";
"Buchungstag";"Wertstellung";"Buchungstext";"Auftraggeber / Begünstigter";"Verwendungszweck";"Kontonummer";"BLZ";"Betrag (EUR)";
"30.06.2026";"30.06.2026";"Lastschrift";"STADTWERKE";"Abschlag Strom";"DE333333";"12030000";"-89,00";
'''


def _write(content: str) -> Path:
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                    encoding="utf-8")
    f.write(content)
    f.close()
    return Path(f.name)


class TestHelpers(unittest.TestCase):
    def test_amount_parsing(self):
        self.assertEqual(_parse_amount_cents("-1.234,56"), -123456)
        self.assertEqual(_parse_amount_cents("120,00"), 12000)
        self.assertEqual(_parse_amount_cents("-54,3"), -5430)
        self.assertEqual(_parse_amount_cents("7"), 700)

    def test_date_parsing(self):
        self.assertEqual(_parse_date("14.07.26"), "2026-07-14")
        self.assertEqual(_parse_date("30.06.2026"), "2026-06-30")
        self.assertIsNone(_parse_date("Kontostand"))


class TestNewFormat(unittest.TestCase):
    def test_parse(self):
        txs = parse_dkb_csv(_write(NEW_FORMAT), "csv:DE02")
        # Vorgemerkte Buchung wird übersprungen
        self.assertEqual(len(txs), 2)

        out = txs[0]
        self.assertEqual(out["booking_date"], "2026-07-14")
        self.assertEqual(out["amount_cents"], -5430)
        self.assertEqual(out["direction"], "out")
        self.assertEqual(out["counterpart_name"], "REWE Markt GmbH")
        self.assertEqual(out["entry_reference"], "REF-1")

        incoming = txs[1]
        self.assertEqual(incoming["direction"], "in")
        self.assertEqual(incoming["counterpart_name"], "Techniker Krankenkasse")
        self.assertEqual(incoming["amount_cents"], 12000)


class TestOldFormat(unittest.TestCase):
    def test_parse(self):
        txs = parse_dkb_csv(_write(OLD_FORMAT), "csv:DE02")
        self.assertEqual(len(txs), 1)
        self.assertEqual(txs[0]["booking_date"], "2026-06-30")
        self.assertEqual(txs[0]["amount_cents"], -8900)
        self.assertEqual(txs[0]["counterpart_name"], "STADTWERKE")


class TestLatin1(unittest.TestCase):
    def test_latin1_encoding(self):
        f = tempfile.NamedTemporaryFile(mode="wb", suffix=".csv", delete=False)
        f.write(NEW_FORMAT.replace("Zahlungsempfänger*in", "Zahlungsempfänger*in")
                .encode("iso-8859-1", errors="replace"))
        f.close()
        txs = parse_dkb_csv(Path(f.name), "csv:DE02")
        self.assertEqual(len(txs), 2)


if __name__ == "__main__":
    unittest.main()
