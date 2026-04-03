# planner.js and api.php Findings

## planner.js

### `updatePlannerSummary` (line 216-234)
```js
var used = pActs.filter(function (a) { return a.name !== 'عمل'; }).reduce(...)
```
Activities named 'عمل' are excluded from "used" time — they are treated as "still available work time." Remaining = totalFree - non-عمل activities. This means "عمل" activities don't consume the "remaining" counter in the planner summary.

### `DEFAULT_PRESETS` (line 238-247)
'عمل' is the first and default preset:
```js
{ name: 'عمل', icon: '💼', color: '#4ecdc4' }
```
This is the preset users will most naturally reach for, and the entire app treats it as a special "work" category rather than an explicit activity label.

### `buildBarSegments` (line 79-93)
Free slots between activities get `type: 'free'`. These render as teal "free" segments in the planner bar — they are visually distinct from activities but not labeled as anything.

### Period header (line 150)
```js
html += '<span class="pl-period-dur">' + formatDuration(freeTime) + (isBedtime ? '' : ' عمل') + '</span>';
```
Shows "{duration} عمل" for each work period — "عمل" here is a suffix label on the duration display.

### No fallback name for activities
When `addActivity()` is called without a preset or custom name, it defaults to `'نشاط'` (line 547):
```js
var name = customName || 'نشاط';
```

## api.php

### Data structure per day
```json
{
  "activities": [
    { "name": "...", "icon": "...", "color": "...", "start": 480, "end": 540, "note": "..." }
  ],
  "disabledPeriods": ["work:480-660"],
  "manualBedtime": null,
  "settings": { "buffers": {...}, "bedtimeAfterIsha": 120, "timeFormat": "12" }
}
```

### Auto-init from previous day
When a new day is fetched for the first time, it inherits `settings` from the most recent previous day but starts with empty `activities` and `disabledPeriods`.

### No server-side segment typing
The API stores and returns raw activity objects. All segment type logic (work/sleep/prayer) is computed client-side in schedule.js.

### Focus data (separate file)
`focus-data.json` stores focus sessions keyed by date, then by session `id`. Focus sessions reference `activityName`, `activityIcon`, `activityColor`, `segStart`, `segEnd`.
