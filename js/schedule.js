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

function generateDaySegments(prayerMins) {
  const buf = scheduleSettings.buffers;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const bedtimeMin = prayerMins.isha + scheduleSettings.bedtimeAfterIsha;

  const occupiedRanges = [];

  // الفجر
  if (buf.fajr.before > 0) {
    occupiedRanges.push({ type: 'prep', label: PREP_NAMES.fajr, prayerKey: 'fajr', start: prayerMins.fajr - buf.fajr.before, end: prayerMins.fajr });
  }
  occupiedRanges.push({ type: 'prayer', label: PRAYER_NAMES.fajr, prayerKey: 'fajr', start: prayerMins.fajr, end: prayerMins.fajr + buf.fajr.after });

  // الشروق
  occupiedRanges.push({ type: 'sunrise', label: PRAYER_NAMES.sunrise, prayerKey: 'sunrise', start: prayerMins.sunrise, end: prayerMins.sunrise + buf.sunrise.after });

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

  // وقت النوم بعد العشاء
  const bedEnd = Math.min(bedtimeMin, 1440);
  occupiedRanges.push({ type: 'bedtime', label: 'وقت شخصي قبل النوم', prayerKey: 'bedtime', start: prayerMins.isha + buf.isha.after, end: bedEnd });

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
        const isAfterBedtime = gapStart >= bedEnd;
        segments.push({ type: isAfterBedtime ? 'sleep' : 'work', label: isAfterBedtime ? 'نوم' : 'وقت عمل', prayerKey: isAfterBedtime ? 'sleep' : 'work', start: gapStart, end: gapEnd, duration: gapEnd - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < gapEnd });
      }
    }
  }

  const lastOccupied = merged[merged.length - 1];
  if (lastOccupied && lastOccupied.end < 1440) {
    const gapStart = lastOccupied.end;
    segments.push({ type: 'sleep', label: 'نوم', prayerKey: 'sleep', start: gapStart, end: 1440, duration: 1440 - gapStart, isCurrent: currentMinutes >= gapStart && currentMinutes < 1440 });
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
  const grid = document.getElementById('prayer-times-grid');
  const prayers = [
    { key: 'fajr',    name: 'الفجر',  mins: prayerMins.fajr },
    { key: 'sunrise', name: 'الشروق', mins: prayerMins.sunrise },
    { key: 'dhuhr',   name: 'الظهر',  mins: prayerMins.dhuhr },
    { key: 'asr',     name: 'العصر',  mins: prayerMins.asr },
    { key: 'maghrib', name: 'المغرب', mins: prayerMins.maghrib },
    { key: 'isha',    name: 'العشاء', mins: prayerMins.isha }
  ];

  grid.innerHTML = prayers.map(p => `
    <div class="prayer-time-card prayer-${p.key}">
      <div class="ptc-name">${p.name}</div>
      <div class="ptc-time">${displayTime(p.mins)}</div>
    </div>
  `).join('');
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
  const bedtime = prayerMins.isha + scheduleSettings.bedtimeAfterIsha;
  svg += `<text x="${cx}" y="${cy - 10}" class="pent-center-label" text-anchor="middle" dominant-baseline="middle">وقت النوم</text>`;
  svg += `<text x="${cx}" y="${cy + 14}" class="pent-center-time" text-anchor="middle" dominant-baseline="middle">${displayTime(bedtime)}</text>`;

  svg += '</svg>';
  container.innerHTML = svg;
}

function renderTimeline(segments) {
  const container = document.getElementById('day-timeline');
  const showDetails = document.getElementById('toggle-details');
  const hideBuffers = showDetails && !showDetails.checked;

  container.innerHTML = segments.map(seg => {
    const currentClass = seg.isCurrent ? ' tb-current' : '';
    const hiddenClass = hideBuffers && (seg.type === 'prep' || seg.type === 'prayer' || seg.type === 'sunrise') ? ' tb-hidden' : '';
    return `
    <div class="timeline-block tb-${seg.type} prayer-${seg.prayerKey}${currentClass}${hiddenClass}">
      <div class="tb-bar"></div>
      <div class="tb-content">
        <div class="tb-header">
          <span class="tb-time-range">${displayTimeRange(seg.start, seg.end)}</span>
          <span class="tb-duration">${formatDuration(seg.duration)}</span>
        </div>
        <div class="tb-label">${seg.label}</div>
      </div>
    </div>`;
  }).join('');
}

function renderWorkBlocks(segments) {
  const container = document.getElementById('work-blocks');
  const workSegments = segments.filter(s => s.type === 'work');

  if (workSegments.length === 0) {
    container.innerHTML = '<p class="no-work-msg">لا توجد فترات عمل متاحة</p>';
    return;
  }

  const totalWork = workSegments.reduce((sum, s) => sum + s.duration, 0);

  let html = '<div class="work-list">';
  workSegments.forEach((seg, i) => {
    const currentClass = seg.isCurrent ? ' wb-current' : '';
    html += `
      <div class="work-item${currentClass}">
        <div class="wi-number">${i + 1}</div>
        <div class="wi-details">
          <div class="wi-time">${displayTimeRange(seg.start, seg.end)}</div>
          <div class="wi-duration">${formatDuration(seg.duration)}</div>
        </div>
      </div>`;
  });
  html += '</div>';

  html += `
    <div class="work-total">
      <span class="wt-label">إجمالي وقت العمل المتاح:</span>
      <span class="wt-value">${formatDuration(totalWork)}</span>
    </div>`;

  container.innerHTML = html;
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
    document.getElementById('prayer-times-grid').innerHTML = '<p class="no-data-msg">لا توجد بيانات متوفرة</p>';
    document.getElementById('pentagon-wrap').innerHTML = '';
    document.getElementById('day-timeline').innerHTML = '';
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
  const segments = generateDaySegments(prayerMins);

  renderPrayerGrid(dayData, prayerMins);
  renderPentagon(prayerMins);
  renderTimeline(segments);
  renderWorkBlocks(segments);
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
  renderDay();
}

function goToToday() {
  document.getElementById('schedule-date').value = new Date().toISOString().split('T')[0];
  renderDay();
}

// ─── الأحداث ───

function attachEvents() {
  document.getElementById('schedule-date').addEventListener('change', renderDay);
  document.getElementById('prev-day').addEventListener('click', () => changeDate(-1));
  document.getElementById('next-day').addEventListener('click', () => changeDate(1));
  document.getElementById('today-btn').addEventListener('click', goToToday);

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

  // تبديل إظهار/إخفاء أوقات التحضير
  const toggleDetails = document.getElementById('toggle-details');
  if (toggleDetails) {
    toggleDetails.addEventListener('change', renderDay);
  }
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
