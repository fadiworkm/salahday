/**
 * جدول اليوم - أوقات الصلاة وفترات العمل
 * يعمل بشكل مستقل عن data.js و app.js
 */

// ─── بيانات الصلاة ───
let prayerData = [];

// ─── الإعدادات ───
let scheduleSettings = {
  buffers: {
    fajr:    { before: 90, after: 30 },
    sunrise: { before: 0,  after: 20 },
    dhuhr:   { before: 15, after: 20 },
    asr:     { before: 15, after: 15 },
    maghrib: { before: 10, after: 20 },
    isha:    { before: 10, after: 20 }
  },
  bedtimeAfterIsha: 120,
  timeFormat: '24'
};

// ─── التهيئة ───
document.addEventListener('DOMContentLoaded', async () => {
  generateStars();
  loadSettings();
  await loadPrayerData();
  initDateInput();
  attachEvents();
  renderDay();
  startCountdownTimer();
});

// ─── تحميل بيانات الصلاة ───
async function loadPrayerData() {
  // أولاً: محاولة التحميل من المتغير العام (لدعم file://)
  if (typeof PRAY_TIMES_RAW !== 'undefined') {
    prayerData = PRAY_TIMES_RAW;
    return;
  }
  // ثانياً: محاولة التحميل عبر fetch
  try {
    const response = await fetch('js/pray-times.json');
    prayerData = await response.json();
  } catch (e) {
    console.error('فشل تحميل بيانات الصلاة:', e);
    prayerData = [];
  }
}

// ─── تحليل الوقت العربي ───
function parseArabicTime(timeStr) {
  const parts = timeStr.trim().split(/\s+/);
  const timePart = parts[0];
  const period = parts[1];
  const [hStr, mStr] = timePart.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  if (period === 'ص') {
    if (h === 12) h = 0;
  } else if (period === 'م') {
    if (h !== 12) h += 12;
  }

  return h * 60 + m;
}

// ─── دوال مساعدة للوقت ───

function minutesToTimeStr(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function displayTime(mins) {
  const totalMins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;

  if (scheduleSettings.timeFormat === '12') {
    const period = h >= 12 ? 'م' : 'ص';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** عرض نطاق زمني بتنسيق RTL: البداية على اليمين */
function displayTimeRange(startMins, endMins) {
  return `\u200F${displayTime(startMins)}\u200F - \u200F${displayTime(endMins)}\u200F`;
}

function formatDuration(totalMinutes) {
  if (totalMinutes <= 0) return '0 دقيقة';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hours === 0) return `${mins} دقيقة`;

  let hourText;
  if (hours === 1) hourText = 'ساعة';
  else if (hours === 2) hourText = 'ساعتان';
  else if (hours >= 3 && hours <= 10) hourText = `${hours} ساعات`;
  else hourText = `${hours} ساعة`;

  if (mins === 0) return hourText;
  return `${hourText} و ${mins} دقيقة`;
}

// ─── البحث في بيانات الصلاة ───

function getDayData(dateStr) {
  const formatted = dateStr.replace(/-/g, '/');
  return prayerData.find(d => d['تاريخ_ميلادي'] === formatted) || null;
}

function getClosestDate(dateStr) {
  if (prayerData.length === 0) return null;

  const target = new Date(dateStr + 'T12:00:00').getTime();
  let closest = prayerData[0];
  let closestDiff = Infinity;

  for (const entry of prayerData) {
    const entryDate = new Date(entry['تاريخ_ميلادي'].replace(/\//g, '-') + 'T12:00:00').getTime();
    const diff = Math.abs(entryDate - target);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = entry;
    }
  }

  return closest;
}

function extractPrayerMinutes(dayData) {
  return {
    fajr:    parseArabicTime(dayData['الفجر']),
    sunrise: parseArabicTime(dayData['الشروق']),
    dhuhr:   parseArabicTime(dayData['الظهر']),
    asr:     parseArabicTime(dayData['العصر']),
    maghrib: parseArabicTime(dayData['المغرب']),
    isha:    parseArabicTime(dayData['العشاء'])
  };
}

// ─── توليد الجدول اليومي ───

const PRAYER_NAMES = {
  fajr:    'صلاة الفجر',
  sunrise: 'الشروق',
  dhuhr:   'صلاة الظهر',
  asr:     'صلاة العصر',
  maghrib: 'صلاة المغرب',
  isha:    'صلاة العشاء'
};

const PREP_NAMES = {
  fajr:    'تحضير للفجر',
  dhuhr:   'تحضير للظهر',
  asr:     'تحضير للعصر',
  maghrib: 'تحضير للمغرب',
  isha:    'تحضير للعشاء'
};

function getSavedBedtime() {
  try {
    const raw = localStorage.getItem('workPlannerData');
    if (!raw) return null;
    const all = JSON.parse(raw);
    const dateStr = document.getElementById('schedule-date').value;
    const dayPlan = all[dateStr];
    if (dayPlan && dayPlan.manualBedtime != null) return dayPlan.manualBedtime;
  } catch (e) {}
  return null;
}

function saveManualBedtime(bedtimeMin) {
  try {
    const raw = localStorage.getItem('workPlannerData');
    const all = raw ? JSON.parse(raw) : {};
    const dateStr = document.getElementById('schedule-date').value;
    if (!all[dateStr]) all[dateStr] = { activities: [], disabledPeriods: [] };
    if (Array.isArray(all[dateStr])) all[dateStr] = { activities: all[dateStr], disabledPeriods: [] };
    all[dateStr].manualBedtime = bedtimeMin;
    localStorage.setItem('workPlannerData', JSON.stringify(all));
  } catch (e) {}
}

function clearSavedBedtime() {
  try {
    const raw = localStorage.getItem('workPlannerData');
    if (!raw) return;
    const all = JSON.parse(raw);
    const dateStr = document.getElementById('schedule-date').value;
    if (all[dateStr]) {
      delete all[dateStr].manualBedtime;
      localStorage.setItem('workPlannerData', JSON.stringify(all));
    }
  } catch (e) {}
}

function getManualBedtime(prayerMins) {
  const input = document.getElementById('manual-bedtime');
  if (input && input.dataset.manual === '1') {
    const parts = input.value.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }
  const saved = getSavedBedtime();
  if (saved != null) return saved;
  return prayerMins.isha + scheduleSettings.bedtimeAfterIsha;
}

function generateDaySegments(prayerMins) {
  const buf = scheduleSettings.buffers;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const bedtimeMin = getManualBedtime(prayerMins);

  const occupiedRanges = [];

  // الفجر
  if (buf.fajr.before > 0) {
    occupiedRanges.push({ type: 'prep', label: PREP_NAMES.fajr, prayerKey: 'fajr', start: prayerMins.fajr - buf.fajr.before, end: prayerMins.fajr });
  }
  occupiedRanges.push({ type: 'prayer', label: PRAYER_NAMES.fajr, prayerKey: 'fajr', start: prayerMins.fajr, end: prayerMins.fajr + buf.fajr.after });

  // الشروق: لا يقسم الجدول - يضاف كتلميح فقط

  // الظهر
  if (buf.dhuhr.before > 0) {
    occupiedRanges.push({ type: 'prep', label: PREP_NAMES.dhuhr, prayerKey: 'dhuhr', start: prayerMins.dhuhr - buf.dhuhr.before, end: prayerMins.dhuhr });
  }
  occupiedRanges.push({ type: 'prayer', label: PRAYER_NAMES.dhuhr, prayerKey: 'dhuhr', start: prayerMins.dhuhr, end: prayerMins.dhuhr + buf.dhuhr.after });

  // العصر
  if (buf.asr.before > 0) {
    occupiedRanges.push({ type: 'prep', label: PREP_NAMES.asr, prayerKey: 'asr', start: prayerMins.asr - buf.asr.before, end: prayerMins.asr });
  }
  occupiedRanges.push({ type: 'prayer', label: PRAYER_NAMES.asr, prayerKey: 'asr', start: prayerMins.asr, end: prayerMins.asr + buf.asr.after });

  // المغرب
  if (buf.maghrib.before > 0) {
    occupiedRanges.push({ type: 'prep', label: PREP_NAMES.maghrib, prayerKey: 'maghrib', start: prayerMins.maghrib - buf.maghrib.before, end: prayerMins.maghrib });
  }
  occupiedRanges.push({ type: 'prayer', label: PRAYER_NAMES.maghrib, prayerKey: 'maghrib', start: prayerMins.maghrib, end: prayerMins.maghrib + buf.maghrib.after });

  // العشاء
  if (buf.isha.before > 0) {
    occupiedRanges.push({ type: 'prep', label: PREP_NAMES.isha, prayerKey: 'isha', start: prayerMins.isha - buf.isha.before, end: prayerMins.isha });
  }
  occupiedRanges.push({ type: 'prayer', label: PRAYER_NAMES.isha, prayerKey: 'isha', start: prayerMins.isha, end: prayerMins.isha + buf.isha.after });

  // وقت النوم — يحدد نهاية فترة العمل وبداية النوم
  const bedEnd = Math.min(bedtimeMin, 1440);

  // ترتيب ودمج
  occupiedRanges.sort((a, b) => a.start - b.start);

  const merged = [];
  for (const range of occupiedRanges) {
    if (merged.length > 0) {
      const last = merged[merged.length - 1];
      if (range.start <= last.end && range.prayerKey === last.prayerKey && range.type === last.type) {
        last.end = Math.max(last.end, range.end);
        continue;
      }
      if (range.start < last.end) {
        last.end = range.start;
      }
    }
    if (range.end > range.start) merged.push({ ...range });
  }

  // بناء الجدول الكامل
  const segments = [];

  const firstOccupied = merged[0];
  if (firstOccupied && firstOccupied.start > 0) {
    segments.push({ type: 'sleep', label: 'نوم', prayerKey: 'sleep', start: 0, end: firstOccupied.start, duration: firstOccupied.start, isCurrent: currentMinutes >= 0 && currentMinutes < firstOccupied.start });
  }

  for (let i = 0; i < merged.length; i++) {
    const range = merged[i];
    const segStart = Math.max(range.start, 0);
    const segEnd = Math.min(range.end, 1440);
    if (segEnd > segStart) {
      segments.push({ type: range.type, label: range.label, prayerKey: range.prayerKey, start: segStart, end: segEnd, duration: segEnd - segStart, isCurrent: currentMinutes >= segStart && currentMinutes < segEnd });
    }

    const nextRange = merged[i + 1];
    if (nextRange) {
      const gapStart = range.end;
      const gapEnd = nextRange.start;
      if (gapEnd > gapStart) {
        // تقسيم الفجوة عند وقت النوم
        if (gapStart < bedEnd && gapEnd > bedEnd) {
          segments.push({ type: 'work', label: 'وقت عمل', prayerKey: 'work', start: gapStart, end: bedEnd, duration: bedEnd - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < bedEnd });
          segments.push({ type: 'sleep', label: 'نوم', prayerKey: 'sleep', start: bedEnd, end: gapEnd, duration: gapEnd - bedEnd, isCurrent: currentMinutes >= bedEnd && currentMinutes < gapEnd });
        } else {
          const isAfterBedtime = gapStart >= bedEnd;
          segments.push({ type: isAfterBedtime ? 'sleep' : 'work', label: isAfterBedtime ? 'نوم' : 'وقت عمل', prayerKey: isAfterBedtime ? 'sleep' : 'work', start: gapStart, end: gapEnd, duration: gapEnd - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < gapEnd });
        }
      }
    }
  }

  const lastOccupied = merged[merged.length - 1];
  if (lastOccupied && lastOccupied.end < 1440) {
    const gapStart = lastOccupied.end;
    // تقسيم عند وقت النوم
    if (gapStart < bedEnd && bedEnd < 1440) {
      segments.push({ type: 'work', label: 'وقت عمل', prayerKey: 'work', start: gapStart, end: bedEnd, duration: bedEnd - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < bedEnd });
      segments.push({ type: 'sleep', label: 'نوم', prayerKey: 'sleep', start: bedEnd, end: 1440, duration: 1440 - bedEnd, isCurrent: currentMinutes >= bedEnd && currentMinutes < 1440 });
    } else {
      const isSleep = gapStart >= bedEnd;
      segments.push({ type: isSleep ? 'sleep' : 'work', label: isSleep ? 'نوم' : 'وقت عمل', prayerKey: isSleep ? 'sleep' : 'work', start: gapStart, end: 1440, duration: 1440 - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < 1440 });
    }
  }

  return segments;
}

// ─── العرض ───

const PRAYER_COLORS = {
  fajr: '#ff8c42', sunrise: '#ffa366', dhuhr: '#f4c430',
  asr: '#4a6cf7', maghrib: '#ff6b6b', isha: '#7c6aef',
  work: '#4ecdc4', sleep: '#3a3f6b', bedtime: '#5a4f9e'
};

function renderPrayerGrid(dayData, prayerMins) {
  const container = document.getElementById('prayer-live');
  if (!container) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = document.getElementById('schedule-date').value === now.toISOString().split('T')[0];

  const prayers = [
    { key: 'fajr',    name: 'الفجر',  mins: prayerMins.fajr },
    { key: 'sunrise', name: 'الشروق', mins: prayerMins.sunrise },
    { key: 'dhuhr',   name: 'الظهر',  mins: prayerMins.dhuhr },
    { key: 'asr',     name: 'العصر',  mins: prayerMins.asr },
    { key: 'maghrib', name: 'المغرب', mins: prayerMins.maghrib },
    { key: 'isha',    name: 'العشاء', mins: prayerMins.isha }
  ];

  let prevIdx = -1, nextIdx = -1;
  if (isToday) {
    for (let i = prayers.length - 1; i >= 0; i--) {
      if (prayers[i].mins <= nowMin) { prevIdx = i; break; }
    }
    for (let i = 0; i < prayers.length; i++) {
      if (prayers[i].mins > nowMin) { nextIdx = i; break; }
    }
  }

  let html = '';

  if (!isToday) {
    // لغير اليوم: عرض بسيط للأوقات
    html += '<div class="pl-simple-times">';
    prayers.forEach(p => {
      html += `<span class="pl-st">${p.name} <b>${displayTime(p.mins)}</b></span>`;
    });
    html += '</div>';
    container.innerHTML = html;
    return;
  }

  // ─── الدائرة ───
  if (nextIdx >= 0 && prevIdx >= 0) {
    const prevMin = prayers[prevIdx].mins;
    const nextMin = prayers[nextIdx].mins;
    const totalBetween = nextMin - prevMin;
    const elapsed = nowMin - prevMin;
    const remaining = nextMin - nowMin;
    const pct = totalBetween > 0 ? (elapsed / totalBetween) * 100 : 0;
    const conicAngle = (pct / 100) * 360;

    html += `<div class="pp-pie-section" id="pp-countdown" data-prev="${prevMin}" data-target="${nextMin}">`;
    html += `<div class="pp-pie-chart" style="background: conic-gradient(var(--gold) 0deg, var(--gold) ${conicAngle}deg, rgba(78,205,196,0.2) ${conicAngle}deg, rgba(78,205,196,0.2) 360deg)">`;
    html += `<div class="pp-pie-inner"></div>`;
    html += `</div>`;
    html += `<div class="pp-pie-info">`;
    html += `<div class="pp-pie-row pp-pie-next"><span class="pp-pie-label">${prayers[nextIdx].name}</span><span class="pp-pie-value" id="pp-cd-remaining">بعد ${formatDuration(remaining)}</span></div>`;
    html += `<div class="pp-pie-row pp-pie-prev"><span class="pp-pie-label">${prayers[prevIdx].name}</span><span class="pp-pie-value" id="pp-cd-elapsed">منذ ${formatDuration(elapsed)}</span></div>`;
    html += `</div></div>`;
  } else if (prevIdx === prayers.length - 1) {
    html += `<div class="pp-countdown pp-cd-done"><span class="pp-cd-label">&#10003; انتهت صلوات اليوم</span></div>`;
  }

  // ─── الشريط الخطي ───
  const first = prayers[0].mins;
  const last = prayers[prayers.length - 1].mins;
  const totalSpan = last - first;
  const progressPct = totalSpan > 0 ? Math.min(100, Math.max(0, ((nowMin - first) / totalSpan) * 100)) : 0;

  html += '<div class="prayer-progress-wrap">';
  html += '<button class="pp-refresh" onclick="renderDay()" title="تحديث">&#8635;</button>';
  html += '<div class="prayer-progress-outer">';
  html += '<div class="prayer-progress-bar">';
  html += `<div class="pp-fill" style="width:${progressPct}%"></div>`;
  html += `<div class="pp-now" style="right:${progressPct}%"></div>`;

  // نقاط الصلوات
  prayers.forEach((p, i) => {
    const pPct = totalSpan > 0 ? ((p.mins - first) / totalSpan) * 100 : 0;
    const passed = p.mins <= nowMin;
    const isNext = i === nextIdx;
    const dotCls = isNext ? 'pp-dot-next' : passed ? 'pp-dot-done' : 'pp-dot-future';
    html += `<div class="pp-point ${dotCls}" style="right:${pPct}%">`;
    html += `<div class="pp-point-dot"></div>`;
    html += `<div class="pp-point-label">`;
    html += `<span class="pp-point-name">${p.name}</span>`;
    html += `<span class="pp-point-time">${displayTime(p.mins)}</span>`;
    html += `</div></div>`;
  });

  html += '</div></div></div>';

  container.innerHTML = html;
}

// ─── المخمس (Pentagon) ───

function renderPentagon(prayerMins) {
  const container = document.getElementById('pentagon-wrap');
  const buf = scheduleSettings.buffers;
  const size = 400;
  const cx = size / 2, cy = size / 2, r = 140;

  const prayerKeys = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const prayerLabels = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];

  const vertices = prayerKeys.map((_, i) => {
    const angle = (-90 + i * 72) * Math.PI / 180;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  // حساب المدة والتقسيم لكل ضلع
  const edges = prayerKeys.map((key, i) => {
    const nextI = (i + 1) % 5;
    const nextKey = prayerKeys[nextI];
    const startMin = prayerMins[key];
    let endMin = prayerMins[nextKey];
    if (endMin <= startMin) endMin += 1440;
    const total = endMin - startMin;
    const afterBuf = buf[key] ? buf[key].after : 0;
    const beforeBuf = buf[nextKey] ? buf[nextKey].before : 0;
    const workTime = Math.max(0, total - afterBuf - beforeBuf);
    return { total, afterBuf, beforeBuf, workTime };
  });

  let svg = `<svg viewBox="0 0 ${size} ${size}" class="pentagon-svg">`;
  svg += `<polygon points="${vertices.map(v => `${v.x},${v.y}`).join(' ')}" class="pent-outline"/>`;

  // نقطة على الضلع بنسبة t (0..1)
  function lerp(v1, v2, t) {
    return { x: v1.x + (v2.x - v1.x) * t, y: v1.y + (v2.y - v1.y) * t };
  }

  // رسم الأضلاع مقسمة: بعد الصلاة | عمل | تحضير
  for (let i = 0; i < 5; i++) {
    const nextI = (i + 1) % 5;
    const v1 = vertices[i], v2 = vertices[nextI];
    const e = edges[i];
    const colorStart = PRAYER_COLORS[prayerKeys[i]];
    const colorEnd = PRAYER_COLORS[prayerKeys[nextI]];
    const colorWork = PRAYER_COLORS.work;

    if (e.total <= 0) continue;

    const t1 = e.afterBuf / e.total;
    const t2 = (e.afterBuf + e.workTime) / e.total;

    const pA = v1;
    const pB = lerp(v1, v2, t1);
    const pC = lerp(v1, v2, t2);
    const pD = v2;

    // بعد الصلاة (buffer after)
    if (e.afterBuf > 0) {
      svg += `<line x1="${pA.x}" y1="${pA.y}" x2="${pB.x}" y2="${pB.y}" stroke="${colorStart}" stroke-width="6" stroke-opacity="0.4" stroke-linecap="round"/>`;
    }
    // وقت العمل
    if (e.workTime > 0) {
      svg += `<line x1="${pB.x}" y1="${pB.y}" x2="${pC.x}" y2="${pC.y}" stroke="${colorWork}" stroke-width="5" stroke-opacity="0.7" stroke-linecap="round"/>`;
    }
    // تحضير للصلاة التالية (buffer before)
    if (e.beforeBuf > 0) {
      svg += `<line x1="${pC.x}" y1="${pC.y}" x2="${pD.x}" y2="${pD.y}" stroke="${colorEnd}" stroke-width="6" stroke-opacity="0.4" stroke-linecap="round"/>`;
    }

    // تسميات المدة على المنتصف
    const mx = (v1.x + v2.x) / 2;
    const my = (v1.y + v2.y) / 2;
    const angle = Math.atan2(my - cy, mx - cx);
    const lx = mx + 20 * Math.cos(angle);
    const ly = my + 20 * Math.sin(angle);

    // عرض وقت العمل المتاح فقط
    if (e.workTime > 0) {
      svg += `<text x="${lx}" y="${ly}" class="pent-duration pent-work-dur" text-anchor="middle" dominant-baseline="middle">${formatDuration(e.workTime)}</text>`;
    }
  }

  // رسم الرؤوس
  for (let i = 0; i < 5; i++) {
    const v = vertices[i];
    const key = prayerKeys[i];
    const color = PRAYER_COLORS[key];
    const timeStr = displayTime(prayerMins[key]);
    const afterMin = buf[key] ? buf[key].after : 0;
    const beforeMin = buf[key] ? buf[key].before : 0;

    svg += `<circle cx="${v.x}" cy="${v.y}" r="8" fill="${color}" class="pent-dot"/>`;
    svg += `<circle cx="${v.x}" cy="${v.y}" r="12" fill="none" stroke="${color}" stroke-width="2" stroke-opacity="0.3"/>`;

    const angle = (-90 + i * 72) * Math.PI / 180;
    const textR = r + 38;
    const tx = cx + textR * Math.cos(angle);
    const ty = cy + textR * Math.sin(angle);

    svg += `<text x="${tx}" y="${ty - 14}" class="pent-prayer-name" fill="${color}" text-anchor="middle" dominant-baseline="middle">${prayerLabels[i]}</text>`;
    svg += `<text x="${tx}" y="${ty + 2}" class="pent-prayer-time" text-anchor="middle" dominant-baseline="middle">${timeStr}</text>`;
    svg += `<text x="${tx}" y="${ty + 16}" class="pent-buffer-info" text-anchor="middle" dominant-baseline="middle">${beforeMin > 0 ? beforeMin + ' ق' : ''} | ${afterMin > 0 ? afterMin + ' ب' : ''}</text>`;
  }

  // وقت النوم في المركز
  const bedtime = getManualBedtime(prayerMins);
  svg += `<text x="${cx}" y="${cy - 10}" class="pent-center-label" text-anchor="middle" dominant-baseline="middle">وقت النوم</text>`;
  svg += `<text x="${cx}" y="${cy + 14}" class="pent-center-time" text-anchor="middle" dominant-baseline="middle">${displayTime(bedtime)}</text>`;

  svg += '</svg>';
  container.innerHTML = svg;
}

function renderDayStats(segments) {
  const container = document.getElementById('day-stats');
  if (!container) return;

  const TOTAL_DAY = 1440;

  // تحميل أنشطة المخطط المحفوظة
  let planActivities = [];
  try {
    const raw = localStorage.getItem('workPlannerData');
    if (raw) {
      const all = JSON.parse(raw);
      const dateStr = document.getElementById('schedule-date').value;
      let savedPlan = all[dateStr] || null;
      if (Array.isArray(savedPlan)) savedPlan = { activities: savedPlan, disabledPeriods: [] };
      if (savedPlan) planActivities = savedPlan.activities || [];
    }
  } catch (e) {}

  // حساب الأوقات حسب النوع
  const typeTotals = { sleep: 0, prayer: 0, prep: 0, work: 0 };
  for (const seg of segments) {
    if (typeTotals.hasOwnProperty(seg.type)) {
      typeTotals[seg.type] += seg.duration;
    }
  }

  // تجميع أنشطة المخطط حسب الاسم (نشاط "عمل" يُحسب كعمل)
  const activityMap = {};
  let totalActivityTime = 0;
  let activityWorkTime = 0;
  for (const act of planActivities) {
    const dur = act.end - act.start;
    if (act.name === 'عمل') {
      activityWorkTime += dur;
    } else {
      if (!activityMap[act.name]) {
        activityMap[act.name] = { name: act.name, icon: act.icon, color: act.color, duration: 0 };
      }
      activityMap[act.name].duration += dur;
    }
    totalActivityTime += dur;
  }

  // تحديد أنشطة تقع في فترات العمل
  let workActivityTime = 0;
  const workSegs = segments.filter(s => s.type === 'work');
  for (const act of planActivities) {
    for (const wSeg of workSegs) {
      if (act.start >= wSeg.start && act.end <= wSeg.end) {
        workActivityTime += (act.end - act.start);
      }
    }
  }

  // بناء الفئات
  const categories = [];

  if (typeTotals.sleep > 0) {
    categories.push({ name: 'نوم', icon: '☾', color: '#3a3f6b', duration: typeTotals.sleep });
  }
  const prayerTotal = (typeTotals.prayer || 0) + (typeTotals.prep || 0);
  if (prayerTotal > 0) {
    categories.push({ name: 'صلاة وتحضير', icon: '❤️', color: '#7c6aef', duration: prayerTotal, itemClass: 'ds-item-prayer' });
  }

  const remainingWork = Math.max(0, typeTotals.work - workActivityTime) + activityWorkTime;
  if (remainingWork > 0) {
    categories.push({ name: 'عمل', icon: '💼', color: '#4ecdc4', duration: remainingWork, itemClass: 'ds-item-work' });
  }

  // إضافة أنشطة المخطط
  for (const key of Object.keys(activityMap)) {
    const act = activityMap[key];
    if (act.duration > 0) {
      categories.push({ name: act.name, icon: act.icon, color: act.color, duration: act.duration });
    }
  }

  // ترتيب حسب المدة تنازلياً
  categories.sort((a, b) => b.duration - a.duration);

  // بناء HTML
  let html = '<div class="day-stats-grid">';
  for (const cat of categories) {
    const pct = ((cat.duration / TOTAL_DAY) * 100).toFixed(1);
    html += `
      <div class="ds-item ${cat.itemClass || ''}">
        <div class="ds-bar" style="width: ${pct}%; background: ${cat.color}"></div>
        <div class="ds-info">
          <span class="ds-icon">${cat.icon}</span>
          <span class="ds-name">${cat.name}</span>
          <span class="ds-time">${formatDuration(cat.duration)}</span>
          <span class="ds-pct">${pct}%</span>
        </div>
      </div>`;
  }
  html += '</div>';

  container.innerHTML = html;
}

/** تحديد الصلاتين اللتين تقع فترة العمل بينهما */
function getWorkBetweenPrayers(seg, prayerMins) {
  const prayerOrder = [
    { key: 'fajr',    name: 'الفجر' },
    { key: 'sunrise', name: 'الشروق' },
    { key: 'dhuhr',   name: 'الظهر' },
    { key: 'asr',     name: 'العصر' },
    { key: 'maghrib', name: 'المغرب' },
    { key: 'isha',    name: 'العشاء' }
  ];

  let before = null, after = null;
  for (const p of prayerOrder) {
    if (prayerMins[p.key] <= seg.start) before = p.name;
    if (!after && prayerMins[p.key] >= seg.end) after = p.name;
  }

  if (before && after) return `من ${before} إلى ${after}`;
  if (before) return `بعد ${before}`;
  if (after) return `قبل ${after}`;
  return '';
}

function renderWorkBlocks(segments, prayerMins) {
  const container = document.getElementById('work-blocks');
  const workSegments = segments.filter(s => s.type === 'work');
  const allPeriods = [...workSegments];

  window._workSegments = workSegments;

  if (allPeriods.length === 0) {
    container.innerHTML = '<p class="no-work-msg">لا توجد فترات عمل متاحة</p>';
    return;
  }

  // تحميل أنشطة المخطط المحفوظة
  let savedPlan = null;
  try {
    const raw = localStorage.getItem('workPlannerData');
    if (raw) {
      const all = JSON.parse(raw);
      const dateStr = document.getElementById('schedule-date').value;
      savedPlan = all[dateStr] || null;
      if (Array.isArray(savedPlan)) savedPlan = { activities: savedPlan, disabledPeriods: [] };
    }
  } catch (e) {}

  const planActivities = savedPlan ? savedPlan.activities || [] : [];
  const disabledPeriods = savedPlan ? savedPlan.disabledPeriods || [] : [];

  let html = '';
  let totalAvail = 0;

  allPeriods.forEach((seg, i) => {
    const pKey = 'work:' + seg.start + '-' + seg.end;
    const disabled = disabledPeriods.indexOf(pKey) !== -1;
    const currentClass = seg.isCurrent ? ' wt-block-current' : '';
    const disabledClass = disabled ? ' wt-block-unchecked' : '';

    const periodActs = planActivities.filter(a => a.start >= seg.start && a.end <= seg.end).sort((a, b) => a.start - b.start);
    const usedTime = periodActs.reduce((sum, a) => sum + (a.end - a.start), 0);
    const freeTime = seg.duration - usedTime;

    if (!disabled) totalAvail += freeTime;

    const periodName = prayerMins ? getWorkBetweenPrayers(seg, prayerMins) : '';
    const now2 = new Date();
    const nowMin2 = now2.getHours() * 60 + now2.getMinutes();
    const isToday2 = document.getElementById('schedule-date').value === now2.toISOString().split('T')[0];
    const isCurrent = isToday2 && nowMin2 >= seg.start && nowMin2 < seg.end;

    html += `<div class="wt-period${currentClass}${disabledClass}">`;

    // الرأس
    html += `<div class="wt-period-header">`;
    html += `<span class="wt-period-time">${displayTimeRange(seg.start, seg.end)}</span>`;
    html += `<span class="wt-period-free">${formatDuration(freeTime)} عمل</span>`;
    html += `</div>`;
    if (periodName) {
      html += `<div class="wt-period-name">${periodName}</div>`;
    }

    // شريط التقدم للفترة الحالية
    if (isCurrent && !disabled && freeTime > 0) {
      // حساب الوقت المنقضي والمتبقي لهذه الفترة فقط
      let pGone = 0, pLeft = 0;
      let cursor2 = seg.start;
      periodActs.forEach(act => {
        if (act.start > cursor2) {
          const fs = cursor2, fe = act.start;
          if (nowMin2 >= fe) pGone += fe - fs;
          else if (nowMin2 > fs) { pGone += nowMin2 - fs; pLeft += fe - nowMin2; }
          else pLeft += fe - fs;
        }
        cursor2 = act.end;
      });
      if (cursor2 < seg.end) {
        const fs = cursor2, fe = seg.end;
        if (nowMin2 >= fe) pGone += fe - fs;
        else if (nowMin2 > fs) { pGone += nowMin2 - fs; pLeft += fe - nowMin2; }
        else pLeft += fe - fs;
      }
      const pPct = freeTime > 0 ? ((pGone / freeTime) * 100).toFixed(1) : 0;

      html += `<div class="wt-period-progress">`;
      html += `<div class="wp-bar"><div class="wp-fill" style="width:${pPct}%"></div></div>`;
      html += `<div class="wp-labels">`;
      html += `<div class="wp-gone"><span class="wp-dot wp-dot-gone"></span> انتهى <b>${formatDuration(pGone)}</b></div>`;
      html += `<div class="wp-left"><span class="wp-dot wp-dot-left"></span> متبقي <b>${formatDuration(pLeft)}</b></div>`;
      html += `</div></div>`;
    }

    if (!disabled) {
      // الشريط المرئي مع الأنشطة
      if (periodActs.length > 0) {
        html += `<div class="wt-visual-bar">`;
        let cursor = seg.start;
        periodActs.forEach(act => {
          if (act.start > cursor) {
            const freeDur = act.start - cursor;
            html += `<div class="wt-vb-seg wt-vb-free" style="flex:${freeDur}">`;
            if (freeDur >= 15) html += `<span class="vb-dur">${formatDuration(freeDur)}</span>`;
            html += `<span class="vb-range">${displayTime(cursor)} - ${displayTime(act.start)}</span>`;
            html += `</div>`;
          }
          const actDur = act.end - act.start;
          html += `<div class="wt-vb-seg wt-vb-act" style="flex:${actDur}; background:${act.color}">`;
          html += `<span class="vb-dur">${act.icon}</span>`;
          html += `<span class="vb-range">${displayTime(act.start)} - ${displayTime(act.end)}</span>`;
          html += `</div>`;
          cursor = act.end;
        });
        if (cursor < seg.end) {
          const freeDur = seg.end - cursor;
          html += `<div class="wt-vb-seg wt-vb-free" style="flex:${freeDur}">`;
          if (freeDur >= 15) html += `<span class="vb-dur">${formatDuration(freeDur)}</span>`;
          html += `<span class="vb-range">${displayTime(cursor)} - ${displayTime(seg.end)}</span>`;
          html += `</div>`;
        }
        html += `</div>`;

        // شرائح الأنشطة
        html += `<div class="wt-act-chips">`;
        periodActs.forEach(act => {
          html += `<span class="wt-act-chip" style="background:${act.color}">${act.icon} ${act.name} (${formatDuration(act.end - act.start)})</span>`;
        });
        html += `</div>`;
      }
    } else {
      html += `<div class="wt-disabled-label">معطّلة</div>`;
    }

    html += `</div>`;
  });

  const totalAll = allPeriods.reduce((sum, s) => sum + s.duration, 0);

  // حساب وقت العمل المنقضي والمتبقي حسب الآن
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = document.getElementById('schedule-date').value === now.toISOString().split('T')[0];

  let workGone = 0, workLeft = 0;
  if (isToday) {
    allPeriods.forEach(seg => {
      const pKey = 'work:' + seg.start + '-' + seg.end;
      if (disabledPeriods.indexOf(pKey) !== -1) return;
      const pActs = planActivities.filter(a => a.start >= seg.start && a.end <= seg.end);
      const used = pActs.reduce((s, a) => s + (a.end - a.start), 0);
      // حساب الوقت الحر الفعلي لهذه الفترة
      let cursor = seg.start;
      pActs.sort((a, b) => a.start - b.start).forEach(act => {
        if (act.start > cursor) {
          const freeStart = cursor, freeEnd = act.start;
          if (nowMin >= freeEnd) workGone += freeEnd - freeStart;
          else if (nowMin > freeStart) { workGone += nowMin - freeStart; workLeft += freeEnd - nowMin; }
          else workLeft += freeEnd - freeStart;
        }
        cursor = act.end;
      });
      if (cursor < seg.end) {
        const freeStart = cursor, freeEnd = seg.end;
        if (nowMin >= freeEnd) workGone += freeEnd - freeStart;
        else if (nowMin > freeStart) { workGone += nowMin - freeStart; workLeft += freeEnd - nowMin; }
        else workLeft += freeEnd - freeStart;
      }
    });
  }

  const workProgressPct = totalAvail > 0 ? ((workGone / totalAvail) * 100).toFixed(1) : 0;

  // شريط تقدم العمل في أعلى الصفحة
  const topProgress = document.getElementById('work-progress-top');
  if (topProgress) {
    if (isToday && totalAvail > 0) {
      topProgress.innerHTML = `
      <div class="work-progress" id="work-progress">
        <div class="wp-bar">
          <div class="wp-fill" style="width:${workProgressPct}%"></div>
        </div>
        <div class="wp-labels">
          <div class="wp-gone"><span class="wp-dot wp-dot-gone"></span> انتهى <b id="wp-gone-val">${formatDuration(workGone)}</b></div>
          <div class="wp-left"><span class="wp-dot wp-dot-left"></span> متبقي <b id="wp-left-val">${formatDuration(workLeft)}</b></div>
        </div>
      </div>`;
    } else {
      topProgress.innerHTML = '';
    }
  }

  container.innerHTML = html + `
    <div class="work-total-bar">
      <span class="wtb-label">وقت العمل المتاح:</span>
      <span class="wtb-value">${formatDuration(totalAvail)}</span>
      <span class="wtb-sep">من</span>
      <span class="wtb-all">${formatDuration(totalAll)}</span>
    </div>`;
}

function updateWorkTotal() {
  const checkboxes = document.querySelectorAll('.wt-checkbox');
  let selected = 0;
  checkboxes.forEach(cb => {
    // تحديث مظهر البلوك
    const block = cb.closest('.wt-block');
    if (cb.checked) {
      selected += parseInt(cb.dataset.duration, 10);
      block.classList.remove('wt-block-unchecked');
    } else {
      block.classList.add('wt-block-unchecked');
    }
  });
  const el = document.getElementById('selected-work-total');
  if (el) el.textContent = formatDuration(selected);
}

// ─── العرض الرئيسي ───

function renderDay() {
  const dateInput = document.getElementById('schedule-date');
  const dateStr = dateInput.value;
  if (!dateStr) return;

  let dayData = getDayData(dateStr);
  let usedClosest = false;

  if (!dayData) {
    dayData = getClosestDate(dateStr);
    usedClosest = true;
  }

  if (!dayData) {
    document.getElementById('prayer-live').innerHTML = '<p class="no-data-msg">لا توجد بيانات متوفرة</p>';
    document.getElementById('pentagon-wrap').innerHTML = '';
    document.getElementById('day-stats').innerHTML = '';
    document.getElementById('work-blocks').innerHTML = '';
    document.getElementById('hijri-date').textContent = '';
    document.getElementById('day-name').textContent = '';
    return;
  }

  document.getElementById('hijri-date').textContent = dayData['تاريخ_هجري'] || '';
  document.getElementById('day-name').textContent = dayData['اليوم'] || '';

  if (usedClosest) {
    document.getElementById('hijri-date').textContent = `(أقرب تاريخ: ${dayData['تاريخ_ميلادي']}) ${dayData['تاريخ_هجري']}`;
  }

  const prayerMins = extractPrayerMinutes(dayData);

  // تعيين وقت النوم — من المحفوظ أو الافتراضي
  const bedtimeInput = document.getElementById('manual-bedtime');
  if (bedtimeInput && bedtimeInput.dataset.manual !== '1') {
    const saved = getSavedBedtime();
    if (saved != null) {
      bedtimeInput.value = minutesToTimeStr(saved);
      bedtimeInput.dataset.manual = '1';
    } else {
      const defaultBedtime = prayerMins.isha + scheduleSettings.bedtimeAfterIsha;
      bedtimeInput.value = minutesToTimeStr(defaultBedtime);
    }
  }

  const segments = generateDaySegments(prayerMins);

  // حفظ الشرائح للمخطط
  window._allSegments = segments;

  renderPrayerGrid(dayData, prayerMins);
  renderPentagon(prayerMins);
  renderDayStats(segments);
  renderWorkBlocks(segments, prayerMins);
}

// ─── التاريخ والتنقل ───

function initDateInput() {
  const dateInput = document.getElementById('schedule-date');
  dateInput.value = new Date().toISOString().split('T')[0];
}

function changeDate(delta) {
  const dateInput = document.getElementById('schedule-date');
  const current = new Date(dateInput.value + 'T12:00:00');
  current.setDate(current.getDate() + delta);
  dateInput.value = current.toISOString().split('T')[0];
  // إعادة تعيين وقت النوم للافتراضي عند تغيير اليوم
  const bedtimeInput = document.getElementById('manual-bedtime');
  if (bedtimeInput) bedtimeInput.dataset.manual = '';
  renderDay();
}

// ─── الأحداث ───

function attachEvents() {
  document.getElementById('schedule-date').addEventListener('change', () => {
    const bi = document.getElementById('manual-bedtime');
    if (bi) bi.dataset.manual = '';
    renderDay();
  });
  document.getElementById('prev-day').addEventListener('click', () => changeDate(-1));
  document.getElementById('next-day').addEventListener('click', () => changeDate(1));
  document.getElementById('today-btn').addEventListener('click', () => {
    document.getElementById('schedule-date').value = new Date().toISOString().split('T')[0];
    const bi = document.getElementById('manual-bedtime');
    if (bi) bi.dataset.manual = '';
    renderDay();
  });

  // وقت النوم اليدوي — حفظ عند التغيير
  document.getElementById('manual-bedtime').addEventListener('change', () => {
    const bi = document.getElementById('manual-bedtime');
    bi.dataset.manual = '1';
    const parts = bi.value.split(':').map(Number);
    saveManualBedtime(parts[0] * 60 + parts[1]);
    renderDay();
  });
  document.getElementById('reset-bedtime').addEventListener('click', () => {
    const bi = document.getElementById('manual-bedtime');
    bi.dataset.manual = '';
    clearSavedBedtime();
    renderDay();
  });

  // نسخ من يوم آخر
  document.getElementById('copy-day-btn').addEventListener('click', copyFromDay);

  document.getElementById('settings-toggle').addEventListener('click', openSettings);
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });

  document.querySelectorAll('#time-format-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#time-format-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scheduleSettings.timeFormat = btn.dataset.value;
    });
  });

}

// ─── الإعدادات ───

function loadSettings() {
  const saved = localStorage.getItem('scheduleSettings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      scheduleSettings = { ...scheduleSettings, ...parsed };
      if (parsed.buffers) {
        scheduleSettings.buffers = { ...scheduleSettings.buffers, ...parsed.buffers };
      }
    } catch (e) { /* تجاهل */ }
  }
  applySettingsToUI();
}

function applySettingsToUI() {
  const buf = scheduleSettings.buffers;

  setInputValue('buf-fajr-before', buf.fajr.before);
  setInputValue('buf-fajr-after', buf.fajr.after);
  setInputValue('buf-sunrise-after', buf.sunrise.after);
  setInputValue('buf-dhuhr-before', buf.dhuhr.before);
  setInputValue('buf-dhuhr-after', buf.dhuhr.after);
  setInputValue('buf-asr-before', buf.asr.before);
  setInputValue('buf-asr-after', buf.asr.after);
  setInputValue('buf-maghrib-before', buf.maghrib.before);
  setInputValue('buf-maghrib-after', buf.maghrib.after);
  setInputValue('buf-isha-before', buf.isha.before);
  setInputValue('buf-isha-after', buf.isha.after);
  setInputValue('bedtime-after-isha-schedule', scheduleSettings.bedtimeAfterIsha);

  document.querySelectorAll('#time-format-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === scheduleSettings.timeFormat);
  });
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getInputValue(id, defaultVal) {
  const el = document.getElementById(id);
  if (!el) return defaultVal;
  const val = parseInt(el.value, 10);
  return isNaN(val) ? defaultVal : val;
}

function saveSettings() {
  scheduleSettings.buffers = {
    fajr:    { before: getInputValue('buf-fajr-before', 90),    after: getInputValue('buf-fajr-after', 30) },
    sunrise: { before: 0,                                        after: getInputValue('buf-sunrise-after', 20) },
    dhuhr:   { before: getInputValue('buf-dhuhr-before', 15),    after: getInputValue('buf-dhuhr-after', 20) },
    asr:     { before: getInputValue('buf-asr-before', 15),      after: getInputValue('buf-asr-after', 15) },
    maghrib: { before: getInputValue('buf-maghrib-before', 10),  after: getInputValue('buf-maghrib-after', 20) },
    isha:    { before: getInputValue('buf-isha-before', 10),     after: getInputValue('buf-isha-after', 20) }
  };
  scheduleSettings.bedtimeAfterIsha = getInputValue('bedtime-after-isha-schedule', 120);
  localStorage.setItem('scheduleSettings', JSON.stringify(scheduleSettings));
}

function openSettings() {
  document.getElementById('settings-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSettings() {
  saveSettings();
  document.getElementById('settings-overlay').classList.remove('active');
  document.body.style.overflow = '';
  renderDay();
}

// ─── العد التنازلي في الوقت الحقيقي ───

let countdownInterval = null;

function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(function() {
    updateCountdown();
    updateWorkProgress();
  }, 30000);
}

function updateWorkProgress() {
  const wpEl = document.getElementById('work-progress');
  if (!wpEl) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const allSegments = window._allSegments || [];
  const workSegs = allSegments.filter(s => s.type === 'work');

  let savedPlan = null;
  try {
    const raw = localStorage.getItem('workPlannerData');
    if (raw) {
      const all = JSON.parse(raw);
      const dateStr = document.getElementById('schedule-date').value;
      savedPlan = all[dateStr];
      if (Array.isArray(savedPlan)) savedPlan = { activities: savedPlan, disabledPeriods: [] };
    }
  } catch (e) {}

  const planActs = savedPlan ? savedPlan.activities || [] : [];
  const disabled = savedPlan ? savedPlan.disabledPeriods || [] : [];

  let workGone = 0, workLeft = 0;
  workSegs.forEach(seg => {
    const pKey = 'work:' + seg.start + '-' + seg.end;
    if (disabled.indexOf(pKey) !== -1) return;
    const pActs = planActs.filter(a => a.start >= seg.start && a.end <= seg.end).sort((a, b) => a.start - b.start);
    let cursor = seg.start;
    pActs.forEach(act => {
      if (act.start > cursor) {
        const fs = cursor, fe = act.start;
        if (nowMin >= fe) workGone += fe - fs;
        else if (nowMin > fs) { workGone += nowMin - fs; workLeft += fe - nowMin; }
        else workLeft += fe - fs;
      }
      cursor = act.end;
    });
    if (cursor < seg.end) {
      const fs = cursor, fe = seg.end;
      if (nowMin >= fe) workGone += fe - fs;
      else if (nowMin > fs) { workGone += nowMin - fs; workLeft += fe - nowMin; }
      else workLeft += fe - fs;
    }
  });

  const total = workGone + workLeft;
  const pct = total > 0 ? ((workGone / total) * 100).toFixed(1) : 0;

  const fill = wpEl.querySelector('.wp-fill');
  const goneVal = document.getElementById('wp-gone-val');
  const leftVal = document.getElementById('wp-left-val');
  if (fill) fill.style.width = pct + '%';
  if (goneVal) goneVal.textContent = formatDuration(workGone);
  if (leftVal) leftVal.textContent = formatDuration(workLeft);
}

function updateCountdown() {
  const cdEl = document.getElementById('pp-countdown');
  if (!cdEl) return;

  const target = parseInt(cdEl.dataset.target, 10);
  const prev = parseInt(cdEl.dataset.prev, 10);
  if (isNaN(target)) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const remaining = target - nowMin;
  const elapsed = nowMin - prev;

  if (remaining <= 0) {
    renderDay();
    return;
  }

  // تحديث النصوص
  const remEl = document.getElementById('pp-cd-remaining');
  const elaEl = document.getElementById('pp-cd-elapsed');
  if (remEl) remEl.textContent = 'بعد ' + formatDuration(remaining);
  if (elaEl) elaEl.textContent = 'منذ ' + formatDuration(elapsed);

  // تحديث الدائرة
  const totalBetween = target - prev;
  const pct = totalBetween > 0 ? (elapsed / totalBetween) * 100 : 0;
  const angle = (pct / 100) * 360;
  const pieEl = cdEl.querySelector('.pp-pie-chart');
  if (pieEl) {
    pieEl.style.background = `conic-gradient(var(--gold) 0deg, var(--gold) ${angle}deg, rgba(78,205,196,0.2) ${angle}deg, rgba(78,205,196,0.2) 360deg)`;
  }
}

// ─── النجوم المتلألئة ───
function generateStars() {
  const container = document.getElementById('stars-container');
  const count = window.innerWidth < 600 ? 60 : 120;
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    star.style.width = star.style.height = (Math.random() * 2.5 + 0.5) + 'px';
    star.style.animationDelay = (Math.random() * 4) + 's';
    star.style.animationDuration = (Math.random() * 3 + 2) + 's';
    container.appendChild(star);
  }
}
