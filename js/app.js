/**
 * التطبيق الرئيسي - واجهة المستخدم والتفاعلات
 */

let currentPlan = null;
let selectedOption = null;
let settings = {
  cycleDuration: 90,
  preFajrBuffer: 60,
  timeFormat: '24'  // '24' أو '12'
};

// ─── التهيئة ───
document.addEventListener('DOMContentLoaded', () => {
  generateStars();
  loadSettings();   // تحميل الإعدادات أولاً (بما فيها تنسيق الوقت)
  initDefaults();
  attachEvents();
});

function initDefaults() {
  // تاريخ اليوم
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  document.getElementById('date-input').value = dateStr;

  // وقت النوم الافتراضي: بعد العشاء بساعة (مقرب لأعلى لـ 15 دقيقة)
  updateBedtimeDefault();
  updatePrayerDisplay();
}

/** حساب وقت النوم الافتراضي بعد العشاء */
function updateBedtimeDefault() {
  const dateStr = document.getElementById('date-input').value;
  if (!dateStr) return;

  const prayer = getPrayerTimes(dateStr);
  const ishaMin = timeToMinutes(prayer.isha);
  const defaultBedtime = roundUpTo15(ishaMin + 60);
  document.getElementById('bedtime-input').value = minutesToTime(defaultBedtime);
}

/** ضبط الوقت الحالي (مقرب لأقرب 15 دقيقة للأمام) */
function setCurrentTime() {
  const now = new Date();
  let mins = now.getHours() * 60 + now.getMinutes();
  mins = roundUpTo15(mins);
  document.getElementById('bedtime-input').value = minutesToTime(mins);
  hideResults();
}

/** ضبط الوقت الحالي لبدء الفترة الثانية */
function setCurrentTimeP2() {
  const now = new Date();
  let mins = now.getHours() * 60 + now.getMinutes();
  mins = roundUpTo15(mins);
  document.getElementById('period2-start-input').value = minutesToTime(mins);
  onPeriod2StartChange();
}

function attachEvents() {
  document.getElementById('date-input').addEventListener('change', () => {
    updatePrayerDisplay();
    updateBedtimeDefault();
    hideResults();
  });
  document.getElementById('bedtime-input').addEventListener('change', hideResults);
  document.getElementById('calculate-btn').addEventListener('click', onCalculate);
  document.getElementById('btn-now').addEventListener('click', setCurrentTime);
  document.getElementById('smart-btn').addEventListener('click', onSmartSleep);
  document.getElementById('smart-recalc').addEventListener('click', onSmartSleep);

  // تغيير وقت بدء الفترة الثانية → إعادة حساب
  document.getElementById('period2-start-input').addEventListener('change', onPeriod2StartChange);
  document.getElementById('btn-now-p2').addEventListener('click', setCurrentTimeP2);

  // الإعدادات
  document.getElementById('settings-toggle').addEventListener('click', openSettings);
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });

  const cycleDurationInput = document.getElementById('cycle-duration');
  const preFajrInput = document.getElementById('pre-fajr-buffer');

  cycleDurationInput.addEventListener('input', () => {
    document.getElementById('cycle-duration-value').textContent = cycleDurationInput.value;
  });
  preFajrInput.addEventListener('input', () => {
    document.getElementById('pre-fajr-buffer-value').textContent = preFajrInput.value;
  });

  // أزرار تبديل تنسيق الوقت
  document.querySelectorAll('#time-format-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#time-format-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.timeFormat = btn.dataset.value;
    });
  });
}

// ─── عرض أوقات الصلاة ───
function updatePrayerDisplay() {
  const dateStr = document.getElementById('date-input').value;
  if (!dateStr) return;

  const todayPrayer = getPrayerTimes(dateStr);
  const tomorrowPrayer = getPrayerTimes(getNextDate(dateStr));

  document.getElementById('isha-time').textContent = displayTime(todayPrayer.isha);
  document.getElementById('fajr-time').textContent = displayTime(tomorrowPrayer.fajr);
  document.getElementById('fajr-date-label').textContent = formatArabicDate(getNextDate(dateStr));

  // إعادة تعيين وقت بدء الفترة الثانية للافتراضي
  const fajrMin = timeToMinutes(tomorrowPrayer.fajr);
  document.getElementById('period2-start-input').value = minutesToTime(roundUpTo15(fajrMin + 60));
}

function formatArabicDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ar-SY', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── الحساب ───
function onCalculate() {
  const dateStr = document.getElementById('date-input').value;
  const bedtime = document.getElementById('bedtime-input').value;

  if (!dateStr || !bedtime) return;

  // تحقق أن وقت النوم بعد العشاء
  const prayer = getPrayerTimes(dateStr);
  const bedMin = timeToMinutes(bedtime);
  const ishaMin = timeToMinutes(prayer.isha);

  // أوقات بين الصباح والعشاء ليست صالحة للنوم بعد العشاء
  if (bedMin >= 6 * 60 && bedMin < ishaMin) {
    showWarning('وقت النوم يجب أن يكون بعد صلاة العشاء (' + prayer.isha + ')');
    return;
  }

  // قراءة وقت بدء الفترة الثانية (إن كان معيّناً من المستخدم)
  const p2Input = document.getElementById('period2-start-input');
  const period2Start = p2Input.value || null;

  currentPlan = calculateSleepPlan(bedtime, dateStr, settings.cycleDuration, settings.preFajrBuffer, period2Start);

  if (!currentPlan.recommended) {
    showWarning('لا يوجد وقت كافٍ لدورة نوم واحدة على الأقل. حاول النوم مبكراً.');
    return;
  }

  // تحديث حقل بدء الفترة الثانية بالقيمة المحسوبة (أول مرة فقط)
  if (!period2Start) {
    p2Input.value = currentPlan.period2Start;
  }

  selectedOption = currentPlan.recommended;
  renderResults();
}

/** عند تغيير وقت بدء الفترة الثانية */
function onPeriod2StartChange() {
  if (!currentPlan) return;

  const p2Input = document.getElementById('period2-start-input');
  let p2Min = timeToMinutes(p2Input.value);
  // تقريب لأقرب 15 دقيقة
  p2Min = roundTo15(p2Min);
  p2Input.value = minutesToTime(p2Min);

  const dateStr = document.getElementById('date-input').value;
  const bedtime = document.getElementById('bedtime-input').value;

  // حفظ الخيار الحالي لمحاولة إعادة اختياره
  const prevP1 = selectedOption ? selectedOption.period1Cycles : null;
  const prevP2 = selectedOption ? selectedOption.period2Cycles : null;

  currentPlan = calculateSleepPlan(bedtime, dateStr, settings.cycleDuration, settings.preFajrBuffer, p2Input.value);

  if (!currentPlan.recommended) {
    selectedOption = null;
    return;
  }

  // محاولة إعادة اختيار نفس التقسيم
  const sameOpt = currentPlan.options.find(o => o.period1Cycles === prevP1 && o.period2Cycles === prevP2);
  selectedOption = sameOpt || currentPlan.recommended;

  renderTimeline();
  renderPeriod2();
  renderSummary();
  renderOptions();
}

function showWarning(msg) {
  const el = document.getElementById('warning-msg');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function hideResults() {
  const results = document.getElementById('results');
  results.classList.remove('visible');
  document.getElementById('smart-section').style.display = 'none';
  setTimeout(() => {
    if (!results.classList.contains('visible')) {
      results.style.display = 'none';
    }
  }, 600);
}

// ─── النوم الذكي ───
function onSmartSleep() {
  const dateStr = document.getElementById('date-input').value;
  if (!dateStr) return;

  // إخفاء النتائج السابقة فقط (لا إخفاء قسم الذكي)
  const results = document.getElementById('results');
  results.classList.remove('visible');
  setTimeout(() => {
    if (!results.classList.contains('visible')) results.style.display = 'none';
  }, 600);

  const smartBed = document.getElementById('smart-bedtime').value || null;
  const result = generateSmartSuggestions(dateStr, settings.cycleDuration, settings.preFajrBuffer, smartBed);
  renderSmartTable(result);
}

function renderSmartTable(result) {
  const section = document.getElementById('smart-section');
  const tbody = document.getElementById('smart-tbody');

  if (!result.suggestions.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted)">لا توجد اقتراحات متاحة</td></tr>';
    section.style.display = '';
    return;
  }

  let html = '';
  result.suggestions.forEach((s, i) => {
    const qClass = s.total === 5 ? 'q-ideal' : s.total === 6 ? 'q-excellent' : s.total === 4 ? 'q-good' : 'q-long';
    const totalH = (s.totalMinutes / 60);
    const totalDisplay = totalH % 1 === 0 ? totalH + ' س' : totalH.toFixed(1) + ' س';
    const p2Text = s.p2 > 0 ? formatCycles(s.p2) : '—';

    html += `
      <tr onclick="pickSmartOption(${i})" data-index="${i}">
        <td class="td-time">${displayTime(s.bedtime)}</td>
        <td class="td-time">${displayTime(s.wakeTime1)}</td>
        <td class="td-cycles">${s.p1} دورات</td>
        <td class="td-cycles2">${p2Text}</td>
        <td class="td-total">${totalDisplay}</td>
        <td class="td-quality ${qClass}">${s.qualityLabel}</td>
        <td><button class="btn-pick" onclick="event.stopPropagation(); pickSmartOption(${i})">اختيار</button></td>
      </tr>`;
  });

  tbody.innerHTML = html;
  section.style.display = '';

  // store suggestions for picking
  window._smartSuggestions = result;

  requestAnimationFrame(() => {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function pickSmartOption(index) {
  const s = window._smartSuggestions.suggestions[index];
  if (!s) return;

  // تعبئة وقت النوم ووقت بدء الفترة الثانية
  document.getElementById('bedtime-input').value = s.bedtime;
  document.getElementById('period2-start-input').value = s.p2StartStr || s.sleepTime2 || '';

  // إخفاء الاقتراحات
  document.getElementById('smart-section').style.display = 'none';

  // حساب
  onCalculate();
}

// ─── عرض النتائج ───
function renderResults() {
  const results = document.getElementById('results');
  results.style.display = '';

  renderTimeline();
  renderPeriod1();
  renderPeriod2();
  renderSummary();
  renderOptions();

  // تأخير صغير للتأثير الحركي
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      results.classList.add('visible');
    });
  });

  // تمرير سلس للنتائج
  setTimeout(() => {
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ─── الجدول الزمني ───
function renderTimeline() {
  const container = document.getElementById('timeline');
  const opt = selectedOption;
  const plan = currentPlan;

  const ishaMin = timeToMinutes(plan.isha);
  const bedMin = timeToMinutes(opt.bedtime);
  const wake1Min = timeToMinutes(opt.wakeTime1);
  const fajrMin = timeToMinutes(plan.fajr);
  const sleep2Min = opt.period2Cycles > 0 ? plan.period2StartMin : null;
  const wake2Min = opt.wakeTime2 ? timeToMinutes(opt.wakeTime2) : null;

  // تطبيع بالنسبة لوقت العشاء (بداية الجدول)
  function norm(t) {
    let diff = t - ishaMin;
    if (diff < 0) diff += 1440;
    return diff;
  }

  const endMin = wake2Min ? norm(wake2Min) : norm(fajrMin) + 120;
  const total = endMin;

  // بناء الأجزاء
  const segments = [];
  const cycleDur = plan.cycleDuration;

  // فترة ما بعد العشاء (قبل النوم)
  const ishaToSleepDur = norm(bedMin);
  if (ishaToSleepDur > 0) {
    segments.push({
      flex: ishaToSleepDur,
      cls: 'seg-isha',
      label: 'بعد العشاء',
      sub: formatDuration(ishaToSleepDur),
      cycles: 0
    });
  }

  // الفترة 1: نوم
  const sleep1Dur = norm(wake1Min) - norm(bedMin);
  segments.push({
    flex: sleep1Dur,
    cls: 'seg-sleep',
    label: formatCycles(opt.period1Cycles),
    sub: formatDuration(opt.period1Cycles * cycleDur),
    cycles: opt.period1Cycles
  });

  // فترة اليقظة قبل الفجر
  const awakeDur = norm(fajrMin) - norm(wake1Min);
  segments.push({
    flex: awakeDur,
    cls: 'seg-awake',
    label: 'يقظة وعبادة',
    sub: formatDuration(awakeDur),
    cycles: 0
  });

  if (opt.period2Cycles > 0) {
    const prayerDur = norm(sleep2Min) - norm(fajrMin);
    segments.push({
      flex: prayerDur,
      cls: 'seg-prayer',
      label: 'صلاة',
      sub: '',
      cycles: 0
    });

    const sleep2Dur = norm(wake2Min) - norm(sleep2Min);
    segments.push({
      flex: sleep2Dur,
      cls: 'seg-sleep2',
      label: formatCycles(opt.period2Cycles),
      sub: formatDuration(opt.period2Cycles * cycleDur),
      cycles: opt.period2Cycles
    });
  } else {
    const restDur = endMin - norm(fajrMin);
    segments.push({
      flex: restDur,
      cls: 'seg-prayer',
      label: 'صباح',
      sub: '',
      cycles: 0
    });
  }

  // ─── أفقي (سطح المكتب) ───
  let html = '<div class="timeline-horizontal">';
  html += '<div class="timeline-bar">';
  segments.forEach(seg => {
    const dots = seg.cycles > 0
      ? '<span class="seg-dots">' + '●'.repeat(seg.cycles) + '</span>'
      : '';
    html += `
      <div class="timeline-segment ${seg.cls}" style="flex: ${seg.flex}">
        <div class="seg-inner">
          ${dots}
          <div class="seg-label">${seg.label}</div>
          ${seg.sub ? '<div class="seg-sub">' + seg.sub + '</div>' : ''}
        </div>
      </div>`;
  });
  html += '</div>';

  html += '<div class="timeline-labels">';
  const allTimes = [];
  allTimes.push({ time: plan.isha, label: 'العشاء', cls: 'lbl-isha' });
  allTimes.push({ time: opt.bedtime, label: 'النوم', cls: 'lbl-sleep' });
  allTimes.push({ time: opt.wakeTime1, label: 'استيقاظ', cls: 'lbl-wake' });
  allTimes.push({ time: plan.fajr, label: 'الفجر', cls: 'lbl-fajr' });
  if (opt.period2Cycles > 0) allTimes.push({ time: plan.period2Start, label: 'النوم', cls: 'lbl-sleep2' });
  if (opt.wakeTime2) allTimes.push({ time: opt.wakeTime2, label: 'استيقاظ', cls: 'lbl-wake2' });

  allTimes.forEach(t => {
    const pos = (norm(timeToMinutes(t.time)) / total * 100).toFixed(2);
    html += `
      <div class="timeline-label ${t.cls}" style="right: ${pos}%">
        <div class="tl-line"></div>
        <div class="tl-time">${displayTime(t.time)}</div>
        <div class="tl-name">${t.label}</div>
      </div>`;
  });
  html += '</div></div>';

  // ─── عمودي (موبايل) ───
  const vtlSteps = [
    { time: plan.isha, name: 'صلاة العشاء', fajr: false, isha: true },
    { period: true, cls: 'vtl-p-isha', label: 'بعد العشاء', detail: formatDuration(ishaToSleepDur), cycles: 0 },
    { time: opt.bedtime, name: 'بدء النوم', fajr: false },
    { period: true, cls: 'vtl-p-sleep', label: formatCycles(opt.period1Cycles), detail: formatDuration(opt.period1Cycles * cycleDur), cycles: opt.period1Cycles, sleep: true },
    { time: opt.wakeTime1, name: 'استيقاظ', fajr: false },
    { period: true, cls: 'vtl-p-awake', label: 'يقظة وعبادة', detail: formatDuration(awakeDur), cycles: 0 },
    { time: plan.fajr, name: 'صلاة الفجر', fajr: true }
  ];

  if (opt.period2Cycles > 0) {
    vtlSteps.push(
      { period: true, cls: 'vtl-p-prayer', label: 'صلاة وأذكار', detail: '', cycles: 0 },
      { time: plan.period2Start, name: 'بدء النوم', fajr: false },
      { period: true, cls: 'vtl-p-sleep2', label: formatCycles(opt.period2Cycles), detail: formatDuration(opt.period2Cycles * cycleDur), cycles: opt.period2Cycles, sleep: true },
      { time: opt.wakeTime2, name: 'استيقاظ نهائي', fajr: false }
    );
  }

  html += '<div class="vtl">';
  vtlSteps.forEach(step => {
    if (step.period) {
      const dots = step.cycles > 0
        ? '<div class="vtl-info-dots">' + '●'.repeat(step.cycles) + '</div>'
        : '';
      html += `
        <div class="vtl-period ${step.cls}">
          <div class="vtl-bar"></div>
          <div class="vtl-info">
            ${dots}
            <div class="vtl-info-label">${step.label}</div>
            ${step.detail ? '<div class="vtl-info-detail">' + step.detail + '</div>' : ''}
          </div>
        </div>`;
    } else {
      const evCls = step.fajr ? 'vtl-event-fajr' : step.isha ? 'vtl-event-isha' : '';
      html += `
        <div class="vtl-event ${evCls}">
          <div class="vtl-time">${displayTime(step.time)}</div>
          <div class="vtl-dot"></div>
          <div class="vtl-evname">${step.name}</div>
        </div>`;
    }
  });
  html += '</div>';

  container.innerHTML = html;
}

// ─── بطاقة الفترة الأولى ───
function renderPeriod1() {
  const el = document.getElementById('period1-details');
  const opt = selectedOption;

  el.innerHTML = `
    <div class="period-info-grid">
      <div class="info-item">
        <div class="info-icon sleep-icon"></div>
        <div class="info-label">وقت النوم</div>
        <div class="info-value">${displayTime(opt.bedtime)}</div>
      </div>
      <div class="info-item">
        <div class="info-icon wake-icon"></div>
        <div class="info-label">وقت الاستيقاظ</div>
        <div class="info-value">${displayTime(opt.wakeTime1)}</div>
      </div>
    </div>
    <div class="cycles-display">
      <div class="cycles-dots">
        ${Array(opt.period1Cycles).fill('<span class="cycle-dot"></span>').join('')}
      </div>
      <div class="cycles-text">${formatCycles(opt.period1Cycles)}</div>
      <div class="cycles-duration">${formatDuration(opt.period1Cycles * currentPlan.cycleDuration)}</div>
    </div>
    <div class="fajr-note">
      الاستيقاظ قبل الفجر بـ ${formatDuration(opt.timeBeforeFajr)}
    </div>`;
}

// ─── بطاقة الفترة الثانية ───
function renderPeriod2() {
  const el = document.getElementById('period2-details');
  const opt = selectedOption;

  if (opt.period2Cycles === 0) {
    el.innerHTML = `
      <div class="no-period2">
        <p>لا نوم في الفترة الثانية لهذا الخيار</p>
        <p class="text-muted">يمكنك اختيار خيار آخر يتضمن نوماً بعد الفجر</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="period-info-grid">
      <div class="info-item">
        <div class="info-icon wake-icon2"></div>
        <div class="info-label">وقت الاستيقاظ</div>
        <div class="info-value">${displayTime(opt.wakeTime2)}</div>
      </div>
    </div>
    <div class="cycles-display">
      <div class="cycles-dots period2-dots">
        ${Array(opt.period2Cycles).fill('<span class="cycle-dot dot-sunrise"></span>').join('')}
      </div>
      <div class="cycles-text">${formatCycles(opt.period2Cycles)}</div>
      <div class="cycles-duration">${formatDuration(opt.period2Cycles * currentPlan.cycleDuration)}</div>
    </div>`;
}

// ─── الملخص ───
function renderSummary() {
  const el = document.getElementById('summary');
  const opt = selectedOption;

  const stars = '&#9733;'.repeat(opt.qualityStars) + '&#9734;'.repeat(3 - opt.qualityStars);

  el.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-value">${formatDuration(opt.totalMinutes)}</div>
        <div class="summary-label">إجمالي النوم</div>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-item">
        <div class="summary-value">${formatCycles(opt.totalCycles)}</div>
        <div class="summary-label">دورات النوم</div>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-item">
        <div class="summary-value quality-${opt.quality}">
          <span class="quality-stars">${stars}</span>
          ${opt.qualityLabel}
        </div>
        <div class="summary-label">جودة النوم</div>
      </div>
    </div>`;
}

// ─── خيارات أخرى ───
function renderOptions() {
  const el = document.getElementById('options-grid');
  const plan = currentPlan;

  if (plan.options.length <= 1) {
    el.innerHTML = '<p class="text-muted text-center">لا توجد خيارات أخرى متاحة</p>';
    return;
  }

  let html = '';
  plan.options.forEach((opt, i) => {
    const isSelected = opt === selectedOption;
    const totalHours = (opt.totalMinutes / 60);
    const hoursDisplay = totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1);

    html += `
      <button class="option-card ${isSelected ? 'option-selected' : ''} quality-border-${opt.quality}"
              onclick="selectOption(${i})" aria-label="اختيار ${opt.period1Cycles} + ${opt.period2Cycles}">
        <div class="option-split">${opt.period1Cycles} + ${opt.period2Cycles}</div>
        <div class="option-total">${hoursDisplay} ساعة</div>
        <div class="option-quality quality-${opt.quality}">${opt.qualityLabel}</div>
        ${isSelected ? '<div class="option-check">&#10003;</div>' : ''}
      </button>`;
  });

  el.innerHTML = html;
}

function selectOption(index) {
  selectedOption = currentPlan.options[index];
  renderTimeline();
  renderPeriod1();
  renderPeriod2();
  renderSummary();
  renderOptions();
}

// ─── الإعدادات ───
function loadSettings() {
  const saved = localStorage.getItem('sleepCalcSettings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      settings = { ...settings, ...parsed };
    } catch (e) { /* تجاهل */ }
  }
  document.getElementById('cycle-duration').value = settings.cycleDuration;
  document.getElementById('cycle-duration-value').textContent = settings.cycleDuration;
  document.getElementById('pre-fajr-buffer').value = settings.preFajrBuffer;
  document.getElementById('pre-fajr-buffer-value').textContent = settings.preFajrBuffer;

  // تحديث زر تنسيق الوقت
  document.querySelectorAll('#time-format-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === settings.timeFormat);
  });
}

function saveSettings() {
  settings.cycleDuration = parseInt(document.getElementById('cycle-duration').value);
  settings.preFajrBuffer = parseInt(document.getElementById('pre-fajr-buffer').value);
  // timeFormat is already updated live via toggle click
  localStorage.setItem('sleepCalcSettings', JSON.stringify(settings));
}

function openSettings() {
  document.getElementById('settings-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSettings() {
  saveSettings();
  document.getElementById('settings-overlay').classList.remove('active');
  document.body.style.overflow = '';

  // تحديث عرض أوقات الصلاة بالتنسيق الجديد
  updatePrayerDisplay();

  // إعادة الحساب إن كانت هناك نتائج
  if (currentPlan) onCalculate();
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
