(function () {
  'use strict';

  const STORAGE_KEY = 'dario.tasks.v1';
  const SEEDED_KEY = 'dario.tasks.seeded.v1';

  const CATEGORIES = {
    SOLA: 'SOLA',
    PM: 'PM Solutions',
    DB: 'DB Meble',
    Agenci: 'Agenci',
    Osobiste: 'Osobiste'
  };

  const PRIO_LABEL = {
    urgent: '🔴 Pilne',
    important: '🟡 Ważne',
    normal: '🟢 Normalny'
  };

  const PRIO_ORDER = { urgent: 0, important: 1, normal: 2 };
  const STATUS_ORDER = { doing: 0, todo: 1, done: 2 };
  const STATUS_NEXT = { todo: 'doing', doing: 'done', done: 'todo' };

  const SEED_TASKS = [
    // SOLA
    { name: 'Fix karta Finanse', cat: 'SOLA', prio: 'urgent' },
    { name: 'Testy UI rejestracji', cat: 'SOLA', prio: 'important' },
    { name: 'Usunięcie testowych userów', cat: 'SOLA', prio: 'important' },
    { name: 'LyraGlobe.jsx', cat: 'SOLA', prio: 'normal' },
    // PM Solutions
    { name: 'Logo fix', cat: 'PM', prio: 'urgent' },
    { name: 'FAQ treść', cat: 'PM', prio: 'important' },
    { name: 'Zdjęcia zakładek', cat: 'PM', prio: 'important' },
    { name: 'Ukrycie starych produktów', cat: 'PM', prio: 'important' },
    { name: 'Nowe opisy', cat: 'PM', prio: 'normal' },
    // DB Meble
    { name: 'LinkedIn Bejot Linje (dziś)', cat: 'DB', prio: 'urgent' },
    { name: 'Plan postów maj', cat: 'DB', prio: 'important' },
    // Agenci
    { name: '6 emaili → 1 agent Make', cat: 'Agenci', prio: 'important' },
    { name: 'Agent Wiedzy Produktowej', cat: 'Agenci', prio: 'important' },
    // Osobiste
    { name: 'Second Brain Faza 1 (Tailscale)', cat: 'Osobiste', prio: 'important' },
    { name: 'Analiza telefonu ADB', cat: 'Osobiste', prio: 'normal' },
    { name: 'Lista zadań (ta appka) — wdrożenie', cat: 'Osobiste', prio: 'normal' }
  ];

  let state = {
    tasks: [],
    filterCat: 'ALL',
    filterStatus: 'ACTIVE'
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state.tasks = JSON.parse(raw);
    } catch (e) {
      console.warn('Storage load failed', e);
      state.tasks = [];
    }

    if (!localStorage.getItem(SEEDED_KEY)) {
      const now = Date.now();
      SEED_TASKS.forEach((t, i) => {
        state.tasks.push({
          id: 'seed-' + now + '-' + i,
          name: t.name,
          cat: t.cat,
          prio: t.prio,
          status: 'todo',
          createdAt: now + i
        });
      });
      localStorage.setItem(SEEDED_KEY, '1');
      save();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
    } catch (e) {
      alert('Błąd zapisu: ' + e.message);
    }
  }

  function uid() {
    return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function addTask(name, cat, prio) {
    state.tasks.push({
      id: uid(),
      name: name.trim(),
      cat: cat,
      prio: prio,
      status: 'todo',
      createdAt: Date.now()
    });
    save();
    render();
  }

  function toggleStatus(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.status = STATUS_NEXT[t.status] || 'todo';
    if (t.status === 'done') t.doneAt = Date.now();
    save();
    render();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    save();
    render();
  }

  function clearArchive() {
    const archived = state.tasks.filter(t => t.status === 'done').length;
    if (!archived) {
      alert('Archiwum jest puste.');
      return;
    }
    if (!confirm('Usunąć ' + archived + ' zarchiwizowanych zadań na stałe?')) return;
    state.tasks = state.tasks.filter(t => t.status !== 'done');
    save();
    render();
  }

  function getFiltered() {
    return state.tasks.filter(t => {
      if (state.filterCat !== 'ALL' && t.cat !== state.filterCat) return false;
      if (state.filterStatus === 'ACTIVE') return t.status !== 'done';
      if (state.filterStatus === 'ARCHIVE') return t.status === 'done';
      return t.status === state.filterStatus;
    }).sort((a, b) => {
      const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (s !== 0) return s;
      const p = PRIO_ORDER[a.prio] - PRIO_ORDER[b.prio];
      if (p !== 0) return p;
      return a.createdAt - b.createdAt;
    });
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return 'dziś';
    if (diffDays === 1) return 'wczoraj';
    if (diffDays < 7) return diffDays + ' dni temu';
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  }

  function renderStats() {
    const todo = state.tasks.filter(t => t.status === 'todo').length;
    const doing = state.tasks.filter(t => t.status === 'doing').length;
    const done = state.tasks.filter(t => t.status === 'done').length;
    document.getElementById('stat-todo').textContent = todo;
    document.getElementById('stat-doing').textContent = doing;
    document.getElementById('stat-done').textContent = done;
  }

  function render() {
    const ul = document.getElementById('task-list');
    const tpl = document.getElementById('task-item-tpl');
    const empty = document.getElementById('empty-state');
    ul.innerHTML = '';

    const filtered = getFiltered();

    if (!filtered.length) {
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      filtered.forEach(t => {
        const node = tpl.content.firstElementChild.cloneNode(true);
        node.dataset.id = t.id;
        node.dataset.status = t.status;
        node.querySelector('.task-name').textContent = t.name;
        const catEl = node.querySelector('.badge.cat');
        catEl.textContent = CATEGORIES[t.cat] || t.cat;
        const prioEl = node.querySelector('.badge.prio');
        prioEl.textContent = PRIO_LABEL[t.prio];
        prioEl.classList.add(t.prio);
        node.querySelector('.date').textContent = formatDate(t.doneAt || t.createdAt);

        node.querySelector('.status-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleStatus(t.id);
        });
        node.querySelector('.task-main').addEventListener('click', () => toggleStatus(t.id));
        node.querySelector('.del-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('Usunąć zadanie: "' + t.name + '"?')) deleteTask(t.id);
        });

        ul.appendChild(node);
      });
    }

    renderStats();
  }

  function bindFilters() {
    document.getElementById('filter-cat').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.filterCat = btn.dataset.cat;
      document.querySelectorAll('#filter-cat .chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      render();
    });

    document.getElementById('filter-status').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.filterStatus = btn.dataset.status;
      document.querySelectorAll('#filter-status .chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  }

  function bindForm() {
    document.getElementById('add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('task-name').value.trim();
      const cat = document.getElementById('task-cat').value;
      const prio = document.getElementById('task-prio').value;
      if (!name) return;
      addTask(name, cat, prio);
      document.getElementById('task-name').value = '';
      document.getElementById('task-name').focus();
    });
  }

  function bindFooter() {
    document.getElementById('clear-archive').addEventListener('click', clearArchive);

    document.getElementById('export-data').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.tasks, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zadania-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('import-data').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!Array.isArray(data)) throw new Error('Nieprawidłowy format');
          if (!confirm('Zastąpić ' + state.tasks.length + ' obecnych zadań ' + data.length + ' z pliku?')) return;
          state.tasks = data;
          save();
          render();
        } catch (err) {
          alert('Błąd importu: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW reg failed', err));
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    bindForm();
    bindFilters();
    bindFooter();
    render();
    registerSW();
  });
})();
