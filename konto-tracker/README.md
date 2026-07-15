# Konto-Tracker — Schritt 1: Transaktionen automatisiert abrufen

Holt DKB-Umsätze über die PSD2-Schnittstelle (via [Enable Banking](https://enablebanking.com))
und speichert sie dedupliziert in einer lokalen SQLite-Datenbank. Zusätzlich gibt es
einen CSV-Import als Fallback. Auswertungen (Krankenkassen-Erstattungen, Ausgaben-Alarme)
folgen als nächster Schritt — siehe [PLAN.md](PLAN.md).

**Wichtig:** Datenbank, `.env` und Schlüssel liegen per `.gitignore` außerhalb der
Versionskontrolle. Niemals committen.

---

## 1. Einmalige Einrichtung

### 1.1 Enable-Banking-Konto & Application anlegen

1. Auf <https://enablebanking.com> registrieren und ins **Control Panel** gehen.
2. Eine **Application** anlegen:
   - Environment: **Production** (im Sandbox-Modus gibt es nur Testbanken).
     Der kostenlose „Restricted Production"-Modus erlaubt den Zugriff auf Konten,
     die du selbst verbindest — genau unser Fall.
   - **Redirect-URL** registrieren, z. B. `https://localhost/callback`.
     (Die Seite muss nicht existieren — du kopierst nach dem Bank-Login nur die
     Adresszeile aus dem Browser.)
3. Beim Anlegen wird ein **RSA-Schlüsselpaar** erzeugt: Den **privaten Schlüssel
   (PEM)** herunterladen und hier ablegen: `konto-tracker/secrets/private.pem`
   — die **Application-ID** notieren.

### 1.2 Projekt konfigurieren

```bash
cd konto-tracker
pip install -r requirements.txt
cp .env.example .env        # und Werte eintragen:
# EB_APPLICATION_ID=...
# EB_PRIVATE_KEY_PATH=./secrets/private.pem
# EB_REDIRECT_URL=https://localhost/callback
```

### 1.3 Zugang testen und DKB verbinden

```bash
python -m kontotracker check                 # Zugangsdaten gültig?
python -m kontotracker banks --filter DKB    # exakten Banknamen finden
python -m kontotracker connect --bank DKB    # gibt eine URL aus
```

Die ausgegebene URL im Browser öffnen → bei der DKB einloggen und den Zugriff
freigeben (SCA/TAN). Danach leitet die Bank auf die Redirect-URL weiter.
**Komplette Adresszeile kopieren** und:

```bash
python -m kontotracker authorize "https://localhost/callback?code=...&state=..."
```

### 1.4 Erster Abruf

```bash
python -m kontotracker fetch      # holt beim ersten Mal bis zu 24 Monate Historie
python -m kontotracker list       # letzte Umsätze anzeigen
python -m kontotracker status     # Datenbestand + Consent-Gültigkeit
```

---

## 2. Automatisierung (regelmäßiger Abruf)

Der `fetch`-Befehl ist inkrementell und idempotent — er holt nur Neues und
überspringt Duplikate. Einfach per Cron laufen lassen, z. B. täglich 7:30 Uhr:

```cron
30 7 * * * cd /pfad/zu/konto-tracker && /usr/bin/python3 -m kontotracker fetch >> data/fetch.log 2>&1
```

Alternativ ein systemd-Timer (`~/.config/systemd/user/kontotracker.timer` +
`.service` mit `ExecStart=python3 -m kontotracker fetch`).

**PSD2-Einschränkung:** Der Bank-Consent gilt **max. 90 Tage**. Danach schlägt
`fetch` mit einem klaren Hinweis fehl und du autorisierst einmal neu
(`connect` + `authorize`, dauert ~1 Minute). `status` und `fetch` warnen ab
14 Tagen vor Ablauf.

---

## 3. CSV-Import (Fallback)

Falls die API mal nicht verfügbar ist: Im DKB-Banking Umsätze als CSV
exportieren, dann:

```bash
python -m kontotracker import-csv umsaetze.csv --iban DE02...
```

Unterstützt das neue (ab 2023) und das alte DKB-Exportformat; erneuter Import
derselben Datei erzeugt keine Duplikate.

---

## 4. Alle Befehle

| Befehl | Zweck |
|--------|-------|
| `check` | Enable-Banking-Zugangsdaten testen |
| `banks [--filter DKB]` | Banknamen bei Enable Banking suchen |
| `connect [--bank DKB]` | Bank-Autorisierung starten (URL ausgeben) |
| `authorize "<URL>"` | Autorisierung abschließen (Redirect-URL einfügen) |
| `accounts` | Verknüpfte Konten anzeigen |
| `fetch [--from YYYY-MM-DD]` | Neue Transaktionen abrufen (inkrementell) |
| `import-csv <datei> [--iban …]` | DKB-CSV importieren |
| `list [--limit N]` | Letzte Umsätze anzeigen |
| `status` | Datenbestand + Consent-Gültigkeit |

## 5. Tests

```bash
python -m unittest discover -s tests
```

## 6. Sicherheit

- `data/` (Datenbank), `.env`, `secrets/*.pem` sind git-ignoriert.
- Der private Schlüssel signiert nur API-Anfragen; Bank-Zugangsdaten (PIN/TAN)
  werden **nie** vom Tool gesehen — der Login passiert direkt bei der DKB.
- Empfohlen: Das Tool auf einem eigenen Gerät (Raspberry Pi/Heimserver) laufen
  lassen, Datenträgerverschlüsselung aktivieren.
