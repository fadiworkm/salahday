---
name: schedule.js deep dive
description: Exact logic for prayer/prep segment generation, segment object shape, window globals, renderDay pipeline
type: project
---

# schedule.js — Deep Exploration

## Initialization Flow

```
DOMContentLoaded → generateStars → ScheduleData.whenReady → loadPrayerData
  → initDateInput → loadDayFromServer → loadSettingsFromDay → attachEvents → renderDay
```

`renderDay()` is the master render function. It:
1. Reads prayer times from `PRAY_TIMES_RAW` (via `getDayData(dateStr)` / `getClosestDate()`)
2. Calls `generateDaySegments(prayerMins)` → stores result in `window._allSegments`
3. Calls `renderPrayerGrid`, `renderPentagon`, `renderDayStats`, `renderWorkBlocks`
4. `renderWorkBlocks` sets `window._workSegments` to only `type === 'work'` segments

---

## Prayer Time Parsing

`parseArabicTime(timeStr)` — parses Arabic am/pm format:
- "5:32 ص" → 332 minutes (AM)
- "1:00 م" → 780 minutes (PM)

`extractPrayerMinutes(dayData)` returns:
```js
{ fajr, sunrise, dhuhr, asr, maghrib, isha }  // all in minutes-since-midnight
```

---

## generateDaySegments(prayerMins) — Full Logic

**Input:** `prayerMins` object + `scheduleSettings.buffers` + `bedtimeMin`

**Step 1: Build occupiedRanges array**

For each prayer (fajr, dhuhr, asr, maghrib, isha — NOT sunrise):
- If `buf[prayer].before > 0`, push a `prep` segment: `[prayerTime - before, prayerTime]`
- Always push a `prayer` segment: `[prayerTime, prayerTime + after]`

Sunrise is skipped entirely — no segment, no buffer.

**`occupiedRanges` entry shape:**
```js
{ type: 'prep' | 'prayer', label: string, prayerKey: string, start: number, end: number }
```

**Labels:**
- PREP_NAMES: `{ fajr: 'تحضير للفجر', dhuhr: 'تحضير للظهر', asr: 'تحضير للعصر', maghrib: 'تحضير للمغرب', isha: 'تحضير للعشاء' }`
- PRAYER_NAMES: `{ fajr: 'صلاة الفجر', dhuhr: 'صلاة الظهر', asr: 'صلاة العصر', maghrib: 'صلاة المغرب', isha: 'صلاة العشاء' }`

**Step 2: Sort + Merge**
- Sorts by `start`
- Merges only if same `prayerKey` AND same `type` (prep+prayer from same prayer do NOT merge)
- If ranges overlap across different prayers: truncates the earlier one (`last.end = range.start`)

**Step 3: Build full day segments — fill gaps between occupied ranges**

- Initial gap (before first occupied): `type: 'sleep'` if before first prayer
- Gaps between occupied ranges:
  - If gap crosses `bedtimeMin`: split → `work` (before bedtime) + `sleep` (after bedtime)
  - If gap entirely before bedtime: `type: 'work'`, `label: 'وقت متاح'`
  - If gap entirely after bedtime: `type: 'sleep'`, `label: 'نوم'`
- Final gap (after last occupied): same bedtime split logic

**Segment object shape (final):**
```js
{
  type: 'prep' | 'prayer' | 'work' | 'sleep',
  label: string,        // Arabic label
  prayerKey: string,    // 'fajr'|'dhuhr'|...|'work'|'sleep'
  start: number,        // minutes since midnight
  end: number,
  duration: number,     // end - start
  isCurrent: boolean    // currentMinutes >= start && currentMinutes < end
}
```

**Bedtime:** `getManualBedtime(prayerMins)`:
1. If manual-bedtime input has `dataset.manual === '1'` → parse input value
2. Else if saved `dayData.manualBedtime != null` → use it
3. Else → `prayerMins.isha + scheduleSettings.bedtimeAfterIsha` (default: +120 min)

---

## window._allSegments and window._workSegments

**`window._allSegments`** — set in `renderDay()`:
```js
window._allSegments = generateDaySegments(prayerMins);
```
Contains ALL segment types: prep, prayer, work, sleep. Used by `renderDayStats`.

**`window._workSegments`** — set in `renderWorkBlocks()`:
```js
window._workSegments = segments.filter(s => s.type === 'work');
```
Contains ONLY `type === 'work'` segments. Used by planner.js via `getPlannerPeriods()`.

---

## renderDayStats(segments) — "صلاة وتحضير" Category

Day stats merges `prayer` + `prep` types into one single category:
```js
const prayerTotal = (typeTotals.prayer || 0) + (typeTotals.prep || 0);
categories.push({ name: 'صلاة وتحضير', icon: '❤️', color: '#7c6aef', duration: prayerTotal, itemClass: 'ds-item-prayer' });
```

The separate `prep` and `prayer` types only exist in `_allSegments`; in the stats UI they are combined under "صلاة وتحضير".

---

## renderWorkBlocks(segments, prayerMins) — Work Period UI

- Iterates only `type === 'work'` segments
- Period key format: `'work:' + seg.start + '-' + seg.end`
- Checks `disabledPeriods` array (stored in day data) against period key
- Each period renders:
  - Header: time range, free time, edit button (`openPlannerForPeriod(i)`)
  - Period name: `getWorkBetweenPrayers(seg, prayerMins)` → e.g. "من الفجر إلى الظهر"
  - Visual bar: free slots (`.wt-vb-free`) + activity slots (`.wt-vb-act`) using `flex` proportional sizing
  - Activity cards (`.wt-act-card`) per period
  - Focus button when period is current
  - "معطّلة" label when disabled

---

## Default Buffer Settings (from api.php defaultSettings())

```
fajr:    before: 90, after: 30
sunrise: before: 0,  after: 20   (no segments created)
dhuhr:   before: 15, after: 20
asr:     before: 15, after: 15
maghrib: before: 10, after: 20
isha:    before: 10, after: 20
bedtimeAfterIsha: 120
```

---

## PRAYER_COLORS map
```js
{ fajr: '#ff8c42', sunrise: '#ffa366', dhuhr: '#f4c430',
  asr: '#4a6cf7', maghrib: '#ff6b6b', isha: '#7c6aef',
  work: '#4ecdc4', sleep: '#3a3f6b', bedtime: '#5a4f9e' }
```
