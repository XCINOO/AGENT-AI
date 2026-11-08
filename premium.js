/* Unknown AI — premium UI helpers (presentation only).
   Adds starter-prompt cards to the empty state. Fills the input; never sends on its own. */
(function () {
  'use strict';
  var SETS = {
    fa: [
      { t: 'توضیح یک مفهوم', d: 'یک موضوع پیچیده را ساده توضیح بده', p: 'یک موضوع پیچیده را به زبان ساده و با مثال برایم توضیح بده: ' },
      { t: 'کمک در برنامه‌نویسی', d: 'کد بنویس، اشکال‌یابی و بهینه کن', p: 'در برنامه‌نویسی به من کمک کن: ' },
      { t: 'نوشتن و ویرایش', d: 'ایمیل، متن یا خلاصه‌سازی', p: 'کمکم کن این متن را بنویسم یا ویرایش کنم: ' },
      { t: 'برنامه‌ریزی و ایده', d: 'ایده بگیر و برنامه‌ی گام‌به‌گام بچین', p: 'برای این هدف یک برنامه‌ی گام‌به‌گام بچین: ' }
    ],
    en: [
      { t: 'Explain a concept', d: 'Break down a complex topic simply', p: 'Explain this in simple terms, with an example: ' },
      { t: 'Help with code', d: 'Write, debug and optimize', p: 'Help me with some code: ' },
      { t: 'Write & edit', d: 'Emails, drafts and summaries', p: 'Help me write or edit this: ' },
      { t: 'Plan & brainstorm', d: 'Ideas and step-by-step plans', p: 'Create a step-by-step plan for this goal: ' }
    ]
  };
  var ICONS = [
    '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'
  ];
  var g = function (i) { return document.getElementById(i); };
  function lang() { return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'fa'; }
  function render() {
    var w = document.querySelector('#messages .welcomein');
    if (!w || document.querySelector('.main .suggest')) return;
    var box = document.createElement('div');
    box.className = 'suggest';
    SETS[lang()].forEach(function (s, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      var ic = document.createElement('i'); ic.className = 'si'; ic.setAttribute('aria-hidden', 'true');
      ic.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + ICONS[idx % ICONS.length] + '</svg>';
      var tx = document.createElement('div'); tx.className = 'st';
      var t = document.createElement('b'); t.textContent = s.t;
      var d = document.createElement('span'); d.textContent = s.d;
      tx.appendChild(t); tx.appendChild(d);
      b.appendChild(ic); b.appendChild(tx);
      b.addEventListener('click', function () {
        var i = g('input'); if (!i) return;
        i.value = s.p;
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.focus();
        try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) {}
      });
      box.appendChild(b);
    });
    w.appendChild(box);
  }
  var m = g('messages');
  if (m && window.MutationObserver) new MutationObserver(render).observe(m, { childList: true });
  document.addEventListener('langchange', function () {
    var old = document.querySelector('.main .suggest');
    if (old) old.remove();
    render();
  });
  render();
})();

/* Quota-exceeded Premium modal. Opens only when POST /api/chat returns 429 + quota_exceeded.
   Placeholder upgrade does not charge or grant access. */
(function () {
  'use strict';
  var mdl = null, last = null, note = null, origFetch = window.fetch;

  function tr(k) { return (typeof I18N !== 'undefined' && I18N.t) ? I18N.t(k) : k; }
  function applyI18n() {
    if (!mdl) return;
    var title = mdl.querySelector('#premiumTitle');
    var body = mdl.querySelector('#premiumBody');
    var up = mdl.querySelector('#premiumUpgrade');
    var cl = mdl.querySelector('#premiumClose');
    if (title) title.textContent = tr('premium.title');
    if (body) body.textContent = tr('premium.body');
    if (up) up.textContent = tr('premium.upgrade');
    if (cl) cl.textContent = tr('common.close');
    if (note && note.dataset.on) note.textContent = tr('premium.placeholder');
  }
  function build() {
    mdl = document.createElement('div');
    mdl.id = 'premiumModal';
    mdl.className = 'cd-modal premium-modal';
    mdl.setAttribute('aria-hidden', 'true');
    mdl.innerHTML =
      '<div class="cd-panel" role="dialog" aria-modal="true" aria-labelledby="premiumTitle" aria-describedby="premiumBody">' +
        '<div class="cd-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 18.9l.9-5.4L4.2 8.7l5.4-.8z"/></svg></div>' +
        '<h2 class="cd-title" id="premiumTitle"></h2>' +
        '<p class="cd-sub" id="premiumBody"></p>' +
        '<p class="premium-note" id="premiumNote" hidden></p>' +
        '<div class="cd-actions">' +
          '<button type="button" class="cd-btn cd-keep" id="premiumUpgrade"></button>' +
          '<button type="button" class="cd-btn us-sec" id="premiumClose"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mdl);
    note = mdl.querySelector('#premiumNote');
    applyI18n();
    mdl.querySelector('#premiumUpgrade').addEventListener('click', function () {
      if (!note) return;
      note.hidden = false;
      note.dataset.on = '1';
      note.textContent = tr('premium.placeholder');
    });
    mdl.querySelector('#premiumClose').addEventListener('click', function () { close(true); });
    mdl.addEventListener('mousedown', function (e) { if (e.target === mdl) close(true); });
    mdl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(true); return; }
      if (e.key === 'Tab') {
        var f = [].filter.call(mdl.querySelectorAll('button:not([disabled])'), function (n) { return n.offsetParent !== null; });
        if (!f.length) { e.preventDefault(); return; }
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }
  function open() {
    if (!mdl) build();
    applyI18n();
    if (note) { note.hidden = true; note.dataset.on = ''; note.textContent = ''; }
    if (mdl.classList.contains('open')) return;
    last = document.activeElement;
    mdl.classList.add('open');
    mdl.setAttribute('aria-hidden', 'false');
    setTimeout(function () {
      try { mdl.querySelector('#premiumUpgrade').focus({ preventScroll: true }); } catch (e) {}
    }, 80);
  }
  function close(returnFocus) {
    if (!mdl || !mdl.classList.contains('open')) return;
    mdl.classList.remove('open');
    mdl.setAttribute('aria-hidden', 'true');
    if (returnFocus && last && last.isConnected) try { last.focus({ preventScroll: true }); } catch (e) {}
  }
  window.fetch = function (input, init) {
    return origFetch.apply(this, arguments).then(function (res) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method) || (typeof Request !== 'undefined' && input instanceof Request && input.method) || 'GET';
        if (res.status === 429 && /\/api\/chat(?:\?|$)/.test(String(url)) && String(method).toUpperCase() === 'POST') {
          res.clone().json().then(function (d) {
            if (d && d.error === 'quota_exceeded') open();
          }).catch(function () {});
        }
      } catch (e) {}
      return res;
    });
  };
  document.addEventListener('langchange', applyI18n);
  window.__openPremiumModal = open;
})();
