/**
 * TickSlider — reusable tick-mark slider component
 *
 * Usage:
 *   TickSlider.init(rangeInput, {
 *     interval: 30,           // tick every N minutes (default 30)
 *     color: '#4ecdc4',       // tick/value color (optional, inherits --tick-slider-color)
 *     valueEl: element,       // existing value display element (optional, auto-creates one)
 *     unit: 'دقيقة',          // unit label after value (optional)
 *     onChange: fn(value)      // callback on value change
 *   });
 *
 *   TickSlider.refresh(rangeInput);  // call after changing min/max dynamically
 */
var TickSlider = (function () {
  'use strict';

  var instances = new Map();

  function init(slider, opts) {
    opts = opts || {};
    var interval = opts.interval || 30;

    // Wrap slider in tick-slider container
    var wrap = document.createElement('div');
    wrap.className = 'tick-slider-wrap';
    if (opts.color) {
      wrap.style.setProperty('--tick-slider-color', opts.color);
    }

    slider.parentNode.insertBefore(wrap, slider);
    wrap.appendChild(slider);

    // Value display
    var valueEl = opts.valueEl;
    if (valueEl) {
      wrap.appendChild(valueEl);
    } else {
      valueEl = document.createElement('span');
      valueEl.className = 'tick-slider-value';
      valueEl.textContent = slider.value;
      wrap.appendChild(valueEl);
    }

    // Ticks container
    var ticksEl = document.createElement('div');
    ticksEl.className = 'tick-slider-ticks';
    wrap.appendChild(ticksEl);

    var instance = {
      slider: slider,
      wrap: wrap,
      valueEl: valueEl,
      ticksEl: ticksEl,
      interval: interval,
      onChange: opts.onChange || null
    };

    instances.set(slider, instance);

    renderTicks(instance);

    // Listen to input
    slider.addEventListener('input', function () {
      updateValue(instance);
    });

    updateValue(instance);

    return instance;
  }

  function renderTicks(inst) {
    var slider = inst.slider;
    var min = parseInt(slider.min) || 0;
    var max = parseInt(slider.max) || 100;
    var interval = inst.interval;
    var ticksEl = inst.ticksEl;

    ticksEl.innerHTML = '';

    // Generate ticks at interval positions (skip min and max)
    var firstTick = Math.ceil(min / interval) * interval;
    if (firstTick === min) firstTick += interval;

    for (var val = firstTick; val < max; val += interval) {
      var pct = ((val - min) / (max - min)) * 100;

      var tick = document.createElement('span');
      tick.className = 'tick-slider-tick';
      // RTL: use 'right' positioning
      tick.style.right = pct + '%';

      var label = document.createElement('span');
      label.className = 'tick-slider-tick-label';
      label.textContent = val;
      tick.appendChild(label);

      tick.dataset.value = val;
      tick.addEventListener('click', (function (v) {
        return function () {
          slider.value = v;
          slider.dispatchEvent(new Event('input', { bubbles: true }));
        };
      })(val));

      ticksEl.appendChild(tick);
    }
  }

  function updateValue(inst) {
    inst.valueEl.textContent = inst.slider.value;
    if (inst.onChange) inst.onChange(parseInt(inst.slider.value));
  }

  function refresh(slider) {
    var inst = instances.get(slider);
    if (inst) {
      renderTicks(inst);
      updateValue(inst);
    }
  }

  function setColor(slider, color) {
    var inst = instances.get(slider);
    if (inst) {
      inst.wrap.style.setProperty('--tick-slider-color', color);
    }
  }

  return {
    init: init,
    refresh: refresh,
    setColor: setColor
  };
})();
