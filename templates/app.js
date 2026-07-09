/* Nihongo Kit — client side
 * Romaji-only mobile-first learner. No Japanese script rendered anywhere.
 * Audio: best-effort Web Speech API with feature detection.
 */
(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────
  const state = {
    view: 'survival',     // section id | 'grammar' | 'search' | 'favorites' | 'numbers' (alias)
    query: '',
    dark: false,
    favorites: new Set(),
  };

  // ─── DOM refs ────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const view = $('#view');
  const topbarTitle = $('#topbar-title');
  const searchBar = $('#searchbar');
  const searchInput = $('#search-input');

  // ─── App data (injected by build.py) ─────────────────────────────
  const DATA = JSON.parse(document.getElementById('app-data').textContent);
  const SECTIONS = DATA.sections;
  const SECTION_ORDER = DATA.sectionOrder;
  const PHRASE_INDEX = DATA.phraseIndex;
  const GRAMMAR = DATA.grammar || [];

  // Build phrase-id lookup (for grammar card ref linking)
  const PHRASE_BY_ID = new Map();
  for (const p of PHRASE_INDEX) PHRASE_BY_ID.set(p.id, p);

  // ─── Favorites (localStorage) ────────────────────────────────────
  function loadFavorites() {
    try {
      const raw = localStorage.getItem('nk.favorites');
      if (raw) state.favorites = new Set(JSON.parse(raw));
    } catch (e) { /* fresh */ }
  }
  function saveFavorites() {
    localStorage.setItem('nk.favorites', JSON.stringify([...state.favorites]));
  }
  function toggleFavorite(id) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    saveFavorites();
    render();
  }

  // ─── Dark mode ──────────────────────────────────────────────────
  function loadDark() {
    state.dark = localStorage.getItem('nk.dark') === 'true';
    document.body.classList.toggle('dark', state.dark);
    const btn = $('#dark-toggle');
    if (btn) btn.setAttribute('aria-pressed', String(state.dark));
  }
  function toggleDark() {
    state.dark = !state.dark;
    localStorage.setItem('nk.dark', String(state.dark));
    document.body.classList.toggle('dark', state.dark);
    $('#dark-toggle').setAttribute('aria-pressed', String(state.dark));
  }

  // ─── Audio (Web Speech API best-effort) ────────────────────────
  let jaVoice = null;
  function detectVoice() {
    if (!('speechSynthesis' in window)) return false;
    const voices = speechSynthesis.getVoices();
    jaVoice = voices.find(v => /ja[-_]JP/i.test(v.lang)) || null;
    return jaVoice !== null;
  }
  speechSynthesis?.addEventListener?.('voiceschanged', detectVoice);
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    if (!detectVoice()) return; // silently degrade
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.9;
    if (jaVoice) u.voice = jaVoice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ─── Render: phrase card ────────────────────────────────────────
  function renderPhraseCard(p, opts = {}) {
    const div = document.createElement('div');
    div.className = 'phrase';
    div.setAttribute('data-id', p.id);
    const isFav = state.favorites.has(p.id);
    const tags = [];
    if (p.polite !== false) tags.push(`<span class="tag polite">polite</span>`);
    else tags.push(`<span class="tag casual">casual</span>`);
    if (Array.isArray(p.tags)) {
      for (const t of p.tags) tags.push(`<span class="tag">${escapeHtml(t)}</span>`);
    }
    // section badge only on search results
    const sectionBadge = opts.showSection && p.sectionTitle
      ? `<button class="section-badge" data-section="${escapeHtml(p.sectionId)}">${escapeHtml(p.sectionTitle)}</button><br>`
      : '';
    div.innerHTML = `
      <div class="head">
        <div class="romaji" style="cursor:pointer" data-fav-toggle="${escapeHtml(p.id)}">${escapeHtml(p.romaji)}</div>
        <div class="actions">
          <button class="audio" aria-label="Play audio" data-speak="${escapeHtml(p.speak || p.romaji || '')}" ${jaVoice ? '' : 'title="audio unavailable on this device"'} ${jaVoice ? '' : 'style="opacity:0.4"'}>${jaVoice ? '▶' : '♪'}</button>
          <button class="fav" aria-label="Favorite" aria-pressed="${isFav}" data-fav-toggle="${escapeHtml(p.id)}">${isFav ? '★' : '☆'}</button>
        </div>
      </div>
      ${sectionBadge}
      <div class="en">${escapeHtml(p.en || '')}</div>
      ${p.use ? `<div class="use"><strong>When to use:</strong> ${escapeHtml(p.use)}</div>` : ''}
      ${p.note ? `<div class="note">${escapeHtml(p.note)}</div>` : ''}
      ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
    `;
    return div;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ─── Render: section list ───────────────────────────────────────
  function renderSection(secId) {
    var sec = SECTIONS[secId];
    console.log('renderSection(', secId, ') sec=', !!sec, 'phrases=', sec && sec.phrases && sec.phrases.length);
    if (!sec) return renderHome();
    view.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = (sec.icon || '') + ' ' + sec.title;
    view.appendChild(h2);
    if (sec.blurb) {
      const p = document.createElement('div');
      p.className = 'blurb';
      p.textContent = sec.blurb;
      view.appendChild(p);
    }
    const banner = document.createElement('div');
    banner.className = 'banner';
    banner.innerHTML = `<span class="ti">Tip</span>English in <span class="kbd">light blue</span>, when-to-use context in <span class="kbd">indigo</span>, pronunciation tips in <span class="kbd">rose</span>. Tap <span class="kbd">★</span> to save phrases for offline use.`;
    view.appendChild(banner);
    if (!sec.phrases?.length) {
      view.innerHTML += '<div class="empty-state"><div class="ic">🍙</div>No phrases yet — content pipeline didn\'t include any.</div>';
      return;
    }
    for (const p of sec.phrases) {
      view.appendChild(renderPhraseCard(p));
    }
  }

  // ─── Render: grammar cards ──────────────────────────────────────
  function renderGrammar() {
    view.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = '⚡ Quick grammar';
    view.appendChild(h2);
    const blurb = document.createElement('div');
    blurb.className = 'blurb';
    blurb.textContent = 'Five particles + a few patterns cover most tourist situations. Each card links to real phrases you\'ve already seen — tap one to hear it.';
    view.appendChild(blurb);
    if (GRAMMAR.length === 0) {
      view.innerHTML += '<div class="empty-state"><div class="ic">📝</div>Grammar cards haven\'t been authored yet.</div>';
      return;
    }
    for (const card of GRAMMAR) {
      const div = document.createElement('div');
      div.className = 'grammar-card';
      const examplesHtml = (card.examples || []).map(ex => {
        const phrase = PHRASE_BY_ID.get(ex.ref);
        if (!phrase) return `<div class="ex"><div class="romaji">${escapeHtml(ex.ref)}</div><div class="gloss">${escapeHtml(ex.gloss || '')}</div></div>`;
        return `<div class="ex" data-phrase="${escapeHtml(phrase.id)}"><div class="romaji">${escapeHtml(phrase.romaji)}</div><div class="gloss">${escapeHtml(ex.gloss || '')}<button class="audio" data-speak="${escapeHtml(phrase.speak || phrase.romaji)}">▶</button></div></div>`;
      }).join('');
      div.innerHTML = `
        <div>
          <span class="particle">${escapeHtml(card.particle || '')}</span>
          <h3>${escapeHtml(card.title || '')}</h3>
          <span class="pronunciation">said: ${escapeHtml(card.reads || '')}</span>
        </div>
        <div class="rule">${escapeHtml(card.rule || '')}</div>
        <div class="plain">${escapeHtml(card.plain || '')}</div>
        ${card.contrast ? `<div class="contrast">${escapeHtml(card.contrast)}</div>` : ''}
        <div class="examples-title">Examples</div>
        <div class="examples">${examplesHtml}</div>
      `;
      view.appendChild(div);
    }
  }

  // ─── Render: home (alias for survival) ─────────────────────────
  function renderHome() {
    // Default = survival
    renderSection('survival');
  }

  // ─── Render: search results ────────────────────────────────────
  function rankSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const items = [];
    for (const p of PHRASE_INDEX) {
      // Skip romaji-less phrases? No — keep them, just rank poorly.
      const haystack = [
        p.romaji || '', p.en || '', p.use || '', p.note || '',
        (p.tags || []).join(' '),
        p.sectionTitle || '',
      ].join(' ').toLowerCase();
      // All tokens must be present
      let allFound = true;
      let tier = 4; // higher = better. We want 1 = best.
      for (const t of tokens) {
        if (!haystack.includes(t)) { allFound = false; break; }
        // Tier: exact romaji/en match is best
        if ((p.romaji || '').toLowerCase() === t || (p.en || '').toLowerCase() === t) tier = Math.min(tier, 1);
        else if ((p.romaji || '').toLowerCase().startsWith(t) ||
                 (p.en || '').toLowerCase().startsWith(t)) tier = Math.min(tier, 2);
        else if (new RegExp('\\b' + escapeRegex(t)).test(haystack)) tier = Math.min(tier, 3);
      }
      if (allFound) items.push({ p, tier });
    }
    // Sort: tier asc, then essential tag if present, then romaji asc
    items.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const ea = (a.p.tags || []).includes('essential') ? 0 : 1;
      const eb = (b.p.tags || []).includes('essential') ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return (a.p.romaji || '').localeCompare(b.p.romaji || '');
    });
    return items.map(x => x.p);
  }

  function renderSearch() {
    view.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = '🔎 Search';
    view.appendChild(h2);
    const blurb = document.createElement('div');
    blurb.className = 'blurb';
    blurb.textContent = 'Type in English or romaji. Tap a phrase to hear it. Tap a section badge to jump there.';
    view.appendChild(blurb);
    if (!state.query) {
      const chips = ['toilet', 'help', 'how much', 'vegetarian', 'train', 'allergy'];
      const wrap = document.createElement('div');
      wrap.className = 'banner';
      wrap.innerHTML = `<span class="ti">Try</span>` + chips.map(c => `<span class="kbd" style="margin-right:6px;cursor:pointer" data-quick-search="${escapeHtml(c)}">${escapeHtml(c)}</span>`).join('');
      view.appendChild(wrap);
      return;
    }
    const results = rankSearch(state.query);
    if (!results.length) {
      view.innerHTML += '<div class="empty-state"><div class="ic">🤷</div>No matches for "<strong>' + escapeHtml(state.query) + '</strong>". Try simpler keywords.</div>';
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'search-results';
    for (const p of results.slice(0, 50)) {
      wrap.appendChild(renderPhraseCard(p, { showSection: true }));
    }
    view.appendChild(wrap);
  }

  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ─── Render: favorites ──────────────────────────────────────────
  function renderFavorites() {
    view.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = '★ Saved phrases';
    view.appendChild(h2);
    if (!state.favorites.size) {
      view.innerHTML += `<div class="empty-state"><div class="ic">☆</div>No saved phrases yet.<br>Tap the star on any phrase to save it for quick access — works offline.</div>`;
      return;
    }
    const favs = [...state.favorites].map(id => PHRASE_BY_ID.get(id)).filter(Boolean);
    // Group by section, but show in save order (most recent first)
    for (const p of favs) {
      view.appendChild(renderPhraseCard(p, { showSection: true }));
    }
  }

  // ─── Render router ──────────────────────────────────────────────
  function render() {
    // Highlight tabbar + close search overlay
    const searchOpen = state.view === 'search';
    searchBar.classList.toggle('open', searchOpen);
    document.querySelectorAll('.tab').forEach(t => {
      t.removeAttribute('aria-current');
    });
    const tabBtn = document.querySelector(`.tab[data-view="${state.view}"]`);
    if (tabBtn) tabBtn.setAttribute('aria-current', 'page');

    if (state.view === 'search') {
      setTimeout(() => searchInput.focus(), 30);
      renderSearch();
    } else if (state.view === 'favorites') {
      renderFavorites();
    } else if (state.view === 'grammar') {
      renderGrammar();
    } else if (state.view === 'home') {
      renderHome();
    } else {
      renderSection(state.view);
    }

    // URL hash sync
    if (state.view && state.view !== 'home') {
      history.replaceState(null, '', '#' + state.view);
    } else {
      history.replaceState(null, '', location.pathname);
    }
  }

  // ─── Event handlers (delegated) ────────────────────────────────
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view], .tab, [data-fav-toggle], .section-badge, [data-quick-search], [data-speak], [data-section]');
    if (!t) return;

    if (t.dataset.favToggle) {
      e.preventDefault();
      toggleFavorite(t.dataset.favToggle);
      return;
    }
    if (t.dataset.speak) {
      e.preventDefault();
      speak(t.dataset.speak);
      return;
    }
    if (t.dataset.section) {
      e.preventDefault();
      setView(t.dataset.section);
      return;
    }
    if (t.dataset.quickSearch) {
      e.preventDefault();
      setView('search');
      state.query = t.dataset.quickSearch;
      searchInput.value = state.query;
      render();
      return;
    }
    if (t.classList.contains('romaji') && t.dataset.favToggle) {
      // tap on the romaji text opens the audio too (in addition to the play btn)
      const phrase = PHRASE_BY_ID.get(t.dataset.favToggle);
      if (phrase) speak(phrase.speak || phrase.romaji);
      return;
    }
    if (t.dataset.view) {
      e.preventDefault();
      setView(t.dataset.view);
      return;
    }
  });

  function setView(v) {
    state.view = v;
    if (v !== 'search') state.query = '';
    if (searchInput) searchInput.value = '';
    render();
  }

  // Top bar buttons
  $('#dark-toggle').addEventListener('click', toggleDark);
  $('#search-toggle').addEventListener('click', () => {
    state.view = state.view === 'search' ? 'home' : 'search';
    state.query = '';
    if (searchInput) searchInput.value = '';
    render();
  });
  $('#favorites-toggle').addEventListener('click', () => {
    state.view = 'favorites';
    render();
  });

  // Search input
  let searchDebounce = null;
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      render();
    }, 120);
  });

  // Tab bar
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setView(tab.dataset.view);
    });
  });

  // ─── Hash sync (deep linking) ──────────────────────────────────
  function fromHash() {
    const h = (location.hash || '').slice(1);
    if (h && (SECTION_ORDER.includes(h) || ['search', 'favorites', 'grammar', 'home'].includes(h))) {
      state.view = h;
    }
  }
  window.addEventListener('hashchange', () => {
    fromHash();
    render();
  });

  // ─── Boot ───────────────────────────────────────────────────────
  function boot() {
    var view = document.getElementById('view');
    function report(msg) {
      if (view) view.innerHTML = '<pre style="color:#0f172a;padding:20px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px;background:#fef3c7">BOOT DIAG: ' + msg + '</pre>';
    }
    try {
      report('1: detectVoice');
      detectVoice();
      report('2: loadDark');
      loadDark();
      report('3: loadFavorites');
      loadFavorites();
      report('4: fromHash');
      fromHash();
      report('5: render view=' + state.view);
      render();
      report('6: render returned, view length=' + view.innerHTML.length);
      setTimeout(detectVoice, 500);
      setTimeout(detectVoice, 2000);
    } catch (e) {
      console.error('Boot failed:', e && e.message, e && e.stack);
      report('CAUGHT: ' + e.message + '\n' + (e.stack || '').slice(0, 1500));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
