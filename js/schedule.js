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
  timeFormat: '12',
  pomoDuration: 45
};

// ─── التهيئة ───
document.addEventListener('DOMContentLoaded', async () => {
  generateStars();
  await ScheduleData.whenReady();
  await loadPrayerData();
  initDateInput();
  await loadDayFromServer();
  loadSettingsFromDay();
  attachEvents();
  renderDay();
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
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
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
  const dateStr = document.getElementById('schedule-date').value;
  const dayData = ScheduleData.getDay(dateStr);
  if (dayData && dayData.manualBedtime != null) return dayData.manualBedtime;
  return null;
}

function saveManualBedtime(bedtimeMin) {
  const dateStr = document.getElementById('schedule-date').value;
  const dayData = ScheduleData.getDayOrDefault(dateStr);
  dayData.manualBedtime = bedtimeMin;
  ScheduleData.saveDay(dateStr);
}

function clearSavedBedtime() {
  const dateStr = document.getElementById('schedule-date').value;
  const dayData = ScheduleData.getDay(dateStr);
  if (dayData) {
    delete dayData.manualBedtime;
    ScheduleData.saveDay(dateStr);
  }
}

async function loadDayFromServer() {
  const dateStr = document.getElementById('schedule-date').value;
  await ScheduleData.loadDay(dateStr);
}

function loadSettingsFromDay() {
  const dateStr = document.getElementById('schedule-date').value;
  const dayData = ScheduleData.getDay(dateStr);
  if (dayData && dayData.settings) {
    const parsed = dayData.settings;
    scheduleSettings = { ...scheduleSettings, ...parsed };
    if (parsed.buffers) {
      scheduleSettings.buffers = { ...scheduleSettings.buffers, ...parsed.buffers };
    }
  }
  applySettingsToUI();
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
          segments.push({ type: 'work', label: 'وقت متاح', prayerKey: 'work', start: gapStart, end: bedEnd, duration: bedEnd - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < bedEnd });
          segments.push({ type: 'sleep', label: 'نوم', prayerKey: 'sleep', start: bedEnd, end: gapEnd, duration: gapEnd - bedEnd, isCurrent: currentMinutes >= bedEnd && currentMinutes < gapEnd });
        } else {
          const isAfterBedtime = gapStart >= bedEnd;
          segments.push({ type: isAfterBedtime ? 'sleep' : 'work', label: isAfterBedtime ? 'نوم' : 'وقت متاح', prayerKey: isAfterBedtime ? 'sleep' : 'work', start: gapStart, end: gapEnd, duration: gapEnd - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < gapEnd });
        }
      }
    }
  }

  const lastOccupied = merged[merged.length - 1];
  if (lastOccupied && lastOccupied.end < 1440) {
    const gapStart = lastOccupied.end;
    // تقسيم عند وقت النوم
    if (gapStart < bedEnd && bedEnd < 1440) {
      segments.push({ type: 'work', label: 'وقت متاح', prayerKey: 'work', start: gapStart, end: bedEnd, duration: bedEnd - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < bedEnd });
      segments.push({ type: 'sleep', label: 'نوم', prayerKey: 'sleep', start: bedEnd, end: 1440, duration: 1440 - bedEnd, isCurrent: currentMinutes >= bedEnd && currentMinutes < 1440 });
    } else {
      const isSleep = gapStart >= bedEnd;
      segments.push({ type: isSleep ? 'sleep' : 'work', label: isSleep ? 'نوم' : 'وقت متاح', prayerKey: isSleep ? 'sleep' : 'work', start: gapStart, end: 1440, duration: 1440 - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < 1440 });
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
    const outAngle = Math.atan2(my - cy, mx - cx);
    const lx = mx + 20 * Math.cos(outAngle);
    const ly = my + 20 * Math.sin(outAngle);

    // زاوية الضلع لمحاذاة النص
    let edgeDeg = Math.atan2(v2.y - v1.y, v2.x - v1.x) * 180 / Math.PI;
    // keep text upright: flip if upside-down
    if (edgeDeg > 90) edgeDeg -= 180;
    if (edgeDeg < -90) edgeDeg += 180;

    // عرض وقت العمل المتاح فقط
    if (e.workTime > 0) {
      svg += `<text x="${lx}" y="${ly}" class="pent-duration pent-work-dur" text-anchor="middle" dominant-baseline="middle" transform="rotate(${edgeDeg}, ${lx}, ${ly})">${formatDuration(e.workTime)}</text>`;
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

function _formatFocusTime(sec) {
  if (sec < 60) return sec + ' ثانية';
  if (sec < 3600) return Math.floor(sec / 60) + ' دقيقة';
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  if (m === 0) return h + ' ساعة';
  return h + ' ساعة و ' + m + ' دقيقة';
}

function renderDayStats(segments) {
  const container = document.getElementById('day-stats');
  if (!container) return;

  const TOTAL_DAY = 1440;

  // تحميل أنشطة المخطط المحفوظة
  let planActivities = [];
  const dateStr = document.getElementById('schedule-date').value;
  const savedPlanStats = ScheduleData.getDay(dateStr);
  if (savedPlanStats) planActivities = savedPlanStats.activities || [];

  // حساب الأوقات حسب النوع
  const typeTotals = { sleep: 0, prayer: 0, prep: 0, work: 0 };
  for (const seg of segments) {
    if (typeTotals.hasOwnProperty(seg.type)) {
      typeTotals[seg.type] += seg.duration;
    }
  }

  // تجميع أنشطة المخطط حسب الاسم
  const activityMap = {};
  let totalActivityTime = 0;
  for (const act of planActivities) {
    const dur = act.end - act.start;
    if (!activityMap[act.name]) {
      activityMap[act.name] = { name: act.name, icon: act.icon, color: act.color, duration: 0 };
    }
    activityMap[act.name].duration += dur;
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

  // حساب الفجوات غير المحددة داخل فترات العمل
  const unassignedSlots = [];
  const disabledPeriods = savedPlanStats ? savedPlanStats.disabledPeriods || [] : [];
  workSegs.forEach(function(wSeg, wIdx) {
    const pKey = 'work:' + wSeg.start + '-' + wSeg.end;
    if (disabledPeriods.indexOf(pKey) !== -1) return;
    const pActs = planActivities.filter(a => a.start >= wSeg.start && a.end <= wSeg.end).sort((a, b) => a.start - b.start);
    let cursor = wSeg.start;
    pActs.forEach(act => {
      if (act.start > cursor) unassignedSlots.push({ start: cursor, end: act.start, duration: act.start - cursor, periodIdx: wIdx });
      cursor = act.end;
    });
    if (cursor < wSeg.end) unassignedSlots.push({ start: cursor, end: wSeg.end, duration: wSeg.end - cursor, periodIdx: wIdx });
  });

  const remainingWork = Math.max(0, typeTotals.work - workActivityTime);
  if (remainingWork > 0) {
    categories.push({ name: 'غير محدد', icon: '⏳', color: '#888', duration: remainingWork, itemClass: 'ds-item-unassigned', _slots: unassignedSlots });
  }

  // إضافة أنشطة المخطط
  for (const key of Object.keys(activityMap)) {
    const act = activityMap[key];
    if (act.duration > 0) {
      categories.push({ name: act.name, icon: act.icon, color: act.color, duration: act.duration });
    }
  }

  // ترتيب: غير محدد أولاً، ثم عمل، ثم عمل خارجي، ثم الباقي بالمدة تنازلياً
  const _sortPriority = { 'غير محدد': 0, 'عمل': 1, 'عمل خارجي': 2 };
  categories.sort((a, b) => {
    const pa = _sortPriority.hasOwnProperty(a.name) ? _sortPriority[a.name] : 99;
    const pb = _sortPriority.hasOwnProperty(b.name) ? _sortPriority[b.name] : 99;
    if (pa !== pb) return pa - pb;
    return b.duration - a.duration;
  });

  // Build focus data: map sessions to categories
  const focusSessions = typeof FocusData !== 'undefined' ? FocusData.get(dateStr) : [];
  let totalDayFocusSec = 0;
  let totalDayFocusSessions = 0;

  // Group focus by category: focus in work periods → "عمل", focus on planned activities → that activity
  const focusByCat = {};
  focusSessions.forEach(function(s) {
    if ((s.totalFocusSec || 0) <= 0) return;
    totalDayFocusSec += s.totalFocusSec;
    totalDayFocusSessions += 1;

    // Check if this focus matches a planned activity by name
    const matchedCat = categories.find(function(c) { return c.name === s.activityName; });
    // If matched to a planned activity, assign there; otherwise assign to "غير محدد" (unspecified time)
    const catName = matchedCat ? matchedCat.name : 'غير محدد';

    if (!focusByCat[catName]) focusByCat[catName] = { totalSec: 0, sessions: 0, details: [] };
    focusByCat[catName].totalSec += s.totalFocusSec;
    focusByCat[catName].sessions += 1;
    focusByCat[catName].details.push({ name: s.activityName, icon: s.activityIcon, sec: s.totalFocusSec });
  });

  // بناء HTML
  let html = '<div class="day-stats-grid">';
  for (const cat of categories) {
    const pct = ((cat.duration / TOTAL_DAY) * 100).toFixed(1);
    const focus = focusByCat[cat.name];
    const isUnassigned = cat.name === 'غير محدد';
    html += `
      <div class="ds-item ${cat.itemClass || ''}${isUnassigned ? ' ds-item-clickable' : ''}"${isUnassigned ? ' onclick="showUnassignedDialog()"' : ''}>
        <div class="ds-bar" style="width: ${pct}%; background: ${cat.color}"></div>
        <div class="ds-info">
          <span class="ds-icon">${cat.icon}</span>
          <span class="ds-name">${cat.name}</span>
          <span class="ds-time">${formatDuration(cat.duration)}</span>
          <span class="ds-pct">${pct}%</span>
          ${isUnassigned ? '<span class="ds-arrow">&#9662;</span>' : ''}
        </div>`;
    if (focus && focus.totalSec > 0) {
      const focusPct = Math.min(100, (focus.totalSec / (cat.duration * 60)) * 100).toFixed(0);
      html += `<div class="ds-focus-row">`;
      html += `<span class="ds-focus-icon">🎯</span>`;
      html += `<span class="ds-focus-label">تركيز</span>`;
      html += `<span class="ds-focus-time">${_formatFocusTime(focus.totalSec)}</span>`;
      html += `<div class="ds-focus-bar"><div class="ds-focus-fill" style="width:${focusPct}%;background:${cat.color}"></div></div>`;
      html += `<span class="ds-focus-pct">${focusPct}%</span>`;
      html += `</div>`;
      // Show detail breakdown if multiple focus sessions in this category
      if (focus.details.length > 1) {
        focus.details.forEach(function(d) {
          html += `<div class="ds-focus-detail">`;
          html += `<span class="ds-focus-detail-icon">${d.icon || '🎯'}</span>`;
          html += `<span class="ds-focus-detail-name">${d.name}</span>`;
          html += `<span class="ds-focus-detail-time">${_formatFocusTime(d.sec)}</span>`;
          html += `</div>`;
        });
      }
    }
    html += `</div>`;
  }
  html += '</div>';

  // Total day focus summary
  if (totalDayFocusSec > 0) {
    html += `<div class="ds-focus-summary">`;
    html += `<span class="ds-focus-summary-icon">🎯</span>`;
    html += `<span class="ds-focus-summary-label">إجمالي التركيز اليوم</span>`;
    html += `<span class="ds-focus-summary-time">${_formatFocusTime(totalDayFocusSec)}</span>`;
    html += `<span class="ds-focus-summary-sessions">${totalDayFocusSessions} جلسة</span>`;
    html += `</div>`;
  }

  container.innerHTML = html;

  // حفظ الفجوات غير المحددة لاستخدامها في الحوار
  window._unassignedSlots = unassignedSlots;
}

/** عرض حوار الفترات غير المحددة */
function showUnassignedDialog() {
  var slots = window._unassignedSlots || [];
  if (slots.length === 0) return;

  var overlay = document.getElementById('unassigned-overlay');
  var body = document.getElementById('unassigned-body');

  var html = '';
  slots.forEach(function(slot) {
    html += '<div class="ua-slot" onclick="onUnassignedSlotClick(' + slot.periodIdx + ', ' + slot.start + '); document.getElementById(\'unassigned-overlay\').classList.remove(\'active\')">';
    html += '<div class="ua-slot-info">';
    html += '<span class="ua-slot-time">' + displayTimeRange(slot.start, slot.end) + '</span>';
    html += '<span class="ua-slot-dur">' + formatDuration(slot.duration) + '</span>';
    html += '</div>';
    html += '<span class="ua-slot-action">✍ إدارة</span>';
    html += '</div>';
  });

  body.innerHTML = html;
  overlay.classList.add('active');
}

function closeUnassignedDialog() {
  document.getElementById('unassigned-overlay').classList.remove('active');
}

function onUnassignedSlotClick(periodIdx, startMin) {
  onBarFreeClick(periodIdx, startMin);
}

/** Export day stats + focus data as JSON — mirrors the visual display */
function exportDayStatsJSON() {
  const dateStr = document.getElementById('schedule-date').value;
  const segments = window._allSegments || [];
  const TOTAL_DAY = 1440;

  const savedDay = ScheduleData.getDay(dateStr);
  const planActivities = savedDay ? (savedDay.activities || []) : [];

  const typeTotals = { sleep: 0, prayer: 0, prep: 0, work: 0 };
  for (const seg of segments) {
    if (typeTotals.hasOwnProperty(seg.type)) typeTotals[seg.type] += seg.duration;
  }

  const activityMap = {};
  for (const act of planActivities) {
    const dur = act.end - act.start;
    if (!activityMap[act.name]) activityMap[act.name] = { name: act.name, icon: act.icon, color: act.color, duration: 0 };
    activityMap[act.name].duration += dur;
  }

  let workActivityTime = 0;
  const workSegs = segments.filter(s => s.type === 'work');
  for (const act of planActivities) {
    for (const wSeg of workSegs) {
      if (act.start >= wSeg.start && act.end <= wSeg.end) workActivityTime += (act.end - act.start);
    }
  }

  const categories = [];
  if (typeTotals.sleep > 0) categories.push({ name: 'نوم', icon: '☾', durationMin: typeTotals.sleep });
  const prayerTotal = (typeTotals.prayer || 0) + (typeTotals.prep || 0);
  if (prayerTotal > 0) categories.push({ name: 'صلاة وتحضير', icon: '❤️', durationMin: prayerTotal });
  const remainingWork = Math.max(0, typeTotals.work - workActivityTime);
  if (remainingWork > 0) categories.push({ name: 'غير محدد', icon: '⏳', durationMin: remainingWork });
  for (const key of Object.keys(activityMap)) {
    const act = activityMap[key];
    if (act.duration > 0) categories.push({ name: act.name, icon: act.icon, color: act.color, durationMin: act.duration });
  }
  const _sp = { 'غير محدد': 0, 'عمل': 1, 'عمل خارجي': 2 };
  categories.sort((a, b) => {
    const pa = _sp.hasOwnProperty(a.name) ? _sp[a.name] : 99;
    const pb = _sp.hasOwnProperty(b.name) ? _sp[b.name] : 99;
    if (pa !== pb) return pa - pb;
    return b.durationMin - a.durationMin;
  });

  // Focus sessions grouped by category (same logic as renderDayStats)
  const focusSessions = typeof FocusData !== 'undefined' ? FocusData.get(dateStr) : [];
  const focusByCat = {};
  let totalDayFocusSec = 0;
  let totalDayFocusSessions = 0;
  focusSessions.forEach(function (s) {
    if ((s.totalFocusSec || 0) <= 0) return;
    totalDayFocusSec += s.totalFocusSec;
    totalDayFocusSessions += 1;
    const matchedCat = categories.find(function (c) { return c.name === s.activityName; });
    const catName = matchedCat ? matchedCat.name : 'غير محدد';
    if (!focusByCat[catName]) focusByCat[catName] = { totalSec: 0, sessions: 0, details: [] };
    focusByCat[catName].totalSec += s.totalFocusSec;
    focusByCat[catName].sessions += 1;
    focusByCat[catName].details.push({ name: s.activityName, icon: s.activityIcon, sec: s.totalFocusSec });
  });

  // Build readable categories with focus & sub-activities
  const exportCats = categories.map(function (cat) {
    const pct = parseFloat(((cat.durationMin / TOTAL_DAY) * 100).toFixed(1));
    const entry = {
      icon: cat.icon,
      name: cat.name,
      duration: formatDuration(cat.durationMin),
      durationMin: cat.durationMin,
      pct: pct + '%'
    };

    // Focus data for this category
    const focus = focusByCat[cat.name];
    if (focus && focus.totalSec > 0) {
      const focusPct = Math.min(100, (focus.totalSec / (cat.durationMin * 60)) * 100).toFixed(0);
      entry.focus = {
        duration: _formatFocusTime(focus.totalSec),
        totalSec: focus.totalSec,
        sessions: focus.sessions,
        pct: focusPct + '%'
      };
    }

    // Sub-activities (e.g. multiple عمل entries under the عمل category)
    const subActs = planActivities.filter(function (a) { return a.name === cat.name; });
    if (subActs.length > 1) {
      entry.subActivities = subActs.map(function (a) {
        return {
          icon: a.icon,
          name: a.name,
          time: displayTime(a.start) + ' - ' + displayTime(a.end),
          duration: formatDuration(a.end - a.start),
          durationMin: a.end - a.start,
          note: a.note || ''
        };
      });
    } else if (subActs.length === 1 && subActs[0].note) {
      entry.note = subActs[0].note;
    }

    return entry;
  });

  const data = {
    date: dateStr,
    stats: exportCats
  };

  // Focus summary
  if (totalDayFocusSec > 0) {
    data.focusSummary = {
      icon: '🎯',
      label: 'إجمالي التركيز اليوم',
      duration: _formatFocusTime(totalDayFocusSec),
      totalSec: totalDayFocusSec,
      sessions: totalDayFocusSessions
    };
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'day-stats-' + dateStr + '.json';
  a.click();
  URL.revokeObjectURL(url);
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

function _buildPrayerGroupsFromSegments(segments) {
  const groups = {};
  const prayerIcons = { fajr: '🌅', dhuhr: '☀️', asr: '🌤️', maghrib: '🌇', isha: '🌙' };
  segments.forEach(seg => {
    if (seg.type !== 'prayer' && seg.type !== 'prep') return;
    const key = seg.prayerKey;
    if (!groups[key]) {
      groups[key] = { prayerKey: key, start: seg.start, end: seg.end, icon: prayerIcons[key] || '🕌' };
    }
    groups[key].start = Math.min(groups[key].start, seg.start);
    groups[key].end = Math.max(groups[key].end, seg.end);
  });
  return Object.values(groups).sort((a, b) => a.start - b.start);
}

function _renderPrayerBlock(pg) {
  const color = PRAYER_COLORS[pg.prayerKey] || '#7c6aef';
  const name = PRAYER_NAMES[pg.prayerKey] || pg.prayerKey;
  const dur = pg.end - pg.start;
  let h = `<div class="wt-prayer-block">`;
  h += `<div class="wt-act-card wt-clickable" style="--act-color:${color}" onclick="editPrayerDuration('${pg.prayerKey}')">`;
  h += `<div class="wt-act-card-header">`;
  h += `<span class="wt-act-card-icon">${pg.icon}</span>`;
  h += `<span class="wt-act-card-name">صلاة</span>`;
  h += `<span class="wt-act-card-time">${displayTime(pg.start)} - ${displayTime(pg.end)}</span>`;
  h += `<span class="wt-act-card-dur">${formatDuration(dur)}</span>`;
  h += `</div>`;
  h += `<div class="wt-act-card-note">${name}</div>`;
  h += `</div></div>`;
  return h;
}

function renderWorkBlocks(segments, prayerMins) {
  const container = document.getElementById('work-blocks');
  const workSegments = segments.filter(s => s.type === 'work');
  const allPeriods = [...workSegments];

  window._workSegments = workSegments;

  const prayerGroups = _buildPrayerGroupsFromSegments(segments);

  if (allPeriods.length === 0) {
    container.innerHTML = '<p class="no-work-msg">لا توجد فترات عمل متاحة</p>';
    return;
  }

  // تحميل أنشطة المخطط المحفوظة
  const dateStr = document.getElementById('schedule-date').value;
  let savedPlan = ScheduleData.getDay(dateStr);
  if (Array.isArray(savedPlan)) savedPlan = { activities: savedPlan, disabledPeriods: [] };

  const planActivities = savedPlan ? savedPlan.activities || [] : [];
  const disabledPeriods = savedPlan ? savedPlan.disabledPeriods || [] : [];

  let html = '';
  let totalAvail = 0;

  allPeriods.forEach((seg, i) => {
    // إدراج فترات الصلاة قبل فترة العمل
    const prevEnd = i > 0 ? allPeriods[i - 1].end : 0;
    prayerGroups.forEach(pg => {
      if (pg.start >= prevEnd && pg.end <= seg.start) {
        html += _renderPrayerBlock(pg);
      }
    });
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
    html += `<span class="wt-period-free">${formatDuration(freeTime)} متاح</span>`;
    html += `<button class="wt-edit-btn" onclick="openPlannerForPeriod(${i})" title="إدارة">&#9998;</button>`;
    html += `</div>`;
    if (periodName) {
      html += `<div class="wt-period-name">${periodName}</div>`;
    }

    // شريط التقدم للفترة الحالية
    if (isCurrent && !disabled && freeTime > 0) {
      // حساب الوقت المنقضي والمتبقي لهذه الفترة
      const nonWorkActs = periodActs;
      let pGone = 0, pLeft = 0;
      let cursor2 = seg.start;
      nonWorkActs.forEach(act => {
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

      // Focus progress overlaid on same bar
      const periodFocusSec = typeof FocusData !== 'undefined' ? FocusData.getTotalForSegment(dateStr, seg.start, seg.end) : 0;
      const periodDurSec = freeTime * 60;
      const fPct = periodDurSec > 0 ? Math.min(100, (periodFocusSec / periodDurSec) * 100).toFixed(1) : 0;

      html += `<div class="wt-period-progress" data-seg-start="${seg.start}" data-seg-end="${seg.end}">`;
      html += `<div class="wp-bar">`;
      html += `<div class="wp-fill" style="width:${pPct}%"></div>`;
      if (periodFocusSec > 0) {
        html += `<div class="wp-focus-fill" style="width:${fPct}%"></div>`;
      }
      html += `</div>`;
      html += `<div class="wp-labels">`;
      html += `<div class="wp-gone"><span class="wp-dot wp-dot-gone"></span> انتهى <b>${formatDuration(pGone)}</b></div>`;
      html += `<div class="wp-left"><span class="wp-dot wp-dot-left"></span> متبقي <b>${formatDuration(pLeft)}</b></div>`;
      html += `</div>`;
      if (periodFocusSec > 0) {
        html += `<div class="wp-focus-label">`;
        html += `<span>🎯 تركيز</span>`;
        html += `<b>${_formatFocusTime(periodFocusSec)}</b>`;
        html += `<span class="wp-focus-pct">${fPct}%</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    if (!disabled) {
      // الشريط المرئي مع الأنشطة
      if (periodActs.length > 0) {
        html += `<div class="wt-visual-bar">`;
        let cursor = seg.start;
        periodActs.forEach(act => {
          if (act.start > cursor) {
            const freeDur = act.start - cursor;
            const fState = isToday2 ? (nowMin2 >= act.start ? 'done' : nowMin2 > cursor ? 'active' : '') : '';
            html += `<div class="wt-vb-seg wt-vb-free wt-clickable${fState ? ' vb-' + fState : ''}" style="flex:${freeDur}" data-seg-s="${cursor}" data-seg-e="${act.start}" onclick="onBarFreeClick(${i}, ${cursor})">`;
            html += `<div class="vb-fill"></div>`;
            if (freeDur >= 15) html += `<span class="vb-dur">${formatDuration(freeDur)}</span>`;
            html += `<span class="vb-range">${displayTime(cursor)} - ${displayTime(act.start)}</span>`;
            if (fState === 'active') html += `<span class="vb-timer"></span>`;
            html += `</div>`;
          }
          const actDur = act.end - act.start;
          const actGIdx = planActivities.indexOf(act);
          const aState = isToday2 ? (nowMin2 >= act.end ? 'done' : nowMin2 >= act.start ? 'active' : '') : '';
          html += `<div class="wt-vb-seg wt-vb-act wt-clickable${aState ? ' vb-' + aState : ''}" style="flex:${actDur}; background:${act.color}" data-seg-s="${act.start}" data-seg-e="${act.end}" onclick="editActivity(${i}, ${actGIdx})">`;
          html += `<div class="vb-fill"></div>`;
          html += `<span class="vb-dur">${act.icon}</span>`;
          html += `<span class="vb-range">${displayTime(act.start)} - ${displayTime(act.end)}</span>`;
          if (aState === 'active') html += `<span class="vb-timer"></span>`;
          html += `</div>`;
          cursor = act.end;
        });
        if (cursor < seg.end) {
          const freeDur = seg.end - cursor;
          const fState = isToday2 ? (nowMin2 >= seg.end ? 'done' : nowMin2 > cursor ? 'active' : '') : '';
          html += `<div class="wt-vb-seg wt-vb-free wt-clickable${fState ? ' vb-' + fState : ''}" style="flex:${freeDur}" data-seg-s="${cursor}" data-seg-e="${seg.end}" onclick="onBarFreeClick(${i}, ${cursor})">`;
          html += `<div class="vb-fill"></div>`;
          if (freeDur >= 15) html += `<span class="vb-dur">${formatDuration(freeDur)}</span>`;
          html += `<span class="vb-range">${displayTime(cursor)} - ${displayTime(seg.end)}</span>`;
          if (fState === 'active') html += `<span class="vb-timer"></span>`;
          html += `</div>`;
        }
        html += `</div>`;

        // شرائح الأنشطة
        html += `<div class="wt-act-list">`;
        periodActs.forEach(act => {
          const hasNote = act.note && act.note.trim();
          const cardGIdx = planActivities.indexOf(act);
          html += `<div class="wt-act-card wt-clickable" style="--act-color:${act.color}" onclick="editActivity(${i}, ${cardGIdx})">`;
          html += `<div class="wt-act-card-header">`;
          html += `<span class="wt-act-card-icon">${act.icon}</span>`;
          html += `<span class="wt-act-card-name">${act.name}</span>`;
          html += `<span class="wt-act-card-time">${displayTime(act.start)} - ${displayTime(act.end)}</span>`;
          html += `<span class="wt-act-card-dur">${formatDuration(act.end - act.start)}</span>`;
          html += `</div>`;
          if (hasNote) {
            html += `<div class="wt-act-card-note">${act.note.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>`;
          }
          html += `</div>`;
        });
        html += `</div>`;

        // Focus indicator for each activity
        periodActs.forEach(act => {
          const focusTotal = typeof FocusData !== 'undefined' ? FocusData.getTotalForSegment(dateStr, act.start, act.end) : 0;
          if (focusTotal > 0) {
            const actDurSec = (act.end - act.start) * 60;
            const focusPct = Math.min(100, (focusTotal / actDurSec) * 100).toFixed(1);
            html += `<div class="focus-indicator" style="width:${focusPct}%; background:${act.color}"></div>`;
          }
        });
      }

      // Focus button for active period (outside periodActs check so it shows even with no activities)
      if (isToday2 && nowMin2 >= seg.start && nowMin2 < seg.end) {
        const dateStr2 = document.getElementById('schedule-date').value;
        const activeAct = periodActs.find(a => nowMin2 >= a.start && nowMin2 < a.end);
        if (activeAct) {
          html += `<div style="padding: 4px 12px 12px;">`;
          html += `<button class="focus-btn" style="--focus-btn-bg:${activeAct.color}88;--focus-btn-bg2:${activeAct.color}55" onclick="openFocusMode('${dateStr2}', ${activeAct.start}, ${activeAct.end}, '${(activeAct.name||'').replace(/'/g,"\\'")}', '${activeAct.icon||''}', '${activeAct.color}')">`;
          html += `${activeAct.icon || '&#127919;'} ابدأ التركيز — ${activeAct.name || 'تركيز'}</button>`;
          html += `</div>`;
        } else {
          html += `<div style="padding: 4px 12px 12px;">`;
          html += `<button class="focus-btn" onclick="openFocusMode('${dateStr2}', ${seg.start}, ${seg.end}, 'وقت متاح', '🎯', '#7c6aef')">`;
          html += `&#127919; ابدأ التركيز</button>`;
          html += `</div>`;
        }
      }
    } else {
      html += `<div class="wt-disabled-label">معطّلة</div>`;
    }

    html += `</div>`;
  });

  // إدراج فترات الصلاة بعد آخر فترة عمل
  if (allPeriods.length > 0) {
    const lastEnd = allPeriods[allPeriods.length - 1].end;
    prayerGroups.forEach(pg => {
      if (pg.start >= lastEnd) {
        html += _renderPrayerBlock(pg);
      }
    });
  }

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

  // النشاط الحالي (لعرضه في شريط التقدم)
  let currentActHtml = '';
  if (isToday) {
    const nowAct = planActivities.find(a => nowMin >= a.start && nowMin < a.end);
    if (nowAct) {
      const noteText = nowAct.note ? nowAct.note.replace(/</g, '&lt;').replace(/\n/g, ' ') : '';
      currentActHtml = `<div class="wp-current-act" style="--act-color:${nowAct.color}">`;
      currentActHtml += `<span class="wp-act-icon">${nowAct.icon || ''}</span>`;
      currentActHtml += `<span class="wp-act-name">${nowAct.name}</span>`;
      if (noteText) currentActHtml += `<span class="wp-act-note">${noteText}</span>`;
      currentActHtml += `</div>`;
    }
  }

  // شريط تقدم العمل في أعلى الصفحة
  const topProgress = document.getElementById('work-progress-top');
  if (topProgress) {
    if (isToday && totalAvail > 0) {
      topProgress.innerHTML = `
      <div class="work-progress" id="work-progress">
        ${currentActHtml}
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
  registerTimers();

  // تحميل بيانات التركيز وإعادة عرض الإحصائيات بعد وصول البيانات
  if (typeof FocusData !== 'undefined') {
    FocusData.load(dateStr).then(function() {
      renderDayStats(segments);
    });
  }
}

// ─── التاريخ والتنقل ───

function initDateInput() {
  const dateInput = document.getElementById('schedule-date');
  dateInput.value = new Date().toISOString().split('T')[0];
}

async function changeDate(delta) {
  const dateInput = document.getElementById('schedule-date');
  const current = new Date(dateInput.value + 'T12:00:00');
  current.setDate(current.getDate() + delta);
  dateInput.value = current.toISOString().split('T')[0];
  const bedtimeInput = document.getElementById('manual-bedtime');
  if (bedtimeInput) bedtimeInput.dataset.manual = '';
  await loadDayFromServer();
  loadSettingsFromDay();
  renderDay();
}

// ─── نسخ من يوم ───

async function copyFromDay() {
  const fromDate = document.getElementById('copy-from-date').value;
  const toDate = document.getElementById('schedule-date').value;
  if (!fromDate || !toDate || fromDate === toDate) return;

  // تحميل يوم المصدر من الخادم إن لم يكن محملاً
  let source = ScheduleData.getDay(fromDate);
  if (!source) {
    await ScheduleData.loadDay(fromDate);
    source = ScheduleData.getDay(fromDate);
  }
  if (!source) return;

  if (Array.isArray(source)) source = { activities: source, disabledPeriods: [] };

  // نسخ عميق
  const copy = JSON.parse(JSON.stringify(source));
  ScheduleData.saveDay(toDate, copy);

  const bi = document.getElementById('manual-bedtime');
  if (bi) bi.dataset.manual = '';
  loadSettingsFromDay();
  renderDay();
}

// ─── الأحداث ───

function attachEvents() {
  document.getElementById('schedule-date').addEventListener('change', async () => {
    const bi = document.getElementById('manual-bedtime');
    if (bi) bi.dataset.manual = '';
    await loadDayFromServer();
    loadSettingsFromDay();
    renderDay();
  });
  document.getElementById('prev-day').addEventListener('click', () => changeDate(-1));
  document.getElementById('next-day').addEventListener('click', () => changeDate(1));
  document.getElementById('today-btn').addEventListener('click', async () => {
    document.getElementById('schedule-date').value = new Date().toISOString().split('T')[0];
    const bi = document.getElementById('manual-bedtime');
    if (bi) bi.dataset.manual = '';
    await loadDayFromServer();
    loadSettingsFromDay();
    renderDay();
  });

  // تحديث البيانات من الخادم
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    await ScheduleData.refresh();
    const dateStr = document.getElementById('schedule-date').value;
    await ScheduleData.loadDay(dateStr);
    loadSettingsFromDay();
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

  // تصدير / استيراد
  document.getElementById('export-btn').addEventListener('click', openExportDialog);
  document.getElementById('export-confirm').addEventListener('click', doExport);
  document.getElementById('export-cancel').addEventListener('click', closeExportDialog);
  document.getElementById('export-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeExportDialog();
  });
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', handleImport);
  document.getElementById('export-stats-btn').addEventListener('click', exportDayStatsJSON);

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

// ─── تصدير / استيراد ───

function openExportDialog() {
  const dateStr = document.getElementById('schedule-date').value;
  document.getElementById('export-from').value = dateStr;
  document.getElementById('export-to').value = dateStr;
  document.getElementById('export-overlay').classList.add('active');
}

function closeExportDialog() {
  document.getElementById('export-overlay').classList.remove('active');
}

async function doExport() {
  const from = document.getElementById('export-from').value;
  const to = document.getElementById('export-to').value;
  if (!from || !to) return;

  await ScheduleData.refresh();
  const allDays = ScheduleData.getAllDays();
  const exportDays = {};

  for (const date of Object.keys(allDays).sort()) {
    if (date >= from && date <= to) {
      exportDays[date] = allDays[date];
    }
  }

  const payload = { days: exportDays, customPresets: ScheduleData.getPresets() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = from === to ? 'schedule-' + from + '.json' : 'schedule-' + from + '_' + to + '.json';
  a.click();
  URL.revokeObjectURL(url);
  closeExportDialog();
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.days) return;

    for (const date of Object.keys(data.days)) {
      ScheduleData.saveDay(date, data.days[date]);
    }

    if (data.customPresets && data.customPresets.length > 0) {
      ScheduleData.savePresets(data.customPresets);
    }

    // تحديث اليوم الحالي
    const dateStr = document.getElementById('schedule-date').value;
    await ScheduleData.loadDay(dateStr);
    loadSettingsFromDay();
    const bi = document.getElementById('manual-bedtime');
    if (bi) bi.dataset.manual = '';
    renderDay();
  } catch (err) {
    console.error('فشل الاستيراد:', err);
  }

  e.target.value = '';
}

// ─── الإعدادات ───

function loadSettings() {
  // Settings now loaded per-day via loadSettingsFromDay()
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
  setInputValue('pomo-duration-schedule', scheduleSettings.pomoDuration);

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
  scheduleSettings.pomoDuration = getInputValue('pomo-duration-schedule', 45);

  // حفظ الإعدادات في بيانات اليوم
  const dateStr = document.getElementById('schedule-date').value;
  const dayData = ScheduleData.getDayOrDefault(dateStr);
  dayData.settings = JSON.parse(JSON.stringify(scheduleSettings));
  ScheduleData.saveDay(dateStr);
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

// ─── العد التنازلي في الوقت الحقيقي (LiveTimer) ───

function registerTimers() {
  LiveTimer.clear();
  LiveTimer.stop();

  const isToday = document.getElementById('schedule-date').value === new Date().toISOString().split('T')[0];
  if (!isToday) return;

  // 1. عد تنازلي للصلاة + دائرة
  const cdEl = document.getElementById('pp-countdown');
  if (cdEl) {
    const target = parseInt(cdEl.dataset.target, 10);
    const prev = parseInt(cdEl.dataset.prev, 10);
    if (!isNaN(target) && !isNaN(prev)) {
      LiveTimer.countdown(document.getElementById('pp-cd-remaining'), target, 'بعد', function () { renderDay(); });
      LiveTimer.elapsed(document.getElementById('pp-cd-elapsed'), prev, 'منذ');
      LiveTimer.pie(cdEl.querySelector('.pp-pie-chart'), prev, target);
    }
  }

  // 2. شريط تقدم العمل الإجمالي
  const wpEl = document.getElementById('work-progress');
  if (wpEl) {
    LiveTimer.progress(
      wpEl.querySelector('.wp-fill'),
      document.getElementById('wp-gone-val'),
      document.getElementById('wp-left-val'),
      computeWorkProgress
    );
  }

  // 3. شريط تقدم كل فترة
  document.querySelectorAll('.wt-period-progress[data-seg-start]').forEach(function (ppEl) {
    const segStart = parseInt(ppEl.dataset.segStart, 10);
    const segEnd = parseInt(ppEl.dataset.segEnd, 10);
    LiveTimer.progress(
      ppEl.querySelector('.wp-fill'),
      ppEl.querySelector('.wp-gone b'),
      ppEl.querySelector('.wp-left b'),
      function (nowSec) { return computePeriodProgress(nowSec, segStart, segEnd); }
    );
  });

  // 4. شرائح الشريط المرئي الحالية (تعبئة + مؤقت)
  document.querySelectorAll('.wt-vb-seg.vb-active').forEach(function (segEl) {
    const sMin = parseInt(segEl.dataset.segS, 10);
    const eMin = parseInt(segEl.dataset.segE, 10);
    if (isNaN(sMin) || isNaN(eMin)) return;
    const fillEl = segEl.querySelector('.vb-fill');
    const timerEl = segEl.querySelector('.vb-timer');
    if (!fillEl) return;

    LiveTimer.progress(fillEl, null, null, function (nowSec) {
      const fs = sMin * 60, fe = eMin * 60;
      const gone = Math.max(0, Math.min(nowSec - fs, fe - fs));
      const left = Math.max(0, fe - nowSec);
      var pct = (fe - fs) > 0 ? ((gone / (fe - fs)) * 100).toFixed(1) : 0;
      fillEl.style.width = pct + '%';
      if (timerEl) timerEl.textContent = LiveTimer.format(left);
      if (nowSec >= fe && !segEl.classList.contains('vb-done')) {
        segEl.classList.remove('vb-active');
        segEl.classList.add('vb-done');
        if (timerEl) timerEl.style.display = 'none';
      }
      return { gone: gone, left: left };
    });
  });

  LiveTimer.start();
}

function computeWorkProgress(nowSec) {
  const workSegs = (window._allSegments || []).filter(function (s) { return s.type === 'work'; });
  const dateStr = document.getElementById('schedule-date').value;
  let sp = ScheduleData.getDay(dateStr);
  if (Array.isArray(sp)) sp = { activities: sp, disabledPeriods: [] };
  const acts = sp ? sp.activities || [] : [];
  const dis = sp ? sp.disabledPeriods || [] : [];
  var gone = 0, left = 0;
  workSegs.forEach(function (seg) {
    if (dis.indexOf('work:' + seg.start + '-' + seg.end) !== -1) return;
    var pa = acts.filter(function (a) { return a.start >= seg.start && a.end <= seg.end; }).sort(function (a, b) { return a.start - b.start; });
    var c = seg.start;
    pa.forEach(function (a) { if (a.start > c) { acc(c * 60, a.start * 60); } c = a.end; });
    if (c < seg.end) acc(c * 60, seg.end * 60);
  });
  function acc(fs, fe) {
    if (nowSec >= fe) gone += fe - fs;
    else if (nowSec > fs) { gone += nowSec - fs; left += fe - nowSec; }
    else left += fe - fs;
  }
  return { gone: gone, left: left };
}

function computePeriodProgress(nowSec, segStart, segEnd) {
  const dateStr = document.getElementById('schedule-date').value;
  let sp = ScheduleData.getDay(dateStr);
  if (Array.isArray(sp)) sp = { activities: sp, disabledPeriods: [] };
  const pa = (sp ? sp.activities || [] : [])
    .filter(function (a) { return a.start >= segStart && a.end <= segEnd; })
    .sort(function (a, b) { return a.start - b.start; });
  var gone = 0, left = 0, c = segStart;
  pa.forEach(function (a) { if (a.start > c) { acc(c * 60, a.start * 60); } c = a.end; });
  if (c < segEnd) acc(c * 60, segEnd * 60);
  function acc(fs, fe) {
    if (nowSec >= fe) gone += fe - fs;
    else if (nowSec > fs) { gone += nowSec - fs; left += fe - nowSec; }
    else left += fe - fs;
  }
  return { gone: gone, left: left };
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
