/**
 * Focus Data API layer — client for focus session CRUD.
 * Mirrors the ScheduleData pattern (fire-and-forget saves, local cache).
 * Loaded after data-api.js and before focus.js.
 */
var FocusData = {
  _cache: {},   // { "2026-04-01": [session, ...], ... }
  _loaded: {},  // { "2026-04-01": true } — tracks which dates have been fetched

  // ── internal helpers ──────────────────────────────────────────────

  _fetch: function (url, opts) {
    opts = opts || {};
    opts.cache = 'no-store';
    return fetch(url, opts);
  },

  // ── read operations ───────────────────────────────────────────────

  /**
   * Load sessions for a date from the server.
   * Updates the local cache and returns a Promise resolving to the sessions array.
   */
  load: function (date) {
    var self = this;
    return this._fetch('api.php?action=focus&date=' + date)
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('HTTP ' + res.status);
      })
      .then(function (sessions) {
        // Server may return an object wrapper — normalise to array
        if (!Array.isArray(sessions)) sessions = [];
        self._cache[date] = sessions;
        self._loaded[date] = true;
        return sessions;
      })
      .catch(function (e) {
        console.error('FocusData: failed to load sessions for ' + date, e);
        // Ensure we still have a usable cache entry
        if (!self._cache[date]) self._cache[date] = [];
        self._loaded[date] = true;
        return self._cache[date];
      });
  },

  /**
   * Get cached sessions for a date (synchronous).
   * Returns [] if the date has not been loaded yet.
   */
  get: function (date) {
    return this._cache[date] || [];
  },

  /**
   * Get sessions that belong to a specific activity segment on a date.
   * Matches by segStart + segEnd.
   */
  getForSegment: function (date, segStart, segEnd) {
    return this.get(date).filter(function (s) {
      return s.segStart === segStart && s.segEnd === segEnd;
    });
  },

  /**
   * Get total focus seconds accumulated across all sessions
   * for a specific segment on a date.
   */
  getTotalForSegment: function (date, segStart, segEnd) {
    return this.getForSegment(date, segStart, segEnd).reduce(function (sum, s) {
      return sum + (s.totalFocusSec || 0);
    }, 0);
  },

  // ── write operations ──────────────────────────────────────────────

  /**
   * Save (create or update) a session to the server.
   * Updates the local cache immediately and sends to the server fire-and-forget.
   */
  save: function (date, session) {
    // Update local cache first for instant UI responsiveness
    if (!this._cache[date]) this._cache[date] = [];
    var list = this._cache[date];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === session.id) { idx = i; break; }
    }
    if (idx >= 0) {
      list[idx] = session;
    } else {
      list.push(session);
    }

    // Fire-and-forget POST
    this._fetch('api.php?action=focus&date=' + date, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    }).catch(function (e) {
      console.error('FocusData: failed to save session', e);
    });
  },

  /**
   * Delete a session by id from the server and local cache.
   */
  delete: function (date, sessionId) {
    // Remove from local cache immediately
    if (this._cache[date]) {
      this._cache[date] = this._cache[date].filter(function (s) {
        return s.id !== sessionId;
      });
    }

    // Fire-and-forget DELETE
    this._fetch('api.php?action=focus&date=' + date + '&id=' + sessionId, {
      method: 'DELETE'
    }).catch(function (e) {
      console.error('FocusData: failed to delete session', e);
    });
  },

  // ── factory ───────────────────────────────────────────────────────

  /**
   * Create a new session object with sensible defaults.
   * @param {Object} opts - { name, icon, color, segStart, segEnd }
   */
  createSession: function (opts) {
    return {
      id: 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      activityName: opts.name || '',
      activityIcon: opts.icon || '',
      activityColor: opts.color || '#4ecdc4',
      segStart: opts.segStart,
      segEnd: opts.segEnd,
      startedAt: Math.floor(Date.now() / 1000),
      periods: [],
      totalFocusSec: 0
    };
  }
};
