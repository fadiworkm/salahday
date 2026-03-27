/**
 * بيانات أوقات الصلاة - درعا، سوريا
 * المصدر: وزارة الأوقاف
 */

const PRAYER_DATA = {
  city: 'درعا',
  country: 'سوريا',
  source: 'وزارة الأوقاف',
  times: [
    { date: '2026-03-20', fajr: '05:17', isha: '20:05' },
    { date: '2026-03-21', fajr: '05:15', isha: '20:06' },
    { date: '2026-03-22', fajr: '05:14', isha: '20:07' },
    { date: '2026-03-23', fajr: '05:14', isha: '20:07' },
    { date: '2026-03-24', fajr: '05:11', isha: '20:08' },
    { date: '2026-03-25', fajr: '05:09', isha: '20:09' },
    { date: '2026-03-26', fajr: '05:08', isha: '20:10' },
    { date: '2026-03-27', fajr: '05:07', isha: '20:11' },
    { date: '2026-03-28', fajr: '05:05', isha: '20:12' },
    { date: '2026-03-29', fajr: '05:04', isha: '20:13' },
    { date: '2026-03-30', fajr: '05:02', isha: '20:13' },
    { date: '2026-03-31', fajr: '05:01', isha: '20:14' },
    { date: '2026-04-01', fajr: '04:59', isha: '20:15' },
    { date: '2026-04-10', fajr: '04:46', isha: '20:23' },
    { date: '2026-04-20', fajr: '04:32', isha: '20:32' },
    { date: '2026-05-01', fajr: '04:17', isha: '20:43' },
    { date: '2026-05-10', fajr: '04:06', isha: '20:53' },
    { date: '2026-05-20', fajr: '03:57', isha: '21:02' },
    { date: '2026-06-01', fajr: '03:48', isha: '21:13' },
    { date: '2026-06-15', fajr: '03:45', isha: '21:21' }
  ]
};

/** تحويل وقت نصي "HH:MM" إلى دقائق من منتصف الليل */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** تحويل دقائق من منتصف الليل إلى وقت نصي "HH:MM" */
function minutesToTime(minutes) {
  let mins = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** عرض الوقت بتنسيق 12 أو 24 ساعة حسب الإعدادات */
function displayTime(timeStr) {
  if (typeof settings === 'undefined' || settings.timeFormat !== '12') return timeStr;
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** تقريب الدقائق لأعلى إلى أقرب مضاعف لـ 15 */
function roundUpTo15(minutes) {
  return Math.ceil(minutes / 15) * 15;
}

/** تقريب الدقائق لأقرب مضاعف لـ 15 */
function roundTo15(minutes) {
  return Math.round(minutes / 15) * 15;
}

/** تنسيق المدة بالساعات والدقائق */
function formatDuration(totalMinutes) {
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

/** تنسيق عدد الدورات بالعربية */
function formatCycles(n) {
  if (n === 0) return 'لا دورات';
  if (n === 1) return 'دورة واحدة';
  if (n === 2) return 'دورتان';
  if (n >= 3 && n <= 10) return `${n} دورات`;
  return `${n} دورة`;
}

/** الحصول على تاريخ اليوم التالي */
function getNextDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/** الحصول على أوقات الصلاة لتاريخ معين (مع الاستيفاء الخطي) */
function getPrayerTimes(dateStr) {
  const times = PRAYER_DATA.times;

  // بحث عن تطابق مباشر
  const exact = times.find(t => t.date === dateStr);
  if (exact) return { fajr: exact.fajr, isha: exact.isha };

  // استيفاء خطي بين أقرب تاريخين
  const target = new Date(dateStr + 'T12:00:00').getTime();
  let beforeIdx = -1;
  let afterIdx = -1;

  for (let i = 0; i < times.length; i++) {
    const d = new Date(times[i].date + 'T12:00:00').getTime();
    if (d <= target) beforeIdx = i;
    if (d >= target && afterIdx === -1) afterIdx = i;
  }

  // حالات الحدود
  if (beforeIdx === -1) return { fajr: times[0].fajr, isha: times[0].isha };
  if (afterIdx === -1) {
    const last = times[times.length - 1];
    return { fajr: last.fajr, isha: last.isha };
  }
  if (beforeIdx === afterIdx) {
    return { fajr: times[beforeIdx].fajr, isha: times[beforeIdx].isha };
  }

  const before = times[beforeIdx];
  const after = times[afterIdx];
  const bTime = new Date(before.date + 'T12:00:00').getTime();
  const aTime = new Date(after.date + 'T12:00:00').getTime();
  const fraction = (target - bTime) / (aTime - bTime);

  const fajrMin = Math.round(
    timeToMinutes(before.fajr) + fraction * (timeToMinutes(after.fajr) - timeToMinutes(before.fajr))
  );
  const ishaMin = Math.round(
    timeToMinutes(before.isha) + fraction * (timeToMinutes(after.isha) - timeToMinutes(before.isha))
  );

  return { fajr: minutesToTime(fajrMin), isha: minutesToTime(ishaMin) };
}
