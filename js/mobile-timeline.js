/**
 * mobile-timeline.js — عرض الجدول الزمني العمودي للجوال
 * Loaded after schedule.js, before planner.js.
 *
 * Uses LiveTimer for real-time H:MM:SS updates on progress bars and active segments.
 *
 * Visual layout per row (LTR):
 *   [time-label]  [pill/line]  [icon + activity-info]
 */

/* ─── helpers ─── */

function _mtIsToday() {
  return document.getElementById('schedule-date').value === new Date().toISOString().split('T')[0];
}

function _mtNowMin() {
  var d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function _mtNowSec() {
  var d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function _mtState(start, end, isToday, nowMin) {
  if (!isToday) return '';
  if (nowMin >= end) return 'mt-done';
  if (nowMin >= start) return 'mt-active';
  return '';
}

function _mtPillH(dur) { return Math.max(56, Math.min(dur * 1.3, 200)); }
function _mtLineH(dur) { return Math.max(20, Math.min(dur * 0.6, 80)); }

/* ─── main render ─── */

function renderMobileTimeline() {
  var container = document.getElementById('work-blocks');
  if (!container) return;

  var old = container.querySelector('.mt-timeline');
  if (old) old.remove();

  var segs = window._workSegments || [];
  if (segs.length === 0) return;

  var dateStr = document.getElementById('schedule-date').value;
  var isToday = _mtIsToday();
  var nowMin = _mtNowMin();
  var nowSec = _mtNowSec();

  var saved = ScheduleData.getDay(dateStr);
  if (Array.isArray(saved)) saved = { activities: saved, disabledPeriods: [] };
  var acts = saved ? saved.activities || [] : [];
  var disabledList = saved ? saved.disabledPeriods || [] : [];

  var html = '<div class="mt-timeline">';

  segs.forEach(function (seg, idx) {
    var pKey = 'work:' + seg.start + '-' + seg.end;
    var isDis = disabledList.indexOf(pKey) !== -1;
    var pActs = acts.filter(function (a) { return a.start >= seg.start && a.end <= seg.end; })
                    .sort(function (a, b) { return a.start - b.start; });
    var used = pActs.reduce(function (s, a) { return s + (a.end - a.start); }, 0);
    var free = seg.duration - used;

    var isCur = isToday && nowMin >= seg.start && nowMin < seg.end;

    if (idx > 0) html += '<div class="mt-period-sep"></div>';

    // Color the period header using the prayer color of the prayer at the start of this period
    var prayerKey = seg.prayerAtStart && seg.prayerAtStart.prayerKey;
    var periodColor = (typeof PRAYER_COLORS !== 'undefined' && prayerKey && PRAYER_COLORS[prayerKey])
      ? PRAYER_COLORS[prayerKey]
      : null;
    var periodStyle = periodColor ? ' style="--period-color:' + periodColor + '"' : '';

    // Collapse by default; current period stays open. "Expand all" preference overrides.
    var expandAll = false;
    try { expandAll = localStorage.getItem('mt-expand-all') === '1'; } catch (e) {}
    var isCollapsed = !expandAll && !isCur && !isDis;

    html += '<div class="mt-period' + (isDis ? ' mt-period-disabled' : '') +
            (isCur ? ' mt-period-current' : '') +
            (isCollapsed ? ' mt-period-collapsed' : '') + '"' + periodStyle + '>';

    // Compute progress for current period — used as the header's background fill
    var pPct = 0, fPct = 0, periodFocusSec = 0, hasProgress = false;
    if (isCur && free > 0) {
      var pResult = computePeriodProgress(nowSec, seg.start, seg.end);
      var pTotal = pResult.gone + pResult.left;
      pPct = pTotal > 0 ? ((pResult.gone / pTotal) * 100).toFixed(1) : 0;
      periodFocusSec = typeof FocusData !== 'undefined' ? FocusData.getTotalForSegment(dateStr, seg.start, seg.end) : 0;
      var periodDurSec = free * 60;
      fPct = periodDurSec > 0 ? Math.min(100, (periodFocusSec / periodDurSec) * 100).toFixed(1) : 0;
      hasProgress = true;
    }

    // header — toggles collapse when clicked (disabled periods excluded). Carries data-seg-* for LiveTimer updates.
    var headerClick = isDis ? '' : ' onclick="_mtTogglePeriod(this)"';
    var headerData = hasProgress ? ' data-seg-start="' + seg.start + '" data-seg-end="' + seg.end + '"' : '';
    html += '<div class="mt-period-header' + (hasProgress ? ' mt-period-header-progress' : '') + '"' + headerData + headerClick + '>';
    if (hasProgress) {
      html += '<div class="wp-fill" style="width:' + pPct + '%"></div>';
      if (periodFocusSec > 0) {
        html += '<div class="wp-focus-fill" style="width:' + fPct + '%"></div>';
      }
    }
    html += '<span class="mt-period-time">' + displayTimeRange(seg.start, seg.end) + '</span>';
    html += '<span class="mt-period-dur">' + (isDis ? 'معطّلة' : formatDuration(free) + ' متاح') + '</span>';
    if (!isDis) html += '<span class="mt-period-caret">&#8964;</span>';
    html += '</div>';

    if (isDis) { html += '</div>'; return; }

    html += '<div class="mt-period-body">';

    // Compact time labels (under header) — only for the current period
    if (hasProgress) {
      html += '<div class="mt-period-progress">';
      html += '<div class="wp-labels">';
      html += '<div class="wp-gone"><span class="wp-dot wp-dot-gone"></span> انتهى <b>' + LiveTimer.format(pResult.gone) + '</b></div>';
      html += '<div class="wp-left"><span class="wp-dot wp-dot-left"></span> متبقي <b>' + LiveTimer.format(pResult.left) + '</b></div>';
      html += '</div>';
      if (periodFocusSec > 0) {
        html += '<div class="wp-focus-label"><span>🎯 تركيز</span><b>' + _formatFocusTime(periodFocusSec) + '</b><span class="wp-focus-pct">' + fPct + '%</span></div>';
      }
      html += '</div>';
    }

    // track
    html += '<div class="mt-track">';
    var cursor = seg.start;
    var lastLabel = -1;

    pActs.forEach(function (act) {
      if (act.start > cursor) {
        html += _mtBuildFree(cursor, act.start, isToday, nowMin, lastLabel, idx);
        lastLabel = act.start;
      }
      var actGIdx = acts.indexOf(act);
      html += _mtBuildAct(act, isToday, nowMin, lastLabel, idx, actGIdx);
      lastLabel = act.end;
      cursor = act.end;
    });

    if (cursor < seg.end) {
      html += _mtBuildFree(cursor, seg.end, isToday, nowMin, lastLabel, idx);
      lastLabel = seg.end;
    }

    if (lastLabel !== seg.end) {
      html += '<div class="mt-label" data-t="' + displayTime(seg.end) + '"></div>';
    }

    html += '</div>'; // track
    html += '</div>'; // period-body
    html += '</div>'; // period
  });

  // وقت النوم — في نهاية الخط الزمني (ينقر للتعديل)
  if (typeof window._prayerMins !== 'undefined' && window._prayerMins) {
    var bedtime = (typeof getManualBedtime === 'function') ? getManualBedtime(window._prayerMins) : 0;
    var bedtimeStr = (typeof displayTime === 'function') ? displayTime(bedtime) : minutesToTimeStr(bedtime);
    html += '<div class="mt-bedtime-row" onclick="openBedtimeDialog()">';
    html += '<span class="mt-bedtime-icon">🌙</span>';
    html += '<span class="mt-bedtime-label">وقت النوم</span>';
    html += '<span class="mt-bedtime-value">' + bedtimeStr + '</span>';
    html += '<span class="mt-bedtime-edit">&#9998;</span>';
    html += '</div>';
  }

  html += '</div>';

  container.insertAdjacentHTML('beforeend', html);
  // Note: timers registered via _mtRegisterTimers() which is hooked into registerTimers()
}

window.renderMobileTimeline = renderMobileTimeline;

function _mtTogglePeriod(headerEl) {
  var period = headerEl.closest('.mt-period');
  if (!period) return;
  period.classList.toggle('mt-period-collapsed');
}
window._mtTogglePeriod = _mtTogglePeriod;

/* Expand-all preference: saved in localStorage, survives reload */
function _mtGetExpandAll() {
  try { return localStorage.getItem('mt-expand-all') === '1'; } catch (e) { return false; }
}

function _mtApplyExpandAll(expandAll) {
  var periods = document.querySelectorAll('.mt-timeline .mt-period');
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    if (p.classList.contains('mt-period-disabled')) continue;
    if (expandAll || p.classList.contains('mt-period-current')) {
      p.classList.remove('mt-period-collapsed');
    } else {
      p.classList.add('mt-period-collapsed');
    }
  }
  var btn = document.getElementById('toggle-periods-btn');
  if (btn) {
    btn.innerHTML = expandAll ? '&#9662;' : '&#9656;'; // ▾ expanded, ▸ collapsed
    btn.classList.toggle('btn-toggle-periods-expanded', expandAll);
    btn.title = expandAll ? 'طي الفترات (عرض النشط فقط)' : 'توسيع كل الفترات';
  }
}

function _mtToggleExpandAll() {
  var next = !_mtGetExpandAll();
  try { localStorage.setItem('mt-expand-all', next ? '1' : '0'); } catch (e) {}
  _mtApplyExpandAll(next);
}

document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('toggle-periods-btn');
  if (btn) {
    btn.addEventListener('click', _mtToggleExpandAll);
    // Reflect initial state on the button
    _mtApplyExpandAll(_mtGetExpandAll());
  }
});

/* ─── node builders ─── */

function _mtBuildFree(start, end, isToday, nowMin, lastLabel, pIdx) {
  var dur = end - start;
  var st = _mtState(start, end, isToday, nowMin);
  var h = _mtLineH(dur);
  var html = '';

  if (lastLabel !== start) {
    html += '<div class="mt-label" data-t="' + displayTime(start) + '"></div>';
  }

  html += '<div class="mt-node mt-node-free mt-clickable' + (st ? ' ' + st : '') + '"' +
          ' data-seg-s="' + start + '" data-seg-e="' + end + '"' +
          ' onclick="onBarFreeClick(' + pIdx + ', ' + start + ')">';
  html += '<div class="mt-rail"><div class="mt-line" style="height:' + h + 'px"><div class="mt-line-fill"></div></div></div>';
  html += '<div class="mt-body mt-body-free">';
  html += '<span class="mt-free-dur">' + formatDuration(dur) + '</span>';
  if (st === 'mt-active') {
    html += '<span class="mt-timer"></span>';
  }
  html += '</div>';
  html += '</div>';

  html += '<div class="mt-label" data-t="' + displayTime(end) + '"></div>';
  return html;
}

function _mtBuildAct(act, isToday, nowMin, lastLabel, pIdx, actGIdx) {
  var dur = act.end - act.start;
  var st = _mtState(act.start, act.end, isToday, nowMin);
  var h = _mtPillH(dur);
  var color = act.color || '#3498db';
  var html = '';

  if (lastLabel !== act.start) {
    html += '<div class="mt-label" data-t="' + displayTime(act.start) + '"></div>';
  }

  html += '<div class="mt-node mt-node-act mt-clickable' + (st ? ' ' + st : '') + '"' +
          ' data-seg-s="' + act.start + '" data-seg-e="' + act.end + '"' +
          ' style="--node-color:' + color + '"' +
          ' onclick="editActivity(' + pIdx + ', ' + actGIdx + ')">';
  html += '<div class="mt-rail"><div class="mt-pill" style="height:' + h + 'px"><div class="mt-pill-fill"></div></div></div>';
  html += '<div class="mt-body">';
  html += '<div class="mt-icon" style="background:' + color + '">' + (act.icon || '') + '</div>';
  html += '<div class="mt-info">';
  html += '<div class="mt-name">' + (act.name || '') + '</div>';
  html += '<div class="mt-dur">' + formatDuration(dur) + '</div>';
  if (act.note && act.note.trim()) {
    html += '<div class="mt-note">' + act.note.replace(/</g,'&lt;').replace(/\n/g,'<br>') + '</div>';
  }
  html += '</div>';
  if (st === 'mt-active') {
    var dateStr = document.getElementById('schedule-date').value;
    html += '<div class="mt-focus-row">';
    html += '<div class="mt-focus-actions">';
    html += '<button class="mt-focus-btn" style="--focus-btn-bg:' + color + '88;--focus-btn-bg2:' + color + '55" onclick="openFocusMode(\'' + dateStr + '\',' + act.start + ',' + act.end + ',\'' + (act.name||'').replace(/'/g,"\\'") + '\',\'' + (act.icon||'') + '\',\'' + color + '\')">&#127919; ركز</button>';
    html += '<span class="mt-timer"></span>';
    html += '</div>';
    html += '</div>';
  }
  // Focus progress for this activity
  var actDateStr = document.getElementById('schedule-date').value;
  var actFocusSec = typeof FocusData !== 'undefined' ? FocusData.getTotalForSegment(actDateStr, act.start, act.end) : 0;
  if (actFocusSec > 0) {
    var actDurSec = dur * 60;
    var actFPct = actDurSec > 0 ? Math.min(100, (actFocusSec / actDurSec) * 100).toFixed(1) : 0;
    html += '<div class="mt-focus-progress">';
    html += '<div class="mt-focus-bar"><div class="mt-focus-fill" style="width:' + actFPct + '%;background:' + color + '"></div></div>';
    html += '<span class="mt-focus-text">🎯 ' + _formatFocusTime(actFocusSec) + ' (' + actFPct + '%)</span>';
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';

  html += '<div class="mt-label" data-t="' + displayTime(act.end) + '"></div>';
  return html;
}

/* ─── LiveTimer registration ─── */

function _mtRegisterTimers() {
  var isToday = _mtIsToday();
  if (!isToday) return;

  // 1. Active nodes — pill/line fill + countdown timer badge
  var nodes = document.querySelectorAll('.mt-timeline .mt-node.mt-active');
  for (var i = 0; i < nodes.length; i++) {
    (function (node) {
      var sMin = parseInt(node.dataset.segS, 10);
      var eMin = parseInt(node.dataset.segE, 10);
      var timerEl = node.querySelector('.mt-timer');
      var fillEl = node.querySelector('.mt-pill-fill') || node.querySelector('.mt-line-fill');

      LiveTimer.progress(fillEl, null, null, function (nowSec) {
        var fs = sMin * 60, fe = eMin * 60;
        var gone = Math.max(0, Math.min(nowSec - fs, fe - fs));
        var left = Math.max(0, fe - nowSec);
        var pct = (fe - fs) > 0 ? ((gone / (fe - fs)) * 100).toFixed(1) : 0;

        if (fillEl) fillEl.style.height = pct + '%';
        if (timerEl) timerEl.textContent = LiveTimer.format(left);

        if (nowSec >= fe) {
          node.classList.remove('mt-active');
          node.classList.add('mt-done');
          if (timerEl) timerEl.style.display = 'none';
          if (fillEl) fillEl.style.height = '100%';
        }
        return { gone: gone, left: left };
      });
    })(nodes[i]);
  }

  // 2. Period progress — fill lives inside the header, labels in the sibling .mt-period-progress
  var headers = document.querySelectorAll('.mt-timeline .mt-period-header[data-seg-start]');
  for (var j = 0; j < headers.length; j++) {
    (function (hdrEl) {
      var sS = parseInt(hdrEl.dataset.segStart, 10);
      var sE = parseInt(hdrEl.dataset.segEnd, 10);
      var labelsEl = hdrEl.parentElement.querySelector('.mt-period-progress');
      LiveTimer.progress(
        hdrEl.querySelector('.wp-fill'),
        labelsEl ? labelsEl.querySelector('.wp-gone b') : null,
        labelsEl ? labelsEl.querySelector('.wp-left b') : null,
        function (nowSec) { return computePeriodProgress(nowSec, sS, sE); }
      );
    })(headers[j]);
  }
}

window._mtRegisterTimers = _mtRegisterTimers;

/* ─── hooks ─── */

// Hook renderWorkBlocks to also render mobile timeline HTML
var _origRenderWorkBlocks = window.renderWorkBlocks;
if (_origRenderWorkBlocks) {
  window.renderWorkBlocks = function (segments, prayerMins) {
    _origRenderWorkBlocks(segments, prayerMins);
    renderMobileTimeline();
  };
}

// Hook registerTimers to also register mobile timeline timers
// This ensures mobile timers are registered AFTER LiveTimer.clear()
var _origRegisterTimers = window.registerTimers;
if (_origRegisterTimers) {
  window.registerTimers = function () {
    _origRegisterTimers();
    _mtRegisterTimers();
  };
}

