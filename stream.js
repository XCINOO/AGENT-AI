/* Unknown AI — ChatGPT-style progressive reply rendering.
 * The backend (/api/chat) returns the full answer as JSON; this module reveals it
 * progressively with a caret, safe light markdown, smart auto-scroll and a Stop button.
 * No backend change required. Uses existing theme variables only. */
(function () {
  var stopRequested = false;
  var userPinned = true; // true while the user is near the bottom

  function chatEl() { return document.getElementById('chat'); }
  function nearBottom() { var c = chatEl(); return !c || c.scrollHeight - c.scrollTop - c.clientHeight < 80; }
  function scrollDown() { var c = chatEl(); if (c && userPinned) c.scrollTop = c.scrollHeight; }

  document.addEventListener('DOMContentLoaded', function () {
    var c = chatEl();
    if (c) c.addEventListener('scroll', function () { userPinned = nearBottom(); }, { passive: true });
  });

  function esc(s) { return s.replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }

  function inline(s) {
    return s
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  /* Safe markdown: input is escaped first, then a small subset is formatted. */
  function md(src) {
    var parts = src.split(/```/);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        var body = parts[i].replace(/^[a-zA-Z0-9_+-]*\n/, '');
        out += '<pre class="ua-code" dir="ltr"><code>' + esc(body) + '</code></pre>';
        continue;
      }
      var lines = esc(parts[i]).split('\n'), list = null, html = '';
      lines.forEach(function (l) {
        var ul = /^\s*[-*•]\s+(.*)/.exec(l), ol = /^\s*\d+[.)]\s+(.*)/.exec(l), h = /^(#{1,4})\s+(.*)/.exec(l);
        var want = ul ? 'ul' : ol ? 'ol' : null;
        if (list && list !== want) { html += '</' + list + '>'; list = null; }
        if (want) { if (!list) { html += '<' + want + ' dir="auto">'; list = want; } html += '<li>' + inline((ul || ol)[1]) + '</li>'; }
        else if (h) html += '<div class="ua-h" dir="auto">' + inline(h[2]) + '</div>';
        else if (l.trim() === '') html += '<div class="ua-gap"></div>';
        else html += '<p dir="auto">' + inline(l) + '</p>';
      });
      if (list) html += '</' + list + '>';
      out += html;
    }
    return out;
  }

  function setStopMode(on) {
    var b = document.getElementById('send');
    if (!b) return;
    b.classList.toggle('ua-stop', !!on);
    if (on) b.disabled = false;
  }

  /* Send button doubles as Stop while a reply is in flight. Capture phase so it runs first. */
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#send.ua-stop');
    if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    stopRequested = true;
    if (window.__chatCtl) { window.__userStopped = true; try { window.__chatCtl.abort(); } catch (_) {} var t = document.getElementById('typing'); if (t) t.remove(); }
  }, true);

  function reveal(text, messageId, addFn) {
    stopRequested = false;
    userPinned = nearBottom();
    var chat = chatEl(), previousTop = chat && chat.scrollTop;
    var el = (addFn || window.add)('ai', '', true, messageId);
    // add() normally scrolls; respect readers who moved up while waiting.
    if (chat && !userPinned) chat.scrollTop = previousTop;
    var bubble = el.querySelector('.bubble');
    bubble.classList.add('ua-streaming');
    setStopMode(true);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var tokens = text.match(/\s+|[^\s]+/g) || [text];
    var i = 0, shown = '';
    // ~ total duration scales with length but is capped (≈ 1.2s – 6s)
    var perFrame = Math.max(1, Math.ceil(tokens.length / Math.min(360, Math.max(70, tokens.length / 2))));
    return new Promise(function (resolve) {
      function paint(value) {
        // Keep the original controls, handlers and feedback drafts intact.
        var controls = Array.prototype.slice.call(bubble.children).filter(function (node) {
          return node.classList.contains('msg-actions') || node.classList.contains('fb-comment');
        });
        controls.forEach(function (node) { node.remove(); });
        bubble.innerHTML = md(value);
        controls.forEach(function (node) { bubble.appendChild(node); });
      }
      function finish() {
        paint(text);
        bubble.classList.remove('ua-streaming');
        setStopMode(false);
        scrollDown();
        resolve(el);
      }
      if (reduce) return finish();
      var last = 0;
      function step(ts) {
        if (stopRequested) { paint(shown); bubble.classList.remove('ua-streaming'); setStopMode(false); return resolve(el); }
        if (ts - last >= 16) {
          last = ts;
          for (var k = 0; k < perFrame && i < tokens.length; k++) shown += tokens[i++];
          paint(shown);
          scrollDown();
        }
        if (i >= tokens.length) return finish();
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  window.STREAM = { reveal: reveal, busy: setStopMode, md: md };
})();
