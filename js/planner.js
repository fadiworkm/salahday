/**
 * أداة تخطيط وقت العمل
 * يعتمد على schedule.js: displayTime, displayTimeRange, formatDuration, minutesToTimeStr, window._workSegments
 */

let currentFormWorkIndex = null;
let selectedPreset = null;
let editingActivityIndex = null;
let currentPlannerFilter = null; // null = عرض الكل, رقم = فترة واحدة

// ─── استمرارية البيانات (عبر ScheduleData) ───

function loadPlannerData() {
  // البيانات تُحمّل عبر ScheduleData — لا حاجة لعمل شيء
}

function savePlannerData() {
  const dateStr = getPlannerDate();
  ScheduleData.saveDay(dateStr);
}

function getPlannerDate() {
  return document.getElementById('schedule-date').value;
}

function getDayPlan() {
  const dateStr = getPlannerDate();
  return ScheduleData.getDayOrDefault(dateStr);
}

function getDayActivities() {
  return getDayPlan().activities;
}

function getDisabledPeriods() {
  return getDayPlan().disabledPeriods;
}

// ─── الفترات المتاحة (عمل + وقت شخصي) ───

function getPlannerPeriods() {
  const allSegments = window._allSegments || [];
  const workSegs = window._workSegments || [];

  // فترات العمل
  const periods = workSegs.map(function (seg, i) {
    return { type: 'work', index: i, start: seg.start, end: seg.end, duration: seg.duration, label: 'وقت عمل' };
  });

  periods.sort(function (a, b) { return a.start - b.start; });
  return periods;
}

// ─── فتح/إغلاق المخطط ───

function openPlanner() {
  loadPlannerData();
  currentPlannerFilter = null;
  renderPlanner(currentPlannerFilter);
  document.getElementById('planner-overlay').classList.add('active');
}

function closePlanner() {
  savePlannerData();
  currentPlannerFilter = null;
  document.getElementById('planner-overlay').classList.remove('active');
  updateMainWorkBlocks();
}

function openPlannerForPeriod(periodIdx) {
  loadPlannerData();
  currentPlannerFilter = periodIdx;
  renderPlanner(periodIdx);
  document.getElementById('planner-overlay').classList.add('active');
}

// ─── بناء شرائح الشريط ───

function buildBarSegments(period, activities) {
  const segments = [];
  let cursor = period.start;
  activities.forEach(function (act, i) {
    if (act.start > cursor) {
      segments.push({ type: 'free', start: cursor, end: act.start, duration: act.start - cursor });
    }
    segments.push({ type: 'activity', name: act.name, icon: act.icon, color: act.color, start: act.start, end: act.end, actIndex: i, duration: act.end - act.start });
    cursor = act.end;
  });
  if (cursor < period.end) {
    segments.push({ type: 'free', start: cursor, end: period.end, duration: period.end - cursor });
  }
  return segments;
}

// ─── مفتاح الفترة ───

function periodKey(period) {
  return period.type + ':' + period.start + '-' + period.end;
}

function isPeriodDisabled(period) {
  return getDisabledPeriods().indexOf(periodKey(period)) !== -1;
}

function togglePeriodEnabled(period) {
  var disabled = getDisabledPeriods();
  var key = periodKey(period);
  var idx = disabled.indexOf(key);
  if (idx === -1) {
    disabled.push(key);
  } else {
    disabled.splice(idx, 1);
  }
  savePlannerData();
  renderPlanner(currentPlannerFilter);
}

// ─── عرض المخطط ───

function renderPlanner(onlyPeriodIdx) {
  var periods = getPlannerPeriods();
  var activities = getDayActivities();
  var html = '';

  periods.forEach(function (period, pIdx) {
    // عرض فترة واحدة فقط إذا تم تحديدها
    if (onlyPeriodIdx != null && pIdx !== onlyPeriodIdx) return;

    var periodActs = activities.filter(function (a) { return a.start >= period.start && a.end <= period.end; });
    periodActs.sort(function (a, b) { return a.start - b.start; });

    var barSegments = buildBarSegments(period, periodActs);
    var usedTime = periodActs.reduce(function (sum, a) { return sum + (a.end - a.start); }, 0);
    var freeTime = period.duration - usedTime;
    var disabled = isPeriodDisabled(period);
    var isBedtime = period.type === 'bedtime';
    var periodCls = disabled ? ' pl-period-disabled' : '';
    var iconType = isBedtime ? '&#9790;' : '&#9881;';

    html += '<div class="pl-period' + periodCls + '" data-period-idx="' + pIdx + '">';

    // الرأس مع checkbox
    html += '<div class="pl-period-header' + (isBedtime ? ' pl-header-bedtime' : '') + '">';
    html += '<label class="pl-check-label" onclick="event.stopPropagation()">';
    html += '<input type="checkbox" class="pl-period-check" data-pidx="' + pIdx + '"' + (disabled ? '' : ' checked') + '>';
    html += '<span class="pl-check-box"></span>';
    html += '</label>';
    html += '<span class="pl-period-icon">' + iconType + '</span>';
    html += '<span class="pl-period-time">' + displayTimeRange(period.start, period.end) + '</span>';
    html += '<span class="pl-period-dur">' + formatDuration(freeTime) + (isBedtime ? '' : ' عمل') + '</span>';
    html += '</div>';

    if (!disabled) {
      // الشريط المرئي
      html += '<div class="pl-bar-wrap">';
      html += '<div class="pl-bar' + (isBedtime ? ' pl-bar-bedtime' : '') + '">';
      barSegments.forEach(function (bs) {
        if (bs.type === 'free') {
          var freeCls = isBedtime ? 'pl-seg-bedtime' : 'pl-seg-work';
          html += '<div class="pl-segment ' + freeCls + '" style="flex:' + bs.duration + '" onclick="onBarFreeClick(' + pIdx + ', ' + bs.start + ')">';
          if (bs.duration >= 15) html += '<span class="seg-dur">' + formatDuration(bs.duration) + '</span>';
          html += '<span class="seg-range">' + displayTime(bs.start) + ' - ' + displayTime(bs.end) + '</span>';
          html += '</div>';
        } else {
          var actGIdx = activities.indexOf(periodActs[bs.actIndex]);
          html += '<div class="pl-segment pl-seg-activity" style="flex:' + bs.duration + '; background:' + bs.color + '" onclick="editActivity(' + pIdx + ', ' + actGIdx + ')" title="' + bs.name + ': ' + formatDuration(bs.duration) + '">';
          html += '<span class="pl-seg-edit">&#9998;</span>';
          html += '<span class="seg-dur">' + bs.icon + '</span>';
          html += '<span class="seg-range">' + displayTime(bs.start) + ' - ' + displayTime(bs.end) + '</span>';
          html += '</div>';
        }
      });
      html += '</div></div>';

      // شرائح الأنشطة
      if (periodActs.length > 0) {
        html += '<div class="pl-activities-list">';
        periodActs.forEach(function (act) {
          var actGlobalIdx = activities.indexOf(act);
          html += '<span class="pl-activity-chip" style="background:' + act.color + '" onclick="editActivity(' + pIdx + ', ' + actGlobalIdx + ')">';
          html += act.icon + ' ' + act.name + ' (' + formatDuration(act.end - act.start) + ')';
          html += '<span class="chip-edit">&#9998;</span></span>';
        });
        html += '</div>';
      }

      // زر تعيين كامل الفترة (يظهر فقط عندما لا توجد أنشطة)
      if (periodActs.length === 0) {
        html += '<button class="pl-full-btn" onclick="setFullPeriod(' + pIdx + ')">تعيين كامل الفترة</button>';
      }

      // زر الإضافة
      html += '<button class="pl-add-btn" onclick="showActivityForm(' + pIdx + ')">+ إضافة نشاط</button>';
    }

    html += '</div>';
  });

  document.getElementById('planner-body').innerHTML = html;
  updatePlannerSummary();

  // ربط أحداث checkbox
  document.querySelectorAll('.pl-period-check').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var pIdx = parseInt(cb.dataset.pidx);
      var periods = getPlannerPeriods();
      if (periods[pIdx]) togglePeriodEnabled(periods[pIdx]);
    });
  });
}

// ─── ملخص المخطط ───

function updatePlannerSummary() {
  var periods = getPlannerPeriods();
  var activities = getDayActivities();
  var totalFree = 0;
  var totalUsed = 0;

  periods.forEach(function (p) {
    if (isPeriodDisabled(p)) return;
    var pActs = activities.filter(function (a) { return a.start >= p.start && a.end <= p.end; });
    var used = pActs.reduce(function (sum, a) { return sum + (a.end - a.start); }, 0);
    totalFree += p.duration;
    totalUsed += used;
  });

  var remaining = totalFree - totalUsed;
  document.getElementById('planner-summary').innerHTML =
    '<span class="ps-label">الوقت المتبقي:</span>' +
    '<span class="ps-value">' + formatDuration(remaining) + '</span>' +
    '<span class="ps-detail">من ' + formatDuration(totalFree) + '</span>';
}

// ─── الأنشطة المسبقة ───

var DEFAULT_PRESETS = [
  { name: 'عمل',       icon: '💼', color: '#4ecdc4' },
  { name: 'رياضة',     icon: '🏃', color: '#ff6b6b' },
  { name: 'قراءة',     icon: '📖', color: '#7c6aef' },
  { name: 'طعام',      icon: '🍽️', color: '#e67e22' },
  { name: 'استراحة',   icon: '☕', color: '#ffa366' },
  { name: 'قيلولة',    icon: '😴', color: '#6c5ce7' },
  { name: 'نوم',       icon: '🌙', color: '#3a3f6b' },
  { name: 'عمل خارجي', icon: '🏢', color: '#3498db' }
];

function loadCustomPresets() {
  return ScheduleData.getPresets();
}

function saveCustomPreset(preset) {
  var customs = loadCustomPresets().slice();
  customs = customs.filter(function(p) { return p.name !== preset.name; });
  customs.push(preset);
  ScheduleData.savePresets(customs);
}

function getAllPresets() {
  return DEFAULT_PRESETS.concat(loadCustomPresets());
}

function renderPresetButtons() {
  var container = document.getElementById('af-presets');
  if (!container) return;
  var presets = getAllPresets();
  var html = '';
  presets.forEach(function(p) {
    html += '<button type="button" class="af-preset" data-name="' + p.name + '" data-icon="' + p.icon + '" data-color="' + p.color + '" style="border-color:' + p.color + '30">' + p.icon + ' ' + p.name + '</button>';
  });
  html += '<button type="button" class="af-preset af-preset-add" id="add-custom-preset">+ جديد</button>';
  container.innerHTML = html;

  // ربط الأحداث
  container.querySelectorAll('.af-preset:not(.af-preset-add)').forEach(function(btn) {
    btn.addEventListener('click', function() {
      container.querySelectorAll('.af-preset').forEach(function(p) { p.classList.remove('af-preset-selected'); });
      btn.classList.add('af-preset-selected');
      selectedPreset = { name: btn.dataset.name, icon: btn.dataset.icon, color: btn.dataset.color };
    });
  });

  var addBtn = document.getElementById('add-custom-preset');
  if (addBtn) {
    addBtn.addEventListener('click', openCustomPresetDialog);
  }
}

// ─── نافذة إضافة نشاط مخصص ───

var cpSelectedIcon = null;
var cpSelectedColor = null;

function openCustomPresetDialog() {
  cpSelectedIcon = null;
  cpSelectedColor = null;
  document.getElementById('cp-name').value = '';
  document.querySelectorAll('.cp-icon-btn').forEach(function(b) { b.classList.remove('cp-selected'); });
  document.querySelectorAll('.cp-color-btn').forEach(function(b) { b.classList.remove('cp-selected'); });
  document.getElementById('custom-preset-overlay').classList.add('active');
}

function closeCustomPresetDialog() {
  document.getElementById('custom-preset-overlay').classList.remove('active');
}

function saveCustomPresetFromDialog() {
  var name = document.getElementById('cp-name').value.trim();
  if (!name) return;
  var icon = cpSelectedIcon || '🎯';
  var color = cpSelectedColor || '#38bdf8';
  saveCustomPreset({ name: name, icon: icon, color: color });
  closeCustomPresetDialog();
  renderPresetButtons();
  // تحديد النشاط الجديد تلقائياً
  selectedPreset = { name: name, icon: icon, color: color };
  setTimeout(function() {
    var btns = document.querySelectorAll('.af-preset');
    btns.forEach(function(b) {
      b.classList.toggle('af-preset-selected', b.dataset.name === name);
    });
  }, 50);
}

// ─── ألوان وأيقونات عشوائية ───

var RANDOM_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e84393','#00cec9','#6c5ce7','#fd79a8','#00b894'];
var RANDOM_ICONS = ['🎯','⭐','🔥','💡','📝','🎨','🎵','🏠','🚗','📱','🎮','🧹','🍳','💪','🧘','📞','✏️','🛒'];

function getRandomColor() { return RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)]; }
function getRandomIcon() { return RANDOM_ICONS[Math.floor(Math.random() * RANDOM_ICONS.length)]; }

function getPresetOrRandom(name) {
  // أولاً: البحث في الأنشطة المسبقة (presets)
  var presets = document.querySelectorAll('.af-preset');
  for (var i = 0; i < presets.length; i++) {
    if (presets[i].dataset.name === name) {
      return { name: name, icon: presets[i].dataset.icon, color: presets[i].dataset.color };
    }
  }
  // ثانياً: البحث في الأنشطة الموجودة بنفس الاسم (لاستخدام نفس اللون والأيقونة)
  var allActivities = getDayActivities();
  for (var j = 0; j < allActivities.length; j++) {
    if (allActivities[j].name === name) {
      return { name: name, icon: allActivities[j].icon, color: allActivities[j].color };
    }
  }
  // ثالثاً: البحث في كل الأيام المحفوظة
  var allDays = ScheduleData.getAllDays();
  for (var dateKey in allDays) {
    var dayPlan = allDays[dateKey];
    var acts = Array.isArray(dayPlan) ? dayPlan : (dayPlan.activities || []);
    for (var k = 0; k < acts.length; k++) {
      if (acts[k].name === name) {
        return { name: name, icon: acts[k].icon, color: acts[k].color };
      }
    }
  }
  return { name: name, icon: getRandomIcon(), color: getRandomColor() };
}

// ─── مساعد: البداية الذكية ───

function getSmartStartTime(pIdx) {
  var periods = getPlannerPeriods();
  var period = periods[pIdx];
  if (!period) return period ? period.start : 0;
  var activities = getDayActivities().filter(function(a) { return a.start >= period.start && a.end <= period.end; });
  activities.sort(function(a, b) { return a.start - b.start; });
  // البدء بعد آخر نشاط
  if (activities.length > 0) return activities[activities.length - 1].end;
  return period.start;
}

function getMaxEndForStart(pIdx, startMin) {
  var periods = getPlannerPeriods();
  var period = periods[pIdx];
  if (!period) return 1440;
  var activities = getDayActivities().filter(function(a) { return a.start >= period.start && a.end <= period.end; });
  if (editingActivityIndex !== null) {
    activities = activities.filter(function(a, idx) { return idx !== editingActivityIndex; });
  }
  var maxEnd = period.end;
  for (var i = 0; i < activities.length; i++) {
    if (activities[i].start > startMin && activities[i].start < maxEnd) {
      maxEnd = activities[i].start;
    }
  }
  return maxEnd;
}

// ─── مزامنة البدء/الانتهاء/المدة ───

function syncFromStartAndDuration() {
  var parts = document.getElementById('af-start-time').value.split(':').map(Number);
  var startMin = parts[0] * 60 + parts[1];
  var dur = parseInt(document.getElementById('af-duration').value);
  document.getElementById('af-end-time').value = minutesToTimeStr(startMin + dur);
  document.getElementById('af-duration-value').textContent = dur;
}

function syncFromEndTime() {
  var sParts = document.getElementById('af-start-time').value.split(':').map(Number);
  var eParts = document.getElementById('af-end-time').value.split(':').map(Number);
  var startMin = sParts[0] * 60 + sParts[1];
  var endMin = eParts[0] * 60 + eParts[1];
  var dur = Math.max(5, endMin - startMin);
  var slider = document.getElementById('af-duration');
  slider.value = dur;
  document.getElementById('af-duration-value').textContent = dur;
}

function syncFromStartTime() {
  var parts = document.getElementById('af-start-time').value.split(':').map(Number);
  var startMin = parts[0] * 60 + parts[1];
  var maxEnd = getMaxEndForStart(currentFormWorkIndex, startMin);
  var maxDur = Math.max(5, maxEnd - startMin);
  var slider = document.getElementById('af-duration');
  slider.max = maxDur;
  if (parseInt(slider.value) > maxDur) slider.value = maxDur;
  syncFromStartAndDuration();
}

// ─── نموذج إضافة نشاط ───

function showActivityForm(pIdx) {
  var periods = getPlannerPeriods();
  var period = periods[pIdx];
  if (!period) return;

  currentFormWorkIndex = pIdx;
  editingActivityIndex = null;
  selectedPreset = null;

  var smartStart = getSmartStartTime(pIdx);
  document.getElementById('af-start-time').value = minutesToTimeStr(smartStart);
  document.getElementById('af-custom-name').value = '';

  var maxEnd = getMaxEndForStart(pIdx, smartStart);
  var maxDur = Math.max(5, maxEnd - smartStart);
  var defaultDur = Math.min(30, maxDur);

  var slider = document.getElementById('af-duration');
  slider.step = 5;
  slider.max = maxDur;
  slider.value = defaultDur;
  document.getElementById('af-duration-value').textContent = defaultDur;
  document.getElementById('af-end-time').value = minutesToTimeStr(smartStart + defaultDur);

  document.querySelectorAll('.af-preset').forEach(function (p) { p.classList.remove('af-preset-selected'); });

  document.getElementById('af-add-btn').textContent = 'إضافة';
  document.getElementById('af-delete-btn').style.display = 'none';
  document.querySelector('.af-header h3').textContent = 'إضافة نشاط';

  document.getElementById('activity-form-overlay').classList.add('active');
}

function setFullPeriod(pIdx) {
  var periods = getPlannerPeriods();
  var period = periods[pIdx];
  if (!period) return;

  currentFormWorkIndex = pIdx;
  editingActivityIndex = null;
  selectedPreset = null;

  document.getElementById('af-start-time').value = minutesToTimeStr(period.start);
  document.getElementById('af-end-time').value = minutesToTimeStr(period.end);
  document.getElementById('af-custom-name').value = '';

  var fullDur = period.duration;
  var slider = document.getElementById('af-duration');
  slider.step = 1;
  slider.max = fullDur;
  slider.value = fullDur;
  document.getElementById('af-duration-value').textContent = fullDur;

  document.querySelectorAll('.af-preset').forEach(function (p) { p.classList.remove('af-preset-selected'); });

  document.getElementById('af-add-btn').textContent = 'تعيين';
  document.getElementById('af-delete-btn').style.display = 'none';
  document.querySelector('.af-header h3').textContent = 'تعيين كامل الفترة';

  document.getElementById('activity-form-overlay').classList.add('active');
}

function editActivity(pIdx, globalIdx) {
  var periods = getPlannerPeriods();
  var period = periods[pIdx];
  var activities = getDayActivities();
  var act = activities[globalIdx];
  if (!period || !act) return;

  currentFormWorkIndex = pIdx;
  editingActivityIndex = globalIdx;

  document.getElementById('af-start-time').value = minutesToTimeStr(act.start);
  document.getElementById('af-end-time').value = minutesToTimeStr(act.end);
  document.getElementById('af-custom-name').value = act.name;
  var duration = act.end - act.start;
  var slider = document.getElementById('af-duration');
  slider.step = 1;
  var maxEnd = getMaxEndForStart(pIdx, act.start);
  slider.max = Math.max(5, maxEnd - act.start);
  slider.value = duration;
  document.getElementById('af-duration-value').textContent = duration;

  selectedPreset = { name: act.name, icon: act.icon, color: act.color };
  document.querySelectorAll('.af-preset').forEach(function (p) {
    p.classList.toggle('af-preset-selected', p.dataset.name === act.name);
  });

  document.getElementById('af-add-btn').textContent = 'حفظ التعديل';
  document.getElementById('af-delete-btn').style.display = '';
  document.querySelector('.af-header h3').textContent = 'تعديل نشاط';

  document.getElementById('activity-form-overlay').classList.add('active');
}

function closeActivityForm() {
  document.getElementById('activity-form-overlay').classList.remove('active');
  currentFormWorkIndex = null;
  editingActivityIndex = null;
}

function addActivity() {
  if (currentFormWorkIndex === null) return;
  var periods = getPlannerPeriods();
  var period = periods[currentFormWorkIndex];
  if (!period) return;

  var customName = document.getElementById('af-custom-name').value.trim();
  var preset = selectedPreset;
  if (!preset) {
    var name = customName || 'نشاط';
    preset = getPresetOrRandom(name);
  }
  var name = customName || preset.name;

  var sParts = document.getElementById('af-start-time').value.split(':').map(Number);
  var startMin = sParts[0] * 60 + sParts[1];
  var eParts = document.getElementById('af-end-time').value.split(':').map(Number);
  var endMin = eParts[0] * 60 + eParts[1];

  if (endMin <= startMin) endMin = startMin + parseInt(document.getElementById('af-duration').value);
  if (startMin < period.start) startMin = period.start;
  if (endMin > period.end) endMin = period.end;
  if (endMin <= startMin) return;

  var activities = getDayActivities();

  // إزاحة ذكية: تحريك الأنشطة المجاورة إذا لزم الأمر
  var periodActs = activities.filter(function(a) { return a.start >= period.start && a.end <= period.end; });
  periodActs.forEach(function(a, idx) {
    if (editingActivityIndex !== null && activities.indexOf(a) === editingActivityIndex) return;
    // إزاحة نشاط يتداخل بعد النشاط الجديد
    if (a.start >= startMin && a.start < endMin) {
      var shift = endMin - a.start;
      var dur = a.end - a.start;
      a.start = endMin;
      a.end = Math.min(a.start + dur, period.end);
    }
  });

  if (editingActivityIndex !== null) {
    var oldAct = activities[editingActivityIndex];
    // Update associated focus sessions if time range or name changed
    if (typeof FocusData !== 'undefined' && oldAct) {
      var dateStr = getPlannerDate();
      var sessions = FocusData.getForSegment(dateStr, oldAct.start, oldAct.end);
      sessions.forEach(function(s) {
        s.segStart = startMin;
        s.segEnd = endMin;
        s.activityName = name;
        s.activityIcon = preset.icon;
        s.activityColor = preset.color;
        FocusData.save(dateStr, s);
      });
    }
    activities[editingActivityIndex] = { name: name, icon: preset.icon, color: preset.color, start: startMin, end: endMin };
  } else {
    activities.push({ name: name, icon: preset.icon, color: preset.color, start: startMin, end: endMin });
  }

  savePlannerData();
  closeActivityForm();
  renderPlanner(currentPlannerFilter);
}

function deleteActivityFromForm() {
  if (editingActivityIndex === null) return;
  removeActivity(editingActivityIndex);
  closeActivityForm();
}

function removeActivity(globalIndex) {
  var activities = getDayActivities();
  if (globalIndex >= 0 && globalIndex < activities.length) {
    var act = activities[globalIndex];
    // Delete associated focus sessions
    if (typeof FocusData !== 'undefined' && act) {
      var dateStr = getPlannerDate();
      var sessions = FocusData.getForSegment(dateStr, act.start, act.end);
      sessions.forEach(function(s) { FocusData.delete(dateStr, s.id); });
    }
    activities.splice(globalIndex, 1);
    savePlannerData();
    renderPlanner(currentPlannerFilter);
  }
}

function onBarFreeClick(pIdx, startMin) {
  showActivityForm(pIdx);
  document.getElementById('af-start-time').value = minutesToTimeStr(startMin);
  syncFromStartTime();
}


// ─── تحديث فترات العمل على الصفحة الرئيسية بعد الحفظ ───

function updateMainWorkBlocks() {
  if (typeof renderDay === 'function') renderDay();
}

function clearDayPlan() {
  showConfirm('هل تريد مسح جميع الأنشطة لهذا اليوم؟', function() {
    var dateStr = getPlannerDate();
    var dayData = ScheduleData.getDay(dateStr);
    // Delete all focus sessions for this day's activities
    if (typeof FocusData !== 'undefined' && dayData && dayData.activities) {
      dayData.activities.forEach(function(act) {
        var sessions = FocusData.getForSegment(dateStr, act.start, act.end);
        sessions.forEach(function(s) { FocusData.delete(dateStr, s.id); });
      });
    }
    if (dayData) {
      dayData.activities = [];
      dayData.disabledPeriods = [];
      ScheduleData.saveDay(dateStr);
    }
    if (typeof renderDay === 'function') renderDay();
  });
}

function showConfirm(message, onYes) {
  var overlay = document.getElementById('confirm-overlay');
  document.getElementById('confirm-text').textContent = message;
  overlay.classList.add('active');

  var yesBtn = document.getElementById('confirm-yes');
  var noBtn = document.getElementById('confirm-no');

  function cleanup() {
    overlay.classList.remove('active');
    yesBtn.removeEventListener('click', handleYes);
    noBtn.removeEventListener('click', handleNo);
  }
  function handleYes() { cleanup(); onYes(); }
  function handleNo() { cleanup(); }

  yesBtn.addEventListener('click', handleYes);
  noBtn.addEventListener('click', handleNo);
}

// ─── ربط الأحداث ───

document.addEventListener('DOMContentLoaded', async function () {
  await ScheduleData.whenReady();
  loadPlannerData();

  document.getElementById('open-planner').addEventListener('click', openPlanner);
  document.getElementById('clear-day-btn').addEventListener('click', clearDayPlan);
  document.getElementById('planner-close').addEventListener('click', closePlanner);
  document.getElementById('planner-overlay').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) closePlanner();
  });

  document.getElementById('planner-save').addEventListener('click', function () {
    savePlannerData();
    closePlanner();
  });

  document.getElementById('af-close').addEventListener('click', closeActivityForm);
  document.getElementById('activity-form-overlay').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) closeActivityForm();
  });
  document.getElementById('af-add-btn').addEventListener('click', addActivity);
  document.getElementById('af-delete-btn').addEventListener('click', deleteActivityFromForm);

  // مزامنة البدء/الانتهاء/المدة
  document.getElementById('af-duration').addEventListener('input', syncFromStartAndDuration);
  document.getElementById('af-start-time').addEventListener('change', syncFromStartTime);
  document.getElementById('af-end-time').addEventListener('change', syncFromEndTime);

  // عرض الأنشطة المسبقة
  renderPresetButtons();

  // نافذة النشاط المخصص
  document.getElementById('cp-close').addEventListener('click', closeCustomPresetDialog);
  document.getElementById('custom-preset-overlay').addEventListener('click', function(e) {
    if (e.target === e.currentTarget) closeCustomPresetDialog();
  });
  document.getElementById('cp-save').addEventListener('click', saveCustomPresetFromDialog);

  // اختيار أيقونة
  document.querySelectorAll('.cp-icon-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.cp-icon-btn').forEach(function(b) { b.classList.remove('cp-selected'); });
      btn.classList.add('cp-selected');
      cpSelectedIcon = btn.dataset.icon;
    });
  });

  // اختيار لون
  document.querySelectorAll('.cp-color-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.cp-color-btn').forEach(function(b) { b.classList.remove('cp-selected'); });
      btn.classList.add('cp-selected');
      cpSelectedColor = btn.dataset.color;
    });
  });

  // عرض النتائج المحفوظة عند تحميل الصفحة
  setTimeout(updateMainWorkBlocks, 500);
});
