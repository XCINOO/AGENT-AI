/* دریافت جواب پشتیبانی از تلگرام و نمایش در پنجره‌ی پشتیبانی (فایل مستقل) */
(function () {
  function endpoint() {
    return String((typeof APP_CONFIG !== 'undefined' && APP_CONFIG.SUPPORT_ENDPOINT) || '').trim();
  }
  function sid() {
    try { if (typeof user !== 'undefined' && user && user.id) return user.id; } catch (e) {}
    return '';
  }
  function key() { return 'support_last_' + sid(); }
  function show(text) {
    var log = document.getElementById('supportLog');
    if (!log) return;
    var row = document.createElement('div'); row.className = 'smsg them';
    var b = document.createElement('div'); b.className = 'sbubble'; b.setAttribute('dir', 'auto');
    b.textContent = text; row.appendChild(b); log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  var busy = false;
  async function poll() {
    var s = sid(), url = endpoint();
    if (busy || !s || !/^https:\/\//i.test(url)) return;
    busy = true;
    try {
      var r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll', session_id: s, after: Number(localStorage.getItem(key()) || 0) })
      });
      if (r.ok) {
        var d = await r.json();
        (d.replies || []).forEach(function (x) {
          show('👤 پشتیبانی: ' + x.content);
          localStorage.setItem(key(), String(x.id));
        });
      }
    } catch (e) {} finally { busy = false; }
  }
  function isOpen() {
    var m = document.getElementById('supportModal');
    return !!(m && m.classList.contains('open'));
  }
  setInterval(function () { if (isOpen()) poll(); }, 4000);
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('#supportOpen,#supportIcon');
    if (t) setTimeout(poll, 150);
  });
})();
