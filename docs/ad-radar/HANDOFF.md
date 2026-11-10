# Übergabe: Ad-Radar-Entwicklung

## Für dich (Mensch): so startest du die neue Session
1. Neue Claude-Code-Session auf dem Repo `marc585/jl-marketing-suite` starten.
2. Den **Start-Prompt** unten komplett einfügen.
3. Parallel M0 erledigen (siehe unten) – die Entwicklung läuft auch ohne Tokens (mit Fixtures).

> Wichtig: Plan und Analyse liegen auf dem Branch `claude/zealous-einstein-auw5e6`, **nicht auf `main`**. Der Start-Prompt holt sie von dort.

---

## Start-Prompt (kopieren)

```
Wir entwickeln das "Ad-Radar" für die Jean&Len Marketing Suite (Wettbewerber-Ads aus der Meta Ad Library analysieren → Ad-Baupläne für unsere Produkte; Spacedome-AI-Nachbau).

1. Hol dir die Unterlagen: `git fetch origin claude/zealous-einstein-auw5e6` und lies
   - docs/ad-radar/ENTWICKLUNGSPLAN.md   (verbindlicher Plan, Architektur-Entscheidungen A1–A7, Datenmodelle, Meilensteine)
   - docs/ad-radar/HANDOFF.md            (Kontext, Stand, Grenzen der Umgebung)
   - docs/spacedome-analyse.md           (Hintergrund)
   Übernimm diese Dateien in deinen Arbeits-Branch (git checkout origin/claude/zealous-einstein-auw5e6 -- docs/).
2. Schau dir vorher die bestehende Architektur an: index.html, app.js, style.css, sync-ci.py, .github/workflows/sync-feed.yml, articles.json (Struktur).
3. Arbeite die Meilensteine M1 → M6 der Reihe nach ab. Pro Meilenstein: Code + Tests (pytest, offline mit Fixtures), Tests grün, committen, pushen. Halte dich an die Abnahmekriterien im Plan.
4. Lade für die Claude-API-Teile (M3/M4) den claude-api-Skill, für Charts (M6) den dataviz-Skill.
5. Bestehende Artikelsuche darf nicht kaputtgehen – am Ende per Playwright prüfen (Desktop + Mobil).
6. Wo der Plan "ungeprüft" sagt (Meta-API-Version/Felder, Token-Laufzeit): gegen die aktuelle Doku prüfen bzw. als Annahme im Code kommentieren.
Melde nach jedem Meilenstein kurz: erledigt / was nicht ging.
```

---

## Kontext für die Entwicklungs-Session

### Stand (10.11.2026)
- Analyse fertig: `docs/spacedome-analyse.md`
- Plan fertig: `docs/ad-radar/ENTWICKLUNGSPLAN.md`
- Noch **kein Code** für das Ad-Radar geschrieben.

### Bestehendes System (kurz)
| Teil | Was | Relevant für |
|---|---|---|
| `index.html` / `app.js` / `style.css` | Statische Seite, Chat-Artikelsuche; Nav-Einträge `kampagnen`, `content`, `assets`, `reporting` sind `disabled`, **kein View-Router vorhanden** | M6 |
| `articles.json` | `{meta, categoryKeywords, articles[]}`; Artikel: `sku, name, category, subcategory, availability, price, salePrice, url, gtin` (407 Artikel) | M3, M4, M6 |
| `sync-ci.py` + `.github/workflows/sync-feed.yml` | Täglicher Shopware-Feed-Sync 06:00 UTC, committet `articles.json` auf `main` | Vorlage für M5 |
| `.github/workflows/pages.yml` | Deploy des ganzen Repos auf GitHub Pages bei Push auf `main` | Daten unter `data/` werden mit ausgeliefert |
| `staticwebapp.config.json` | Azure SWA mit AAD-Login, Tenant-ID ist noch ein Platzhalter | Zugriffsschutz (offen) |
| `wordpress-plugin/` | Nur Artikelsuche, nicht anfassen | – |

### Was in der Cloud-Session geht und was nicht
- **Nicht erreichbar:** graph.facebook.com, spacedome.de, facebook.com (Proxy blockt) → Meta-API nur in GitHub Actions testen, lokal mit Fixtures arbeiten.
- **Verfügbar:** Meta-MCP-Tool `ads_library_search` (liefert nur `id, page_id, page_name, ad_creative_link_title, ad_creation_time, ad_delivery_start_time, ad_snapshot_url` – **keine Bodies, keine Reichweite**). Gut geeignet, um Page-IDs zu finden und realistische Fixture-IDs/Titel zu bauen.
- Bekannte Page-IDs: Bilou `172203690156621` (Test-Wettbewerber), Spacedome `283337135800172` (Referenz).
- Playwright/Chromium vorinstalliert (für Frontend-Screenshots).

### Secrets (vom Menschen in GitHub → Settings → Secrets → Actions anzulegen)
| Secret | Zweck |
|---|---|
| `META_AD_LIBRARY_TOKEN` | Ad Library API (Meta-Developer-App + Identitätsbestätigung nötig) |
| `ANTHROPIC_API_KEY` | Tagging & Baupläne |

Ohne Secrets muss `run.py` sauber abbrechen bzw. mit `--dry-run` / Fixtures laufen.

---

## M0 – To-dos für dich (parallel)
- [ ] Meta-Developer-App + Identitätsbestätigung → Token → Secret `META_AD_LIBRARY_TOKEN`
- [ ] Anthropic-API-Key → Secret `ANTHROPIC_API_KEY`
- [ ] 5–15 Wettbewerber festlegen (Marke + Facebook-Seite) – ich bzw. die Session kann die Page-IDs dann über die Meta-Schnittstelle heraussuchen
- [ ] Entscheiden: soll das Ad-Radar öffentlich (GitHub Pages) oder nur hinter Login (Azure SWA) laufen?
