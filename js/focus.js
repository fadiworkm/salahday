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
  _waveBottom: 0,       // px from overlay bottom to timer-label bottom
  _waveMaxHeight: 0,    // px from timer-label bottom to overlay top

  _lastDonePomos: 0,     // track completed pomos for celebration trigger
  _muted: false,
  _audioCtx: null,
  _tickInterval: null,

  _getPomoFocus: function () {
    return (typeof scheduleSettings !== 'undefined' && scheduleSettings.pomoDuration
      ? scheduleSettings.pomoDuration : 45) * 60;
  },
  _getPomoCycle: function () {
    return this._getPomoFocus() + 15 * 60; // focus + 15 min break
  },

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
      timerLabel:   document.querySelector('.focus-timer-label'),
      deleteBtn:    document.getElementById('focus-delete-btn'),
      note:         document.getElementById('focus-note'),
      pomoBoxes:    document.getElementById('focus-pomo-boxes'),
      celebrate:    document.getElementById('focus-celebrate')
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

    // Initialize pomodoro tracking (set to current done count so celebration doesn't fire on open)
    var initFocus = existingSession ? existingSession.totalFocusSec : 0;
    this._lastDonePomos = Math.floor(initFocus / this._getPomoFocus());

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

    // Activity note — look up from ScheduleData
    var actNote = '';
    if (typeof ScheduleData !== 'undefined') {
      var dayData = ScheduleData.getDay(date);
      var acts = dayData ? dayData.activities || [] : [];
      for (var ni = 0; ni < acts.length; ni++) {
        if (acts[ni].start === segStart && acts[ni].end === segEnd && acts[ni].note) {
          actNote = acts[ni].note;
          break;
        }
      }
    }
    if (els.note) {
      els.note.textContent = actNote || '';
    }

    // Time range
    els.segRange.textContent =
      '\u200F' + displayTime(segStart) + '\u200F - \u200F' + displayTime(segEnd) + '\u200F';

    // Wave color from activity color
    if (els.wave) {
      els.wave.style.setProperty('--wave-color', actInfo.color || '#4ecdc4');
    }

    // Reset mute icon to current state
    var muteIcon = document.getElementById('focus-mute-icon');
    if (muteIcon) muteIcon.textContent = this._muted ? '🔇' : '🔊';

    // Initial display of accumulated time
    this._updateDisplay();

    // Register LiveTimer entries for segment remaining/gone (ticks even when focus is paused)
    this._registerLiveTimers();

    // Show the overlay
    els.overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Calculate wave bounds after layout is ready (and on resize)
    var self = this;
    requestAnimationFrame(function () {
      self._calcWaveBounds();
    });
    this._onResize = function () { self._calcWaveBounds(); };
    window.addEventListener('resize', this._onResize);

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

    // Sound
    this._playStart();
    this._stopNudge();

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

    // Add to total focus time
    if (periodDuration > 0 && this._session) {
      this._session.totalFocusSec += periodDuration;

      // Save to server
      FocusData.save(this._date, this._session);
    }

    this._currentPeriodStart = null;

    // LiveTimer continues to tick, but with _running=false the elapsed won't increase

    // Sound
    this._stopTickSound();
    this._playPause();
    this._startNudge();

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

    // Stop sounds
    this._stopTickSound();
    this._stopNudge();

    // Remove resize listener
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
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
   * Calculate the wave bottom offset and max height from the timer label position.
   */
  _calcWaveBounds: function () {
    var els = this._getEls();
    if (!els.timerLabel || !els.overlay) return;
    var activityInfo = document.querySelector('.focus-activity-info');
    var overlayRect = els.overlay.getBoundingClientRect();
    var anchorTop = activityInfo ? activityInfo.getBoundingClientRect().top : els.timerLabel.getBoundingClientRect().bottom;
    this._waveBottom = overlayRect.bottom - anchorTop;
    this._waveMaxHeight = anchorTop - overlayRect.top;
    if (els.wave) {
      els.wave.style.setProperty('--wave-bottom', this._waveBottom + 'px');
    }
  },

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

    // Wave height in pixels
    var rawPct = totalSegDur > 0
      ? Math.min(1, totalElapsed / totalSegDur)
      : 0;
    var waveHeight = totalElapsed > 0 ? rawPct * this._waveMaxHeight : 0;

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
      els.wave.style.setProperty('--wave-height', waveHeight + 'px');
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

    // Wave height in pixels
    var rawPct = totalSegDur > 0
      ? Math.min(1, totalElapsed / totalSegDur)
      : 0;
    var waveHeight = totalElapsed > 0 ? rawPct * this._waveMaxHeight : 0;

    // Update DOM
    els.elapsedTimer.textContent = LiveTimer.format(totalElapsed);
    els.segRemaining.textContent = LiveTimer.format(segRemaining);
    els.segGone.textContent = LiveTimer.format(segGone);
    els.totalTime.textContent = LiveTimer.format(totalElapsed);

    // Pomodoro boxes
    this._updatePomodoro(totalElapsed);

    if (els.wave) {
      els.wave.style.setProperty('--wave-bottom', this._waveBottom + 'px');
      els.wave.style.setProperty('--wave-height', waveHeight + 'px');
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

      // Wave: fills from activity-info top upward based on focus progress
      var totalSegDur = (sE - sS) * 60;
      var rawPct = totalSegDur > 0 ? Math.min(1, total / totalSegDur) : 0;
      // Minimum 30px when any focus time exists so crests/bubbles are visible
      var minH = total > 0 ? 30 : 0;
      var waveHeight = Math.max(minH, rawPct * self._waveMaxHeight);
      if (els.wave) els.wave.style.setProperty('--wave-height', waveHeight + 'px');

      // Update pomodoro boxes
      self._updatePomodoro(total);

      return { gone: total, left: Math.max(0, (sE - sS) * 60 - total) };
    });
  },

  /**
   * Render pomodoro progress boxes.
   * @param {number} focusSec — total focus seconds accumulated
   */
  _updatePomodoro: function (focusSec) {
    var els = this._getEls();
    if (!els.pomoBoxes) return;

    var pomoFocus = this._getPomoFocus();
    var pomoCycle = this._getPomoCycle();
    var totalSegSec = (this._segEnd - this._segStart) * 60;
    var totalPomos = Math.max(1, Math.floor(totalSegSec / pomoCycle));
    var donePomos = Math.floor(focusSec / pomoFocus);
    var inCurrent = focusSec - donePomos * pomoFocus;
    var activePct = donePomos < totalPomos ? Math.min(100, (inCurrent / pomoFocus) * 100) : 0;
    var color = (this._actInfo && this._actInfo.color) || '#f39c12';

    var html = '';
    for (var i = 0; i < totalPomos; i++) {
      var num = '<span class="focus-pomo-num">' + (i + 1) + '</span>';
      if (i < donePomos) {
        html += '<div class="focus-pomo-box focus-pomo-box--done" onclick="FocusMode._openPomoDialog()">' + num + '</div>';
      } else if (i === donePomos) {
        html += '<div class="focus-pomo-box focus-pomo-box--active" style="--pomo-color:' + color + '" onclick="FocusMode._openPomoDialog()">'
              + '<div class="focus-pomo-fill" style="height:' + activePct + '%;--pomo-color:' + color + '"></div>' + num + '</div>';
      } else {
        html += '<div class="focus-pomo-box focus-pomo-box--pending" onclick="FocusMode._openPomoDialog()">' + num + '</div>';
      }
    }
    els.pomoBoxes.innerHTML = html;

    // Update pomo countdown card
    var remainSec = donePomos < totalPomos ? Math.max(0, pomoFocus - inCurrent) : 0;
    var rm = Math.floor(remainSec / 60);
    var rs = Math.floor(remainSec % 60);
    var countdown = (rm < 10 ? '0' : '') + rm + ':' + (rs < 10 ? '0' : '') + rs;
    var countdownVal = document.getElementById('focus-pomo-countdown-value');
    var countdownLabel = document.getElementById('focus-pomo-countdown-label');
    var countdownFill = document.getElementById('focus-pomo-countdown-fill');
    if (countdownVal) countdownVal.textContent = countdown;
    if (countdownLabel) countdownLabel.textContent = '🍅 ' + (donePomos + 1) + ' / ' + totalPomos;
    if (countdownFill) {
      countdownFill.style.height = activePct + '%';
      countdownFill.style.background = 'linear-gradient(to top, ' + color + ', ' + color + '60)';
    }

    // Celebrate when a new pomodoro completes
    if (donePomos > this._lastDonePomos && this._lastDonePomos >= 0) {
      this._celebrate();
    }
    this._lastDonePomos = donePomos;
  },

  /**
   * Open the pomodoro duration dialog.
   */
  _openPomoDialog: function () {
    var current = typeof scheduleSettings !== 'undefined' ? scheduleSettings.pomoDuration : 45;
    this._pomoDialogValue = current;
    var valEl = document.getElementById('focus-pomo-dialog-value');
    if (valEl) valEl.textContent = current;
    // Highlight matching preset
    document.querySelectorAll('.focus-pomo-preset').forEach(function (btn) {
      btn.classList.toggle('active', parseInt(btn.dataset.val) === current);
    });
    document.getElementById('focus-pomo-dialog').classList.add('active');
  },

  _closePomoDialog: function () {
    document.getElementById('focus-pomo-dialog').classList.remove('active');
  },

  _savePomoDialog: function () {
    var val = this._pomoDialogValue;
    if (val < 10) val = 10;
    if (val > 90) val = 90;
    scheduleSettings.pomoDuration = val;
    // Persist to day settings
    var dateStr = this._date || document.getElementById('schedule-date').value;
    var dayData = ScheduleData.getDayOrDefault(dateStr);
    dayData.settings = JSON.parse(JSON.stringify(scheduleSettings));
    ScheduleData.saveDay(dateStr);
    // Update settings UI input if visible
    var inp = document.getElementById('pomo-duration-schedule');
    if (inp) inp.value = val;
    // Reset pomodoro tracking for new duration
    var focusSec = this._session ? this._session.totalFocusSec : 0;
    this._lastDonePomos = Math.floor(focusSec / this._getPomoFocus());
    this._closePomoDialog();
  },

  /**
   * Fire a celebration burst of stars and emoji particles.
   */
  _celebrate: function () {
    var els = this._getEls();
    if (!els.celebrate) return;

    var emojis = ['🌟', '⭐', '✨', '🎉', '🥳', '💪', '🔥', '👏', '💫', '🏆'];
    var count = 30;
    var html = '';
    for (var i = 0; i < count; i++) {
      var emoji = emojis[Math.floor(Math.random() * emojis.length)];
      var left = Math.random() * 100;
      var dur = 1.5 + Math.random() * 2;
      var delay = Math.random() * 0.8;
      var size = 1.2 + Math.random() * 1.2;
      html += '<span class="focus-celebrate-particle" style="'
            + 'left:' + left + '%;'
            + 'font-size:' + size + 'rem;'
            + 'animation-duration:' + dur + 's;'
            + 'animation-delay:' + delay + 's;'
            + '">' + emoji + '</span>';
    }
    els.celebrate.innerHTML = html;
    els.celebrate.classList.add('active');

    setTimeout(function () {
      els.celebrate.classList.remove('active');
      els.celebrate.innerHTML = '';
    }, 4000);
  },

  // ── Sound System (Web Audio API) ──────────────────────────────────────

  _ensureAudioCtx: function () {
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    return this._audioCtx;
  },

  _tickTock: 0, // alternates 0/1 for tick/tock
  _nudgeInterval: null,

  _playTick: function () {
    if (this._muted) return;
    var ctx = this._ensureAudioCtx();
    var t = ctx.currentTime;
    var isTock = this._tickTock;
    this._tickTock = 1 - this._tickTock;

    // Clock-like tick: sharp noise burst with resonant filter
    var bufSize = ctx.sampleRate * 0.02; // 20ms
    var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 8);
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;

    // Bandpass filter gives it the wooden clock character
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = isTock ? 1800 : 2200;
    filter.Q.value = 3;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(isTock ? 0.15 : 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
  },

  _playNudge: function () {
    if (this._muted) return;
    var ctx = this._ensureAudioCtx();
    var t = ctx.currentTime;

    // Two quick pings — "come back!"
    [660, 880].forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.15);
      gain.gain.setValueAtTime(0.1, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.18);
    });
  },

  _playPause: function () {
    if (this._muted) return;
    var ctx = this._ensureAudioCtx();
    var t = ctx.currentTime;

    // Gentle descending chime
    [520, 440, 330].forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.12);
      gain.gain.setValueAtTime(0.12, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.25);
    });
  },

  _playStart: function () {
    if (this._muted) return;
    var ctx = this._ensureAudioCtx();
    var t = ctx.currentTime;

    // Ascending chime
    [330, 440, 520].forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.1);
      gain.gain.setValueAtTime(0.12, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.2);
    });
  },

  _startTickSound: function () {
    this._stopTickSound();
    this._stopNudge();
    this._tickTock = 0;
    var self = this;
    this._tickInterval = setInterval(function () {
      if (self._running && !self._muted) self._playTick();
    }, 1000);
  },

  _stopTickSound: function () {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  },

  _startNudge: function () {
    this._stopNudge();
    var self = this;
    this._nudgeInterval = setInterval(function () {
      if (self._paused && !self._muted) self._playNudge();
    }, 5000);
  },

  _stopNudge: function () {
    if (this._nudgeInterval) {
      clearInterval(this._nudgeInterval);
      this._nudgeInterval = null;
    }
  },

  toggleMute: function () {
    this._muted = !this._muted;
    var icon = document.getElementById('focus-mute-icon');
    if (icon) icon.textContent = this._muted ? '🔇' : '🔊';
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

document.getElementById('focus-mute').addEventListener('click', function () {
  FocusMode.toggleMute();
});

// ── Pomodoro duration dialog ──
document.getElementById('focus-pomo-plus').addEventListener('click', function () {
  FocusMode._pomoDialogValue = Math.min(90, (FocusMode._pomoDialogValue || 45) + 5);
  document.getElementById('focus-pomo-dialog-value').textContent = FocusMode._pomoDialogValue;
  document.querySelectorAll('.focus-pomo-preset').forEach(function (b) {
    b.classList.toggle('active', parseInt(b.dataset.val) === FocusMode._pomoDialogValue);
  });
});

document.getElementById('focus-pomo-minus').addEventListener('click', function () {
  FocusMode._pomoDialogValue = Math.max(10, (FocusMode._pomoDialogValue || 45) - 5);
  document.getElementById('focus-pomo-dialog-value').textContent = FocusMode._pomoDialogValue;
  document.querySelectorAll('.focus-pomo-preset').forEach(function (b) {
    b.classList.toggle('active', parseInt(b.dataset.val) === FocusMode._pomoDialogValue);
  });
});

document.querySelectorAll('.focus-pomo-preset').forEach(function (btn) {
  btn.addEventListener('click', function () {
    FocusMode._pomoDialogValue = parseInt(btn.dataset.val);
    document.getElementById('focus-pomo-dialog-value').textContent = FocusMode._pomoDialogValue;
    document.querySelectorAll('.focus-pomo-preset').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.dataset.val) === FocusMode._pomoDialogValue);
    });
  });
});

document.getElementById('focus-pomo-save').addEventListener('click', function () {
  FocusMode._savePomoDialog();
});

document.getElementById('focus-pomo-cancel').addEventListener('click', function () {
  FocusMode._closePomoDialog();
});

document.getElementById('focus-pomo-dialog').addEventListener('click', function (e) {
  if (e.target === e.currentTarget) FocusMode._closePomoDialog();
});
