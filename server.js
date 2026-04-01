const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'schedule-data.json');

app.use(express.json());
app.use(express.static(__dirname));

const DEFAULT_SETTINGS = {
  buffers: {
    fajr:    { before: 90, after: 30 },
    sunrise: { before: 0,  after: 20 },
    dhuhr:   { before: 15, after: 20 },
    asr:     { before: 15, after: 15 },
    maghrib: { before: 10, after: 20 },
    isha:    { before: 10, after: 20 }
  },
  bedtimeAfterIsha: 120,
  timeFormat: '12'
};

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data.workPlannerData && !data.days) {
      return migrateOldFormat(data);
    }
    if (!data.days) data.days = {};
    if (!data.customPresets) data.customPresets = [];
    return data;
  } catch (e) {
    return { days: {}, customPresets: [] };
  }
}

function migrateOldFormat(old) {
  const migrated = { days: {}, customPresets: [] };
  const globalSettings = old.scheduleSettings || DEFAULT_SETTINGS;

  for (const [date, dayPlan] of Object.entries(old.workPlannerData || {})) {
    const plan = Array.isArray(dayPlan)
      ? { activities: dayPlan, disabledPeriods: [] }
      : dayPlan;
    migrated.days[date] = {
      activities: plan.activities || [],
      disabledPeriods: plan.disabledPeriods || [],
      manualBedtime: plan.manualBedtime || null,
      settings: JSON.parse(JSON.stringify(globalSettings))
    };
  }

  writeData(migrated);
  return migrated;
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// --- API ---

// Full data (for initial load)
app.get('/api/data', (req, res) => {
  res.json(readData());
});

// Get day data, auto-initialize from previous day if missing
app.get('/api/day/:date', (req, res) => {
  const data = readData();
  const date = req.params.date;

  if (data.days[date]) {
    return res.json(data.days[date]);
  }

  // Find most recent previous day with data
  const dates = Object.keys(data.days).sort();
  let prevDate = null;
  for (const d of dates) {
    if (d < date) prevDate = d;
  }

  let dayData;
  if (prevDate && data.days[prevDate]) {
    // Copy settings from previous day, clear activities
    const prev = data.days[prevDate];
    dayData = {
      activities: [],
      disabledPeriods: [],
      manualBedtime: null,
      settings: JSON.parse(JSON.stringify(prev.settings || DEFAULT_SETTINGS))
    };
  } else {
    dayData = {
      activities: [],
      disabledPeriods: [],
      manualBedtime: null,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    };
  }

  data.days[date] = dayData;
  writeData(data);
  res.json(dayData);
});

// Save day data
app.post('/api/day/:date', (req, res) => {
  const data = readData();
  data.days[req.params.date] = req.body;
  writeData(data);
  res.json({ ok: true });
});

// Delete day data
app.delete('/api/day/:date', (req, res) => {
  const data = readData();
  delete data.days[req.params.date];
  writeData(data);
  res.json({ ok: true });
});

// Custom presets
app.get('/api/presets', (req, res) => {
  const data = readData();
  res.json(data.customPresets || []);
});

app.post('/api/presets', (req, res) => {
  const data = readData();
  data.customPresets = req.body;
  writeData(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Schedule server running at http://localhost:${PORT}`);
});
