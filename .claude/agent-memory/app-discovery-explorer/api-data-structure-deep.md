---
name: api.php and data structure deep dive
description: Full JSON schema for day data, activities, settings, API routes, ScheduleData layer
type: project
---

# api.php & Data Structure — Deep Exploration

## Files

- `api.php` — single REST API file
- `data/schedule-data.json` — main data store (days + customPresets)
- `data/focus-data.json` — focus session data (separate file)

---

## schedule-data.json — Full Schema

```json
{
  "days": {
    "YYYY-MM-DD": {
      "activities": [
        {
          "name": "string",    // Arabic activity name
          "icon": "string",    // emoji
          "color": "string",   // hex color e.g. "#4ecdc4"
          "start": number,     // minutes since midnight
          "end": number,       // minutes since midnight
          "note": "string"     // optional, may be absent
        }
      ],
      "disabledPeriods": [
        "work:START-END"       // e.g. "work:390-720"
      ],
      "manualBedtime": number | null,   // minutes since midnight, or null
      "settings": {
        "buffers": {
          "fajr":    { "before": number, "after": number },
          "sunrise": { "before": number, "after": number },
          "dhuhr":   { "before": number, "after": number },
          "asr":     { "before": number, "after": number },
          "maghrib": { "before": number, "after": number },
          "isha":    { "before": number, "after": number }
        },
        "bedtimeAfterIsha": number,   // minutes after isha before bedtime
        "timeFormat": "12" | "24"
      }
    }
  },
  "customPresets": [
    {
      "name": "string",
      "icon": "string",
      "color": "string"
    }
  ]
}
```

**Real example from data file:**
```json
{
  "name": "عمل",
  "icon": "💼",
  "color": "#4ecdc4",
  "start": 1235,
  "end": 1335,
  "note": "مكالمة"
}
```

---

## Default Settings (api.php defaultSettings())

```php
'buffers' => [
  'fajr'    => ['before' => 90, 'after' => 30],
  'sunrise' => ['before' => 0,  'after' => 20],
  'dhuhr'   => ['before' => 15, 'after' => 20],
  'asr'     => ['before' => 15, 'after' => 15],
  'maghrib' => ['before' => 10, 'after' => 20],
  'isha'    => ['before' => 10, 'after' => 20],
]
'bedtimeAfterIsha' => 120
'timeFormat'       => '12'
```

---

## API Routes

| Method | URL | Action |
|--------|-----|--------|
| GET | `?action=data` | Full data file (days + customPresets) |
| GET | `?action=day&date=YYYY-MM-DD` | Get day (auto-inits from prev day if missing) |
| POST | `?action=day&date=YYYY-MM-DD` | Save entire day object (body = day JSON) |
| DELETE | `?action=day&date=YYYY-MM-DD` | Delete day |
| GET | `?action=presets` | Get customPresets array |
| POST | `?action=presets` | Save customPresets array (body = array JSON) |
| GET | `?action=focus&date=YYYY-MM-DD` | Get focus sessions for a date |
| POST | `?action=focus&date=YYYY-MM-DD` | Save/update a focus session (body = session with `id`) |
| DELETE | `?action=focus&date=YYYY-MM-DD&id=ID` | Delete a focus session by id |
| GET | `?action=focus-all` | Get all focus sessions (all dates) |

---

## Auto-Init from Previous Day (GET day)

When a day doesn't exist yet:
1. Finds the most recent date key `< requested date` in `data['days']`
2. Creates new day with empty activities/disabledPeriods, `manualBedtime: null`
3. **Copies settings** from the previous day (so buffer settings persist day-to-day)
4. If no previous day exists, uses `defaultSettings()`

---

## ScheduleData (data-api.js) — Client Cache Layer

`ScheduleData._data` = `{ days: {}, customPresets: [] }` — local mirror of server data.

Key methods:
- `ScheduleData.init()` — fetches full data on page load (`?action=data`)
- `ScheduleData.whenReady()` — promise-based wait for init
- `ScheduleData.loadDay(date)` — fetches specific day, updates cache
- `ScheduleData.getDay(date)` — returns from cache (may be null)
- `ScheduleData.getDayOrDefault(date)` — returns from cache, creates default if missing
- `ScheduleData.saveDay(date, dayData?)` — fire-and-forget POST to server
- `ScheduleData.deleteDay(date)` — fire-and-forget DELETE
- `ScheduleData.getPresets()` — from cache
- `ScheduleData.savePresets(presets)` — fire-and-forget POST
- `ScheduleData.getAllDays()` — all days from cache
- `ScheduleData.refresh()` — re-fetches all data from server

---

## focus-data.json Schema

```json
{
  "sessions": {
    "YYYY-MM-DD": [
      {
        "id": "string",           // unique session id
        "segStart": number,       // minutes since midnight (activity start)
        "segEnd": number,         // minutes since midnight (activity end)
        "activityName": "string",
        "activityIcon": "string",
        "activityColor": "string",
        "totalFocusSec": number   // seconds of focus time
      }
    ]
  }
}
```

---

## UI Segment Differentiation (CSS Classes)

### In renderWorkBlocks (main schedule page)
- **Period container:** `.wt-period` (+ `.wt-block-current` if isCurrent, + `.wt-block-unchecked` if disabled)
- **Free time slots:** `.wt-vb-seg.wt-vb-free.wt-clickable` (+ `.vb-done` / `.vb-active` states)
- **Activity slots:** `.wt-vb-seg.wt-vb-act.wt-clickable` (background set via inline `style`)
- **Activity cards:** `.wt-act-card.wt-clickable` with `--act-color` CSS var
- **Disabled period:** `.wt-disabled-label` shows "معطّلة"

### In renderDayStats (statistics panel)
- **Prayer+prep combined:** `.ds-item.ds-item-prayer` with `color: '#7c6aef'`
- **Unassigned work:** `.ds-item.ds-item-unassigned.ds-item-clickable` — clicking opens unassigned dialog
- **Regular activities:** `.ds-item` with inline background bar

### In renderPlanner (planner modal)
- **Period container:** `.pl-period` (+ `.pl-period-disabled` if disabled)
- **Free segments:** `.pl-segment.pl-seg-work` (teal) or `.pl-segment.pl-seg-bedtime` (purple)
- **Activity segments:** `.pl-segment.pl-seg-activity` with inline `background: act.color`
- **Activity chips list:** `.pl-activities-list > .pl-activity-chip`

### Prayer/prep vs Work visual distinction
Prayer and prep segments are NEVER shown in the work blocks panel (`#work-blocks`) — that panel only shows `type === 'work'` segments. Prayer/prep appear only in:
- Day stats (`#day-stats`) under "صلاة وتحضير" combined category
- Pentagon visualization (buffer lines on pentagon edges)
- Prayer progress grid (`#prayer-live`)

There is no direct UI list rendering of individual prayer/prep segments in the main schedule.

---

## Migration from Old Format

`migrateOldFormat()` in api.php handles the old `workPlannerData` format:
- Old: `{ workPlannerData: { "date": [...activities] }, scheduleSettings: {...} }`
- New: `{ days: { "date": { activities, disabledPeriods, manualBedtime, settings } }, customPresets: [] }`
