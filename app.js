
// app.js — Finance Tracker with Firebase Auth + Firestore (vanilla JS)

/* -------------------------------------------------
   Firebase (ES modules via CDN)
-------------------------------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, enableIndexedDbPersistence,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/* -------------------------------------------------
   Your Firebase project config
-------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBbOaDJpvjl4InkWET2K7f0aBxGzCFjAcU",
  authDomain: "finance-tracker-1-1f2fe.firebaseapp.com",
  projectId: "finance-tracker-1-1f2fe",
  storageBucket: "finance-tracker-1-1f2fe.firebasestorage.app",
  messagingSenderId: "912329757803",
  appId: "1:912329757803:web:4e51359ce73499819f0d2e",
  measurementId: "G-ZX9J5BXGZC"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable Firestore offline (IndexedDB) caching
enableIndexedDbPersistence(db).catch(() => {
  // If multiple tabs are open or the browser doesn't support it, it's fine.
});

// Ensure Auth persistence is LOCAL (restores session offline)
try {
  await setPersistence(auth, browserLocalPersistence);
} catch (e) {
  console.warn('Auth persistence could not be set:', e);
}

/* -------------------------------------------------
   App state
-------------------------------------------------- */
const CURRENCY_SYMBOL = 'R';
let transactions = [];        // {id, date, type, category, description, amount, userId, createdAt}
let categories = [];          // {id, name, kind, userId, createdAt}
let unsubscribe = null;       // transactions listener
let unsubscribeCats = null;   // categories listener
let editingId = null;

/* -------------------------------------------------
   DOM helpers
-------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);

const appMain      = $('#app');
const appFooter    = $('#appFooter');
const authBox      = $('#authBox');
const authStatus   = $('#authStatus');
const userEmailEl  = $('#userEmail');

const emailInput   = $('#email');
const passwordInput= $('#password');
const loginBtn     = $('#loginBtn');
const registerBtn  = $('#registerBtn');
const logoutBtn    = $('#logoutBtn');

const totalIncomeEl  = $('#totalIncome');
const totalExpenseEl = $('#totalExpense');
const totalBalanceEl = $('#totalBalance');

const form        = $('#transactionForm');
const formTitle   = $('#formTitle');
const cancelEditBtn = $('#cancelEdit');

const dateInput   = $('#date');
const typeInput   = $('#type');
const categorySelect = $('#category');
const amountInput = $('#amount');
const descInput   = $('#description');

const filterMonthInput = $('#filterMonth');
const filterTypeInput  = $('#filterType');
const searchTextInput  = $('#searchText');

const tbody       = $('#transactionBody');

const exportJsonBtn  = $('#exportJson');
const exportCsvBtn   = $('#exportCsv');
const importJsonInput= $('#importJson');

// Category manager
const newCategoryNameInput = $('#newCategoryName');
const newCategoryKindSelect = $('#newCategoryKind');
const addCategoryBtn = $('#addCategoryBtn');
const categoryListDiv = $('#categoryList');

/* -------------------------------------------------
   Collapsible UI state (per user)
-------------------------------------------------- */
const UI_STATE_STORAGE_KEY_PREFIX = 'finance.ui.v1.'; // + uid or 'anon'
let uiState = {};    // key -> boolean (true = collapsed)
let uiStateKey = UI_STATE_STORAGE_KEY_PREFIX + 'anon';

function loadUiState() {
  try {
    const raw = localStorage.getItem(uiStateKey);
    uiState = raw ? JSON.parse(raw) : {};
  } catch { uiState = {}; }
}
function saveUiState() {
  try { localStorage.setItem(uiStateKey, JSON.stringify(uiState)); } catch {}
}
function setCollapsed(key, collapsed) {
  uiState[key] = !!collapsed;
  saveUiState();
}
function getCollapsed(key, fallback = false) {
  return Object.prototype.hasOwnProperty.call(uiState, key) ? !!uiState[key] : fallback;
}

const collapsibleSections = [
  { id: 'filtersCard',      key: 'filters'      },
  { id: 'transactionsCard', key: 'transactions' },
  { id: 'categoriesCard',   key: 'categories'   },
  { id: 'backupCard',       key: 'backup'       }
];
const collapseAllBtn = $('#collapseAll');
const expandAllBtn   = $('#expandAll');

function initCollapsible(sectionId, key) {
  const el  = document.getElementById(sectionId);
  if (!el) return;
  const btn = el.querySelector('.collapseBtn');
  if (!btn) return;

  const shouldCollapse = getCollapsed(key, false);
  el.classList.toggle('collapsed', shouldCollapse);
  btn.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');

  const toggle = () => {
    const nowCollapsed = !el.classList.contains('collapsed');
    el.classList.toggle('collapsed', nowCollapsed);
    btn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
    setCollapsed(key, nowCollapsed);
  };
  btn.addEventListener('click', toggle);
  btn.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
  });
}

function initAllCollapsibles() {
  collapsibleSections.forEach(s => initCollapsible(s.id, s.key));
  collapseAllBtn?.addEventListener('click', () => {
    collapsibleSections.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      const btn = el?.querySelector('.collapseBtn');
      if (!el || !btn) return;
      el.classList.add('collapsed');
      btn.setAttribute('aria-expanded', 'false');
      setCollapsed(key, true);
    });
  });
  expandAllBtn?.addEventListener('click', () => {
    collapsibleSections.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      const btn = el?.querySelector('.collapseBtn');
      if (!el || !btn) return;
      el.classList.remove('collapsed');
      btn.setAttribute('aria-expanded', 'true');
      setCollapsed(key, false);
    });
  });
}

/* -------------------------------------------------
   Utility helpers
-------------------------------------------------- */
function formatAmount(num) {
  const n = Number(num || 0);
  return `${CURRENCY_SYMBOL} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* -------------------------------------------------
   Local Lock (PIN) — keeps Firebase session; works offline
-------------------------------------------------- */
const lockBtn      = $('#lockBtn');
const lockOverlay  = $('#lockOverlay');
const lockPinInput = $('#lockPinInput');
const unlockBtn    = $('#unlockBtn');
const setPinBtn    = $('#setPinBtn');
const lockMsg      = $('#lockMsg');

const LOCK_KEY_PREFIX = 'finance.lock.pin.v1.';
let lockKey = LOCK_KEY_PREFIX + 'anon';

function setLockKeyByUser(user) {
  lockKey = LOCK_KEY_PREFIX + (user?.uid || 'anon');
}
async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function showLock() {
  lockOverlay?.classList.remove('hidden');
  if (lockMsg) lockMsg.textContent = '';
  if (lockPinInput) { lockPinInput.value = ''; lockPinInput.focus(); }
}
function hideLock() {
  lockOverlay?.classList.add('hidden');
}

lockBtn?.addEventListener('click', () => showLock());

unlockBtn?.addEventListener('click', async () => {
  const pin = (lockPinInput?.value || '').trim();
  if (!pin) { if (lockMsg) lockMsg.textContent = 'Enter PIN'; return; }
  const stored = localStorage.getItem(lockKey);
  if (!stored) { if (lockMsg) lockMsg.textContent = 'No PIN set. Click "Set/Change PIN".'; return; }
  const hash = await sha256(pin);
  if (hash === stored) hideLock(); else if (lockMsg) lockMsg.textContent = 'Incorrect PIN';
});

setPinBtn?.addEventListener('click', async () => {
  const pin = prompt('Enter a new 4‑digit PIN (only stored as a hash on this device):','');
  if (!pin) return;
  if (!/^\d{4}$/.test(pin)) { alert('Use exactly 4 digits'); return; }
  const hash = await sha256(pin);
  localStorage.setItem(lockKey, hash);
  alert('PIN set.');
});

/* -------------------------------------------------
   Auth handlers
-------------------------------------------------- */
function setAuthStatus(msg) {
  if (authStatus) authStatus.textContent = msg;
}

loginBtn?.addEventListener('click', async () => {
  const email = (emailInput?.value || '').trim();
  const pass = (passwordInput?.value || '');
  if (!email || !pass) return setAuthStatus('Enter email and password.');

  // If offline and not signed in, block sign-in (needs network)
  if (!navigator.onLine && !auth.currentUser) {
    return setAuthStatus('No internet. Sign‑in requires a network connection.');
  }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    setAuthStatus('');
  } catch (e) {
    setAuthStatus('Sign-in failed: ' + e.message);
  }
});

registerBtn?.addEventListener('click', async () => {
  const email = (emailInput?.value || '').trim();
  const pass  = (passwordInput?.value || '');
  if (!email || !pass) return setAuthStatus('Enter email and password.');

  if (!navigator.onLine) {
    return setAuthStatus('No internet. Account creation requires a network connection.');
  }

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    setAuthStatus('Account created. You are now signed in.');
  } catch (e) {
    setAuthStatus('Create failed: ' + e.message);
  }
});

// Safer logout: warn that offline access will be lost until next online sign-in
logoutBtn?.addEventListener('click', async () => {
  const proceed = confirm('Signing out will disable offline access until you sign in again online. Continue?');
  if (!proceed) return;
  await signOut(auth);
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";
  if (authStatus) authStatus.textContent = "";
});

/* -------------------------------------------------
   Realtime listeners
-------------------------------------------------- */
function startRealtime(user) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  const q = query(
    collection(db, 'transactions'),
    where('userId', '==', user.uid),
    orderBy('date', 'desc'),
    orderBy('createdAt', 'desc')
  );
  unsubscribe = onSnapshot(q, (snap) => {
    transactions = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        date: data.date || new Date().toISOString().slice(0,10),
        type: data.type === 'income' ? 'income' : 'expense',
        category: data.category || 'General',
        description: data.description || '',
        amount: Number(data.amount) || 0,
        userId: data.userId
      };
    });
    render();
  }, (err) => {
    console.error('[RT] error', err);
    setAuthStatus('Could not load data: ' + err.message);
  });
}

function stopRealtime() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

function startRealtimeCategories(user) {
  if (unsubscribeCats) { unsubscribeCats(); unsubscribeCats = null; }
  const cq = query(
    collection(db, 'categories'),
    where('userId', '==', user.uid),
    orderBy('name', 'asc')
  );
  unsubscribeCats = onSnapshot(cq, (snap) => {
    categories = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || '',
        kind: data.kind || 'both',
        userId: data.userId,
        createdAt: data.createdAt
      };
    });
    renderCategoryOptions(typeInput.value);
    renderCategoryList();
  }, (err) => {
    console.error('[RT] categories error', err);
    setAuthStatus('Could not load categories: ' + err.message);
  });
}

function stopRealtimeCategories() {
  if (unsubscribeCats) { unsubscribeCats(); unsubscribeCats = null; }
  categories = [];
  renderCategoryOptions(typeInput.value);
  renderCategoryList();
}

/* -------------------------------------------------
   PWA: Service worker registration (update banner handled in index.js block)
-------------------------------------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      // If new SW is waiting, index.html banner JS will show "Update available"
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('Updated content available. Use update banner to reload.');
          }
        });
      });
    }).catch(err => console.error('SW registration failed', err));
  });
}

// Install button (Android/Chrome); iOS uses "Add to Home Screen"
let deferredPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'inline-block';
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  installBtn.style.display = 'none';
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
});
window.addEventListener('appinstalled', () => {
  if (installBtn) installBtn.style.display = 'none';
});

/* -------------------------------------------------
   Auth state -> show/hide app + per-user UI/Lock
-------------------------------------------------- */
function updateLoginOfflineUI() {
  const offline = !navigator.onLine;
  const isSignedIn = !!auth.currentUser;
  if (!loginBtn || !registerBtn || !authStatus) return;

  if (offline && !isSignedIn) {
    authStatus.textContent = 'No internet. Sign‑in requires a network connection.';
    loginBtn.setAttribute('disabled', 'true');
    registerBtn.setAttribute('disabled', 'true');
  } else {
    if (authStatus.textContent?.includes('No internet')) authStatus.textContent = '';
    loginBtn.removeAttribute('disabled');
    registerBtn.removeAttribute('disabled');
  }
}
window.addEventListener('online', updateLoginOfflineUI);
window.addEventListener('offline', updateLoginOfflineUI);

onAuthStateChanged(auth, (user) => {
  // Tie lock key to user or 'anon'
  setLockKeyByUser(user);

  if (user) {
    // Show app
    authBox?.classList.add('hidden');
    appMain?.classList.remove('hidden');
    appFooter?.classList.remove('hidden');
    if (userEmailEl) userEmailEl.textContent = user.email || '(no email)';

    // Defaults
    dateInput.value = new Date().toISOString().slice(0, 10);
    filterMonthInput.value = new Date().toISOString().slice(0, 7);
    filterTypeInput.value = 'all';

    // Start listeners
    startRealtime(user);
    startRealtimeCategories(user);

    // Load per-user UI state
    uiStateKey = UI_STATE_STORAGE_KEY_PREFIX + (user.uid || 'anon');
    loadUiState();
    initAllCollapsibles();
  } else {
    // Hide app
    stopRealtime();
    stopRealtimeCategories();
    appMain?.classList.add('hidden');
    appFooter?.classList.add('hidden');
    authBox?.classList.remove('hidden');

    // Clear fields on showing login box
    if (emailInput) emailInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (authStatus) authStatus.textContent = "";

    uiStateKey = UI_STATE_STORAGE_KEY_PREFIX + 'anon';
    loadUiState();

    transactions = [];
    render();
  }

  // Update login UI based on connectivity & session
  updateLoginOfflineUI();
});

/* -------------------------------------------------
   Form submit / Edit / Delete
-------------------------------------------------- */
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return setAuthStatus('Please sign in.');

  const t = {
    date: dateInput.value,
    type: typeInput.value === 'income' ? 'income' : 'expense',
    category: (categorySelect.value || '').trim(),
    description: (descInput.value || '').trim(),
    amount: Number(amountInput.value),
    userId: user.uid,
    createdAt: serverTimestamp()
  };

  if (!t.date || !t.category || !(t.amount > 0)) {
    alert('Please fill all required fields with valid values.');
    return;
  }

  try {
    if (editingId) {
      await updateDoc(doc(db, 'transactions', editingId), {
        date: t.date, type: t.type, category: t.category,
        description: t.description, amount: t.amount
      });
      resetForm();
    } else {
      await addDoc(collection(db, 'transactions'), t);
      form.reset();
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
});

cancelEditBtn?.addEventListener('click', resetForm);

function resetForm() {
  editingId = null;
  formTitle.textContent = 'Add Transaction';
  cancelEditBtn.classList.add('hidden');
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  typeInput.value = 'income';
}

function startEdit(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  formTitle.textContent = 'Edit Transaction';
  cancelEditBtn.classList.remove('hidden');

  dateInput.value = t.date;
  typeInput.value = t.type;

  // Ensure category options reflect type
  renderCategoryOptions(typeInput.value);

  // If the stored category is not valid for current type, add a temp option
  if (categorySelect) {
    const hasOpt = [...categorySelect.options].some(o => o.value === t.category);
    if (!hasOpt && t.category) {
      const tempOpt = document.createElement('option');
      tempOpt.value = t.category;
      tempOpt.textContent = `${t.category} (not available for this type)`;
      categorySelect.appendChild(tempOpt);
    }
    categorySelect.value = t.category || '';
  }

  amountInput.value = String(t.amount);
  descInput.value = t.description || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* -------------------------------------------------
   Categories (type-specific)
-------------------------------------------------- */
function getCategoriesForType(currentType) {
  return categories.filter(c => c.kind === 'both' || c.kind === currentType);
}

function renderCategoryOptions(currentType = 'income') {
  if (!categorySelect) return;
  const valid = getCategoriesForType(currentType);

  categorySelect.innerHTML = '';
  if (valid.length === 0) {
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'No categories for this type. Add one below.';
    ph.disabled = true;
    ph.selected = true;
    categorySelect.appendChild(ph);
    return;
  }

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Select category...';
  ph.disabled = true;
  ph.selected = true;
  categorySelect.appendChild(ph);

  for (const c of valid) {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    categorySelect.appendChild(opt);
  }
}

typeInput?.addEventListener('change', () => {
  renderCategoryOptions(typeInput.value);
  if (categorySelect && categorySelect.value) {
    const stillValid = getCategoriesForType(typeInput.value)
      .some(c => c.name === categorySelect.value);
    if (!stillValid) categorySelect.value = '';
  }
});

addCategoryBtn?.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return setAuthStatus('Please sign in.');

  const name = (newCategoryNameInput.value || '').trim();
  const kind = newCategoryKindSelect.value || 'both';
  if (!name) return alert('Please enter a category name.');

  // Prevent duplicates by name (case-insensitive), regardless of kind
  const exists = categories.some(c => c.name.toLowerCase() === name.toLowerCase());
  if (exists) return alert('This category name already exists.');

  try {
    await addDoc(collection(db, 'categories'), {
      name, kind, userId: user.uid, createdAt: serverTimestamp()
    });
    newCategoryNameInput.value = '';
    renderCategoryOptions(typeInput.value);
  } catch (e) {
    alert('Add category failed: ' + e.message);
  }
});

/* -------------------------------------------------
   Rendering & filters
-------------------------------------------------- */
function applyFilters(list) {
  const month = filterMonthInput.value; // "YYYY-MM"
  const type  = filterTypeInput.value;  // 'all'|'income'|'expense'
  const qtxt  = (searchTextInput.value || '').trim().toLowerCase();

  return list.filter(t => {
    const matchesMonth = month ? t.date.startsWith(month) : true;
    const matchesType  = type === 'all' ? true : t.type === type;
    const matchesText  = qtxt ? (t.category.toLowerCase().includes(qtxt) || (t.description || '').toLowerCase().includes(qtxt)) : true;
    return matchesMonth && matchesType && matchesText;
  });
}

function computeTotals(list) {
  let income = 0, expense = 0;
  for (const t of list) {
    if (t.type === 'income') income += t.amount; else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

function render() {
  const filtered = applyFilters(transactions);
  const { income, expense, balance } = computeTotals(filtered);

  if (totalIncomeEl)  totalIncomeEl.textContent  = formatAmount(income);
  if (totalExpenseEl) totalExpenseEl.textContent = formatAmount(expense);
  if (totalBalanceEl) totalBalanceEl.textContent = formatAmount(balance);

  if (!tbody) return;
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'No transactions found for current filters.';
    td.style.color = '#666';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const t of filtered) {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = t.date;

    const tdType = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${t.type}`;
    badge.textContent = t.type === 'income' ? 'Income' : 'Expense';
    tdType.appendChild(badge);

    const tdCat = document.createElement('td');
    tdCat.textContent = t.category;

    const tdDesc = document.createElement('td');
    tdDesc.textContent = t.description || '';

    const tdAmount = document.createElement('td');
    tdAmount.className = 'amountCol';
    tdAmount.textContent = formatAmount(t.amount);

    const tdActions = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'small secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => startEdit(t.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'small secondary';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (confirm('Delete this transaction?')) {
        try { await deleteDoc(doc(db, 'transactions', t.id)); }
        catch (e) { alert('Delete failed: ' + e.message); }
      }
    });

    tdActions.appendChild(editBtn);
    tdActions.appendChild(delBtn);

    tr.appendChild(tdDate);
    tr.appendChild(tdType);
    tr.appendChild(tdCat);
    tr.appendChild(tdDesc);
    tr.appendChild(tdAmount);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }
}

function renderCategoryList() {
  if (!categoryListDiv) return;

  if (categories.length === 0) {
    categoryListDiv.innerHTML = '<p class="note">No categories yet. Add your first one above.</p>';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Kind</th>
        <th style="width:160px;">Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tb = table.querySelector('tbody');

  for (const c of categories) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = c.name;

    const tdKind = document.createElement('td');
    const kindSel = document.createElement('select');
    ['income','expense','both'].forEach(k => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = k[0].toUpperCase() + k.slice(1);
      if (c.kind === k) opt.selected = true;
      kindSel.appendChild(opt);
    });
    kindSel.addEventListener('change', async () => {
      try {
        await updateDoc(doc(db, 'categories', c.id), { kind: kindSel.value });
        renderCategoryOptions(typeInput.value);
      } catch (e) {
        alert('Update kind failed: ' + e.message);
      }
    });
    tdKind.appendChild(kindSel);

    const tdActions = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'small secondary';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (confirm(`Delete category "${c.name}"?`)) {
        try {
          await deleteDoc(doc(db, 'categories', c.id));
          renderCategoryOptions(typeInput.value);
        } catch (e) {
          alert('Delete failed: ' + e.message);
        }
      }
    });

    tdActions.appendChild(delBtn);

    tr.appendChild(tdName);
    tr.appendChild(tdKind);
    tr.appendChild(tdActions);
    tb.appendChild(tr);
  }

  categoryListDiv.innerHTML = '';
  categoryListDiv.appendChild(table);
}

/* -------------------------------------------------
   Filters & Export/Import events
-------------------------------------------------- */
filterMonthInput?.addEventListener('input', render);
filterTypeInput?.addEventListener('change', render);
searchTextInput?.addEventListener('input', render);

// Export JSON
exportJsonBtn?.addEventListener('click', () => {
  downloadBlob('transactions.json', 'application/json', JSON.stringify(transactions, null, 2));
});

// Export CSV
exportCsvBtn?.addEventListener('click', () => {
  const header = ['id','date','type','category','description','amount'];
  const rows = transactions.map(t => ([
    t.id, t.date, t.type, csvEscape(t.category), csvEscape(t.description || ''), t.amount
  ]));
  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob('transactions.csv', 'text/csv', csv);

  function csvEscape(str) {
    const s = String(str || '');
    return `"${s.replace(/"/g, '""')}"`;
  }
});

// Import JSON
importJsonInput?.addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;

  const user = auth.currentUser;
  if (!user) return setAuthStatus('Please sign in.');

  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Invalid JSON (expected an array).');

    for (const t of data) {
      const docData = {
        date: t.date || new Date().toISOString().slice(0,10),
        type: t.type === 'income' ? 'income' : 'expense',
        category: t.category || 'General',
        description: t.description || '',
        amount: Number(t.amount) || 0,
        userId: user.uid,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'transactions'), docData);
    }
    alert('Import completed.');
  } catch (e) {
    alert('Import failed: ' + e.message);
  } finally {
    importJsonInput.value = '';
  }
});

/* -------------------------------------------------
   Small helpers
-------------------------------------------------- */
function downloadBlob(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
