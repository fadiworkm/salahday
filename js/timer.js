/**
 * LiveTimer — reusable real-time timer component with seconds precision.
 *
 * Usage:
 *   LiveTimer.clear();
 *   LiveTimer.countdown(el, targetMinutes, 'بعد', onExpireFn);
 *   LiveTimer.elapsed(el, startMinutes, 'منذ');
 *   LiveTimer.pie(el, startMinutes, endMinutes);
 *   LiveTimer.progress(fillEl, goneEl, leftEl, computeFn);
 *   LiveTimer.start();
 */
var LiveTimer = {
  _items: [],
  _interval: null,

  /** Seconds since midnight */
  now: function () {
    var d = new Date();
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  },

  /** Format total seconds → "H:MM:SS" or "M:SS" */
  format: function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  },

  /** Clear all registered entries */
  clear: function () { this._items = []; },

  /**
   * Register a countdown display (time remaining to target).
   * @param {Element} el     - element whose textContent is updated
   * @param {number} targetMin - target time in minutes since midnight
   * @param {string} [prefix]  - text before the time, e.g. "بعد"
   * @param {Function} [onExpire] - called once when countdown reaches 0
   */
  countdown: function (el, targetMin, prefix, onExpire) {
    if (!el) return;
    this._items.push({ t: 'cd', el: el, target: targetMin * 60, pfx: prefix || '', expire: onExpire, fired: false });
  },

  /**
   * Register an elapsed display (time since start).
   */
  elapsed: function (el, startMin, prefix) {
    if (!el) return;
    this._items.push({ t: 'el', el: el, start: startMin * 60, pfx: prefix || '' });
  },

  /**
   * Register a pie/conic-gradient chart.
   */
  pie: function (el, startMin, endMin) {
    if (!el) return;
    this._items.push({ t: 'pie', el: el, start: startMin * 60, end: endMin * 60 });
  },

  /**
   * Register a progress bar with gone/left labels.
   * @param {Element} fillEl  - the .wp-fill bar element (width updated)
   * @param {Element} goneEl  - element for elapsed text
   * @param {Element} leftEl  - element for remaining text
   * @param {Function} computeFn - fn(nowSec) → { gone: seconds, left: seconds }
   */
  progress: function (fillEl, goneEl, leftEl, computeFn) {
    this._items.push({ t: 'pg', fillEl: fillEl, goneEl: goneEl, leftEl: leftEl, fn: computeFn });
  },

  /** Start the 1-second tick */
  start: function () {
    this.stop();
    var self = this;
    self._tick();
    self._interval = setInterval(function () { self._tick(); }, 1000);
  },

  /** Stop ticking */
  stop: function () {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  },

  /* ── internal ── */

  _tick: function () {
    var ns = this.now();
    var self = this;
    var expireFn = null;

    this._items.forEach(function (it) {
      if (it.t === 'cd') {
        var rem = it.target - ns;
        if (rem <= 0) {
          it.el.textContent = it.pfx + ' 0:00';
          if (it.expire && !it.fired) { it.fired = true; expireFn = it.expire; }
          return;
        }
        it.el.textContent = it.pfx + ' ' + self.format(rem);

      } else if (it.t === 'el') {
        it.el.textContent = it.pfx + ' ' + self.format(Math.max(0, ns - it.start));

      } else if (it.t === 'pie') {
        var total = it.end - it.start;
        var pct = total > 0 ? Math.min(100, Math.max(0, ((ns - it.start) / total) * 100)) : 0;
        var ang = (pct / 100) * 360;
        it.el.style.background =
          'conic-gradient(var(--gold) 0deg,var(--gold) ' + ang + 'deg,' +
          'rgba(78,205,196,0.2) ' + ang + 'deg,rgba(78,205,196,0.2) 360deg)';

      } else if (it.t === 'pg') {
        var r = it.fn(ns);
        var total = r.gone + r.left;
        var pct = total > 0 ? ((r.gone / total) * 100).toFixed(1) : 0;
        if (it.fillEl) it.fillEl.style.width = pct + '%';
        if (it.goneEl) it.goneEl.textContent = self.format(r.gone);
        if (it.leftEl) it.leftEl.textContent = self.format(r.left);
      }
    });

    if (expireFn) expireFn();
  }
};
