/**
 * Kanban Board — per-day task management with drag-and-drop.
 * Two views: board (4-column grid) and list (vertical sections).
 * Loaded after data-api.js.
 */
var KanbanBoard = (function () {

  var _date = null;
  var _tasks = [];
  var _draggedId = null;
  var _editingId = null;
  var _formSubtasks = [];
  var _viewMode = 'board';
  var _presetStatus = null;
  var _confirmCallback = null;

  // ─── Constants ───

  var COLUMNS = [
    { key: 'planned',  label: 'مخطط لها',   icon: '📋' },
    { key: 'progress', label: 'قيد التنفيذ', icon: '🔄' },
    { key: 'done',     label: 'مكتملة',      icon: '✅' },
    { key: 'canceled', label: 'ملغاة',       icon: '❌' }
  ];

  var ICONS = [
    '📋','🎯','💡','📌','🔧','📝','⚡','🚀',
    '📚','💻','🎨','🏠','🛒','📞','✏️','🎵',
    '💪','🧘','🍳','🚗','📱','🎮','🧹','⭐',
    '🔥','💎','🌙','☀️'
  ];

  var COLORS = [
    '#e74c3c','#ff6b6b','#e67e22','#ffa366',
    '#f1c40f','#2ecc71','#4ecdc4','#1abc9c',
    '#3498db','#4a6cf7','#7c6aef','#9b59b6',
    '#e84393','#00cec9'
  ];

  // ─── Helpers ───

  function gid() {
    return 'k_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }
  function randIcon() { return ICONS[Math.floor(Math.random() * ICONS.length)]; }
  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function byStatus(status) {
    return _tasks.filter(function (t) { return t.status === status; })
                 .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function nextDay(dateStr) {
    var d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  // ─── Data ───

  function load(date) {
    return ScheduleData.loadKanbanTasks(date).then(function (tasks) {
      _tasks = tasks || [];
      return _tasks;
    });
  }
  function save() { ScheduleData.saveKanbanTasks(_date, _tasks); }

  // ─── View toggle ───

  function updateToggleIcon() {
    var btn = document.getElementById('kanban-view-toggle');
    if (!btn) return;
    if (_viewMode === 'board') {
      btn.innerHTML = '<span class="kb-icon-list"><span></span><span></span><span></span></span>';
      btn.title = 'عرض القائمة';
    } else {
      btn.innerHTML = '<span class="kb-icon-board"><span></span><span></span><span></span><span></span></span>';
      btn.title = 'عرض اللوحة';
    }
  }

  function toggleView() {
    _viewMode = _viewMode === 'board' ? 'list' : 'board';
    try { localStorage.setItem('kanban-view', _viewMode); } catch (e) {}
    updateToggleIcon();
    render();
  }

  // ─── Render dispatcher ───

  function render() {
    if (_viewMode === 'board') renderBoard();
    else renderList();
  }

  // ─── BOARD VIEW ───

  function renderBoard() {
    var board = document.getElementById('kanban-board');
    if (!board) return;
    var html = '<div class="kanban-board">';
    COLUMNS.forEach(function (col) {
      var colTasks = byStatus(col.key);
      html += '<div class="kanban-col" data-col="' + col.key + '">';
      html += '<div class="kanban-col-header">' +
        '<span class="col-icon">' + col.icon + '</span>' +
        '<span class="col-label">' + col.label + '</span>' +
        '<span class="kanban-col-count">' + colTasks.length + '</span></div>';
      html += '<div class="kanban-tasks">';
      if (colTasks.length === 0) {
        html += '<div class="kanban-empty">لا توجد مهام</div>';
      } else {
        colTasks.forEach(function (t) { html += renderTask(t); });
      }
      html += '</div>';
      html += '<button class="kanban-col-add" data-col="' + col.key + '">+ مهمة جديدة</button>';
      html += '<div class="kanban-col-footer">' + colTasks.length + ' مهام</div>';
      html += '</div>';
    });
    html += '</div>';
    board.innerHTML = html;
    bindBoardEvents();
  }

  // ─── LIST VIEW ───

  function renderList() {
    var board = document.getElementById('kanban-board');
    if (!board) return;
    var html = '<div class="kanban-list">';
    COLUMNS.forEach(function (col) {
      var colTasks = byStatus(col.key);
      var collapsed = isGroupCollapsed(col.key);
      html += '<div class="kanban-list-group' + (collapsed ? ' collapsed' : '') + '" data-col="' + col.key + '">';
      html += '<div class="kanban-list-header">' +
        '<span class="kanban-list-dot"></span>' +
        '<span class="kanban-list-label">' + col.icon + ' ' + col.label + '</span>' +
        '<span class="kanban-col-count">' + colTasks.length + '</span>' +
        '<span class="kanban-list-chevron">&#9662;</span></div>';
      html += '<div class="kanban-list-body">';
      if (colTasks.length === 0) {
        html += '<div class="kanban-empty">لا توجد مهام</div>';
      } else {
        colTasks.forEach(function (t) { html += renderTask(t); });
      }
      html += '<button class="kanban-col-add" data-col="' + col.key + '">+ مهمة جديدة</button>';
      html += '</div></div>';
    });
    html += '</div>';
    board.innerHTML = html;
    bindListEvents();
  }

  var _collapsedGroups = {};
  function isGroupCollapsed(key) { return !!_collapsedGroups[key]; }

  // ─── Shared task card render ───

  function renderTask(task) {
    var subs = task.subtasks || [];
    var done = subs.filter(function (s) { return s.done; }).length;
    var total = subs.length;

    var h = '<div class="kanban-task" draggable="true" data-id="' + task.id +
      '" style="border-right-color:' + (task.color || '#4a6cf7') + '">';
    h += '<div class="kanban-task-row">' +
      '<span class="kanban-task-icon">' + (task.icon || '📋') + '</span>' +
      '<span class="kanban-task-name">' + esc(task.name) + '</span></div>';

    if (task.note) h += '<div class="kanban-task-note">' + esc(task.note) + '</div>';

    if (total > 0) {
      h += '<div class="kanban-subtasks">';
      subs.forEach(function (sub, i) {
        h += '<label class="kanban-subtask' + (sub.done ? ' done' : '') + '">' +
          '<input type="checkbox"' + (sub.done ? ' checked' : '') +
          ' data-taskid="' + task.id + '" data-idx="' + i + '">' +
          '<span>' + esc(sub.text) + '</span></label>';
      });
      var pct = Math.round((done / total) * 100);
      h += '<div class="kanban-subtask-progress">' +
        '<div class="kanban-subtask-progress-fill" style="width:' + pct + '%;background:' + (task.color || '#4a6cf7') + '"></div></div>';
      h += '</div>';
    }

    h += '<div class="kanban-task-actions">' +
      '<button class="kanban-task-btn" data-act="edit" title="تعديل">&#9998;</button>' +
      '<button class="kanban-task-btn" data-act="move" title="نقل ليوم آخر">&#128197;</button>' +
      '<button class="kanban-task-btn" data-act="del" title="حذف">&#128465;</button></div>';
    h += '</div>';
    return h;
  }

  // ─── Board event binding ───

  function bindBoardEvents() {
    var root = document.querySelector('#kanban-board .kanban-board');
    if (!root) return;
    root.querySelectorAll('.kanban-task').forEach(function (el) {
      el.addEventListener('dragstart', function (e) { onDragStart(e, el.dataset.id); });
      el.addEventListener('dragend', onDragEnd);
    });
    root.querySelectorAll('.kanban-col').forEach(function (col) {
      col.addEventListener('dragover', onDragOver);
      col.addEventListener('dragleave', onDragLeave);
      col.addEventListener('drop', function (e) { onDrop(e, col.dataset.col); });
    });
    root.addEventListener('click', handleCardClick);
    root.addEventListener('change', handleCheckbox);
  }

  // ─── List event binding ───

  function bindListEvents() {
    var root = document.querySelector('#kanban-board .kanban-list');
    if (!root) return;
    root.querySelectorAll('.kanban-list-header').forEach(function (hdr) {
      hdr.addEventListener('click', function () {
        var group = hdr.closest('.kanban-list-group');
        var col = group.dataset.col;
        _collapsedGroups[col] = !_collapsedGroups[col];
        group.classList.toggle('collapsed');
      });
    });
    root.querySelectorAll('.kanban-task').forEach(function (el) {
      el.addEventListener('dragstart', function (e) { onDragStart(e, el.dataset.id); });
      el.addEventListener('dragend', onDragEnd);
    });
    root.querySelectorAll('.kanban-list-group').forEach(function (grp) {
      grp.addEventListener('dragover', onDragOver);
      grp.addEventListener('dragleave', onDragLeaveList);
      grp.addEventListener('drop', function (e) { onDrop(e, grp.dataset.col); });
    });
    root.addEventListener('click', handleCardClick);
    root.addEventListener('change', handleCheckbox);
  }

  // ─── Shared event handlers ───

  function handleCardClick(e) {
    var btn = e.target.closest('.kanban-task-btn');
    if (btn) {
      var taskEl = btn.closest('.kanban-task');
      var id = taskEl ? taskEl.dataset.id : null;
      if (!id) return;
      var act = btn.dataset.act;
      if (act === 'edit') openForm(id);
      else if (act === 'move') confirmMove(id);
      else if (act === 'del') confirmDelete(id);
      return;
    }
    var addBtn = e.target.closest('.kanban-col-add');
    if (addBtn) {
      _presetStatus = addBtn.dataset.col;
      openForm(null);
    }
  }

  function handleCheckbox(e) {
    if (!e.target.matches('.kanban-subtask input[type="checkbox"]')) return;
    toggleSubtask(e.target.dataset.taskid, parseInt(e.target.dataset.idx, 10));
  }

  // ─── Drag & Drop (desktop) ───

  function onDragStart(e, id) {
    _draggedId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setTimeout(function () {
      var el = document.querySelector('.kanban-task[data-id="' + id + '"]');
      if (el) el.classList.add('dragging');
    }, 0);
  }

  function onDragEnd() {
    _draggedId = null;
    document.querySelectorAll('.kanban-task.dragging').forEach(function (el) { el.classList.remove('dragging'); });
    document.querySelectorAll('.kanban-col.drag-over, .kanban-list-group.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var target = e.currentTarget;
    if (!target.classList.contains('drag-over')) {
      document.querySelectorAll('.kanban-col.drag-over, .kanban-list-group.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
      target.classList.add('drag-over');
    }
  }

  function onDragLeave(e) {
    var col = e.currentTarget;
    if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  }

  function onDragLeaveList(e) {
    var grp = e.currentTarget;
    if (!grp.contains(e.relatedTarget)) grp.classList.remove('drag-over');
  }

  function onDrop(e, colKey) {
    e.preventDefault();
    var id = e.dataTransfer.getData('text/plain') || _draggedId;
    if (!id) return;
    var task = _tasks.find(function (t) { return t.id === id; });
    if (task && task.status !== colKey) {
      task.status = colKey;
      save(); render();
    }
    document.querySelectorAll('.kanban-col.drag-over, .kanban-list-group.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
  }

  // ─── Touch drag (mobile) ───

  var _touchEl = null, _touchClone = null, _touchOx = 0, _touchOy = 0;
  var _touchActive = false, _touchTimer = null;

  function initTouchDrag() {
    document.addEventListener('touchstart', function (e) {
      var card = e.target.closest('.kanban-task');
      if (!card || e.target.closest('.kanban-task-actions') || e.target.closest('.kanban-subtask')) return;
      _touchEl = card;
      var t = e.touches[0], r = card.getBoundingClientRect();
      _touchOx = t.clientX - r.left;
      _touchOy = t.clientY - r.top;
      _touchTimer = setTimeout(function () {
        _touchActive = true;
        card.classList.add('dragging');
        _touchClone = card.cloneNode(true);
        _touchClone.style.cssText = 'position:fixed;z-index:9999;width:' + r.width +
          'px;opacity:0.85;pointer-events:none;left:' + (t.clientX - _touchOx) +
          'px;top:' + (t.clientY - _touchOy) + 'px;';
        document.body.appendChild(_touchClone);
        document.body.style.overflow = 'hidden';
      }, 400);
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!_touchActive || !_touchClone) return;
      e.preventDefault();
      var t = e.touches[0];
      _touchClone.style.left = (t.clientX - _touchOx) + 'px';
      _touchClone.style.top = (t.clientY - _touchOy) + 'px';
      var el = document.elementFromPoint(t.clientX, t.clientY);
      var dropTarget = el ? (el.closest('.kanban-col') || el.closest('.kanban-list-group')) : null;
      document.querySelectorAll('.kanban-col.drag-over, .kanban-list-group.drag-over')
        .forEach(function (c) { c.classList.remove('drag-over'); });
      if (dropTarget) dropTarget.classList.add('drag-over');
    }, { passive: false });

    document.addEventListener('touchend', function (e) {
      clearTimeout(_touchTimer);
      if (_touchActive && _touchEl && _touchClone) {
        var t = e.changedTouches[0];
        var el = document.elementFromPoint(t.clientX, t.clientY);
        var dropTarget = el ? (el.closest('.kanban-col') || el.closest('.kanban-list-group')) : null;
        if (dropTarget) {
          var tid = _touchEl.dataset.id;
          var task = _tasks.find(function (tk) { return tk.id === tid; });
          if (task && task.status !== dropTarget.dataset.col) {
            task.status = dropTarget.dataset.col;
            save(); render();
          }
        }
        _touchEl.classList.remove('dragging');
        if (_touchClone.parentNode) document.body.removeChild(_touchClone);
        document.body.style.overflow = '';
        document.querySelectorAll('.kanban-col.drag-over, .kanban-list-group.drag-over')
          .forEach(function (c) { c.classList.remove('drag-over'); });
      }
      _touchEl = null; _touchClone = null; _touchActive = false;
    });

    document.addEventListener('touchcancel', function () {
      clearTimeout(_touchTimer);
      if (_touchClone && _touchClone.parentNode) document.body.removeChild(_touchClone);
      if (_touchEl) _touchEl.classList.remove('dragging');
      document.body.style.overflow = '';
      document.querySelectorAll('.kanban-col.drag-over, .kanban-list-group.drag-over')
        .forEach(function (c) { c.classList.remove('drag-over'); });
      _touchEl = null; _touchClone = null; _touchActive = false;
    });
  }

  // ─── CRUD ───

  function addTask(data) {
    var task = {
      id: gid(),
      name: data.name || 'مهمة جديدة',
      icon: data.icon || randIcon(),
      color: data.color || COLORS[Math.floor(Math.random() * COLORS.length)],
      note: data.note || '',
      status: data.status || 'planned',
      subtasks: data.subtasks || [],
      order: _tasks.length
    };
    _tasks.push(task);
    save(); render();
  }

  function updateTask(id, upd) {
    var task = _tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    Object.keys(upd).forEach(function (k) { task[k] = upd[k]; });
    save(); render();
  }

  function deleteTask(id) {
    _tasks = _tasks.filter(function (t) { return t.id !== id; });
    save(); render();
  }

  function toggleSubtask(taskId, idx) {
    var task = _tasks.find(function (t) { return t.id === taskId; });
    if (!task || !task.subtasks || !task.subtasks[idx]) return;
    task.subtasks[idx].done = !task.subtasks[idx].done;
    save(); render();
  }

  /** Move a task from current day to targetDate */
  function moveTaskToDate(taskId, targetDate) {
    var task = _tasks.find(function (t) { return t.id === taskId; });
    if (!task || targetDate === _date) return;

    var clone = JSON.parse(JSON.stringify(task));
    clone.id = gid();
    clone.status = 'planned';
    if (clone.subtasks) clone.subtasks.forEach(function (s) { s.done = false; });

    ScheduleData.loadKanbanTasks(targetDate).then(function (targetTasks) {
      targetTasks = targetTasks || [];
      clone.order = targetTasks.length;
      targetTasks.push(clone);
      ScheduleData.saveKanbanTasks(targetDate, targetTasks);
      _tasks = _tasks.filter(function (t) { return t.id !== taskId; });
      save(); render();
    });
  }

  /** Save a new task directly to a specific date (used by form date picker) */
  function addTaskToDate(taskData, targetDate) {
    var task = {
      id: gid(),
      name: taskData.name || 'مهمة جديدة',
      icon: taskData.icon || randIcon(),
      color: taskData.color || COLORS[Math.floor(Math.random() * COLORS.length)],
      note: taskData.note || '',
      status: taskData.status || 'planned',
      subtasks: taskData.subtasks || [],
      order: 0
    };
    ScheduleData.loadKanbanTasks(targetDate).then(function (targetTasks) {
      targetTasks = targetTasks || [];
      task.order = targetTasks.length;
      targetTasks.push(task);
      ScheduleData.saveKanbanTasks(targetDate, targetTasks);
    });
  }

  // ═══════════════════════════════════════
  //  CONFIRM DIALOG
  // ═══════════════════════════════════════

  function createConfirmDialog() {
    var div = document.createElement('div');
    div.className = 'kanban-confirm-overlay';
    div.id = 'kanban-confirm-overlay';
    div.innerHTML =
      '<div class="kanban-confirm-modal">' +
        '<div class="kc-icon" id="kc-icon"></div>' +
        '<div class="kc-text" id="kc-text"></div>' +
        '<div class="kc-preview" id="kc-preview"></div>' +
        '<div class="kc-date-wrap" id="kc-date-wrap" style="display:none">' +
          '<label>نقل إلى تاريخ</label>' +
          '<input type="date" id="kc-date" class="kf-input">' +
        '</div>' +
        '<div class="kc-btns">' +
          '<button class="kc-yes" id="kc-yes">تأكيد</button>' +
          '<button class="kc-no" id="kc-no">إلغاء</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(div);

    document.getElementById('kc-yes').addEventListener('click', function () {
      if (_confirmCallback) {
        var dateVal = document.getElementById('kc-date').value;
        _confirmCallback(dateVal);
      }
      closeConfirm();
    });
    document.getElementById('kc-no').addEventListener('click', closeConfirm);
    div.addEventListener('click', function (e) { if (e.target === div) closeConfirm(); });
  }

  function showConfirm(opts) {
    var ov = document.getElementById('kanban-confirm-overlay');
    if (!ov) { createConfirmDialog(); ov = document.getElementById('kanban-confirm-overlay'); }

    document.getElementById('kc-icon').textContent = opts.icon || '';
    document.getElementById('kc-text').textContent = opts.text || '';

    var preview = document.getElementById('kc-preview');
    if (opts.preview) { preview.innerHTML = opts.preview; preview.style.display = ''; }
    else { preview.innerHTML = ''; preview.style.display = 'none'; }

    var dateWrap = document.getElementById('kc-date-wrap');
    var dateInput = document.getElementById('kc-date');
    if (opts.showDate) {
      dateWrap.style.display = '';
      dateInput.value = opts.defaultDate || '';
    } else {
      dateWrap.style.display = 'none';
    }

    var yesBtn = document.getElementById('kc-yes');
    yesBtn.textContent = opts.confirmText || 'تأكيد';
    yesBtn.className = 'kc-yes' + (opts.danger ? ' danger' : '');

    _confirmCallback = opts.onConfirm || null;
    ov.classList.add('active');
  }

  function closeConfirm() {
    var ov = document.getElementById('kanban-confirm-overlay');
    if (ov) ov.classList.remove('active');
    _confirmCallback = null;
  }

  // ─── Confirm: delete ───

  function confirmDelete(id) {
    var task = _tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    showConfirm({
      icon: '🗑️',
      text: 'هل تريد حذف هذه المهمة؟',
      preview: (task.icon || '') + ' ' + esc(task.name),
      confirmText: 'حذف',
      danger: true,
      onConfirm: function () { deleteTask(id); }
    });
  }

  // ─── Confirm: move to another day ───

  function confirmMove(id) {
    var task = _tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    showConfirm({
      icon: '📅',
      text: 'نقل المهمة إلى يوم آخر',
      preview: (task.icon || '') + ' ' + esc(task.name),
      showDate: true,
      defaultDate: nextDay(_date),
      confirmText: 'نقل',
      onConfirm: function (dateVal) {
        if (dateVal && dateVal !== _date) moveTaskToDate(id, dateVal);
      }
    });
  }

  // ═══════════════════════════════════════
  //  TASK FORM (compact: icon/color/date in toolbar)
  // ═══════════════════════════════════════

  var _formIcon = '📋';
  var _formColor = '#e74c3c';

  function openForm(taskId) {
    _editingId = taskId || null;
    var task = taskId ? _tasks.find(function (t) { return t.id === taskId; }) : null;

    var ov = document.getElementById('kanban-form-overlay');
    if (!ov) { createFormModal(); ov = document.getElementById('kanban-form-overlay'); }

    ov.querySelector('.kanban-form-header h3').textContent = task ? 'تعديل المهمة' : 'مهمة جديدة';
    document.getElementById('kf-name').value = task ? task.name : '';
    document.getElementById('kf-note').value = task ? (task.note || '') : '';

    _formIcon = task ? task.icon : randIcon();
    _formColor = task ? task.color : COLORS[0];
    document.getElementById('kf-icon-preview').textContent = _formIcon;
    document.getElementById('kf-color-preview').style.background = _formColor;
    document.getElementById('kf-date').value = _date;
    document.getElementById('kf-date-display').textContent = _date;

    var selStatus = task ? task.status : (_presetStatus || 'planned');
    ov.querySelectorAll('.kf-status-btn').forEach(function (b) { b.classList.toggle('selected', b.dataset.status === selStatus); });
    _presetStatus = null;

    renderFormSubs(task ? (task.subtasks || []) : []);
    document.getElementById('kf-delete-btn').style.display = task ? 'block' : 'none';
    ov.classList.add('active');
    setTimeout(function () { document.getElementById('kf-name').focus(); }, 200);
  }

  function closeForm() {
    var ov = document.getElementById('kanban-form-overlay');
    if (ov) ov.classList.remove('active');
    _editingId = null;
    _presetStatus = null;
  }

  function saveForm() {
    var name = document.getElementById('kf-name').value.trim();
    if (!name) { document.getElementById('kf-name').focus(); return; }

    var ov = document.getElementById('kanban-form-overlay');
    var statusBtn = ov.querySelector('.kf-status-btn.selected');
    var status = statusBtn ? statusBtn.dataset.status : 'planned';
    var note = document.getElementById('kf-note').value.trim();
    var targetDate = document.getElementById('kf-date').value || _date;

    var subs = [];
    ov.querySelectorAll('#kf-subtasks-list input[type="text"]').forEach(function (inp) {
      var t = inp.value.trim();
      if (t) subs.push({ id: gid(), text: t, done: false });
    });

    var taskData = { name: name, icon: _formIcon, color: _formColor, note: note, status: status, subtasks: subs };

    if (_editingId) {
      var existing = _tasks.find(function (t) { return t.id === _editingId; });
      if (existing && existing.subtasks) {
        subs.forEach(function (ns) {
          var m = existing.subtasks.find(function (os) { return os.text === ns.text; });
          if (m) ns.done = m.done;
        });
      }
      if (targetDate !== _date) {
        _tasks = _tasks.filter(function (t) { return t.id !== _editingId; });
        save();
        addTaskToDate(taskData, targetDate);
        render();
      } else {
        updateTask(_editingId, taskData);
      }
    } else {
      if (targetDate !== _date) {
        addTaskToDate(taskData, targetDate);
      } else {
        addTask(taskData);
      }
    }
    closeForm();
  }

  function renderFormSubs(subtasks) {
    _formSubtasks = subtasks.map(function (s) { return { text: s.text, done: s.done }; });
    var c = document.getElementById('kf-subtasks-list');
    if (!c) return;
    var h = '';
    _formSubtasks.forEach(function (s, i) {
      h += '<div class="kf-subtask-row">' +
        '<input type="text" value="' + esc(s.text) + '" placeholder="مهمة فرعية...">' +
        '<button type="button" class="kf-subtask-remove" data-idx="' + i + '">&#10005;</button></div>';
    });
    c.innerHTML = h;
    c.querySelectorAll('.kf-subtask-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _formSubtasks.splice(parseInt(btn.dataset.idx, 10), 1);
        renderFormSubs(_formSubtasks);
      });
    });
  }

  // ─── Form modal ───

  function createFormModal() {
    var div = document.createElement('div');
    div.className = 'kanban-form-overlay';
    div.id = 'kanban-form-overlay';

    var statusH = COLUMNS.map(function (col) {
      return '<button type="button" class="kf-status-btn" data-status="' + col.key + '">' + col.icon + ' ' + col.label + '</button>';
    }).join('');

    div.innerHTML =
      '<div class="kanban-form-modal">' +
        '<div class="kanban-form-header">' +
          '<h3>مهمة جديدة</h3>' +
          '<button class="kanban-form-close" id="kf-close">&times;</button>' +
        '</div>' +
        '<div class="kanban-form-body">' +
          '<div class="kf-toolbar">' +
            '<button type="button" class="kf-tool-btn kf-tool-icon" id="kf-icon-trigger" title="الأيقونة">' +
              '<span id="kf-icon-preview">📋</span></button>' +
            '<button type="button" class="kf-tool-btn kf-tool-color" id="kf-color-trigger" title="اللون">' +
              '<span class="kf-color-dot" id="kf-color-preview"></span></button>' +
            '<label class="kf-tool-btn kf-tool-date">' +
              '<span class="kf-tool-date-icon">📅</span>' +
              '<span id="kf-date-display"></span>' +
              '<input type="date" id="kf-date" class="kf-date-hidden">' +
            '</label>' +
          '</div>' +
          '<div class="kf-field">' +
            '<input type="text" class="kf-input" id="kf-name" placeholder="أدخل اسم المهمة..."></div>' +
          '<div class="kf-field"><label>الحالة</label><div class="kf-status-group">' + statusH + '</div></div>' +
          '<div class="kf-field"><label>ملاحظة</label>' +
            '<textarea class="kf-input" id="kf-note" placeholder="وصف المهمة..." rows="2"></textarea></div>' +
          '<div class="kf-field"><label>المهام الفرعية</label>' +
            '<div class="kf-subtasks-list" id="kf-subtasks-list"></div>' +
            '<button type="button" class="kf-add-subtask" id="kf-add-sub">+ إضافة مهمة فرعية</button></div>' +
          '<button class="kf-btn-save" id="kf-save-btn">حفظ</button>' +
          '<button class="kf-btn-delete" id="kf-delete-btn" style="display:none">&#128465; حذف المهمة</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(div);

    document.getElementById('kf-close').addEventListener('click', closeForm);
    document.getElementById('kf-save-btn').addEventListener('click', saveForm);
    document.getElementById('kf-delete-btn').addEventListener('click', function () {
      if (_editingId) { closeForm(); confirmDelete(_editingId); }
    });
    document.getElementById('kf-add-sub').addEventListener('click', function () {
      _formSubtasks.push({ text: '', done: false });
      renderFormSubs(_formSubtasks);
      var inputs = document.querySelectorAll('#kf-subtasks-list input[type="text"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    document.getElementById('kf-name').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveForm();
    });
    div.addEventListener('click', function (e) { if (e.target === div) closeForm(); });

    // Toolbar triggers
    document.getElementById('kf-icon-trigger').addEventListener('click', openIconPicker);
    document.getElementById('kf-color-trigger').addEventListener('click', openColorPicker);
    document.getElementById('kf-date').addEventListener('change', function () {
      document.getElementById('kf-date-display').textContent = this.value;
    });

    div.querySelectorAll('.kf-status-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        div.querySelectorAll('.kf-status-btn').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });
  }

  // ─── Icon picker popup ───

  function createIconPicker() {
    var div = document.createElement('div');
    div.className = 'kf-picker-overlay';
    div.id = 'kf-icon-picker-overlay';
    var grid = ICONS.map(function (ic) {
      return '<span class="kf-icon-btn" data-icon="' + ic + '">' + ic + '</span>';
    }).join('');
    div.innerHTML =
      '<div class="kf-picker-modal">' +
        '<div class="kf-picker-header"><span>الأيقونة</span>' +
          '<button class="kf-picker-close" id="kf-icon-picker-close">&times;</button></div>' +
        '<div class="kf-icons">' + grid + '</div></div>';
    document.body.appendChild(div);
    document.getElementById('kf-icon-picker-close').addEventListener('click', closeIconPicker);
    div.addEventListener('click', function (e) {
      if (e.target === div) { closeIconPicker(); return; }
      var btn = e.target.closest('.kf-icon-btn');
      if (btn) {
        _formIcon = btn.dataset.icon;
        document.getElementById('kf-icon-preview').textContent = _formIcon;
        div.querySelectorAll('.kf-icon-btn').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        closeIconPicker();
      }
    });
  }

  function openIconPicker() {
    var ov = document.getElementById('kf-icon-picker-overlay');
    if (!ov) { createIconPicker(); ov = document.getElementById('kf-icon-picker-overlay'); }
    ov.querySelectorAll('.kf-icon-btn').forEach(function (b) { b.classList.toggle('selected', b.dataset.icon === _formIcon); });
    ov.classList.add('active');
  }
  function closeIconPicker() {
    var ov = document.getElementById('kf-icon-picker-overlay');
    if (ov) ov.classList.remove('active');
  }

  // ─── Color picker popup ───

  function createColorPicker() {
    var div = document.createElement('div');
    div.className = 'kf-picker-overlay';
    div.id = 'kf-color-picker-overlay';
    var grid = COLORS.map(function (c) {
      return '<span class="kf-color-btn" data-color="' + c + '" style="background:' + c + '"></span>';
    }).join('');
    div.innerHTML =
      '<div class="kf-picker-modal">' +
        '<div class="kf-picker-header"><span>اللون</span>' +
          '<button class="kf-picker-close" id="kf-color-picker-close">&times;</button></div>' +
        '<div class="kf-colors">' + grid + '</div></div>';
    document.body.appendChild(div);
    document.getElementById('kf-color-picker-close').addEventListener('click', closeColorPicker);
    div.addEventListener('click', function (e) {
      if (e.target === div) { closeColorPicker(); return; }
      var btn = e.target.closest('.kf-color-btn');
      if (btn) {
        _formColor = btn.dataset.color;
        document.getElementById('kf-color-preview').style.background = _formColor;
        div.querySelectorAll('.kf-color-btn').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        closeColorPicker();
      }
    });
  }

  function openColorPicker() {
    var ov = document.getElementById('kf-color-picker-overlay');
    if (!ov) { createColorPicker(); ov = document.getElementById('kf-color-picker-overlay'); }
    ov.querySelectorAll('.kf-color-btn').forEach(function (b) { b.classList.toggle('selected', b.dataset.color === _formColor); });
    ov.classList.add('active');
  }
  function closeColorPicker() {
    var ov = document.getElementById('kf-color-picker-overlay');
    if (ov) ov.classList.remove('active');
  }

  // ─── Date sync ───

  function syncDate() {
    var inp = document.getElementById('schedule-date');
    if (inp && inp.value !== _date) {
      _date = inp.value;
      load(_date).then(render);
    }
  }

  // ─── Init ───

  function getDate() {
    var inp = document.getElementById('schedule-date');
    return inp ? inp.value : '';
  }

  function init() {
    var dateInput = document.getElementById('schedule-date');
    if (!dateInput) return;

    try {
      var saved = localStorage.getItem('kanban-view');
      if (saved === 'board' || saved === 'list') _viewMode = saved;
      else _viewMode = window.innerWidth <= 600 ? 'list' : 'board';
    } catch (e) {
      _viewMode = window.innerWidth <= 600 ? 'list' : 'board';
    }
    updateToggleIcon();

    dateInput.addEventListener('change', syncDate);
    ['prev-day', 'next-day', 'today-btn', 'refresh-btn'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function () { setTimeout(syncDate, 200); });
    });

    document.getElementById('kanban-add-btn')
      .addEventListener('click', function () { _presetStatus = null; openForm(null); });
    document.getElementById('kanban-view-toggle')
      .addEventListener('click', toggleView);

    initTouchDrag();
    waitForDate();
  }

  function waitForDate() {
    var d = getDate();
    if (d) {
      _date = d;
      load(_date).then(render);
    } else {
      setTimeout(waitForDate, 100);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    ScheduleData.whenReady().then(init);
  });

  // ─── Public ───

  return {
    render: render,
    openForm: openForm,
    closeForm: closeForm,
    deleteTask: deleteTask,
    moveTaskToDate: moveTaskToDate,
    toggleSubtask: toggleSubtask,
    setDate: function (d) { _date = d; load(_date).then(render); }
  };

})();
