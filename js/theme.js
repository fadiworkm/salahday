// Apply saved theme immediately (before paint)
(function () {
  var saved = localStorage.getItem('theme-preference');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

document.addEventListener('DOMContentLoaded', function () {
  var SUN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f4c430" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="5"/>'
    + '<line x1="12" y1="1" x2="12" y2="3"/>'
    + '<line x1="12" y1="21" x2="12" y2="23"/>'
    + '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>'
    + '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>'
    + '<line x1="1" y1="12" x2="3" y2="12"/>'
    + '<line x1="21" y1="12" x2="23" y2="12"/>'
    + '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>'
    + '<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    + '</svg>';

  var MOON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#7c6aef" stroke="#7c6aef" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>'
    + '</svg>';

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function getIcon() {
    return isLight() ? MOON_SVG : SUN_SVG;
  }

  var btn = document.createElement('button');
  btn.className = 'theme-toggle';
  btn.id = 'theme-toggle';
  btn.setAttribute('aria-label', 'تبديل المظهر');
  btn.innerHTML = getIcon();
  document.body.appendChild(btn);

  btn.addEventListener('click', function () {
    var light = !isLight();

    if (light) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme-preference', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme-preference', 'dark');
    }

    btn.innerHTML = getIcon();

    btn.classList.remove('theme-toggle-spin');
    // Force reflow so the class removal is committed before re-adding
    void btn.offsetWidth;
    btn.classList.add('theme-toggle-spin');

    btn.addEventListener('animationend', function onEnd() {
      btn.classList.remove('theme-toggle-spin');
      btn.removeEventListener('animationend', onEnd);
    });
  });
});
