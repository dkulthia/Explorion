(() => {
  EBASE_CONFIG
  const FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;
  const form = document.getElementById('searchForm');
  const queryEl = document.getElementById('query');
  const engineEl = document.getElementById('engine');
  const filetypeEl = document.getElementById('filetype');
  const previewEl = document.getElementById('builtQuery');
  const clearBtn = document.getElementById('clearBtn');
  const historyList = document.getElementById('historyList');
  const exportBtn = document.getElementById('exportBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const globalCountEl = document.getElementById('globalCount');

  const STORAGE_KEY = 'explorion_history_v1';

  let firebaseDb = null;
  let counterRef = null;

let authReady = null; 

function initFirebase() {
  if (!FIREBASE_CONFIG) {
    console.warn('Firebase config missing. Global counter disabled.');
    setGlobalCount(null);
    return;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);

    authReady = new Promise((resolve) => {
      const unsubscribe = firebase.auth().onAuthStateChanged(user => {
        if (!user) {
          firebase.auth().signInAnonymously()
            .then(() => {
              console.log('Anonymous sign-in succeeded');
              unsubscribe();
              resolve(true);
            })
            .catch(err => {
              console.warn('Anonymous sign-in failed', err);
              unsubscribe();
              resolve(false);
            });
        } else {
          console.log('Already signed in (uid):', user.uid);
          unsubscribe();
          resolve(true);
        }
      }, (err) => {
        console.warn('auth state check error', err);
        unsubscribe();
        resolve(false);
      });
    });

    firebaseDb = firebase.database();
    counterRef = firebaseDb.ref('counters/total_searches');

    counterRef.on('value', snap => {
      const val = snap.exists() ? snap.val() : 0;
      setGlobalCount(Number(val) || 0);
    });

  } catch (e) {
    console.error('Firebase init error', e);
    setGlobalCount(null);
  }
}


  function safeOpen(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function buildQuery(q, ft) {
    q = (q || '').trim();
    if (!q) return '';
    const safeExclude = '-inurl:(jsp|pl|php|html|aspx|htm|cf|shtml)';
    const indexOf = 'intitle:"index.of"';
    let filePart = '';
    if (ft) filePart = ' ("' + ft.replace(/\|/g, '" OR "') + '")';
    return [q, filePart, safeExclude, indexOf].filter(Boolean).join(' ');
  }

  function makeEngineUrl(engine, built) {
    const q = encodeURIComponent(built);
    switch (engine) {
      case 'startpage': return 'https://www.startpage.com/do/dsearch?query=' + q;
      case 'duckduckgo': return 'https://duckduckgo.com/?q=' + q;
      case 'filepursuit': {
        const keyword = encodeURIComponent(queryEl.value.trim());
        return 'https://filepursuit.com/search/' + (keyword || q.replace(/%20/g, '+')) + '/type/any';
      }
      case 'google':
      default:
        return 'https://www.google.com/search?q=' + q;
    }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('history load err', e);
      return [];
    }
  }
  function saveHistory(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
  function addHistoryItem(item) {
    const hist = loadHistory();
    if (hist[0] && hist[0].query === item.query && hist[0].engine === item.engine && hist[0].fileType === item.fileType) {
    } else hist.unshift(item);
    if (hist.length > 200) hist.length = 200;
    saveHistory(hist);
    renderHistory();
  }
  function clearHistory() { localStorage.removeItem(STORAGE_KEY); renderHistory(); }

  function renderHistory() {
    const hist = loadHistory();
    if (!hist.length) {
      historyList.innerHTML = '<div class="small-muted">No saved searches yet. Searches are saved automatically when you press Search.</div>';
      return;
    }
    historyList.innerHTML = '';
    const frag = document.createDocumentFragment();
    hist.forEach((it, idx) => {
      const box = document.createElement('div');
      box.className = 'history-item mb-2';
      const left = document.createElement('div');
      left.style.flex = '1';
      const qdiv = document.createElement('div');
      qdiv.className = 'query-text';
      qdiv.textContent = it.query;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = 'Engine: ' + it.engine + ' • Filter: ' + (it.fileType || 'Any') + ' • ' + new Date(it.created).toLocaleString();
      left.appendChild(qdiv); left.appendChild(meta);

      const right = document.createElement('div'); right.style.whiteSpace = 'nowrap';

      const openBtn = document.createElement('button');
      openBtn.className = 'btn btn-ghost btn-sm';
      openBtn.title = 'Open';
      openBtn.setAttribute('aria-label', 'Open search');
      openBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
      openBtn.addEventListener('click', () => {
  const url = makeEngineUrl(it.engine, buildQuery(it.query, it.fileType));
  safeOpen(url);

  try {
    if (typeof trackSearchFirebase === 'function') {
      trackSearchFirebase(it.query, it.engine, it.fileType).catch(err => {
        console.warn('background tracking failed:', err);
      });
    } else if (typeof trackSearch === 'function') {
      trackSearch(it.query, it.engine, it.fileType).catch(err => {
        console.warn('background server tracking failed:', err);
      });
    } else {
      console.warn('No tracking function available to increment counter.');
    }
  } catch (err) {
    console.warn('Failed to start background tracking', err);
  }
});


      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-ghost btn-sm ms-2';
      loadBtn.title = 'Load';
      loadBtn.setAttribute('aria-label', 'Load search into form');
      loadBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
      loadBtn.addEventListener('click', () => {
        queryEl.value = it.query; engineEl.value = it.engine; filetypeEl.value = it.fileType || ''; updatePreview(); queryEl.focus();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-delete btn-sm ms-2';
      delBtn.title = 'Delete';
      delBtn.setAttribute('aria-label', 'Delete search');
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.addEventListener('click', () => { const h = loadHistory(); h.splice(idx, 1); saveHistory(h); renderHistory(); });

      right.appendChild(openBtn); right.appendChild(loadBtn); right.appendChild(delBtn);
      box.appendChild(left); box.appendChild(right); frag.appendChild(box);
    });
    historyList.appendChild(frag);
  }

  function updatePreview() {
    const built = buildQuery(queryEl.value, filetypeEl.value);
    previewEl.textContent = built || '(No valid query)';
  }

  function setGlobalCount(n) {
    if (!globalCountEl) return;
    if (n === null) globalCountEl.textContent = 'Total searches: --';
    else globalCountEl.textContent = 'Total searches: ' + Number(n).toLocaleString();
  }

async function trackSearchFirebase(query, engine, fileType) {
  if (!counterRef) return;
  try {
    if (authReady) {
      const ok = await authReady;
      if (!ok) {
        console.warn('Auth not ready/signed in; skipping firebase tracking.');
        return;
      }
    }
  } catch (e) {
    console.warn('authReady wait failed', e);
    return;
  }

  try {
    await counterRef.transaction(current => (current || 0) + 1);
  } catch (e) {
    console.warn('Firebase track failed', e);
  }
}


  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const q = queryEl.value.trim();
    if (!q) { queryEl.focus(); return alert('Please enter a search term.'); }
    const built = buildQuery(q, filetypeEl.value);
    const url = makeEngineUrl(engineEl.value, built);
    previewEl.textContent = built;
    safeOpen(url);
    addHistoryItem({ query: q, engine: engineEl.value, fileType: filetypeEl.value, created: Date.now() });

    if (counterRef) {
      trackSearchFirebase(q, engineEl.value, filetypeEl.value);
    }
  });

  clearBtn.addEventListener('click', function () { queryEl.value = ''; filetypeEl.value = ''; engineEl.value = 'google'; updatePreview(); queryEl.focus(); });
  queryEl.addEventListener('input', updatePreview);
  filetypeEl.addEventListener('change', updatePreview);
  engineEl.addEventListener('change', updatePreview);

  exportBtn.addEventListener('click', function () {
    const hist = loadHistory(); if (!hist.length) return alert('No history to export.');
    const blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'explorion-history.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  clearHistoryBtn.addEventListener('click', function () { if (!confirm('Delete all saved history? This cannot be undone.')) return; clearHistory(); });

  renderHistory(); updatePreview();
initFirebase();
if (authReady) authReady.then(ok => console.log('authReady resolved ->', ok));


  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey && ev.key === 'Enter') { ev.preventDefault(); form.requestSubmit(); }
    else if (ev.ctrlKey && (ev.key === 's' || ev.key === 'S')) { ev.preventDefault(); exportBtn.click(); }
  });

})();