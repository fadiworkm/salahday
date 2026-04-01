# Setup

## Requirements
- Node.js 18+

## Install & Run

```bash
npm install
npm start
```

Opens at `http://localhost:3000`

To use a different port:
```bash
PORT=8080 npm start
```

## Data

All schedule data is stored in `data/schedule-data.json`. This file is auto-created on first run and excluded from git.

Each day stores its own activities, settings, and bedtime. New days auto-initialize settings from the most recent previous day.

## Pages

- `/` - Daily schedule (home)
- `/sleep.html` - Sleep calculator
- `/analysis.html` - Work period analysis
