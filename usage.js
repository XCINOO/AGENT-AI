/* مصرف روزانه‌ی توکن و پیام — نمایش در سایدبار/نوار بالا، پنجره‌ی جزئیات، و هدایت به پشتیبانی وقتی سهمیه تمام شد.
   فقط لایه‌ی رابط کاربری: عدد مصرف از ورک‌فلوی n8n («Unknown AI - Token Usage») خوانده می‌شود.
   آدرس را می‌شود در config.js با APP_CONFIG.USAGE_ENDPOINT عوض کرد (مثل SUPPORT_ENDPOINT).
   مسدودکردن واقعی بعد از پرداخت سهمیه با خود ورک‌فلوی چت است؛ اینجا فقط نمایش و راهنمایی کاربر است. */
(function () {
  'use strict';
  var DEFAULT_ENDPOINT = 'https://xcino.app.n8n.cloud/webhook/unknown-ai-usage';
  var SUPPORT_TEXT = 'سلام، سهمیه‌ی امروزم تمام شده و می‌خواهم حسابم را شارژ کنم.';
  var COLOR = { ok: 'var(--ok)', warn: 'var(--warn-text)', hot: 'var(--err)', full: 'var(--err)' };

  var g = function (i) { return document.getElementById(i); };
  var card = g('tokenCard'), cCount = g('tokenCount'), cMax = g('tokenMax'), cPlus = g('tokenPlus'),
      cBar = g('tokenBar'), cNote = g('tokenNote'), icon = g('usageIcon'), dot = g('usageDot'),
      banner = g('tokenBanner'), bBtn = g('tokenSupportBtn'), msgs = g('messages'), appEl = g('app');
  if (!card || !cCount || !cBar || !msgs) return;

  var data = null, shown = 0, busy = false, last = 0, tmr = null, plusT = null, raf = 0;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function curUser() { try { return user; } catch (e) { return null; } }
  function fa(n) { try { return Number(n || 0).toLocaleString('fa-IR'); } catch (e) { return String(n || 0); } }
  function endpoint() {
    var u = '';
    try { u = String((typeof APP_CONFIG !== 'undefined' && APP_CONFIG.USAGE_ENDPOINT) || '').trim(); } catch (e) {}
    return /^https:\/\//i.test(u) ? u : DEFAULT_ENDPOINT;
  }
  function pct(a, b) { return b > 0 ? Math.min(100, a / b * 100) : 0; }
  function level(p) { return p >= 100 ? 'full' : p >= 90 ? 'hot' : p >= 70 ? 'warn' : 'ok'; }
  function exhausted() { return !!data && (data.tok >= data.tokMax || data.msg >= data.msgMax); }

  /* ---------------- نمایش ---------------- */
  function setCount(v) {
    cCount.textContent = fa(v);
    var m = g('usTok'); if (m) m.textContent = fa(v) + ' / ' + fa(data ? data.tokMax : 0);
  }
  function animateTo(target, showPlus) {
    cancelAnimationFrame(raf);
    var start = shown, diff = target - start;
    if (showPlus && diff > 0) {
      cPlus.textContent = '+' + fa(diff); cPlus.classList.add('on');
      clearTimeout(plusT); plusT = setTimeout(function () { cPlus.classList.remove('on'); }, 1800);
    }
    if (reduce || diff === 0) { shown = target; setCount(target); return; }
    var t0 = null;
    (function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / 700);
      setCount(Math.round(start + diff * k));
      if (k < 1) raf = requestAnimationFrame(step); else shown = target;
    })(performance.now ? performance.now() : 0);
  }
  function paint(animate) {
    if (!data) { cCount.textContent = '—'; cMax.textContent = ''; cBar.style.width = '0'; cNote.textContent = 'سهمیه‌ی روزانه'; return; }
    var pt = pct(data.tok, data.tokMax), pm = pct(data.msg, data.msgMax), worst = Math.max(pt, pm), lv = level(worst);
    card.classList.remove('warn', 'hot', 'full');
    if (lv !== 'ok') card.classList.add(lv === 'hot' ? 'full' : lv);
    cMax.textContent = '/ ' + fa(data.tokMax) + ' توکن';
    cBar.style.width = pt + '%'; cBar.style.background = COLOR[level(pt)];
    var tl = Math.max(0, data.tokMax - data.tok), ml = Math.max(0, data.msgMax - data.msg);
    cNote.textContent = exhausted() ? 'سهمیه‌ی امروز تمام شد' : fa(tl) + ' توکن · ' + fa(ml) + ' پیام مانده';
    if (dot) { dot.className = 'usage-dot' + (lv === 'ok' ? '' : lv === 'warn' ? ' warn' : ' full'); }
    if (icon) icon.title = 'مصرف امروز: ' + fa(data.tok) + ' از ' + fa(data.tokMax) + ' توکن';
    banner.classList.toggle('hidden', !exhausted());
    animateTo(data.tok, animate);
    if (mdl && mdl.classList.contains('open')) paintModal();
  }
  function sync() {
    var ready = !!curUser() && !(appEl && appEl.classList.contains('hidden'));
    if (icon) icon.classList.toggle('hidden', !ready);
  }

  /* ---------------- دریافت ---------------- */
  async function refresh() {
    var u = curUser();
    sync();
    if (!u || busy) return;
    busy = true;
    var ctl = null, timer = null;
    try {
      var at = null;
      try { at = (await sb.auth.getSession()).data.session.access_token; } catch (e) {}
      ctl = ('AbortController' in window) ? new AbortController() : null;
      timer = setTimeout(function () { if (ctl) ctl.abort(); }, 10000);
      var r = await fetch(endpoint(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: ctl ? ctl.signal : undefined,
        body: JSON.stringify({ user_id: u.id, access_token: at })
      });
      if (!r.ok) throw new Error('http ' + r.status);
      var d = await r.json();
      var had = !!data;
      data = {
        tok: +d.tokens_used || 0, tokMax: +d.token_limit || 20000,
        msg: +d.messages_used || 0, msgMax: +d.message_limit || 50
      };
      paint(had);
    } catch (e) { console.warn('usage', e); }
    finally { clearTimeout(timer); busy = false; last = Date.now(); }
  }

  /* ---------------- پشتیبانی ---------------- */
  function toSupport() {
    closeModal(true);
    var b = g('supportOpen') || g('supportIcon');
    if (b) b.click();
    setTimeout(function () {
      var si = g('supportInput');
      if (si && !si.disabled && !si.value.trim()) {
        si.value = SUPPORT_TEXT;
        si.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 250);
  }
  if (bBtn) bBtn.addEventListener('click', toSupport);

  /* وقتی سهمیه پر است، ارسال انجام نشود و کاربر به پشتیبانی برود (capture روی document تا قبل از هندلرهای سایت) */
  function stop(e) { e.preventDefault(); e.stopImmediatePropagation(); refresh(); toSupport(); }
  document.addEventListener('click', function (e) {
    if (exhausted() && e.target && e.target.closest && e.target.closest('#send')) stop(e);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (exhausted() && e.target && e.target.id === 'input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) stop(e);
  }, true);

  /* ---------------- پنجره‌ی جزئیات (همان الگوی پنجره‌ی تأیید حذف سایت) ---------------- */
  var mdl = null, mSub, mTokBar, mMsg, mMsgBar, mLeft, mPrim, mSec, mLast = null;
  var GAUGE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="M12 16.5l3.2-4.2"/></svg>';

  function buildModal() {
    mdl = document.createElement('div');
    mdl.className = 'cd-modal'; mdl.setAttribute('aria-hidden', 'true');
    mdl.innerHTML =
      '<div class="cd-panel" role="dialog" aria-modal="true" aria-labelledby="usTitle" aria-describedby="usSub">' +
        '<div class="cd-icon us-ic" aria-hidden="true">' + GAUGE + '</div>' +
        '<h2 class="cd-title" id="usTitle">مصرف امروز</h2>' +
        '<p class="cd-sub" id="usSub"></p>' +
        '<div class="us-row"><span>توکن</span><span id="usTok">—</span></div><span class="us-bar"><i id="usTokBar"></i></span>' +
        '<div class="us-row"><span>پیام</span><span id="usMsg">—</span></div><span class="us-bar"><i id="usMsgBar"></i></span>' +
        '<div class="us-left" id="usLeft"></div>' +
        '<div class="us-note">تعداد توکن تقریبی است و از روی طول متن حساب می‌شود.</div>' +
        '<div class="cd-actions"><button type="button" class="cd-btn cd-keep" id="usPrim"></button><button type="button" class="cd-btn us-sec" id="usSec">بستن</button></div>' +
      '</div>';
    document.body.appendChild(mdl);
    mSub = g('usSub'); mTokBar = g('usTokBar'); mMsg = g('usMsg'); mMsgBar = g('usMsgBar');
    mLeft = g('usLeft'); mPrim = g('usPrim'); mSec = g('usSec');
    mPrim.addEventListener('click', function () { if (exhausted()) toSupport(); else closeModal(true); });
    mSec.addEventListener('click', function () { closeModal(true); });
    mdl.addEventListener('mousedown', function (e) { if (e.target === mdl) closeModal(true); });
    mdl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeModal(true); return; }
      if (e.key === 'Tab') {
        var f = [].filter.call(mdl.querySelectorAll('button:not([disabled])'), function (n) { return n.offsetParent !== null; });
        if (!f.length) { e.preventDefault(); return; }
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }
  function paintModal() {
    if (!mdl) return;
    if (!data) {
      mSub.textContent = 'اطلاعات مصرف هنوز دریافت نشده است.';
      mTokBar.style.width = '0'; mMsgBar.style.width = '0'; mMsg.textContent = '—'; mLeft.textContent = '';
      mPrim.textContent = 'باشه'; mSec.classList.add('hidden'); return;
    }
    var pt = pct(data.tok, data.tokMax), pm = pct(data.msg, data.msgMax), ex = exhausted();
    g('usTok').textContent = fa(shown) + ' / ' + fa(data.tokMax);
    mMsg.textContent = fa(data.msg) + ' / ' + fa(data.msgMax);
    mTokBar.style.width = pt + '%'; mTokBar.style.background = COLOR[level(pt)];
    mMsgBar.style.width = pm + '%'; mMsgBar.style.background = COLOR[level(pm)];
    mLeft.textContent = 'باقی‌مانده: ' + fa(Math.max(0, data.tokMax - data.tok)) + ' توکن · ' + fa(Math.max(0, data.msgMax - data.msg)) + ' پیام';
    mSub.textContent = ex
      ? 'سهمیه‌ی امروز شما تمام شده است. برای شارژ حساب، مستقیم به پشتیبانی پیام بدهید.'
      : 'سهمیه هر شب نیمه‌شب (به وقت تهران) دوباره شارژ می‌شود.';
    mPrim.textContent = ex ? 'پیام به پشتیبانی' : 'باشه';
    mSec.classList.toggle('hidden', !ex);
  }
  function openModal(from) {
    if (!mdl) buildModal();
    if (mdl.classList.contains('open')) return;
    mLast = from || document.activeElement;
    paintModal();
    void mdl.offsetWidth;
    mdl.classList.add('open'); mdl.setAttribute('aria-hidden', 'false');
    setTimeout(function () { try { mPrim.focus({ preventScroll: true }); } catch (e) {} }, 80);
    refresh();
  }
  function closeModal(returnFocus) {
    if (!mdl || !mdl.classList.contains('open')) return;
    mdl.classList.remove('open'); mdl.setAttribute('aria-hidden', 'true');
    if (returnFocus && mLast && mLast.isConnected && mLast.offsetParent !== null) try { mLast.focus({ preventScroll: true }); } catch (e) {}
  }
  card.addEventListener('click', function () { openModal(card); });
  if (icon) icon.addEventListener('click', function () { openModal(icon); });

  /* ---------------- زمان‌بندی تازه‌سازی (بدون polling دائمی) ---------------- */
  new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var add = list[i].addedNodes;
      for (var j = 0; j < add.length; j++) {
        var n = add[j];
        if (n.nodeType === 1 && n.classList && n.classList.contains('msg') && n.classList.contains('ai') && n.id !== 'typing') {
          clearTimeout(tmr); tmr = setTimeout(refresh, 1500); return;
        }
      }
    }
  }).observe(msgs, { childList: true });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - last > 10000) refresh();
  });
  try { sb.auth.onAuthStateChange(function () { setTimeout(refresh, 300); }); } catch (e) {}
  var tries = 0, iv = setInterval(function () {
    if (curUser()) { clearInterval(iv); refresh(); }
    else if (++tries > 40) clearInterval(iv);
  }, 400);
  paint(false);
})();
