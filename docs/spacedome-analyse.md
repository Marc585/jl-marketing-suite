# Spacedome AI – Analyse & Nachbau-Konzept für Jean&Len

Stand: 10.11.2026 · Quellen: Meta Ad Library (über Meta-MCP abgefragt), Websuche. Die Seiten von Spacedome selbst (spacedome.de / spacedome.ai) waren aus der Arbeitsumgebung nicht direkt abrufbar – alles zu Spacedome stammt aus Suchtreffern und deren eigenen Ads/Posts.

Legende: **[Fakt]** belegt · **[Eigenangabe]** nur von Spacedome behauptet · **[Schluss]** abgeleitet · **[Annahme]** nicht belegt

---

## 1. Wer ist Spacedome?

| Punkt | Inhalt | Status |
|---|---|---|
| Firma | Spacedome Media GmbH (Social-Ads-/Meta-Ads-Agentur für E-Commerce), plus Spacedome Academy GmbH | [Fakt] |
| Köpfe | Nico Hummel (CEO/Mitgründer), Niklas Grunow (Mitgründer) | [Fakt] |
| Sitz | Einträge nennen Waldkirchen bzw. Berlin – widersprüchlich | [Fakt, unklar] |
| Website | spacedome.de | [Fakt] |
| Kernmethode | „Burggraben-Ads": Creatives nach Education / Entertainment / Inspiration, sollen schwer kopierbar sein | [Eigenangabe] |
| Zahlen | „100 Mio. € Adspend", „40.000+ Creatives", „>1 Mio. €/Monat verwalteter Adspend", „Meta Premium Partner" | [Eigenangabe] |
| Achtung Name | **spacedome.ai** ist laut Suchtreffern ein *anderes* Unternehmen (Spacedome LLC, San Francisco, AI-Lab mit Voice-Agent „Vanos"). Ob die „Spacedome AI"-Ads auf spacedome.ai oder eine spacedome.de-Unterseite verlinken, konnte ich nicht prüfen. | [Fakt / offen] |

**Geschäftsmodell [Schluss]:** Die AI ist ein **Lead-Magnet**, kein eigenständiges SaaS-Produkt. Ziel ist die kostenlose „Wachstumsanalyse" → Agentur-/Consulting-Mandat.

## 2. Ihre Werbung (Meta Ad Library, Page-ID 283337135800172)

~1.330 Ads im Archiv (Meta-Schätzung). Aktuelle Ad-Linien nach Titel:

| Start (Version) | Titel | Funktion im Funnel [Schluss] |
|---|---|---|
| 24.09.–09.11.2026, laufend neu | „[Kostenloser Zugang] SPACEDOME AI, für fortgeschrittene Online-Shops" | Lead-Magnet AI |
| 24.09.–09.11.2026 | „[KOSTENLOS] Burggraben-Ads System + Spacedome AI" | Lead-Magnet Methode + AI |
| 12.10.2026 | „Die AI, die auf 100 Mio. € AdSpend trainiert ist – jetzt kostenlos für Online-Shops" | Autoritäts-Hook |
| 06.11.2026 | „10 echte Online-Shop Breakdowns" | Content/Proof |
| 06.11.2026 | „Kostenlose Wachstumsanalyse für Food-Shops" | Vertikal-Targeting → Sales-Call |
| 05.10.2026 | „1:1 Beratung ohne Gruppencalls" | Academy/Consulting |
| 30.09.2026 | „Über 50k / Monat verwalteten Adspend? → Bewerben" | Recruiting / Qualifizierung |
| Okt–Nov 2026 | „META Growth Consultant gesucht!" | Recruiting |

Auffällig: Jede Linie läuft mit 4–7 parallelen Varianten (gleicher Titel, verschiedene Creatives) – klassisches Creative-Testing. Der Ad-Text selbst (Body) wird über die MCP-Schnittstelle nicht geliefert, nur Titel, Startdatum und Snapshot-Link.

## 3. Was „Spacedome AI" kann

### Belegt durch eigene Posts/Ads
- Man gibt **Ad-Library-Links von Wettbewerbern** ein. [Eigenangabe]
- Die AI **analysiert automatisch deren Top-Performer-Ads** und **filtert die „Winning-Elemente" heraus**: funktionierende **Angles**, **Hooks** der Konkurrenz und **ungenutzte Ansätze**. [Eigenangabe]
- Ergebnis: Empfehlung, wie die eigenen Ads aufgebaut sein sollten. [Eigenangabe]
- Daneben gibt/gab es ein **„SpacedomeGPT" (Lite, kostenlos)** – ein Custom-GPT mit „Learnings, Frameworks und Best-Performer-Ads aus 100 Mio. € Adspend". Zugang per Kommentar „GPT" bzw. „AI Ads" → Link per DM. [Eigenangabe]
- Wording „jetzt kostenlos – aber nicht für immer" → Verknappung. [Fakt: Post-Text]

### Wie es technisch sehr wahrscheinlich funktioniert [Schluss]
```
Wettbewerber-Ad-Library-URLs
   │
   ▼ 1. Abruf: Ad-Library-Scraper (Bilder/Videos sind über die offizielle API NICHT abrufbar)
   ▼ 2. „Top-Performer" schätzen: Laufzeit (Tage aktiv), Anzahl Varianten/Duplikate,
   │     ggf. EU-Reichweite – echte Performance-Daten (Spend, ROAS) gibt es für
   │     Commercial Ads öffentlich nicht
   ▼ 3. Video → Transkript, Bild → Vision-LLM; Tagging: Hook, Angle, Format, Offer, Proof, CTA
   ▼ 4. Clustern & vergleichen: Was machen viele? Was fehlt im Markt?
   ▼ 5. LLM mit Spacedome-Wissensbasis (Burggraben-Framework, eigene Winner-Ads) im Prompt
   ▼
„Deine Ads sollten so aufgebaut sein …" + CTA zur Wachstumsanalyse
```
**Kernerkenntnis:** „Top-Performer" ist bei Wettbewerbern immer eine **Schätzung über Proxy-Signale**. Der echte Mehrwert von Spacedome liegt im Framework/Prompt, nicht in exklusiven Daten.

## 4. Lohnt sich ein Nachbau für Jean&Len? – Ja, mit Vorteil

| | Spacedome AI | Eigenbau Jean&Len |
|---|---|---|
| Wettbewerber-Daten | öffentlich (Ad Library) | gleich |
| Eigene Performance-Daten | nein | **ja** – Meta-Ad-Account (Insights) → prüfbar, welche Hooks/Angles *bei uns* wirken |
| Produktwissen | nein | **ja** – `articles.json` (407 Artikel, täglicher Shopware-Sync) |
| Marken-/Briefing-Kontext | generisch | Jean&Len-Briefing-Agent existiert bereits |
| Creative-Produktion | nein | Higgsfield/Canva anschließbar |
| Datenschutz | Wettbewerberliste & Shopdaten gehen an Agentur | bleibt intern |
| Kosten | „kostenlos" = Sales-Funnel | API-Kosten, gering [Annahme] |

## 5. Bauplan

### Stufe 0 – sofort, ohne Code (heute machbar)
Claude + Meta-MCP (`ads_library_search`) ist in dieser Umgebung bereits verbunden: Wettbewerber-Pages abfragen, Titel/Laufzeiten/Variantenzahl auswerten. **Grenze:** liefert nur Titel + Snapshot-Link, keine Ad-Texte und keine Bilder/Videos. Beispiel-Test: „Bilou" (DE, aktiv) → 60 Ads, Linien „Ab auf den Wunschzettel!", „Hol dir deine Herzhälfte!", „Get one for your bestie!" (Weihnachts-/Geschenk-Angle, ab 26.10.2026).

### Stufe 1 – MVP „Ad-Radar" in der Marketing Suite (passt zur bestehenden Architektur)
Gleiches Muster wie der Produktfeed-Sync (`sync-feed.yml` → `sync-ci.py` → JSON → statisches Frontend):

1. **`competitors.json`** – gepflegte Liste: Marke, Facebook-Page-ID, Kategorie (Körper, Hände, Raumduft …).
2. **GitHub Action `sync-competitor-ads.yml`** (wöchentlich):
   - Meta **Ad Library API** (`/ads_archive`, `ad_reached_countries=DE`, `search_page_ids=…`). Liefert u. a. Ad-Texte (`ad_creative_bodies`, `…_link_titles`), Start/Stop, Plattformen und für EU-Ads Reichweite & Alters-/Geschlechtsverteilung (DSA). [Annahme: Feldumfang Stand meines Wissens – beim Einrichten verifizieren]
   - Signale berechnen: Laufzeit, Variantenzahl, EU-Reichweite, „neu diese Woche", „gestoppt".
   - Score „Winner-Wahrscheinlichkeit" = Laufzeit × Varianten × Reichweite (gewichtet).
3. **AI-Tagging** (Claude API, Vision) für die Top-N je Wettbewerber mit festem Schema:
   `hook_typ` · `angle` (Geschenk, Duft-Erlebnis, Nachhaltigkeit, Preis, Ritual …) · `format` (UGC, Packshot, Carousel, Video-Demo) · `offer` · `proof` · `cta` · `tonalität` · `produktkategorie` · `saison`.
   Bilder: Screenshot vom `ad_snapshot_url` per Playwright (rechtlich prüfen, s. u.).
4. **Aggregation → `competitor-ads.json`**: Häufigkeit je Hook/Angle/Format pro Kategorie, „White Spaces" (Angles, die keiner nutzt).
5. **Frontend:** Menüpunkt „Kampagnen" (aktuell `disabled` in `index.html`) wird „Ad-Radar":
   - Wettbewerber-Feed mit Filtern (Kategorie, neu, Langläufer)
   - Muster-Übersicht (Hooks/Angles/Formate)
   - **„Ad-Bauplan"**: Artikel aus `articles.json` wählen → AI erzeugt 3–5 Ad-Konzepte (Hook, Struktur 0–3 s / Body / Proof / CTA, Format, Text-Varianten) auf Basis der Muster + Jean&Len-Tonalität.

### Stufe 2 – der eigentliche Burggraben
- **Eigene Ads denselben Tags zuordnen** und mit Meta-Insights (CTR, CPA, ROAS) verknüpfen → Ranking, welche Hooks/Angles *für Jean&Len* funktionieren. Das hat Spacedome nicht.
- Bauplan → Briefing-Agent → Creative-Generierung (Higgsfield/Canva) → A/B-Test über Meta → Ergebnis fließt zurück. Geschlossener Loop.
- Optional: TikTok Creative Center / Google Ads Transparency Center als weitere Quellen.

### Aufwand [Annahme, grob]
| Stufe | Umfang |
|---|---|
| 0 | sofort |
| 1 | ca. 1–2 Wochen Entwicklung (Sync-Script, Tagging-Prompt, Frontend-Tab) |
| 2 | +2–3 Wochen, abhängig vom Zugriff auf den eigenen Meta-Ad-Account |

## 6. Voraussetzungen & Risiken
- **Meta-Developer-App + Identitätsbestätigung** für den Ad-Library-API-Zugang nötig; Token als GitHub-Secret.
- **Bilder/Videos:** nicht über die API; Screenshot/Scraping der Ad Library kann gegen Meta-Nutzungsbedingungen verstoßen → rechtlich prüfen oder manuell für Top-N.
- **Proxy-Signale ≠ Performance:** Langläufer können auch vergessene Ads sein. Deshalb Stufe 2 (eigene Daten) als Korrektiv.
- **Wettbewerberliste** muss Jean&Len festlegen (Beispiel Bilou ist nur ein Test, keine Empfehlung).

## 7. Offene Punkte
1. Wettbewerberliste (Marken + Facebook-Pages).
2. Zugriff auf eigenen Meta-Ad-Account für Stufe 2?
3. Meta-Developer-App vorhanden?
4. Optional: Spacedome AI selbst testen (kostenloser Zugang), um Output-Format und Empfehlungslogik zu vergleichen.

## Quellen
- Meta Ad Library, Page „Spacedome" (ID 283337135800172), Abfrage 10.11.2026
- https://www.spacedome.de/ · https://www.spacedome.de/analysegespraech
- https://www.linkedin.com/in/nico-hummel-spacedome/
- https://agenturen.easy2.de/agentur/spacedome-media-gmbh/
- https://vimeo.com/973814386 (Burggraben Ads Funnel Video)
- https://www.scamadviser.com/check-website/spacedome.ai · https://spacedome.ai/ (anderes Unternehmen)
