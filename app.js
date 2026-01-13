
// Simple income & expense tracker using localStorage.
// Everything is commented for beginner-friendly understanding.

(() => {
  const STORAGE_KEY = 'finance.transactions.v1';
  const CURRENCY_SYMBOL = 'R'; // Change to your preferred symbol: '$', '€', '£', 'R', etc.

  // -------------------------------
  // Utilities
  // -------------------------------
  const $ = (sel) => document.querySelector(sel);

  // Format numbers like currency (without requiring a currency code)
  function formatAmount(num) {
    // Ensure number, keep 2 decimal places
    const n = Number(num || 0);
    return `${CURRENCY_SYMBOL} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Generate simple unique IDs (sufficient for local use)
  function uid() {
    return 't_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // -------------------------------
  // State (in-memory)
  // -------------------------------
  let transactions = [];  // array of {id, date:'YYYY-MM-DD', type:'income'|'expense', category, description, amount:number}
  let editingId = null;   // track which transaction is being edited (null means add mode)

  // -------------------------------
  // Load & Save from localStorage
  // -------------------------------
  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          transactions = parsed.map(t => ({
            id: t.id || uid(),
            date: t.date || new Date().toISOString().slice(0,10),
            type: t.type === 'income' ? 'income' : 'expense',
            category: t.category || 'General',
            description: t.description || '',
            amount: Number(t.amount) || 0
          }));
        }
      }
    } catch (e) {
      console.error('Failed to load from localStorage', e);
    }
  }

  function saveTransactions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  // -------------------------------
  // DOM elements
  // -------------------------------
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

  // -------------------------------
  // Initial setup
  // -------------------------------
  function init() {
    // Default date = today
    dateInput.value = new Date().toISOString().slice(0, 10);

    // Default filters
    const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
    filterMonthInput.value = ym;
    filterTypeInput.value = 'all';

    loadTransactions();
    render();
    attachEvents();
  }

  // -------------------------------
  // Event listeners
  // -------------------------------
  function attachEvents() {
    form.addEventListener('submit', onFormSubmit);
    cancelEditBtn.addEventListener('click', resetForm);

    filterMonthInput.addEventListener('input', render);
    filterTypeInput.addEventListener('change', render);
    searchTextInput.addEventListener('input', render);

    exportJsonBtn.addEventListener('click', exportJson);
    exportCsvBtn.addEventListener('click', exportCsv);
    importJsonInput.addEventListener('change', importJson);
  }

  // -------------------------------
  // Form handlers (Add / Edit)
  // -------------------------------
  function onFormSubmit(e) {
    e.preventDefault();

    // Gather values
    const t = {
      date: dateInput.value,
      type: typeInput.value,
      category: (categoryInput.value || '').trim(),
      description: (descInput.value || '').trim(),
      amount: Number(amountInput.value)
    };

    // Basic validation
    if (!t.date || !t.type || !t.category || !(t.amount > 0)) {
      alert('Please fill all required fields with valid values.');
      return;
    }

    if (editingId) {
      // Update existing
      const idx = transactions.findIndex(x => x.id === editingId);
      if (idx >= 0) {
        transactions[idx] = { ...transactions[idx], ...t };
        saveTransactions();
        resetForm();
        render();
      }
    } else {
      // Add new
      const newItem = { id: uid(), ...t };
      transactions.unshift(newItem); // newest first
      saveTransactions();
      form.reset();
      dateInput.value = new Date().toISOString().slice(0, 10);
      render();
    }
  }

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
    categoryInput.value = t.category;
    amountInput.value = String(t.amount);
    descInput.value = t.description || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // -------------------------------
  // Rendering
  // -------------------------------
  function applyFilters(list) {
    const month = filterMonthInput.value; // "YYYY-MM"
    const type = filterTypeInput.value;   // 'all' | 'income' | 'expense'
    const q = (searchTextInput.value || '').trim().toLowerCase();

    return list.filter(t => {
      const matchesMonth = month ? t.date.startsWith(month) : true;
      const matchesType = type === 'all' ? true : t.type === type;
      const matchesText = q
        ? (t.category.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
        : true;
      return matchesMonth && matchesType && matchesText;
    });
  }

  function computeTotals(list) {
    let income = 0, expense = 0;
    for (const t of list) {
      if (t.type === 'income') income += t.amount;
      else expense += t.amount;
    }
    const balance = income - expense;
    return { income, expense, balance };
  }

  function render() {
    const filtered = applyFilters(transactions);

    // Totals
    const { income, expense, balance } = computeTotals(filtered);
    totalIncomeEl.textContent = formatAmount(income);
    totalExpenseEl.textContent = formatAmount(expense);
    totalBalanceEl.textContent = formatAmount(balance);

    // Table rows
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
      delBtn.addEventListener('click', () => {
        if (confirm('Delete this transaction?')) {
          transactions = transactions.filter(x => x.id !== t.id);
          saveTransactions();
          render();
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

  // -------------------------------
  // Export / Import
  // -------------------------------
  function downloadBlob(filename, mime, text) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const json = JSON.stringify(transactions, null, 2);
    downloadBlob('transactions.json', 'application/json', json);
  }

  function exportCsv() {
    // Simple CSV (be careful with commas in text; wrap in quotes)
    const header = ['id','date','type','category','description','amount'];
    const rows = transactions.map(t => ([
      t.id,
      t.date,
      t.type,
      csvEscape(t.category),
      csvEscape(t.description || ''),
      t.amount
    ]));
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadBlob('transactions.csv', 'text/csv', csv);

    function csvEscape(str) {
      const s = String(str || '');
      // Replace double-quotes with two double-quotes and wrap in quotes
      return `"${s.replace(/"/g, '""')}"`;
    }
  }

  function importJson(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('Invalid file: expected an array');
        // Basic validation
        transactions = data.map(t => ({
          id: t.id || uid(),
          date: t.date || new Date().toISOString().slice(0,10),
          type: t.type === 'income' ? 'income' : 'expense',
          category: t.category || 'General',
          description: t.description || '',
          amount: Number(t.amount) || 0
        }));
        saveTransactions();
        render();
        alert('Import completed.');
      } catch (err) {
        console.error(err);
        alert('Import failed. Ensure the JSON structure matches the exported format.');
      } finally {
        importJsonInput.value = ''; // reset input
      }
    };
    reader.readAsText(file);
  }

  // -------------------------------
  // Start
  // -------------------------------
  init();
})();
