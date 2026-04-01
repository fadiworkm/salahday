/**
 * Data API layer — replaces localStorage with server file storage.
 * Loaded before schedule.js and planner.js.
 */
const ScheduleData = {
  _data: { days: {}, customPresets: [] },
  _readyPromise: null,

  init() {
    this._readyPromise = this._load();
    return this._readyPromise;
  },

  async whenReady() {
    if (this._readyPromise) await this._readyPromise;
  },

  async _load() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        this._data = await res.json();
        if (!this._data.days) this._data.days = {};
        if (!this._data.customPresets) this._data.customPresets = [];
      }
    } catch (e) {
      console.error('Failed to load data from server:', e);
    }
  },

  /** Re-fetch all data from server */
  async refresh() {
    await this._load();
  },

  /** Fetch a specific day from server (auto-initializes from previous day) */
  async loadDay(date) {
    try {
      const res = await fetch('/api/day/' + date);
      if (res.ok) {
        const dayData = await res.json();
        this._data.days[date] = dayData;
        return dayData;
      }
    } catch (e) {
      console.error('Failed to load day:', e);
    }
    return this.getDay(date);
  },

  /** Get day from local cache (may be null) */
  getDay(date) {
    return this._data.days[date] || null;
  },

  /** Get day from cache, creating default if missing */
  getDayOrDefault(date) {
    if (!this._data.days[date]) {
      this._data.days[date] = {
        activities: [],
        disabledPeriods: [],
        manualBedtime: null,
        settings: null
      };
    }
    var day = this._data.days[date];
    if (Array.isArray(day)) {
      day = { activities: day, disabledPeriods: [], manualBedtime: null, settings: null };
      this._data.days[date] = day;
    }
    if (!day.activities) day.activities = [];
    if (!day.disabledPeriods) day.disabledPeriods = [];
    return day;
  },

  /** Save day data to server (fire-and-forget) */
  saveDay(date, dayData) {
    if (dayData) this._data.days[date] = dayData;
    var payload = this._data.days[date];
    if (!payload) return;
    fetch('/api/day/' + date, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function (e) { console.error('Failed to save day:', e); });
  },

  /** Delete day from server */
  deleteDay(date) {
    delete this._data.days[date];
    fetch('/api/day/' + date, { method: 'DELETE' })
      .catch(function (e) { console.error('Failed to delete day:', e); });
  },

  /** Get custom presets from cache */
  getPresets() {
    return this._data.customPresets || [];
  },

  /** Save custom presets to server (fire-and-forget) */
  savePresets(presets) {
    this._data.customPresets = presets;
    fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(presets)
    }).catch(function (e) { console.error('Failed to save presets:', e); });
  },

  /** All days in cache */
  getAllDays() {
    return this._data.days || {};
  }
};

ScheduleData.init();
