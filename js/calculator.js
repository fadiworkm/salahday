/**
 * محرك حساب جدول النوم
 * يحسب أفضل خيارات النوم بناءً على أوقات الصلاة ودورات النوم
 * ذكي: يحاول تعظيم دورات الفترة الأولى مع مرونة في وقت الاستيقاظ قبل الفجر
 */

function calculateSleepPlan(bedtimeStr, todayDateStr, cycleDuration, preFajrBuffer, period2StartStr, flexibleWake) {
  cycleDuration = cycleDuration != null ? cycleDuration : 90;
  preFajrBuffer = preFajrBuffer != null ? preFajrBuffer : 60;
  if (flexibleWake == null) flexibleWake = true;

  const todayPrayer = getPrayerTimes(todayDateStr);
  const tomorrowDateStr = getNextDate(todayDateStr);
  const tomorrowPrayer = getPrayerTimes(tomorrowDateStr);

  const originalBedtimeMin = timeToMinutes(bedtimeStr);
  const fajrMin = timeToMinutes(tomorrowPrayer.fajr);

  // مرونة ذكية: الحد الأدنى المطلق
  const minBuffer = flexibleWake
    ? (preFajrBuffer > 0 ? Math.max(preFajrBuffer - 20, 0) : 0)
    : preFajrBuffer;

  // بداية الفترة الثانية
  const period2StartMin = period2StartStr
    ? timeToMinutes(period2StartStr)
    : roundUpTo15(fajrMin + 60);

  // تحديد أوقات النوم المرشحة
  let bedtimeCandidates;
  if (flexibleWake) {
    // الاستيقاظ المرن: تجربة تعديلات -30 إلى +30 بخطوات 5 دقائق
    const offsets = [];
    for (let o = 0; o <= 30; o += 5) {
      offsets.push(o);
      if (o !== 0) offsets.push(-o);
    }
    bedtimeCandidates = offsets.map(offset => ({
      bedtimeMin: (originalBedtimeMin + offset + 1440) % 1440,
      offset
    }));
  } else {
    bedtimeCandidates = [{ bedtimeMin: originalBedtimeMin, offset: 0 }];
  }

  // توليد جميع الخيارات الصالحة
  const options = [];
  const seenKeys = new Set();

  for (const { bedtimeMin, offset } of bedtimeCandidates) {
    const candidateBedtimeStr = minutesToTime(bedtimeMin);

    // حساب الوقت المتاح مع المرونة
    const latestWakeFlexible = fajrMin - minBuffer;
    let availableMin;
    if (bedtimeMin > latestWakeFlexible) {
      availableMin = (1440 - bedtimeMin) + latestWakeFlexible;
    } else {
      availableMin = latestWakeFlexible - bedtimeMin;
    }
    const maxCyclesP1 = Math.floor(availableMin / cycleDuration);

    const minP1 = Math.max(1, maxCyclesP1 - 3);

    for (let p1 = maxCyclesP1; p1 >= minP1; p1--) {
      let wake1Min = bedtimeMin + (p1 * cycleDuration);
      if (wake1Min >= 1440) wake1Min -= 1440;

      // حساب الوقت الفعلي قبل الفجر
      let timeBefore;
      if (wake1Min <= fajrMin) {
        timeBefore = fajrMin - wake1Min;
      } else {
        timeBefore = (1440 - wake1Min) + fajrMin;
      }

      // رفض إذا أقل من الحد الأدنى المطلق
      if (timeBefore < minBuffer) continue;

      for (let p2 = 0; p2 <= 4; p2++) {
        const totalCycles = p1 + p2;
        if (totalCycles < 4 || totalCycles > 8) continue;

        const totalMinutes = totalCycles * cycleDuration;
        let wake2Min = null;

        if (p2 > 0) {
          wake2Min = period2StartMin + (p2 * cycleDuration);
          if (wake2Min > 14 * 60) continue;
        }

        // إزالة التكرار: نفس وقت الاستيقاظ ونفس عدد الدورات
        const dedupeKey = `${minutesToTime(wake1Min)}-${p1}+${p2}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

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

        const option = {
          period1Cycles: p1,
          period2Cycles: p2,
          totalCycles,
          totalMinutes,
          bedtime: candidateBedtimeStr,
          wakeTime1: minutesToTime(wake1Min),
          sleepTime2: p2 > 0 ? minutesToTime(period2StartMin) : null,
          wakeTime2: p2 > 0 ? minutesToTime(wake2Min) : null,
          quality,
          qualityLabel,
          qualityStars,
          timeBeforeFajr: timeBefore
        };

        if (offset !== 0) {
          option.bedtimeAdjusted = true;
          option.bedtimeAdjustment = offset;
        }

        options.push(option);
      }
    }
  }

  // حساب maxCyclesP1 للوقت الأصلي (للقيمة المرجعة)
  const latestWakeRef = fajrMin - minBuffer;
  let availableRef;
  if (originalBedtimeMin > latestWakeRef) {
    availableRef = (1440 - originalBedtimeMin) + latestWakeRef;
  } else {
    availableRef = latestWakeRef - originalBedtimeMin;
  }
  const maxCyclesP1 = Math.floor(availableRef / cycleDuration);

  // ترتيب ذكي: التركيز على تعظيم دورات ما قبل الفجر
  const qualityOrder = { ideal: 0, excellent: 1, good: 2, long: 3, acceptable: 4 };
  options.sort((a, b) => {
    // الأولوية 1: الأكثر دورات في الفترة الأولى (قبل الفجر)
    if (a.period1Cycles !== b.period1Cycles) return b.period1Cycles - a.period1Cycles;

    // الأولوية 2: الأفضل جودة إجمالية
    const qDiff = qualityOrder[a.quality] - qualityOrder[b.quality];
    if (qDiff !== 0) return qDiff;

    // الأولوية 3: تفضيل الأقرب لوقت النوم الأصلي
    const aAdj = Math.abs(a.bedtimeAdjustment || 0);
    const bAdj = Math.abs(b.bedtimeAdjustment || 0);
    if (aAdj !== bAdj) return aAdj - bAdj;

    // الأولوية 4: وقت أطول قبل الفجر (أفضل)
    return b.timeBeforeFajr - a.timeBeforeFajr;
  });

  // تصفية ذكية: الاحتفاظ بأفضل الخيارات المتنوعة (حد أقصى 12)
  const filtered = [];
  const seenSplits = {};
  for (const opt of options) {
    const splitKey = `${opt.period1Cycles}+${opt.period2Cycles}`;
    const count = seenSplits[splitKey] || 0;
    // لكل تقسيم (مثل 5+0): أقصى 3 خيارات (أوقات نوم مختلفة)
    if (count >= 3) continue;
    seenSplits[splitKey] = count + 1;
    filtered.push(opt);
    if (filtered.length >= 12) break;
  }

  return {
    isha: todayPrayer.isha,
    fajr: tomorrowPrayer.fajr,
    fajrDate: tomorrowDateStr,
    latestWake: minutesToTime(fajrMin - minBuffer),
    period2Start: minutesToTime(period2StartMin),
    period2StartMin,
    options: filtered,
    recommended: filtered[0] || null,
    maxCyclesP1,
    cycleDuration,
    preFajrBuffer,
    minBuffer,
    bedtime: bedtimeStr,
    flexibleWake
  };
}

/**
 * اقتراحات النوم الذكي
 * يحترم أوقات الصلاة: 45-60 دقيقة بعد العشاء و 45-60 دقيقة بعد الفجر
 * يركز على 4-5 دورات في الفترة الأولى مع تنويع الخيارات
 */
function generateSmartSuggestions(dateStr, cycleDuration, preFajrBuffer, fixedBedtime, flexibleWake) {
  cycleDuration = cycleDuration != null ? cycleDuration : 90;
  preFajrBuffer = preFajrBuffer != null ? preFajrBuffer : 60;
  if (flexibleWake == null) flexibleWake = true;

  const prayer = getPrayerTimes(dateStr);
  const tomorrow = getPrayerTimes(getNextDate(dateStr));
  const ishaMin = timeToMinutes(prayer.isha);
  const fajrMin = timeToMinutes(tomorrow.fajr);
  const minFajrBuffer = flexibleWake
    ? (preFajrBuffer > 0 ? Math.max(preFajrBuffer - 20, 0) : 0)
    : preFajrBuffer;

  const all = [];

  // أوقات النوم المحتملة
  let bedtimeCandidates;
  if (fixedBedtime) {
    // المستخدم حدد وقت نوم معين
    const fixed = timeToMinutes(fixedBedtime);
    bedtimeCandidates = [{ bedMin: roundTo15(fixed), ishaOff: null }];
  } else {
    // هوامش بعد العشاء: 45، 60 دقيقة
    bedtimeCandidates = [45, 60].map(off => ({
      bedMin: roundUpTo15(ishaMin + off),
      ishaOff: off
    }));
  }

  // هوامش بعد الفجر: 45، 60 دقيقة
  const fajrOffsets = [45, 60];

  for (const { bedMin, ishaOff } of bedtimeCandidates) {

    // حساب الوقت المتاح
    const latestWake = fajrMin - minFajrBuffer;
    let avail;
    if (bedMin > latestWake) {
      avail = (1440 - bedMin) + latestWake;
    } else {
      avail = latestWake - bedMin;
    }
    const maxP1 = Math.floor(avail / cycleDuration);

    for (const p1 of [5, 4]) {
      if (p1 > maxP1) continue;

      let wake1 = bedMin + p1 * cycleDuration;
      if (wake1 >= 1440) wake1 -= 1440;

      let buffer;
      if (wake1 <= fajrMin) buffer = fajrMin - wake1;
      else buffer = (1440 - wake1) + fajrMin;
      if (buffer < minFajrBuffer) continue;

      for (const fajrOff of fajrOffsets) {
        const p2Start = roundUpTo15(fajrMin + fajrOff);

        for (const p2 of [0, 1, 2]) {
          const total = p1 + p2;
          if (total < 4 || total > 7) continue;

          const wake2 = p2 > 0 ? p2Start + p2 * cycleDuration : null;
          if (wake2 && wake2 > 14 * 60) continue;

          let qualityLabel;
          if (total === 5) qualityLabel = 'مثالي';
          else if (total === 6) qualityLabel = 'ممتاز';
          else if (total === 4) qualityLabel = 'جيد';
          else qualityLabel = 'طويل';

          // نقاط: دورات فترة 1 + جودة + هامش مريح قبل الفجر + وقت كافٍ بعد العشاء
          const score =
            p1 * 1000 +
            (total === 5 ? 300 : total === 6 ? 200 : total === 4 ? 100 : 50) +
            Math.min(buffer, 90) +
            (ishaOff && ishaOff >= 60 ? 30 : 0); // مكافأة لوقت أطول بعد العشاء

          all.push({
            bedtime: minutesToTime(bedMin),
            bedtimeMin: bedMin,
            wakeTime1: minutesToTime(wake1),
            p1, p2, total,
            totalMinutes: total * cycleDuration,
            sleepTime2: p2 > 0 ? minutesToTime(p2Start) : null,
            wakeTime2: wake2 ? minutesToTime(wake2) : null,
            p2StartStr: minutesToTime(p2Start),
            timeBeforeFajr: buffer,
            afterIsha: ishaOff || Math.round(((bedMin - ishaMin + 1440) % 1440)),
            afterFajr: fajrOff,
            qualityLabel,
            score
          });
        }
      }
    }
  }

  // ترتيب بالنقاط
  all.sort((a, b) => b.score - a.score);

  // اختيار 5 خيارات متنوعة (تجنب التكرار الكامل)
  const result = [];
  const seen = new Set();
  for (const s of all) {
    const key = `${s.bedtime}-${s.p1}+${s.p2}-${s.sleepTime2 || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
    if (result.length >= 5) break;
  }

  return {
    suggestions: result,
    isha: prayer.isha,
    fajr: tomorrow.fajr
  };
}
