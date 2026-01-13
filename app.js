
// app.js — Finance Tracker with Firebase Auth + Firestore (vanilla JS, no frameworks)

/* ---------------------------
   Firebase (ES modules via CDN)
---------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, enableIndexedDbPersistence,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/* ---------------------------
   TODO: Paste your Firebase config here
   (Find it in Firebase console → Project settings → Your apps → SDK setup)
---------------------------- */
/* 
const firebaseConfig = {
  apiKey: "PASTE_HERE",
  authDomain: "PASTE_HERE.firebaseapp.com",
  projectId: "PASTE_HERE",
  storageBucket: "PASTE_HERE.appspot.com",
  messagingSenderId: "PASTE_HERE",
  appId: "PASTE_HERE"
}; 
*/

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

// Offline support: cache Firestore in IndexedDB so it works without internet
enableIndexedDbPersistence(db).catch(() => {
  // Fallback if multiple tabs or unsupported: it's fine, app still works online
});

/* ---------------------------
   App state
---------------------------- */
// If you prefer South African Rand, set 'R' or use Intl.NumberFormat:
const CURRENCY_SYMBOL = 'R';
let transactions = [];   // {id, date, type, category, description, amount, userId, createdAt}
let unsubscribe = null;  // Firestore listener
let editingId = null;    // currently edited transaction id

/* ---------------------------
   DOM helpers
---------------------------- */
const $ = (sel) => document.querySelector(sel);
const appMain = $('#app');
const appFooter = $('#appFooter');
const authBox = $('#authBox');
const authStatus = $('#authStatus');
const userEmailEl = $('#userEmail');

const emailInput = $('#email');
const passwordInput = $('#password');
const loginBtn = $('#loginBtn');
const registerBtn = $('#registerBtn');
const logoutBtn = $('#logoutBtn');

// Existing elements from your UI
const totalIncomeEl = $('#totalIncome');
const totalExpenseEl = $('#totalExpense');
const totalBalanceEl = $('#totalBalance');

const form = $('#transactionForm');
const formTitle = $('#formTitle');
const cancelEditBtn = $('#cancelEdit');

const dateInput = $('#date');
const typeInput = $('#type');
const categoryInput = $('#category');
const amountInput = $('#amount');
const descInput = $('#description');

const filterMonthInput = $('#filterMonth');
const filterTypeInput = $('#filterType');
const searchTextInput = $('#searchText');

const tbody = $('#transactionBody');

const exportJsonBtn = $('#exportJson');
const exportCsvBtn = $('#exportCsv');
const importJsonInput = $('#importJson');

// Category dropdown + manager
const categorySelect = document.querySelector('#category');
const newCategoryNameInput = document.querySelector('#newCategoryName');
const addCategoryBtn = document.querySelector('#addCategoryBtn');
const categoryListDiv = document.querySelector('#categoryList');

/* ---------------------------
   Utility functions
---------------------------- */
function formatAmount(num) {
  const n = Number(num || 0);
  return `${CURRENCY_SYMBOL} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function uidLike() {
  return 't_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ---------------------------
   Auth handlers
---------------------------- */
loginBtn?.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const pass = passwordInput.value;
  if (!email || !pass) return setAuthStatus('Enter email and password.');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    setAuthStatus('');
  } catch (e) {
    setAuthStatus('Sign-in failed: ' + e.message);
  }
});

let categories = [];      // array of { id, name, userId, createdAt }
let unsubscribeCats = null;

// Start/stop categories realtime listener when user signs in/out
function startRealtimeCategories(user) {
  if (unsubscribeCats) { unsubscribeCats(); unsubscribeCats = null; }
  const cq = query(
    collection(db, 'categories'),
    where('userId', '==', user.uid),
    orderBy('name', 'asc') // alphabetic
  );
  unsubscribeCats = onSnapshot(cq, (snap) => {
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCategoryOptions();
    renderCategoryList();
  }, (err) => {
    console.error('[RT] categories error', err);
    setAuthStatus('Could not load categories: ' + err.message);
  });
}

function stopRealtimeCategories() {
  if (unsubscribeCats) { unsubscribeCats(); unsubscribeCats = null; }
  categories = [];
  renderCategoryOptions();
  renderCategoryList();
}

registerBtn?.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const pass = passwordInput.value;
  if (!email || !pass) return setAuthStatus('Enter email and password.');
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    setAuthStatus('Account created. You are now signed in.');
  } catch (e) {
    setAuthStatus('Create failed: ' + e.message);
  }
});

//logoutBtn?.addEventListener('click', () => signOut(auth));

logoutBtn?.addEventListener('click', async () => {
  await signOut(auth);

  // Clear login fields
  emailInput.value = "";
  passwordInput.value = "";

  // Also clear status messages if any
  if (authStatus) authStatus.textContent = "";

  console.log("User signed out and fields cleared");
});

function setAuthStatus(msg) {
  if (authStatus) authStatus.textContent = msg;
}

/* ---------------------------
   Firestore listeners
---------------------------- */
function startRealtime(user) {
  // Stop previous listener
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  // Listen to current user's transactions, newest first
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
    console.error('Realtime error', err);
    setAuthStatus('Could not load data: ' + err.message);
  });
}

function stopRealtime() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

/* ---------------------------
   UI show/hide on auth state
---------------------------- */
onAuthStateChanged(auth, (user) => {
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
    // Start listening to data
    startRealtime(user);
    startRealtimeCategories(user);
  } else {
    // Hide app
    stopRealtime();
    stopRealtimeCategories();
    appMain?.classList.add('hidden');
    appFooter?.classList.add('hidden');
    authBox?.classList.remove('hidden');
    
    
    // Clear fields on showing login box
    emailInput.value = "";
    passwordInput.value = "";
    if (authStatus) authStatus.textContent = "";
    
    transactions = [];
    render();
  }
});

/* ---------------------------
   Form & actions (same as before, but using Firestore)
---------------------------- */
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return setAuthStatus('Please sign in.');

  const t = {
    date: dateInput.value,
    type: typeInput.value === 'income' ? 'income' : 'expense',
    category: (categoryInput.value || '').trim(),
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
  
  //old:
  //categoryInput.value = t.category;
  
  // Ensure the category option exists; if user deleted it, still show as selected temporarily
  renderCategoryOptions();
  if (categorySelect) {
    // If the category no longer exists, add it as a temporary option
    if (![...categorySelect.options].some(o => o.value === t.category)) {
      const opt = document.createElement('option');
      opt.value = t.category;
      opt.textContent = t.category + ' (deleted)';
      categorySelect.appendChild(opt);
    }
    categorySelect.value = t.category;
  }

  amountInput.value = String(t.amount);
  descInput.value = t.description || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------------------
   Rendering & filters
---------------------------- */
function applyFilters(list) {
  const month = filterMonthInput.value; // "YYYY-MM"
  const type = filterTypeInput.value;   // 'all'|'income'|'expense'
  const qtxt = (searchTextInput.value || '').trim().toLowerCase();
  return list.filter(t => {
    const matchesMonth = month ? t.date.startsWith(month) : true;
    const matchesType = type === 'all' ? true : t.type === type;
    const matchesText = qtxt
      ? (t.category.toLowerCase().includes(qtxt) || (t.description || '').toLowerCase().includes(qtxt))
      : true;
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
  if (totalIncomeEl) totalIncomeEl.textContent = formatAmount(income);
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


function renderCategoryOptions() {
  if (!categorySelect) return;
  categorySelect.innerHTML = '';

  // Add a placeholder option
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Select category...';
  ph.disabled = true;
  ph.selected = true;
  categorySelect.appendChild(ph);

  // Add each category
  for (const c of categories) {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    categorySelect.appendChild(opt);
  }

  // If editing a transaction, keep its category selected
  // (The editing function sets the select value explicitly)
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
        <th style="width:120px;">Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  for (const c of categories) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = c.name;

    const tdActions = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'small secondary';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (confirm(`Delete category "${c.name}"?`)) {
        try { await deleteDoc(doc(db, 'categories', c.id)); }
        catch (e) { alert('Delete failed: ' + e.message); }
      }
    });

    tdActions.appendChild(delBtn);
    tr.appendChild(tdName);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }

  categoryListDiv.innerHTML = '';
  categoryListDiv.appendChild(table);
}


addCategoryBtn?.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return setAuthStatus('Please sign in.');

  const name = (newCategoryNameInput.value || '').trim();
  if (!name) return alert('Please enter a category name.');

  // Prevent duplicates (case-insensitive)
  const exists = categories.some(c => c.name.toLowerCase() === name.toLowerCase());
  if (exists) return alert('This category already exists.');

  try {
    await addDoc(collection(db, 'categories'), {
      name,
      userId: user.uid,
      createdAt: serverTimestamp()
    });
    newCategoryNameInput.value = '';
  } catch (e) {
    alert('Add category failed: ' + e.message);
  }
});

const t = {
  date: dateInput.value,
  type: typeInput.value === 'income' ? 'income' : 'expense',
  category: (categorySelect.value || '').trim(),   // <-- changed
  description: (descInput.value || '').trim(),
  amount: Number(amountInput.value),
  userId: user.uid,
  createdAt: serverTimestamp()
};

/* ---------------------------
   Filters & Export/Import events
---------------------------- */
filterMonthInput?.addEventListener('input', render);
filterTypeInput?.addEventListener('change', render);
searchTextInput?.addEventListener('input', render);

// Export JSON uses the in-memory list (already loaded from Firestore)
exportJsonBtn?.addEventListener('click', () => {
  downloadBlob('transactions.json', 'application/json', JSON.stringify(transactions, null, 2));
});

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

// Import JSON: create docs for current user
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

/* ---------------------------
   Small helpers
---------------------------- */
function downloadBlob(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
