/* Support poll — Worker GET /api/support/messages?thread_id=&after=
   Also tracks unread admin replies (badge + toast) across refreshes. */
(function () {
  var threadKey = 'support_thread_id';
  var afterKey = 'support_after_';
  var unreadKey = 'support_unread_';
  var toastFlag = 'support_toast_shown';
  var seenKey = 'support_seen_';
  var SEEN_MAX = 300;
  var busy = false;
  var toastEl = null;
  var toastT = null;

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

  function tr(k) {
    return (typeof I18N !== 'undefined' && I18N.t) ? I18N.t(k) : k;
  }

  function unreadStore() { return unreadKey + (sid() || 'anon'); }

  function getUnread() {
    try { return Math.max(0, parseInt(localStorage.getItem(unreadStore()) || '0', 10) || 0); } catch (e) { return 0; }
  }

  function setUnread(n) {
    n = Math.max(0, n | 0);
    try { localStorage.setItem(unreadStore(), String(n)); } catch (e) {}
    paintBadge(n);
  }

  function paintBadge(n) {
    var dot = document.getElementById('supportUnread');
    var icon = document.getElementById('supportIcon');
    if (!dot) return;
    var on = n > 0;
    dot.classList.toggle('hidden', !on);
    dot.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on && n > 1) { dot.setAttribute('data-count', String(n)); dot.textContent = n > 9 ? '9+' : String(n); }
    else { dot.removeAttribute('data-count'); dot.textContent = ''; }
    if (icon) {
      var base = tr('support.icon');
      icon.setAttribute('aria-label', on ? base + ' — ' + tr('support.unreadAria') : base);
    }
  }

  function showToast() {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'supportToast';
      toastEl.className = 'support-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = tr('support.unreadNotice');
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 5000);
  }

  function isOpen() {
    var m = document.getElementById('supportModal');
    return !!(m && m.classList.contains('open'));
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

  /* ids of admin replies already displayed/counted for a thread (persisted, so reloads and extra tabs never repeat them) */
  function msgKey(m) {
    if (m.id !== undefined && m.id !== null && m.id !== '') return 'id:' + m.id;
    return 'ts:' + (m.created_at || '') + '|' + (m.sender || '') + '|' + (m.body || '');
  }
  function loadSeen(tid) {
    try {
      var a = JSON.parse(localStorage.getItem(seenKey + tid) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveSeen(tid, list) {
    try { localStorage.setItem(seenKey + tid, JSON.stringify(list.slice(-SEEN_MAX))); } catch (e) {}
  }
  /* the "after" cursor only ever moves forward */
  function newer(a, b) {
    var x = Date.parse(a), y = Date.parse(b);
    if (!isNaN(x) && !isNaN(y)) return x > y;
    return String(a) > String(b);
  }

  function markRead() {
    setUnread(0);
    try { sessionStorage.removeItem(toastFlag); } catch (e) {}
  }

  async function poll() {
    var s = sid(), base = root(), tid = localStorage.getItem(threadKey);
    if (busy || !s || !base || !tid) { paintBadge(getUnread()); return; }
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
      var adminNew = 0;
      var seenList = loadSeen(tid), seenSet = {};
      seenList.forEach(function (k) { seenSet[k] = 1; });
      var dirty = false;
      msgs.forEach(function (m) {
        if (!m) return;
        if (m.sender === 'admin' && m.body) {
          var k = msgKey(m);
          if (!seenSet[k]) {
            seenSet[k] = 1; seenList.push(k); dirty = true;
            show((typeof I18N !== 'undefined' ? I18N.t('support.replyPrefix') : 'Support: ') + m.body);
            adminNew += 1;
          }
        }
        if (m.created_at) {
          var cur = localStorage.getItem(afterKey + tid);
          if (!cur || newer(m.created_at, cur)) localStorage.setItem(afterKey + tid, m.created_at);
        }
      });
      if (dirty) saveSeen(tid, seenList);
      if (isOpen()) markRead();
      else if (adminNew) {
        var next = getUnread() + adminNew;
        setUnread(next);
        showToast();
      }
    } catch (e) {} finally { busy = false; }
  }

  function watchModal() {
    var m = document.getElementById('supportModal');
    if (!m || !window.MutationObserver) return;
    new MutationObserver(function () { if (isOpen()) markRead(); }).observe(m, { attributes: true, attributeFilter: ['class'] });
  }

  setInterval(poll, 8000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  document.addEventListener('langchange', function () { paintBadge(getUnread()); });
  window.__supportSetThread = function (id) {
    if (id) localStorage.setItem(threadKey, id);
  };
  watchModal();
  paintBadge(getUnread());
  if (getUnread() > 0) {
    try {
      if (!sessionStorage.getItem(toastFlag)) {
        sessionStorage.setItem(toastFlag, '1');
        setTimeout(showToast, 600);
      }
    } catch (e) {}
  }
  var tries = 0, iv = setInterval(function () {
    if (sid()) { clearInterval(iv); poll(); }
    else if (++tries > 40) clearInterval(iv);
  }, 400);
})();
