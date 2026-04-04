---
name: planner.js deep dive
description: Activity CRUD, dialog lifecycle, data structure, bar rendering, preset management, window._workSegments relationship
type: project
---

# planner.js — Deep Exploration

## Module-Level State

```js
let currentFormWorkIndex = null;    // index into getPlannerPeriods() array
let selectedPreset = null;          // { name, icon, color }
let editingActivityIndex = null;    // global index into getDayActivities() array; null = create mode
let currentPlannerFilter = null;    // null = show all periods, number = show one period
```

---

## Data Access Layer

All data lives in `ScheduleData` (data-api.js). Planner accesses it via:

```js
getDayPlan()        // ScheduleData.getDayOrDefault(date) → { activities, disabledPeriods, manualBedtime, settings }
getDayActivities()  // getDayPlan().activities → Activity[]
getDisabledPeriods() // getDayPlan().disabledPeriods → string[]
savePlannerData()   // ScheduleData.saveDay(date)
```

---

## Activity Object Structure

```js
{
  name: string,    // activity name (Arabic)
  icon: string,    // emoji
  color: string,   // hex color string
  start: number,   // minutes since midnight
  end: number,     // minutes since midnight
  note: string     // optional freetext note (may be absent or '')
}
```

Example from schedule-data.json:
```json
{ "name": "عمل", "icon": "💼", "color": "#4ecdc4", "start": 1235, "end": 1335, "note": "مكالمة" }
```

---

## Periods (from window._workSegments)

`getPlannerPeriods()` maps `window._workSegments` to period objects:
```js
{ type: 'work', index: i, start, end, duration, label: 'وقت متاح' }
```

Period key (for disabledPeriods array): `'work:' + period.start + '-' + period.end`

---

## Planner Modal Lifecycle

**Open full planner:** `openPlanner()` → `renderPlanner(null)` → shows `#planner-overlay`
**Open for specific period:** `openPlannerForPeriod(periodIdx)` → `renderPlanner(periodIdx)` → same overlay
**Close:** `closePlanner()` → saves data → removes `active` class → calls `updateMainWorkBlocks()` (which calls `renderDay()`)

---

## renderPlanner(onlyPeriodIdx)

For each period (or single filtered period):
1. Filters activities to those within period bounds: `a.start >= period.start && a.end <= period.end`
2. Calls `buildBarSegments(period, periodActs)` to create bar segment array
3. Renders period HTML:
   - `.pl-period` wrapper (+ `.pl-period-disabled` if disabled)
   - `.pl-period-header` with checkbox, icon, time range, free time
   - `.pl-bar-wrap > .pl-bar` with visual segments:
     - Free slots: `.pl-segment.pl-seg-work` (or `pl-seg-bedtime`) — clickable → `onBarFreeClick(pIdx, start)`
     - Activity slots: `.pl-segment.pl-seg-activity` — clickable → `editActivity(pIdx, globalIdx)`
   - `.pl-activities-list` with `.pl-activity-chip` per activity
   - "تعيين كامل الفترة" button (only when no activities)
   - "+ إضافة نشاط" button → `showActivityForm(pIdx)`

---

## buildBarSegments(period, activities)

Returns array of segment objects for the visual bar:
```js
{ type: 'free', start, end, duration }
{ type: 'activity', name, icon, color, start, end, actIndex, duration, note }
```
`actIndex` is local index within `periodActs`. The global index is computed via `activities.indexOf(periodActs[bs.actIndex])`.

---

## Create/Edit Activity Dialog

### HTML Structure (`#activity-form-overlay`)
```
activity-form-overlay
  activity-form-modal
    af-header: h3 title + close button (af-close)
    af-body:
      #af-presets          — preset buttons (rendered by renderPresetButtons())
      #af-custom-name      — text input for activity name
      #af-note             — textarea for optional note
      af-times-row:
        #af-start-time     — time input (step=300) + af-skip-prev button
        #af-end-time       — time input (step=300) + af-skip-next button
      af-now-btns:
        #af-start-now-btn  — "▶ ابدأ الآن"
        #af-end-now-btn    — "◼ انتهِ الآن"
      #af-duration         — range slider (TickSlider component)
      #af-add-btn          — "إضافة" / "حفظ التعديل" / "تعيين"
      #af-delete-btn       — "حذف" (hidden in create mode)
```

### showActivityForm(pIdx) — Create Mode
1. Sets `currentFormWorkIndex = pIdx`, `editingActivityIndex = null`, `selectedPreset = null`
2. Smart start: `getSmartStartTime(pIdx)` = end of last activity in period, or period.start
3. Sets `af-start-time`, calculates `maxEnd` via `getMaxEndForStart(pIdx, smartStart)`
4. Sets slider `max = maxDur`, `value = maxDur` (defaults to fill remaining time)
5. Sets `af-end-time = smartStart + maxDur`
6. Clears preset selection, sets button text to "إضافة", hides delete button
7. Opens overlay with `.classList.add('active')`

### setFullPeriod(pIdx) — Assign Entire Period
Same as showActivityForm but pre-fills start=period.start, end=period.end, title "تعيين كامل الفترة", button "تعيين".

### editActivity(pIdx, globalIdx) — Edit Mode
1. Sets `currentFormWorkIndex = pIdx`, `editingActivityIndex = globalIdx`
2. Populates all form fields from `activities[globalIdx]`
3. Sets slider max = space available from act.start to next activity
4. Highlights matching preset button
5. Sets button text to "حفظ التعديل", shows delete button
6. Opens overlay

### Time Sync
- Slider change → `syncFromStartAndDuration()` → recalculates end time
- End time change → `syncFromEndTime()` → recalculates slider value
- Start time change → `syncFromStartTime()` → recalculates max, updates end

### Skip Buttons
- `skipStartToPrev()`: moves start to end of previous activity (or period start), keeping end fixed
- `skipEndToNext()`: moves end to start of next activity (or period end), keeping start fixed

### Start/End Now
- `handleStartNow()`: snaps start to current time; if overlapping previous activity, shows adjust dialog (shift/truncate)
- `handleEndNow()`: snaps end to current time; if next activity present, shows adjust dialog (shift/extend)

---

## addActivity() — CRUD Create + Update

```js
function addActivity() {
  // reads: af-custom-name, af-note, af-start-time, af-end-time, selectedPreset
  // resolves name+icon+color from preset or getPresetOrRandom(name)
  // validates: startMin < endMin, within period bounds
  // smart shift: if new activity overlaps existing ones, shifts them right
  if (editingActivityIndex !== null) {
    // UPDATE: activities[editingActivityIndex] = newActivity
    // also updates linked FocusData sessions
  } else {
    // CREATE: activities.push(newActivity)
  }
  savePlannerData(); closeActivityForm(); renderPlanner(); updateMainWorkBlocks();
}
```

**Activity pushed/updated:**
```js
{ name, icon, color, start: startMin, end: endMin, note }
```

---

## deleteActivityFromForm() / removeActivity(globalIndex)

`deleteActivityFromForm()` → calls `removeActivity(editingActivityIndex)`.

`removeActivity(globalIndex)`:
1. Deletes associated FocusData sessions (if FocusData exists)
2. `activities.splice(globalIndex, 1)`
3. `savePlannerData()` → `renderPlanner()` → `updateMainWorkBlocks()`

---

## Preset System

**DEFAULT_PRESETS (hardcoded):**
```js
{ name: 'عمل',       icon: '💼', color: '#4ecdc4' }
{ name: 'رياضة',    icon: '🏃', color: '#ff6b6b' }
{ name: 'قراءة',    icon: '📖', color: '#7c6aef' }
{ name: 'قيلولة',   icon: '😴', color: '#6c5ce7' }
{ name: 'عمل خارجي', icon: '🏢', color: '#3498db' }
{ name: 'ضائع',     icon: '🥹', color: '#ff9500db' }
```

**Custom presets:** stored via `ScheduleData.savePresets(array)` / `ScheduleData.getPresets()` — persisted in `customPresets` key of schedule-data.json, saved to `api.php?action=presets`.

**getAllPresets():** DEFAULT_PRESETS + customPresets

**getPresetOrRandom(name):** looks up by name in: preset buttons → current day activities → all days cache → falls back to random color+icon.

---

## Period Enable/Disable

`disabledPeriods` is an array of period key strings stored in day data.
Key format: `'work:' + period.start + '-' + period.end`

`togglePeriodEnabled(period)`: adds or removes key from the array, then saves + re-renders.

When a period is disabled, planner shows it collapsed with "معطّلة" label; `renderWorkBlocks` adds `.wt-block-unchecked` CSS class.

---

## updateMainWorkBlocks()

Simply calls `renderDay()` — rebuilds the entire schedule view after planner changes.

---

## Overlays in index.html

| ID | Purpose |
|----|---------|
| `#planner-overlay` | Main planner modal (period list + activity chips) |
| `#activity-form-overlay` | Create/edit activity dialog |
| `#custom-preset-overlay` | Create custom preset dialog |
| `#unassigned-overlay` | Shows unassigned time slots; clicking opens planner for that period |
| `#adj-overlay` | Adjust neighbor activity (shift/extend) when using Start/End Now |
| `#confirm-overlay` | Clear day confirmation |
| `#export-overlay` | Export day stats confirmation |
