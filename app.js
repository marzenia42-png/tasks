(function () {
  'use strict';

  const CACHE_KEY = 'dario.tasks.cache.v2';
  const CFG = window.SUPABASE_CONFIG || {};
  const TABLE = CFG.table || 'dario_tasks';
  const HAS_CFG = CFG.url && CFG.anonKey && !CFG.url.startsWith('PLACEHOLDER');

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

  const STATUS_LABEL = {
    todo: 'Do zrobienia',
    doing: 'W toku',
    done: 'Zrobione',
    idea: 'Pomysł',
    abandoned: 'Porzucone'
  };

  const PRIO_ORDER = { urgent: 0, important: 1, normal: 2 };
  const STATUS_ORDER = { doing: 0, todo: 1, idea: 2, done: 3, abandoned: 4 };
  const STATUS_NEXT = { todo: 'doing', doing: 'done', done: 'todo', idea: 'todo', abandoned: 'todo' };

  let state = {
    tasks: [],
    filterCat: 'ALL',
    filterStatus: 'ACTIVE',
    filterSubcat: 'ALL',
    search: '',
    connected: false,
    loading: true
  };

  let supabase = null;

  function setConnStatus(text, cls) {
    const el = document.getElementById('conn-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'conn ' + (cls || '');
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) state.tasks = JSON.parse(raw);
    } catch (e) {
      console.warn('Cache load failed', e);
    }
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(state.tasks));
    } catch (e) {
      console.warn('Cache save failed', e);
    }
  }

  async function fetchAll() {
    if (!supabase) return;
    state.loading = true;
    renderLoading();
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });
    state.loading = false;
    if (error) {
      console.error('Fetch error', error);
      setConnStatus('● offline (cache)', 'offline');
      render();
      return;
    }
    state.tasks = data || [];
    state.connected = true;
    setConnStatus('● live', 'online');
    saveCache();
    render();
  }

  async function addTask(name, category, priority) {
    const optimistic = {
      id: 'temp-' + Date.now(),
      name: name.trim(),
      category: category,
      subcategory: 'Manualne',
      priority: priority,
      status: 'todo',
      created_at: new Date().toISOString(),
      _optimistic: true
    };
    state.tasks.push(optimistic);
    render();

    if (!supabase) return;
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        name: optimistic.name,
        category: category,
        subcategory: 'Manualne',
        priority: priority,
        status: 'todo'
      })
      .select()
      .single();
    if (error) {
      alert('Błąd dodawania: ' + error.message);
      state.tasks = state.tasks.filter(t => t.id !== optimistic.id);
      render();
      return;
    }
    Object.assign(optimistic, data);
    delete optimistic._optimistic;
    saveCache();
    render();
  }

  async function toggleStatus(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    const nextStatus = STATUS_NEXT[t.status] || 'todo';
    const prevStatus = t.status;
    t.status = nextStatus;
    if (nextStatus === 'done') t.done_at = new Date().toISOString();
    render();
    saveCache();

    if (!supabase || String(id).startsWith('temp-')) return;
    const { error } = await supabase
      .from(TABLE)
      .update({ status: nextStatus })
      .eq('id', id);
    if (error) {
      console.error('Update error', error);
      t.status = prevStatus;
      render();
    }
  }

  async function deleteTask(id) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const removed = state.tasks.splice(idx, 1)[0];
    render();
    saveCache();

    if (!supabase || String(id).startsWith('temp-')) return;
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) {
      console.error('Delete error', error);
      state.tasks.splice(idx, 0, removed);
      render();
    }
  }

  function getFiltered() {
    const q = state.search.trim().toLowerCase();
    return state.tasks.filter(t => {
      if (state.filterCat !== 'ALL' && t.category !== state.filterCat) return false;
      if (state.filterStatus === 'ACTIVE') {
        if (t.status === 'done' || t.status === 'abandoned' || t.status === 'idea') return false;
      } else if (state.filterStatus === 'ARCHIVE') {
        if (t.status !== 'done') return false;
      } else {
        if (t.status !== state.filterStatus) return false;
      }
      if (state.filterSubcat !== 'ALL' && (t.subcategory || '') !== state.filterSubcat) return false;
      if (q) {
        const hay = (t.name + ' ' + (t.subcategory || '') + ' ' + (t.source || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort((a, b) => {
      const s = (STATUS_ORDER[a.status] != null ? STATUS_ORDER[a.status] : 9) - (STATUS_ORDER[b.status] != null ? STATUS_ORDER[b.status] : 9);
      if (s !== 0) return s;
      const p = (PRIO_ORDER[a.priority] != null ? PRIO_ORDER[a.priority] : 9) - (PRIO_ORDER[b.priority] != null ? PRIO_ORDER[b.priority] : 9);
      if (p !== 0) return p;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  }

  function uniqueSubcats() {
    if (state.filterCat === 'ALL') return [];
    const set = new Set();
    state.tasks.forEach(t => {
      if (t.category === state.filterCat && t.subcategory) set.add(t.subcategory);
    });
    return Array.from(set).sort();
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return 'dziś';
    if (diffDays === 1) return 'wczoraj';
    if (diffDays < 7) return diffDays + ' dni temu';
    if (diffDays > 365) return d.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
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

  function renderSubcats() {
    const box = document.getElementById('filter-subcat');
    const subs = uniqueSubcats();
    if (state.filterCat === 'ALL' || subs.length < 2) {
      box.style.display = 'none';
      box.innerHTML = '';
      state.filterSubcat = 'ALL';
      return;
    }
    box.style.display = 'flex';
    box.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'chip' + (state.filterSubcat === 'ALL' ? ' active' : '');
    all.textContent = 'wszystkie ' + state.filterCat;
    all.dataset.subcat = 'ALL';
    box.appendChild(all);
    subs.forEach(s => {
      const b = document.createElement('button');
      b.className = 'chip' + (state.filterSubcat === s ? ' active' : '');
      b.textContent = s.toLowerCase();
      b.dataset.subcat = s;
      box.appendChild(b);
    });
  }

  function renderLoading() {
    const loading = document.getElementById('loading-state');
    if (loading) loading.style.display = state.loading ? 'block' : 'none';
  }

  function render() {
    const ul = document.getElementById('task-list');
    const tpl = document.getElementById('task-item-tpl');
    const empty = document.getElementById('empty-state');
    const loading = document.getElementById('loading-state');
    ul.innerHTML = '';

    if (loading) loading.style.display = state.loading ? 'block' : 'none';
    if (state.loading) { empty.style.display = 'none'; return; }

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
        node.querySelector('.badge.cat').textContent = CATEGORIES[t.category] || t.category;

        const prioEl = node.querySelector('.badge.prio');
        prioEl.textContent = PRIO_LABEL[t.priority] || t.priority;
        prioEl.classList.add(t.priority);

        const subcatEl = node.querySelector('.badge.subcat');
        if (t.subcategory && t.subcategory !== t.category && t.subcategory !== 'Manualne') {
          subcatEl.textContent = t.subcategory.toLowerCase();
          subcatEl.style.display = '';
        } else {
          subcatEl.style.display = 'none';
        }

        const dateEl = node.querySelector('.date');
        if (t.due_date) {
          dateEl.textContent = '📅 ' + new Date(t.due_date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit' });
        } else {
          dateEl.textContent = formatDate(t.done_at || t.created_at);
        }

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
    renderSubcats();
  }

  function bindFilters() {
    document.getElementById('filter-cat').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.filterCat = btn.dataset.cat;
      state.filterSubcat = 'ALL';
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

    document.getElementById('filter-subcat').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.filterSubcat = btn.dataset.subcat;
      render();
    });

    const search = document.getElementById('search-input');
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.search = search.value;
        render();
      }, 150);
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
    document.getElementById('refresh-data').addEventListener('click', fetchAll);

    document.getElementById('export-data').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.tasks, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zadania-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function subscribeRealtime() {
    if (!supabase) return;
    supabase
      .channel('public:' + TABLE)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        if (payload.eventType === 'INSERT') {
          if (!state.tasks.find(t => t.id === payload.new.id)) {
            state.tasks.push(payload.new);
          }
        } else if (payload.eventType === 'UPDATE') {
          const i = state.tasks.findIndex(t => t.id === payload.new.id);
          if (i >= 0) state.tasks[i] = payload.new;
        } else if (payload.eventType === 'DELETE') {
          state.tasks = state.tasks.filter(t => t.id !== payload.old.id);
        }
        saveCache();
        render();
      })
      .subscribe();
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW reg failed', err));
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadCache();
    bindForm();
    bindFilters();
    bindFooter();

    if (HAS_CFG && typeof window.supabase !== 'undefined') {
      supabase = window.supabase.createClient(CFG.url, CFG.anonKey);
      setConnStatus('● łączenie…', 'pending');
      fetchAll().then(() => subscribeRealtime());
    } else {
      state.loading = false;
      state.tasks = state.tasks || [];
      setConnStatus('● bez Supabase (config)', 'offline');
      render();
    }

    registerSW();
  });
})();
