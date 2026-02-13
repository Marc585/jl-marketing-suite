/* ============================================
   Jean&Len Marketing Suite – Artikelsuche
   Smart Search mit Synonym-Matching
   ============================================ */

let articleData = null;

// German stopwords – comprehensive list of function words, pronouns, verbs
const STOPWORDS = new Set([
  // Artikel & Demonstrativpronomen
  'der', 'die', 'das', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'den', 'dem', 'des', 'dieses', 'dieser', 'diese', 'diesen', 'diesem',
  'jede', 'jeder', 'jedes', 'jeden', 'jedem', 'jene', 'jener', 'jenes', 'jenen', 'jenem',
  'solche', 'solcher', 'solches', 'solchen', 'solchem',
  // Personalpronomen (alle Kasus)
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man',
  'mich', 'dich', 'sich', 'uns', 'euch', 'ihn', 'ihm',
  // Possessivpronomen (alle Deklinationen)
  'mein', 'meine', 'meiner', 'meinem', 'meinen', 'meines',
  'dein', 'deine', 'deiner', 'deinem', 'deinen', 'deines',
  'sein', 'seine', 'seiner', 'seinem', 'seinen', 'seines',
  'unser', 'unsere', 'unserer', 'unserem', 'unseren', 'unseres',
  'euer', 'eure', 'eurer', 'eurem', 'euren', 'eures',
  'ihr', 'ihre', 'ihrer', 'ihrem', 'ihren', 'ihres',
  // Relativ- & Fragepronomen
  'welche', 'welcher', 'welches', 'welchen', 'welchem',
  'wer', 'was', 'wie', 'wo', 'wann', 'warum', 'woher', 'wohin', 'wozu',
  'wofür', 'womit', 'worüber', 'wonach', 'wovon', 'deren', 'dessen',
  // Präpositionen
  'für', 'von', 'mit', 'zu', 'im', 'in', 'am', 'an', 'auf', 'aus',
  'bei', 'nach', 'vor', 'über', 'unter', 'zwischen', 'durch', 'um',
  'ohne', 'gegen', 'bis', 'seit', 'während', 'wegen', 'trotz', 'statt',
  'anstatt', 'außer', 'samt', 'nebst', 'gemäß', 'laut', 'entlang',
  // Konjunktionen
  'und', 'oder', 'aber', 'doch', 'denn', 'wenn', 'als', 'ob', 'dass',
  'weil', 'da', 'obwohl', 'damit', 'sodass', 'sowohl', 'weder', 'noch',
  'sondern', 'jedoch', 'bevor', 'nachdem', 'sobald', 'solange', 'falls',
  // Hilfsverben & Modalverben (alle gängigen Formen)
  'ist', 'sind', 'bin', 'bist', 'war', 'wars', 'waren', 'warst', 'wäre', 'wären',
  'sei', 'seien', 'gewesen',
  'haben', 'hat', 'hast', 'hatte', 'hatten', 'hätte', 'hätten', 'habe', 'hab',
  'wird', 'werden', 'wurde', 'würde', 'würden', 'worden',
  'kann', 'kannst', 'können', 'könnte', 'könnten', 'kannste', 'könntest',
  'muss', 'müssen', 'musst', 'müsste', 'müssten',
  'soll', 'sollen', 'sollst', 'sollte', 'sollten',
  'will', 'wollen', 'willst', 'wollte', 'wollten',
  'darf', 'dürfen', 'darfst', 'dürfte', 'dürften',
  'möchte', 'möchten', 'möchtest', 'mag', 'mögen',
  // Negation
  'nicht', 'kein', 'keine', 'keiner', 'keines', 'keinem', 'keinen', 'nichts',
  // Adverbien & Partikel
  'so', 'also', 'noch', 'auch', 'schon', 'mal', 'nur', 'dann', 'gleich',
  'ganz', 'gar', 'sehr', 'ziemlich', 'recht', 'eher', 'fast', 'wohl',
  'gerade', 'eigentlich', 'genau', 'eben', 'hier', 'dort', 'gern', 'gerne',
  'bereits', 'immer', 'nie', 'niemals', 'nochmal',
  'jetzt', 'heute', 'nun', 'derzeit', 'aktuell', 'momentan', 'zurzeit',
  'bisher', 'davor', 'danach', 'dabei', 'daran', 'darin', 'daraus',
  'dazu', 'davon', 'darüber', 'darunter', 'dafür', 'dagegen',
  'viel', 'viele', 'vielen', 'mehr', 'etwas', 'alles', 'alle',
  // Auffordernde / fragende Verben & Chat-typische Wörter
  'bitte', 'gib', 'mir', 'zeig', 'zeige', 'sag', 'sage', 'nenn', 'nenne',
  'suche', 'such', 'finde', 'find', 'mache', 'brauche', 'brauch', 'bräuchte',
  'brauchen', 'benötige', 'benötigen', 'weiß', 'wissen', 'sagen', 'heissen',
  'heißen', 'heißt',
  // Artikelsuche-spezifische Wörter
  'liste', 'artikelnummern', 'artikelnummer', 'artikel', 'nummer', 'nummern',
  'bereich', 'produkte', 'produkten', 'produkt', 'sachen', 'sache',
  'infos', 'info', 'ergebnis', 'ergebnisse', 'übersicht',
  'gibt', 'gibt\'s', 'gibs', 'gibts',
]);

// Greeting patterns
const GREETINGS = ['hallo', 'hi', 'hey', 'moin', 'guten morgen', 'guten tag', 'servus', 'grüß dich', 'huhu', 'na', 'tach'];

// "Show all" patterns
const SHOW_ALL_PATTERNS = ['alle kategorien', 'kategorien', 'übersicht', 'gesamtübersicht', 'komplette liste', 'alles zeigen', 'was gibt es', 'was habt ihr', 'was haben wir', 'welche kategorien'];

// "Show everything" patterns
const SHOW_EVERYTHING = ['alle artikel', 'alles', 'kompletter katalog', 'gesamter katalog', 'alles anzeigen', 'alle produkte'];

// Help patterns
const HELP_PATTERNS = ['hilfe', 'help', 'wie funktioniert', 'was kann', 'was kannst'];

// ============================================
// Initialization
// ============================================

async function init() {
  try {
    const response = await fetch('articles.json');
    articleData = await response.json();

    // Update UI with real data
    const categories = [...new Set(articleData.articles.map(a => a.category))];
    document.getElementById('dataDate').textContent = formatDate(articleData.meta.lastUpdated);
    document.getElementById('articleCount').textContent = `${articleData.meta.totalArticles} Artikel`;
    document.getElementById('categoryCount').textContent = `${categories.length} Kategorien`;
    document.getElementById('statArticles').textContent = articleData.meta.totalArticles;
    document.getElementById('statCategories').textContent = categories.length;
  } catch (error) {
    console.error('Fehler beim Laden der Artikeldaten:', error);
    addBotMessage('Entschuldigung, ich konnte die Artikeldaten nicht laden. Bitte prüfe, ob die Datei articles.json vorhanden ist.');
  }

  setupEventListeners();
}

function formatDate(dateStr) {
  const parts = dateStr.split('-');
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  // Send message
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // Quick action chips
  document.querySelectorAll('.chip[data-query]').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.query;
      sendMessage();
    });
  });

  // Mobile sidebar toggle
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  });

  // Focus input on load
  input.focus();
}

// ============================================
// Chat Functions
// ============================================

function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  // Add user message
  addUserMessage(text);
  input.value = '';

  // Show typing indicator
  const typingId = showTyping();

  // Process with small delay for UX
  setTimeout(() => {
    removeTyping(typingId);
    processQuery(text);
  }, 400 + Math.random() * 400);
}

function addUserMessage(text) {
  const container = document.getElementById('chatMessages');
  const msg = document.createElement('div');
  msg.className = 'message user';
  msg.innerHTML = `
    <div class="avatar">N</div>
    <div class="bubble">
      <div class="bubble-content">${escapeHtml(text)}</div>
    </div>
  `;
  container.appendChild(msg);
  scrollToBottom();
}

function addBotMessage(html) {
  const container = document.getElementById('chatMessages');
  const msg = document.createElement('div');
  msg.className = 'message bot';
  msg.innerHTML = `
    <div class="avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    </div>
    <div class="bubble">
      <div class="bubble-content">${html}</div>
    </div>
  `;
  container.appendChild(msg);

  // Attach event listeners for any interactive elements in the message
  msg.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => copyArticles(btn));
  });

  msg.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      document.getElementById('chatInput').value = card.dataset.category;
      sendMessage();
    });
  });

  msg.querySelectorAll('.suggestions button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('chatInput').value = btn.textContent;
      sendMessage();
    });
  });

  scrollToBottom();
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const id = 'typing-' + Date.now();
  const msg = document.createElement('div');
  msg.className = 'message bot';
  msg.id = id;
  msg.innerHTML = `
    <div class="avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    </div>
    <div class="bubble">
      <div class="typing-indicator">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>
  `;
  container.appendChild(msg);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Query Processing
// ============================================

function processQuery(query) {
  if (!articleData) {
    addBotMessage('Die Artikeldaten sind noch nicht geladen. Bitte warte einen Moment und versuch es erneut.');
    return;
  }

  const queryLower = query.toLowerCase().trim();

  // Check for greetings
  if (GREETINGS.some(g => queryLower === g || queryLower.startsWith(g + ' ') || queryLower.startsWith(g + '!'))) {
    addBotMessage(`Hallo! Wie kann ich dir helfen? Frag mich einfach nach Artikelnummern oder Produktkategorien.`);
    return;
  }

  // Check for help
  if (HELP_PATTERNS.some(p => queryLower.includes(p))) {
    addBotMessage(getHelpMessage());
    return;
  }

  // Check for "show all categories"
  if (SHOW_ALL_PATTERNS.some(p => queryLower.includes(p))) {
    showCategoryOverview();
    return;
  }

  // Check for "show everything"
  if (SHOW_EVERYTHING.some(p => queryLower === p)) {
    addBotMessage(`Das wären ${articleData.meta.totalArticles} Artikel – das wird etwas unübersichtlich. Frag mich lieber nach einer bestimmten Kategorie oder einem Produktnamen. Oder klick auf <strong>Alle Kategorien</strong> für eine Übersicht.`);
    return;
  }

  // Check for direct SKU lookup
  const skuMatch = queryLower.match(/\b(\d{6,})\b/);
  if (skuMatch) {
    const results = articleData.articles.filter(a => a.sku.includes(skuMatch[1]));
    if (results.length > 0) {
      showArticleResults(results, `Artikel mit Nr. „${skuMatch[1]}"`, true);
      return;
    }
  }

  // Smart search
  const results = smartSearch(queryLower);

  if (results.articles.length > 0) {
    showArticleResults(results.articles, results.label, results.showCategory);
  } else {
    showNoResults(query);
  }
}

function depluralize(word) {
  // German depluralization: returns array of possible singular forms
  const forms = [word];
  if (word.endsWith('en')) forms.push(word.slice(0, -2));
  if (word.endsWith('e')) forms.push(word.slice(0, -1));
  if (word.endsWith('n')) forms.push(word.slice(0, -1));
  if (word.endsWith('s')) forms.push(word.slice(0, -1));
  if (word.endsWith('er')) forms.push(word.slice(0, -2));
  // Umlaute rückverwandeln (Häuser→Haus doesn't apply here, but Gele→Gel etc.)
  return [...new Set(forms.filter(f => f.length >= 2))];
}

function smartSearch(queryLower) {
  // 1. Extract meaningful tokens
  const tokens = queryLower
    .replace(/[?!.,;:"""„]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));

  const queryClean = tokens.join(' ');

  if (tokens.length === 0) {
    return { articles: [], label: '', showCategory: false };
  }

  // Build expanded token list with depluralized forms
  const expandedTokens = [];
  for (const token of tokens) {
    expandedTokens.push(...depluralize(token));
  }

  // Compact query (no spaces) for compound word matching
  const queryCompact = tokens.join('');

  // 2. Score-based name search (direkt + compound, OHNE reverse compound)
  const scored = [];
  for (const article of articleData.articles) {
    const nameLower = article.name.toLowerCase();
    const nameCompact = nameLower.replace(/[\s/,()-]+/g, '');
    let score = 0;

    for (const token of tokens) {
      const forms = depluralize(token);
      if (forms.some(form => nameLower.includes(form))) score++;
    }

    // Compound word match: "bodylotion" matches "body lotion"
    if (score < tokens.length && queryCompact.length >= 4) {
      if (nameCompact.includes(queryCompact)) {
        score = tokens.length;
      }
    }

    if (score > 0) {
      scored.push({ article, score });
    }
  }

  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score || a.article.name.localeCompare(b.article.name));
    const maxScore = scored[0].score;
    const minScore = tokens.length === 1 ? 1 : Math.ceil(tokens.length / 2);

    if (maxScore >= minScore) {
      let topResults = scored.filter(s => s.score === maxScore).map(s => s.article);

      // Bei Einwort-Suche mit wenigen Treffern: Kategorie-Match könnte besser sein
      // "Handseife" → 2 Name-Treffer, aber Kategorie "Handseifen" hat 12
      // Nur weitersuchen lassen, nicht sofort zurückgeben
      if (tokens.length === 1 && topResults.length <= 5) {
        // Merken für später, aber erst Kategorie-Keywords prüfen
        // Falls Kategorie mehr Treffer hat, wird diese bevorzugt
      } else {
        if (topResults.length > 40) topResults = topResults.slice(0, 40);

        const label = tokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
        const matchInfo = maxScore === tokens.length
          ? '' : ` (beste Treffer: ${maxScore}/${tokens.length} Begriffe)`;
        return {
          articles: topResults,
          label: label + matchInfo,
          showCategory: new Set(topResults.map(a => a.category)).size > 1
        };
      }
    }
  }

  // 3. Subcategory name match (for generic terms like "Sets", "Deos")
  const subcategories = [...new Set(articleData.articles.map(a => a.subcategory).filter(Boolean))];
  for (const subCat of subcategories) {
    const subLower = subCat.toLowerCase();
    if (queryClean === subLower || expandedTokens.some(t => t === subLower)) {
      const subResults = articleData.articles.filter(a => a.subcategory === subCat);
      return { articles: subResults, label: subCat, showCategory: false };
    }
  }

  // 4. Category keyword matches
  let bestCategoryMatch = null;
  let bestCategoryScore = 0;

  for (const [category, keywords] of Object.entries(articleData.categoryKeywords)) {
    const catLower = category.toLowerCase();
    if (queryClean === catLower || expandedTokens.some(t => t === catLower)) {
      const score = category.length + 10;
      if (score > bestCategoryScore) {
        bestCategoryScore = score;
        bestCategoryMatch = category;
      }
    }
    for (const keyword of keywords) {
      if (expandedTokens.some(t => t === keyword) || queryClean === keyword) {
        const score = keyword.length;
        if (score > bestCategoryScore) {
          bestCategoryScore = score;
          bestCategoryMatch = category;
        }
      }
    }
  }

  if (bestCategoryMatch) {
    let catArticles;
    let label = bestCategoryMatch;
    if (bestCategoryMatch.includes(' > ')) {
      const [mainCat, subCat] = bestCategoryMatch.split(' > ');
      catArticles = articleData.articles.filter(a =>
        a.category === mainCat && a.subcategory === subCat
      );
      label = subCat;
    } else {
      catArticles = articleData.articles.filter(a => a.category === bestCategoryMatch);
    }

    // Kategorie-Ergebnis mit Reverse-Compound-Treffern ergänzen
    // "lippenpflege" → Kategorie "Pflege > Lippen" (3 Artikel) + Name-Match auf "lip" (6 Lip Balms)
    if (tokens.length === 1 && tokens[0].length >= 6) {
      const token = tokens[0];
      const reverseMatches = articleData.articles.filter(a => {
        if (catArticles.includes(a)) return false; // schon drin
        const parts = a.name.toLowerCase().split(/[\s/,()&]+/).filter(p => p.length >= 3);
        return parts.some(part => token.startsWith(part));
      });
      if (reverseMatches.length > 0 && reverseMatches.length <= 20) {
        catArticles = [...catArticles, ...reverseMatches];
        catArticles.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    return { articles: catArticles, label, showCategory: false };
  }

  // 5. Reverse compound als eigenständiger Fallback
  // "lippenpflege" → Artikelnamen mit "lip" am Token-Anfang
  if (tokens.length === 1 && tokens[0].length >= 6) {
    const token = tokens[0];
    const reverseResults = articleData.articles.filter(a => {
      const parts = a.name.toLowerCase().split(/[\s/,()&]+/).filter(p => p.length >= 3);
      return parts.some(part => token.startsWith(part));
    });
    if (reverseResults.length > 0 && reverseResults.length <= 25) {
      const label = token.charAt(0).toUpperCase() + token.slice(1);
      return {
        articles: reverseResults,
        label,
        showCategory: new Set(reverseResults.map(a => a.category)).size > 1
      };
    }
  }

  // 6. Fuzzy match with Levenshtein distance (typo tolerance)
  const fuzzyScored = [];
  for (const article of articleData.articles) {
    const nameParts = article.name.toLowerCase().split(/[\s/,()]+/);
    let fuzzyScore = 0;
    for (const token of tokens) {
      for (const part of nameParts) {
        if (part.length >= 3 && token.length >= 3 && levenshtein(token, part) <= 1) {
          fuzzyScore++;
          break;
        }
      }
    }
    if (fuzzyScore > 0) {
      fuzzyScored.push({ article, score: fuzzyScore });
    }
  }

  if (fuzzyScored.length > 0) {
    fuzzyScored.sort((a, b) => b.score - a.score);
    const maxFuzzy = fuzzyScored[0].score;
    const fuzzyResults = fuzzyScored.filter(s => s.score === maxFuzzy).map(s => s.article);
    if (fuzzyResults.length <= 20) {
      return {
        articles: fuzzyResults,
        label: `Ähnliche Treffer für „${tokens.join(' ')}"`,
        showCategory: true
      };
    }
  }

  // 7. Fallback: Name-Treffer zurückgeben, falls in Stufe 2 geparkt (≤5 Treffer)
  if (scored.length > 0) {
    const maxScore = scored[0].score;
    const minScore = tokens.length === 1 ? 1 : Math.ceil(tokens.length / 2);
    if (maxScore >= minScore) {
      let topResults = scored.filter(s => s.score === maxScore).map(s => s.article);
      if (topResults.length > 40) topResults = topResults.slice(0, 40);
      const label = tokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
      return { articles: topResults, label, showCategory: new Set(topResults.map(a => a.category)).size > 1 };
    }
  }

  return { articles: [], label: '', showCategory: false };
}

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

// ============================================
// Response Rendering
// ============================================

function showArticleResults(articles, label, showCategory) {
  // Group by category if showing mixed results
  let html = '';

  if (showCategory && new Set(articles.map(a => a.category)).size > 1) {
    // Group by category
    const grouped = {};
    for (const a of articles) {
      if (!grouped[a.category]) grouped[a.category] = [];
      grouped[a.category].push(a);
    }

    html += `<div class="result-header">
      <svg class="result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <h3>${escapeHtml(label)}</h3>
      <span class="result-count">${articles.length} Artikel</span>
    </div>`;

    for (const [cat, catArticles] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
      html += `<div style="margin-top: 12px; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(cat)} (${catArticles.length})</div>`;
      html += renderArticleTable(catArticles, false);
    }
  } else {
    html += `<div class="result-header">
      <svg class="result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <h3>${escapeHtml(label)}</h3>
      <span class="result-count">${articles.length} Artikel</span>
    </div>`;
    html += renderArticleTable(articles, showCategory);
  }

  // Copy button
  html += `<button class="copy-btn" data-articles='${JSON.stringify(articles.map(a => ({sku: a.sku, name: a.name}))).replace(/'/g, "&#39;")}'>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    <span>Liste kopieren</span>
  </button>`;

  addBotMessage(html);
}

function renderArticleTable(articles, showCategory) {
  let html = '<table class="article-table">';
  html += '<thead><tr><th>Art.-Nr.</th><th>Bezeichnung</th>';
  if (showCategory) html += '<th style="text-align:right">Kategorie</th>';
  html += '</tr></thead><tbody>';

  for (const article of articles) {
    html += `<tr>
      <td class="sku">${escapeHtml(article.sku)}</td>
      <td class="article-name">${escapeHtml(article.name)}</td>`;
    if (showCategory) {
      html += `<td class="article-category">${escapeHtml(article.category)}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

function showCategoryOverview() {
  // Build hierarchical structure: main category -> subcategories
  const hierarchy = {};
  for (const article of articleData.articles) {
    const cat = article.category;
    const sub = article.subcategory || '';
    if (!hierarchy[cat]) hierarchy[cat] = { total: 0, subs: {} };
    hierarchy[cat].total++;
    if (sub) {
      if (!hierarchy[cat].subs[sub]) hierarchy[cat].subs[sub] = 0;
      hierarchy[cat].subs[sub]++;
    }
  }

  const sorted = Object.entries(hierarchy).sort((a, b) => b[1].total - a[1].total);
  const totalSubs = sorted.reduce((sum, [, data]) => sum + Object.keys(data.subs).length, 0);

  let html = `<div class="result-header">
    <svg class="result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
    <h3>Alle Kategorien</h3>
    <span class="result-count">${sorted.length} Bereiche · ${totalSubs} Unterkategorien</span>
  </div>`;

  html += '<p style="margin-bottom: 12px; color: var(--text-secondary); font-size: 13px;">Klick auf eine Kategorie, um alle Artikel zu sehen:</p>';

  for (const [cat, data] of sorted) {
    html += `<div style="margin-top: 14px; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--text);">${escapeHtml(cat)} <span style="color: var(--text-light); font-weight: 400;">(${data.total} Artikel gesamt)</span></div>`;
    html += '<div class="category-grid">';

    // Main category card
    html += `<div class="category-card" data-category="${escapeHtml(cat)}">
      <span class="cat-name">Alle ${escapeHtml(cat)}</span>
      <span class="cat-count">${data.total}</span>
    </div>`;

    // Subcategory cards
    const sortedSubs = Object.entries(data.subs).sort((a, b) => b[1] - a[1]);
    for (const [sub, count] of sortedSubs) {
      html += `<div class="category-card" data-category="${escapeHtml(sub)}">
        <span class="cat-name">${escapeHtml(sub)}</span>
        <span class="cat-count">${count}</span>
      </div>`;
    }

    html += '</div>';
  }

  addBotMessage(html);
}

function showNoResults(query) {
  // Find closest category suggestions
  const allCategories = [...new Set(articleData.articles.map(a => a.category))];
  const suggestions = allCategories
    .filter(cat => cat !== 'Sonstiges' && cat !== 'Gutscheine')
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  let html = `<div class="no-results">
    <div class="no-results-icon">🔍</div>
    <p>Ich konnte leider keine Artikel für <strong>„${escapeHtml(query)}"</strong> finden.</p>
    <p style="margin-top: 4px;">Versuch es mit einem anderen Suchbegriff oder einer Kategorie:</p>
    <div class="suggestions">
      ${suggestions.map(s => `<button>${escapeHtml(s)}</button>`).join('')}
    </div>
  </div>`;

  addBotMessage(html);
}

function getHelpMessage() {
  return `<strong>So funktioniert die Artikelsuche:</strong><br><br>
    Du kannst mich auf verschiedene Arten fragen:<br><br>
    <strong>Nach Kategorie:</strong><br>
    → „Zeig mir alle Shampoos"<br>
    → „Was haben wir bei Gesichtspflege?"<br>
    → „Lip Treatments"<br><br>
    <strong>Nach Produktname:</strong><br>
    → „Rosemary Ginger"<br>
    → „Mandel Keratin"<br><br>
    <strong>Nach Artikelnummer:</strong><br>
    → „2800100347"<br>
    → „Nummer 2902101018"<br><br>
    <strong>Übersicht:</strong><br>
    → „Alle Kategorien"<br><br>
    Oder klick einfach auf einen der Schnellzugriff-Buttons unten.`;
}

// ============================================
// Copy Functionality
// ============================================

function copyArticles(btn) {
  const articles = JSON.parse(btn.dataset.articles);
  const text = articles.map(a => `${a.sku}\t${a.name}`).join('\n');

  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    btn.querySelector('span').textContent = 'Kopiert!';
    btn.querySelector('svg').innerHTML = '<polyline points="20 6 9 17 4 12"/>';

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.querySelector('span').textContent = 'Liste kopieren';
      btn.querySelector('svg').innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
    }, 2000);
  });
}

// ============================================
// Start
// ============================================

document.addEventListener('DOMContentLoaded', init);
