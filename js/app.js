/**
 * التطبيق الرئيسي - واجهة المستخدم والتفاعلات
 */

let currentPlan = null;
let selectedOption = null;
let settings = {
  cycleDuration: 90,
  preFajrBuffer: 60
};

// ─── التهيئة ───
document.addEventListener('DOMContentLoaded', () => {
  generateStars();
  initDefaults();
  attachEvents();
  loadSettings();
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

function attachEvents() {
  document.getElementById('date-input').addEventListener('change', () => {
    updatePrayerDisplay();
    updateBedtimeDefault();
    hideResults();
  });
  document.getElementById('bedtime-input').addEventListener('change', hideResults);
  document.getElementById('calculate-btn').addEventListener('click', onCalculate);
  document.getElementById('btn-now').addEventListener('click', setCurrentTime);

  // تغيير وقت بدء الفترة الثانية → إعادة حساب
  document.getElementById('period2-start-input').addEventListener('change', onPeriod2StartChange);

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
}

// ─── عرض أوقات الصلاة ───
function updatePrayerDisplay() {
  const dateStr = document.getElementById('date-input').value;
  if (!dateStr) return;

  const todayPrayer = getPrayerTimes(dateStr);
  const tomorrowPrayer = getPrayerTimes(getNextDate(dateStr));

  document.getElementById('isha-time').textContent = todayPrayer.isha;
  document.getElementById('fajr-time').textContent = tomorrowPrayer.fajr;
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
  setTimeout(() => {
    if (!results.classList.contains('visible')) {
      results.style.display = 'none';
    }
  }, 600);
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

  const bedMin = timeToMinutes(opt.bedtime);
  const wake1Min = timeToMinutes(opt.wakeTime1);
  const fajrMin = timeToMinutes(plan.fajr);
  const sleep2Min = opt.period2Cycles > 0 ? plan.period2StartMin : null;
  const wake2Min = opt.wakeTime2 ? timeToMinutes(opt.wakeTime2) : null;

  // تطبيع الأوقات بالنسبة لوقت النوم
  function norm(t) {
    let diff = t - bedMin;
    if (diff < 0) diff += 1440;
    return diff;
  }

  const endMin = wake2Min ? norm(wake2Min) : norm(fajrMin) + 120;
  const total = endMin;

  function pct(duration) {
    return (duration / total * 100).toFixed(2) + '%';
  }

  // بناء الأجزاء
  const segments = [];

  // الفترة 1: نوم
  const sleep1Dur = norm(wake1Min);
  segments.push({
    width: pct(sleep1Dur),
    cls: 'seg-sleep',
    label: 'نوم',
    startTime: opt.bedtime,
    endTime: opt.wakeTime1
  });

  // فترة اليقظة قبل الفجر
  const awakeDur = norm(fajrMin) - norm(wake1Min);
  segments.push({
    width: pct(awakeDur),
    cls: 'seg-awake',
    label: 'يقظة وعبادة',
    startTime: opt.wakeTime1,
    endTime: plan.fajr
  });

  if (opt.period2Cycles > 0) {
    // فترة الصلاة والانتظار
    const prayerDur = norm(sleep2Min) - norm(fajrMin);
    segments.push({
      width: pct(prayerDur),
      cls: 'seg-prayer',
      label: 'صلاة الفجر',
      startTime: plan.fajr,
      endTime: opt.sleepTime2
    });

    // الفترة 2: نوم
    const sleep2Dur = norm(wake2Min) - norm(sleep2Min);
    segments.push({
      width: pct(sleep2Dur),
      cls: 'seg-sleep2',
      label: 'نوم',
      startTime: opt.sleepTime2,
      endTime: opt.wakeTime2
    });
  } else {
    // لا نوم بعد الفجر
    const restDur = endMin - norm(fajrMin);
    segments.push({
      width: pct(restDur),
      cls: 'seg-prayer',
      label: 'صلاة الفجر',
      startTime: plan.fajr,
      endTime: ''
    });
  }

  let html = '<div class="timeline-wrapper" dir="ltr">';
  html += '<div class="timeline-bar">';
  segments.forEach(seg => {
    html += `
      <div class="timeline-segment ${seg.cls}" style="flex: ${(parseFloat(seg.width))}">
        <div class="seg-inner">
          <div class="seg-label">${seg.label}</div>
        </div>
      </div>`;
  });
  html += '</div>';

  // صف الأوقات تحت الشريط
  html += '<div class="timeline-labels">';
  const allTimes = [];
  allTimes.push({ time: opt.bedtime, label: 'النوم', cls: 'lbl-sleep' });
  allTimes.push({ time: opt.wakeTime1, label: 'استيقاظ', cls: 'lbl-wake' });
  allTimes.push({ time: plan.fajr, label: 'الفجر', cls: 'lbl-fajr' });
  if (opt.period2Cycles > 0) allTimes.push({ time: plan.period2Start, label: 'النوم', cls: 'lbl-sleep2' });
  if (opt.wakeTime2) allTimes.push({ time: opt.wakeTime2, label: 'استيقاظ', cls: 'lbl-wake2' });

  allTimes.forEach(t => {
    const pos = (norm(timeToMinutes(t.time)) / total * 100).toFixed(2);
    html += `
      <div class="timeline-label ${t.cls}" style="left: ${pos}%">
        <div class="tl-line"></div>
        <div class="tl-time">${t.time}</div>
        <div class="tl-name">${t.label}</div>
      </div>`;
  });
  html += '</div></div>';

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
        <div class="info-value">${opt.bedtime}</div>
      </div>
      <div class="info-item">
        <div class="info-icon wake-icon"></div>
        <div class="info-label">وقت الاستيقاظ</div>
        <div class="info-value">${opt.wakeTime1}</div>
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
        <div class="info-value">${opt.wakeTime2}</div>
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
}

function saveSettings() {
  settings.cycleDuration = parseInt(document.getElementById('cycle-duration').value);
  settings.preFajrBuffer = parseInt(document.getElementById('pre-fajr-buffer').value);
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
