/**
 * Daily Habits — إدارة العادات اليومية
 * يعمل مع pray-times-data.js و data-api.js
 */

// ─── بيانات الصلاة ───
var habitsPrayerData = [];

var PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
var PRAYER_LABELS = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء'
};

var HABITS_DEFAULT_PRESETS = [
  { name: 'عمل', icon: '\u{1F4BC}', color: '#4ecdc4' },
  { name: 'رياضة', icon: '\u{1F3C3}', color: '#ff6b6b' },
  { name: 'قراءة', icon: '\u{1F4D6}', color: '#7c6aef' },
  { name: 'قيلولة', icon: '\u{1F634}', color: '#6c5ce7' },
  { name: 'عمل خارجي', icon: '\u{1F3E2}', color: '#3498db' },
  { name: 'ضائع', icon: '\u{1F979}', color: '#ff9500db' },
];

var editingHabitId = null;
var habitSelectedPreset = null;

// ─── التهيئة ───
document.addEventListener('DOMContentLoaded', function () {
  generateStars();
  ScheduleData.whenReady().then(function () {
    loadHabitsPrayerData();
    ScheduleData.loadHabits().then(function () {
      renderHabitsList();
    });
    initHabitFormEvents();
  });
});

function loadHabitsPrayerData() {
  if (typeof PRAY_TIMES_RAW !== 'undefined') {
    habitsPrayerData = PRAY_TIMES_RAW;
  }
}

// ─── دوال الوقت ───

function habitsParseArabicTime(timeStr) {
  var parts = timeStr.trim().split(/\s+/);
  var timePart = parts[0];
  var period = parts[1];
  var tp = timePart.split(':');
  var h = parseInt(tp[0], 10);
  var m = parseInt(tp[1], 10);
  if (period === '\u0635') { if (h === 12) h = 0; }
  else if (period === '\u0645') { if (h !== 12) h += 12; }
  return h * 60 + m;
}

function habitsMinutesToTimeStr(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function habitsDisplayTime(mins) {
  var totalMins = ((mins % 1440) + 1440) % 1440;
  var h = Math.floor(totalMins / 60);
  var m = totalMins % 60;
  var period = h >= 12 ? 'PM' : 'AM';
  var h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + period;
}

function habitsFormatDuration(totalMinutes) {
  if (totalMinutes <= 0) return '0 \u062F\u0642\u064A\u0642\u0629';
  var hours = Math.floor(totalMinutes / 60);
  var mins = totalMinutes % 60;
  if (hours === 0) return mins + ' \u062F\u0642\u064A\u0642\u0629';
  var hourText;
  if (hours === 1) hourText = '\u0633\u0627\u0639\u0629';
  else if (hours === 2) hourText = '\u0633\u0627\u0639\u062A\u0627\u0646';
  else if (hours >= 3 && hours <= 10) hourText = hours + ' \u0633\u0627\u0639\u0627\u062A';
  else hourText = hours + ' \u0633\u0627\u0639\u0629';
  if (mins === 0) return hourText;
  return hourText + ' \u0648 ' + mins + ' \u062F\u0642\u064A\u0642\u0629';
}

// ─── أوقات صلاة اليوم ───

function getTodayPrayerMins() {
  var today = new Date().toISOString().split('T')[0];
  var formatted = today.replace(/-/g, '/');
  var dayData = null;
  for (var i = 0; i < habitsPrayerData.length; i++) {
    if (habitsPrayerData[i]['\u062A\u0627\u0631\u064A\u062E_\u0645\u064A\u0644\u0627\u062F\u064A'] === formatted) {
      dayData = habitsPrayerData[i];
      break;
    }
  }
  if (!dayData && habitsPrayerData.length > 0) {
    // closest
    var target = new Date(today + 'T12:00:00').getTime();
    var closest = habitsPrayerData[0];
    var closestDiff = Infinity;
    for (var j = 0; j < habitsPrayerData.length; j++) {
      var d = new Date(habitsPrayerData[j]['\u062A\u0627\u0631\u064A\u062E_\u0645\u064A\u0644\u0627\u062F\u064A'].replace(/\//g, '-') + 'T12:00:00').getTime();
      var diff = Math.abs(d - target);
      if (diff < closestDiff) { closestDiff = diff; closest = habitsPrayerData[j]; }
    }
    dayData = closest;
  }
  if (!dayData) return null;
  return {
    fajr: habitsParseArabicTime(dayData['\u0627\u0644\u0641\u062C\u0631']),
    sunrise: habitsParseArabicTime(dayData['\u0627\u0644\u0634\u0631\u0648\u0642']),
    dhuhr: habitsParseArabicTime(dayData['\u0627\u0644\u0638\u0647\u0631']),
    asr: habitsParseArabicTime(dayData['\u0627\u0644\u0639\u0635\u0631']),
    maghrib: habitsParseArabicTime(dayData['\u0627\u0644\u0645\u063A\u0631\u0628']),
    isha: habitsParseArabicTime(dayData['\u0627\u0644\u0639\u0634\u0627\u0621'])
  };
}

// ─── حساب وقت العادة ───

var DEFAULT_BUFFERS = {
  fajr:    { before: 90, after: 30 },
  sunrise: { before: 0,  after: 20 },
  dhuhr:   { before: 15, after: 20 },
  asr:     { before: 15, after: 15 },
  maghrib: { before: 10, after: 20 },
  isha:    { before: 10, after: 20 }
};

function getBufferSettings() {
  // Try to load from most recent day's settings
  var allDays = ScheduleData.getAllDays();
  var dates = Object.keys(allDays).sort();
  for (var i = dates.length - 1; i >= 0; i--) {
    var day = allDays[dates[i]];
    if (day && day.settings && day.settings.buffers) {
      return day.settings.buffers;
    }
  }
  return DEFAULT_BUFFERS;
}

function resolveHabitTimes(habit, prayerMins, buffers) {
  if (!prayerMins) return null;
  var buf = buffers || getBufferSettings();
  var start, end;
  var offset = parseInt(habit.offsetAfter, 10) || 0;

  if (habit.scheduleType === 'prayer-to-prayer') {
    var fromBuf = buf[habit.fromPrayer] || { before: 0, after: 0 };
    var toBuf   = buf[habit.toPrayer]   || { before: 0, after: 0 };
    start = prayerMins[habit.fromPrayer] + fromBuf.after + offset;
    end   = prayerMins[habit.toPrayer]   - toBuf.before;
    if (end <= start) return null;
  } else if (habit.scheduleType === 'prayer-duration') {
    var fromBuf2 = buf[habit.fromPrayer] || { before: 0, after: 0 };
    start = prayerMins[habit.fromPrayer] + fromBuf2.after + offset;
    end = start + (parseInt(habit.duration, 10) || 30);
  } else if (habit.scheduleType === 'custom-time') {
    start = parseInt(habit.startTime, 10) || 0;
    end = parseInt(habit.endTime, 10) || 0;
    if (end <= start) return null;
  } else {
    return null;
  }

  return { start: start, end: end };
}

// ─── عرض العادات ───

function renderHabitsList() {
  var container = document.getElementById('habits-list');
  if (!container) return;

  var habits = ScheduleData.getHabits();
  if (!habits || habits.length === 0) {
    container.innerHTML =
      '<div class="habits-empty">' +
        '<div class="habits-empty-icon">\u{1F4CB}</div>' +
        '<div>\u0644\u0627 \u062A\u0648\u062C\u062F \u0639\u0627\u062F\u0627\u062A \u0628\u0639\u062F. \u0623\u0636\u0641 \u0639\u0627\u062F\u0629 \u064A\u0648\u0645\u064A\u0629 \u062C\u062F\u064A\u062F\u0629!</div>' +
      '</div>';
    return;
  }

  var prayerMins = getTodayPrayerMins();
  var html = '';
  habits.forEach(function (habit) {
    var resolved = resolveHabitTimes(habit, prayerMins);
    var timePreview = resolved
      ? habitsDisplayTime(resolved.start) + ' - ' + habitsDisplayTime(resolved.end)
      : '';
    var scheduleDesc = getScheduleDescription(habit);

    html +=
      '<div class="habit-card' + (habit.enabled ? '' : ' disabled') + '" data-id="' + habit.id + '">' +
        '<div class="habit-icon" style="background:' + habit.color + '20">' + habit.icon + '</div>' +
        '<div class="habit-info">' +
          '<div class="habit-name">' + habit.name + '</div>' +
          '<div class="habit-schedule">' +
            '<span class="habit-schedule-tag">' + scheduleDesc + '</span>' +
            (timePreview ? '<span class="habit-time-preview">' + timePreview + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="habit-actions">' +
          '<button class="habit-edit-btn" onclick="openHabitForm(\'' + habit.id + '\')" title="\u062A\u0639\u062F\u064A\u0644">\u270F\uFE0F</button>' +
          '<button class="habit-delete-btn" onclick="deleteHabit(\'' + habit.id + '\')" title="\u062D\u0630\u0641">\u{1F5D1}\uFE0F</button>' +
          '<label class="habit-toggle">' +
            '<input type="checkbox"' + (habit.enabled ? ' checked' : '') + ' onchange="toggleHabit(\'' + habit.id + '\', this.checked)">' +
            '<span class="habit-toggle-slider"></span>' +
          '</label>' +
        '</div>' +
      '</div>';
  });

  container.innerHTML = html;
}

function getScheduleDescription(habit) {
  if (habit.scheduleType === 'prayer-to-prayer') {
    return PRAYER_LABELS[habit.fromPrayer] + ' \u2192 ' + PRAYER_LABELS[habit.toPrayer];
  } else if (habit.scheduleType === 'prayer-duration') {
    return PRAYER_LABELS[habit.fromPrayer] + ' + ' + habit.duration + ' \u062F\u0642\u064A\u0642\u0629';
  } else if (habit.scheduleType === 'custom-time') {
    return habitsDisplayTime(habit.startTime) + ' - ' + habitsDisplayTime(habit.endTime);
  }
  return '';
}

// ─── تفعيل/تعطيل ───

function toggleHabit(id, enabled) {
  var habits = ScheduleData.getHabits();
  for (var i = 0; i < habits.length; i++) {
    if (habits[i].id === id) {
      habits[i].enabled = enabled;
      break;
    }
  }
  ScheduleData.saveHabits(habits);
  renderHabitsList();
}

// ─── حذف ───

function deleteHabit(id) {
  var habits = ScheduleData.getHabits();
  habits = habits.filter(function (h) { return h.id !== id; });
  ScheduleData.saveHabits(habits);
  renderHabitsList();
}

// ─── نموذج إضافة/تعديل ───

function getAllHabitPresets() {
  var customs = ScheduleData.getPresets() || [];
  return HABITS_DEFAULT_PRESETS.concat(customs);
}

function renderHabitPresets() {
  var container = document.getElementById('hf-presets');
  if (!container) return;
  var presets = getAllHabitPresets();
  var html = '';
  presets.forEach(function (p) {
    html += '<button type="button" class="hf-preset" data-name="' + p.name + '" data-icon="' + p.icon + '" data-color="' + p.color + '">' + p.icon + ' ' + p.name + '</button>';
  });
  container.innerHTML = html;

  container.querySelectorAll('.hf-preset').forEach(function (btn) {
    btn.addEventListener('click', function () {
      container.querySelectorAll('.hf-preset').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      habitSelectedPreset = { name: btn.dataset.name, icon: btn.dataset.icon, color: btn.dataset.color };
      document.getElementById('hf-name').value = btn.dataset.name;
    });
  });
}

function openHabitForm(editId) {
  editingHabitId = editId || null;
  habitSelectedPreset = null;
  var form = document.getElementById('habit-form-overlay');

  // Reset form
  document.getElementById('hf-name').value = '';
  document.getElementById('hf-note').value = '';
  document.getElementById('hf-offset').value = '0';
  document.getElementById('hf-duration-input').value = '30';
  document.getElementById('hf-start-time').value = '08:00';
  document.getElementById('hf-end-time').value = '09:00';
  document.getElementById('hf-from-prayer').value = 'fajr';
  document.getElementById('hf-to-prayer').value = 'dhuhr';

  renderHabitPresets();

  // Set schedule type
  setScheduleType('prayer-to-prayer');

  var deleteBtn = document.getElementById('hf-delete-btn');
  deleteBtn.style.display = 'none';

  if (editId) {
    var habits = ScheduleData.getHabits();
    var habit = null;
    for (var i = 0; i < habits.length; i++) {
      if (habits[i].id === editId) { habit = habits[i]; break; }
    }
    if (habit) {
      document.getElementById('hf-name').value = habit.name;
      document.getElementById('hf-note').value = habit.note || '';
      document.getElementById('hf-offset').value = habit.offsetAfter || 0;
      habitSelectedPreset = { name: habit.name, icon: habit.icon, color: habit.color };

      // Highlight matching preset
      document.querySelectorAll('.hf-preset').forEach(function (btn) {
        btn.classList.toggle('selected', btn.dataset.name === habit.name);
      });

      setScheduleType(habit.scheduleType);

      if (habit.scheduleType === 'prayer-to-prayer') {
        document.getElementById('hf-from-prayer').value = habit.fromPrayer;
        document.getElementById('hf-to-prayer').value = habit.toPrayer;
      } else if (habit.scheduleType === 'prayer-duration') {
        document.getElementById('hf-from-prayer').value = habit.fromPrayer;
        document.getElementById('hf-duration-input').value = habit.duration || 30;
      } else if (habit.scheduleType === 'custom-time') {
        document.getElementById('hf-start-time').value = habitsMinutesToTimeStr(habit.startTime);
        document.getElementById('hf-end-time').value = habitsMinutesToTimeStr(habit.endTime);
      }

      document.querySelector('.hf-header h3').textContent = '\u062A\u0639\u062F\u064A\u0644 \u0639\u0627\u062F\u0629';
      document.getElementById('hf-save-btn').textContent = '\u062D\u0641\u0638 \u0627\u0644\u062A\u0639\u062F\u064A\u0644';
      deleteBtn.style.display = '';
    }
  } else {
    document.querySelector('.hf-header h3').textContent = '\u0625\u0636\u0627\u0641\u0629 \u0639\u0627\u062F\u0629 \u064A\u0648\u0645\u064A\u0629';
    document.getElementById('hf-save-btn').textContent = '\u0625\u0636\u0627\u0641\u0629';
  }

  updateHabitPreview();
  form.classList.add('active');
}

function closeHabitForm() {
  document.getElementById('habit-form-overlay').classList.remove('active');
  editingHabitId = null;
  habitSelectedPreset = null;
}

function setScheduleType(type) {
  document.querySelectorAll('.hf-type-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  // Show/hide sections
  var prayerSection = document.getElementById('hf-prayer-section');
  var durationSection = document.getElementById('hf-duration-section');
  var customSection = document.getElementById('hf-custom-section');
  var toPrayerField = document.getElementById('hf-to-prayer-field');
  var offsetSection = document.getElementById('hf-offset-section');

  prayerSection.className = 'hf-field';
  durationSection.className = 'hf-field hf-section-hidden';
  customSection.className = 'hf-field hf-section-hidden';
  toPrayerField.className = 'hf-field';
  offsetSection.className = 'hf-field';

  if (type === 'prayer-to-prayer') {
    toPrayerField.className = 'hf-field';
    durationSection.className = 'hf-field hf-section-hidden';
    customSection.className = 'hf-field hf-section-hidden';
  } else if (type === 'prayer-duration') {
    toPrayerField.className = 'hf-field hf-section-hidden';
    durationSection.className = 'hf-field';
    customSection.className = 'hf-field hf-section-hidden';
  } else if (type === 'custom-time') {
    prayerSection.className = 'hf-field hf-section-hidden';
    toPrayerField.className = 'hf-field hf-section-hidden';
    durationSection.className = 'hf-field hf-section-hidden';
    offsetSection.className = 'hf-field hf-section-hidden';
    customSection.className = 'hf-field';
  }

  updateHabitPreview();
}

function getActiveScheduleType() {
  var active = document.querySelector('.hf-type-btn.active');
  return active ? active.dataset.type : 'prayer-to-prayer';
}

function updateHabitPreview() {
  var previewEl = document.getElementById('hf-preview-time');
  if (!previewEl) return;

  var type = getActiveScheduleType();
  var prayerMins = getTodayPrayerMins();
  if (!prayerMins) {
    previewEl.textContent = '\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0635\u0644\u0627\u0629';
    return;
  }

  var habit = buildHabitFromForm(type);
  var resolved = resolveHabitTimes(habit, prayerMins);
  if (!resolved) {
    previewEl.textContent = '\u2014';
    return;
  }

  var duration = resolved.end - resolved.start;
  previewEl.textContent =
    habitsDisplayTime(resolved.start) + ' \u2192 ' + habitsDisplayTime(resolved.end) +
    ' (' + habitsFormatDuration(duration) + ')';
}

function buildHabitFromForm(type) {
  var fromPrayer = document.getElementById('hf-from-prayer').value;
  var toPrayer = document.getElementById('hf-to-prayer').value;
  var offset = parseInt(document.getElementById('hf-offset').value, 10) || 0;
  var duration = parseInt(document.getElementById('hf-duration-input').value, 10) || 30;

  var startParts = document.getElementById('hf-start-time').value.split(':').map(Number);
  var endParts = document.getElementById('hf-end-time').value.split(':').map(Number);
  var startTime = startParts[0] * 60 + startParts[1];
  var endTime = endParts[0] * 60 + endParts[1];

  return {
    scheduleType: type,
    fromPrayer: fromPrayer,
    toPrayer: toPrayer,
    offsetAfter: offset,
    duration: duration,
    startTime: startTime,
    endTime: endTime
  };
}

function saveHabit() {
  var name = document.getElementById('hf-name').value.trim();
  if (!name) {
    document.getElementById('hf-name').focus();
    return;
  }

  var note = document.getElementById('hf-note').value.trim();
  var type = getActiveScheduleType();
  var formData = buildHabitFromForm(type);

  // Determine icon and color
  var icon, color;
  if (habitSelectedPreset) {
    icon = habitSelectedPreset.icon;
    color = habitSelectedPreset.color;
  } else {
    // Search presets for matching name
    var presets = getAllHabitPresets();
    var match = null;
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].name === name) { match = presets[i]; break; }
    }
    if (match) {
      icon = match.icon;
      color = match.color;
    } else {
      var COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e84393', '#00cec9', '#6c5ce7'];
      var ICONS = ['\u{1F3AF}', '\u2B50', '\u{1F525}', '\u{1F4A1}', '\u{1F4DD}', '\u{1F3A8}', '\u{1F3B5}', '\u{1F3E0}', '\u{1F697}', '\u{1F4F1}'];
      icon = ICONS[Math.floor(Math.random() * ICONS.length)];
      color = COLORS[Math.floor(Math.random() * COLORS.length)];
    }
  }

  var habits = ScheduleData.getHabits();

  if (editingHabitId) {
    for (var j = 0; j < habits.length; j++) {
      if (habits[j].id === editingHabitId) {
        habits[j].name = name;
        habits[j].icon = icon;
        habits[j].color = color;
        habits[j].note = note;
        habits[j].scheduleType = formData.scheduleType;
        habits[j].fromPrayer = formData.fromPrayer;
        habits[j].toPrayer = formData.toPrayer;
        habits[j].offsetAfter = formData.offsetAfter;
        habits[j].duration = formData.duration;
        habits[j].startTime = formData.startTime;
        habits[j].endTime = formData.endTime;
        break;
      }
    }
  } else {
    habits.push({
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name,
      icon: icon,
      color: color,
      enabled: true,
      scheduleType: formData.scheduleType,
      fromPrayer: formData.fromPrayer,
      toPrayer: formData.toPrayer,
      offsetAfter: formData.offsetAfter,
      duration: formData.duration,
      startTime: formData.startTime,
      endTime: formData.endTime,
      note: note
    });
  }

  ScheduleData.saveHabits(habits);
  closeHabitForm();
  renderHabitsList();
}

function deleteHabitFromForm() {
  if (!editingHabitId) return;
  deleteHabit(editingHabitId);
  closeHabitForm();
}

// ─── أحداث النموذج ───

function initHabitFormEvents() {
  // Close buttons
  document.getElementById('hf-close').addEventListener('click', closeHabitForm);
  document.getElementById('habit-form-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeHabitForm();
  });

  // Add button
  document.getElementById('habit-add-btn').addEventListener('click', function () {
    openHabitForm(null);
  });

  // Schedule type buttons
  document.querySelectorAll('.hf-type-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setScheduleType(btn.dataset.type);
    });
  });

  // Save
  document.getElementById('hf-save-btn').addEventListener('click', saveHabit);

  // Delete
  document.getElementById('hf-delete-btn').addEventListener('click', deleteHabitFromForm);

  // Live preview updates
  ['hf-from-prayer', 'hf-to-prayer', 'hf-offset', 'hf-duration-input', 'hf-start-time', 'hf-end-time'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', updateHabitPreview);
      el.addEventListener('input', updateHabitPreview);
    }
  });
}

// ─── النجوم ───

function generateStars() {
  var container = document.getElementById('stars-container');
  if (!container) return;
  for (var i = 0; i < 100; i++) {
    var star = document.createElement('div');
    star.className = 'star';
    star.style.width = star.style.height = Math.random() * 2.5 + 0.5 + 'px';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    star.style.animationDuration = Math.random() * 3 + 2 + 's';
    star.style.animationDelay = Math.random() * 4 + 's';
    container.appendChild(star);
  }
}
