/* ============================================
   J.A.R.V.I.S. – Kommandozentrale
   Claude-gestützter Assistent für Projekte,
   Dashboards & Social Media
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
    { id: 'instagram', platform: 'Instagram', handle: '', focus: 'Reels & Stories', notes: '' },
    { id: 'tiktok', platform: 'TikTok', handle: '', focus: 'Kurzvideos', notes: '' },
    { id: 'youtube', platform: 'YouTube', handle: '', focus: 'Längere Formate', notes: '' },
    { id: 'facebook', platform: 'Facebook', handle: '', focus: 'Community', notes: '' },
  ],
  tasks: [],   // {id, projectId, title, due, done, createdAt}
  drafts: [],  // {id, channelId, topic, content, createdAt}
  notes: [],   // {id, text, createdAt}
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

// ============================================
// Tools – Definitionen für Claude
// ============================================

const TOOLS = [
  {
    name: 'get_overview',
    description: 'Liefert den kompletten aktuellen Zustand der Kommandozentrale: alle Projekte (inkl. Status, Fortschritt, Notizen), Social-Media-Kanäle, offene Aufgaben, Post-Entwürfe, Notizen und die Marketing-Suite-Statistiken. Rufe dieses Tool auf, wenn du aktuellen Kontext über die Projekte des Nutzers brauchst.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
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
    description: 'Aktualisiert einen Social-Media-Kanal (Handle/Accountname, inhaltlicher Fokus, Notizen wie Posting-Plan oder Follower-Stand).',
    input_schema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'ID des Kanals: "instagram", "tiktok", "youtube", "facebook" – oder ID eines selbst angelegten Kanals' },
        handle: { type: 'string', description: 'Accountname, z.B. "@meinaccount"' },
        focus: { type: 'string', description: 'Inhaltlicher Fokus des Kanals' },
        notes: { type: 'string', description: 'Notizen (Posting-Plan, Follower, Ideen)' },
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
    name: 'delete_item',
    description: 'Löscht ein Element aus dem Dashboard: eine Aufgabe, einen Post-Entwurf, eine Notiz oder ein Projekt.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['task', 'draft', 'note', 'project', 'channel'] },
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
  el.querySelectorAll('.dash-card, .task-item, .note-item').forEach(c => c.classList.add('flash'));
  setTimeout(() => el.querySelectorAll('.flash').forEach(c => c.classList.remove('flash')), 1200);
}

function executeTool(name, input) {
  switch (name) {
    case 'get_overview':
      return JSON.stringify({
        projects: data.projects,
        social_channels: data.channels,
        tasks: data.tasks,
        post_drafts: data.drafts.map(d => ({ id: d.id, channelId: d.channelId, topic: d.topic })),
        notes: data.notes,
        marketing_suite: marketingStats(),
        heute: new Date().toISOString().slice(0, 10),
      });

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
        c = { id: input.channel_id, platform: input.platform, handle: '', focus: '', notes: '' };
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

    case 'delete_item': {
      const lists = { task: 'tasks', draft: 'drafts', note: 'notes', project: 'projects', channel: 'channels' };
      const list = data[lists[input.kind]];
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
// Claude API
// ============================================

const TOOL_LABELS = {
  get_overview: 'Lese Projektübersicht …',
  get_marketing_stats: 'Lese Marketing-Statistiken …',
  search_articles: 'Durchsuche Produktkatalog …',
  update_project: 'Aktualisiere Projekt-Dashboard …',
  add_project: 'Lege neues Projekt an …',
  update_social_channel: 'Aktualisiere Social-Kanal …',
  save_social_draft: 'Speichere Post-Entwurf …',
  add_task: 'Lege Aufgabe an …',
  complete_task: 'Hake Aufgabe ab …',
  delete_item: 'Lösche Element …',
  add_note: 'Hefte Notiz an …',
};

function buildSystemPrompt() {
  return `Du bist J.A.R.V.I.S. – die persönliche KI-Kommandozentrale von Marc. Du sprichst Deutsch, bist präzise, proaktiv und hast einen Hauch trockenen britischen Butler-Humor (dezent, nie albern).

Deine Aufgaben:
1. **Projekte besprechen & steuern**: Marc betreibt mehrere Projekte – die Jean&Len Marketing Suite (dieses Dashboard, Produktkatalog mit Auto-Sync), die Peptidseite (Onlineprojekt) und seine Romane (Schreibprojekte). Du kennst den Stand über das Tool get_overview und hältst das Dashboard über update_project aktuell.
2. **Dashboard pflegen**: Wenn Marc etwas berichtet ("Peptidseite ist zu 80% fertig", "neues Kapitel geschrieben"), aktualisiere SOFORT das Dashboard mit den passenden Tools – nicht nur darüber reden.
3. **Social Media**: Du kennst seine Kanäle (update_social_channel zum Pflegen). Du hilfst bei Content-Ideen, Posting-Plänen und entwirfst Posts/Captions/Reel-Skripte. Fertige Entwürfe speicherst du mit save_social_draft ins Dashboard.
4. **Aufgaben & Notizen**: Halte To-dos (add_task/complete_task) und wichtige Notizen (add_note) fest, wenn sich aus dem Gespräch etwas ergibt.
5. **Produktkatalog**: Bei Fragen zu Jean&Len-Artikeln nutze search_articles.

Verhalten:
- Rufe get_overview auf, bevor du Fragen zum Projektstand beantwortest – rate nicht.
- Wenn Marc einen neuen Stand oder eine Entscheidung mitteilt, persistiere sie über die Tools, damit nichts verloren geht.
- Antworte kompakt und handlungsorientiert. Nutze kurze Absätze oder Listen, kein unnötiges Gerede.
- Bei Sprachausgabe-tauglichen Antworten: keine übermäßige Formatierung.
- Wenn Informationen fehlen (z.B. Social-Media-Handles noch leer), frag nach und speichere die Antwort.

Heute ist der ${new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
}

async function callClaude(messages) {
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
  return res.json();
}

async function sendToJarvis(userText) {
  conversation.push({ role: 'user', content: userText });

  // Verlauf begrenzen, damit Requests nicht unbegrenzt wachsen
  if (conversation.length > 40) conversation = conversation.slice(-30);

  const typingEl = addTyping();
  setOrbState('thinking');
  setStatus('Denke nach …');

  try {
    let response = await callClaude(conversation);
    let rounds = 0;

    // Tool-Use-Schleife
    while (response.stop_reason === 'tool_use' && rounds < 10) {
      rounds++;
      conversation.push({ role: 'assistant', content: response.content });

      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          addToolPill(TOOL_LABELS[block.name] || block.name);
          let result;
          try { result = executeTool(block.name, block.input); }
          catch (e) { result = JSON.stringify({ error: String(e) }); }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      conversation.push({ role: 'user', content: results });
      response = await callClaude(conversation);
    }

    conversation.push({ role: 'assistant', content: response.content });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

    typingEl.remove();
    addBotMessage(text || 'Erledigt.');
    if (settings.tts) speak(text);
  } catch (err) {
    typingEl.remove();
    addBotMessage(`⚠️ ${err.message}`);
    // Fehlgeschlagenen Turn aus dem Verlauf entfernen, damit die Historie konsistent bleibt
    while (conversation.length && conversation[conversation.length - 1].role !== 'assistant') conversation.pop();
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

function addTyping() {
  return addMessage('bot', '<span class="typing-dots"><span></span><span></span><span></span></span>');
}

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
  await sendToJarvis(msg);
  busy = false;
  document.getElementById('sendBtn').disabled = false;
  chatInput.focus();
}

// ============================================
// Spracheingabe & -ausgabe
// ============================================

let recognition = null;
let recognizing = false;

function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById('micBtn');
  if (!SR) {
    micBtn.title = 'Spracheingabe wird von diesem Browser nicht unterstützt';
    micBtn.style.opacity = '0.35';
    return;
  }
  recognition = new SR();
  recognition.lang = 'de-DE';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    chatInput.value = transcript;
    if (e.results[e.results.length - 1].isFinal) {
      stopListening();
      handleSend(transcript);
    }
  };
  recognition.onerror = () => stopListening();
  recognition.onend = () => stopListening();

  micBtn.addEventListener('click', () => recognizing ? stopListening() : startListening());
}

function startListening() {
  if (!recognition || busy) return;
  window.speechSynthesis?.cancel();
  recognizing = true;
  document.getElementById('micBtn').classList.add('recording');
  setOrbState('listening');
  setStatus('Höre zu …');
  try { recognition.start(); } catch { /* bereits gestartet */ }
}

function stopListening() {
  if (!recognizing) return;
  recognizing = false;
  document.getElementById('micBtn').classList.remove('recording');
  setOrbState('idle');
  setStatus('Bereit');
  try { recognition.stop(); } catch { /* ignore */ }
}

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  // Markdown & Emojis für die Sprachausgabe entfernen
  const clean = text
    .replace(/```[\s\S]*?```/g, ' Codeblock ausgelassen. ')
    .replace(/[*_#`>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'de-DE';
  const voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('de'));
  if (voice) utter.voice = voice;
  utter.rate = 1.05;
  window.speechSynthesis.speak(utter);
}

// ============================================
// Dashboard-Rendering
// ============================================

function badge(status) {
  const cls = ['live', 'aktiv', 'in-arbeit', 'geplant', 'idee', 'pausiert'].includes(status) ? status : 'neutral';
  return `<span class="badge ${cls}">${escapeHtml(status || '–')}</span>`;
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
      </div>
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
}

// ============================================
// Einstellungen
// ============================================

function openSettings() {
  document.getElementById('apiKeyInput').value = settings.apiKey;
  document.getElementById('modelSelect').value = settings.model;
  document.getElementById('ttsCheckbox').checked = settings.tts;
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
    saveSettings();
    updateTtsButton();
    closeSettings();
    addBotMessage('Einstellungen gespeichert. ✓');
  });
  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (!confirm('Alle Dashboard-Daten (Projekte, Aufgaben, Notizen, Entwürfe) auf den Ausgangszustand zurücksetzen?')) return;
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

  // Begrüßung
  const greeting = settings.apiKey
    ? '<p>Guten Tag. <strong>J.A.R.V.I.S. online.</strong> Alle Systeme betriebsbereit.</p><p>Ich kenne deine Projekte – die <strong>Marketing Suite</strong>, die <strong>Peptidseite</strong> und deine <strong>Romane</strong> – sowie deine Social-Media-Kanäle. Sag mir, was ansteht: Status besprechen, Dashboard aktualisieren, Posts entwerfen oder Aufgaben planen.</p>'
    : '<p>Guten Tag. <strong>J.A.R.V.I.S. hier</strong> – fast einsatzbereit.</p><p>Damit ich denken kann, brauche ich einmalig deinen <strong>Anthropic API-Key</strong> (⚙️ oben rechts, wird nur lokal im Browser gespeichert). Danach kannst du mit mir deine Projekte besprechen, das Dashboard steuern und Social-Media-Posts entwerfen – auf Wunsch per Sprache. 🎤</p>';
  addMessage('bot', greeting);

  // Stimmen vorladen (manche Browser laden sie asynchron)
  window.speechSynthesis?.getVoices();

  chatInput.focus();
}

document.addEventListener('DOMContentLoaded', init);
