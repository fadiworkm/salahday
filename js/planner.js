/**
 * أداة تخطيط وقت العمل
 * يعتمد على schedule.js: displayTime, displayTimeRange, formatDuration, minutesToTimeStr, window._workSegments
 */

let plannerData = {};
let currentFormWorkIndex = null;
let selectedPreset = null;
let editingActivityIndex = null; // null = إضافة جديد, رقم = تعديل

// ─── استمرارية البيانات ───

function loadPlannerData() {
  const saved = localStorage.getItem('workPlannerData');
  if (saved) {
    try { plannerData = JSON.parse(saved); } catch (e) { plannerData = {}; }
  }
}

function savePlannerData() {
  localStorage.setItem('workPlannerData', JSON.stringify(plannerData));
}

function getPlannerDate() {
  return document.getElementById('schedule-date').value;
}

function getDayPlan() {
  const dateStr = getPlannerDate();
  if (!plannerData[dateStr]) plannerData[dateStr] = { activities: [], disabledPeriods: [] };
  // ترقية من الشكل القديم (مصفوفة فقط)
  if (Array.isArray(plannerData[dateStr])) {
    plannerData[dateStr] = { activities: plannerData[dateStr], disabledPeriods: [] };
  }
  return plannerData[dateStr];
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

  // فترة ما بعد العشاء (وقت شخصي قبل النوم)
  const bedtimeSeg = allSegments.find(function (s) { return s.type === 'bedtime'; });
  if (bedtimeSeg) {
    periods.push({ type: 'bedtime', index: -1, start: bedtimeSeg.start, end: bedtimeSeg.end, duration: bedtimeSeg.duration, label: 'وقت شخصي قبل النوم' });
  }

  periods.sort(function (a, b) { return a.start - b.start; });
  return periods;
}

// ─── فتح/إغلاق المخطط ───

function openPlanner() {
  loadPlannerData();
  renderPlanner();
  document.getElementById('planner-overlay').classList.add('active');
}

function closePlanner() {
  savePlannerData();
  document.getElementById('planner-overlay').classList.remove('active');
  // تحديث عرض فترات العمل على الصفحة الرئيسية
  updateMainWorkBlocks();
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
  renderPlanner();
}

// ─── عرض المخطط ───

function renderPlanner() {
  var periods = getPlannerPeriods();
  var activities = getDayActivities();
  var html = '';

  periods.forEach(function (period, pIdx) {
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
          if (bs.duration >= 15) html += formatDuration(bs.duration);
          html += '</div>';
        } else {
          var actGIdx = activities.indexOf(periodActs[bs.actIndex]);
          html += '<div class="pl-segment pl-seg-activity" style="flex:' + bs.duration + '; background:' + bs.color + '" onclick="editActivity(' + pIdx + ', ' + actGIdx + ')" title="' + bs.name + ': ' + formatDuration(bs.duration) + '">';
          html += '<span class="pl-seg-edit">&#9998;</span>';
          html += bs.icon;
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

// ─── نموذج إضافة نشاط ───

function showActivityForm(pIdx) {
  var periods = getPlannerPeriods();
  var period = periods[pIdx];
  if (!period) return;

  currentFormWorkIndex = pIdx;
  editingActivityIndex = null;
  selectedPreset = null;

  var startInput = document.getElementById('af-start-time');
  startInput.value = minutesToTimeStr(period.start);

  document.getElementById('af-custom-name').value = '';
  document.getElementById('af-duration').value = 30;
  document.getElementById('af-duration-value').textContent = '30';
  document.querySelectorAll('.af-preset').forEach(function (p) { p.classList.remove('af-preset-selected'); });

  // وضع الإضافة
  document.getElementById('af-add-btn').textContent = 'إضافة';
  document.getElementById('af-delete-btn').style.display = 'none';
  document.querySelector('.af-header h3').textContent = 'إضافة نشاط';

  updateDurationMax();
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

  // تعبئة النموذج ببيانات النشاط
  document.getElementById('af-start-time').value = minutesToTimeStr(act.start);
  document.getElementById('af-custom-name').value = act.name;
  var duration = act.end - act.start;
  document.getElementById('af-duration').value = duration;
  document.getElementById('af-duration-value').textContent = duration;

  // تحديد النوع المسبق
  selectedPreset = { name: act.name, icon: act.icon, color: act.color };
  document.querySelectorAll('.af-preset').forEach(function (p) {
    p.classList.toggle('af-preset-selected', p.dataset.name === act.name);
  });

  // وضع التعديل
  document.getElementById('af-add-btn').textContent = 'حفظ التعديل';
  document.getElementById('af-delete-btn').style.display = '';
  document.querySelector('.af-header h3').textContent = 'تعديل نشاط';

  updateDurationMaxForEdit();
  document.getElementById('activity-form-overlay').classList.add('active');
}

function closeActivityForm() {
  document.getElementById('activity-form-overlay').classList.remove('active');
  currentFormWorkIndex = null;
  editingActivityIndex = null;
}

function updateDurationMaxForEdit() {
  var periods = getPlannerPeriods();
  var period = periods[currentFormWorkIndex];
  if (!period) return;

  var startInput = document.getElementById('af-start-time');
  var parts = startInput.value.split(':').map(Number);
  var startMin = parts[0] * 60 + parts[1];

  var activities = getDayActivities().filter(function (a) { return a.start >= period.start && a.end <= period.end; });
  var maxEnd = period.end;
  for (var i = 0; i < activities.length; i++) {
    // تجاهل النشاط الحالي عند التعديل
    if (editingActivityIndex !== null && activities[i] === getDayActivities()[editingActivityIndex]) continue;
    if (activities[i].start > startMin && activities[i].start < maxEnd) {
      maxEnd = activities[i].start;
    }
  }

  var maxDur = Math.max(0, maxEnd - startMin);
  var slider = document.getElementById('af-duration');
  slider.max = Math.max(5, maxDur);
  if (parseInt(slider.value) > maxDur) {
    slider.value = Math.min(30, maxDur);
    document.getElementById('af-duration-value').textContent = slider.value;
  }
}

function updateDurationMax() {
  if (editingActivityIndex !== null) {
    updateDurationMaxForEdit();
    return;
  }
  var periods = getPlannerPeriods();
  var period = periods[currentFormWorkIndex];
  if (!period) return;

  var startInput = document.getElementById('af-start-time');
  var parts = startInput.value.split(':').map(Number);
  var startMin = parts[0] * 60 + parts[1];

  var activities = getDayActivities().filter(function (a) { return a.start >= period.start && a.end <= period.end; });
  var maxEnd = period.end;
  for (var i = 0; i < activities.length; i++) {
    if (activities[i].start > startMin && activities[i].start < maxEnd) {
      maxEnd = activities[i].start;
    }
  }

  var maxDur = Math.max(0, maxEnd - startMin);
  var slider = document.getElementById('af-duration');
  slider.max = Math.max(5, maxDur);
  if (parseInt(slider.value) > maxDur) {
    slider.value = Math.min(30, maxDur);
    document.getElementById('af-duration-value').textContent = slider.value;
  }
}

function addActivity() {
  if (currentFormWorkIndex === null) return;
  var periods = getPlannerPeriods();
  var period = periods[currentFormWorkIndex];
  if (!period) return;

  var preset = selectedPreset || { name: 'مهمة', icon: '📌', color: '#38bdf8' };
  var customName = document.getElementById('af-custom-name').value.trim();
  var name = customName || preset.name;

  var startInput = document.getElementById('af-start-time');
  var parts = startInput.value.split(':').map(Number);
  var startMin = parts[0] * 60 + parts[1];
  var duration = parseInt(document.getElementById('af-duration').value);
  var endMin = startMin + duration;

  if (startMin < period.start || endMin > period.end) return;

  var activities = getDayActivities();

  // التحقق من التداخل (تجاهل النشاط الحالي عند التعديل)
  var overlap = activities.some(function (a, idx) {
    if (editingActivityIndex !== null && idx === editingActivityIndex) return false;
    return a.start >= period.start && a.end <= period.end &&
           startMin < a.end && endMin > a.start;
  });
  if (overlap) return;

  if (editingActivityIndex !== null) {
    // تعديل النشاط الموجود
    activities[editingActivityIndex] = { name: name, icon: preset.icon, color: preset.color, start: startMin, end: endMin };
  } else {
    // إضافة نشاط جديد
    activities.push({ name: name, icon: preset.icon, color: preset.color, start: startMin, end: endMin });
  }

  savePlannerData();
  closeActivityForm();
  renderPlanner();
}

function deleteActivityFromForm() {
  if (editingActivityIndex === null) return;
  removeActivity(editingActivityIndex);
  closeActivityForm();
}

function removeActivity(globalIndex) {
  var activities = getDayActivities();
  if (globalIndex >= 0 && globalIndex < activities.length) {
    activities.splice(globalIndex, 1);
    savePlannerData();
    renderPlanner();
  }
}

function onBarFreeClick(pIdx, startMin) {
  showActivityForm(pIdx);
  document.getElementById('af-start-time').value = minutesToTimeStr(startMin);
  updateDurationMax();
}


// ─── تحديث فترات العمل على الصفحة الرئيسية بعد الحفظ ───

function updateMainWorkBlocks() {
  if (typeof renderDay === 'function') renderDay();
}

// ─── ربط الأحداث ───

document.addEventListener('DOMContentLoaded', function () {
  loadPlannerData();

  document.getElementById('open-planner').addEventListener('click', openPlanner);
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

  document.getElementById('af-duration').addEventListener('input', function (e) {
    document.getElementById('af-duration-value').textContent = e.target.value;
  });

  document.getElementById('af-start-time').addEventListener('change', updateDurationMax);

  document.querySelectorAll('.af-preset').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.af-preset').forEach(function (p) { p.classList.remove('af-preset-selected'); });
      btn.classList.add('af-preset-selected');
      selectedPreset = { name: btn.dataset.name, icon: btn.dataset.icon, color: btn.dataset.color };
    });
  });

  // عرض النتائج المحفوظة عند تحميل الصفحة
  setTimeout(updateMainWorkBlocks, 500);
});
