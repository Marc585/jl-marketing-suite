# Konto‑Tracker – Ausführlicher Projektplan

> Eigenständiges Projekt. Ziel: automatisch DKB‑Umsätze auslesen, offene
> Krankenkassen‑Erstattungen im Blick behalten und bei zu vielen „unnötigen"
> Ausgaben eine Bremse einbauen.
>
> Stand: 15.07.2026. Dieses Dokument ist der Bauplan – noch kein Code.

---

## 1. Ziel & Kernfunktionen

Drei Funktionen, in dieser Reihenfolge an Wert:

| # | Funktion | Kurzbeschreibung |
|---|----------|------------------|
| **F1** | **Krankenkassen‑Erstattungs‑Tracker** | Erkennt Gesundheitsausgaben, hält fest was bei der Kasse eingereicht wurde, matcht eingehende Erstattungen → Liste „diese Rechnungen sind noch offen". |
| **F2** | **Regelmäßige Ausgaben‑Auswertung** | Kategorisiert Umsätze, zeigt wöchentlich/monatlich wohin das Geld fließt, Trend vs. Durchschnitt. |
| **F3** | **Alarm bei unnötigen Ausgaben** | „Einbremsen": Push/E‑Mail wenn diskretionäre Ausgaben (Wants) über Budget oder auffällig gehäuft sind. |

Grundprinzip: **Ein Datenfluss** (Umsätze holen → speichern → kategorisieren)
speist alle drei Funktionen. Nichts wird doppelt gebaut.

---

## 2. Der wichtigste Baustein: Wie kommt man an die DKB‑Umsätze?

Das ist die Kernentscheidung des Projekts. Es gibt drei Wege – hier ehrlich mit
Vor‑/Nachteilen, weil sich die Lage 2024–2026 stark verändert hat.

### Weg A – PSD2 / Open‑Banking‑Aggregator  ⭐ **Empfehlung**

Banken müssen seit PSD2 eine standardisierte Schnittstelle (XS2A) anbieten. Man
spricht sie nicht direkt an (dafür bräuchte man eine BaFin‑Lizenz + eIDAS‑
Zertifikate), sondern über einen lizenzierten Aggregator, der eine einfache
REST‑API bereitstellt.

- **Enable Banking** – hat einen kostenlosen „Restricted Production"-Tarif,
  begrenzt auf Konten, die **du selbst** verbindest. Genau das, was man für ein
  privates Tool braucht. Gilt aktuell als der self‑serve/indie‑freundliche
  Nachfolger des früheren Nordigen‑Gratis‑Tiers. DKB ist als deutsche Bank über
  PSD2 abgedeckt.
- **finAPI** (BaFin‑lizenziert): 30‑Tage‑Gratis‑Test, danach kostenpflichtig.
- **Tink / TrueLayer / Salt Edge / Plaid**: breite Abdeckung inkl. DKB, aber
  Produktivzugang ist enterprise‑gated (Vertrag/KYB), für ein Privatprojekt zu
  schwer.
- **GoCardless Bank Account Data (früher Nordigen)**: war der Klassiker für
  kostenlose Umsatzabfragen – **nimmt aber keine neuen Gratis‑Anmeldungen mehr
  an** und wird für Neukunden abgewickelt. Für ein neues Projekt kein Weg mehr.

**Wichtig – PSD2‑Realität, die den Automatik‑Wunsch betrifft:**
- Ein erteiltes Einverständnis (Consent) ist **max. 90 Tage** gültig, dann ist
  eine erneute starke Kundenauthentifizierung (SCA, also Login + TAN) in der
  Bank‑App/im Browser nötig. Ein Tool kann also **nicht ewig ohne dein Zutun**
  Umsätze ziehen – alle ~90 Tage musst du kurz neu bestätigen. Das Tool erinnert
  dich rechtzeitig.
- Man bekommt i. d. R. **bis zu 24 Monate** Umsatzhistorie beim ersten Abruf und
  danach laufend die neuen Buchungen.

### Weg B – FinTS/HBCI direkt (`python-fints`)  – Fallback, aktuell fragil

FinTS ist der alte deutsche Online‑Banking‑Standard, den viele Banken noch
anbieten. Vorteil: keine Drittfirma, du sprichst mit deiner PIN direkt mit der
Bank. Nachteile speziell bei der DKB (Stand 2025/26):

- Jedes FinTS‑Programm braucht eine **Produkt‑ID** (Registrierung per Formular
  bei der Deutschen Kreditwirtschaft, Bearbeitung bis ~2 Wochen).
- Die DKB hat **TAN2Go abgeschaltet** (Nov 2024); es bleiben pushTAN/chipTAN,
  und `python-fints` hat mit der DKB **wiederholt Kompatibilitätsprobleme**
  (mehrere offene Issues). Für die DKB gilt FinTS damit als wackelig.

→ FinTS bleibt der Plan‑B, wenn Weg A wider Erwarten nicht klappt; für die DKB
starten wir nicht damit.

### Weg C – Manueller Import (immer als Notnagel)

DKB erlaubt CSV‑Export der Umsätze. Ein Import‑Skript (CSV → Datenbank)
kostet fast nichts und ist der 100 % zuverlässige Fallback, wenn eine
Schnittstelle mal streikt. **Sollte von Anfang an mitgebaut werden.**

### Empfehlung

**Weg A mit Enable Banking**, plus **CSV‑Import (Weg C)** als eingebauter
Notnagel. FinTS nur, falls du bewusst keine Drittfirma willst.

---

## 3. Architektur‑Überblick

```
                ┌──────────────────────────────────────────────┐
                │                 Konto-Tracker                 │
                │                                               │
  DKB ──PSD2──► │  1. Ingestion   ─►  2. Storage (SQLite)       │
  (Enable        │     (Umsätze holen)     (verschlüsselt)      │
   Banking)     │           │                    │             │
                │           ▼                    ▼             │
  CSV ────────► │  3. Kategorisierung ──►  4a. KK-Matcher       │
  (Fallback)    │     (Regeln + optional        4b. Analyse     │
                │      Claude für Zweifel)      4c. Alert-Engine │
                │                                    │          │
                │                                    ▼          │
                │  5. Notifier: E-Mail · Push (ntfy/Telegram)   │
                │  6. Scheduler: täglich Pull, wöchentl. Report │
                └──────────────────────────────────────────────┘
```

**Komponenten:**

1. **Ingestion** – holt neue Umsätze (Enable Banking API oder CSV‑Import),
   dedupliziert gegen bereits Gespeichertes.
2. **Storage** – lokale SQLite‑Datenbank, verschlüsselt/geschützt (siehe §4).
3. **Kategorisierung** – ordnet jeden Umsatz einer Kategorie zu und markiert
   „Need" vs. „Want" (siehe §7).
4. **Auswertungs‑Module** – KK‑Matcher (F1), Analyse (F2), Alert‑Engine (F3).
5. **Notifier** – schickt Reports & Alarme.
6. **Scheduler** – Cron/Timer, der das Ganze regelmäßig anstößt.

---

## 4. Wo läuft das? Hosting & Sicherheit  ⚠️ kritischer Teil

Es geht um **Kontobewegungen und Zugangs‑Tokens** – die sensibelste
Datenkategorie. Deshalb zuerst die Regeln, dann die Optionen.

**Eiserne Regeln:**
- **Niemals** Umsätze, Tokens oder Zugangsdaten in ein Git‑Repo committen.
  `.gitignore` für DB‑Datei, `.env`, Token‑Cache. (Nur Code & dieser Plan gehen
  ins Repo.)
- Secrets (API‑Keys, Consent‑Tokens) über Umgebungsvariablen bzw. einen
  Secrets‑Manager, nicht im Code.
- SQLite‑Datei **verschlüsselt** (SQLCipher) oder auf verschlüsseltem Volume.
- Es sind **deine eigenen** Konto‑Daten – DSGVO‑seitig unkritisch, solange sie
  bei dir bleiben und nirgends weitergegeben werden.

**Hosting‑Optionen:**

| Option | Für/​Wider |
|--------|-----------|
| **Lokal: Raspberry Pi / Heimserver / eigener Rechner** ⭐ | Daten verlassen nie dein Zuhause. Beste Datenschutz‑Option. Braucht ein Gerät, das läuft (Pi reicht). |
| **Kleiner VPS (~4 €/Monat)** | Läuft 24/7 unabhängig, du verwaltest die Sicherheit selbst. Solide Mitte. |
| **Cloud Function (Azure/AWS)** | Passt zu Serverless‑Erfahrung, aber Finanzdaten in der Cloud = mehr Sorgfalt bei Secrets/Verschlüsselung. |

**GitHub Actions als Scheduler?** Für das Marketing‑Repo nutzt du das – hier
**bewusst nicht**, weil dabei Umsätze/Tokens durch fremde Infrastruktur liefen.
Für ein Finanz‑Tool: lokal oder eigener Server.

**Empfehlung:** Raspberry Pi / Heimserver, wenn vorhanden – sonst ein kleiner
privater VPS.

---

## 5. Datenmodell (SQLite)

```
transactions        Alle Umsätze (dedupliziert)
  id, buchungsdatum, betrag, waehrung, gegenseite (Name),
  verwendungszweck, iban_gegenseite, richtung (in/out),
  kategorie_id, is_discretionary (Want-Flag), quelle (api/csv), raw_json

categories          Kategorie-Stammdaten
  id, name, typ (need/want/health/income/transfer)

merchant_rules      Regeln für Auto-Kategorisierung
  id, muster (Regex/Keyword), feld (name/zweck), kategorie_id, is_discretionary

reimbursement_claims  Krankenkassen-Vorgänge (F1)
  id, transaction_id (die Gesundheitsausgabe), betrag_erwartet,
  eingereicht_am, status (offen/eingereicht/erstattet),
  erstattung_transaction_id (die eingehende Zahlung), notiz

budgets             Monatsbudgets pro Kategorie (F3)
  id, kategorie_id, monatslimit

alerts              Ausgelöste Alarme (Historie / Doppel-Vermeidung)
  id, typ, ausgeloest_am, betrag, kategorie_id, nachricht

consents            PSD2-Einverständnisse (Ablauf-Tracking)
  id, provider, gueltig_bis, konto_id, status
```

---

## 6. Feature 1 im Detail – Krankenkassen‑Erstattungs‑Tracker

**Die Kernschwierigkeit:** Die Bankdaten allein wissen **nicht**, welche
Rechnung du bei der Kasse eingereicht hast. Deshalb braucht es einen kleinen
„Merker"-Schritt. Ablauf:

1. **Kandidaten erkennen (automatisch):** Ausgaben an Gesundheits‑Empfänger
   (Apotheke, Arzt/Ärztin, Zahnarzt, Physio, Heilpraktiker, Optiker, Klinik …)
   werden über `merchant_rules` markiert und als potenzielle Erstattungs‑
   Kandidaten gelistet.
2. **Einreichung festhalten:** Du markierst „bei Kasse eingereicht am TT.MM." –
   per einfachem CLI‑Befehl, kleinem Web‑Formular oder (Ausbaustufe) automatisch
   durch Auslesen von Bestätigungs‑E‑Mails der Kasse.
3. **Erstattung erkennen (automatisch):** Eingehende Zahlungen werden gegen die
   Absender deiner Kasse gematcht (Name/IBAN, z. B. *TK, Barmer, DAK, AOK,
   Debeka, Allianz PKV* …). Passt Betrag ± Toleranz in ein plausibles Zeitfenster
   nach der Einreichung → Vorgang wird als **erstattet** verbucht und mit der
   Eingangszahlung verknüpft.
4. **Report:** „**N Rechnungen offen, Summe X €** – älteste seit Y Tagen
   eingereicht." Optional Reminder, wenn eine Erstattung > 4 Wochen aussteht
   (dann bei der Kasse nachhaken).

**Gesetzlich vs. privat:** Bei **PKV** reicht man praktisch jede Rechnung ein →
viel Matching‑Bedarf, hoher Nutzen. Bei **GKV** eher Einzelfälle (IGeL, Zuzahlungen,
Auslandsbehandlung). Das Modell funktioniert für beide; Regeln werden entsprechend
zugeschnitten.

---

## 7. Feature 2 im Detail – Ausgaben‑Auswertung & Kategorisierung

**Kategorisierung in zwei Stufen:**
1. **Regelbasiert (schnell, kostenlos):** `merchant_rules` matchen Empfänger/
   Verwendungszweck auf Kategorien (Miete, Lebensmittel, Restaurant, Abo,
   Shopping, Gesundheit, …). Deckt nach kurzer Einlernzeit die meisten Umsätze ab.
2. **Optional Claude‑API für Zweifelsfälle:** Was die Regeln nicht sicher
   zuordnen, geht an Claude („kategorisiere diese Buchung, Need oder Want")
   – nur die unklaren Fälle, also wenige Cent Kosten pro Monat. Ergebnisse werden
   als neue Regel gelernt, damit dieselbe Buchung künftig ohne API klappt.

**Need vs. Want:** Jede Kategorie/Buchung bekommt ein `is_discretionary`‑Flag.
Das ist die Grundlage für F3 – „unnötig" = diskretionäre Ausgaben (Wants).

**Reports:**
- **Wöchentlich:** kurze Übersicht – Ausgaben gesamt, Top‑Kategorien, Wants‑Summe.
- **Monatlich:** ausführlich – pro Kategorie mit Vergleich zum 3‑Monats‑Schnitt,
  auffällige Steigerungen, größte Einzelposten.

---

## 8. Feature 3 im Detail – Alarm bei unnötigen Ausgaben

Ziel: **„eingebremst werden"** – nicht Buchhaltung, sondern rechtzeitiger Stups.

**Auslöser (konfigurierbar):**
- **Budget‑Überschreitung:** Wants‑Ausgaben einer Kategorie über Monatslimit.
- **Häufung / Velocity:** ungewöhnlich viele Want‑Käufe in kurzer Zeit
  (z. B. > X Shopping‑Buchungen in 7 Tagen) – fängt genau die Impuls‑Phasen.
- **Große Einzelausgabe:** diskretionäre Einzelbuchung über Schwelle Y €.
- **Monats‑Gesamt‑Wants:** Gesamtsumme aller Wants nähert sich dem Monatsbudget
  (Vorwarnung bei 80 %, Alarm bei 100 %).

**Form des Alarms:** kurze, konkrete Nachricht per **Push** (sofort wirksam):
> „⚠️ Diese Woche schon 240 € für *Shopping* (Budget 150 €). 3 Impulskäufe in
> 4 Tagen. Kurz innehalten?"

Optional ein von **Claude** formulierter kleiner „Reality‑Check"-Satz, damit es
sich nach persönlichem Coaching statt nach Kontostandswarnung anfühlt.
Doppel‑Alarme werden über die `alerts`‑Tabelle vermieden.

---

## 9. Automatisierung / Scheduling

- **Täglich:** neue Umsätze holen, kategorisieren, F3‑Auslöser prüfen → bei
  Bedarf Sofort‑Push.
- **Wöchentlich (z. B. So abends):** Wochenreport + offene KK‑Erstattungen.
- **Monatlich:** ausführlicher Report + Budget‑Auswertung.
- **~Alle 85 Tage:** Erinnerung „PSD2‑Consent läuft ab, bitte in der Bank neu
  bestätigen" (aus `consents.gueltig_bis`).

Umsetzung lokal per **cron** / **systemd‑Timer** (nicht GitHub Actions, siehe §4).

---

## 10. Benachrichtigungswege

| Kanal | Wofür | Aufwand |
|-------|-------|---------|
| **Push via ntfy / Telegram‑Bot / Pushover** ⭐ | Sofort‑Alarme (F3) – landet aufs Handy | gering |
| **E‑Mail (SMTP/Gmail)** | Wochen-/Monatsreports, KK‑Übersicht | gering |
| **Web‑Dashboard** (später) | Interaktive Übersicht, Rechnungen als „eingereicht" markieren | mittel |

Empfehlung: **ntfy oder Telegram** für Alarme (kostenlos, sofort) + **E‑Mail**
für Reports. Dashboard als spätere Ausbaustufe.

---

## 11. Tech‑Stack‑Empfehlung

- **Sprache:** Python (Umsätze holen/verarbeiten – passt zu deiner Erfahrung).
- **Datenhaltung:** SQLite (+ SQLCipher für Verschlüsselung).
- **Bankzugang:** Enable Banking API (PSD2) + CSV‑Import‑Fallback;
  optional `python-fints` als Plan‑B.
- **Kategorisierung:** eigene Regel‑Engine + optional Claude API (Modell
  `claude-haiku-4-5` reicht und ist günstig für Klassifikation).
- **Alarme:** ntfy oder Telegram‑Bot; Reports per SMTP.
- **Scheduler:** cron / systemd‑Timer.
- **Dashboard (optional, später):** FastAPI/Flask + kleine Seite, oder statisch.

---

## 12. Umsetzungs‑Roadmap (in Phasen, jede für sich nutzbar)

**Phase 0 – Zugang beweisen (Proof of Concept)**
Enable‑Banking‑Konto anlegen, DKB verbinden, einmal echte Umsätze abrufen und
roh ausgeben. Klärt das Risiko #1 (kommen wir überhaupt an die Daten?) bevor
wir mehr bauen. Parallel CSV‑Import als Sicherheitsnetz.

**Phase 1 – MVP: Auswertung**
Umsätze speichern + Deduplizierung + regelbasierte Kategorisierung +
Wochenreport per E‑Mail. → Du siehst sofort, wohin dein Geld fließt (F2).

**Phase 2 – Krankenkassen‑Tracker (F1)**
Gesundheitskandidaten erkennen, Einreichung markieren (CLI), Erstattungen
matchen, „offen"-Report.

**Phase 3 – Alarm‑Engine (F3)**
Budgets, Impuls‑/Velocity‑Erkennung, Sofort‑Push via ntfy/Telegram.

**Phase 4 – Feinschliff**
Optional: Claude‑Kategorisierung/Coaching, Web‑Dashboard, E‑Mail‑Parsing der
Kassen‑Bestätigungen, Verschlüsselung härten.

---

## 13. Kosten (grob, monatlich)

| Posten | Kosten |
|--------|--------|
| Enable Banking (Restricted Production, self‑linked) | 0 € |
| Claude API (optional, nur Zweifelsfälle) | wenige Cent |
| Push (ntfy/Telegram) | 0 € |
| Hosting lokal (Pi/Heimserver) | 0 € (Strom) |
| Hosting VPS (Alternative) | ~4 € |

**Realistisch: 0–5 € / Monat.** Der Hauptaufwand ist Bauzeit, nicht Betrieb.

---

## 14. Rechtliches & Datenschutz (kurz)

- Zugriff auf **dein eigenes** Konto ist zulässig.
- PSD2‑Aggregatoren sind lizenziert; der Zugriff läuft über die offizielle,
  von der Bank vorgesehene Schnittstelle mit deiner ausdrücklichen Zustimmung.
- Alle Daten bleiben bei dir; keine Weitergabe an Dritte.
- Wenn Claude zur Kategorisierung genutzt wird: nur die nötigen Felder
  (Empfänger/Zweck/Betrag) senden, keine Kontonummern.

---

## 15. Offene Entscheidungen – das brauche ich von dir

1. **Wo soll es laufen?** Raspberry Pi/Heimserver, VPS, oder Cloud?
2. **Zugangsweg ok?** Enable Banking (empfohlen) – oder willst du bewusst keine
   Drittfirma und lieber den FinTS‑Versuch?
3. **Krankenkasse:** gesetzlich (GKV) oder privat (PKV)? Und wie heißt deine
   Kasse (für das Absender‑Matching)?
4. **Wie markierst du eingereichte Rechnungen?** CLI‑Befehl (schnell zu bauen),
   kleines Web‑Formular, oder später automatisch aus E‑Mails?
5. **Alarmkanal:** Telegram, ntfy, Pushover oder E‑Mail?
6. **Claude für Kategorisierung/Coaching** gewünscht (etwas mehr Komfort, ein
   paar Cent) oder rein regelbasiert (0 €)?

---

## 16. Nächster Schritt

Wenn du mir die Punkte aus §15 beantwortest (oder „nimm deine Empfehlungen"
sagst), setze ich **Phase 0** auf: ein kleines Python‑Skript, das die DKB
verbindet und die ersten echten Umsätze zieht – der Rest baut darauf auf.

---

### Quellen (Stand Juli 2026)

- python‑fints – Getestete Banken / DKB‑Issues:
  <https://python-fints.readthedocs.io/en/latest/tested.html> ·
  <https://github.com/raphaelm/python-fints/issues/183>
- Enable Banking als self‑serve Nordigen‑Nachfolger, freier Tier für
  selbstverbundene Konten; Free‑Open‑Banking‑Überblick 2026:
  <https://www.openbankingtracker.com/guides/free-open-banking-apis>
- GoCardless Bank Account Data (ex‑Nordigen) – Doku & Status:
  <https://developer.gocardless.com/bank-account-data/overview>
- DKB über Open‑Banking‑Aggregatoren:
  <https://www.openbankingtracker.com/provider/deutsche-kreditbank-ag-dkb>
