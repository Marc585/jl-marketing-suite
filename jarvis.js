/* ============================================
   J.A.R.V.I.S. – Kommandozentrale
   Claude-gestützter Assistent für Projekte,
   Dashboards, Social Media & Sprachsteuerung
   ============================================ */

'use strict';

// ============================================
// Persistenz & Default-Daten
// ============================================

const LS_KEYS = {
  settings: 'jarvis_settings',
  data: 'jarvis_data',
};

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-opus-4-8',
  tts: false,
  context: '',
};

const DEFAULT_DATA = {
  projects: [
    {
      id: 'marketing-suite',
      name: 'Jean&Len Marketing Suite',
      type: 'Dashboard / Webapp',
      description: 'Interne Marketing-Suite mit Artikelsuche (Shopware-Feed, täglicher Auto-Sync) auf Azure Static Web Apps.',
      status: 'live',
      progress: 100,
      url: 'index.html',
      notes: '',
    },
    {
      id: 'peptidseite',
      name: 'Peptidseite',
      type: 'Onlineprojekt / Website',
      description: 'Online-Projekt rund um Peptide – Inhalte, Aufbau und Vermarktung.',
      status: 'in-arbeit',
      progress: 40,
      url: '',
      notes: '',
    },
    {
      id: 'romane',
      name: 'Romane',
      type: 'Schreibprojekt',
      description: 'Romanprojekte – Plotten, Schreiben, Lektorat und Veröffentlichung.',
      status: 'in-arbeit',
      progress: 30,
      url: '',
      notes: '',
    },
  ],
  channels: [
    { id: 'instagram', platform: 'Instagram', handle: '', focus: 'Reels & Stories', notes: '', stats: null, history: [] },
    { id: 'tiktok', platform: 'TikTok', handle: '', focus: 'Kurzvideos', notes: '', stats: null, history: [] },
    { id: 'youtube', platform: 'YouTube', handle: '', focus: 'Längere Formate', notes: '', stats: null, history: [] },
    { id: 'facebook', platform: 'Facebook', handle: '', focus: 'Community', notes: '', stats: null, history: [] },
  ],
  tasks: [],     // {id, projectId, title, due, done, createdAt}
  drafts: [],    // {id, channelId, topic, content, createdAt}
  notes: [],     // {id, text, createdAt}
  metrics: [],   // {id, label, value, unit, trend, updatedAt}
  knowledge: [], // {id, topic, content, updatedAt}
};

let settings = loadJSON(LS_KEYS.settings, DEFAULT_SETTINGS);
let data = loadJSON(LS_KEYS.data, DEFAULT_DATA);
let articleData = null;          // articles.json (Marketing Suite)
let conversation = [];           // Claude API message history
let busy = false;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    return Object.assign(structuredClone(fallback), JSON.parse(raw));
  } catch {
    return structuredClone(fallback);
  }
}
function saveSettings() { localStorage.setItem(LS_KEYS.settings, JSON.stringify(settings)); }
function saveData() { localStorage.setItem(LS_KEYS.data, JSON.stringify(data)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function today() { return new Date().toISOString().slice(0, 10); }

// ============================================
// Tools – Definitionen für Claude
// ============================================

const TOOLS = [
  {
    name: 'get_overview',
    description: 'Liefert den kompletten aktuellen Zustand der Kommandozentrale: alle Projekte (inkl. Status, Fortschritt, Notizen), Social-Media-Kanäle inkl. Statistiken, Kennzahlen, offene Aufgaben, Post-Entwürfe, Notizen, Wissensspeicher und die Marketing-Suite-Statistiken. Rufe dieses Tool auf, bevor du Fragen zum aktuellen Stand beantwortest.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_social_stats',
    description: 'Liefert die Social-Media-Statistiken aller Kanäle: Follower, Engagement, Posts/Woche, Views sowie die Follower-Historie (Verlauf). Rufe dies auf, wenn der Nutzer nach seinen Social-Media-Zahlen, Statistiken, Reichweite oder Entwicklung fragt.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'update_channel_stats',
    description: 'Speichert neue Social-Media-Statistiken für einen Kanal und aktualisiert die Follower-Historie. Rufe dies IMMER auf, wenn der Nutzer aktuelle Zahlen nennt (z.B. "Instagram hat jetzt 5.200 Follower", "Engagement liegt bei 4%"). Das Dashboard zeigt die Werte sofort an.',
    input_schema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'ID des Kanals, z.B. "instagram", "tiktok", "youtube", "facebook"' },
        followers: { type: 'integer', description: 'Aktuelle Follower-/Abonnentenzahl' },
        engagement_rate: { type: 'string', description: 'Engagement-Rate, z.B. "4,2%"' },
        posts_per_week: { type: 'number', description: 'Durchschnittliche Posts pro Woche' },
        views: { type: 'integer', description: 'Views/Impressionen im Betrachtungszeitraum' },
        note: { type: 'string', description: 'Optionale Anmerkung zu den Zahlen' },
      },
      required: ['channel_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_marketing_stats',
    description: 'Liefert Statistiken der Jean&Len Marketing Suite: Artikelanzahl, Kategorien mit Artikelzahlen, Datenstand des Shopware-Feeds.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_articles',
    description: 'Durchsucht den Jean&Len Produktkatalog (Artikel der Marketing Suite) nach Name, Artikelnummer (SKU) oder Kategorie. Nutze dies bei Fragen zu Produkten, Artikelnummern oder Sortiment.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchbegriff, z.B. "Shampoo", "Lip Treatment" oder eine SKU' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_project',
    description: 'Aktualisiert ein Projekt im Dashboard (Status, Fortschritt, Notizen, Beschreibung oder URL). Das Dashboard wird sofort sichtbar aktualisiert. Rufe dies auf, wenn der Nutzer einen neuen Stand berichtet oder etwas am Projekt ändern will.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID des Projekts (z.B. "peptidseite", "romane", "marketing-suite")' },
        status: { type: 'string', enum: ['live', 'aktiv', 'in-arbeit', 'geplant', 'idee', 'pausiert'], description: 'Neuer Status' },
        progress: { type: 'integer', description: 'Fortschritt in Prozent (0-100)' },
        notes: { type: 'string', description: 'Notizen zum Projekt (ersetzt bestehende Projekt-Notizen)' },
        description: { type: 'string', description: 'Neue Kurzbeschreibung' },
        url: { type: 'string', description: 'URL des Projekts' },
        name: { type: 'string', description: 'Neuer Anzeigename' },
      },
      required: ['project_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_project',
    description: 'Legt ein neues Projekt im Dashboard an.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', description: 'Art des Projekts, z.B. "Website", "Roman", "Kampagne"' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['live', 'aktiv', 'in-arbeit', 'geplant', 'idee', 'pausiert'] },
        url: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_social_channel',
    description: 'Aktualisiert die Stammdaten eines Social-Media-Kanals (Handle/Accountname, inhaltlicher Fokus, Notizen wie Posting-Plan). Für Zahlen/Statistiken stattdessen update_channel_stats verwenden.',
    input_schema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'ID des Kanals: "instagram", "tiktok", "youtube", "facebook" – oder ID eines selbst angelegten Kanals' },
        handle: { type: 'string', description: 'Accountname, z.B. "@meinaccount"' },
        focus: { type: 'string', description: 'Inhaltlicher Fokus des Kanals' },
        notes: { type: 'string', description: 'Notizen (Posting-Plan, Ideen)' },
        platform: { type: 'string', description: 'Nur beim Anlegen eines neuen Kanals: Plattformname. Existiert die channel_id nicht, wird der Kanal neu angelegt.' },
      },
      required: ['channel_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_social_draft',
    description: 'Speichert einen Social-Media-Post-Entwurf im Dashboard (z.B. Caption für Instagram, Skript für TikTok/Reel). Nutze dies, nachdem du mit dem Nutzer einen Post erarbeitet hast.',
    input_schema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'Ziel-Kanal, z.B. "instagram"' },
        topic: { type: 'string', description: 'Kurzer Titel/Thema des Posts' },
        content: { type: 'string', description: 'Der vollständige Post-Text/Caption/Skript inkl. Hashtags' },
      },
      required: ['channel_id', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_or_update_metric',
    description: 'Legt eine berufliche Kennzahl (KPI) im Dashboard an oder aktualisiert sie – z.B. Umsatz, Newsletter-Abonnenten, Buchverkäufe, Website-Besucher. Kennzahlen erscheinen als Karten im Dashboard. Existiert das Label bereits, wird der Wert aktualisiert.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Name der Kennzahl, z.B. "Buchverkäufe"' },
        value: { type: 'string', description: 'Aktueller Wert, z.B. "1.240" oder "3.500 €"' },
        unit: { type: 'string', description: 'Optionale Einheit, falls nicht im Wert enthalten' },
        trend: { type: 'string', description: 'Optionale Veränderung, z.B. "+12% ggü. Vormonat"' },
      },
      required: ['label', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_task',
    description: 'Legt eine Aufgabe an (optional einem Projekt zugeordnet, optional mit Fälligkeit).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        project_id: { type: 'string', description: 'Optional: Projekt-ID' },
        due: { type: 'string', description: 'Optional: Fälligkeit, frei formuliert oder ISO-Datum' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'complete_task',
    description: 'Markiert eine Aufgabe als erledigt (oder wieder als offen).',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        done: { type: 'boolean', description: 'true = erledigt (Standard), false = wieder öffnen' },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'remember',
    description: 'Speichert dauerhaftes Wissen über den Nutzer und seine Projekte im Wissensspeicher (z.B. "Roman 1 heißt …", "Zielgruppe der Peptidseite ist …", "Tonalität auf Instagram: locker"). Nutze dies proaktiv, wenn der Nutzer dir relevante Fakten über sich, seine Inhalte oder Vorlieben mitteilt. Existiert das Thema bereits, wird es aktualisiert.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Kurzes Thema/Stichwort, z.B. "Roman: Arbeitstitel"' },
        content: { type: 'string', description: 'Der zu merkende Inhalt' },
      },
      required: ['topic', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_item',
    description: 'Löscht ein Element aus dem Dashboard: eine Aufgabe, einen Post-Entwurf, eine Notiz, eine Kennzahl, einen Wissenseintrag, ein Projekt oder einen Kanal.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['task', 'draft', 'note', 'metric', 'knowledge', 'project', 'channel'] },
        id: { type: 'string' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_note',
    description: 'Heftet eine Notiz an das Dashboard (Ideen, Erinnerungen, wichtige Infos, die der Nutzer festhalten will).',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
];

// ============================================
// Tools – Ausführung
// ============================================

function flash(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.querySelectorAll('.dash-card, .task-item, .note-item, .stat-card, .knowledge-item').forEach(c => c.classList.add('flash'));
  setTimeout(() => el.querySelectorAll('.flash').forEach(c => c.classList.remove('flash')), 1200);
}

function executeTool(name, input) {
  switch (name) {
    case 'get_overview':
      return JSON.stringify({
        projects: data.projects,
        social_channels: data.channels,
        kennzahlen: data.metrics,
        tasks: data.tasks,
        post_drafts: data.drafts.map(d => ({ id: d.id, channelId: d.channelId, topic: d.topic })),
        notes: data.notes,
        wissensspeicher: data.knowledge,
        marketing_suite: marketingStats(),
        heute: today(),
      });

    case 'get_social_stats':
      return JSON.stringify({
        kanaele: data.channels.map(c => ({
          id: c.id,
          platform: c.platform,
          handle: c.handle,
          stats: c.stats || 'noch keine Zahlen hinterlegt – frag den Nutzer nach aktuellen Werten und speichere sie mit update_channel_stats',
          follower_verlauf: c.history || [],
        })),
        heute: today(),
      });

    case 'update_channel_stats': {
      let c = data.channels.find(x => x.id === input.channel_id);
      if (!c) return JSON.stringify({ error: `Kanal "${input.channel_id}" nicht gefunden. Vorhanden: ${data.channels.map(x => x.id).join(', ')}` });
      c.stats = Object.assign({}, c.stats, { updatedAt: today() });
      for (const k of ['followers', 'engagement_rate', 'posts_per_week', 'views', 'note']) {
        if (input[k] !== undefined) c.stats[k] = input[k];
      }
      if (typeof input.followers === 'number') {
        c.history = (c.history || []).filter(h => h.date !== today());
        c.history.push({ date: today(), followers: input.followers });
        if (c.history.length > 60) c.history = c.history.slice(-60);
      }
      saveData(); renderDashboard(); flash('channelCards');
      return JSON.stringify({ ok: true, kanal: { id: c.id, platform: c.platform, stats: c.stats, history: c.history } });
    }

    case 'get_marketing_stats':
      return JSON.stringify(marketingStats(true));

    case 'search_articles': {
      if (!articleData) return JSON.stringify({ error: 'Artikeldaten nicht geladen.' });
      const q = (input.query || '').toLowerCase().trim();
      const hits = articleData.articles.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.sku.includes(q) ||
        (a.category || '').toLowerCase().includes(q) ||
        (a.subcategory || '').toLowerCase().includes(q)
      ).slice(0, 25);
      return JSON.stringify({ treffer: hits.length, artikel: hits });
    }

    case 'update_project': {
      const p = data.projects.find(x => x.id === input.project_id);
      if (!p) return JSON.stringify({ error: `Projekt "${input.project_id}" nicht gefunden. Vorhanden: ${data.projects.map(x => x.id).join(', ')}` });
      for (const k of ['status', 'notes', 'description', 'url', 'name']) {
        if (input[k] !== undefined) p[k] = input[k];
      }
      if (input.progress !== undefined) p.progress = Math.max(0, Math.min(100, input.progress));
      saveData(); renderDashboard(); flash('projectCards');
      return JSON.stringify({ ok: true, projekt: p });
    }

    case 'add_project': {
      const p = {
        id: input.name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || uid(),
        name: input.name,
        type: input.type || 'Projekt',
        description: input.description || '',
        status: input.status || 'idee',
        progress: 0,
        url: input.url || '',
        notes: '',
      };
      if (data.projects.some(x => x.id === p.id)) p.id += '-' + uid().slice(-4);
      data.projects.push(p);
      saveData(); renderDashboard(); flash('projectCards');
      return JSON.stringify({ ok: true, projekt: p });
    }

    case 'update_social_channel': {
      let c = data.channels.find(x => x.id === input.channel_id);
      if (!c) {
        if (!input.platform) return JSON.stringify({ error: `Kanal "${input.channel_id}" nicht gefunden. Vorhanden: ${data.channels.map(x => x.id).join(', ')}. Zum Anlegen "platform" mitgeben.` });
        c = { id: input.channel_id, platform: input.platform, handle: '', focus: '', notes: '', stats: null, history: [] };
        data.channels.push(c);
      }
      for (const k of ['handle', 'focus', 'notes', 'platform']) {
        if (input[k] !== undefined) c[k] = input[k];
      }
      saveData(); renderDashboard(); flash('channelCards');
      return JSON.stringify({ ok: true, kanal: c });
    }

    case 'save_social_draft': {
      const d = {
        id: uid(),
        channelId: input.channel_id,
        topic: input.topic || 'Post-Entwurf',
        content: input.content,
        createdAt: new Date().toISOString(),
      };
      data.drafts.unshift(d);
      saveData(); renderDashboard(); flash('draftList');
      return JSON.stringify({ ok: true, entwurf_id: d.id });
    }

    case 'add_or_update_metric': {
      let m = data.metrics.find(x => x.label.toLowerCase() === input.label.toLowerCase());
      if (!m) {
        m = { id: uid(), label: input.label, value: '', unit: '', trend: '' };
        data.metrics.push(m);
      }
      m.value = input.value;
      if (input.unit !== undefined) m.unit = input.unit;
      if (input.trend !== undefined) m.trend = input.trend;
      m.updatedAt = today();
      saveData(); renderDashboard(); flash('metricCards');
      return JSON.stringify({ ok: true, kennzahl: m });
    }

    case 'add_task': {
      const t = {
        id: uid(),
        projectId: input.project_id || null,
        title: input.title,
        due: input.due || null,
        done: false,
        createdAt: new Date().toISOString(),
      };
      data.tasks.push(t);
      saveData(); renderDashboard(); flash('taskList');
      return JSON.stringify({ ok: true, aufgabe: t });
    }

    case 'complete_task': {
      const t = data.tasks.find(x => x.id === input.task_id);
      if (!t) return JSON.stringify({ error: `Aufgabe "${input.task_id}" nicht gefunden.` });
      t.done = input.done !== false;
      saveData(); renderDashboard(); flash('taskList');
      return JSON.stringify({ ok: true, aufgabe: t });
    }

    case 'remember': {
      let k = data.knowledge.find(x => x.topic.toLowerCase() === input.topic.toLowerCase());
      if (!k) {
        k = { id: uid(), topic: input.topic, content: '' };
        data.knowledge.push(k);
      }
      k.content = input.content;
      k.updatedAt = today();
      saveData(); renderDashboard(); flash('knowledgeList');
      return JSON.stringify({ ok: true, eintrag: k });
    }

    case 'delete_item': {
      const lists = { task: 'tasks', draft: 'drafts', note: 'notes', metric: 'metrics', knowledge: 'knowledge', project: 'projects', channel: 'channels' };
      const list = data[lists[input.kind]];
      if (!list) return JSON.stringify({ error: `Unbekannter Typ: ${input.kind}` });
      const idx = list.findIndex(x => x.id === input.id);
      if (idx === -1) return JSON.stringify({ error: `${input.kind} "${input.id}" nicht gefunden.` });
      list.splice(idx, 1);
      saveData(); renderDashboard();
      return JSON.stringify({ ok: true });
    }

    case 'add_note': {
      const n = { id: uid(), text: input.text, createdAt: new Date().toISOString() };
      data.notes.unshift(n);
      saveData(); renderDashboard(); flash('noteList');
      return JSON.stringify({ ok: true, notiz_id: n.id });
    }

    default:
      return JSON.stringify({ error: `Unbekanntes Tool: ${name}` });
  }
}

function marketingStats(withCategories = false) {
  if (!articleData) return { error: 'Artikeldaten nicht geladen.' };
  const cats = {};
  for (const a of articleData.articles) cats[a.category] = (cats[a.category] || 0) + 1;
  const stats = {
    artikel_gesamt: articleData.meta.totalArticles,
    kategorien_anzahl: Object.keys(cats).length,
    datenstand: articleData.meta.lastUpdated,
    quelle: articleData.meta.source,
  };
  if (withCategories) stats.kategorien = cats;
  return stats;
}

// ============================================
// Claude API (Streaming)
// ============================================

const TOOL_LABELS = {
  get_overview: 'Lese Projektübersicht …',
  get_social_stats: 'Lese Social-Media-Statistiken …',
  update_channel_stats: 'Aktualisiere Social-Statistiken …',
  get_marketing_stats: 'Lese Marketing-Statistiken …',
  search_articles: 'Durchsuche Produktkatalog …',
  update_project: 'Aktualisiere Projekt-Dashboard …',
  add_project: 'Lege neues Projekt an …',
  update_social_channel: 'Aktualisiere Social-Kanal …',
  save_social_draft: 'Speichere Post-Entwurf …',
  add_or_update_metric: 'Aktualisiere Kennzahl …',
  add_task: 'Lege Aufgabe an …',
  complete_task: 'Hake Aufgabe ab …',
  remember: 'Speichere im Wissensspeicher …',
  delete_item: 'Lösche Element …',
  add_note: 'Hefte Notiz an …',
};

function buildSystemPrompt() {
  let prompt = `Du bist J.A.R.V.I.S. – die persönliche KI-Kommandozentrale von Marc. Du sprichst Deutsch, bist präzise, proaktiv und hast einen Hauch trockenen britischen Butler-Humor (dezent, nie albern).

Deine Aufgaben:
1. **Projekte besprechen & steuern**: Marc betreibt mehrere Projekte – die Jean&Len Marketing Suite (dieses Dashboard, Produktkatalog mit Auto-Sync), die Peptidseite (Onlineprojekt) und seine Romane (Schreibprojekte). Du kennst den Stand über get_overview und hältst das Dashboard über update_project aktuell.
2. **Dashboard pflegen**: Wenn Marc etwas berichtet ("Peptidseite ist zu 80% fertig", "neues Kapitel geschrieben"), aktualisiere SOFORT das Dashboard mit den passenden Tools – nicht nur darüber reden. Berufliche Kennzahlen (Umsatz, Verkäufe, Abonnenten …) pflegst du mit add_or_update_metric.
3. **Social Media & Statistiken**: Du verwaltest seine Kanäle und deren Statistiken. Fragt Marc nach seinen Social-Media-Zahlen → get_social_stats aufrufen und die Werte klar zusammenfassen (inkl. Entwicklung, wenn Historie vorhanden). Nennt er neue Zahlen → SOFORT update_channel_stats. Sind noch keine Zahlen hinterlegt, frag aktiv nach den aktuellen Werten und speichere die Antworten. Du hilfst außerdem bei Content-Ideen, Posting-Plänen und entwirfst Posts/Captions/Reel-Skripte (fertige Entwürfe mit save_social_draft speichern).
4. **Wissen merken**: Wenn Marc dir Inhalte fütterst – Fakten zu Projekten, Romanfiguren, Zielgruppen, Tonalität, Vorlieben – speichere sie proaktiv mit remember, damit sie dauerhaft erhalten bleiben.
5. **Aufgaben & Notizen**: Halte To-dos (add_task/complete_task) und wichtige Notizen (add_note) fest, wenn sich aus dem Gespräch etwas ergibt.
6. **Produktkatalog**: Bei Fragen zu Jean&Len-Artikeln nutze search_articles.

Verhalten:
- Rufe get_overview auf, bevor du Fragen zum Projektstand beantwortest – rate nicht.
- Wenn Marc einen neuen Stand oder eine Entscheidung mitteilt, persistiere sie über die Tools, damit nichts verloren geht.
- Antworte kompakt und handlungsorientiert. Kurze Absätze oder Listen, kein unnötiges Gerede.
- Deine Antworten werden oft vorgelesen (Sprachmodus): Formuliere natürlich sprechbar, wenig Formatierung, keine langen Aufzählungen mit Sonderzeichen.
- Wenn Informationen fehlen (z.B. Social-Media-Handles oder -Zahlen noch leer), frag nach und speichere die Antwort.`;

  if (settings.context && settings.context.trim()) {
    prompt += `\n\nVon Marc hinterlegter Kontext über ihn und seine Projekte:\n${settings.context.trim().slice(0, 4000)}`;
  }

  if (data.knowledge.length) {
    const facts = data.knowledge.map(k => `- ${k.topic}: ${k.content}`).join('\n').slice(0, 6000);
    prompt += `\n\nDein Wissensspeicher (von dir gemerkte Fakten):\n${facts}`;
  }

  prompt += `\n\nHeute ist der ${new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
  return prompt;
}

async function callClaudeStream(messages, onText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      stream: true,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch { /* ignore */ }
    if (res.status === 401) throw new Error('API-Key ungültig. Bitte in den Einstellungen prüfen.');
    if (res.status === 429) throw new Error('Rate-Limit erreicht. Bitte kurz warten und erneut versuchen.');
    if (res.status === 529) throw new Error('Die Claude-API ist gerade überlastet. Bitte gleich nochmal versuchen.');
    throw new Error(`API-Fehler (${res.status}): ${detail || 'Unbekannter Fehler'}`);
  }

  // SSE-Stream parsen
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const blocks = [];
  let stopReason = null;

  const processEvent = (payload) => {
    let ev;
    try { ev = JSON.parse(payload); } catch { return; }
    switch (ev.type) {
      case 'content_block_start': {
        const b = Object.assign({}, ev.content_block);
        if (b.type === 'tool_use') b._json = '';
        if (b.type === 'text' && b.text === undefined) b.text = '';
        if (b.type === 'thinking' && b.thinking === undefined) b.thinking = '';
        blocks[ev.index] = b;
        break;
      }
      case 'content_block_delta': {
        const b = blocks[ev.index];
        if (!b) break;
        const d = ev.delta;
        if (d.type === 'text_delta') { b.text += d.text; onText && onText(d.text); }
        else if (d.type === 'input_json_delta') b._json += d.partial_json;
        else if (d.type === 'thinking_delta') b.thinking += d.thinking;
        else if (d.type === 'signature_delta') b.signature = d.signature;
        break;
      }
      case 'message_delta':
        if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
        break;
      case 'error':
        throw new Error(ev.error?.message || 'Stream-Fehler');
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) processEvent(line.slice(6));
    }
  }

  // Tool-Inputs finalisieren
  const content = blocks.filter(Boolean).map(b => {
    if (b.type === 'tool_use') {
      let input = {};
      try { input = b._json ? JSON.parse(b._json) : {}; } catch { /* defekte Eingabe → leeres Objekt */ }
      return { type: 'tool_use', id: b.id, name: b.name, input };
    }
    if (b.type === 'thinking') {
      const t = { type: 'thinking', thinking: b.thinking || '' };
      if (b.signature) t.signature = b.signature;
      return t;
    }
    return b;
  });

  return { content, stop_reason: stopReason };
}

// Kern: Nachricht verarbeiten (Chat + Sprachmodus nutzen das gemeinsam)
async function processMessage(userText, hooks = {}) {
  conversation.push({ role: 'user', content: userText });
  if (conversation.length > 40) conversation = conversation.slice(-30);

  setOrbState('thinking');
  setStatus('Denke nach …');
  hooks.onThinking && hooks.onThinking();

  let liveBubble = null;
  let liveText = '';
  const startBubble = () => {
    liveText = '';
    liveBubble = addMessage('bot', '');
  };
  const onText = (chunk) => {
    if (!liveBubble) startBubble();
    liveText += chunk;
    liveBubble.querySelector('.bubble').innerHTML = renderMarkdown(liveText);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    hooks.onPartial && hooks.onPartial(liveText);
  };

  try {
    let response = await callClaudeStream(conversation, onText);
    let rounds = 0;
    let finalText = liveText;

    while (response.stop_reason === 'tool_use' && rounds < 10) {
      rounds++;
      conversation.push({ role: 'assistant', content: response.content });

      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          addToolPill(TOOL_LABELS[block.name] || block.name);
          hooks.onTool && hooks.onTool(TOOL_LABELS[block.name] || block.name);
          let result;
          try { result = executeTool(block.name, block.input); }
          catch (e) { result = JSON.stringify({ error: String(e) }); }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      conversation.push({ role: 'user', content: results });

      liveBubble = null; // nächste Antwort in neue Bubble
      response = await callClaudeStream(conversation, onText);
      if (liveText) finalText = liveText;
    }

    conversation.push({ role: 'assistant', content: response.content });
    const lastText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (lastText) finalText = lastText;

    if (!liveBubble && !finalText) addBotMessage('Erledigt.');
    return finalText || 'Erledigt.';
  } catch (err) {
    addBotMessage(`⚠️ ${err.message}`);
    while (conversation.length && conversation[conversation.length - 1].role !== 'assistant') conversation.pop();
    return null;
  } finally {
    setOrbState('idle');
    setStatus('Bereit');
  }
}

// ============================================
// Chat-UI
// ============================================

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Minimaler Markdown-Renderer (fett, kursiv, Code, Listen, Links, Absätze)
function renderMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const lines = html.split('\n');
  let out = '', inList = false;
  for (const line of lines) {
    const li = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
    if (li) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += `<li>${li[1]}</li>`;
    } else {
      if (inList) { out += '</ul>'; inList = false; }
      if (line.startsWith('<pre>') || line.includes('</pre>')) out += line;
      else if (line.trim()) out += `<p>${line}</p>`;
    }
  }
  if (inList) out += '</ul>';
  return out;
}

function addMessage(role, html) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatar = role === 'bot'
    ? '<div class="avatar">◉</div>'
    : '<div class="avatar">👤</div>';
  div.innerHTML = `${avatar}<div class="bubble">${html}</div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function addBotMessage(text) { return addMessage('bot', renderMarkdown(text)); }
function addUserMessage(text) { return addMessage('user', `<p>${escapeHtml(text)}</p>`); }

function addToolPill(label) {
  const div = document.createElement('div');
  div.className = 'tool-pill';
  div.textContent = label;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setStatus(text) { document.getElementById('jarvisStatus').textContent = text; }
function setOrbState(state) {
  const orb = document.getElementById('jarvisOrb');
  orb.classList.toggle('thinking', state === 'thinking');
  orb.classList.toggle('listening', state === 'listening');
}

async function handleSend(text) {
  const msg = (text || chatInput.value).trim();
  if (!msg || busy) return;
  chatInput.value = '';

  if (!settings.apiKey) {
    addUserMessage(msg);
    addBotMessage('Mir fehlt noch ein **Anthropic API-Key**, um denken zu können. Bitte über das ⚙️-Symbol oben rechts hinterlegen – er wird nur lokal in deinem Browser gespeichert.');
    openSettings();
    return;
  }

  busy = true;
  document.getElementById('sendBtn').disabled = true;
  addUserMessage(msg);
  const reply = await processMessage(msg);
  busy = false;
  document.getElementById('sendBtn').disabled = false;
  if (reply && settings.tts && !voiceMode) speak(reply);
  chatInput.focus();
}

// ============================================
// Spracherkennung (Eingabe)
// ============================================

let recognition = null;
let recognizing = false;
let speechSupported = false;

function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById('micBtn');
  if (!SR) {
    micBtn.title = 'Spracheingabe wird von diesem Browser nicht unterstützt';
    micBtn.style.opacity = '0.35';
    return;
  }
  speechSupported = true;
  recognition = new SR();
  recognition.lang = 'de-DE';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    if (voiceMode) {
      setVoiceTranscript(transcript, null);
    } else {
      chatInput.value = transcript;
    }
    if (e.results[e.results.length - 1].isFinal) {
      stopListening();
      if (voiceMode) voiceProcess(transcript);
      else handleSend(transcript);
    }
  };
  recognition.onerror = (e) => {
    stopListening();
    if (voiceMode && e.error !== 'not-allowed' && e.error !== 'service-not-allowed') {
      // z.B. "no-speech" → im Sprachmodus einfach weiter zuhören
      scheduleRelisten(700);
    }
  };
  recognition.onend = () => {
    const wasRecognizing = recognizing;
    stopListening();
    if (voiceMode && wasRecognizing && !busy && !speaking) scheduleRelisten(500);
  };

  micBtn.addEventListener('click', () => recognizing ? stopListening() : startListening());
}

let relistenTimer = null;
function scheduleRelisten(ms) {
  clearTimeout(relistenTimer);
  relistenTimer = setTimeout(() => {
    if (voiceMode && !busy && !speaking && !recognizing) startListening();
  }, ms);
}

function startListening() {
  if (!recognition || busy) return;
  window.speechSynthesis?.cancel();
  speaking = false;
  recognizing = true;
  document.getElementById('micBtn').classList.add('recording');
  document.getElementById('voiceTalkBtn').classList.add('recording');
  document.getElementById('voiceTalkBtn').textContent = 'Höre zu … (zum Stoppen tippen)';
  setOrbState('listening');
  setStatus('Höre zu …');
  if (voiceMode) setVoiceState('listening', 'Höre zu …');
  try { recognition.start(); } catch { /* bereits gestartet */ }
}

function stopListening() {
  recognizing = false;
  document.getElementById('micBtn').classList.remove('recording');
  document.getElementById('voiceTalkBtn').classList.remove('recording');
  document.getElementById('voiceTalkBtn').textContent = 'Tippen zum Sprechen';
  setOrbState('idle');
  setStatus('Bereit');
  try { recognition && recognition.stop(); } catch { /* ignore */ }
}

// ============================================
// Sprachausgabe
// ============================================

let speaking = false;

function cleanForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' Codeblock ausgelassen. ')
    .replace(/[*_#`>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();
}

function speak(text, onEnd) {
  if (!window.speechSynthesis || !text) { onEnd && onEnd(); return; }
  window.speechSynthesis.cancel();
  const clean = cleanForSpeech(text);
  if (!clean) { onEnd && onEnd(); return; }
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'de-DE';
  const voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('de'));
  if (voice) utter.voice = voice;
  utter.rate = 1.05;
  speaking = true;
  utter.onend = () => { speaking = false; onEnd && onEnd(); };
  utter.onerror = () => { speaking = false; onEnd && onEnd(); };
  window.speechSynthesis.speak(utter);
}

// ============================================
// Sprachmodus (Hands-free Overlay)
// ============================================

let voiceMode = false;
let audioCtx = null;
let analyser = null;
let micStream = null;
let voiceAnimFrame = null;
let voiceState = 'idle'; // idle | listening | thinking | speaking

const voiceOverlay = document.getElementById('voiceOverlay');

function setVoiceState(state, statusText) {
  voiceState = state;
  voiceOverlay.classList.toggle('listening', state === 'listening');
  voiceOverlay.classList.toggle('thinking', state === 'thinking');
  voiceOverlay.classList.toggle('speaking', state === 'speaking');
  if (statusText !== undefined) document.getElementById('voiceStatus').textContent = statusText;
}

function setVoiceTranscript(userText, jarvisText) {
  const el = document.getElementById('voiceTranscript');
  let html = '';
  if (userText) html += `<span class="vt-user">„${escapeHtml(userText)}“</span>`;
  if (jarvisText) html += `<span class="vt-jarvis">${escapeHtml(jarvisText)}</span>`;
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

async function openVoiceMode() {
  if (!settings.apiKey) { openSettings(); return; }
  if (!speechSupported) {
    addBotMessage('Dein Browser unterstützt leider keine Spracherkennung. Bitte nutze Chrome oder Edge für den Sprachmodus.');
    return;
  }
  voiceMode = true;
  voiceOverlay.classList.add('open');
  setVoiceState('idle', 'Initialisiere …');
  setVoiceTranscript('', '');

  // Mikrofon für Visualisierung (unabhängig von der Spracherkennung)
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    src.connect(analyser);
  } catch {
    analyser = null; // Visualisierung läuft dann synthetisch
  }

  startVoiceVisualizer();
  startListening();
}

function closeVoiceMode() {
  voiceMode = false;
  voiceOverlay.classList.remove('open');
  stopListening();
  clearTimeout(relistenTimer);
  window.speechSynthesis?.cancel();
  speaking = false;
  cancelAnimationFrame(voiceAnimFrame);
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  analyser = null;
}

async function voiceProcess(transcript) {
  const msg = transcript.trim();
  if (!msg || busy) return;
  busy = true;
  addUserMessage(msg);
  setVoiceState('thinking', 'Verarbeite …');
  setVoiceTranscript(msg, null);

  const reply = await processMessage(msg, {
    onTool: (label) => setVoiceState('thinking', label),
    onPartial: (text) => setVoiceTranscript(msg, text.length > 350 ? '…' + text.slice(-350) : text),
  });

  busy = false;
  if (!voiceMode) return;

  if (reply) {
    setVoiceState('speaking', 'Spreche …');
    setVoiceTranscript(msg, reply.length > 350 ? reply.slice(0, 350) + ' …' : reply);
    speak(reply, () => {
      if (voiceMode) { setVoiceState('idle', ''); scheduleRelisten(350); }
    });
  } else {
    setVoiceState('idle', 'Fehler – tippe zum erneuten Sprechen');
  }
}

// Radiale Audio-Visualisierung um den Orb
function startVoiceVisualizer() {
  const canvas = document.getElementById('voiceCanvas');
  const ctx = canvas.getContext('2d');
  const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  let t = 0;

  const resize = () => {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  };
  resize();
  window.addEventListener('resize', resize);

  const BARS = 110;

  const frame = () => {
    if (!voiceMode) return;
    voiceAnimFrame = requestAnimationFrame(frame);
    t += 0.035;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Visualisierung am Orb ausrichten
    const orbEl = document.querySelector('.voice-orb');
    const rect = orbEl.getBoundingClientRect();
    const cx = (rect.x + rect.width / 2) * devicePixelRatio;
    const cy = (rect.y + rect.height / 2) * devicePixelRatio;
    const baseR = (rect.width / 2 + 28) * devicePixelRatio;

    let levels = [];
    let avg = 0;
    if (voiceState === 'listening' && analyser) {
      analyser.getByteFrequencyData(freq);
      for (let i = 0; i < BARS; i++) {
        const v = freq[Math.floor(i / BARS * freq.length * 0.7)] / 255;
        levels.push(v);
        avg += v;
      }
      avg /= BARS;
    } else if (voiceState === 'speaking' || voiceState === 'thinking') {
      const speed = voiceState === 'thinking' ? 2.4 : 1.4;
      for (let i = 0; i < BARS; i++) {
        const v = 0.25 + 0.75 * Math.abs(Math.sin(t * speed + i * 0.55) * Math.sin(t * 0.9 + i * 0.13));
        levels.push(v * 0.55);
      }
      avg = 0.3 + 0.15 * Math.sin(t * 3);
    } else {
      for (let i = 0; i < BARS; i++) {
        levels.push(0.06 + 0.05 * Math.sin(t + i * 0.4));
      }
      avg = 0.05;
    }

    // Orb-Core reagiert auf Lautstärke
    const core = document.querySelector('.voice-orb-core');
    if (core) core.style.transform = `scale(${1 + avg * 0.45})`;

    // Radiale Balken
    const color = voiceState === 'listening' ? '212, 96, 138' : '70, 224, 255';
    for (let i = 0; i < BARS; i++) {
      const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;
      const len = (6 + levels[i] * 85) * devicePixelRatio;
      const x1 = cx + Math.cos(angle) * baseR;
      const y1 = cy + Math.sin(angle) * baseR;
      const x2 = cx + Math.cos(angle) * (baseR + len);
      const y2 = cy + Math.sin(angle) * (baseR + len);
      ctx.strokeStyle = `rgba(${color}, ${0.25 + levels[i] * 0.65})`;
      ctx.lineWidth = 2.4 * devicePixelRatio;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Äußerer Glow-Ring
    ctx.strokeStyle = `rgba(${color}, 0.12)`;
    ctx.lineWidth = 1.5 * devicePixelRatio;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR + (20 + avg * 60) * devicePixelRatio, 0, Math.PI * 2);
    ctx.stroke();
  };
  frame();
}

// ============================================
// HUD-Hintergrund (Partikel)
// ============================================

function startBackground() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];

  const resize = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    const count = Math.min(90, Math.floor(innerWidth / 16));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 0.6 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      a: 0.15 + Math.random() * 0.4,
    }));
  };
  resize();
  window.addEventListener('resize', resize);

  const frame = () => {
    requestAnimationFrame(frame);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      ctx.fillStyle = `rgba(70, 224, 255, ${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Verbindungslinien zwischen nahen Partikeln
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 110 * 110) {
          ctx.strokeStyle = `rgba(70, 224, 255, ${0.06 * (1 - dist2 / (110 * 110))})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  };
  frame();
}

// ============================================
// Boot-Sequenz
// ============================================

function runBootSequence() {
  const overlay = document.getElementById('bootOverlay');
  if (sessionStorage.getItem('jarvis_booted')) {
    overlay.classList.add('hidden');
    return;
  }
  sessionStorage.setItem('jarvis_booted', '1');

  const lines = [
    ['JARVIS KERNSYSTEME WERDEN GESTARTET', false],
    ['Sprachmodul ……………… ONLINE', true],
    ['Projektdatenbank ………… ONLINE', true],
    ['Social-Media-Module …… ONLINE', true],
    ['Dashboard-Synchronisation … OK', true],
    ['ALLE SYSTEME BETRIEBSBEREIT', false],
  ];
  const box = document.getElementById('bootLines');
  let i = 0;
  const next = () => {
    if (i >= lines.length) {
      setTimeout(() => {
        overlay.classList.add('fade');
        setTimeout(() => overlay.classList.add('hidden'), 650);
      }, 450);
      return;
    }
    const div = document.createElement('div');
    if (lines[i][1]) div.classList.add('ok');
    div.textContent = '> ' + lines[i][0];
    box.appendChild(div);
    i++;
    setTimeout(next, 240);
  };
  next();
  overlay.addEventListener('click', () => {
    overlay.classList.add('fade');
    setTimeout(() => overlay.classList.add('hidden'), 650);
  });
}

// ============================================
// Dashboard-Rendering
// ============================================

function badge(status) {
  const cls = ['live', 'aktiv', 'in-arbeit', 'geplant', 'idee', 'pausiert'].includes(status) ? status : 'neutral';
  return `<span class="badge ${cls}">${escapeHtml(status || '–')}</span>`;
}

function fmtNum(n) {
  if (typeof n !== 'number') return n;
  return n.toLocaleString('de-DE');
}

function sparkline(history) {
  if (!history || history.length < 2) return '';
  const values = history.map(h => h.followers);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 100, H = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 3 - ((v - min) / range) * (H - 6)}`);
  return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <polygon class="spark-fill" points="0,${H} ${pts.join(' ')} ${W},${H}"/>
    <polyline points="${pts.join(' ')}"/>
  </svg>`;
}

function channelStatsHtml(c) {
  if (!c.stats) return '';
  const s = c.stats;
  let trendHtml = '';
  if (c.history && c.history.length >= 2) {
    const prev = c.history[c.history.length - 2].followers;
    const curr = c.history[c.history.length - 1].followers;
    const diff = curr - prev;
    if (diff !== 0) {
      const cls = diff > 0 ? 'cs-trend-up' : 'cs-trend-down';
      trendHtml = `<div class="channel-stat"><span class="cs-value ${cls}">${diff > 0 ? '+' : ''}${fmtNum(diff)}</span><span class="cs-label">Veränderung</span></div>`;
    }
  }
  const parts = [];
  if (s.followers !== undefined) parts.push(`<div class="channel-stat"><span class="cs-value">${fmtNum(s.followers)}</span><span class="cs-label">Follower</span></div>`);
  if (trendHtml) parts.push(trendHtml);
  if (s.engagement_rate) parts.push(`<div class="channel-stat"><span class="cs-value">${escapeHtml(String(s.engagement_rate))}</span><span class="cs-label">Engagement</span></div>`);
  if (s.posts_per_week !== undefined) parts.push(`<div class="channel-stat"><span class="cs-value">${fmtNum(s.posts_per_week)}</span><span class="cs-label">Posts/Woche</span></div>`);
  if (s.views !== undefined) parts.push(`<div class="channel-stat"><span class="cs-value">${fmtNum(s.views)}</span><span class="cs-label">Views</span></div>`);
  if (!parts.length) return '';
  return `<div class="channel-stats">${parts.join('')}</div>${sparkline(c.history)}`;
}

function renderDashboard() {
  // Marketing-Stats
  if (articleData) {
    const cats = new Set(articleData.articles.map(a => a.category));
    document.getElementById('dashArticles').textContent = articleData.meta.totalArticles;
    document.getElementById('dashCategories').textContent = cats.size;
    const d = articleData.meta.lastUpdated.split('-');
    document.getElementById('dashUpdated').textContent = `${d[2]}.${d[1]}.${d[0]}`;
  }

  // Kennzahlen
  const metricsSection = document.getElementById('metricsSection');
  if (data.metrics.length) {
    metricsSection.style.display = '';
    document.getElementById('metricCards').innerHTML = data.metrics.map(m => `
      <div class="stat-card metric-card">
        <span class="stat-value small">${escapeHtml(m.value)}${m.unit ? ' ' + escapeHtml(m.unit) : ''}</span>
        <span class="stat-label">${escapeHtml(m.label)}</span>
        ${m.trend ? `<span class="metric-trend ${/^[+▲↑]|steig/i.test(m.trend) ? 'cs-trend-up' : /^[-▼↓]|fall|sink/i.test(m.trend) ? 'cs-trend-down' : ''}">${escapeHtml(m.trend)}</span>` : ''}
      </div>
    `).join('');
  } else {
    metricsSection.style.display = 'none';
  }

  // Projekte
  document.getElementById('projectCards').innerHTML = data.projects.map(p => `
    <div class="dash-card">
      <div class="dash-card-head">
        <div>
          <div class="dash-card-title">${escapeHtml(p.name)}</div>
          <div class="dash-card-sub">${escapeHtml(p.type || '')}</div>
        </div>
        ${badge(p.status)}
      </div>
      ${typeof p.progress === 'number' ? `<div class="progress-bar"><div class="progress-fill" style="width:${p.progress}%"></div></div>` : ''}
      ${p.notes ? `<div class="dash-card-notes">${escapeHtml(p.notes)}</div>` : ''}
    </div>
  `).join('') || '<p class="empty-hint">Noch keine Projekte.</p>';

  // Kanäle
  document.getElementById('channelCards').innerHTML = data.channels.map(c => `
    <div class="dash-card">
      <div class="dash-card-head">
        <div>
          <div class="dash-card-title">${escapeHtml(c.platform)}</div>
          <div class="dash-card-sub">${escapeHtml(c.handle || 'Handle nicht hinterlegt')} ${c.focus ? '· ' + escapeHtml(c.focus) : ''}</div>
        </div>
        ${c.stats && c.stats.updatedAt ? `<span class="badge neutral">${escapeHtml(c.stats.updatedAt.split('-').reverse().join('.'))}</span>` : ''}
      </div>
      ${channelStatsHtml(c)}
      ${c.notes ? `<div class="dash-card-notes">${escapeHtml(c.notes)}</div>` : ''}
    </div>
  `).join('') || '<p class="empty-hint">Noch keine Kanäle.</p>';

  // Aufgaben
  const openTasks = data.tasks.filter(t => !t.done);
  const doneTasks = data.tasks.filter(t => t.done).slice(-3);
  document.getElementById('taskList').innerHTML = [...openTasks, ...doneTasks].map(t => {
    const project = t.projectId ? data.projects.find(p => p.id === t.projectId) : null;
    return `
    <div class="task-item ${t.done ? 'done' : ''}">
      <span class="task-check">${t.done ? '✔' : '○'}</span>
      <div>
        <div class="task-text">${escapeHtml(t.title)}</div>
        ${(project || t.due) ? `<div class="task-meta">${project ? escapeHtml(project.name) : ''}${project && t.due ? ' · ' : ''}${t.due ? 'fällig: ' + escapeHtml(t.due) : ''}</div>` : ''}
      </div>
    </div>`;
  }).join('') || '<p class="empty-hint">Keine Aufgaben – sag Jarvis, was ansteht.</p>';

  // Entwürfe
  document.getElementById('draftList').innerHTML = data.drafts.slice(0, 5).map(d => {
    const channel = data.channels.find(c => c.id === d.channelId);
    return `
    <div class="dash-card draft-card">
      <div class="dash-card-head">
        <div class="dash-card-title">${escapeHtml(d.topic)}</div>
        <span class="badge neutral">${escapeHtml(channel ? channel.platform : d.channelId)}</span>
      </div>
      <div class="draft-content">${escapeHtml(d.content)}</div>
    </div>`;
  }).join('') || '<p class="empty-hint">Noch keine Post-Entwürfe.</p>';

  // Notizen
  document.getElementById('noteList').innerHTML = data.notes.slice(0, 8).map(n =>
    `<div class="note-item">${escapeHtml(n.text)}</div>`
  ).join('') || '<p class="empty-hint">Keine Notizen.</p>';

  // Wissensspeicher
  document.getElementById('knowledgeList').innerHTML = data.knowledge.slice(0, 12).map(k => `
    <div class="knowledge-item">
      <div class="k-topic">${escapeHtml(k.topic)}</div>
      <div class="k-content">${escapeHtml(k.content)}</div>
    </div>
  `).join('') || '<p class="empty-hint">Noch leer – erzähl Jarvis von deinen Projekten, er merkt sich die Fakten.</p>';
}

// ============================================
// Einstellungen
// ============================================

function openSettings() {
  document.getElementById('apiKeyInput').value = settings.apiKey;
  document.getElementById('modelSelect').value = settings.model;
  document.getElementById('ttsCheckbox').checked = settings.tts;
  document.getElementById('contextInput').value = settings.context || '';
  document.getElementById('settingsModal').classList.add('open');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('open');
}

function initSettings() {
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });
  document.getElementById('saveSettings').addEventListener('click', () => {
    settings.apiKey = document.getElementById('apiKeyInput').value.trim();
    settings.model = document.getElementById('modelSelect').value;
    settings.tts = document.getElementById('ttsCheckbox').checked;
    settings.context = document.getElementById('contextInput').value;
    saveSettings();
    updateTtsButton();
    closeSettings();
    addBotMessage('Einstellungen gespeichert. ✓');
  });
  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (!confirm('Alle Dashboard-Daten (Projekte, Aufgaben, Notizen, Entwürfe, Statistiken, Wissen) auf den Ausgangszustand zurücksetzen?')) return;
    data = structuredClone(DEFAULT_DATA);
    saveData();
    renderDashboard();
    closeSettings();
  });
}

function updateTtsButton() {
  document.getElementById('voiceOutputBtn').classList.toggle('active', settings.tts);
}

// ============================================
// Init
// ============================================

async function init() {
  runBootSequence();
  startBackground();

  // Artikeldaten der Marketing Suite laden
  try {
    const res = await fetch('articles.json');
    articleData = await res.json();
  } catch (e) {
    console.error('Artikeldaten konnten nicht geladen werden:', e);
  }

  renderDashboard();
  initSpeech();
  initSettings();
  updateTtsButton();

  // Auf Mobilgeräten startet das Dashboard eingeklappt (Chat im Fokus)
  if (window.innerWidth <= 900) document.getElementById('dashboardPanel').classList.add('hidden');

  // Events
  document.getElementById('sendBtn').addEventListener('click', () => handleSend());
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend(); });
  document.querySelectorAll('.chip').forEach(chip =>
    chip.addEventListener('click', () => handleSend(chip.dataset.query))
  );
  document.getElementById('dashboardToggle').addEventListener('click', () =>
    document.getElementById('dashboardPanel').classList.toggle('hidden')
  );
  document.getElementById('voiceOutputBtn').addEventListener('click', () => {
    settings.tts = !settings.tts;
    saveSettings();
    updateTtsButton();
    if (!settings.tts) window.speechSynthesis?.cancel();
  });
  document.getElementById('voiceModeBtn').addEventListener('click', openVoiceMode);
  document.getElementById('voiceClose').addEventListener('click', closeVoiceMode);
  document.getElementById('voiceTalkBtn').addEventListener('click', () => {
    if (recognizing) stopListening();
    else if (!busy && !speaking) startListening();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && voiceMode) closeVoiceMode();
  });

  // Begrüßung
  const greeting = settings.apiKey
    ? '<p>Guten Tag. <strong>J.A.R.V.I.S. online.</strong> Alle Systeme betriebsbereit.</p><p>Ich kenne deine Projekte – die <strong>Marketing Suite</strong>, die <strong>Peptidseite</strong> und deine <strong>Romane</strong> – sowie deine Social-Media-Kanäle samt Statistiken. Starte den <strong>◎ Sprachmodus</strong> für ein freihändiges Gespräch oder schreib mir, was ansteht.</p>'
    : '<p>Guten Tag. <strong>J.A.R.V.I.S. hier</strong> – fast einsatzbereit.</p><p>Damit ich denken kann, brauche ich einmalig deinen <strong>Anthropic API-Key</strong> (⚙️ oben rechts, wird nur lokal im Browser gespeichert). Danach kannst du mit mir per <strong>Sprachmodus</strong> freihändig sprechen, deine Projekte besprechen, Dashboards aktualisieren und deine Social-Media-Statistiken verwalten. 🎤</p>';
  addMessage('bot', greeting);

  // Stimmen vorladen (manche Browser laden sie asynchron)
  window.speechSynthesis?.getVoices();

  chatInput.focus();
}

document.addEventListener('DOMContentLoaded', init);
