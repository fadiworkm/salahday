/**
 * Data API layer — replaces localStorage with server file storage (PHP).
 * Loaded before schedule.js and planner.js.
 */
var ScheduleData = {
  _data: { days: {}, customPresets: [] },
  _readyPromise: null,

  init: function () {
    this._readyPromise = this._load();
    return this._readyPromise;
  },

  whenReady: function () {
    return this._readyPromise || Promise.resolve();
  },

  _fetch: function (url, opts) {
    // Always bypass cache so all devices get fresh data
    opts = opts || {};
    opts.cache = 'no-store';
    return fetch(url, opts);
  },

  _load: function () {
    var self = this;
    return this._fetch('api.php?action=data')
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('HTTP ' + res.status);
      })
      .then(function (data) {
        self._data = data;
        if (!self._data.days) self._data.days = {};
        if (!self._data.customPresets) self._data.customPresets = [];
      })
      .catch(function (e) {
        console.error('Failed to load data from server:', e);
      });
  },

  /** Re-fetch all data from server */
  refresh: function () {
    return this._load();
  },

  /** Fetch a specific day from server (auto-initializes from previous day) */
  loadDay: function (date) {
    var self = this;
    return this._fetch('api.php?action=day&date=' + date)
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('HTTP ' + res.status);
      })
      .then(function (dayData) {
        self._data.days[date] = dayData;
        return dayData;
      })
      .catch(function (e) {
        console.error('Failed to load day:', e);
        return self.getDay(date);
      });
  },

  /** Get day from local cache (may be null) */
  getDay: function (date) {
    return this._data.days[date] || null;
  },

  /** Get day from cache, creating default if missing */
  getDayOrDefault: function (date) {
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
  saveDay: function (date, dayData) {
    if (dayData) this._data.days[date] = dayData;
    var payload = this._data.days[date];
    if (!payload) return;
    this._fetch('api.php?action=day&date=' + date, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function (e) { console.error('Failed to save day:', e); });
  },

  /** Delete day from server */
  deleteDay: function (date) {
    delete this._data.days[date];
    this._fetch('api.php?action=day&date=' + date, { method: 'DELETE' })
      .catch(function (e) { console.error('Failed to delete day:', e); });
  },

  /** Get custom presets from cache */
  getPresets: function () {
    return this._data.customPresets || [];
  },

  /** Save custom presets to server (fire-and-forget) */
  savePresets: function (presets) {
    this._data.customPresets = presets;
    this._fetch('api.php?action=presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(presets)
    }).catch(function (e) { console.error('Failed to save presets:', e); });
  },

  /** All days in cache */
  getAllDays: function () {
    return this._data.days || {};
  }
};

ScheduleData.init();
