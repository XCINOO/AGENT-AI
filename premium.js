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
  var g = function (i) { return document.getElementById(i); };
  function lang() { return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'fa'; }
  function render() {
    var w = document.querySelector('#messages .welcomein');
    if (!w || w.querySelector('.suggest')) return;
    var box = document.createElement('div');
    box.className = 'suggest';
    SETS[lang()].forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      var t = document.createElement('b'); t.textContent = s.t;
      var d = document.createElement('span'); d.textContent = s.d;
      b.appendChild(t); b.appendChild(d);
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
    var old = document.querySelector('#messages .suggest');
    if (old) old.remove();
    render();
  });
  render();
})();
