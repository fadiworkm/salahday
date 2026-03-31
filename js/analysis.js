/**
 * تحليل فترات العمل - عبر أيام متعددة
 * يعمل بشكل مستقل عن schedule.js و data.js و app.js
 */

// ─── بيانات الصلاة ───
let prayerData = [];

// ─── الإعدادات ───
let analysisSettings = {
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
document.addEventListener('DOMContentLoaded', () => {
  generateStars();
  loadSettings();
  loadPrayerData();
  initDateInputs();
  attachEvents();
});

// ─── تحميل بيانات الصلاة ───
function loadPrayerData() {
  if (typeof PRAY_TIMES_RAW !== 'undefined') {
    prayerData = PRAY_TIMES_RAW;
    return;
  }
  prayerData = [];
}

// ─── تحميل الإعدادات ───
function loadSettings() {
  const saved = localStorage.getItem('scheduleSettings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      analysisSettings = { ...analysisSettings, ...parsed };
      if (parsed.buffers) {
        analysisSettings.buffers = { ...analysisSettings.buffers, ...parsed.buffers };
      }
    } catch (e) { /* تجاهل */ }
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

  if (analysisSettings.timeFormat === '12') {
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
  const buf = analysisSettings.buffers;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const bedtimeMin = prayerMins.isha + analysisSettings.bedtimeAfterIsha;

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

// ─── دوال مساعدة ───

function getDateRange(fromStr, toStr) {
  const dates = [];
  const current = new Date(fromStr + 'T12:00:00');
  const end = new Date(toStr + 'T12:00:00');
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ar-SY', { day: 'numeric', month: 'long' });
}

// ─── تهيئة حقول التاريخ ───

function initDateInputs() {
  const fromInput = document.getElementById('date-from');
  const toInput = document.getElementById('date-to');

  if (prayerData.length > 0) {
    // استخراج أول وآخر تاريخ متاح
    const dates = prayerData.map(d => d['تاريخ_ميلادي'].replace(/\//g, '-')).sort();
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    // الأسبوع الحالي إذا كان ضمن النطاق
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (todayStr >= firstDate && todayStr <= lastDate) {
      // بداية الأسبوع الحالي (السبت)
      const dayOfWeek = today.getDay(); // 0 = Sunday
      const saturdayOffset = dayOfWeek === 6 ? 0 : -(dayOfWeek + 1);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() + saturdayOffset);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      fromInput.value = weekStart.toISOString().split('T')[0];
      toInput.value = weekEnd.toISOString().split('T')[0];
    } else {
      fromInput.value = firstDate;
      toInput.value = lastDate;
    }
  } else {
    // افتراضي: الأسبوع الحالي
    const today = new Date();
    const dayOfWeek = today.getDay();
    const saturdayOffset = dayOfWeek === 6 ? 0 : -(dayOfWeek + 1);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + saturdayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    fromInput.value = weekStart.toISOString().split('T')[0];
    toInput.value = weekEnd.toISOString().split('T')[0];
  }
}

// ─── التحليل الرئيسي ───

function analyzeRange() {
  const fromStr = document.getElementById('date-from').value;
  const toStr = document.getElementById('date-to').value;

  if (!fromStr || !toStr) return;

  const dates = getDateRange(fromStr, toStr);
  if (dates.length === 0) return;

  const days = [];

  for (const dateStr of dates) {
    let dayData = getDayData(dateStr);
    if (!dayData) {
      dayData = getClosestDate(dateStr);
    }
    if (!dayData) continue;

    const prayerMins = extractPrayerMinutes(dayData);
    const segments = generateDaySegments(prayerMins);
    const workSegments = segments.filter(s => s.type === 'work');
    const totalWork = workSegments.reduce((sum, s) => sum + s.duration, 0);

    const d = new Date(dateStr + 'T12:00:00');
    const dayName = d.toLocaleDateString('ar-SY', { weekday: 'long' });
    const hijriDate = dayData['تاريخ_هجري'] || '';

    days.push({
      dateStr,
      dayName,
      hijriDate,
      prayerMins,
      workSegments,
      totalWork
    });
  }

  if (days.length === 0) return;

  // حساب الإحصائيات
  const totalDays = days.length;
  const grandTotal = days.reduce((sum, d) => sum + d.totalWork, 0);
  const avgWork = Math.round(grandTotal / totalDays);

  let maxWork = 0, maxDay = days[0];
  let minWork = Infinity, minDay = days[0];

  for (const day of days) {
    if (day.totalWork > maxWork) {
      maxWork = day.totalWork;
      maxDay = day;
    }
    if (day.totalWork < minWork) {
      minWork = day.totalWork;
      minDay = day;
    }
  }

  const stats = {
    avgWork,
    maxWork,
    maxDay,
    minWork,
    minDay,
    totalDays,
    grandTotal
  };

  // عرض النتائج
  document.getElementById('stats-section').style.display = '';
  document.getElementById('daily-section').style.display = '';

  renderStats(stats);
  renderDailyBreakdown(days, stats);

  // إعادة ربط select-all
  const selectAll = document.getElementById('select-all');
  selectAll.checked = true;
}

// ─── عرض الإحصائيات ───

function renderStats(stats) {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    <div class="stat-card stat-avg">
      <div class="stat-value">${formatDuration(stats.avgWork)}</div>
      <div class="stat-label">المعدل اليومي</div>
    </div>
    <div class="stat-card stat-max">
      <div class="stat-value">${formatDuration(stats.maxWork)}</div>
      <div class="stat-label">أعلى يوم (${stats.maxDay.dayName})</div>
    </div>
    <div class="stat-card stat-min">
      <div class="stat-value">${formatDuration(stats.minWork)}</div>
      <div class="stat-label">أقل يوم (${stats.minDay.dayName})</div>
    </div>
    <div class="stat-card stat-total">
      <div class="stat-value">${stats.totalDays}</div>
      <div class="stat-label">عدد الأيام</div>
    </div>
  `;
}

// ─── عرض التفاصيل اليومية ───

function renderDailyBreakdown(days, stats) {
  const container = document.getElementById('daily-breakdown');

  let html = '';
  for (const day of days) {
    const isBest = day.dateStr === stats.maxDay.dateStr;
    const isWorst = day.dateStr === stats.minDay.dateStr;
    let groupClass = 'day-group';
    if (isBest) groupClass += ' day-best';
    if (isWorst) groupClass += ' day-worst';

    html += `<div class="${groupClass}" data-date="${day.dateStr}">`;
    html += `  <div class="day-header" onclick="toggleDay('${day.dateStr}')">`;
    html += `    <div class="dh-info">`;
    html += `      <span class="dh-date">${formatDateDisplay(day.dateStr)}</span>`;
    html += `      <span class="dh-day">${day.dayName}</span>`;
    html += `    </div>`;
    html += `    <span class="dh-total">${formatDuration(day.totalWork)}</span>`;
    html += `    <span class="dh-arrow">&#9660;</span>`;
    html += `  </div>`;
    html += `  <div class="day-body">`;

    day.workSegments.forEach((seg, i) => {
      const betweenLabel = getWorkBetweenPrayers(seg, day.prayerMins);
      html += `
        <div class="day-work-item" data-date="${day.dateStr}" data-index="${i}">
          <label class="dwi-check-label">
            <input type="checkbox" class="dwi-checkbox" data-date="${day.dateStr}" data-index="${i}" data-duration="${seg.duration}" checked>
            <span class="dwi-check-custom"></span>
          </label>
          <div class="dwi-info">
            <div class="dwi-time">${displayTimeRange(seg.start, seg.end)}</div>
            <div class="dwi-dur">${formatDuration(seg.duration)}</div>
            <div class="dwi-between">${betweenLabel}</div>
          </div>
        </div>`;
    });

    html += `  </div>`;
    html += `</div>`;
  }

  // شريط الإجمالي المحدد
  const grandTotal = days.reduce((sum, d) => sum + d.totalWork, 0);
  html += `
    <div class="analysis-total-bar">
      <span class="atb-label">الوقت المحدد:</span>
      <span class="atb-selected" id="analysis-selected">${formatDuration(grandTotal)}</span>
      <span class="atb-sep">من</span>
      <span class="atb-all" id="analysis-total">${formatDuration(grandTotal)}</span>
    </div>`;

  container.innerHTML = html;

  // ربط أحداث التحديد
  container.querySelectorAll('.dwi-checkbox').forEach(cb => {
    cb.addEventListener('change', updateAnalysisTotal);
  });
}

// ─── تبديل عرض تفاصيل اليوم ───

function toggleDay(dateStr) {
  const group = document.querySelector(`.day-group[data-date="${dateStr}"]`);
  if (group) {
    group.classList.toggle('expanded');
  }
}

// ─── تحديث الإجمالي المحدد ───

function updateAnalysisTotal() {
  const checkboxes = document.querySelectorAll('.dwi-checkbox');
  let selected = 0;
  let total = 0;

  checkboxes.forEach(cb => {
    const dur = parseInt(cb.dataset.duration, 10);
    total += dur;
    if (cb.checked) {
      selected += dur;
    }
    // تحديث مظهر العنصر
    const item = cb.closest('.day-work-item');
    if (item) {
      item.classList.toggle('dwi-unchecked', !cb.checked);
    }
  });

  const selectedEl = document.getElementById('analysis-selected');
  if (selectedEl) selectedEl.textContent = formatDuration(selected);

  // تحديث المعدل في الإحصائيات بناء على المحدد
  const totalDays = document.querySelectorAll('.day-group').length;
  if (totalDays > 0) {
    const avgCard = document.querySelector('.stat-avg .stat-value');
    if (avgCard) {
      avgCard.textContent = formatDuration(Math.round(selected / totalDays));
    }
  }

  // تحديث حالة select-all
  const selectAll = document.getElementById('select-all');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  const noneChecked = Array.from(checkboxes).every(cb => !cb.checked);
  selectAll.checked = allChecked;
  selectAll.indeterminate = !allChecked && !noneChecked;
}

// ─── تحديد/إلغاء تحديد الكل ───

function handleSelectAll() {
  const selectAll = document.getElementById('select-all');
  const checkboxes = document.querySelectorAll('.dwi-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = selectAll.checked;
  });
  updateAnalysisTotal();
}

// ─── ربط الأحداث ───

function attachEvents() {
  document.getElementById('analyze-btn').addEventListener('click', analyzeRange);
  document.getElementById('select-all').addEventListener('change', handleSelectAll);
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
