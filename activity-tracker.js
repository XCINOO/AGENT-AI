(function () {
  var ENDPOINT = 'https://xcino.app.n8n.cloud/webhook/unknown-ai-activity';
  var waitingLogin = false;
  function getUser() { try { return (typeof user !== 'undefined' && user) ? user : null; } catch (e) { return null; } }
  function track(event) {
    var u = getUser();
    try {
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ event: event, email: u && u.email ? u.email : '', user_id: u && u.id ? u.id : '',
          screen: (window.screen ? screen.width + 'x' + screen.height : ''), lang: navigator.language || '' })
      }).catch(function () {});
    } catch (e) {}
  }
  function watchLogin() {
    var btn = document.getElementById('verifyOtp');
    if (btn) btn.addEventListener('click', function () { waitingLogin = true; });
    setInterval(function () { if (waitingLogin && getUser()) { waitingLogin = false; track('login'); } }, 700);
  }
  function watchVisit() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (getUser()) {
        clearInterval(t);
        try { if (sessionStorage.getItem('ua_visit_sent')) return; sessionStorage.setItem('ua_visit_sent', '1'); } catch (e) {}
        if (!waitingLogin) track('visit');
      } else if (tries > 40) { clearInterval(t); }
    }, 500);
  }
  function watchMessages() {
    var box = document.getElementById('messages'); if (!box) return;
    new MutationObserver(function (list) { list.forEach(function (m) { m.addedNodes.forEach(function (n) {
      if (n.nodeType === 1 && n.classList && n.classList.contains('msg') && n.classList.contains('user') && n.classList.contains('enter')) track('message');
    }); }); }).observe(box, { childList: true });
  }
  function start() { watchLogin(); watchVisit(); watchMessages(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
