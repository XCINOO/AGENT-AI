/* Admin panel — maintenance page control.
   Permission is enforced on the server by set_maintenance_mode() (owner/admin only).
   The UI only shows the state the server returns; it never fakes success. */
(function () {
  'use strict';
  if (typeof supabase === 'undefined' || typeof APP_CONFIG === 'undefined') return;
  var sb = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_PUBLISHABLE_KEY);
  var card, stateEl, msgEl, onBtn, offBtn, busy = false;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function fmt(ts) { try { return new Date(ts).toLocaleString('fa-IR'); } catch (e) { return ''; } }

  function render(d) {
    var on = !!(d && d.active);
    card.classList.toggle('is-on', on);
    stateEl.textContent = on ? 'وضعیت فعلی: صفحه بروزرسانی برای بازدیدکنندگان نمایش داده می‌شود' : 'وضعیت فعلی: سایت اصلی فعال است';
    if (d && d.updated_at) stateEl.textContent += ' · ' + fmt(d.updated_at);
    onBtn.disabled = busy || on; offBtn.disabled = busy || !on;
  }
  function msg(t, err) { msgEl.textContent = t || ''; msgEl.className = 'mt-msg' + (err ? ' err' : ''); }
  function errText(e) {
    var m = (e && (e.message || e.code)) || '';
    if (/forbidden|42501/.test(m)) return 'اجازه این کار را ندارید؛ فقط مالک یا مدیر می‌تواند حالت بروزرسانی را تغییر دهد.';
    if (/get_maintenance_mode|set_maintenance_mode|PGRST202|function/.test(m)) return 'این قابلیت هنوز روی سرور نصب نشده است (فایل مهاجرت backend را اجرا کنید).';
    if (/fetch|network/i.test(m)) return 'اتصال به سرور برقرار نشد. اینترنت را بررسی و دوباره تلاش کنید.';
    return 'درخواست انجام نشد: ' + m;
  }
  function load() {
    return sb.rpc('get_maintenance_mode').then(function (r) {
      if (r.error) { stateEl.textContent = 'وضعیت نامشخص'; msg(errText(r.error), true); onBtn.disabled = offBtn.disabled = true; return; }
      msg(''); render(r.data);
    }, function (e) { stateEl.textContent = 'وضعیت نامشخص'; msg(errText(e), true); });
  }
  function set(active) {
    if (busy) return;
    var ok = active
      ? confirm('صفحه بروزرسانی برای همه بازدیدکنندگان نمایش داده شود؟')
      : confirm('سایت اصلی دوباره برای همه فعال شود؟');
    if (!ok) return;
    busy = true; onBtn.disabled = offBtn.disabled = true; msg('در حال ارسال…');
    sb.rpc('set_maintenance_mode', { p_active: active }).then(function (r) {
      busy = false;
      if (r.error) { msg(errText(r.error), true); return load(); }
      render(r.data);
      msg(r.data && r.data.active ? 'صفحه بروزرسانی فعال شد.' : 'سایت اصلی بازگردانده شد.');
    }, function (e) { busy = false; msg(errText(e), true); load(); });
  }

  function mount() {
    var host = document.getElementById('view-dash');
    if (!host || card) return;
    card = el('section', 'card mt-card');
    card.setAttribute('aria-labelledby', 'mtTitle');
    var head = el('div', 'mt-head');
    var title = el('h2', 'mt-title', 'حالت بروزرسانی سایت'); title.id = 'mtTitle';
    stateEl = el('p', 'mt-state', 'در حال دریافت وضعیت…'); stateEl.setAttribute('aria-live', 'polite');
    head.appendChild(title); head.appendChild(stateEl);
    var row = el('div', 'mt-actions');
    onBtn = el('button', 'btn btn-danger', 'نمایش صفحه بروزرسانی سایت'); onBtn.type = 'button';
    offBtn = el('button', 'btn', 'بازگشت به سایت اصلی'); offBtn.type = 'button';
    var view = el('a', 'btn btn-ghost', 'مشاهده صفحه بروزرسانی'); view.href = './maintenance.html'; view.target = '_blank'; view.rel = 'noopener';
    onBtn.addEventListener('click', function () { set(true); });
    offBtn.addEventListener('click', function () { set(false); });
    row.appendChild(onBtn); row.appendChild(offBtn); row.appendChild(view);
    msgEl = el('p', 'mt-msg');
    card.appendChild(head); card.appendChild(row); card.appendChild(msgEl);
    host.parentNode.insertBefore(card, host);
    onBtn.disabled = offBtn.disabled = true;
    load();
  }
  /* mount once the admin app is visible (after admin.js confirmed the session) */
  function tryMount() {
    var app = document.getElementById('app');
    if (app && !app.classList.contains('hidden')) { mount(); return true; }
    return false;
  }
  function start() {
    if (tryMount()) return;
    var app = document.getElementById('app');
    if (!app) return;
    var mo = new MutationObserver(function () { if (tryMount()) mo.disconnect(); });
    mo.observe(app, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
