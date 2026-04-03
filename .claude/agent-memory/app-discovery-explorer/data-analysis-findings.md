# data-api.js, analysis.js, and Cross-file عمل Search Findings

## data-api.js (ScheduleData)

Pure client-side cache + API proxy. No logic about segment types. Key methods:
- `loadDay(date)` → fetches api.php?action=day&date=
- `getDay(date)` → returns cached day or null
- `getDayOrDefault(date)` → creates default {activities:[], disabledPeriods:[], manualBedtime:null, settings:null}
- `saveDay(date)` → POST to api.php (fire-and-forget)
- `getAllDays()` → returns all cached days

## analysis.js

### `generateDaySegments` (line 174-270)
Mirrors schedule.js exactly. Free gaps become:
- `type: 'work', label: 'وقت عمل'` if before bedtime
- `type: 'sleep', label: 'نوم'` if after bedtime

### Work period labeling
analysis.js does NOT use ScheduleData — it reads directly from `PRAY_TIMES_RAW`. The work stat computation for multi-day analysis is entirely based on segment-level `type === 'work'` duration; it does NOT distinguish between assigned/unassigned within work periods.

## All `عمل` occurrences (cross-file grep summary)

### schedule.js
| Line | Context |
|------|---------|
| 303, 307, 318, 322 | `generateDaySegments`: gap segments get `type:'work', label:'وقت عمل'` |
| 580-621 | `renderDayStats`: `act.name === 'عمل'` check for stats bucketing |
| 619 | `remainingWork` formula uses `activityWorkTime` (from عمل-named acts) |
| 621 | Pushes `{name:'عمل', icon:'💼', ...}` category to day stats |
| 650 | Unmatched focus sessions default to `'عمل'` category |
| 727, 747, 764 | Same pattern in `exportDayStatsJSON` |
| 892, 918, 1066, 1564, 1582 | `filter(a => a.name !== 'عمل')` to exclude عمل-named acts from "used time" |
| 908 | `${formatDuration(freeTime)} عمل` — period header label |
| 1042 | Focus button label `'وقت عمل'` when no active activity |

### planner.js
| Line | Context |
|------|---------|
| 47 | `getPlannerPeriods`: period label `'وقت عمل'` |
| 150 | `' عمل'` suffix on period duration display |
| 224 | `a.name !== 'عمل'` exclusion in planner summary |
| 239 | `DEFAULT_PRESETS[0]` = `{name:'عمل', icon:'💼', color:'#4ecdc4'}` |

### mobile-timeline.js
| Line | Context |
|------|---------|
| 81 | `formatDuration(free) + ' عمل'` on period header |
| 142 | `'وقت العمل المتاح:'` total label |
| 175 | Focus button label `'وقت عمل'` when no active activity |

## Key insight: The "عمل" special-case problem

The entire codebase treats activity name `'عمل'` as a magic string meaning "still work time, not a distinct activity." This means:
1. Any unassigned time in a work segment shows as "عمل" in day stats
2. Activities explicitly named "عمل" are excluded from "used time" calculations
3. The focus session fallback also goes to "عمل"

To make only explicitly labeled "عمل" activities count as work:
- Rename unassigned/free segment type from `'work'` to `'unassigned'` or change the label to `'غير محدد'`
- Stop excluding `act.name === 'عمل'` from usedTime — treat it like any other activity
- The `remainingWork` formula needs to only include actual unassigned time (not activitiesnamed 'عمل')
- The stats category for unassigned work time should be `'غير محدد'` not `'عمل'`
