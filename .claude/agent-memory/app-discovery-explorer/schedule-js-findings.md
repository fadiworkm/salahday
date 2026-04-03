# schedule.js Findings

## Segment Generation (`generateDaySegments`)

All free time between occupied ranges (prayer + prep buffers) is classified as either `work` or `sleep` based purely on whether it falls before or after `bedtimeMin`:

```js
// gap before bedtime → type: 'work', label: 'وقت عمل'
// gap after bedtime  → type: 'sleep', label: 'نوم'
```

There are 4 push sites (lines ~303, 307, 318, 322). The label 'وقت عمل' and type 'work' are hardcoded for ALL free time before bedtime. There is NO concept of "unassigned" — every free slot is a work segment.

## `window._workSegments` and `window._allSegments`

Set inside `renderWorkBlocks` (line ~867):
```js
window._workSegments = workSegments;  // segments where type === 'work'
window._allSegments = segments;       // all generated segments
```

`planner.js` reads `window._workSegments` to determine which periods to show in the planner UI.

## Day Stats (`renderDayStats` + `exportDayStatsJSON`)

The key logic (lines 580–621):
1. Sums segment durations by type (sleep, prayer, prep, work).
2. Iterates `planActivities` (from ScheduleData):
   - If `act.name === 'عمل'` → adds duration to `activityWorkTime` (counted as work)
   - Otherwise → goes into `activityMap` as a separate named category
3. Calculates `workActivityTime` = all activities that fall inside any work segment (regardless of name)
4. `remainingWork = max(0, typeTotals.work - workActivityTime) + activityWorkTime`
   - This is the "عمل" bucket shown in stats — it equals: all work-segment time that has no activities, PLUS all activities named "عمل"

**Problem**: Any unassigned time in a work segment automatically counts toward "عمل" in the stats display.

## `renderWorkBlocks` — "free time" calculation

Line 892: `usedTime = periodActs.filter(a => a.name !== 'عمل').reduce(...)` — activities named "عمل" are explicitly excluded from usedTime, so they are treated as "still free/work time."

Line 908: The header displays `${formatDuration(freeTime)} عمل` — this is the work time header shown on each period block.

Line 917-918: Progress bar computation also excludes "عمل"-named activities: `nonWorkActs = periodActs.filter(a => a.name !== 'عمل')`.

Line 1066: Same pattern for the top progress bar.

Line 1564, 1582: Same pattern in `_workSegments` rendering.

## Focus Session Fallback (line 650)

```js
const catName = matchedCat ? matchedCat.name : 'عمل';
```
Unmatched focus sessions fall back to the "عمل" category.

## Where `'وقت عمل'` appears as label for focus mode button (line 1042):
```js
openFocusMode('...', seg.start, seg.end, 'وقت عمل', '🎯', '#7c6aef')
```
When no active activity exists in the current period, the focus button opens with label 'وقت عمل'.
