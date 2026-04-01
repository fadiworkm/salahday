/**
 * Focus Mode — وضع التركيز
 * Full-screen timer overlay for activity focus sessions.
 *
 * Dependencies (loaded before this file):
 *   - LiveTimer  (timer.js)      — .format(sec), .now()
 *   - FocusData  (focus-data.js) — CRUD for focus sessions
 *   - displayTime(mins)          — from schedule.js
 *   - formatDuration(mins)       — from schedule.js
 *   - scheduleSettings           — from schedule.js (.timeFormat)
 */

// ─── Focus Mode Object ─────────────────────────────────────────────────────

var FocusMode = {
  _session: null,             // current FocusData session object
  _date: null,                // current date string (YYYY-MM-DD)
  _running: false,            // is timer actively counting
  _paused: false,             // is paused
  _interval: null,            // setInterval ID
  _currentPeriodStart: null,  // Unix timestamp (seconds) when current period started
  _segStart: 0,               // segment start in minutes since midnight
  _segEnd: 0,                 // segment end in minutes since midnight
  _actInfo: null,             // { name, icon, color }

  // ── DOM references (cached on first use) ────────────────────────────────

  _els: null,

  _getEls: function () {
    if (this._els) return this._els;
    this._els = {
      overlay:      document.getElementById('focus-overlay'),
      icon:         document.getElementById('focus-icon'),
      actName:      document.getElementById('focus-act-name'),
      elapsedTimer: document.getElementById('focus-elapsed-timer'),
      segRemaining: document.getElementById('focus-seg-remaining'),
      segGone:      document.getElementById('focus-seg-gone'),
      segRange:     document.getElementById('focus-seg-range'),
      totalTime:    document.getElementById('focus-total-time'),
      btnPause:     document.getElementById('focus-btn-pause'),
      pauseIcon:    document.querySelector('#focus-btn-pause .focus-pause-icon'),
      wave:         document.getElementById('focus-wave'),
      deleteBtn:    document.getElementById('focus-delete-btn')
    };
    return this._els;
  },

  // ── Public methods ──────────────────────────────────────────────────────

  /**
   * Opens the focus overlay.
   * @param {string} date           — date string (YYYY-MM-DD)
   * @param {number} segStart       — segment start in minutes since midnight
   * @param {number} segEnd         — segment end in minutes since midnight
   * @param {Object} actInfo        — { name, icon, color }
   * @param {Object|null} existingSession — resume an existing session, or null for new
   */
  open: function (date, segStart, segEnd, actInfo, existingSession) {
    var els = this._getEls();

    // Store state
    this._date = date;
    this._segStart = segStart;
    this._segEnd = segEnd;
    this._actInfo = actInfo;

    // Create or resume session
    if (existingSession) {
      this._session = existingSession;
    } else {
      this._session = FocusData.createSession({
        name: actInfo.name,
        icon: actInfo.icon,
        color: actInfo.color,
        segStart: segStart,
        segEnd: segEnd
      });
      // Save the new session immediately
      FocusData.save(date, this._session);
    }

    // ── Populate UI ──

    // Activity info
    els.icon.textContent = actInfo.icon || '';
    els.actName.textContent = actInfo.name || '';

    // Time range
    els.segRange.textContent =
      '\u200F' + displayTime(segStart) + '\u200F - \u200F' + displayTime(segEnd) + '\u200F';

    // Wave color from activity color
    if (els.wave) {
      els.wave.style.setProperty('--wave-color', actInfo.color || '#4ecdc4');
    }

    // Initial display of accumulated time
    this._updateDisplay();

    // Register LiveTimer entries for segment remaining/gone (ticks even when focus is paused)
    this._registerLiveTimers();

    // Show the overlay
    els.overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Behaviour depends on whether we are resuming or starting fresh
    if (existingSession) {
      // Resuming — show accumulated time, don't auto-start (show play icon)
      this._running = false;
      this._paused = true;
      this._showPlayIcon();
    } else {
      // Fresh session — auto-start
      this.start();
    }
  },

  /**
   * Start or resume the focus timer.
   */
  start: function () {
    if (this._running) return;

    this._running = true;
    this._paused = false;
    this._currentPeriodStart = Math.floor(Date.now() / 1000);

    // LiveTimer handles all display updates via _registerLiveTimers()

    // Show pause icon (‖)
    this._showPauseIcon();
  },

  /**
   * Pause the timer.
   */
  pause: function () {
    if (!this._running) return;

    this._running = false;
    this._paused = true;

    // Calculate the period duration
    var now = Math.floor(Date.now() / 1000);
    var periodDuration = now - this._currentPeriodStart;

    // Record the period
    if (periodDuration > 0 && this._session) {
      this._session.periods.push({
        start: this._currentPeriodStart,
        end: now,
        duration: periodDuration
      });
      this._session.totalFocusSec += periodDuration;

      // Save to server
      FocusData.save(this._date, this._session);
    }

    this._currentPeriodStart = null;

    // LiveTimer continues to tick, but with _running=false the elapsed won't increase

    // Show play icon (▶)
    this._showPlayIcon();
  },

  /**
   * Toggle between pause and resume.
   */
  togglePause: function () {
    if (this._running) {
      this.pause();
    } else {
      this.start();
    }
  },

  /**
   * Close the focus overlay.
   */
  close: function () {
    // If running, pause first (saves the current period)
    if (this._running) {
      this.pause();
    }

    // Hide overlay
    var els = this._getEls();
    els.overlay.classList.remove('active');
    document.body.style.overflow = '';

    // Reset state
    this._session = null;
    this._currentPeriodStart = null;

    // Trigger a re-render of the schedule page
    if (typeof renderDay === 'function') {
      renderDay();
    }
  },

  /**
   * Delete the current focus session after user confirmation.
   */
  deleteSession: function () {
    if (!this._session) return;

    // Confirm with user
    var confirmed = confirm('هل تريد حذف بيانات التركيز لهذا النشاط؟');
    if (!confirmed) return;

    // Stop the timer if running (without saving the current period)
    if (this._running) {
      this._running = false;
      this._paused = false;
    }

    // Delete from data store
    var sessionId = this._session.id;
    FocusData.delete(this._date, sessionId);

    // Close the overlay
    this._session = null;
    this._currentPeriodStart = null;

    var els = this._getEls();
    els.overlay.classList.remove('active');
    document.body.style.overflow = '';

    // Re-render
    if (typeof renderDay === 'function') {
      renderDay();
    }
  },

  // ── Private methods ─────────────────────────────────────────────────────

  /**
   * Called every second when the timer is running.
   * Updates all display elements and the wave height.
   */
  _tick: function () {
    if (!this._running || !this._session) return;

    var now = Math.floor(Date.now() / 1000);

    // Elapsed in the current (unsaved) period
    var currentPeriodElapsed = this._currentPeriodStart
      ? now - this._currentPeriodStart
      : 0;

    // Total elapsed = saved + current period
    var totalElapsed = this._session.totalFocusSec + currentPeriodElapsed;

    // Segment times based on wall clock
    var nowSecMidnight = LiveTimer.now();
    var segStartSec = this._segStart * 60;
    var segEndSec = this._segEnd * 60;
    var segGone = Math.max(0, nowSecMidnight - segStartSec);
    var segRemaining = Math.max(0, segEndSec - nowSecMidnight);
    var totalSegDur = segEndSec - segStartSec;

    // Wave = focus time / segment duration
    var wavePct = totalSegDur > 0
      ? Math.min(100, (totalElapsed / totalSegDur) * 100)
      : 0;

    // Auto-pause when segment time is up
    if (segRemaining <= 0) {
      this.pause();
      return;
    }

    // ── Update DOM ──
    var els = this._getEls();

    // Big elapsed focus timer (UP counter)
    els.elapsedTimer.textContent = LiveTimer.format(totalElapsed);

    // Segment info
    els.segRemaining.textContent = LiveTimer.format(segRemaining);
    els.segGone.textContent = LiveTimer.format(segGone);

    // Total focus time
    els.totalTime.textContent = LiveTimer.format(totalElapsed);

    // Wave height via CSS custom property
    if (els.wave) {
      els.wave.style.setProperty('--wave-pct', wavePct + '%');
    }
  },

  /**
   * Update display without a running timer (for paused/initial state).
   */
  _updateDisplay: function () {
    var els = this._getEls();
    var totalElapsed = this._session ? this._session.totalFocusSec : 0;

    // Segment times based on wall clock
    var nowSecMidnight = LiveTimer.now();
    var segStartSec = this._segStart * 60;
    var segEndSec = this._segEnd * 60;
    var segGone = Math.max(0, nowSecMidnight - segStartSec);
    var segRemaining = Math.max(0, segEndSec - nowSecMidnight);
    var totalSegDur = segEndSec - segStartSec;

    // Wave height percentage
    var wavePct = totalSegDur > 0
      ? Math.min(100, (totalElapsed / totalSegDur) * 100)
      : 0;

    // Update DOM
    els.elapsedTimer.textContent = LiveTimer.format(totalElapsed);
    els.segRemaining.textContent = LiveTimer.format(segRemaining);
    els.segGone.textContent = LiveTimer.format(segGone);
    els.totalTime.textContent = LiveTimer.format(totalElapsed);

    if (els.wave) {
      els.wave.style.setProperty('--wave-pct', wavePct + '%');
    }
  },

  /**
   * Register LiveTimer entries for segment remaining/gone cards.
   * These tick every second via the global LiveTimer regardless of focus running state.
   */
  _registerLiveTimers: function () {
    var els = this._getEls();
    var sS = this._segStart;
    var sE = this._segEnd;
    var self = this;

    // Segment remaining & gone — always ticking based on wall clock
    LiveTimer.progress(null, els.segGone, els.segRemaining, function (nowSec) {
      var segStartSec = sS * 60;
      var segEndSec = sE * 60;
      var gone = Math.max(0, nowSec - segStartSec);
      var left = Math.max(0, segEndSec - nowSec);
      return { gone: gone, left: left };
    });

    // Total focus time & big timer — also live via LiveTimer for when focus IS running
    LiveTimer.progress(null, null, null, function (nowSec) {
      if (!self._session) return { gone: 0, left: 0 };
      var currentElapsed = (self._running && self._currentPeriodStart)
        ? Math.floor(Date.now() / 1000) - self._currentPeriodStart : 0;
      var total = self._session.totalFocusSec + currentElapsed;
      els.elapsedTimer.textContent = LiveTimer.format(total);
      els.totalTime.textContent = LiveTimer.format(total);

      // Wave
      var totalSegDur = (sE - sS) * 60;
      var wavePct = totalSegDur > 0 ? Math.min(100, (total / totalSegDur) * 100) : 0;
      if (els.wave) els.wave.style.setProperty('--wave-pct', wavePct + '%');

      return { gone: total, left: Math.max(0, (sE - sS) * 60 - total) };
    });
  },

  /**
   * Show the pause icon (‖) on the control button.
   */
  _showPauseIcon: function () {
    var els = this._getEls();
    if (els.pauseIcon) {
      els.pauseIcon.innerHTML = '&#9646;&#9646;';
    }
    if (els.overlay) {
      els.overlay.classList.remove('is-paused');
    }
  },

  /**
   * Show the play icon (▶) on the control button.
   */
  _showPlayIcon: function () {
    var els = this._getEls();
    if (els.pauseIcon) {
      els.pauseIcon.innerHTML = '&#9654;';
    }
    if (els.overlay) {
      els.overlay.classList.add('is-paused');
    }
  }
};

// ─── Global entry point ─────────────────────────────────────────────────────
// Called from onclick handlers in the schedule/timeline HTML.

function openFocusMode(date, segStart, segEnd, actName, actIcon, actColor) {
  var actInfo = {
    name: actName,
    icon: actIcon,
    color: actColor
  };

  // Load focus data for the date, then open
  FocusData.load(date).then(function () {
    // Check for an existing session in this segment
    var existing = FocusData.getForSegment(date, segStart, segEnd);
    var existingSession = existing.length > 0 ? existing[0] : null;

    FocusMode.open(date, segStart, segEnd, actInfo, existingSession);
  });
}

// ─── Event listeners ────────────────────────────────────────────────────────

document.getElementById('focus-close').addEventListener('click', function () {
  FocusMode.close();
});

document.getElementById('focus-btn-pause').addEventListener('click', function () {
  FocusMode.togglePause();
});

// Tap on the big timer to toggle pause/resume
document.getElementById('focus-elapsed-timer').addEventListener('click', function () {
  FocusMode.togglePause();
});

document.getElementById('focus-delete-btn').addEventListener('click', function () {
  FocusMode.deleteSession();
});
