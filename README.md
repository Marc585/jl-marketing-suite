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

### Mögliche nächste Ausbaustufen

- Echte Social-Media-Zahlen automatisch ziehen (z.B. Meta Graph API) – braucht ein
  kleines Backend (Azure Function), da API-Secrets nicht in den Browser gehören.
- Direktes Posten auf Kanäle (ebenfalls Backend nötig).
- Cloud-Sync der Dashboard-Daten statt localStorage (z.B. Azure Table Storage).

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
