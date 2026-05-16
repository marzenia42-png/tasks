(function () {
  'use strict';

  const CACHE_KEY = 'dario.tasks.cache.v3';
  const CFG = window.SUPABASE_CONFIG || {};
  const TABLE = CFG.table || 'dario_tasks';
  const BUCKET = 'task-images';
  const HAS_CFG = CFG.url && CFG.anonKey && !CFG.url.startsWith('PLACEHOLDER');

  const AREAS = {
    praca:    { emoji: '💼', label: 'Praca',    color: '#4A8FB8' },
    zdrowie:  { emoji: '💚', label: 'Zdrowie',  color: '#7BA86A' },
    relacje:  { emoji: '❤️', label: 'Relacje',  color: '#D44A3A' },
    finanse:  { emoji: '💰', label: 'Finanse',  color: '#C9A96E' },
    hobby:    { emoji: '🎯', label: 'Hobby',    color: '#B88B1E' },
    marzenia: { emoji: '✨', label: 'Marzenia', color: '#8B6FB8' }
  };

  const PRIO_LABEL  = { urgent: '🔴 Pilne', important: '🟡 Ważne', normal: '🟢 Normalny' };
  const STATUS_LABEL = { todo: 'Do zrobienia', doing: 'W toku', done: 'Zrobione', idea: 'Pomysł', abandoned: 'Porzucone' };
  const PRIO_ORDER   = { urgent: 0, important: 1, normal: 2 };
  const STATUS_ORDER = { doing: 0, todo: 1, idea: 2, done: 3, abandoned: 4 };
  const STATUS_NEXT  = { todo: 'doing', doing: 'done', done: 'todo', idea: 'todo', abandoned: 'todo' };

  let state = {
    tasks: [],
    view: 'areas',           // 'areas' | 'projects' | 'tasks'
    currentArea: null,
    currentSubcat: null,
    filterStatus: 'ACTIVE',
    search: '',
    loading: true,
    detailTask: null
  };

  let supabase = null;

  // ============= STORAGE / CACHE =============

  function loadCache() {
    try { const raw = localStorage.getItem(CACHE_KEY); if (raw) state.tasks = JSON.parse(raw); } catch (e) {}
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(state.tasks)); } catch (e) {}
  }

  function setConnStatus(text, cls) {
    const el = document.getElementById('conn-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'conn ' + (cls || '');
  }

  // ============= SUPABASE CRUD =============

  async function fetchAll() {
    if (!supabase) return;
    state.loading = true;
    renderCurrent();
    const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: true });
    state.loading = false;
    if (error) {
      console.error(error);
      setConnStatus('● offline (cache)', 'offline');
      renderCurrent();
      return;
    }
    state.tasks = data || [];
    setConnStatus('● live', 'online');
    saveCache();
    renderCurrent();
  }

  async function createTask(payload) {
    if (!supabase) return null;
    const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
    if (error) { alert('Błąd dodawania: ' + error.message); return null; }
    return data;
  }

  async function updateTask(id, patch) {
    const t = state.tasks.find(x => x.id === id);
    if (t) Object.assign(t, patch);
    saveCache();
    renderCurrent();
    if (!supabase || String(id).startsWith('temp-')) return;
    const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
    if (error) { console.error(error); alert('Błąd zapisu: ' + error.message); }
  }

  async function deleteTaskRow(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveCache();
    renderCurrent();
    if (!supabase || String(id).startsWith('temp-')) return;
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) console.error(error);
  }

  // ============= NAVIGATION =============

  function goAreas() {
    state.view = 'areas';
    state.currentArea = null;
    state.currentSubcat = null;
    renderCurrent();
  }
  function goProjects(area) {
    state.view = 'projects';
    state.currentArea = area;
    state.currentSubcat = null;
    renderCurrent();
  }
  function goTasks(area, subcat) {
    state.view = 'tasks';
    state.currentArea = area;
    state.currentSubcat = subcat;
    renderCurrent();
  }
  function goBack() {
    if (state.view === 'tasks') goProjects(state.currentArea);
    else if (state.view === 'projects') goAreas();
  }

  // ============= STATUS TOGGLE (z confirm + undo) =============

  async function toggleStatus(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    const next = STATUS_NEXT[t.status] || 'todo';
    const labelNext = STATUS_LABEL[next] || next;
    if (!confirm('Oznaczyć jako: ' + labelNext + '?\n\n„' + t.name.substring(0, 80) + (t.name.length > 80 ? '…' : '') + '"')) return;
    const prevStatus = t.status;
    await applyStatus(t, next);
    showUndoToast(t, prevStatus, labelNext);
  }

  async function applyStatus(t, status) {
    const patch = { status };
    if (status === 'done') patch.done_at = new Date().toISOString();
    else if (t.done_at) patch.done_at = null;
    await updateTask(t.id, patch);
  }

  let undoTimer = null;
  function showUndoToast(task, prevStatus, labelDone) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-msg');
    const btn = document.getElementById('toast-undo');
    if (!toast) return;
    msg.textContent = labelDone;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(undoTimer);
    const hide = () => { toast.classList.remove('show'); setTimeout(() => { toast.hidden = true; }, 250); };
    undoTimer = setTimeout(hide, 5000);
    btn.onclick = async () => { clearTimeout(undoTimer); hide(); await applyStatus(task, prevStatus); };
  }

  // ============= RENDER ROUTING =============

  function renderCurrent() {
    document.getElementById('view-areas').hidden    = state.view !== 'areas';
    document.getElementById('view-projects').hidden = state.view !== 'projects';
    document.getElementById('view-tasks').hidden    = state.view !== 'tasks';
    document.getElementById('back-btn').hidden      = state.view === 'areas';
    document.getElementById('loading-state').hidden = !state.loading;

    const title = document.getElementById('page-title');
    const bc = document.getElementById('breadcrumb');
    if (state.view === 'areas') {
      title.innerHTML = 'Zadania <span class="hl">Dario</span>';
      bc.hidden = true;
    } else if (state.view === 'projects') {
      title.textContent = AREAS[state.currentArea].emoji + ' ' + AREAS[state.currentArea].label;
      bc.hidden = false;
      bc.innerHTML = '<a href="#" data-go="areas">Wszystkie</a> › <strong>' + AREAS[state.currentArea].label + '</strong>';
    } else {
      title.textContent = state.currentSubcat;
      bc.hidden = false;
      bc.innerHTML = '<a href="#" data-go="areas">Wszystkie</a> › <a href="#" data-go="projects">' + AREAS[state.currentArea].label + '</a> › <strong>' + state.currentSubcat + '</strong>';
    }

    renderStats();
    if (state.view === 'areas') renderAreas();
    else if (state.view === 'projects') renderProjects();
    else renderTasks();
  }

  // ============= POZIOM 1: heksagony =============

  function renderAreas() {
    Object.keys(AREAS).forEach(a => {
      const n = state.tasks.filter(t => t.area === a && t.status !== 'done' && t.status !== 'abandoned').length;
      const el = document.querySelector('[data-area-count="' + a + '"]');
      if (el) el.textContent = n;
    });
  }

  // ============= POZIOM 2: projekty =============

  function renderProjects() {
    const ul = document.getElementById('proj-list');
    const tpl = document.getElementById('proj-item-tpl');
    ul.innerHTML = '';
    const area = state.currentArea;
    const inArea = state.tasks.filter(t => t.area === area);
    const groups = {};
    inArea.forEach(t => {
      const k = t.subcategory || 'Bez kategorii';
      if (!groups[k]) groups[k] = { todo: 0, doing: 0, done: 0, idea: 0, abandoned: 0, total: 0 };
      groups[k][t.status] = (groups[k][t.status] || 0) + 1;
      groups[k].total++;
    });
    const sorted = Object.entries(groups).sort((a, b) => {
      const activeA = a[1].todo + a[1].doing + a[1].idea;
      const activeB = b[1].todo + b[1].doing + b[1].idea;
      if (activeB !== activeA) return activeB - activeA;
      return b[1].total - a[1].total;
    });
    sorted.forEach(([name, counts]) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.subcat = name;
      node.style.setProperty('--area-color', AREAS[area].color);
      node.querySelector('.proj-name').textContent = name;
      const tCount = node.querySelector('.proj-count-todo');
      const dCount = node.querySelector('.proj-count-doing');
      const dnCount = node.querySelector('.proj-count-done');
      if (counts.todo + counts.idea > 0) tCount.textContent = (counts.todo + counts.idea) + ' do zrobienia';
      else tCount.style.display = 'none';
      if (counts.doing > 0) dCount.textContent = counts.doing + ' w toku';
      else dCount.style.display = 'none';
      if (counts.done > 0) dnCount.textContent = '✓ ' + counts.done;
      else dnCount.style.display = 'none';
      node.addEventListener('click', () => goTasks(area, name));
      ul.appendChild(node);
    });
    if (!sorted.length) {
      ul.innerHTML = '<p class="empty">Brak projektów w tej kategorii. Dodaj zadanie żeby utworzyć projekt.</p>';
    }
  }

  // ============= POZIOM 3: zadania =============

  function getFilteredTasks() {
    const q = state.search.trim().toLowerCase();
    return state.tasks.filter(t => {
      if (state.currentArea && t.area !== state.currentArea) return false;
      if (state.currentSubcat && t.subcategory !== state.currentSubcat) return false;
      if (state.filterStatus === 'ACTIVE') {
        if (t.status === 'done' || t.status === 'abandoned' || t.status === 'idea') return false;
      } else if (state.filterStatus === 'ARCHIVE') {
        if (t.status !== 'done') return false;
      } else if (t.status !== state.filterStatus) return false;
      if (q) {
        const hay = (t.name + ' ' + (t.subcategory || '') + ' ' + (t.description || '') + ' ' + (t.notes || '') + ' ' + (t.source || '')).toLowerCase();
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

  function renderTasks() {
    const ul = document.getElementById('task-list');
    const tpl = document.getElementById('task-item-tpl');
    const empty = document.getElementById('empty-state');
    ul.innerHTML = '';
    if (state.loading) { empty.hidden = true; return; }
    const filtered = getFilteredTasks();
    if (!filtered.length) { empty.hidden = false; return; }
    empty.hidden = true;
    filtered.forEach(t => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = t.id;
      node.dataset.status = t.status;
      if (t.area && AREAS[t.area]) node.style.setProperty('--area-color', AREAS[t.area].color);
      node.querySelector('.task-name').textContent = t.name;
      const prioEl = node.querySelector('.badge.prio');
      prioEl.textContent = PRIO_LABEL[t.priority] || t.priority;
      prioEl.classList.add(t.priority);
      const subcatEl = node.querySelector('.badge.subcat');
      if (t.subcategory && t.subcategory !== state.currentSubcat) {
        subcatEl.textContent = t.subcategory.toLowerCase();
      } else {
        subcatEl.style.display = 'none';
      }
      const dateEl = node.querySelector('.date');
      if (t.due_date) dateEl.textContent = '📅 ' + new Date(t.due_date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
      else if (t.images && t.images.length) dateEl.textContent = '📷 ' + t.images.length;
      else dateEl.textContent = '';

      node.querySelector('.status-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleStatus(t.id); });
      node.querySelector('.task-main').addEventListener('click', (e) => {
        if (e.target.closest('.status-btn')) return;
        openDetail(t.id);
      });
      ul.appendChild(node);
    });
  }

  function renderStats() {
    const counts = {
      todo:      state.tasks.filter(t => t.status === 'todo').length,
      doing:     state.tasks.filter(t => t.status === 'doing').length,
      done:      state.tasks.filter(t => t.status === 'done').length,
      idea:      state.tasks.filter(t => t.status === 'idea').length,
      abandoned: state.tasks.filter(t => t.status === 'abandoned').length
    };
    counts.ACTIVE = counts.todo + counts.doing;
    document.getElementById('stat-todo').textContent = counts.todo;
    document.getElementById('stat-doing').textContent = counts.doing;
    document.getElementById('stat-done').textContent = counts.done;
    document.querySelectorAll('.chip-count').forEach(el => {
      const k = el.dataset.count;
      if (counts[k] != null) el.textContent = counts[k];
    });
  }

  // ============= MODAL: TASK DETAIL =============

  function openDetail(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    state.detailTask = t;
    document.getElementById('modal-title-input').value = t.name || '';
    document.getElementById('modal-description').value = t.description || '';
    document.getElementById('modal-notes').value = t.notes || '';
    document.getElementById('modal-status').value = t.status || 'todo';
    document.getElementById('modal-priority').value = t.priority || 'normal';
    document.getElementById('modal-area').value = t.area || 'praca';
    document.getElementById('modal-subcategory').value = t.subcategory || '';
    document.getElementById('modal-due-date').value = t.due_date || '';

    const areaBadge = document.getElementById('modal-area-badge');
    if (t.area && AREAS[t.area]) {
      areaBadge.textContent = AREAS[t.area].emoji + ' ' + AREAS[t.area].label;
      areaBadge.style.background = AREAS[t.area].color;
      areaBadge.style.display = '';
    } else { areaBadge.style.display = 'none'; }

    const subBadge = document.getElementById('modal-subcat-badge');
    if (t.subcategory) { subBadge.textContent = t.subcategory; subBadge.style.display = ''; }
    else subBadge.style.display = 'none';

    const src = document.getElementById('modal-source');
    if (t.source) src.textContent = 'Źródło: ' + t.source;
    else src.textContent = '';

    const gcalLink = document.getElementById('modal-gcal-link');
    if (t.gcal_event_url) {
      gcalLink.href = t.gcal_event_url;
      gcalLink.hidden = false;
    } else { gcalLink.hidden = true; }

    renderModalImages(t);

    document.getElementById('task-modal').hidden = false;
    setTimeout(() => document.getElementById('task-modal').classList.add('show'), 10);
  }

  function closeDetail() {
    const modal = document.getElementById('task-modal');
    modal.classList.remove('show');
    setTimeout(() => { modal.hidden = true; state.detailTask = null; }, 200);
  }

  function renderModalImages(t) {
    const box = document.getElementById('modal-images');
    box.innerHTML = '';
    const imgs = Array.isArray(t.images) ? t.images : [];
    imgs.forEach((url, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'img-thumb';
      wrap.innerHTML = '<img src="' + url + '" alt=""><button class="img-del" title="Usuń">✕</button>';
      wrap.querySelector('img').addEventListener('click', () => window.open(url, '_blank'));
      wrap.querySelector('.img-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Usunąć zdjęcie?')) return;
        const newImgs = imgs.filter((_, j) => j !== i);
        await updateTask(t.id, { images: newImgs });
        t.images = newImgs;
        renderModalImages(t);
      });
      box.appendChild(wrap);
    });
  }

  async function uploadImages(files) {
    if (!supabase || !state.detailTask) return;
    const t = state.detailTask;
    const existing = Array.isArray(t.images) ? t.images : [];
    const uploaded = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = t.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) { console.error('upload', error); alert('Błąd wgrywania: ' + error.message); continue; }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push(data.publicUrl);
    }
    if (uploaded.length) {
      const newImgs = existing.concat(uploaded);
      await updateTask(t.id, { images: newImgs });
      t.images = newImgs;
      renderModalImages(t);
    }
  }

  function addToGCal() {
    const t = state.detailTask;
    if (!t) return;
    const title = encodeURIComponent(t.name || 'Zadanie');
    const details = encodeURIComponent((t.description || '') + (t.notes ? '\n\nNotatki:\n' + t.notes : '') + '\n\nŹródło: Tasks Dario PWA');
    let dates = '';
    if (t.due_date) {
      const d = t.due_date.replace(/-/g, '');
      dates = '&dates=' + d + '/' + d;
    }
    const url = 'https://calendar.google.com/calendar/r/eventedit?text=' + title + '&details=' + details + dates;
    window.open(url, '_blank');
    updateTask(t.id, { gcal_event_url: url });
    t.gcal_event_url = url;
    const link = document.getElementById('modal-gcal-link');
    link.href = url;
    link.hidden = false;
  }

  async function saveModal() {
    const t = state.detailTask;
    if (!t) return;
    const patch = {
      name: document.getElementById('modal-title-input').value.trim(),
      description: document.getElementById('modal-description').value.trim() || null,
      notes: document.getElementById('modal-notes').value.trim() || null,
      status: document.getElementById('modal-status').value,
      priority: document.getElementById('modal-priority').value,
      area: document.getElementById('modal-area').value,
      subcategory: document.getElementById('modal-subcategory').value.trim() || null,
      due_date: document.getElementById('modal-due-date').value || null
    };
    if (!patch.name) { alert('Tytuł nie może być pusty'); return; }
    if (patch.status === 'done' && t.status !== 'done') patch.done_at = new Date().toISOString();
    await updateTask(t.id, patch);
    closeDetail();
  }

  async function deleteModal() {
    const t = state.detailTask;
    if (!t) return;
    if (!confirm('Usunąć zadanie: „' + t.name + '"?\n\nUSUNIĘCIE NIEODWRACALNE.')) return;
    await deleteTaskRow(t.id);
    closeDetail();
  }

  // ============= REAL-TIME =============

  function subscribeRealtime() {
    if (!supabase) return;
    supabase
      .channel('public:' + TABLE)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        if (payload.eventType === 'INSERT') {
          if (!state.tasks.find(t => t.id === payload.new.id)) state.tasks.push(payload.new);
        } else if (payload.eventType === 'UPDATE') {
          const i = state.tasks.findIndex(t => t.id === payload.new.id);
          if (i >= 0) state.tasks[i] = payload.new;
        } else if (payload.eventType === 'DELETE') {
          state.tasks = state.tasks.filter(t => t.id !== payload.old.id);
        }
        saveCache();
        renderCurrent();
      })
      .subscribe();
  }

  // ============= ADD FORM (tylko w view-tasks) =============

  async function addTaskFromForm() {
    const name = document.getElementById('task-name').value.trim();
    const prio = document.getElementById('task-prio').value;
    if (!name) return;
    if (state.view !== 'tasks' || !state.currentArea) {
      alert('Wybierz najpierw obszar i projekt');
      return;
    }
    const optimistic = {
      id: 'temp-' + Date.now(),
      name: name,
      area: state.currentArea,
      category: 'Osobiste',
      subcategory: state.currentSubcat || 'Manualne',
      priority: prio,
      status: 'todo',
      images: [],
      created_at: new Date().toISOString()
    };
    state.tasks.push(optimistic);
    document.getElementById('task-name').value = '';
    renderCurrent();
    if (!supabase) return;
    const created = await createTask({
      name: optimistic.name,
      area: optimistic.area,
      category: optimistic.category,
      subcategory: optimistic.subcategory,
      priority: optimistic.priority,
      status: 'todo'
    });
    if (created) {
      const i = state.tasks.findIndex(t => t.id === optimistic.id);
      if (i >= 0) state.tasks[i] = created;
      saveCache();
      renderCurrent();
    } else {
      state.tasks = state.tasks.filter(t => t.id !== optimistic.id);
      renderCurrent();
    }
  }

  // ============= THEME =============

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dario.tasks.theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#FAF7F0' : '#1A1208');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }
  function bindTheme() {
    const current = localStorage.getItem('dario.tasks.theme') || 'light';
    applyTheme(current);
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(cur === 'light' ? 'dark' : 'light');
    });
  }

  // ============= BINDINGS =============

  function bindNavigation() {
    document.querySelectorAll('.hex').forEach(h => {
      h.addEventListener('click', () => goProjects(h.dataset.area));
    });
    document.getElementById('back-btn').addEventListener('click', goBack);
    document.getElementById('breadcrumb').addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      const dest = a.dataset.go;
      if (dest === 'areas') goAreas();
      else if (dest === 'projects') goProjects(state.currentArea);
    });
  }

  function bindFilters() {
    document.getElementById('filter-status').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.filterStatus = btn.dataset.status;
      document.querySelectorAll('#filter-status .chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      renderCurrent();
    });
    const search = document.getElementById('search-input');
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.search = search.value; renderCurrent(); }, 150);
    });
  }

  function bindForm() {
    document.getElementById('add-form').addEventListener('submit', (e) => {
      e.preventDefault();
      addTaskFromForm();
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

  function bindModal() {
    document.getElementById('modal-close').addEventListener('click', closeDetail);
    document.querySelector('#task-modal .modal-backdrop').addEventListener('click', closeDetail);
    document.getElementById('modal-save').addEventListener('click', saveModal);
    document.getElementById('modal-delete').addEventListener('click', deleteModal);
    document.getElementById('modal-gcal-btn').addEventListener('click', addToGCal);
    document.getElementById('modal-upload-btn').addEventListener('click', () => document.getElementById('modal-upload').click());
    document.getElementById('modal-upload').addEventListener('change', (e) => {
      uploadImages(Array.from(e.target.files));
      e.target.value = '';
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('task-modal').hidden) closeDetail();
    });
  }

  async function quickAddViaFab() {
    const name = prompt('Nowe zadanie — tytuł:');
    if (!name || !name.trim()) return;
    const area = state.currentArea || 'praca';
    const subcategory = state.currentSubcat || 'Inbox';
    const payload = {
      name: name.trim(),
      area: area,
      category: 'Osobiste',
      subcategory: subcategory,
      priority: 'normal',
      status: 'todo'
    };
    const optimistic = Object.assign({ id: 'temp-' + Date.now(), images: [], created_at: new Date().toISOString() }, payload);
    state.tasks.push(optimistic);
    renderCurrent();
    if (!supabase) return;
    const created = await createTask(payload);
    if (created) {
      const i = state.tasks.findIndex(t => t.id === optimistic.id);
      if (i >= 0) state.tasks[i] = created;
      saveCache();
      // Otwórz detail dla doprecyzowania
      openDetail(created.id);
    } else {
      state.tasks = state.tasks.filter(t => t.id !== optimistic.id);
      renderCurrent();
    }
  }

  function bindFab() {
    document.getElementById('fab-add').addEventListener('click', quickAddViaFab);
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW reg failed', err));
      });
    }
  }

  // ============= INIT =============

  document.addEventListener('DOMContentLoaded', () => {
    loadCache();
    bindTheme();
    bindNavigation();
    bindFilters();
    bindForm();
    bindFooter();
    bindModal();
    bindFab();

    if (HAS_CFG && typeof window.supabase !== 'undefined') {
      supabase = window.supabase.createClient(CFG.url, CFG.anonKey);
      setConnStatus('● łączenie…', 'pending');
      fetchAll().then(() => subscribeRealtime());
    } else {
      state.loading = false;
      setConnStatus('● bez Supabase (config)', 'offline');
      renderCurrent();
    }
    registerSW();
  });
})();
