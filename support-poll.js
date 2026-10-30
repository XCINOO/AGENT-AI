/* Support poll — Worker GET /api/support/messages?thread_id=&after= */
(function () {
  var threadKey = 'support_thread_id';
  var afterKey = 'support_after_';
  var busy = false;

  function root() {
    try {
      if (typeof apiUrl === 'function') {
        var u = apiUrl('/api/support');
        if (u) return u.replace(/\/api\/support\/?$/, '');
      }
    } catch (e) {}
    return '';
  }

  function sid() {
    try { if (typeof user !== 'undefined' && user && user.id) return user.id; } catch (e) {}
    return '';
  }

  function show(text) {
    var log = document.getElementById('supportLog');
    if (!log) return;
    var row = document.createElement('div'); row.className = 'smsg them';
    var b = document.createElement('div'); b.className = 'sbubble'; b.setAttribute('dir', 'auto');
    b.textContent = text; row.appendChild(b); log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  async function token() {
    try {
      var s = await sb.auth.getSession();
      return s && s.data && s.data.session && s.data.session.access_token;
    } catch (e) { return null; }
  }

  async function poll() {
    var s = sid(), base = root(), tid = localStorage.getItem(threadKey);
    if (busy || !s || !base || !tid) return;
    busy = true;
    try {
      var at = await token();
      if (!at) return;
      var after = localStorage.getItem(afterKey + tid) || '';
      var url = base + '/api/support/messages?thread_id=' + encodeURIComponent(tid) +
        (after ? '&after=' + encodeURIComponent(after) : '');
      var r = await fetch(url, { method: 'GET', headers: { 'Authorization': 'Bearer ' + at } });
      if (!r.ok) return;
      var d = await r.json();
      var msgs = d.messages || [];
      msgs.forEach(function (m) {
        if (m.sender === 'admin' && m.body) {
          show((typeof I18N !== 'undefined' ? I18N.t('support.replyPrefix') : 'Support: ') + m.body);
        }
        if (m.created_at) localStorage.setItem(afterKey + tid, m.created_at);
      });
    } catch (e) {} finally { busy = false; }
  }

  function isOpen() {
    var m = document.getElementById('supportModal');
    return !!(m && m.classList.contains('open'));
  }

  setInterval(function () { if (isOpen()) poll(); }, 8000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && isOpen()) poll(); });
  window.__supportSetThread = function (id) {
    if (id) localStorage.setItem(threadKey, id);
  };
})();
