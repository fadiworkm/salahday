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

  var totalAvail = 0;
  var html = '<div class="mt-timeline">';

  segs.forEach(function (seg, idx) {
    var pKey = 'work:' + seg.start + '-' + seg.end;
    var isDis = disabledList.indexOf(pKey) !== -1;
    var pActs = acts.filter(function (a) { return a.start >= seg.start && a.end <= seg.end; })
                    .sort(function (a, b) { return a.start - b.start; });
    var used = pActs.reduce(function (s, a) { return s + (a.end - a.start); }, 0);
    var free = seg.duration - used;
    if (!isDis) totalAvail += free;

    var isCur = isToday && nowMin >= seg.start && nowMin < seg.end;

    if (idx > 0) html += '<div class="mt-period-sep"></div>';

    html += '<div class="mt-period' + (isDis ? ' mt-period-disabled' : '') +
            (isCur ? ' mt-period-current' : '') + '">';

    // header
    html += '<div class="mt-period-header">';
    html += '<span class="mt-period-time">' + displayTimeRange(seg.start, seg.end) + '</span>';
    html += '<span class="mt-period-dur">' + (isDis ? 'معطّلة' : formatDuration(free) + ' عمل') + '</span>';
    if (!isDis) html += '<button class="mt-edit-btn" onclick="openPlannerForPeriod(' + idx + ')">&#9998;</button>';
    html += '</div>';

    if (isDis) { html += '</div>'; return; }

    // progress bar (current period, today) — uses H:MM:SS from LiveTimer.format()
    if (isCur && free > 0) {
      var pResult = computePeriodProgress(nowSec, seg.start, seg.end);
      var pTotal = pResult.gone + pResult.left;
      var pPct = pTotal > 0 ? ((pResult.gone / pTotal) * 100).toFixed(1) : 0;

      html += '<div class="mt-period-progress" data-seg-start="' + seg.start + '" data-seg-end="' + seg.end + '">';
      html += '<div class="wp-bar"><div class="wp-fill" style="width:' + pPct + '%"></div></div>';
      html += '<div class="wp-labels">';
      html += '<div class="wp-gone"><span class="wp-dot wp-dot-gone"></span> انتهى <b>' + LiveTimer.format(pResult.gone) + '</b></div>';
      html += '<div class="wp-left"><span class="wp-dot wp-dot-left"></span> متبقي <b>' + LiveTimer.format(pResult.left) + '</b></div>';
      html += '</div></div>';
    }

    // track
    html += '<div class="mt-track">';
    var cursor = seg.start;
    var lastLabel = -1;

    pActs.forEach(function (act) {
      if (act.start > cursor) {
        html += _mtBuildFree(cursor, act.start, isToday, nowMin, lastLabel);
        lastLabel = act.start;
      }
      html += _mtBuildAct(act, isToday, nowMin, lastLabel);
      lastLabel = act.end;
      cursor = act.end;
    });

    if (cursor < seg.end) {
      html += _mtBuildFree(cursor, seg.end, isToday, nowMin, lastLabel);
      lastLabel = seg.end;
    }

    if (lastLabel !== seg.end) {
      html += '<div class="mt-label" data-t="' + displayTime(seg.end) + '"></div>';
    }

    html += '</div>'; // track
    html += '</div>'; // period
  });

  html += '<div class="mt-total">';
  html += '<span class="mt-total-label">وقت العمل المتاح:</span>';
  html += '<span class="mt-total-value">' + formatDuration(totalAvail) + '</span>';
  html += '</div>';
  html += '</div>';

  container.insertAdjacentHTML('beforeend', html);
  // Note: timers registered via _mtRegisterTimers() which is hooked into registerTimers()
}

window.renderMobileTimeline = renderMobileTimeline;

/* ─── node builders ─── */

function _mtBuildFree(start, end, isToday, nowMin, lastLabel) {
  var dur = end - start;
  var st = _mtState(start, end, isToday, nowMin);
  var h = _mtLineH(dur);
  var html = '';

  if (lastLabel !== start) {
    html += '<div class="mt-label" data-t="' + displayTime(start) + '"></div>';
  }

  html += '<div class="mt-node mt-node-free' + (st ? ' ' + st : '') + '"' +
          ' data-seg-s="' + start + '" data-seg-e="' + end + '">';
  html += '<div class="mt-rail"><div class="mt-line" style="height:' + h + 'px"><div class="mt-line-fill"></div></div></div>';
  html += '<div class="mt-body mt-body-free">';
  html += '<span class="mt-free-dur">' + formatDuration(dur) + '</span>';
  if (st === 'mt-active') html += '<span class="mt-timer"></span>';
  html += '</div>';
  html += '</div>';

  html += '<div class="mt-label" data-t="' + displayTime(end) + '"></div>';
  return html;
}

function _mtBuildAct(act, isToday, nowMin, lastLabel) {
  var dur = act.end - act.start;
  var st = _mtState(act.start, act.end, isToday, nowMin);
  var h = _mtPillH(dur);
  var color = act.color || '#3498db';
  var html = '';

  if (lastLabel !== act.start) {
    html += '<div class="mt-label" data-t="' + displayTime(act.start) + '"></div>';
  }

  html += '<div class="mt-node mt-node-act' + (st ? ' ' + st : '') + '"' +
          ' data-seg-s="' + act.start + '" data-seg-e="' + act.end + '"' +
          ' style="--node-color:' + color + '">';
  html += '<div class="mt-rail"><div class="mt-pill" style="height:' + h + 'px"><div class="mt-pill-fill"></div></div></div>';
  html += '<div class="mt-body">';
  html += '<div class="mt-icon" style="background:' + color + '">' + (act.icon || '') + '</div>';
  html += '<div class="mt-info">';
  html += '<div class="mt-timerange">' + displayTime(act.start) + ' - ' + displayTime(act.end) + '</div>';
  html += '<div class="mt-name">' + (act.name || '') + '</div>';
  html += '<div class="mt-dur">' + formatDuration(dur) + '</div>';
  html += '</div>';
  if (st === 'mt-active') html += '<span class="mt-timer"></span>';
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

  // 2. Period progress bars — H:MM:SS labels via LiveTimer.progress()
  var bars = document.querySelectorAll('.mt-timeline .mt-period-progress[data-seg-start]');
  for (var j = 0; j < bars.length; j++) {
    (function (ppEl) {
      var sS = parseInt(ppEl.dataset.segStart, 10);
      var sE = parseInt(ppEl.dataset.segEnd, 10);
      LiveTimer.progress(
        ppEl.querySelector('.wp-fill'),
        ppEl.querySelector('.wp-gone b'),
        ppEl.querySelector('.wp-left b'),
        function (nowSec) { return computePeriodProgress(nowSec, sS, sE); }
      );
    })(bars[j]);
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
