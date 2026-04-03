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

  _editingPomoIdx: null, // which box is being edited (null = adding new)
  _pauseCount: 0,       // how many times user paused/stopped

  _PAUSE_EMOJIS: ['😡','😭','😤','😠','😢','😳','🤯','🤬','😩','🥵'],

  _updatePauseDisplay: function () {
    var el = document.getElementById('focus-pause-count');
    if (!el) return;
    if (this._pauseCount <= 0) { el.textContent = ''; return; }
    var emoji = this._PAUSE_EMOJIS[Math.floor(Math.random() * this._PAUSE_EMOJIS.length)];
    el.textContent = this._pauseCount + '× ' + emoji;
  },

  _getPomoKey: function () {
    return this._actInfo ? 'pomo_' + this._actInfo.name : null;
  },

  _getDefaultPomoDur: function () {
    return (typeof scheduleSettings !== 'undefined' && scheduleSettings.pomoDuration
      ? scheduleSettings.pomoDuration : 45);
  },

  // Get array of per-box durations in minutes, e.g. [50, 20, 45]
  _getPomoList: function () {
    var key = this._getPomoKey();
    if (key) {
      var raw = localStorage.getItem(key);
      if (raw) {
        try { var arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; } catch (e) {}
      }
    }
    // Auto-generate from segment duration using default
    var def = this._getDefaultPomoDur();
    var totalMin = (this._segEnd - this._segStart);
    var count = Math.max(1, Math.floor(totalMin / (def + 15)));
    var list = [];
    for (var i = 0; i < count; i++) list.push(def);
    return list;
  },

  _savePomoList: function (list) {
    var key = this._getPomoKey();
    if (key) localStorage.setItem(key, JSON.stringify(list));
  },

  _getEls: function () {
    if (this._els) return this._els;
    this._els = {
      overlay: document.getElementById('focus-overlay'),
      icon: document.getElementById('focus-icon'),
      actName: document.getElementById('focus-act-name'),
      elapsedTimer: document.getElementById('focus-elapsed-timer'),
      segRemaining: document.getElementById('focus-seg-remaining'),
      segGone: document.getElementById('focus-seg-gone'),
      segRange: document.getElementById('focus-seg-range'),
      totalTime: document.getElementById('focus-total-time'),
      btnPause: document.getElementById('focus-btn-pause'),
      pauseIcon: document.querySelector('#focus-btn-pause .focus-pause-icon'),
      wave: document.getElementById('focus-wave'),
      timerLabel: document.querySelector('.focus-timer-label'),
      deleteBtn: document.getElementById('focus-delete-btn'),
      note: document.getElementById('focus-note'),
      pomoBoxes: document.getElementById('focus-pomo-boxes'),
      celebrate: document.getElementById('focus-celebrate')
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
    this._pauseCount = existingSession ? (existingSession._pauseCount || 0) : 0;
    this._updatePauseDisplay();

    // Initialize pomodoro tracking (set to current done count so celebration doesn't fire on open)
    var initFocus = existingSession ? existingSession.totalFocusSec : 0;
    var initList = this._getPomoList();
    var cum = 0;
    this._lastDonePomos = 0;
    for (var pi = 0; pi < initList.length; pi++) {
      cum += initList[pi] * 60;
      if (initFocus >= cum) this._lastDonePomos = pi + 1;
      else break;
    }

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

    // Sound & motivation
    this._playStart();
    this._stopNudge();
    this._showStartMessage();

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

    // Pause counter
    this._pauseCount++;
    if (this._session) this._session._pauseCount = this._pauseCount;
    this._updatePauseDisplay();

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

    // Auto-close when segment time is up
    if (segRemaining <= 0) {
      this.close();
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

    // Focus percentage (all focus in this segment / segment duration)
    this._updateSegmentPct(totalElapsed, totalSegDur);
    this._updateTodayTotal(totalElapsed);

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
      // Auto-close when segment ends (even if paused)
      if (left <= 0 && self._session) {
        self.close();
      }
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

      // Focus percentage & today total
      var totalSegDur = (sE - sS) * 60;
      self._updateSegmentPct(total, totalSegDur);
      self._updateTodayTotal(total);

      // Wave: fills from activity-info top upward based on focus progress
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
  _updateSegmentPct: function (currentSessionSec, segDurSec) {
    var pctEl = document.getElementById('focus-pct');
    if (!pctEl) return;
    var pct = segDurSec > 0 ? Math.min(100, (currentSessionSec / segDurSec) * 100) : 0;
    pctEl.textContent = Math.floor(pct) + '%';
  },

  _updateTodayTotal: function (currentSessionSec) {
    var el = document.getElementById('focus-today-total');
    if (!el || !this._date) return;
    // Sum all other sessions for today
    var allSessions = FocusData.get(this._date) || [];
    var otherTotal = 0;
    var currentId = this._session ? this._session.id : null;
    for (var i = 0; i < allSessions.length; i++) {
      if (allSessions[i].id !== currentId) {
        otherTotal += allSessions[i].totalFocusSec || 0;
      }
    }
    el.textContent = LiveTimer.format(otherTotal + currentSessionSec);
  },

  _updatePomodoro: function (focusSec) {
    var els = this._getEls();
    if (!els.pomoBoxes) return;

    var list = this._getPomoList();
    var totalPomos = list.length;
    var color = (this._actInfo && this._actInfo.color) || '#f39c12';

    // Find which box is active based on cumulative durations
    var cumulative = 0;
    var donePomos = 0;
    var inCurrent = 0;
    var activeDur = list[0] * 60;
    for (var p = 0; p < totalPomos; p++) {
      var boxSec = list[p] * 60;
      if (focusSec >= cumulative + boxSec) {
        cumulative += boxSec;
        donePomos = p + 1;
      } else {
        inCurrent = focusSec - cumulative;
        activeDur = boxSec;
        break;
      }
    }
    var activePct = donePomos < totalPomos ? Math.min(100, (inCurrent / activeDur) * 100) : 0;

    var html = '';
    for (var i = 0; i < totalPomos; i++) {
      var num = '<span class="focus-pomo-num">' + list[i] + '</span>';
      if (i < donePomos) {
        html += '<div class="focus-pomo-box focus-pomo-box--done" data-pomo-idx="' + i + '">' + num + '</div>';
      } else if (i === donePomos) {
        html += '<div class="focus-pomo-box focus-pomo-box--active" data-pomo-idx="' + i + '" style="--pomo-color:' + color + '">'
          + '<div class="focus-pomo-fill" style="height:' + activePct + '%;--pomo-color:' + color + '"></div>' + num + '</div>';
      } else {
        html += '<div class="focus-pomo-box focus-pomo-box--pending" data-pomo-idx="' + i + '">' + num + '</div>';
      }
    }
    // Add "+" button
    html += '<div class="focus-pomo-box focus-pomo-box--add" data-pomo-idx="add">+</div>';
    // Only update DOM when HTML actually changes (prevents click interception)
    if (els.pomoBoxes._lastHtml !== html) {
      els.pomoBoxes.innerHTML = html;
      els.pomoBoxes._lastHtml = html;
    }

    // Update pomo countdown card
    var remainSec = donePomos < totalPomos ? Math.max(0, activeDur - inCurrent) : 0;
    var rm = Math.floor(remainSec / 60);
    var rs = Math.floor(remainSec % 60);
    var countdown = (rm < 10 ? '0' : '') + rm + ':' + (rs < 10 ? '0' : '') + rs;
    var countdownVal = document.getElementById('focus-pomo-countdown-value');
    var countdownLabel = document.getElementById('focus-pomo-countdown-label');
    var countdownFill = document.getElementById('focus-pomo-countdown-fill');
    if (countdownVal) countdownVal.textContent = countdown;
    if (countdownLabel) countdownLabel.textContent = '🍅 ' + donePomos + ' / ' + totalPomos;
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
  _openPomoDialog: function (idx) {
    // idx = box index to edit, null = add new
    this._editingPomoIdx = idx;
    var list = this._getPomoList();
    var current = (idx !== null && idx < list.length) ? list[idx] : this._getDefaultPomoDur();
    this._pomoDialogValue = current;

    var valEl = document.getElementById('focus-pomo-dialog-value');
    if (valEl) valEl.textContent = current;

    var titleEl = document.querySelector('.focus-pomo-dialog-title');
    var delBtn = document.getElementById('focus-pomo-delete');
    if (idx !== null) {
      if (titleEl) titleEl.textContent = 'بومودورو ' + (idx + 1);
      if (delBtn) delBtn.style.display = '';
    } else {
      if (titleEl) titleEl.textContent = 'إضافة بومودورو';
      if (delBtn) delBtn.style.display = 'none';
    }

    document.querySelectorAll('.focus-pomo-preset').forEach(function (btn) {
      btn.classList.toggle('active', parseInt(btn.dataset.val) === current);
    });
    document.getElementById('focus-pomo-dialog').classList.add('active');
  },

  _closePomoDialog: function () {
    document.getElementById('focus-pomo-dialog').classList.remove('active');
    this._editingPomoIdx = null;
  },

  _savePomoDialog: function () {
    var val = this._pomoDialogValue;
    if (val < 5) val = 5;
    if (val > 120) val = 120;

    var list = this._getPomoList();
    if (this._editingPomoIdx !== null && this._editingPomoIdx < list.length) {
      list[this._editingPomoIdx] = val;
    } else {
      list.push(val);
    }
    this._savePomoList(list);

    // Reset celebration tracking
    var focusSec = this._session ? this._session.totalFocusSec : 0;
    var cum = 0;
    this._lastDonePomos = 0;
    for (var i = 0; i < list.length; i++) {
      cum += list[i] * 60;
      if (focusSec >= cum) this._lastDonePomos = i + 1;
      else break;
    }
    this._closePomoDialog();
  },

  _deletePomoBox: function () {
    if (this._editingPomoIdx === null) return;
    var list = this._getPomoList();
    if (list.length <= 1) return; // keep at least one
    list.splice(this._editingPomoIdx, 1);
    this._savePomoList(list);

    var focusSec = this._session ? this._session.totalFocusSec : 0;
    var cum = 0;
    this._lastDonePomos = 0;
    for (var i = 0; i < list.length; i++) {
      cum += list[i] * 60;
      if (focusSec >= cum) this._lastDonePomos = i + 1;
      else break;
    }
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

    // Play celebration fanfare
    this._playCelebration();

    setTimeout(function () {
      els.celebrate.classList.remove('active');
      els.celebrate.innerHTML = '';
    }, 4000);
  },

  _playCelebration: function () {
    if (this._muted) return;
    var ctx = this._ensureAudioCtx();
    var t = ctx.currentTime;

    // ── Fanfare melody: rising triumphant notes ──
    var melody = [
      { f: 523, t: 0,    d: 0.15 },  // C5
      { f: 659, t: 0.12, d: 0.15 },  // E5
      { f: 784, t: 0.24, d: 0.15 },  // G5
      { f: 1047,t: 0.36, d: 0.4  },  // C6 (hold)
      { f: 784, t: 0.7,  d: 0.12 },  // G5
      { f: 1047,t: 0.82, d: 0.5  },  // C6 (final hold)
    ];

    melody.forEach(function (n) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t + n.t);
      gain.gain.setValueAtTime(0.15, t + n.t);
      gain.gain.setValueAtTime(0.15, t + n.t + n.d * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + n.t);
      osc.stop(t + n.t + n.d + 0.05);
    });

    // ── Sparkle layer: high shimmering notes ──
    var sparkles = [
      { f: 2093, t: 0.4,  d: 0.2 },
      { f: 2637, t: 0.6,  d: 0.2 },
      { f: 3136, t: 0.8,  d: 0.15 },
      { f: 2093, t: 1.0,  d: 0.15 },
      { f: 2637, t: 1.15, d: 0.15 },
      { f: 3520, t: 1.3,  d: 0.3 },
    ];

    sparkles.forEach(function (n) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f, t + n.t);
      gain.gain.setValueAtTime(0.06, t + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + n.t);
      osc.stop(t + n.t + n.d + 0.05);
    });

    // ── Bass boom ──
    var bass = ctx.createOscillator();
    var bassGain = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(130, t + 0.35);
    bass.frequency.exponentialRampToValueAtTime(65, t + 0.9);
    bassGain.gain.setValueAtTime(0.2, t + 0.35);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    bass.connect(bassGain);
    bassGain.connect(ctx.destination);
    bass.start(t + 0.35);
    bass.stop(t + 1.3);
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
  _nudgeStartMessages: [
    ['🔥', 'يلا نبدأ بقوة!'],
    ['💪', 'عفارم عليك!'],
    ['🌟', 'ابداعك اليوم يصنع مستقبلك'],
    ['🧠', 'ركز… أنت قدها!'],
    ['🚀', 'انطلق ولا تتردد'],
    ['✨', 'سبحان الله وبحمده سبحان الله العظيم'],
    ['🤲', 'اللهم صلِّ على سيدنا محمد'],
    ['🎯', 'هدفك واضح… اضرب بقوة'],
    ['😎', 'عشت عشت!'],
    ['⚡', 'دقيقة تركيز = إنجاز كبير'],
    ['📈', 'كل خطوة تقربك للنجاح'],
    ['🧩', 'حلها وحدة وحدة'],
    ['💡', 'فكرة اليوم ممكن تغيّر كل شيء'],
    ['🏁', 'ابدأ الآن… لا تنتظر'],
    ['🔒', 'اغلق المشتتات وابدأ'],
    ['⏳', 'وقتك الآن… استغله'],
    ['🛠️', 'اشتغل بصمت… ودع النتائج تتكلم'],
    ['🌿', 'بسم الله نبدأ'],
    ['📊', 'خلّ الإنجاز يتراكم'],
    ['❤️', 'شغلك هذا عبادة إذا أخلصت النية'],

    ['🚨', 'ارجع للشغل!'],
    ['👀', 'ركز شوي!'],
    ['📌', 'لا تضيّع الهدف'],
    ['🧭', 'اتجه نحو إنجازك'],
    ['🏹', 'صوّب على هدفك'],
    ['🌄', 'بداية جديدة اليوم'],
    ['🌞', 'يومك ينتظر إنجازك'],
    ['🎬', 'ابدأ المشهد الآن'],
    ['🧗', 'خطوة فوق خطوة'],
    ['🪜', 'اصعد درجة درجة'],
    ['📚', 'تعلم واشتغل'],
    ['🧾', 'أنجز مهمتك التالية'],
    ['📅', 'التزم بخطتك'],
    ['🔁', 'استمر ولا تتوقف'],
    ['🧘', 'هدوء وتركيز'],
    ['🧠', 'شغل عقلك الآن'],
    ['🕒', 'ابدأ قبل ما يضيع الوقت'],
    ['⌛', 'كل ثانية تفرق'],
    ['📍', 'أنت في المكان الصحيح'],
    ['🧪', 'جرّب وابدأ'],

    ['🌊', 'تدفّق مع العمل'],
    ['🎵', 'ادخل مود الإنتاج'],
    ['🕹️', 'ابدأ اللعب الحقيقي'],
    ['🏋️', 'تمرّن على التركيز'],
    ['🥇', 'كن الأول اليوم'],
    ['🎖️', 'استحق إنجازك'],
    ['🧱', 'ابنِ نجاحك'],
    ['🛤️', 'امشِ على الطريق'],
    ['🚶', 'تحرك الآن'],
    ['🏃', 'ابدأ بسرعة'],
    ['🚦', 'الإشارة خضراء'],
    ['🛫', 'انطلق'],
    ['🛸', 'ابدأ بدون تردد'],
    ['🌌', 'فكّر بشكل أكبر'],
    ['🧿', 'عينك على الهدف'],
    ['📡', 'التقط تركيزك'],
    ['🔍', 'دقق في عملك'],
    ['🧯', 'اطفئ المشتتات'],
    ['🪄', 'اصنع الفرق'],
    ['🧭', 'وجّه طاقتك'],

    ['💥', 'اضرب بقوة'],
    ['⚔️', 'قاتل الكسل'],
    ['🛡️', 'احمِ وقتك'],
    ['🎲', 'ابدأ اللعبة'],
    ['🎯', 'إصابة مباشرة'],
    ['🏆', 'الإنجاز بانتظارك'],
    ['🎉', 'خلّها إنجاز!'],
    ['📣', 'يلا شد حيلك'],
    ['🫵', 'أنت! نعم أنت!'],
    ['🤝', 'وعد نفسك بالإنجاز'],
    ['🪙', 'كل دقيقة كنز'],
    ['📦', 'أنهِ هذه المهمة'],
    ['📬', 'سلّم المهمة'],
    ['🗂️', 'رتّب وابدأ'],
    ['📎', 'ابدأ من هنا'],
    ['📍', 'ابدأ الآن'],
    ['🖊️', 'اكتب وابدأ'],
    ['⌨️', 'ابدأ العمل'],
    ['🖥️', 'ركز على الشاشة'],
    ['📱', 'اترك الهاتف واشتغل'],

    ['🔋', 'طاقتك جاهزة'],
    ['🔌', 'اشحن تركيزك'],
    ['⚙️', 'شغّل المحرك'],
    ['🧰', 'استخدم أدواتك'],
    ['🪛', 'ابدأ الإصلاح'],
    ['🧠', 'فكر ثم نفّذ'],
    ['📊', 'راقب تقدمك'],
    ['📉', 'قلّل المشتتات'],
    ['📈', 'ارفع الإنتاجية'],
    ['🧭', 'ارجع للمسار'],
    ['🛑', 'أوقف التسويف'],
    ['🚫', 'لا للتأجيل'],
    ['✔️', 'ابدأ وانجز'],
    ['☑️', 'مهمة جديدة'],
    ['🗳️', 'اختر الإنجاز'],
    ['📥', 'ابدأ الآن'],
    ['📤', 'سلّم العمل'],
    ['🧾', 'أكمل المطلوب'],
    ['🪄', 'ابدأ السحر'],
    ['💫', 'لحظة إنجاز قادمة']
  ],

  _nudgeMessages: [
    ['😤', 'ارجع للشغل!'],
    ['🫵', 'أنت! نعم أنت!'],
    ['💀', 'الوقت يضيع...'],
    ['🏃', 'يلا يلا يلا!'],
    ['😴', 'نايم؟!'],
    ['👀', 'شو عم تعمل؟'],
    ['🔥', 'حماسك وين راح؟'],
    ['😡', 'كفى كسل!'],
    ['🐌', 'أسرع من هيك!'],
    ['⏰', 'تيك توك تيك توك'],
    ['💪', 'قوم اشتغل!'],
    ['🧠', 'دماغك بيصدي!'],
    ['☕', 'خلصت القهوة؟ يلا!'],
    ['🚀', 'أطلق نفسك!'],
    ['💸', 'الفقر عم يناديك!'],
    ['📱', 'التيك توك ما بيطعمي خبز!'],
    ['🧟', 'صرت تشبه الزومبي، تحرك!'],
    ['📉', 'رصيدك بالبنك عم يبكي بالزاوية!'],
    ['🚶‍♂️', 'حتى السلحفاة سبقتك!'],
    ['🤡', 'شكلك وأنت مأجل الشغل بضحّك!'],
    ['🧗', 'القمة بدها تعب، مو سدحة!'],
    ['🪑', 'الكرسي مَلّ منك، قوم انجز!'],
    ['🍟', 'بدك تاكل؟ اشتغل أول!'],
    ['👑', 'المجد ما بيجي وأنت نايم!'],
    ['🧼', 'قوم غسل وجهك وصحصح!'],
    ['🦁', 'خليك أسد وانقضّ على المهام!'],
    ['🛰️', 'ناسا عم تنتظرك.. أو يمكن لا!'],
    ['🍕', 'البيتزا بدها فلوس، والفلوس بدها شغل!'],
    ['🌪️', 'خليك إعصار، لا تكن غبار!'],
    ['🥊', 'اضرب الكسل بالضربة القاضية!'],
    ['🎯', 'الهدف عم يهرب منك، الحقه!'],
    ['🧛', 'الوقت عم يمص دمك، انتبه!'],
    ['🏋️', 'شغل عضلات مخك شوي!'],
    ['🏁', 'الكل وصل للنهاية وأنت لسه عم تسخن!'],

    ['😏', 'يا رجل اقعد جاي'],
    ['😒', 'طوّل بالك؟ لا تطوّل كثير!'],
    ['🙄', 'شو هالاستراحة الطويلة؟'],
    ['😴', 'خلص النوم ولا لسا؟'],
    ['📵', 'سكر الجوال وارجع'],
    ['👣', 'وين رايح؟ ارجع مكانك'],
    ['🪫', 'طاقة صفر؟ اشحن واشتغل'],
    ['🤏', 'بس دقيقة… صارت ساعة!'],
    ['⛔', 'توقف كفاية، رجّع التشغيل'],
    ['🧃', 'خلص العصير؟ يلا كفاية'],
    ['📺', 'التلفزيون مش أولوية الآن'],
    ['🎮', 'اللعبة بتستنى، الشغل لا'],
    ['🛑', 'وقف التسويف فورًا'],
    ['🔁', 'ارجع للمود الآن'],
    ['🧭', 'ضعت؟ ارجع للمسار'],
    ['🪑', 'قعدة زيادة عن اللزوم'],
    ['😬', 'هيك يعني؟ خلصت اليوم؟'],
    ['📍', 'مكانك المكتب مو الكنبة'],
    ['🪶', 'خفّ عليك، مو إجازة'],
    ['🥱', 'كفاية تثاؤب!'],

    ['😤', 'ارجع ركّز شوي'],
    ['👊', 'شد حالك'],
    ['⚡', 'افتح وضع الإنتاج'],
    ['🔓', 'افتح المهمة وابدأ'],
    ['📌', 'لا تترك الهدف'],
    ['🧠', 'شغّل مخك'],
    ['⌛', 'الوقت عم يهرب'],
    ['📉', 'إنتاجك نازل!'],
    ['📈', 'ارفع الأداء الآن'],
    ['🧨', 'فجّر طاقتك'],
    ['🚧', 'توقفك عائق'],
    ['🧱', 'كمّل البناء'],
    ['🧵', 'لا تقطع الخيط'],
    ['🧩', 'كمّل اللغز'],
    ['🔍', 'ارجع كمل التفاصيل'],
    ['🗂️', 'ملفاتك بتناديك'],
    ['📎', 'المهمة معلّقة'],
    ['🖊️', 'رجّع القلم يشتغل'],
    ['⌨️', 'الكيبورد اشتاق لك'],
    ['🖥️', 'الشاشة فاضية!'],

    ['🧊', 'بردت زيادة! سخّن'],
    ['🔥', 'وين الحماس؟'],
    ['💤', 'قيلولة كفاية'],
    ['🧃', 'استراحة ثانية؟ مبالغ!'],
    ['🍪', 'خلص السناك؟ يلا'],
    ['🍔', 'مو وقت أكل'],
    ['☕', 'قهوة ثانية؟ لا، شغل!'],
    ['🥤', 'اشرب وارجع'],
    ['🚿', 'صحصحت؟ ابدأ'],
    ['🪞', 'خلصت تتفرج؟ اشتغل'],
    ['📦', 'التسليم قريب!'],
    ['📬', 'في مهام تنتظر'],
    ['📊', 'الأرقام بدها شغل'],
    ['🧮', 'الحسابات عليك'],
    ['🧾', 'الفواتير مش لحالها'],
    ['🛠️', 'الأدوات جاهزة'],
    ['⚙️', 'شغّل الماكينة'],
    ['🔌', 'وصل وابدأ'],
    ['🔋', 'اشحن تركيزك'],
    ['🧯', 'اطفئ المشتتات'],

    ['🧗', 'ارجع تسلّق'],
    ['🏃‍♂️', 'ارجع للسباق'],
    ['🏁', 'النهاية قريبة'],
    ['🎯', 'الهدف قدامك'],
    ['🏹', 'صوّب من جديد'],
    ['🥊', 'اضرب الكسل'],
    ['🛡️', 'احمِ وقتك'],
    ['⚔️', 'قاتل التأجيل'],
    ['🦾', 'قوّي عزيمتك'],
    ['🦿', 'وقف وامشِ'],
    ['🚀', 'أعد الإقلاع'],
    ['🛫', 'انطلق مرة ثانية'],
    ['🛬', 'لا تهبط الآن'],
    ['🌪️', 'ارجع إعصار'],
    ['🌊', 'ارجع للتدفّق'],
    ['🌞', 'يومك ما خلص'],
    ['🌙', 'لسا في وقت'],
    ['⭐', 'لا تطفئ نجمك'],
    ['💫', 'لحظة إنجاز قادمة'],
    ['✨', 'كمّل التألق'],

    ['🤨', 'عنجد وقفت؟'],
    ['😑', 'هيك يعني؟'],
    ['😶', 'ساكت ليش؟ اشتغل'],
    ['😅', 'استراحة طويلة شوي!'],
    ['😂', 'عم تضحك؟ اشتغل'],
    ['😈', 'الكسل فاز عليك؟'],
    ['🤖', 'ارجع روبوت إنتاج'],
    ['👻', 'اختفيت؟ ارجع'],
    ['🧟', 'لا تصير زومبي'],
    ['🕳️', 'لا تغرق بالراحة'],
    ['📵', 'ابعد عن الهاتف'],
    ['🔕', 'صامت واشتغل'],
    ['🧠', 'تركيزك ضايع'],
    ['🪤', 'وقعت بفخ التسويف'],
    ['🧊', 'بارد زيادة!'],
    ['🧨', 'انفجر شغل'],
    ['📍', 'ارجع لمهمتك'],
    ['🗳️', 'اختر الشغل'],
    ['✔️', 'ارجع أنجز'],
    ['🚨', 'تنبيه: ارجع للعمل الآن']

  ],
  _lastNudgeIdx: -1,

  _playNudge: function () {
    // Pick a random message (avoid repeating the last one)
    var idx;
    do {
      idx = Math.floor(Math.random() * this._nudgeMessages.length);
    } while (idx === this._lastNudgeIdx && this._nudgeMessages.length > 1);
    this._lastNudgeIdx = idx;
    var msg = this._nudgeMessages[idx];

    this._showNudgeAnimation(msg[0], msg[1]);

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

  _showNudgeAnimation: function (emoji, text) {
    var els = this._getEls();
    if (!els.celebrate) return;

    var html = '<div class="focus-nudge-msg">'
      + '<span class="focus-nudge-emoji">' + emoji + '</span>'
      + '<span class="focus-nudge-text">' + text + '</span>'
      + '</div>';
    els.celebrate.innerHTML = html;
    els.celebrate.classList.add('active', 'nudge-active');
    els.celebrate.style.pointerEvents = 'auto';
    els.celebrate.style.cursor = 'pointer';

    var self = this;
    var nudgeTimeout = setTimeout(function () {
      els.celebrate.classList.remove('active', 'nudge-active');
      els.celebrate.style.pointerEvents = '';
      els.celebrate.style.cursor = '';
      els.celebrate.innerHTML = '';
      els.celebrate.onclick = null;
    }, 8000);

    els.celebrate.onclick = function () {
      clearTimeout(nudgeTimeout);
      els.celebrate.classList.remove('active', 'nudge-active');
      els.celebrate.style.pointerEvents = '';
      els.celebrate.style.cursor = '';
      els.celebrate.innerHTML = '';
      els.celebrate.onclick = null;
      self.start();
    };
  },

  _lastStartIdx: -1,

  _showStartMessage: function () {
    var msgs = this._nudgeStartMessages;
    if (!msgs || !msgs.length) return;
    var idx;
    do {
      idx = Math.floor(Math.random() * msgs.length);
    } while (idx === this._lastStartIdx && msgs.length > 1);
    this._lastStartIdx = idx;
    var msg = msgs[idx];

    var els = this._getEls();
    if (!els.celebrate) return;

    var html = '<div class="focus-nudge-msg focus-start-msg">'
      + '<span class="focus-nudge-emoji">' + msg[0] + '</span>'
      + '<span class="focus-nudge-text">' + msg[1] + '</span>'
      + '</div>';
    els.celebrate.innerHTML = html;
    els.celebrate.classList.add('active', 'nudge-active');
    els.celebrate.style.pointerEvents = 'none';
    els.celebrate.onclick = null;

    setTimeout(function () {
      els.celebrate.classList.remove('active', 'nudge-active');
      els.celebrate.innerHTML = '';
    }, 3000);
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
  // While stopped
  _startNudge: function () {
    this._stopNudge();
    var self = this;
    this._nudgeInterval = setInterval(function () {
      if (self._paused && !self._muted) self._playNudge();
    }, 30000);
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

// Prevent clicks in the action row from propagating to timer toggle areas
document.querySelector('.focus-header-top').addEventListener('click', function (e) {
  e.stopPropagation();
});

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

// ── Pomodoro box clicks (delegated) ──
document.getElementById('focus-pomo-boxes').addEventListener('click', function (e) {
  var box = e.target.closest('.focus-pomo-box');
  if (!box) return;
  e.stopPropagation();
  var idx = box.dataset.pomoIdx;
  if (idx === 'add') {
    FocusMode._openPomoDialog(null);
  } else {
    FocusMode._openPomoDialog(parseInt(idx, 10));
  }
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

document.getElementById('focus-pomo-delete').addEventListener('click', function () {
  FocusMode._deletePomoBox();
});

document.getElementById('focus-pomo-dialog').addEventListener('click', function (e) {
  if (e.target === e.currentTarget) FocusMode._closePomoDialog();
});
