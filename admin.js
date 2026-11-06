/* Unknown AI — Admin panel SPA (vanilla JS, RTL). All data comes from /api/admin/* (real DB via Worker). */
(function () {
  'use strict';

  var sb = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var me = null; // { id, email, role }
  var REFRESH_MS = 60000;
  var refreshTimer = null;
  var lastStatsAt = 0;

  var S = {
    view: 'dash',
    users: { q: '', status: '', sort: 'created_desc', page: 1, size: 20, total: 0 },
    support: { status: '', q: '', page: 1, threadId: null },
    audit: { page: 1, size: 25, total: 0 },
    detail: { id: null, tab: 'chats', page: 1, chatId: null }
  };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'cls') el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function on(el, ev, fn) { el.addEventListener(ev, fn); return el; }
  function fa(n) { return (n === null || n === undefined || n === '') ? '—' : Number(n).toLocaleString('fa-IR'); }
  function dt(iso) {
    if (!iso) return '—';
    try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)); }
    catch (e) { return String(iso); }
  }
  function dOnly(iso) {
    if (!iso) return '—';
    try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date(iso)); }
    catch (e) { return String(iso); }
  }
  function ago(iso) {
    if (!iso) return '';
    var d = Date.now() - new Date(iso).getTime();
    if (d < 60000) return 'همین حالا';
    var m = Math.floor(d / 60000);
    if (m < 60) return fa(m) + ' دقیقه پیش';
    var hh = Math.floor(m / 60);
    if (hh < 24) return fa(hh) + ' ساعت پیش';
    return fa(Math.floor(hh / 24)) + ' روز پیش';
  }
  var ONLINE_MIN = 15; // overwritten from /stats; server is the source of truth
  function toast(msg, ok) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (ok ? ' ok' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 3600);
  }
  function canUserWrite() { return me && (me.role === 'owner' || me.role === 'admin'); }
  function canSupportWrite() { return me && (me.role === 'owner' || me.role === 'admin' || me.role === 'support'); }
  function isOwner() { return me && me.role === 'owner'; }

  // ---------- API ----------
  /** Persian fallback per backend error code. The Worker's own `response` text always wins. */
  var FA_ERRORS = {
    unauthorized: 'نشست شما منقضی یا نامعتبر است؛ دوباره وارد شوید.',
    not_admin: 'شما به پنل مدیریت دسترسی ندارید.',
    forbidden: 'شما به این بخش از پنل مدیریت دسترسی ندارید.',
    invalid_request: 'درخواست نامعتبر است.',
    not_found: 'مورد مورد نظر پیدا نشد.',
    rate_limited: 'درخواست‌ها زیاد بود؛ کمی صبر کنید.',
    db_unavailable: 'ارتباط با پایگاه داده برقرار نشد؛ کمی بعد دوباره تلاش کنید.',
    auth_unavailable: 'ارتباط با سرویس احراز هویت برقرار نشد؛ کمی بعد دوباره تلاش کنید.',
    auth_admin_unreachable: 'ارتباط با سرویس احراز هویت برقرار نشد؛ کمی بعد دوباره تلاش کنید.',
    auth_admin_failed: 'سرویس احراز هویت درخواست را پذیرفت نکرد؛ کمی بعد دوباره تلاش کنید.',
    server_misconfigured: 'سرور درست پیکربندی نشده است؛ با توسعه‌دهنده تماس بگیرید.',
    internal_error: 'خطای داخلی سرور؛ کمی بعد دوباره تلاش کنید.',
    origin_not_allowed: 'این مبدأ (Origin) از سمت سرور مجاز شناخته نشد.',
    setup_disabled: 'راه‌اندازی اولیه در این سرویس غیرفعال است.',
    setup_completed: 'حساب مالک از قبل ساخته شده است و این مرحله فقط یک‌بار اجرا می‌شود.',
    invalid_setup_code: 'کد راه‌اندازی نادرست است.',
    username_taken: 'این نام کاربری قبلاً گرفته شده است.',
    weak_password: 'رمز عبور پذیرفته نشد؛ دست‌کم ۱۲ نویسه شامل حرف و رقم باشد.',
    invalid_username: 'نام کاربری پذیرفته نشد.',
    invalid_email: 'ایمیل تماس نامعتبر است.',
    owner_write_failed: 'ثبت نقش مالک در پایگاه داده ممکن نشد؛ دوباره تلاش کنید.',
    setup_state_unavailable: 'آماده‌سازی پایگاه داده کامل نشده است (اجرای مهاجرت‌های ادمین لازم است).'
  };
  /** Persian text for a failed call: server message > code map > generic. Never shows a raw English code. */
  function faError(body, status) {
    var d = body || {};
    if (typeof d.response === 'string' && d.response.trim()) return d.response;
    if (typeof d.msg === 'string' && d.msg.trim()) return d.msg;
    // the Worker's route fallback answers exactly {error:'not_found'} (src/index.ts app.notFound), while real
    // "record missing" 404s carry their own Persian `response` or a user_not_found / chat_not_found code.
    if (status === 404 && (!d.error || d.error === 'not_found')) return 'این مسیر روی سرویس API وجود ندارد؛ نسخه‌ی جدید Worker هنوز مستقر نشده است.';
    if (d.error && FA_ERRORS[d.error]) return FA_ERRORS[d.error];
    if (status === 401) return FA_ERRORS.unauthorized;
    if (status === 403) return FA_ERRORS.forbidden;
    if (status === 404) return FA_ERRORS.not_found;
    if (status === 429) return FA_ERRORS.rate_limited;
    if (status >= 500) return FA_ERRORS.internal_error;
    return 'خطای نامشخص از سمت سرور (کد ' + status + ').';
  }
  function apiUrl(path) {
    var base = String(APP_CONFIG.API_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!base || /REPLACE/i.test(base)) return '';
    return base + path;
  }
  /** Toggle a button into a busy state without losing its label (loading feedback for every async action). */
  function busy(btn, on, busyText) {
    if (!btn) return btn;
    if (on) {
      if (!btn.dataset.idle) btn.dataset.idle = btn.textContent;
      if (busyText) btn.textContent = busyText;
      btn.disabled = true;
      btn.classList.add('is-busy');
      btn.setAttribute('aria-busy', 'true');
    } else {
      if (btn.dataset.idle) btn.textContent = btn.dataset.idle;
      btn.disabled = false;
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-busy');
    }
    return btn;
  }
  function api(path, opts) {
    opts = opts || {};
    return sb.auth.getSession().then(function (r) {
      var tok = r.data.session && r.data.session.access_token;
      if (!tok) { showAuth(); throw new Error('no_session'); }
      var init = { method: opts.method || 'GET', headers: { 'Authorization': 'Bearer ' + tok } };
      if (opts.body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
      }
      return fetch(apiUrl(path), init);
    }).then(function (res) {
      if (res.status === 401) { clearInterval(refreshTimer); var e401 = new Error('unauthorized'); e401.status = 401; showAuth(); throw e401; }
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          var msg = faError(d, res.status);
          if (!opts.quiet) toast(msg);
          var err = new Error(d.error || 'http'); err.status = res.status; err.body = d; err.fa = msg; throw err;
        });
      }
      if (opts.raw) return res;
      return res.json();
    }).catch(function (e) {
      // fetch()/CORS failures reject with TypeError and carry no status: give the UI a Persian text anyway
      if (e && e.name === 'TypeError' && !e.fa) e.fa = 'اتصال به API برقرار نشد. از آدرس Worker و مجاز بودن Origin این صفحه مطمئن شوید.';
      throw e;
    });
  }

  // ---------- confirm modal ----------
  var modalReturnFocus = null;
  function closeModal() {
    $('modalWrap').classList.add('hidden');
    if (modalReturnFocus && modalReturnFocus.focus && document.body.contains(modalReturnFocus)) { try { modalReturnFocus.focus(); } catch (e) {} }
    modalReturnFocus = null;
  }
  /** `danger` paints the confirm button red-solid (destructive); otherwise it is the normal primary button. */
  function askModal(title, bodyNode, okLabel, onOk, danger) {
    $('modalTitle').textContent = title;
    var b = $('modalBody'); b.textContent = '';
    if (bodyNode) b.appendChild(bodyNode);
    var ok = $('modalOk');
    ok.textContent = okLabel || 'تأیید';
    ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    modalReturnFocus = document.activeElement;
    $('modalWrap').classList.remove('hidden');
    ok.onclick = function () {
      closeModal();
      Promise.resolve(onOk && onOk(b)).catch(function () {});
    };
    $('modalCancel').onclick = closeModal;
    var firstField = b.querySelector('input,textarea,select');
    setTimeout(function () { (firstField || ok).focus(); }, 30);
  }

  // ---------- auth ----------
  /** Fallback only: the real value is read from GET /api/admin/setup/state (see checkSetupState). */
  var loginDomain = 'admin.unknown-ai.local';
  var setupOpen = false;   // does the backend still accept a one-time owner bootstrap?
  var setupBusy = false;   // guards double submit while the create call is in flight
  function showAuth() {
    $('loader').classList.add('hidden');
    $('app').classList.add('hidden');
    $('setup').classList.add('hidden');
    $('auth').classList.remove('hidden');
  }
  function showSetup() {
    $('loader').classList.add('hidden');
    $('app').classList.add('hidden');
    $('auth').classList.add('hidden');
    $('setup').classList.remove('hidden');
    setupMsg('');
  }
  function authMsg(t, err) { $('authMsg').textContent = t || ''; $('authMsg').className = 'auth-msg' + (err ? ' err' : ''); }
  function setupMsg(t, err) { $('setupMsg').textContent = t || ''; $('setupMsg').className = 'auth-msg' + (err ? ' err' : ''); }
  function showAuthTab(which) {
    $('passStep').classList.toggle('hidden', which !== 'pass');
    $('emailStep').classList.toggle('hidden', which !== 'otp');
    $('otpStep').classList.toggle('hidden', which !== 'otpCode');
    $('tabPassword').classList.toggle('active', which === 'pass');
    $('tabOtp').classList.toggle('active', which !== 'pass');
  }
  /** A bare username is the admin identity <username>@<login domain>; emails pass through. */
  function adminIdentifier(v) {
    var s = String(v || '').trim().toLowerCase();
    return s.indexOf('@') > 0 ? s : s + '@' + loginDomain;
  }
  function clearSetupSecrets() { $('suPass').value = ''; $('suPass2').value = ''; $('suCode').value = ''; }

  /**
   * Unauthenticated probe: reveals the one-time Owner bootstrap only when the Worker really
   * offers it, and teaches the login form which domain turns a username into an admin identity.
   * Runs before boot() so the domain is known even when the operator lands straight on the login screen.
   */
  function checkSetupState() {
    var url = apiUrl('/api/admin/setup/state');
    if (!url) {
      setupOpen = false;
      $('admSetupOpen').classList.add('hidden');
      authMsg('آدرس API در config.js تنظیم نشده است؛ پنل در حالت آفلاین است.', true);
      return Promise.resolve(false);
    }
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d || {} }; });
      })
      .then(function (x) {
        if (!x.ok || typeof x.d !== 'object') { setupOpen = false; $('admSetupOpen').classList.add('hidden'); return false; }
        if (x.d.login_domain) loginDomain = String(x.d.login_domain);
        setupOpen = !!x.d.setup_available && !x.d.has_owner;
        $('admSetupOpen').classList.toggle('hidden', !setupOpen);
        if (!setupOpen) $('setup').classList.add('hidden');
        return setupOpen;
      })
      .catch(function () {
        setupOpen = false;
        $('admSetupOpen').classList.add('hidden');
        // network/CORS level failure (not a 404): say so quietly, before boot() may replace it with a more specific text
        if (!me && !$('authMsg').textContent) authMsg('سرویس API پاسخ نداد؛ از صحت API_BASE_URL در config.js و استقرار Worker مطمئن شوید.');
        return false;
      });
  }

  /** Persian text for GoTrue sign-in failures; raw English SDK messages are never shown. */
  function passwordError(e) {
    var m = String((e && (e.code || e.message)) || '');
    if (/invalid login credentials|invalid_credentials/i.test(m)) return 'نام کاربری یا رمز عبور نادرست است.';
    if (/email not confirmed/i.test(m)) return 'این حساب هنوز تأیید نشده است.';
    if (/user is banned|banned/i.test(m)) return 'این حساب مسدود شده است.';
    if (/rate.?limit|too many/i.test(m)) return 'چند بار زیاد تلاش شده است؛ چند دقیقه صبر کنید.';
    if (/unable to validate due to prior error/i.test(m)) return 'به دلیل تلاش‌های ناموفق قبلی موقتاً مسدود شده‌اید؛ کمی بعد دوباره تلاش کنید.';
    if (/network|failed to fetch|Failed to fetch/i.test(m)) return 'اتصال به سرویس احراز هویت برقرار نشد.';
    return 'ورود ناموفق بود. از درست بودن نام کاربری و رمز عبور مطمئن شوید.';
  }
  function passwordLogin() {
    var email = adminIdentifier($('admUser').value);
    var pw = $('admPass').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return authMsg('نام کاربری معتبر نیست؛ فقط نام کاربری (بدون @) یا ایمیل کامل مدیر را وارد کنید.', true);
    }
    if (!pw) return authMsg('رمز عبور را وارد کنید.', true);
    busy($('admPassIn'), true, 'در حال ورود…');
    authMsg('');
    sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
      busy($('admPassIn'), false);
      $('admPass').value = ''; // the password never stays in the field or in memory beyond this call
      if (r.error) { authMsg(passwordError(r.error), true); return; }
      if (!r.data || !r.data.session) { authMsg('نشست ساخته نشد؛ دوباره تلاش کنید.', true); return; }
      authMsg('ورود موفق؛ در حال بارگذاری پنل…');
      boot();
    }, function () {
      busy($('admPassIn'), false);
      $('admPass').value = '';
      authMsg('اتصال به سرویس احراز هویت برقرار نشد.', true);
    });
  }

  function submitSetup() {
    if (setupBusy) return;
    var username = String($('suUser').value || '').trim().toLowerCase();
    var pw = $('suPass').value, pw2 = $('suPass2').value;
    var code = $('suCode').value;
    var email = String($('suEmail').value || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))
      return setupMsg('نام کاربری باید ۳ تا ۳۲ نویسه باشد: حروف کوچک انگلیسی، رقم، نقطه یا خط تیره؛ شروع با حرف یا رقم.', true);
    if (pw.length < 12) return setupMsg('رمز عبور باید دست‌کم ۱۲ نویسه باشد.', true);
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return setupMsg('رمز عبور باید حداقل یک حرف و یک رقم داشته باشد.', true);
    if (pw !== pw2) return setupMsg('تکرار رمز عبور مطابقت ندارد.', true);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setupMsg('ایمیل تماس نامعتبر است.', true);
    if (!code) return setupMsg('کد راه‌اندازی را وارد کنید.', true);
    var url = apiUrl('/api/admin/setup');
    if (!url) return setupMsg('آدرس API تنظیم نشده است (APP_CONFIG.API_BASE_URL).', true);
    setupBusy = true;
    busy($('suRun'), true, 'در حال ساخت…');
    ['suUser', 'suPass', 'suPass2', 'suEmail', 'suCode'].forEach(function (id) { $(id).disabled = true; });
    setupMsg('در حال ساخت حساب مالک…');
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, username: username, password: pw, contact_email: email || null })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok, status: r.status, d: d || {}, retry: r.headers.get('Retry-After') };
      });
    }).then(function (x) {
      setupBusy = false;
      busy($('suRun'), false);
      ['suUser', 'suPass', 'suPass2', 'suEmail', 'suCode'].forEach(function (id) { $(id).disabled = false; });
      clearSetupSecrets();
      if (x.ok) {
        if (x.d.login_email) loginDomain = String(x.d.login_email).split('@')[1] || loginDomain;
        setupOpen = false;
        $('admSetupOpen').classList.add('hidden');
        showAuth(); showAuthTab('pass');
        $('admUser').value = x.d.username || username;
        authMsg(x.d.response || x.d.message || 'حساب مالک ساخته شد. اکنون با همین نام کاربری و رمز عبور وارد شوید.');
        checkSetupState(); // ask the server again: the bootstrap window must now be closed
        return;
      }
        // setup permanently closed (already an owner): drop back to the login screen
      if (x.status === 410 || x.d.error === 'owner_exists' || x.d.error === 'setup_completed' || x.status === 503) {
        setupOpen = false;
        $('admSetupOpen').classList.add('hidden');
        showAuth(); showAuthTab('pass');
        authMsg(faError(x.d, x.status), x.status !== 410 && x.status !== 503);
        return;
      }
      if (x.status === 429) {
        var mins = Math.max(1, Math.round(Number(x.retry || 900) / 60));
        setupMsg('چند بار زیاد تلاش شده است؛ حدود ' + fa(mins) + ' دقیقه صبر کنید.', true);
        return;
      }
      setupMsg(faError(x.d, x.status), true);
    }).catch(function () {
      setupBusy = false;
      busy($('suRun'), false);
      ['suUser', 'suPass', 'suPass2', 'suEmail', 'suCode'].forEach(function (id) { $(id).disabled = false; });
      clearSetupSecrets();
      setupMsg('اتصال به API برقرار نشد. از آدرس Worker، در دسترس بودن سرویس و مجاز بودن Origin این صفحه مطمئن شوید.', true);
    });
  }

  var emailForOtp = '';
  function bindAuth() {
    on($('tabPassword'), 'click', function () { showAuthTab('pass'); authMsg(''); });
    on($('tabOtp'), 'click', function () { showAuthTab('otp'); authMsg(''); });
    on($('admPassIn'), 'click', passwordLogin);
    on($('admPass'), 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); passwordLogin(); } });
    on($('admSendOtp'), 'click', function () {
      var email = $('admEmail').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authMsg('ایمیل نامعتبر است.', true);
      $('admSendOtp').disabled = true;
      authMsg('در حال ارسال کد…');
      sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false } }).then(function (r) {
        $('admSendOtp').disabled = false;
        if (r.error) {
          authMsg(passwordError(r.error), true);
          return;
        }
        emailForOtp = email;
        showAuthTab('otpCode');
        authMsg('کد ۶ رقمی ارسال شد.');
      }).catch(function () {
        $('admSendOtp').disabled = false;
        authMsg('اتصال به سرویس احراز هویت برقرار نشد.', true);
      });
    });
    on($('admVerifyOtp'), 'click', function () {
      var code = $('admOtp').value.trim();
      if (!/^\d{6}$/.test(code)) return authMsg('کد ۶ رقمی را وارد کنید.', true);
      $('admVerifyOtp').disabled = true;
      sb.auth.verifyOtp({ email: emailForOtp, token: code, type: 'email' }).then(function (r) {
        $('admVerifyOtp').disabled = false;
        if (r.error) return authMsg('کد نادرست یا منقضی شده است.', true);
        boot();
      }).catch(function () {
        $('admVerifyOtp').disabled = false;
        authMsg('اتصال به سرویس احراز هویت برقرار نشد.', true);
      });
    });
    on($('admBack'), 'click', function () { showAuthTab('otp'); authMsg(''); });
    on($('admLogout'), 'click', function () {
      sb.auth.signOut().then(function () {
        me = null;
        clearInterval(refreshTimer);
        showAuth(); showAuthTab('pass'); authMsg('');
        $('admUser').value = ''; $('admPass').value = '';
        checkSetupState();
      });
    });
    on($('admSetupOpen'), 'click', function () { showSetup(); setupMsg(''); });
    on($('setupBack'), 'click', function () { clearSetupSecrets(); setupMsg(''); showAuth(); });
    on($('suRun'), 'click', submitSetup);
    ['suUser', 'suPass', 'suPass2', 'suEmail', 'suCode'].forEach(function (id) {
      on($(id), 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitSetup(); } });
    });
  }

  // ---------- app shell ----------
  function showApp() {
    $('loader').classList.add('hidden');
    $('auth').classList.add('hidden');
    $('setup').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('meBadge').textContent = roleLabel(me.role) + ' · ' + (me.email || '');
    var roleEl = $('meRole'); if (roleEl) roleEl.textContent = roleLabel(me.role);
    var emailEl = $('meEmail'); if (emailEl) emailEl.textContent = me.email || '';
    var avEl = $('meAvatar'); if (avEl) avEl.textContent = String(me.email || me.role || 'A').trim().charAt(0).toUpperCase();
    $('navAdmins').classList.toggle('hidden', !isOwner());
    var tm = $('todayMeta');
    if (tm && !tm.textContent) { try { tm.textContent = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); } catch (e) {} }
  }
  function roleLabel(r) { return { owner: 'مالک', admin: 'مدیر', support: 'پشتیبانی', analyst: 'تحلیل‌گر' }[r] || r; }

  var VIEW_TITLES = { dash: 'داشبورد', users: 'کاربران', user: 'جزئیات کاربر', support: 'پشتیبانی', reports: 'گزارش‌ها', audit: 'رویدادهای مدیریتی', admins: 'مدیران' };
  function switchView(v, keepScroll) {
    if (v === 'admins' && !isOwner()) v = 'dash';
    S.view = v;
    document.body.setAttribute('data-view', v);
    Array.prototype.forEach.call(document.querySelectorAll('.navbtn[data-view]'), function (b) {
      var cur = b.getAttribute('data-view') === v || (v === 'user' && b.getAttribute('data-view') === 'users');
      b.classList.toggle('active', cur);
      if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (s) { s.classList.add('hidden'); });
    $('pageTitle').textContent = VIEW_TITLES[v];
    document.title = VIEW_TITLES[v] + ' · پنل مدیریت Unknown AI';
    $('view-' + v).classList.remove('hidden');
    document.body.classList.remove('nav-open');
    clearInterval(refreshTimer);
    load(v);
    if (v === 'dash') refreshTimer = setInterval(function () { load('dash', true); }, REFRESH_MS);
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function load(v, quiet) {
    var fn = { dash: loadDash, users: loadUsers, user: loadUser, support: loadSupport, reports: loadReports, audit: loadAudit, admins: loadAdmins }[v];
    var box = $('view-' + v);
    if (!fn) { box.textContent = ''; return; }
    var sk = null;
    if (!quiet) {
      box.textContent = '';
      // dashboard: skeleton is replaced wholesale by renderDash(); other views: skeleton sits under the view's own shell
      if (v === 'dash') box.appendChild(skeleton('dash'));
    }
    var p = fn(box, quiet);
    if (!quiet && v !== 'dash' && v !== 'users') { sk = skeleton('list'); box.appendChild(sk); }
    Promise.resolve(p).then(function () { if (sk && sk.parentNode) sk.parentNode.removeChild(sk); }, function () { if (sk && sk.parentNode) sk.parentNode.removeChild(sk); });
    Promise.resolve(p).catch(function (e) {
      if (e && (e.message === 'no_session' || e.message === 'unauthorized')) return;
      if (quiet) return; // background refresh failed: keep what is on screen
      box.textContent = '';
      var text = (e && (e.fa || (e.body && e.body.response))) || 'بارگذاری این بخش ناموفق بود.';
      var retry = h('button', { cls: 'btn btn-ghost btn-sm', text: 'تلاش دوباره' });
      on(retry, 'click', function () { load(v); });
      box.appendChild(h('div', { cls: 'empty' }, [h('div', { cls: 'err-note', text: text }), h('div', { style: 'margin-top:12px' }, [retry])]));
    });
  }

  // ---------- charts & small UI helpers ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  /** 1.2K / 3.4M / 5B with Persian digits (short enough for axis labels). */
  function compact(n) {
    n = Number(n) || 0;
    var abs = Math.abs(n), div = 1, suf = '';
    if (abs >= 1e9) { div = 1e9; suf = 'B'; } else if (abs >= 1e6) { div = 1e6; suf = 'M'; } else if (abs >= 1e3) { div = 1e3; suf = 'K'; }
    return (n / div).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + suf;
  }
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), r = v / p;
    var m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
    return m * p;
  }
  function pctChange(cur, prev) { return prev > 0 ? ((cur - prev) / prev) * 100 : null; }
  function sum(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); }
  function icon(path) { var s = svgEl('svg', { viewBox: '0 0 24 24', 'class': 'ni', 'aria-hidden': 'true' }); s.innerHTML = path; return s; }
  function arrow(up) {
    var s = svgEl('svg', { viewBox: '0 0 24 24', 'class': 'arr', 'aria-hidden': 'true' });
    s.innerHTML = up ? '<path d="M7 17 17 7M9 7h8v8"/>' : '<path d="M7 7l10 10M17 9v8H9"/>';
    return s;
  }
  /** ↗ 1.2٪ (green when good). `invert` flips the meaning for "lower is better" metrics. */
  function deltaBadge(p, invert) {
    if (p === null || p === undefined || !isFinite(p)) return null;
    var up = p >= 0, good = invert ? !up : up;
    return h('span', { cls: 'delta ' + (good ? 'good' : 'bad') }, [arrow(up), h('span', { text: Math.abs(p).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + '٪' })]);
  }
  function faDay(iso) { try { return new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'numeric' }).format(new Date(iso)); } catch (e) { return iso; } }
  function hueOf(s) { var x = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 360; return x; }
  function avatarEl(who, extraCls, bg) {
    var el = h('span', { cls: 'av' + (extraCls ? ' ' + extraCls : ''), text: String(who || '?').trim().charAt(0) || '?' });
    el.style.background = bg || ('linear-gradient(135deg,hsl(' + hueOf(who) + ' 55% 52%),hsl(' + ((hueOf(who) + 40) % 360) + ' 55% 40%))');
    return el;
  }
  function card(title, kids) { return h('div', { cls: 'card' }, [h('h3', { text: title })].concat(kids)); }
  function badge(status) {
    var map = { active: 'فعال', suspended: 'معلّق', banned: 'بن', open: 'باز', closed: 'بسته' };
    var cls = ['active', 'suspended', 'banned', 'open', 'closed'].indexOf(status) >= 0 ? status : 'closed';
    return h('span', { cls: 'badge ' + cls, text: map[status] || status || '—' });
  }
  /** Copies <th> text into each cell's data-label so the table can turn into stacked cards on phones. */
  function labelTable(table) {
    var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (t) { return t.textContent; });
    table.classList.add('rt');
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (tr) {
      Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i]) td.setAttribute('data-label', heads[i]); });
    });
    return table;
  }
  function skeleton(kind) {
    var w = h('div', { cls: 'sk-wrap', 'aria-hidden': 'true' });
    if (kind === 'dash') {
      w.appendChild(h('div', { cls: 'kpi5' }, [1, 2, 3, 4, 5].map(function () { return h('div', { cls: 'sk sk-kpi' }); })));
      w.appendChild(h('div', { cls: 'dash-grid' }, [h('div', { cls: 'sk sk-panel' }), h('div', { cls: 'sk sk-panel' })]));
    } else {
      [1, 2, 3, 4].forEach(function () { w.appendChild(h('div', { cls: 'sk sk-row' })); });
    }
    return w;
  }

  /**
   * Responsive area chart: redraws at the real pixel width (ResizeObserver). Time runs right → left (RTL),
   * y-axis labels on the right, dashed grid, tooltip pill that follows the pointer and rests on the latest point.
   * Colours come from CSS variables so light/dark switch without a redraw.
   * data: [{ label, value }] in chronological order.
   */
  function areaChart(data, opts) {
    opts = opts || {};
    var color = opts.color || 'var(--c1)';
    var H = opts.height || 240;
    var padL = 8, padR = 44, padT = 50, padB = 28;
    var n = data.length;
    var wrap = h('div', { cls: 'achart' });
    wrap.style.height = H + 'px';
    if (!n) { wrap.style.height = 'auto'; wrap.appendChild(h('div', { cls: 'empty', text: 'داده‌ای برای نمایش نیست.' })); return wrap; }
    var tip = h('div', { cls: 'achart-tip' });
    wrap.appendChild(tip);
    var svg = null, pts = [], marker = null, sel = n - 1, lastW = 0, cw = 0;
    var gid = 'ag' + Math.random().toString(36).slice(2, 8);

    function place(i) {
      if (!pts.length) return;
      i = Math.min(Math.max(i, 0), pts.length - 1); sel = i;
      var p = pts[i], W = wrap.clientWidth;
      if (marker) marker.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')');
      tip.textContent = '';
      tip.appendChild(h('span', { cls: 'tip-date', text: p.d.label }));
      tip.appendChild(h('b', { cls: 'tip-val', text: fa(p.d.value) }));
      tip.style.left = Math.min(Math.max(p.x, 58), W - 58) + 'px';
      tip.style.top = Math.max(p.y - 16, 56) + 'px';
    }
    function draw() {
      var W = wrap.clientWidth;
      if (!W || (svg && W === lastW)) return;
      lastW = W;
      if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
      svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'نمودار روند' });
      cw = Math.max(W - padL - padR, 10);
      var ch = H - padT - padB;
      var max = niceCeil(Math.max.apply(null, data.map(function (d) { return d.value || 0; })));
      var defs = svgEl('defs');
      var lg = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      var s1 = svgEl('stop', { offset: '0', 'stop-opacity': '.32' }); s1.style.stopColor = color;
      var s2 = svgEl('stop', { offset: '1', 'stop-opacity': '0' }); s2.style.stopColor = color;
      lg.appendChild(s1); lg.appendChild(s2); defs.appendChild(lg); svg.appendChild(defs);
      for (var t = 0; t <= 4; t++) {
        var gy = padT + ch - (ch * t) / 4;
        svg.appendChild(svgEl('line', { x1: padL, x2: padL + cw, y1: gy, y2: gy, 'class': 'ax-grid', 'stroke-dasharray': t === 0 ? '0' : '3 6' }));
        var yl = svgEl('text', { x: padL + cw + 12, y: gy + 4, 'class': 'ax-label', 'font-size': '11', 'text-anchor': 'start' });
        yl.textContent = compact((max * t) / 4);
        svg.appendChild(yl);
      }
      pts = data.map(function (d, i) {
        return { d: d, x: padL + cw - (n > 1 ? (i / (n - 1)) * cw : cw / 2), y: padT + ch - ((d.value || 0) / max) * ch };
      });
      var line = 'M' + pts[0].x + ',' + pts[0].y;
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], cx = (a.x + b.x) / 2;
        line += ' C' + cx + ',' + a.y + ' ' + cx + ',' + b.y + ' ' + b.x + ',' + b.y;
      }
      var base = padT + ch;
      svg.appendChild(svgEl('path', { d: line + ' L' + pts[pts.length - 1].x + ',' + base + ' L' + pts[0].x + ',' + base + ' Z', fill: 'url(#' + gid + ')' }));
      var ln = svgEl('path', { d: line, fill: 'none', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      ln.style.stroke = color;
      svg.appendChild(ln);
      var perLabel = Math.max(Math.floor(cw / 58), 2), step = Math.max(Math.ceil(n / perLabel), 1);
      pts.forEach(function (p, i) {
        if (i % step !== 0) return;
        var tx = svgEl('text', { x: p.x, y: H - 6, 'class': 'ax-label', 'font-size': '11', 'text-anchor': i === 0 ? 'end' : 'middle' });
        tx.textContent = p.d.label;
        svg.appendChild(tx);
      });
      marker = svgEl('g');
      var halo = svgEl('circle', { r: 11, 'fill-opacity': '.2' }); halo.style.fill = color;
      var dot = svgEl('circle', { r: 5.5, 'class': 'mk-in', 'stroke-width': '2.2' }); dot.style.stroke = color;
      marker.appendChild(halo); marker.appendChild(dot);
      svg.appendChild(marker);
      wrap.insertBefore(svg, tip);
      place(sel);
    }
    function onMove(e) {
      if (!pts.length) return;
      var r = wrap.getBoundingClientRect();
      place(Math.round((1 - (e.clientX - r.left - padL) / cw) * (n - 1)));
    }
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerdown', onMove);
    wrap.addEventListener('pointerleave', function () { place(n - 1); });
    if (window.ResizeObserver) new ResizeObserver(draw).observe(wrap);
    else window.addEventListener('resize', draw);
    requestAnimationFrame(draw);
    return wrap;
  }

  /** Vertical pill bars on a light track (like the reference); hover / tap / focus moves the tooltip. Time flows right → left. */
  function vBars(data) {
    var host = h('div', { cls: 'vb' });
    if (!data.length) { host.appendChild(h('div', { cls: 'empty', text: 'داده‌ای برای نمایش نیست.' })); return host; }
    var max = niceCeil(Math.max.apply(null, data.map(function (d) { return d.value || 0; }).concat([1])));
    var ys = h('div', { cls: 'vb-y', 'aria-hidden': 'true' });
    for (var t = 4; t >= 0; t--) ys.appendChild(h('span', { text: compact((max * t) / 4) }));
    var lines = h('div', { cls: 'vb-lines', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i'), h('i')]);
    var cols = h('div', { cls: 'vb-cols', role: 'list' }), all = [], fills = [];
    var labelEvery = data.length > 20 ? 3 : (data.length > 10 ? 2 : 1);
    function select(c) { all.forEach(function (x) { x.classList.toggle('on', x === c); }); }
    data.forEach(function (d, i) {
      var fill = h('i', { cls: 'vb-fill' });
      var col = h('button', { cls: 'vb-col' + (i === data.length - 1 ? ' on' : ''), type: 'button', role: 'listitem', 'aria-label': d.label + ': ' + fa(d.value) }, [
        h('span', { cls: 'vb-tip', text: fa(d.value) }),
        h('span', { cls: 'vb-track' }, [fill]),
        h('span', { cls: 'vb-x' + (i % labelEvery ? ' skip' : ''), text: i % labelEvery ? '' : d.label })
      ]);
      ['mouseenter', 'focus', 'click'].forEach(function (ev) { col.addEventListener(ev, function () { select(col); }); });
      all.push(col); fills.push([fill, (d.value || 0) / max]);
      cols.appendChild(col);
    });
    cols.addEventListener('mouseleave', function () { select(all[all.length - 1]); });
    host.appendChild(ys);
    host.appendChild(h('div', { cls: 'vb-plot' }, [lines, cols]));
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      fills.forEach(function (f) { f[0].style.height = (f[1] > 0 ? Math.max(f[1] * 100, 4) : 0) + '%'; });
    }); });
    return host;
  }

  /** Donut ring; segments: [{ value, color }] */
  function donut(segs, centerNum, centerLbl) {
    var R = 48, C = 2 * Math.PI * R, total = sum(segs.map(function (s) { return s.value; }));
    var svg = svgEl('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: 60, cy: 60, r: R, 'class': 'ring' }));
    var off = 0;
    if (total > 0) segs.forEach(function (s) {
      if (!(s.value > 0)) return;
      var len = Math.max((s.value / total) * C - 5, 1);
      var c = svgEl('circle', { cx: 60, cy: 60, r: R, 'stroke-dasharray': len + ' ' + (C - len), 'stroke-dashoffset': -off });
      c.style.stroke = s.color;
      svg.appendChild(c);
      off += (s.value / total) * C;
    });
    return h('div', { cls: 'donut' }, [svg, h('div', { cls: 'donut-c' }, [h('b', { text: centerNum }), h('span', { text: centerLbl })])]);
  }

  // ---------- dashboard ----------
  var DASH_METRICS = [['messages', 'پیام‌ها'], ['requests', 'درخواست‌های AI'], ['tokens', 'توکن'], ['signups', 'عضو جدید']];
  var RANGES = [[7, '۷ روز اخیر'], [14, '۱۴ روز اخیر'], [30, '۳۰ روز اخیر']];
  S.dash = S.dash || { metric: 'messages', range: 14 };
  var dashData = null;
  var IC = {
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c1.9.7 3.2 2.4 3.5 5.2"/>',
    online: '<circle cx="12" cy="12" r="2.6"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>',
    ai: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    tokens: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
    support: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    warn: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.01"/>',
    thumb: '<path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.2 2.5L12.5 9H19a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 18 19H7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>'
  };

  function loadDash(box, quiet) {
    return Promise.all([
      api('/api/admin/stats'),
      fetch(apiUrl('/api/health')).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; }),
      api('/api/admin/users?sort=usage_desc&page=1&page_size=5', { quiet: true }).catch(function () { return { rows: [] }; })
    ]).then(function (rs) {
      var st = rs[0];
      ONLINE_MIN = st.online_minutes || ONLINE_MIN;
      lastStatsAt = Date.now();
      $('refreshMeta').textContent = 'آخرین به‌روزرسانی: ' + dt(new Date().toISOString());
      var openSupport = (st.support && st.support.open) || 0;
      setSupportBadge(openSupport);
      dashData = { st: st, hb: rs[1], top: (rs[2] && rs[2].rows) || [] };
      renderDash(box);
    });
  }
  function setSupportBadge(n) {
    var dot = $('supportDot');
    if (dot) { dot.textContent = n > 99 ? '۹۹+' : fa(n); dot.classList.toggle('hidden', !n); }
    var bell = $('bellDot'); if (bell) bell.classList.toggle('hidden', !n);
  }

  function renderDash(box) {
    var st = dashData.st, hb = dashData.hb, topRows = dashData.top;
    var users = st.users || {}, ai = st.ai || {}, usage = st.usage || {}, sup = st.support || {}, content = st.content || {}, sess = st.sessions || {}, fb = st.feedback || {};
    var trendAll = (st.trend || []).slice().sort(function (a, b) { return new Date(a.day) - new Date(b.day); });
    var trend = trendAll.slice(-S.dash.range);
    function series(m, arr) { return (arr || trend).map(function (d) { return Number(d[m]) || 0; }); }
    function weekDelta(m) { var v = series(m, trendAll); return pctChange(sum(v.slice(-7)), sum(v.slice(-14, -7))); }

    /* ---- filter row ---- */
    var rangeSel = h('select', { cls: 'pill-select', 'aria-label': 'بازه زمانی نمودار' });
    RANGES.forEach(function (r) { rangeSel.appendChild(h('option', { value: String(r[0]), text: r[1] })); });
    rangeSel.value = String(S.dash.range);
    on(rangeSel, 'change', function () { S.dash.range = Number(rangeSel.value); renderDash(box); });
    var filters = h('div', { cls: 'filters' }, [
      rangeSel,
      h('span', { cls: 'filters-spacer' }),
      h('span', { cls: 'live', title: 'هر ۶۰ ثانیه خودکار به‌روز می‌شود' }, [h('i'), 'زنده · به‌روزرسانی خودکار'])
    ]);

    /* ---- KPI cards ---- */
    function kcard(o) {
      return h('div', { cls: 'kcard' }, [
        h('div', { cls: 'kc-top' }, [h('span', { cls: 'kc-label', text: o.label }), h('span', { cls: 'kc-ico' }, [icon(o.icon)])]),
        h('div', { cls: 'kc-val' + (o.hot ? ' hot' : ''), text: o.value }),
        h('div', { cls: 'kc-foot' }, [o.delta || null, h('span', { text: o.caption || '' })])
      ]);
    }
    var kpis = h('div', { cls: 'kpi5' }, [
      kcard({ label: 'کاربران کل', icon: IC.users, value: fa(users.total), delta: deltaBadge(weekDelta('signups')), caption: fa(users.new_week) + ' عضو جدید این هفته' }),
      kcard({ label: 'آنلاین الان', icon: IC.online, value: fa(users.online), caption: 'در ' + fa(ONLINE_MIN) + ' دقیقه اخیر' }),
      kcard({ label: 'درخواست‌های AI امروز', icon: IC.ai, value: fa(ai.requests_today), delta: deltaBadge(weekDelta('requests')), caption: 'کل: ' + fa(ai.requests_total) }),
      kcard({ label: 'توکن مصرفی امروز', icon: IC.tokens, value: fa(usage.tokens_today), delta: deltaBadge(weekDelta('tokens')), caption: 'این هفته: ' + fa(usage.tokens_week) }),
      kcard({ label: 'پشتیبانی باز', icon: IC.support, value: fa(sup.open), hot: sup.open > 0, caption: 'جدید امروز: ' + fa(sup.new_today) })
    ]);

    /* ---- main chart ---- */
    var tabs = h('div', { cls: 'seg-tabs', role: 'tablist' }), tabBtns = {};
    var titleEl = h('h3', { cls: 'p-title' }), note = h('div', { cls: 'panel-note' });
    var stats = h('div', { cls: 'mini-stats' }), plot = h('div', { cls: 'plot' });
    function mini(label, value, delta) {
      return h('div', { cls: 'mini' }, [h('div', { cls: 'mini-l', text: label }), h('div', { cls: 'mini-row' }, [h('div', { cls: 'mini-v', text: value }), delta || null])]);
    }
    function renderTotal() {
      var m = S.dash.metric;
      var meta = DASH_METRICS.filter(function (x) { return x[0] === m; })[0] || [m, m];
      var vals = series(m), all = series(m, trendAll);
      titleEl.textContent = meta[1] + ' · روزانه';
      var avg = vals.length ? sum(vals) / vals.length : 0;
      var peak = Math.max.apply(null, vals.concat([0])), pi = vals.indexOf(peak);
      note.textContent = '';
      note.appendChild(icon(IC.info));
      note.appendChild(h('span', { text: 'میانگین روزانه ' + fa(Math.round(avg)) + (peak > 0 ? ' · اوج در ' + faDay(trend[pi].day) + ' (' + fa(peak) + ')' : '') }));
      stats.textContent = '';
      var last = vals.length ? vals[vals.length - 1] : 0;
      stats.appendChild(mini('آخرین روز', fa(last), vals.length > 1 ? deltaBadge(pctChange(last, vals[vals.length - 2])) : null));
      stats.appendChild(mini('۷ روز اخیر', fa(sum(all.slice(-7))), deltaBadge(weekDelta(m))));
      stats.appendChild(mini('کل بازه (' + fa(vals.length) + ' روز)', fa(sum(vals)), null));
      plot.textContent = '';
      plot.appendChild(vBars(trend.map(function (d) { return { label: faDay(d.day), value: Number(d[m]) || 0 }; })));
      Object.keys(tabBtns).forEach(function (k) { tabBtns[k].classList.toggle('active', k === m); tabBtns[k].setAttribute('aria-selected', k === m ? 'true' : 'false'); });
    }
    DASH_METRICS.forEach(function (mm) {
      var b = h('button', { cls: 'seg-tab', type: 'button', role: 'tab', text: mm[1] });
      on(b, 'click', function () { S.dash.metric = mm[0]; renderTotal(); });
      tabBtns[mm[0]] = b; tabs.appendChild(b);
    });
    var mainPanel = h('div', { cls: 'panel p-main' }, [
      h('div', { cls: 'p-head' }, [h('div', {}, [titleEl, note]), tabs]),
      h('div', { cls: 'exp-body' }, [stats, plot])
    ]);

    /* ---- side card: account status donut ---- */
    var act = Number(users.active) || 0, susp = Number(users.suspended) || 0, ban = Number(users.banned) || 0;
    var signups = st.recent_signups || [];
    var sideKids = [
      h('div', { cls: 'p-head' }, [h('div', {}, [h('h3', { cls: 'p-title', text: 'وضعیت حساب‌ها' }), h('div', { cls: 'p-sub muted small', text: fa(users.confirmed) + ' ایمیل تأییدشده' })])]),
      h('div', { cls: 'dn-wrap' }, [
        donut([{ value: act, color: 'var(--good)' }, { value: susp, color: 'var(--warn)' }, { value: ban, color: 'var(--bad)' }], fa(act + susp + ban), 'کاربر'),
        h('div', { cls: 'legend' }, [
          h('div', { cls: 'lg' }, [h('i', { style: 'background:var(--good)' }), 'فعال', h('b', { text: fa(act) })]),
          h('div', { cls: 'lg' }, [h('i', { style: 'background:var(--warn)' }), 'معلّق', h('b', { text: fa(susp) })]),
          h('div', { cls: 'lg' }, [h('i', { style: 'background:var(--bad)' }), 'بن‌شده', h('b', { text: fa(ban) })])
        ])
      ])
    ];
    if (signups.length) {
      var nu = signups[0];
      var nb = h('button', { cls: 'newest', type: 'button', title: 'نمایش کاربر' }, [
        avatarEl(nu.email || nu.id),
        h('div', { cls: 'newest-main' }, [h('b', { cls: 'dir-ltr', text: nu.email || String(nu.id).slice(0, 8) }), h('span', { text: 'تازه‌ترین عضو · ' + ago(nu.created_at) })])
      ]);
      if (nu.id) on(nb, 'click', function () { openUser(nu.id); });
      sideKids.push(nb);
    }
    var sidePanel = h('div', { cls: 'panel p-side' }, sideKids);

    /* ---- three lists ---- */
    var feed = [];
    (st.recent_activity || []).forEach(function (a) { feed.push({ who: a.email || a.user_id || '', kind: a.kind, at: a.at }); });
    (st.recent_errors || []).forEach(function (e) { feed.push({ who: e.email || '', kind: 'error', at: e.at }); });
    feed.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var KIND = { login: ['ورود به سیستم', 'ok', '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h10"/>'], message: ['پیام جدید', '', IC.support], support: ['درخواست پشتیبانی', 'warn', IC.support], error: ['خطای AI', 'hot', IC.warn] };
    var feedBox = h('div', { cls: 'feed' });
    feed.slice(0, 5).forEach(function (f) {
      var k = KIND[f.kind] || [f.kind || '—', '', IC.clock];
      feedBox.appendChild(h('div', { cls: 'li' }, [
        h('span', { cls: 'li-ico ' + k[1] }, [icon(k[2])]),
        h('div', { cls: 'li-main' }, [h('span', { cls: 'li-title', text: k[0] }), h('span', { cls: 'li-sub dir-ltr', text: (f.who || '—').slice(0, 30) })]),
        h('span', { cls: 'li-chip', text: ago(f.at) })
      ]));
    });
    if (!feed.length) feedBox.appendChild(h('div', { cls: 'empty', text: 'فعالیتی ثبت نشده' }));
    var moreBtn = h('button', { cls: 'link-btn', type: 'button', text: 'مشاهده همه' });
    on(moreBtn, 'click', function () { switchView('audit'); });
    var feedCard = h('div', { cls: 'panel' }, [h('div', { cls: 'rp-head' }, [h('h3', { text: 'فعالیت‌های اخیر' }), moreBtn]), feedBox]);

    var topBox = h('div', { cls: 'stack' });
    topRows.slice(0, 5).forEach(function (u) {
      var b = h('button', { cls: 'li', type: 'button' }, [
        avatarEl(u.email || u.id),
        h('div', { cls: 'li-main' }, [h('span', { cls: 'li-title dir-ltr', text: u.email || String(u.id).slice(0, 8) }), h('span', { cls: 'li-sub', text: fa(u.messages_count) + ' پیام · ' + (ago(u.last_activity) || '—') })]),
        h('span', { cls: 'li-val', text: compact(u.today_tokens) + ' توکن' })
      ]);
      on(b, 'click', function () { openUser(u.id); });
      topBox.appendChild(b);
    });
    if (!topRows.length) topBox.appendChild(h('div', { cls: 'empty', text: 'داده‌ای نیست' }));
    var allBtn = h('button', { cls: 'link-btn', type: 'button', text: 'همه کاربران' });
    on(allBtn, 'click', function () { switchView('users'); });
    var topCard = h('div', { cls: 'panel' }, [h('div', { cls: 'rp-head' }, [h('h3', { text: 'پرمصرف‌ترین کاربران' }), allBtn]), topBox]);

    var apiUp = !!(hb && hb.ok), apiReady = !!(hb && hb.ok && hb.configured);
    function hrow(ico, tone, label, value, vtone) {
      return h('div', { cls: 'li' }, [
        h('span', { cls: 'li-ico ' + tone }, [icon(ico)]),
        h('div', { cls: 'li-main' }, [h('span', { cls: 'li-title', text: label })]),
        h('span', { cls: 'li-val' + (vtone ? ' tone-' + vtone : ''), text: value })
      ]);
    }
    var failed = Number(ai.failed_24h) || 0;
    var healthBox = h('div', { cls: 'stack' }, [
      hrow(IC.bolt, apiReady ? 'ok' : (apiUp ? 'warn' : 'hot'), 'API Worker', apiReady ? 'آماده‌به‌کار' : (apiUp ? 'پیکربندی ناقص' : 'در دسترس نیست'), apiReady ? 'good' : (apiUp ? 'warn' : 'bad')),
      hrow(IC.db, 'ok', 'پایگاه داده', dt(st.generated_at), ''),
      hrow(IC.clock, '', 'آخرین درخواست AI', ago(ai.last_request_at) || '—', ''),
      hrow(IC.warn, failed > 0 ? 'hot' : 'ok', 'خطاهای ۲۴ ساعت', fa(failed), failed > 0 ? 'bad' : 'good'),
      hrow(IC.thumb, '', 'بازخورد کاربران', '▲ ' + fa(fb.up) + '  ▼ ' + fa(fb.down), ''),
      apiReady ? null : h('p', { cls: 'err-note', text: 'اگر خرابی دارید، پیکربندی Worker و اتصال Supabase را بررسی کنید.' })
    ].filter(Boolean));
    var healthCard = h('div', { cls: 'panel' }, [h('div', { cls: 'rp-head' }, [h('h3', { text: 'سلامت سیستم' })]), healthBox]);

    /* ---- extra stats ---- */
    function mi(l, v, s) { return h('div', { cls: 'more-i' }, [h('div', { cls: 'l', text: l }), h('div', { cls: 'v', text: v }), s ? h('div', { cls: 's', text: s }) : null]); }
    var more = h('div', { cls: 'panel' }, [
      h('div', { cls: 'rp-head' }, [h('h3', { text: 'آمار تکمیلی' })]),
      h('div', { cls: 'more' }, [
        mi('گفتگوها', fa(content.chats)),
        mi('کل پیام‌ها', fa(content.messages), fa(content.user_messages) + ' کاربر · ' + fa(content.ai_messages) + ' هوش مصنوعی'),
        mi('پیام‌های امروز', fa(usage.messages_today)),
        mi('ورودهای امروز', fa(sess.logins_today), 'این هفته: ' + fa(sess.logins_week)),
        mi('عضویت امروز', fa(users.new_today), 'این هفته: ' + fa(users.new_week)),
        mi('خطاهای AI (۲۴ ساعت)', fa(ai.failed_24h))
      ])
    ]);

    var wrap = h('div', { cls: 'dash-wrap' }, [filters, kpis, h('div', { cls: 'dash-grid' }, [mainPanel, sidePanel]), h('div', { cls: 'tri' }, [feedCard, topCard, healthCard]), more]);
    box.textContent = '';
    box.appendChild(wrap);
    renderTotal();
  }

  // ---------- users ----------
  var USORTS = { created_desc: 'جدیدترین', created_asc: 'قدیمی‌ترین', activity_desc: 'آخرین فعالیت', usage_desc: 'بیشترین پیام' };
  var USTATUSES = { '': 'همه', online: 'آنلاین', active: 'فعال', suspended: 'معلّق', banned: 'بن', unconfirmed: 'بدون تأیید ایمیل' };

  /** Built once per visit: typing / chip clicks only refresh the results area, so focus is never lost. */
  function usersToolbar(refresh) {
    var q = h('input', { type: 'search', placeholder: 'جستجوی ایمیل / شماره / شناسه…', value: S.users.q, 'aria-label': 'جستجوی کاربران', autocomplete: 'off' });
    var field = h('label', { cls: 'field-search' }, [icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>'), q]);
    var chips = h('div', { cls: 'chips', role: 'group', 'aria-label': 'فیلتر وضعیت' });
    var chipEls = {};
    Object.keys(USTATUSES).forEach(function (k) {
      var b = h('button', { cls: 'chip' + (S.users.status === k ? ' on' : ''), type: 'button', text: USTATUSES[k], 'aria-pressed': S.users.status === k ? 'true' : 'false' });
      on(b, 'click', function () {
        S.users.status = k;
        Object.keys(chipEls).forEach(function (x) { chipEls[x].classList.toggle('on', x === k); chipEls[x].setAttribute('aria-pressed', x === k ? 'true' : 'false'); });
        refresh();
      });
      chipEls[k] = b; chips.appendChild(b);
    });
    var sort = h('select', { 'aria-label': 'مرتب‌سازی' });
    Object.keys(USORTS).forEach(function (k) { sort.appendChild(h('option', { value: k, text: USORTS[k] })); });
    sort.value = S.users.sort;
    var exportBtn = h('button', { cls: 'btn btn-sm', type: 'button', text: 'خروجی CSV' });
    var timer;
    on(q, 'input', function () { clearTimeout(timer); timer = setTimeout(function () { S.users.q = q.value.trim(); refresh(); }, 320); });
    on(q, 'keydown', function (e) { if (e.key === 'Enter') { clearTimeout(timer); S.users.q = q.value.trim(); refresh(); } });
    on(sort, 'change', function () { S.users.sort = sort.value; refresh(); });
    on(exportBtn, 'click', exportUsers);
    return h('div', { cls: 'detail-head' }, [h('div', { cls: 'toolbar' }, [field, sort, exportBtn]), chips]);
  }

  function exportUsers() {
    toast('در حال آماده‌سازی خروجی…');
    var qs = '?q=' + encodeURIComponent(S.users.q) + '&status=' + encodeURIComponent(S.users.status) + '&sort=' + encodeURIComponent(S.users.sort);
    api('/api/admin/export/users' + qs, { raw: true }).then(function (res) {
      return res.blob();
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'unknown-ai-users.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
    }).catch(function () {});
  }

  function pagerRow(st, go) {
    var pages = Math.max(Math.ceil((st.total || 0) / st.size), 1);
    var prev = h('button', { cls: 'btn btn-ghost btn-sm', text: '›' });
    var next = h('button', { cls: 'btn btn-ghost btn-sm', text: '‹' });
    if (st.page <= 1) prev.setAttribute('disabled', '');
    if (st.page >= pages) next.setAttribute('disabled', '');
    on(prev, 'click', function () { if (st.page > 1) go(st.page - 1); });
    on(next, 'click', function () { if (st.page < pages) go(st.page + 1); });
    return h('div', { cls: 'pager' }, [prev, h('span', { cls: 'muted', text: 'صفحه ' + fa(st.page) + ' از ' + fa(pages) + ' · ' + fa(st.total || 0) + ' نتیجه' }), next]);
  }

  var usersReq = 0;
  function loadUsers(box) {
    box = box || $('view-users');
    box.textContent = '';
    var results = h('div', { cls: 'results' });
    box.appendChild(usersToolbar(function () { S.users.page = 1; return fetchUsers(results); }));
    box.appendChild(results);
    return fetchUsers(results);
  }
  function fetchUsers(results) {
    var req = ++usersReq;
    results.textContent = '';
    var sk = skeleton('list'); results.appendChild(sk);
    var params = new URLSearchParams({ q: S.users.q, status: S.users.status, sort: S.users.sort, page: String(S.users.page), page_size: String(S.users.size) });
    return api('/api/admin/users?' + params.toString()).then(function (d) {
      if (req !== usersReq) return; // a newer search is already running
      results.textContent = '';
      var rows = d.rows || [];
      S.users.total = d.total || 0;
      var wrap = h('div', { cls: 'tbl-wrap' });
      results.appendChild(wrap);
      if (!rows.length) { wrap.appendChild(h('div', { cls: 'empty', text: 'کاربری با این فیلترها پیدا نشد.' })); }
      else {
        var table = h('table');
        table.appendChild(h('thead', {}, [h('tr', {}, [
          h('th', { text: 'کاربر' }), h('th', { text: 'وضعیت' }), h('th', { text: 'عضویت' }),
          h('th', { text: 'آخرین فعالیت' }), h('th', { text: 'گفتگو' }), h('th', { text: 'پیام' }), h('th', { text: 'امروز (پیام/توکن)' })
        ])]));
        var tb = h('tbody');
        rows.forEach(function (u) {
          var online = u.last_activity && (Date.now() - new Date(u.last_activity).getTime() < ONLINE_MIN * 60000);
          var who = u.email || String(u.id).slice(0, 8);
          var tr = h('tr', { cls: 'clickable', tabindex: '0' }, [
            h('td', {}, [h('div', { cls: 'cell-user' }, [avatarEl(who), h('div', {}, [h('div', {}, [h('span', { cls: 'dot ' + (online ? 'on' : 'off'), title: online ? 'آنلاین' : '' }), h('span', { cls: 'dir-ltr', text: who })]), u.phone ? h('div', { cls: 'muted small dir-ltr', text: u.phone }) : null])])]),
            h('td', {}, [badge(u.admin_status)]),
            h('td', { text: dOnly(u.created_at) }),
            h('td', {}, [h('span', { text: ago(u.last_activity) || '—' }), h('div', { cls: 'muted small', text: online ? 'آنلاین' : '' })]),
            h('td', { text: fa(u.chats_count) }),
            h('td', { text: fa(u.messages_count) }),
            h('td', { text: fa(u.today_messages) + ' / ' + fa(u.today_tokens) })
          ]);
          on(tr, 'click', function () { openUser(u.id); });
          on(tr, 'keydown', function (e) { if (e.key === 'Enter') openUser(u.id); });
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        wrap.appendChild(labelTable(table));
      }
      results.appendChild(pagerRow(S.users, function (p) { S.users.page = p; fetchUsers(results); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    }).catch(function () { if (req === usersReq) { results.textContent = ''; results.appendChild(h('div', { cls: 'empty', text: 'بارگذاری ناموفق.' })); } });
  }

  // ---------- user detail ----------
  var DTABS = [
    ['chats', 'گفتگوها'], ['requests', 'درخواست‌های AI'], ['errors', 'خطاها'],
    ['support', 'پشتیبانی'], ['feedback', 'بازخوردها'], ['activity', 'فعالیت']
  ];

  function openUser(id) {
    S.detail = { id: id, tab: 'chats', page: 1, chatId: null };
    switchView('user');
  }

  function loadUser(box) {
    box = box || $('view-user');
    box.textContent = '';
    var back = h('button', { cls: 'btn btn-ghost btn-sm', text: '→ بازگشت به کاربران', style: 'align-self:flex-start' });
    on(back, 'click', function () { switchView('users'); });
    var head = h('div', { cls: 'detail-head' }, [h('div', { cls: 'empty', text: '…' })]);
    box.append(back, head);
    return api('/api/admin/users/detail?id=' + S.detail.id).then(function (u) {
      head.textContent = '';
      var counts = u.counts || {}, usage = u.usage || {};
      var q = u.quota_override || {};
      var online = u.last_activity && (Date.now() - new Date(u.last_activity).getTime() < ONLINE_MIN * 60000);
      var info = h('div', { cls: 'info-grid' }, [
        infoItem('شناسه کاربر', u.id, true),
        infoItem('ایمیل', u.email, true),
        infoItem('ایمیل تأییدشده', u.email_confirmed ? 'بله' : 'خیر'),
        infoItem('شماره تماس', u.phone ? u.phone + (u.phone_verified ? ' (تأییدشده)' : ' (تأییدنشده)') : 'ثبت نشده'),
        infoItem('تاریخ عضویت', dt(u.created_at)),
        infoItem('آخرین ورود', dt(u.last_sign_in_at)),
        infoItem('آخرین فعالیت', dt(u.last_activity) + (online ? ' · آنلاین' : '')),
        infoItem('زبان', { fa: 'فارسی', en: 'انگلیسی' }[u.language] || 'تنظیم نشده'),
        infoItem('بن سمت Auth', u.auth_banned_until ? 'بن' : '—'),
        infoItem('نقش مدیریتی', roleLabel(u.admin_role) || '—'),
        infoItem('گفتگو / پیام', fa(counts.chats) + ' / ' + fa(counts.messages)),
        infoItem('درخواست / خطا', fa(counts.requests) + ' / ' + fa(counts.errors)),
        infoItem('امروز (پیام/توکن)', fa(usage.today_messages) + ' / ' + fa(usage.today_tokens)),
        infoItem('توکن این هفته', fa(usage.week_tokens)),
        infoItem('سهمیه اختصاصی', (q.message_limit || q.token_limit) ? ((q.message_limit ? fa(q.message_limit) : 'پیش‌فرض') + ' پیام / ' + (q.token_limit ? fa(q.token_limit) : 'پیش‌فرض') + ' توکن') : 'پیش‌فرض'),
        infoItem('حافظه کاربر', u.memory_enabled ? 'فعال' : 'غیرفعال'),
        infoItem('مرورگر / دستگاه / IP', 'جمع‌آوری نمی‌شود (حریم خصوصی)')
      ]);
      var left = h('div', {}, [
        h('div', { cls: 'profile-head' }, [
          avatarEl(u.email || u.id),
          h('div', {}, [
            h('h2', { text: u.email || u.id, cls: 'dir-ltr' }),
            h('div', { cls: 'toolbar' }, [badge(u.admin_status), u.admin_role ? h('span', { cls: 'role-badge', text: roleLabel(u.admin_role) }) : null, online ? h('span', { cls: 'badge active', text: 'آنلاین' }) : null])
          ])
        ]),
        info
      ]);
      var actions = h('div', { cls: 'actions-row' });
      if (canUserWrite()) {
        var suspendBtn = u.admin_status !== 'suspended'
          ? h('button', { cls: 'btn btn-sm', text: 'تعلیق حساب' })
          : h('button', { cls: 'btn btn-ok btn-sm', text: 'فعال‌سازی مجدد' });
        on(suspendBtn, 'click', function () { setStatus(u.id, u.admin_status !== 'suspended' ? 'suspended' : 'active'); });
        actions.appendChild(suspendBtn);
        var banBtn = u.admin_status !== 'banned'
          ? h('button', { cls: 'btn btn-danger btn-sm', text: 'بن (Auth)' })
          : h('button', { cls: 'btn btn-ok btn-sm', text: 'رفع بن' });
        on(banBtn, 'click', function () { ban(u.id, u.admin_status !== 'banned'); });
        actions.appendChild(banBtn);
        var qb = h('button', { cls: 'btn btn-ghost btn-sm', text: 'تنظیم سهمیه' });
        on(qb, 'click', function () { quotaModal(u); });
        actions.appendChild(qb);
      }
      var headCard = card('پروفایل', [left, actions]);
      head.appendChild(headCard);

      var tabs = h('div', { cls: 'tabs' });
      var bodyBox = h('div');
      DTABS.forEach(function (t) {
        var b = h('button', { cls: 'tab' + (S.detail.tab === t[0] ? ' active' : ''), text: t[1] });
        on(b, 'click', function () { S.detail.tab = t[0]; S.detail.page = 1; S.detail.chatId = null; loadUser(); });
        tabs.appendChild(b);
      });
      head.appendChild(tabs);
      head.appendChild(bodyBox);
      loadUserContent(bodyBox);
    });
  }

  function infoItem(label, value, ltr) {
    return h('div', { cls: 'info-item' }, [
      h('div', { cls: 'i-label', text: label }),
      h('div', { cls: 'i-value' + (ltr ? ' dir-ltr' : ''), text: (value === null || value === undefined || value === '') ? '—' : String(value) })
    ]);
  }

  function setStatus(id, status) {
    var reason = h('textarea', { placeholder: 'دلیل (اختیاری، در لاگ مدیریتی ثبت می‌شود)', rows: '2' });
    askModal(status === 'suspended' ? 'تعلیق حساب' : 'فعال‌سازی حساب',
      h('div', {}, [h('p', { text: status === 'suspended' ? 'کاربر نمی‌تواند پیام جدید بفرستد. این اقدام برای کاربر پیامک نمی‌شود.' : 'حساب دوباره فعال می‌شود.' }), reason]),
      'تأیید',
      function () {
        return api('/api/admin/users/status', { method: 'POST', body: { user_id: id, status: status, reason: reason.value.trim() || null } })
          .then(function () { toast('وضعیت به «' + (status === 'suspended' ? 'معلّق' : 'فعال') + '» تغییر کرد.', true); loadUser(); });
      });
  }

  function ban(id, doBan) {
    askModal(doBan ? 'بن کردن کاربر' : 'رفع بن',
      h('p', { text: doBan ? 'ورود و استفاده از API برای این حساب بلافاصله مسدود می‌شود (تأیید هویت سمت سرور رد می‌شود). این اقدام حساس است.' : 'کاربر دوباره می‌تواند وارد شود.' }),
      doBan ? 'بن' : 'رفع بن',
      function () {
        return api('/api/admin/users/ban', { method: 'POST', body: { user_id: id, ban: doBan } })
          .then(function () { toast(doBan ? 'کاربر بن شد.' : 'بن برداشته شد.', true); loadUser(); });
      }, doBan);
  }

  function quotaModal(u) {
    var q = u.quota_override || {};
    var ml = h('input', { type: 'number', min: '1', max: '1000000', placeholder: 'خالی = پیش‌فرض سرویس', value: q.message_limit != null ? String(q.message_limit) : '' });
    var tl = h('input', { type: 'number', min: '100', max: '100000000', placeholder: 'خالی = پیش‌فرض سرویس', value: q.token_limit != null ? String(q.token_limit) : '' });
    var bodyNode = h('div', {}, [
      h('p', { cls: 'muted small', text: 'خالی = بازگشت به سقف پیش‌فرض سرویس. این مقادیر هنگام هر درخواست چت اعمال می‌شوند.' }),
      h('label', { text: 'سقف پیام روزانه' }), ml,
      h('label', { text: 'سقف توکن روزانه' }), tl,
      h('p', { cls: 'muted small', text: 'شما نمی‌توانید رمز عبور کاربر را ببینید یا تغییر دهید.' })
    ]);
    askModal('سهمیه «' + (u.email || u.id) + '»', bodyNode, 'ذخیره', function () {
      var body = { user_id: u.id };
      body.message_limit = ml.value.trim() === '' ? null : Number(ml.value);
      body.token_limit = tl.value.trim() === '' ? null : Number(tl.value);
      return api('/api/admin/users/quota', { method: 'POST', body: body })
        .then(function () { toast('سهمیه ثبت شد.', true); loadUser(); });
    });
  }

  function loadUserContent(box) {
    var st = S.detail;
    var qs = '?id=' + st.id + '&kind=' + st.tab + '&page=' + st.page + '&page_size=20';
    if (st.tab === 'messages') {
      if (!st.chatId) { loadUser(); return; }
      qs = '?id=' + st.id + '&kind=messages&chat_id=' + st.chatId + '&page=' + st.page + '&page_size=20';
    }
    box.textContent = '';
    box.appendChild(h('div', { cls: 'empty', text: '…' }));
    api('/api/admin/users/content' + qs).then(function (d) {
      box.textContent = '';
      var rows = d.rows || [];
      if (st.tab === 'chats') {
        if (!rows.length) return box.appendChild(h('div', { cls: 'empty', text: 'گفتگویی ثبت نشده.' }));
        var tb = h('tbody');
        rows.forEach(function (c) {
          var tr = h('tr', { cls: 'clickable' }, [h('td', { text: c.title || 'بدون عنوان' }), h('td', { text: fa(c.message_count) + ' پیام' }), h('td', { text: dt(c.created_at) })]);
          on(tr, 'click', function () { st.chatId = c.id; st.tab = 'messages'; st.page = 1; loadUserContent(box); });
          tb.appendChild(tr);
        });
        var t = h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: 'عنوان' }), h('th', { text: 'پیام‌ها' }), h('th', { text: 'تاریخ' })])]), tb]);
        box.appendChild(h('div', { cls: 'tbl-wrap' }, [labelTable(t)]));
      } else if (st.tab === 'messages') {
        var backBtn = h('button', { cls: 'btn btn-ghost btn-sm', text: '→ گفتگوها' });
        on(backBtn, 'click', function () { st.tab = 'chats'; st.page = 1; loadUserContent(box); });
        box.appendChild(backBtn);
        box.appendChild(h('h3', { text: 'محتوای گفتگو (فقط برای مدیران؛ محرمانه)', cls: 'small muted' }));
        if (!rows.length) box.appendChild(h('div', { cls: 'empty', text: 'پیامی وجود ندارد.' }));
        rows.forEach(function (m) {
          box.appendChild(h('div', { cls: 'bubble ' + (m.role === 'user' ? 'user-b' : 'ai-b') }, [
            h('div', { cls: 'b-meta' }, [h('span', { text: m.role === 'user' ? 'کاربر' : 'AI' }), h('span', { text: dt(m.created_at) })]),
            h('div', { text: m.content })
          ]));
        });
      } else {
        if (!rows.length) box.appendChild(h('div', { cls: 'empty', text: 'رکوردی نیست.' }));
        rows.forEach(function (r) {
          var line;
          if (st.tab === 'requests') line = h('div', { cls: 'list-item' }, [h('span', { text: 'وضعیت: ' + r.status + (r.error_code ? ' · ' + r.error_code : '') }), h('span', { cls: 'muted small', text: 'توکن: ' + fa(r.billed_tokens) + ' · ' + dOnly(r.updated_at) })]);
          else if (st.tab === 'errors') line = h('div', { cls: 'list-item' }, [h('span', { text: (r.error_code || 'خطا') + ' · ' + (r.model_used || '') }), h('span', { cls: 'muted small', text: dt(r.created_at) })]);
          else if (st.tab === 'support') line = h('div', { cls: 'list-item' }, [h('span', { text: (r.subject || 'بدون موضوع') + ' · ' + fa(r.message_count) + ' پیام' }), h('span', {}, [badge(r.status), h('span', { cls: 'muted small', text: ' ' + dOnly(r.updated_at) })])]);
          else if (st.tab === 'feedback') line = h('div', { cls: 'list-item' }, [h('span', { text: (r.rating === 'up' ? '▲ مثبت' : '▼ منفی') + (r.comment ? ' — ' + r.comment : '') }), h('span', { cls: 'muted small', text: dt(r.created_at) })]);
          else line = h('div', { cls: 'list-item' }, [h('span', { text: { message: 'پیام', login: 'ورود', support: 'پشتیبانی' }[r.kind] || r.kind }), h('span', { cls: 'muted small', text: dt(r.at) })]);
          box.appendChild(line);
        });
      }
      box.appendChild(pagerRow({ page: st.page, size: 20, total: d.total }, function (p) { st.page = p; loadUserContent(box); }));
    }).catch(function () { box.textContent = ''; box.appendChild(h('div', { cls: 'empty', text: 'بارگذاری ناموفق.' })); });
  }

  // ---------- support ----------
  function loadSupport(box) {
    box = box || $('view-support');
    box.textContent = '';
    var q = h('input', { type: 'search', placeholder: 'جستجوی ایمیل / موضوع…', value: S.support.q });
    var sel = h('select');
    [['', 'باز و بسته'], ['open', 'باز'], ['closed', 'بسته']].forEach(function (o) { sel.appendChild(h('option', { value: o[0], text: o[1] })); });
    sel.value = S.support.status;
    on(q, 'keydown', function (e) { if (e.key === 'Enter') { S.support.q = q.value; S.support.page = 1; loadSupport(); } });
    on(sel, 'change', function () { S.support.status = sel.value; S.support.page = 1; loadSupport(); });
    box.appendChild(h('div', { cls: 'toolbar' }, [q, sel]));

    var grid = h('div', { cls: 'sup-grid' });
    var listBox = h('div'), threadBox = h('div', { cls: 'card' }, [h('div', { cls: 'empty', text: 'یک درخواست را انتخاب کنید.' })]);
    grid.append(listBox, threadBox);
    box.appendChild(grid);

    var params = new URLSearchParams({ status: S.support.status, q: S.support.q, page: String(S.support.page), page_size: '20' });
    return api('/api/admin/support?' + params.toString()).then(function (d) {
      var rows = d.rows || [];
      if (!rows.length) { listBox.appendChild(h('div', { cls: 'empty', text: 'درخواستی نیست.' })); return; }
      var els = [];
      rows.forEach(function (t) {
        var el = h('div', { cls: 'thread' + (S.support.threadId === t.thread_id ? ' sel' : ''), tabindex: '0', role: 'button' }, [
          h('div', { cls: 'list-item' }, [
            h('b', { text: t.subject || '(بدون موضوع)' }),
            badge(t.status)
          ]),
          h('div', { cls: 'muted small dir-ltr', text: t.email || '' }),
          h('div', { cls: 'muted small', text: fa(t.message_count) + ' پیام · ' + ago(t.updated_at) })
        ]);
        function pick() {
          S.support.threadId = t.thread_id;
          els.forEach(function (x) { x.classList.toggle('sel', x === el); });
          renderThread(threadBox, t.thread_id);   // only the conversation reloads; the list keeps its scroll position
          if (window.innerWidth <= 1000) threadBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        on(el, 'click', pick);
        on(el, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        els.push(el);
        listBox.appendChild(el);
      });
      listBox.appendChild(pagerRow({ page: S.support.page, size: 20, total: d.total }, function (p) { S.support.page = p; loadSupport(); }));
      if (S.support.threadId) renderThread(threadBox, S.support.threadId);
    });
  }

  function renderThread(box, threadId) {
    box.textContent = '';
    box.appendChild(h('div', { cls: 'empty', text: '…' }));
    api('/api/admin/support/messages?thread_id=' + threadId).then(function (d) {
      box.textContent = '';
      box.appendChild(h('h3', { text: 'گفتگوی پشتیبانی' }));
      (d.rows || []).forEach(function (m) {
        box.appendChild(h('div', { cls: 'bubble ' + (m.sender === 'user' ? 'user-b' : 'ai-b') }, [
          h('div', { cls: 'b-meta' }, [h('span', { text: m.sender === 'user' ? 'کاربر' : 'پاسخ پشتیبانی' }), h('span', { text: dt(m.created_at) })]),
          h('div', { text: m.body })
        ]));
      });
      if (canSupportWrite()) {
        var ta = h('textarea', { placeholder: 'پاسخ شما…' });
        var send = h('button', { cls: 'btn btn-primary btn-sm', text: 'ارسال' });
        var closeBtn = h('button', { cls: 'btn btn-ghost btn-sm', text: 'بستن درخواست' });
        on(send, 'click', function () {
          var v = ta.value.trim();
          if (!v) return;
          send.disabled = true;
          api('/api/admin/support/reply', { method: 'POST', body: { thread_id: threadId, body: v } })
            .then(function () { toast('پاسخ ثبت شد.', true); loadSupport(); })
            .catch(function () { send.disabled = false; });
        });
        on(closeBtn, 'click', function () {
          askModal('بستن درخواست', h('p', { text: 'درخواست بسته می‌شود؛ کاربر در صورت پیام جدید دوباره آن را باز می‌کند.' }), 'بستن', function () {
            return api('/api/admin/support/status', { method: 'POST', body: { thread_id: threadId, status: 'closed' } })
              .then(function () { toast('بسته شد.', true); loadSupport(); });
          });
        });
        on(ta, 'keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send.click(); });
        box.appendChild(h('div', { cls: 'reply-box' }, [ta, h('div', { cls: 'reply-actions' }, [send, closeBtn])]));
      }
    }).catch(function () { box.textContent = ''; box.appendChild(h('div', { cls: 'empty', text: 'بارگذاری ناموفق.' })); });
  }

  // ---------- reports ----------
  function loadReports(box) {
    return api('/api/admin/stats').then(function (st) {
      var trend = st.trend || [];
      trend = trend.slice().sort(function (x, y) { return new Date(x.day) - new Date(y.day); });
      function ser(k) { return trend.map(function (d) { return { label: faDay(d.day), value: Number(d[k]) || 0 }; }); }
      box.append(
        h('div', { cls: 'grid chart-grid' }, [
          card('پیام‌های روزانه (' + fa(trend.length) + ' روز)', [areaChart(ser('messages'), { color: 'var(--c1)', height: 230 })]),
          card('توکن مصرفی روزانه', [areaChart(ser('tokens'), { color: 'var(--c2)', height: 230 })]),
          card('کاربران جدید', [areaChart(ser('signups'), { color: 'var(--c3)', height: 230 })]),
          card('جمع‌بندی', [
            h('div', { cls: 'list-item' }, [h('span', { text: 'کل پیام‌ها' }), h('span', { text: fa(st.content.messages) })]),
            h('div', { cls: 'list-item' }, [h('span', { text: 'کل درخواست‌های AI' }), h('span', { text: fa(st.ai.requests_total) })]),
            h('div', { cls: 'list-item' }, [h('span', { text: 'توکن این هفته' }), h('span', { text: fa(st.usage.tokens_week) })]),
            h('div', { cls: 'list-item' }, [h('span', { text: 'بازخورد کاربران ▲/▼' }), h('span', { text: fa(st.feedback.up) + ' / ' + fa(st.feedback.down) })]),
            h('div', { cls: 'list-item' }, [h('span', { text: 'درخواست‌های پشتیبانی باز/بسته' }), h('span', { text: fa(st.support.open) + ' / ' + fa(st.support.closed) })])
          ])
        ])
      );
      var topWrap = card('پرکاربرترین‌ها (۱۰ کاربر)', [h('div', { cls: 'empty', text: '…' })]);
      box.appendChild(topWrap);
      return api('/api/admin/users?sort=usage_desc&page=1&page_size=10').then(function (d) {
        topWrap.textContent = '';
        topWrap.appendChild(h('h3', { text: 'پرکاربرترین‌ها (۱۰ کاربر)' }));
        var tb = h('tbody');
        (d.rows || []).forEach(function (u) {
          tb.appendChild(h('tr', {}, [h('td', { cls: 'dir-ltr', text: u.email || u.id }), h('td', { text: fa(u.messages_count) + ' پیام' }), h('td', { text: fa(u.today_tokens) + ' توکن امروز' })]));
        });
        var tt = h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: 'کاربر' }), h('th', { text: 'پیام‌ها' }), h('th', { text: 'امروز' })])]), tb]);
        topWrap.appendChild(h('div', { cls: 'tbl-wrap' }, [labelTable(tt)]));
        if (!(d.rows || []).length) topWrap.appendChild(h('div', { cls: 'empty', text: 'داده‌ای نیست.' }));
      });
    });
  }

  // ---------- audit ----------
  function loadAudit(box) {
    box = box || $('view-audit');
    box.textContent = '';
    var wrap = h('div', { cls: 'tbl-wrap' });
    box.appendChild(wrap);
    return api('/api/admin/audit?page=' + S.audit.page + '&page_size=' + S.audit.size).then(function (d) {
      var rows = d.rows || [];
      if (!rows.length) { wrap.appendChild(h('div', { cls: 'empty', text: 'رویدادی ثبت نشده.' })); }
      else {
        var tb = h('tbody');
        rows.forEach(function (r) {
          var detail = r.detail ? JSON.stringify(r.detail) : '';
          if (detail.length > 120) detail = detail.slice(0, 120) + '…';
          tb.appendChild(h('tr', {}, [
            h('td', { text: dt(r.created_at) }),
            h('td', { text: r.action }),
            h('td', {}, [h('span', { cls: 'dir-ltr small', text: r.actor_email || '' }), h('div', { cls: 'muted small', text: roleLabel(r.actor_role) })]),
            h('td', { cls: 'dir-ltr small', text: r.target_email || '—' }),
            h('td', { cls: 'muted small dir-ltr', text: detail }),
            h('td', {}, [h('span', { cls: 'badge ' + (r.outcome === 'fail' ? 'err' : 'active'), text: r.outcome === 'fail' ? 'ناموفق' : 'موفق' })])
          ]));
        });
        wrap.appendChild(labelTable(h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: 'زمان' }), h('th', { text: 'اقدام' }), h('th', { text: 'عامل' }), h('th', { text: 'هدف' }), h('th', { text: 'جزئیات' }), h('th', { text: 'نتیجه' })])]), tb])));
      }
      box.appendChild(pagerRow({ page: S.audit.page, size: S.audit.size, total: d.total }, function (p) { S.audit.page = p; loadAudit(); }));
    });
  }

  // ---------- admins (owner only) ----------
  function loadAdmins(box) {
    box = box || $('view-admins');
    box.textContent = '';
    box.appendChild(card('دسترسی‌ها', [h('p', { cls: 'muted small', text: 'نقش‌ها: مالک (همه‌کاره، انحصاری) · مدیر (کاربران + سهمیه + پشتیبانی) · پشتیبانی (پاسخ به درخواست‌ها و مشاهده) · تحلیل‌گر (فقط خواندن آمار). همه بررسی‌ها سمت سرور انجام می‌شود.' })]));
    var listBox = card('مدیران فعلی', [h('div', { cls: 'empty', text: '…' })]);
    box.appendChild(listBox);
    var addBox = card('افزودن مدیر', [h('div', {}, [])]);
    box.appendChild(addBox);

    var email = h('input', { type: 'email', placeholder: 'ایمیل حساب کاربری', cls: 'dir-ltr' });
    var role = h('select');
    [['analyst', 'تحلیل‌گر'], ['support', 'پشتیبانی'], ['admin', 'مدیر'], ['owner', 'مالک']].forEach(function (o) { role.appendChild(h('option', { value: o[0], text: o[1] })); });
    var findBtn = h('button', { cls: 'btn btn-ghost btn-sm', text: 'یافتن کاربر' });
    var addBtn = h('button', { cls: 'btn btn-primary btn-sm', text: 'افزودن' });
    addBtn.disabled = true;
    var found = null;
    var infoLine = h('p', { cls: 'muted small', text: 'فقط کاربری که قبلاً ثبت‌نام کرده قابل افزودن است.' });
    on(findBtn, 'click', function () {
      var v = email.value.trim().toLowerCase();
      if (!v) return;
      api('/api/admin/members/find?email=' + encodeURIComponent(v)).then(function (u) {
        found = u; addBtn.disabled = false;
        infoLine.textContent = 'یافت شد: ' + u.id;
      }).catch(function () { found = null; addBtn.disabled = true; infoLine.textContent = 'کاربری با این ایمیل ثبت‌نام نکرده است.'; });
    });
    on(addBtn, 'click', function () {
      if (!found) return;
      api('/api/admin/members', { method: 'POST', body: { user_id: found.id, role: role.value } })
        .then(function () { toast('مدیر افزوده شد.', true); loadAdmins(); });
    });
    addBox.textContent = '';
    addBox.appendChild(h('h3', { text: 'افزودن مدیر' }));
    addBox.append(h('div', { cls: 'toolbar' }, [email, findBtn]), h('div', { cls: 'toolbar' }, [role, addBtn]), infoLine);

    return api('/api/admin/members').then(function (d) {
      listBox.textContent = '';
      listBox.appendChild(h('h3', { text: 'مدیران فعلی' }));
      var rows = d.members || [];
      if (!rows.length) { listBox.appendChild(h('div', { cls: 'empty', text: 'هنوز مدیری از این جدول افزوده نشده؛ کاربران ADMIN_USER_IDS با نقش «مدیر» دسترسی دارند.' })); return; }
      var tb = h('tbody');
      rows.forEach(function (m) {
        var change = h('select');
        [['analyst', 'تحلیل‌گر'], ['support', 'پشتیبانی'], ['admin', 'مدیر'], ['owner', 'مالک']].forEach(function (o) { change.appendChild(h('option', { value: o[0], text: o[1] })); });
        change.value = m.role;
        var saveBtn = h('button', { cls: 'btn btn-ghost btn-sm', text: 'اعمال' });
        var rmBtn = h('button', { cls: 'btn btn-danger btn-sm', text: 'حذف' });
        on(saveBtn, 'click', function () {
          askModal('تغییر نقش', h('p', { text: 'نقش «' + (m.email || m.user_id) + '» به «' + roleLabel(change.value) + '» تغییر کند؟ این روی دسترسی‌های سرور اثر فوری دارد.' }), 'تأیید', function () {
            return api('/api/admin/members', { method: 'POST', body: { user_id: m.user_id, role: change.value } }).then(function () { toast('نقش تغییر کرد.', true); loadAdmins(); });
          });
        });
        on(rmBtn, 'click', function () {
          askModal('حذف دسترسی', h('p', { text: 'دسترسی مدیریتی «' + (m.email || m.user_id) + '» کاملاً حذف شود؟' }), 'حذف', function () {
            return api('/api/admin/members', { method: 'POST', body: { user_id: m.user_id, role: null } }).then(function () { toast('حذف شد.', true); loadAdmins(); });
          }, true);
        });
        tb.appendChild(h('tr', {}, [
          h('td', { cls: 'dir-ltr', text: m.email || m.user_id }),
          h('td', { text: roleLabel(m.role) }),
          h('td', { cls: 'muted small', text: dOnly(m.created_at) }),
          h('td', { cls: 'muted small dir-ltr', text: m.added_by_email || '—' }),
          h('td', {}, [change, saveBtn, rmBtn])
        ]));
      });
      listBox.appendChild(h('div', { cls: 'tbl-wrap' }, [labelTable(h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: 'ایمیل' }), h('th', { text: 'نقش' }), h('th', { text: 'افزوده‌شده' }), h('th', { text: 'توسط' }), h('th', { text: 'عملیات' })])]), tb]))]));
    });
  }

  // ---------- boot ----------
  function boot() {
    return sb.auth.getSession().then(function (r) {
      if (!r.data.session) { showAuth(); return; }
      return api('/api/admin/me').then(function (m) {
        me = m;
        $('loader').classList.add('hidden');
        showApp();
        switchView('dash');
      }).catch(function (e) {
        if (e && e.status === 403) {
          var box = h('div', { cls: 'screen' }, [h('div', { cls: 'auth-card' }, [
            h('h1', { text: 'دسترسی ندارید' }),
            h('p', { cls: 'muted', text: 'این حساب در فهرست مدیران (admin_members یا ADMIN_USER_IDS) نیست.' }),
            h('button', { cls: 'btn btn-ghost', text: 'خروج' })
          ])]);
          box.querySelector('button').addEventListener('click', function () { sb.auth.signOut().then(function () { location.reload(); }); });
          $('loader').classList.add('hidden');
          document.body.appendChild(box);
          return;
        }
        showAuth();
        showAuthTab('pass');
        authMsg((e && (e.fa || (e.body && e.body.response))) || FA_ERRORS.unauthorized, true);
        checkSetupState();
      });
    });
  }

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('.navbtn'), function (b) {
      on(b, 'click', function () { switchView(b.getAttribute('data-view')); });
    });
    on($('refreshBtn'), 'click', function () { load(S.view); });
    on($('bellBtn'), 'click', function () { switchView('support'); });
    var gs = $('globalSearch');
    function focusSearch() {
      var uf = document.querySelector('#view-users .field-search input');
      if (gs && gs.offsetParent !== null) { gs.focus(); gs.select(); }
      else if (uf && uf.offsetParent !== null) { uf.focus(); uf.select(); }
      else switchView('users');
    }
    on($('kbdHint'), 'click', focusSearch);
    on(gs, 'keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      S.users.q = gs.value.trim(); S.users.page = 1;
      switchView('users');
      gs.blur();
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k' && !$('app').classList.contains('hidden')) { e.preventDefault(); focusSearch(); }
      if (e.key === 'Escape') {
        document.body.classList.remove('nav-open');
        if (!$('modalWrap').classList.contains('hidden')) closeModal();
      }
    });
    on($('menuBtn'), 'click', function () { document.body.classList.toggle('nav-open'); });
    on($('scrim'), 'click', function () { document.body.classList.remove('nav-open'); });
    on($('modalWrap'), 'click', function (e) { if (e.target === $('modalWrap')) closeModal(); });

    // theme (light / dark) — saved per browser; theme-init.js applies it before first paint
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) { on(b, 'click', toggleTheme); });
    // collapsible sidebar (desktop)
    var col = $('sideCollapse');
    if (col) {
      col.setAttribute('aria-expanded', document.documentElement.classList.contains('side-collapsed') ? 'false' : 'true');
      on(col, 'click', function () {
        var c = document.documentElement.classList.toggle('side-collapsed');
        col.setAttribute('aria-expanded', c ? 'false' : 'true');
        try { localStorage.setItem('adm-side', c ? 'collapsed' : 'open'); } catch (e) {}
      });
    }
  }
  function toggleTheme() {
    var root = document.documentElement;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('adm-theme', next); } catch (e) {}
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', next === 'dark' ? '#0b0b0c' : '#e9e9eb');
  }

  bindAuth();
  bind();
  showAuthTab('pass');
  // the setup probe must run on every load: it reveals the bootstrap entry and the admin login domain
  checkSetupState().then(boot, boot);

  // expose only for the router entry of user detail loaded via other views
  window.__ADM = { openUser: openUser };
})();
