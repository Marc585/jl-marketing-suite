# Jean&Len Marketing Suite + J.A.R.V.I.S. Kommandozentrale

Statische Web-App (Azure Static Web Apps) mit zwei Modulen:

| Modul | Datei | Zweck |
|---|---|---|
| **Marketing Suite** | `index.html` / `app.js` | Artikelnummern-Suche über den Jean&Len-Produktkatalog (Shopware-Feed, täglicher Auto-Sync via GitHub Action) |
| **J.A.R.V.I.S.** | `jarvis.html` / `jarvis.js` / `jarvis.css` | KI-Kommandozentrale mit Sprachsteuerung für Projekte, Dashboards und Social Media |

---

## J.A.R.V.I.S. – Schnellstart

1. `jarvis.html` öffnen (oder in der Suite links auf **Jarvis** klicken)
2. ⚙️ **Einstellungen** → Anthropic API-Key eintragen
   ([console.anthropic.com → API Keys](https://console.anthropic.com/settings/keys)).
   Der Key wird **ausschließlich lokal im Browser** (localStorage) gespeichert.
3. Optional: im Feld **„Über dich & deine Projekte“** Kontext hinterlegen
   (Zielgruppen, Tonalität, Romandetails …) – Jarvis bekommt ihn bei jedem Gespräch.
4. **◎ Sprachmodus** starten und einfach reden – oder unten tippen.

> Spracherkennung benötigt Chrome oder Edge und HTTPS (lokal: `localhost` geht auch).

### Was Jarvis kann

- **Projekte besprechen & Dashboard steuern** – „Setz die Peptidseite auf 80 %“,
  „Neues Kapitel fertig“ → Status, Fortschritt und Notizen werden sofort sichtbar aktualisiert.
- **Social-Media-Statistiken** – „Wie sind meine Social-Media-Statistiken?“ liest die
  gespeicherten Zahlen vor; „Instagram hat jetzt 5.200 Follower“ speichert sie und
  pflegt die Follower-Historie (Sparkline + Trend im Dashboard).
- **Content** – entwirft Posts/Captions/Reel-Skripte und legt sie als
  **Post-Entwürfe** im Dashboard ab.
- **Kennzahlen (KPIs)** – „Buchverkäufe stehen bei 1.240“ → KPI-Karte im Dashboard.
- **Aufgaben & Notizen** – legt To-dos an, hakt sie ab, heftet Notizen an.
- **Wissensspeicher** – merkt sich gefütterte Fakten dauerhaft und nutzt sie in
  jedem späteren Gespräch.
- **Produktkatalog** – durchsucht die Jean&Len-Artikel (`articles.json`).

### Sprachmodus (Hands-free)

Vollbild-Overlay mit reaktivem Orb (Audio-Visualisierung über die Web Audio API):
zuhören → verarbeiten → antworten (Sprachausgabe) → automatisch wieder zuhören.
Beenden mit ✕ oder Escape. Im normalen Chat gibt es zusätzlich 🎤 für Einzelaufnahmen
und einen Schalter für die Sprachausgabe.

---

## Architektur (Jarvis)

```
Browser (statisch, kein Backend)
 ├── jarvis.js
 │    ├── Claude API  POST /v1/messages  (Streaming/SSE, Header:
 │    │     anthropic-dangerous-direct-browser-access)
 │    ├── Tool-Use-Schleife: Claude ruft lokale JS-Tools auf
 │    │     (update_project, update_channel_stats, remember, …)
 │    ├── Web Speech API: SpeechRecognition (de-DE) + speechSynthesis
 │    └── Persistenz: localStorage
 │          jarvis_settings  → API-Key, Modell, Kontext, Sprachausgabe
 │          jarvis_data      → Projekte, Kanäle+Statistiken, Aufgaben,
 │                             Entwürfe, Notizen, KPIs, Wissensspeicher
 └── articles.json  → Produktkatalog (Auto-Sync, sync-ci.py)
```

- Standard-Modell: `claude-opus-4-8` (umstellbar in den Einstellungen).
- Alle Dashboard-Daten liegen im Browser – kein Server, keine Datenbank.
  „Dashboard-Daten zurücksetzen“ in den Einstellungen stellt den Ausgangszustand her.

### Eigene Tools ergänzen

In `jarvis.js`:

1. Tool-Definition (JSON-Schema) zum Array `TOOLS` hinzufügen,
2. Ausführung im `switch` von `executeTool()` implementieren,
3. optional Anzeigename in `TOOL_LABELS` und Rendering in `renderDashboard()`.

Claude erkennt neue Tools automatisch über die Beschreibung – je präziser dort
steht, *wann* das Tool zu benutzen ist, desto zuverlässiger ruft er es auf.

## Verbinden: Second Brain & externe Quellen

### 1. Second Brain importieren (eingebaut)

⚙️ Einstellungen → **„Dateien importieren“**: beliebige `.md`/`.txt`-Dateien laden
(Notion-/Obsidian-Export, Kontextdossier aus claude.ai …). Jarvis sieht alle
Dokumente in seinem Systemkontext und liest sie bei Bedarf vollständig
(`read_document`-Tool). Dokumente erscheinen im Dashboard unter
**Wissensspeicher** und lassen sich dort per ✕ entfernen.

> **Tipp für ein claude.ai-Second-Brain:** Da claude.ai-Projektwissen nicht per
> API abrufbar ist, lass dir dort ein „Kontextdossier“ als Markdown erstellen
> („Fasse alles, was du über mich und meine Projekte weißt, als strukturiertes
> Markdown-Dossier zusammen“) und importiere die Datei hier. Bei Updates einfach
> neu importieren – gleiche Dateinamen werden ersetzt.

### 2. MCP-Server (eingebaut, für Live-Verbindungen)

⚙️ Einstellungen → **„Verbundene MCP-Server“** – eine Zeile pro Server:

```
Notion | https://mcp.notion.com/mcp | <OAuth-Token>
```

Jarvis kann dann die Tools dieses Servers direkt nutzen (Anthropic MCP-Connector,
die Verbindung läuft serverseitig über die Claude-API). Geeignet für Notion,
Linear, Asana u.a. – der jeweilige Dienst muss einen gehosteten MCP-Endpoint
anbieten; das Token besorgst du gemäß dessen Doku (meist OAuth-Bearer-Token).

### 3. Websuche (eingebaut)

Standardmäßig aktiv (abschaltbar in den Einstellungen): Jarvis recherchiert
selbstständig im Internet – Trends, Hashtags, Peptid-News, Konkurrenzanalyse.

### 4. Weitere Ausbaustufen (brauchen ein kleines Backend)

API-Secrets gehören nicht in den Browser – für diese Anbindungen ist eine
Azure Function (Static Web Apps „Managed Functions“) der natürliche Weg:

| Quelle | Weg |
|---|---|
| Instagram/Facebook-Insights (echte Zahlen automatisch) | Meta Graph API |
| YouTube-Kanalstatistiken | YouTube Data API (öffentliche Stats nur mit API-Key) |
| Website-Traffic der Peptidseite | GA4 Data API / Matomo |
| E-Mail & Kalender | Microsoft Graph (AAD-Login ist bereits konfiguriert) |
| Direktes Posten auf Kanäle | Meta/TikTok/YouTube Publishing APIs |
| Cloud-Sync der Dashboard-Daten | Azure Table Storage statt localStorage |

---

## Entwicklung

```bash
# lokal starten
python3 -m http.server 8000
# → http://localhost:8000/jarvis.html

# Artikeldaten manuell synchronisieren
python3 sync.py
```

Deployment: Push auf `main` → Azure Static Web Apps (Konfiguration in
`staticwebapp.config.json`, Zugriff hinter Azure-AD-Login).
