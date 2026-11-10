# Ad-Radar – Entwicklungsplan

Ziel: ein eigenes Tool in der J&L Marketing Suite, das Wettbewerber-Ads aus der Meta Ad Library auswertet und Jean&Len konkrete Ad-Baupläne je Produkt/Kategorie liefert. Später kommen die eigenen Performance-Daten dazu. Ein Spacedome-AI-Nachbau, der sie übertrifft. Hintergrund: [`../spacedome-analyse.md`](../spacedome-analyse.md)

---

## 1. Architektur-Entscheidungen (gesetzt)

| # | Entscheidung | Begründung |
|---|---|---|
| A1 | **Gleiches Muster wie der Produkt-Sync:** GitHub Action → Python-Script → JSON im Repo → statisches Frontend | Bewährt (`sync-feed.yml` / `sync-ci.py`), kein Server nötig |
| A2 | **Kein API-Key im Frontend.** Alle LLM-Aufrufe laufen in der GitHub Action, Ergebnisse werden als JSON vorberechnet | Seite ist statisch (GitHub Pages / Azure SWA) |
| A3 | **MVP: nur Text-Tagging** (Ad-Texte + Titel aus der API), Bilder/Videos nur als Snapshot-Link für Menschen | Die offizielle API liefert keine Medien; Scraping ist rechtlich heikel |
| A4 | **Nur neue Ads taggen** (Cache über Ad-ID), Obergrenze pro Lauf | Kostenkontrolle |
| A5 | **Score relativ je Wettbewerber** (Perzentil), nicht absolut | Große Marken würden sonst alles dominieren |
| A6 | Python nur stdlib + `anthropic` SDK, Tests mit `pytest` und Fixture-Dateien (offline) | Wie bestehende Scripts; Cloud-Sessions erreichen graph.facebook.com nicht |
| A7 | WordPress-Plugin bleibt außen vor (nur Artikelsuche) | Scope |

## 2. Zielstruktur im Repo

```
data/ad-radar/
  competitors.json        # gepflegt von Marketing (Input)
  competitor-ads.json     # generiert: Ads + Signale + Tags
  patterns.json           # generiert: Aggregation je Kategorie
  blueprints.json         # generiert: Ad-Baupläne je Kategorie
scripts/ad_radar/
  __init__.py
  fetch_ads.py            # M1: Meta Ad Library API → Rohdaten
  signals.py              # M2: Laufzeit, Varianten, Score
  tag_ads.py              # M3: Claude-Tagging (Text)
  patterns.py             # M4: Aggregation + White Spaces
  blueprints.py           # M4: Bauplan-Generierung
  run.py                  # Orchestrierung aller Schritte
  schema.py               # Tag-Schema / Validierung
tests/ad_radar/
  fixtures/ads_archive_page1.json, ...
  test_signals.py, test_tag_schema.py, test_patterns.py, test_fetch_paging.py
.github/workflows/sync-competitor-ads.yml
ad-radar.js               # Frontend-Modul (oder Abschnitt in app.js)
```

## 3. Datenmodelle

### `competitors.json` (Input)
```json
{
  "countries": ["DE"],
  "competitors": [
    { "id": "bilou", "name": "bilou", "pageIds": ["172203690156621"],
      "categories": ["Pflege > Körper"], "active": true, "notes": "" }
  ]
}
```
Bilou ist nur ein Testeintrag (Page-ID per Meta-MCP verifiziert). Die echte Liste kommt vom Marketing → siehe offene Punkte.

### `competitor-ads.json` (generiert)
```json
{
  "meta": { "lastUpdated": "2026-11-10", "countries": ["DE"], "adsCount": 0, "taggedCount": 0 },
  "ads": [{
    "id": "1846771080090340",
    "competitorId": "bilou",
    "pageName": "bilou • made with love",
    "titles": ["Ab auf den Wunschzettel!"],
    "bodies": ["…"],
    "linkCaptions": [], "linkDescriptions": [],
    "startDate": "2026-10-26", "stopDate": null, "active": true,
    "daysActive": 15,
    "platforms": ["facebook", "instagram"],
    "euReach": 123456,
    "variantGroup": "sha1(normalisierter Titel+Body)",
    "variantCount": 5,
    "score": 0.82,
    "snapshotUrl": "https://www.facebook.com/ads/library/?id=…",
    "firstSeen": "2026-11-10", "lastSeen": "2026-11-10",
    "tags": null, "taggedAt": null
  }]
}
```

### Tag-Schema (`schema.py`, feste Enums, LLM muss sich daran halten)
| Feld | Werte (erweiterbar) |
|---|---|
| `hook_type` | frage, problem, provokation, social_proof, neuheit, saison_anlass, preis_angebot, emotion, how_to, statement |
| `angle` | geschenk, duft_erlebnis, selfcare_ritual, nachhaltigkeit_vegan, preis_wert, design_optik, inhaltsstoffe, limitiert, personalisierung |
| `offer` | keiner, rabatt, gratis_zugabe, bundle_set, versandkostenfrei, gewinnspiel |
| `proof` | keiner, bewertungen, testurteil, influencer_ugc, zahlen, vorher_nachher |
| `cta` | jetzt_kaufen, entdecken, mehr_erfahren, wunschzettel, verschenken, sonstiges |
| `tonality` | verspielt, premium, laessig, informativ, emotional |
| `product_category` | Kategorien aus `articles.json` (`category` / `subcategory`) |
| `season` | ganzjaehrig, weihnachten, valentinstag, muttertag, sommer, black_friday, ostern |
| `format_guess` | aus Text geschätzt: video, bild, carousel, unklar (MVP) |
| `hook_text` | erster Satz / Kernaussage (String) |
| `summary_de` | 1 Satz (String) |

## 4. Meilensteine & Tickets

### M0 – Setup (Mensch, vor/parallel zur Entwicklung)
- [ ] Meta-Developer-App anlegen, **Identitätsbestätigung** für den Ad-Library-API-Zugang abschließen
- [ ] Long-lived User-Token erzeugen → GitHub-Secret `META_AD_LIBRARY_TOKEN` (ungeprüft: Laufzeit ca. 60 Tage → Erneuerung einplanen, siehe Risiken)
- [ ] `ANTHROPIC_API_KEY` als GitHub-Secret
- [ ] Wettbewerberliste (5–15 Marken + Facebook-Pages) → `competitors.json`

### M1 – Abruf (`fetch_ads.py`)
- `GET https://graph.facebook.com/<version>/ads_archive` mit `ad_reached_countries`, `search_page_ids` (max. 10 pro Request → chunken), `ad_active_status=ALL`, `ad_type=ALL`, `limit`, `fields=` (id, ad_creation_time, ad_creative_bodies, ad_creative_link_titles, ad_creative_link_captions, ad_creative_link_descriptions, ad_delivery_start_time, ad_delivery_stop_time, ad_snapshot_url, page_id, page_name, publisher_platforms, languages, eu_total_reach)
- Paginierung über `paging.next`, Retry mit Backoff bei 429/5xx, Token nie loggen
- **Ungeprüft:** API-Version und exakte Feldnamen beim Start gegen die aktuelle Meta-Doku prüfen
- Merge mit Bestand: `firstSeen` behalten, `lastSeen` aktualisieren, Tags behalten
- **Abnahme:** Test mit 2 Fixture-Seiten (Paging) läuft offline grün; Merge behält bestehende Tags

### M2 – Signale (`signals.py`)
- `daysActive` = (stopDate oder heute) − startDate
- `variantGroup` = Hash aus normalisiertem Titel + erstem Body (lowercase, Whitespace/Emoji raus); `variantCount` = Ads je Gruppe & Wettbewerber
- `score` = gewichteter Mittelwert der **Perzentile je Wettbewerber**: 0,5·daysActive + 0,3·variantCount + 0,2·euReach (fehlt euReach → 0,6/0,4)
- **Abnahme:** Unit-Tests für Grenzfälle (kein Stop-Datum, keine Reichweite, 1 Ad pro Wettbewerber)

### M3 – AI-Tagging (`tag_ads.py`)
- Nur Ads mit `tags == null`, sortiert nach Score, max. `TAG_LIMIT` (Default 150) pro Lauf
- Batch von ca. 10 Ads pro Request, Structured Output / JSON gegen `schema.py` validieren, ungültige Antwort → 1× erneut, sonst überspringen
- Modell: aktuelles Claude-Modell; in der Session den `claude-api`-Skill laden für aktuelle Modell-IDs/SDK-Nutzung; Prompt-Caching für den System-Prompt mit dem Schema
- `product_category` gegen die Kategorien aus `articles.json` mappen
- **Abnahme:** Schema-Validierungstest; Dry-Run-Modus (`--dry-run`) ohne API-Call mit Fake-Tagger

### M4 – Muster & Baupläne (`patterns.py`, `blueprints.py`)
- `patterns.json`: je `product_category` Häufigkeiten aller Tag-Felder (gesamt + nur Top-25-%-Score), Top-Hooks mit Beispiel-Ad-IDs, **White Spaces** = Angles/Hooks, die bei < 5 % der Ads vorkommen, obwohl sie zu Jean&Len passen
- `blueprints.json`: je Kategorie 3–5 Konzepte, generiert von Claude aus `patterns.json` + Beispiel-Artikeln aus `articles.json` + Jean&Len-Tonalität:
  `{ konzept, angle, hook_varianten[3], struktur: {hook_0_3s, body, proof, cta}, format, primaertext_varianten[2], headline_varianten[2], begruendung, referenz_ads[] }`
- Nur neu generieren, wenn sich `patterns.json` für die Kategorie geändert hat
- **Abnahme:** Test für Aggregation + White-Space-Logik mit Fixture-Tags

### M5 – Workflow (`sync-competitor-ads.yml`)
- Wöchentlich (z. B. Montag 05:00 UTC) + `workflow_dispatch`
- Schritte: checkout → Python 3.12 → `pip install anthropic` → `python -m scripts.ad_radar.run` → nur bei Diff committen
- **Vor dem Push `git pull --rebase`** (der tägliche Artikel-Sync committet ebenfalls auf `main`)
- `concurrency`-Gruppe, `permissions: contents: write`
- **Abnahme:** Lauf per `workflow_dispatch` erfolgreich, Commit enthält nur `data/ad-radar/*`

### M6 – Frontend „Ad-Radar"
- In `index.html` ersetzt der Nav-Eintrag `data-tool="kampagnen"` (heute `disabled`, „Kampagnen-Planer") den Platzhalter durch **„Ad-Radar"**
- **Fehlt heute:** Es gibt kein View-Switching (Nav-Klicks haben keinen Handler, `app.js` kennt nur die Chat-Ansicht) → minimaler Router: `data-tool` → Section ein-/ausblenden, Hash-Routing (`#ad-radar`)
- Views:
  1. **Feed:** Karten (Marke, Titel, Hook, Tags, Laufzeit, Varianten, Score, Snapshot-Link); Filter: Wettbewerber, Kategorie, aktiv, „neu diese Woche", Langläufer (> 30 Tage)
  2. **Muster:** je Kategorie Balken für Hook/Angle/Format + White Spaces (Charts mit dem `dataviz`-Skill)
  3. **Bauplan:** Artikel aus `articles.json` wählen (Suche wiederverwenden) → Bauplan der Kategorie, Produktname/Preis eingesetzt, Kopier-Button (vorhandenes `copyArticles`-Muster)
- Stil aus `style.css` übernehmen, mobil nutzbar
- **Abnahme:** Playwright-Screenshot Desktop + Mobil; Artikelsuche funktioniert unverändert

### M7 (optional) – Visuelles Tagging
- Für die Top-N je Wettbewerber: Bild/Video-Frame manuell hochladen oder Snapshot-Screenshot (**erst nach rechtlicher Klärung**) → Vision-Tagging für echtes `format`, Farbwelt, Packshot vs. Lifestyle

### Phase 2 – eigene Performance (der Burggraben)
- Eigene Jean&Len-Ads über die Marketing API (Insights: Spend, CTR, CPA, ROAS) holen, gleiches Tag-Schema anwenden
- `own-performance.json`: Performance je Tag-Ausprägung → Baupläne gewichten nach dem, was *bei Jean&Len* funktioniert
- Loop: Bauplan → Briefing-Agent → Creative (Higgsfield/Canva) → A/B-Test → Ergebnis zurück
- Weitere Quellen: TikTok Creative Center, Google Ads Transparency Center

## 5. Reihenfolge & grober Aufwand (Schätzung)
| Schritt | Aufwand |
|---|---|
| M1 + M2 (inkl. Tests) | 1–2 Tage |
| M3 | 1 Tag |
| M4 | 1–2 Tage |
| M5 | 0,5 Tag |
| M6 | 2–3 Tage |
| **MVP gesamt** | **ca. 1–1,5 Wochen** |
| M7 / Phase 2 | je 1–2 Wochen |

## 6. Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| Token läuft ab (ungeprüft: ca. 60 Tage) | Workflow schlägt mit klarer Meldung fehl; Erinnerung; später System-User-Token prüfen |
| API liefert für manche Ads keine Bodies | Titel + Link-Description nutzen, `tags.confidence` niedrig setzen |
| Proxy-Signale ≠ echte Performance | Phase 2; im UI „geschätzt" kennzeichnen |
| LLM-Kosten | A4 + `TAG_LIMIT` + Prompt-Caching |
| Repo/Seite öffentlich → Strategie sichtbar | Vor Go-live klären: GitHub Pages ist öffentlich, Azure SWA (`staticwebapp.config.json`) hat AAD-Login, aber Tenant-ID ist noch ein Platzhalter |
| Zwei Workflows pushen auf `main` | `git pull --rebase` + `concurrency` |

## 7. Offene Entscheidungen (Default, falls niemand widerspricht)
1. Wettbewerberliste → **Default:** Entwicklung mit Bilou als einzigem Testeintrag
2. Hosting/Zugriffsschutz → **Default:** erst bauen, vor dem Live-Schalten klären
3. Markt → **Default:** nur `DE`
4. Lauf-Intervall → **Default:** wöchentlich
