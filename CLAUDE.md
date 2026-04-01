# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arabic (RTL) prayer-times-based daily planner and sleep calculator for Daraa, Syria. No build step, no framework, no database — vanilla HTML/CSS/JS frontend with a PHP API that reads/writes a single JSON file.

## Develompent keys:
- use app-discovery-explorer agent to discover code if needed
- write resuable component
- make code divided by multi files to be easy to read and maintain
- create three layers : data - logic - view
- create team to add or edit code if need with many models (sonnet, opus )
- do not use chrome-devtools until I ask in prompt

## Development

```bash
php -S localhost:3000
```

Open `http://localhost:3000` in a browser. No build, no transpilation, no package manager needed.

## Architecture

### Pages
- `index.html` — Daily schedule: prayer-based time blocks, work period planner, activity management
- `sleep.html` — Sleep calculator: optimizes sleep cycles around Isha/Fajr prayers
- `analysis.html` — Multi-day work period analysis with selectable periods

### Backend
- `api.php` — Single REST API file. All data CRUD goes here. Routes via `?action=` query param:
  - `GET ?action=data` — full data file
  - `GET/POST/DELETE ?action=day&date=YYYY-MM-DD` — per-day CRUD (auto-initializes from previous day's settings)
  - `GET/POST ?action=presets` — custom activity presets
- `data/schedule-data.json` — single data store (gitignored, created automatically)

### Frontend JS (no modules, loaded via `<script>` tags)

**Schedule page** (`index.html`) loads in order:
1. `js/pray-times-data.js` — `PRAY_TIMES_RAW` array + `PRAYER_DATA` object with interpolation support
2. `js/timer.js` — `LiveTimer` singleton: real-time countdown/elapsed/pie/progress bar updates at 1-second intervals
3. `js/data-api.js` — `ScheduleData` object: API client layer replacing localStorage, caches data locally, fire-and-forget saves
4. `js/schedule.js` — Main schedule logic: generates day segments from prayer times + buffer settings, renders pentagon visualization, work blocks, day stats. Exposes `window._workSegments` and `window._allSegments` for the planner
5. `js/planner.js` — Activity planner modal: CRUD for activities within work periods, preset management, visual bar segments

**Sleep page** (`sleep.html`) loads:
1. `js/data.js` — Prayer data with `PRAYER_DATA` object, time utilities (`timeToMinutes`, `minutesToTime`, `displayTime`, `formatDuration`, `getPrayerTimes` with linear interpolation)
2. `js/calculator.js` — Sleep plan engine (`calculateSleepPlan`, `generateSmartSuggestions`): optimizes sleep cycles across two periods (post-Isha, post-Fajr) with flexible wake support
3. `js/app.js` — UI controller for sleep calculator: settings, timeline rendering, smart suggestions

**Analysis page** (`analysis.html`) loads:
1. `js/pray-times-data.js` — shared prayer data
2. `js/analysis.js` — standalone: generates day segments, computes multi-day work statistics

### Two prayer data systems
- `js/pray-times-data.js` (`PRAY_TIMES_RAW`): detailed Arabic-format data with all 6 prayer times, used by schedule and analysis pages
- `js/data.js` (`PRAYER_DATA`): simplified fajr/isha-only data with linear interpolation between sparse dates, used by sleep calculator

### Key patterns
- All times internally stored as **minutes since midnight** (0–1439)
- Prayer buffers (before/after each prayer) define "occupied" ranges; gaps between them become work periods
- Settings are stored **per-day** in the JSON data (not global), inherited from the most recent previous day
- `ScheduleData` (data-api.js) is the single data access layer for the schedule page — all reads/writes go through it
- The sleep calculator and analysis page are independent of `ScheduleData` — they use their own prayer data directly
- CSS uses `cache-busting` version params (`?v=3`) on asset URLs

## Deployment

Upload all files to PHP hosting (7.4+). Ensure `data/` directory is writable (`chmod 755`). No Node.js or database required.
