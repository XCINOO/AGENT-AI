/* Mobile helpers: sidebar state class, keyboard detection, tagline animation, tab visibility. All passive and cheap. */
(function () {
  'use strict';
  var root = document.documentElement;

  /* 1. Mirror the sidebar's open state on <html> so the top controls hide while it is open */
  var side = document.getElementById('side');
  if (side) {
    var sync = function () { root.classList.toggle('ua-side-open', side.classList.contains('open')); };
    new MutationObserver(sync).observe(side, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  /* 2. On-screen keyboard: track the visual viewport so the composer stays above the keyboard */
  var vv = window.visualViewport;
  if (vv) {
    var raf = 0;
    var onVV = function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var kb = window.innerHeight - vv.height > 140;
        root.classList.toggle('ua-kb', kb);
      });
    };
    vv.addEventListener('resize', onVV, { passive: true });
    var input = document.getElementById('input');
    if (input) input.addEventListener('focus', function () {
      setTimeout(function () { try { input.scrollIntoView({ block: 'nearest' }); } catch (e) {} }, 250);
    });
  }

  /* 3. Pause decorative animation while the tab is hidden */
  document.addEventListener('visibilitychange', function () { root.classList.toggle('ua-hidden', document.hidden); });

  /* 4. Split the welcome tagline into words for the staggered reveal (re-run after language change) */
  function splitTagline() {
    var h = document.querySelector('.ua-tagline');
    if (!h) return;
    var text = h.textContent.trim();
    if (h.getAttribute('data-split') === text) return;
    var words = text.split(/\s+/);
    h.textContent = '';
    words.forEach(function (w, i) {
      var s = document.createElement('span');
      s.className = 'ua-w'; s.style.setProperty('--i', i); s.textContent = w;
      h.appendChild(s);
      if (i < words.length - 1) h.appendChild(document.createTextNode(' '));
    });
    h.style.setProperty('--n', words.length);
    h.setAttribute('data-split', text);
    h.setAttribute('aria-label', text);
  }
  splitTagline();
  document.addEventListener('langchange', function () { setTimeout(splitTagline, 0); });
})();
