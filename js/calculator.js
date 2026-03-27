/**
 * محرك حساب جدول النوم
 * يحسب أفضل خيارات النوم بناءً على أوقات الصلاة ودورات النوم
 */

function calculateSleepPlan(bedtimeStr, todayDateStr, cycleDuration, preFajrBuffer, period2StartStr) {
  cycleDuration = cycleDuration || 90;
  preFajrBuffer = preFajrBuffer || 60;

  const todayPrayer = getPrayerTimes(todayDateStr);
  const tomorrowDateStr = getNextDate(todayDateStr);
  const tomorrowPrayer = getPrayerTimes(tomorrowDateStr);

  const bedtimeMin = timeToMinutes(bedtimeStr);
  const fajrMin = timeToMinutes(tomorrowPrayer.fajr);
  const latestWakeMin = fajrMin - preFajrBuffer;

  // حساب الوقت المتاح للفترة الأولى (بالدقائق)
  // وقت النوم مساءً ← الاستيقاظ قبل الفجر
  let availableMin;
  if (bedtimeMin > latestWakeMin) {
    // يعبر منتصف الليل (الحالة الطبيعية: نوم مساءً، استيقاظ فجراً)
    availableMin = (1440 - bedtimeMin) + latestWakeMin;
  } else {
    availableMin = latestWakeMin - bedtimeMin;
  }

  const maxCyclesP1 = Math.floor(availableMin / cycleDuration);

  // بداية الفترة الثانية: من المدخل أو بعد الفجر بساعة (مقرب لـ 15 دقيقة)
  const period2StartMin = period2StartStr
    ? timeToMinutes(period2StartStr)
    : roundUpTo15(fajrMin + 60);

  // توليد جميع الخيارات الصالحة
  const options = [];
  const minP1 = Math.max(1, maxCyclesP1 - 3);

  for (let p1 = maxCyclesP1; p1 >= minP1; p1--) {
    // حساب وقت الاستيقاظ من الفترة الأولى
    let wake1Min = bedtimeMin + (p1 * cycleDuration);
    if (wake1Min >= 1440) wake1Min -= 1440;

    // التحقق أن الاستيقاظ قبل الفجر بالوقت الكافي
    let timeBefore;
    if (wake1Min <= fajrMin) {
      timeBefore = fajrMin - wake1Min;
    } else {
      timeBefore = (1440 - wake1Min) + fajrMin;
    }
    if (timeBefore < preFajrBuffer) continue;

    for (let p2 = 0; p2 <= 4; p2++) {
      const totalCycles = p1 + p2;
      if (totalCycles < 3 || totalCycles > 8) continue;

      const totalMinutes = totalCycles * cycleDuration;
      let wake2Min = null;

      if (p2 > 0) {
        wake2Min = period2StartMin + (p2 * cycleDuration);
        // تأكد أن الاستيقاظ الثاني لا يتجاوز الظهر
        if (wake2Min > 14 * 60) continue;
      }

      let quality, qualityLabel, qualityStars;
      if (totalCycles === 5) {
        quality = 'ideal';
        qualityLabel = 'مثالي';
        qualityStars = 3;
      } else if (totalCycles === 6) {
        quality = 'excellent';
        qualityLabel = 'ممتاز';
        qualityStars = 3;
      } else if (totalCycles === 4) {
        quality = 'good';
        qualityLabel = 'جيد';
        qualityStars = 2;
      } else if (totalCycles === 7) {
        quality = 'long';
        qualityLabel = 'طويل';
        qualityStars = 2;
      } else {
        quality = 'acceptable';
        qualityLabel = 'مقبول';
        qualityStars = 1;
      }

      options.push({
        period1Cycles: p1,
        period2Cycles: p2,
        totalCycles,
        totalMinutes,
        bedtime: bedtimeStr,
        wakeTime1: minutesToTime(wake1Min),
        sleepTime2: p2 > 0 ? minutesToTime(period2StartMin) : null,
        wakeTime2: p2 > 0 ? minutesToTime(wake2Min) : null,
        quality,
        qualityLabel,
        qualityStars,
        timeBeforeFajr: timeBefore
      });
    }
  }

  // ترتيب: الأفضل جودة أولاً، ثم الأكثر نوماً في الفترة الأولى
  const qualityOrder = { ideal: 0, excellent: 1, good: 2, long: 3, acceptable: 4 };
  options.sort((a, b) => {
    if (qualityOrder[a.quality] !== qualityOrder[b.quality]) {
      return qualityOrder[a.quality] - qualityOrder[b.quality];
    }
    return b.period1Cycles - a.period1Cycles;
  });

  return {
    isha: todayPrayer.isha,
    fajr: tomorrowPrayer.fajr,
    fajrDate: tomorrowDateStr,
    latestWake: minutesToTime(latestWakeMin),
    period2Start: minutesToTime(period2StartMin),
    period2StartMin,
    options,
    recommended: options[0] || null,
    maxCyclesP1,
    cycleDuration,
    preFajrBuffer,
    bedtime: bedtimeStr
  };
}
