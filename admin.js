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
  function askModal(title, bodyNode, okLabel, onOk) {
    $('modalTitle').textContent = title;
    var b = $('modalBody'); b.textContent = '';
    if (bodyNode) b.appendChild(bodyNode);
    $('modalOk').textContent = okLabel || 'تأیید';
    $('modalWrap').classList.remove('hidden');
    $('modalOk').onclick = function () {
      $('modalWrap').classList.add('hidden');
      Promise.resolve(onOk && onOk(b)).catch(function () {});
    };
    $('modalCancel').onclick = function () { $('modalWrap').classList.add('hidden'); };
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
    $('navAdmins').classList.toggle('hidden', !isOwner());
  }
  function roleLabel(r) { return { owner: 'مالک', admin: 'مدیر', support: 'پشتیبانی', analyst: 'تحلیل‌گر' }[r] || r; }

  var VIEW_TITLES = { dash: 'داشبورد', users: 'کاربران', user: 'جزئیات کاربر', support: 'پشتیبانی', reports: 'گزارش‌ها', audit: 'رویدادهای مدیریتی', admins: 'مدیران' };
  function switchView(v, keepScroll) {
    if (v === 'admins' && !isOwner()) v = 'dash';
    S.view = v;
    Array.prototype.forEach.call(document.querySelectorAll('.navbtn'), function (b) { b.classList.toggle('active', b.getAttribute('data-view') === v); });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (s) { s.classList.add('hidden'); });
    $('pageTitle').textContent = VIEW_TITLES[v];
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
    box.textContent = '';
    if (!fn) return;
    var spin = h('div', { cls: 'loading-row' }, [h('div', { cls: 'spinner spinner-sm' }), h('span', { cls: 'muted', text: 'در حال دریافت داده…' })]);
    box.appendChild(spin);
    var p;
    try { p = fn(box); } finally { if (spin.parentNode) spin.parentNode.removeChild(spin); }
    Promise.resolve(p).catch(function (e) {
      if (e && (e.message === 'no_session' || e.message === 'unauthorized')) return;
      box.textContent = '';
      var text = (e && (e.fa || (e.body && e.body.response))) || 'بارگذاری این بخش ناموفق بود.';
      var retry = h('button', { cls: 'btn btn-ghost btn-sm', text: 'تلاش دوباره' });
      on(retry, 'click', function () { load(v); });
      box.appendChild(h('div', { cls: 'empty' }, [h('div', { cls: 'err-note', text: text }), h('div', { style: 'margin-top:12px' }, [retry])]));
    });
  }

  // ---------- tiny SVG charts ----------
  function bars(data, color, height) {
    height = height || 160;
    var svgNS = 'http://www.w3.org/2000/svg';
    var n = data.length || 1;
    var max = Math.max.apply(null, data.map(function (d) { return d.value || 0; }).concat([1]));
    var svg = document.createElementNS(svgNS, 'svg');
    var W = Math.max(n * 32, 340), H = height;
    var padL = 8, padR = 8, padT = 12, padB = 24;
    var chartW = W - padL - padR, chartH = H - padT - padB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    // soft grid lines
    for (var g = 0; g < 4; g++) {
      var gy = padT + (chartH / 3) * g;
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', padL); line.setAttribute('x2', W - padR);
      line.setAttribute('y1', gy); line.setAttribute('y2', gy);
      line.setAttribute('stroke', 'rgba(255,255,255,0.04)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }
    // build path points (RTL: newest on the right visually → reverse x)
    var pts = [];
    data.forEach(function (d, i) {
      var x = padL + ((n - 1 - i) / Math.max(n - 1, 1)) * chartW;
      var y = padT + chartH - (Math.max(d.value, 0) / max) * chartH;
      pts.push({ x: x, y: y, d: d });
    });
    // area fill under the curve
    if (pts.length > 1) {
      var area = document.createElementNS(svgNS, 'path');
      var ad = 'M' + pts[0].x + ',' + (padT + chartH);
      pts.forEach(function (p) { ad += ' L' + p.x + ',' + p.y; });
      ad += ' L' + pts[pts.length - 1].x + ',' + (padT + chartH) + ' Z';
      area.setAttribute('d', ad);
      area.setAttribute('fill', color);
      area.setAttribute('opacity', '0.12');
      svg.appendChild(area);
    }
    // smooth-ish polyline
    if (pts.length) {
      var path = document.createElementNS(svgNS, 'path');
      var pd = 'M' + pts[0].x + ',' + pts[0].y;
      for (var i = 1; i < pts.length; i++) {
        var prev = pts[i - 1], cur = pts[i];
        var cpx = (prev.x + cur.x) / 2;
        pd += ' C' + cpx + ',' + prev.y + ' ' + cpx + ',' + cur.y + ' ' + cur.x + ',' + cur.y;
      }
      path.setAttribute('d', pd);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    }
    // dots + labels
    pts.forEach(function (p, i) {
      var c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
      c.setAttribute('r', i === 0 ? 4.5 : 3);
      c.setAttribute('fill', color);
      c.setAttribute('stroke', '#121214');
      c.setAttribute('stroke-width', '2');
      var title = document.createElementNS(svgNS, 'title');
      title.textContent = p.d.label + ': ' + fa(p.d.value);
      c.appendChild(title);
      svg.appendChild(c);
      if (n <= 16 && i % (n > 10 ? 2 : 1) === 0) {
        var tx = document.createElementNS(svgNS, 'text');
        tx.setAttribute('x', p.x);
        tx.setAttribute('y', H - 6);
        tx.setAttribute('fill', '#8a8a96');
        tx.setAttribute('font-size', '9');
        tx.setAttribute('text-anchor', 'middle');
        tx.textContent = p.d.label;
        svg.appendChild(tx);
      }
    });
    return h('div', { cls: 'chart' }, [svg]);
  }
  function faDay(iso) { try { return new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'numeric' }).format(new Date(iso)); } catch (e) { return iso; } }

  function card(title, kids) { return h('div', { cls: 'card' }, [h('h3', { text: title })].concat(kids)); }
  function kpi(label, value, sub) {
    return h('div', { cls: 'kpi' }, [
      h('div', { cls: 'k-label', text: label }),
      h('div', { cls: 'k-value', text: value }),
      sub ? h('div', { cls: 'k-sub', text: sub }) : null
    ]);
  }
  function badge(status) {
    var map = { active: 'فعال', suspended: 'معلّق', banned: 'بن', open: 'باز', closed: 'بسته' };
    var cls = ['active', 'suspended', 'banned', 'open', 'closed'].indexOf(status) >= 0 ? status : 'closed';
    return h('span', { cls: 'badge ' + cls, text: map[status] || status || '—' });
  }

  // ---------- dashboard ----------
  function loadDash(box) {
    var portfolio = h('div', { cls: 'portfolio-card' });
    var portfolioHead = h('div', { cls: 'portfolio-head' }, [
      h('h3', { text: 'نمای کلی سیستم' }),
      h('div', { cls: 'portfolio-actions' }, [
        h('span', { cls: 'muted small', id: 'dashLiveHint', text: 'زنده' })
      ])
    ]);
    var grid = h('div', { cls: 'grid kpis' });
    portfolio.append(portfolioHead, grid);
    var two = h('div', { cls: 'grid cols-2' });
    var three = h('div', { cls: 'grid cols-3' });
    var health = card('سلامت سیستم', [h('div', { cls: 'empty', text: '…' })]);
    [portfolio, two, three, health].forEach(function (x) { box.appendChild(x); });

    return Promise.all([
      api('/api/admin/stats'),
      fetch(apiUrl('/api/health')).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; })
    ]).then(function (rs) {
      var st = rs[0], hb = rs[1];
      ONLINE_MIN = st.online_minutes || ONLINE_MIN;
      lastStatsAt = Date.now();
      $('refreshMeta').textContent = 'آخرین به‌روزرسانی: ' + dt(new Date().toISOString());
      grid.textContent = '';
      grid.append(
        kpi('کاربران کل', fa(st.users.total), fa(st.users.confirmed) + ' ایمیل تأییدشده'),
        kpi('آنلاین (' + fa(ONLINE_MIN) + ' دقیقه اخیر)', fa(st.users.online), 'بر پایه آخرین فعالیت سمت سرور'),
        kpi('ورودهای جدید امروز', fa(st.users.new_today), 'این هفته: ' + fa(st.users.new_week)),
        kpi('وضعیت حساب‌ها', fa(st.users.active) + ' / ' + fa(st.users.suspended) + ' / ' + fa(st.users.banned), 'فعال / معلّق / بن'),
        kpi('گفتگوها', fa(st.content.chats)),
        kpi('پیام‌ها', fa(st.content.messages), fa(st.content.user_messages) + ' کاربری · ' + fa(st.content.ai_messages) + ' هوش مصنوعی'),
        kpi('درخواست‌های AI امروز', fa(st.ai.requests_today), 'کل: ' + fa(st.ai.requests_total)),
        kpi('توکن مصرفی امروز', fa(st.usage.tokens_today), 'هفته: ' + fa(st.usage.tokens_week)),
        kpi('پیام‌های امروز (سهمیه)', fa(st.usage.messages_today)),
        kpi('نشست‌های ورود', fa(st.sessions.logins_today), 'امروز · هفته: ' + fa(st.sessions.logins_week)),
        kpi('خطاهای AI (۲۴ ساعت)', fa(st.ai.failed_24h), st.feedback.up ? 'بازخورد ▲' + fa(st.feedback.up) + ' ▼' + fa(st.feedback.down) : ''),
        kpi('پشتیبانی باز', fa(st.support.open), 'جدید امروز: ' + fa(st.support.new_today))
      );

      two.textContent = '';
      two.append(
        card('روند ۱۴ روز — پیام‌ها', [bars((st.trend || []).map(function (d) { return { label: faDay(d.day), value: d.messages }; }), '#e5484d')]),
        card('روند ۱۴ روز — درخواست‌های AI', [bars((st.trend || []).map(function (d) { return { label: faDay(d.day), value: d.requests }; }), '#527bff')])
      );

      function listItem(left, right) { return h('div', { cls: 'list-item' }, [left, h('span', { cls: 'muted small', text: right })]); }
      three.textContent = '';
      three.append(
        card('تازه‌ترین عضوها', (st.recent_signups || []).map(function (u) {
          return listItem(h('span', { cls: 'dir-ltr', text: u.email || u.id }), dOnly(u.created_at));
        }).concat(st.recent_signups && st.recent_signups.length ? [] : [h('div', { cls: 'empty', text: 'کاربری وجود ندارد' })])),
        card('فعالیت‌های اخیر', (st.recent_activity || []).map(function (a) {
          var kinds = { message: 'پیام', login: 'ورود', support: 'پشتیبانی' };
          return listItem(h('span', { cls: 'dir-ltr', text: (a.email || a.user_id || '').slice(0, 24) + ' · ' + (kinds[a.kind] || a.kind) }), ago(a.at));
        }).concat([st.recent_activity && st.recent_activity.length ? null : h('div', { cls: 'empty', text: 'فعالیتی ثبت نشده' })])),
        card('خطاهای اخیر', (st.recent_errors || []).map(function (e) {
          return listItem(h('span', { cls: 'dir-ltr', text: (e.email || '').slice(0, 24) + ' · ' + (e.error_code || 'error') }), ago(e.at));
        }).concat([st.recent_errors && st.recent_errors.length ? null : h('div', { cls: 'empty', text: 'خطایی گزارش نشده ✓' })]))
      );

      health.textContent = '';
      var apiOk = hb && hb.ok && hb.configured;
      [
        h('div', { cls: 'list-item' }, [h('span', {}, [h('span', { cls: 'dot ' + (hb && hb.ok ? 'on' : 'off') }), h('span', { text: 'API Worker' })]), h('span', { cls: 'muted small', text: hb && hb.configured ? 'آماده‌به‌کار' : (hb && hb.ok ? 'پیکربندی ناقص' : 'در دسترس نیست') })]),
        h('div', { cls: 'list-item' }, [h('span', {}, [h('span', { cls: 'dot ' + (st ? 'on' : 'off') }), h('span', { text: 'دسترسی به پایگاه داده' })]), h('span', { cls: 'muted small', text: st ? 'اسنپ‌شات ' + dt(st.generated_at) : '—' })]),
        h('div', { cls: 'list-item' }, [h('span', { text: 'آخرین درخواست AI' }), h('span', { cls: 'muted small', text: ago(st.ai.last_request_at) })]),
        h('div', { cls: 'list-item' }, [h('span', { text: 'درخواست‌های ناموفق ۲۴ ساعت' }), h('span', { cls: st.ai.failed_24h > 0 ? 'badge err' : 'muted small', text: fa(st.ai.failed_24h) })]),
        apiOk ? null : h('p', { cls: 'err-note', text: 'بررسی: در صورت خرابی، وضعیت پیکربندی Worker و اتصال Supabase را بررسی کنید.' })
      ].forEach(function (x) { if (x) health.appendChild(x); });
    });
  }

  // ---------- users ----------
  var USORTS = { created_desc: 'جدیدترین', created_asc: 'قدیمی‌ترین', activity_desc: 'آخرین فعالیت', usage_desc: 'بیشترین پیام' };
  var USTATUSES = { '': 'همه', online: 'آنلاین', active: 'فعال', suspended: 'معلّق', banned: 'بن', unconfirmed: 'بدون تأیید ایمیل' };

  function usersToolbar() {
    var q = h('input', { type: 'search', placeholder: 'جستجوی ایمیل / شماره / شناسه…', value: S.users.q });
    var status = h('select');
    Object.keys(USTATUSES).forEach(function (k) { status.appendChild(h('option', { value: k, text: USTATUSES[k] })); });
    status.value = S.users.status;
    var sort = h('select');
    Object.keys(USORTS).forEach(function (k) { sort.appendChild(h('option', { value: k, text: USORTS[k] })); });
    sort.value = S.users.sort;
    var exportBtn = h('button', { cls: 'btn btn-ghost btn-sm', text: 'خروجی CSV' });
    on(q, 'keydown', function (e) { if (e.key === 'Enter') { S.users.q = q.value; S.users.page = 1; loadUsers(); } });
    on(status, 'change', function () { S.users.status = status.value; S.users.page = 1; loadUsers(); });
    on(sort, 'change', function () { S.users.sort = sort.value; S.users.page = 1; loadUsers(); });
    on(exportBtn, 'click', exportUsers);
    return h('div', { cls: 'toolbar' }, [q, status, sort, exportBtn]);
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

  function loadUsers(box) {
    box = box || $('view-users');
    box.textContent = '';
    box.appendChild(usersToolbar());
    var wrap = h('div', { cls: 'tbl-wrap' });
    box.appendChild(wrap);
    var params = new URLSearchParams({ q: S.users.q, status: S.users.status, sort: S.users.sort, page: String(S.users.page), page_size: String(S.users.size) });
    return api('/api/admin/users?' + params.toString()).then(function (d) {
      var rows = d.rows || [];
      S.users.total = d.total || 0;
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
          var tr = h('tr', { cls: 'clickable' }, [
            h('td', {}, [h('span', { cls: 'dot ' + (online ? 'on' : 'off') }), h('span', { cls: 'dir-ltr', text: u.email || String(u.id).slice(0, 8) }), u.phone ? h('div', { cls: 'muted small dir-ltr', text: u.phone }) : null]),
            h('td', {}, [badge(u.admin_status)]),
            h('td', { text: dOnly(u.created_at) }),
            h('td', {}, [h('span', { text: ago(u.last_activity) || '—' }), h('div', { cls: 'muted small', text: online ? 'آنلاین' : '' })]),
            h('td', { text: fa(u.chats_count) }),
            h('td', { text: fa(u.messages_count) }),
            h('td', { text: fa(u.today_messages) + ' / ' + fa(u.today_tokens) })
          ]);
          on(tr, 'click', function () { openUser(u.id); });
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        wrap.appendChild(table);
      }
      box.appendChild(pagerRow(S.users, function (p) { S.users.page = p; loadUsers(); }));
    }).catch(function () { wrap.appendChild(h('div', { cls: 'empty', text: 'بارگذاری ناموفق.' })); });
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
    var back = h('button', { cls: 'btn btn-ghost btn-sm', text: '← بازگشت به کاربران' });
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
        h('div', { cls: 'toolbar' }, [badge(u.admin_status), u.admin_role ? h('span', { cls: 'role-badge', text: roleLabel(u.admin_role) }) : null]),
        h('h2', { text: u.email || u.id, cls: 'small muted dir-ltr' }),
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
      });
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
        box.appendChild(t);
      } else if (st.tab === 'messages') {
        var backBtn = h('button', { cls: 'btn btn-ghost btn-sm', text: '← گفتگوها' });
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
      rows.forEach(function (t) {
        var el = h('div', { cls: 'thread' + (S.support.threadId === t.thread_id ? ' sel' : '') }, [
          h('div', { cls: 'list-item' }, [
            h('b', { text: t.subject || '(بدون موضوع)' }),
            badge(t.status)
          ]),
          h('div', { cls: 'muted small dir-ltr', text: t.email || '' }),
          h('div', { cls: 'muted small', text: fa(t.message_count) + ' پیام · ' + ago(t.updated_at) })
        ]);
        on(el, 'click', function () { S.support.threadId = t.thread_id; loadSupport(); });
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
        box.appendChild(h('div', { cls: 'reply-box' }, [ta, h('div', {}, [send, h('div', { style: 'height:6px' }), closeBtn])]));
      }
    }).catch(function () { box.textContent = ''; box.appendChild(h('div', { cls: 'empty', text: 'بارگذاری ناموفق.' })); });
  }

  // ---------- reports ----------
  function loadReports(box) {
    return api('/api/admin/stats').then(function (st) {
      var trend = st.trend || [];
      box.append(
        card('پیام‌های روزانه (۱۴ روز)', [bars(trend.map(function (d) { return { label: faDay(d.day), value: d.messages }; }), '#e5484d', 180)]),
        card('توکن مصرفی روزانه', [bars(trend.map(function (d) { return { label: faDay(d.day), value: d.tokens }; }), '#f5a524', 180)]),
        card('کاربران جدید', [bars(trend.map(function (d) { return { label: faDay(d.day), value: d.signups }; }), '#46a758', 180)]),
        card('جمع‌بندی', [
          h('div', { cls: 'list-item' }, [h('span', { text: 'کل پیام‌ها' }), h('span', { text: fa(st.content.messages) })]),
          h('div', { cls: 'list-item' }, [h('span', { text: 'کل درخواست‌های AI' }), h('span', { text: fa(st.ai.requests_total) })]),
          h('div', { cls: 'list-item' }, [h('span', { text: 'توکن این هفته' }), h('span', { text: fa(st.usage.tokens_week) })]),
          h('div', { cls: 'list-item' }, [h('span', { text: 'بازخورد کاربران ▲/▼' }), h('span', { text: fa(st.feedback.up) + ' / ' + fa(st.feedback.down) })]),
          h('div', { cls: 'list-item' }, [h('span', { text: 'درخواست‌های پشتیبانی باز/بسته' }), h('span', { text: fa(st.support.open) + ' / ' + fa(st.support.closed) })])
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
        topWrap.appendChild(h('table', {}, [tb]));
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
        wrap.appendChild(h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: 'زمان' }), h('th', { text: 'اقدام' }), h('th', { text: 'عامل' }), h('th', { text: 'هدف' }), h('th', { text: 'جزئیات' }), h('th', { text: 'نتیجه' })])]), tb]));
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
          });
        });
        tb.appendChild(h('tr', {}, [
          h('td', { cls: 'dir-ltr', text: m.email || m.user_id }),
          h('td', { text: roleLabel(m.role) }),
          h('td', { cls: 'muted small', text: dOnly(m.created_at) }),
          h('td', { cls: 'muted small dir-ltr', text: m.added_by_email || '—' }),
          h('td', {}, [change, saveBtn, rmBtn])
        ]));
      });
      listBox.appendChild(h('div', { cls: 'tbl-wrap' }, [h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: 'ایمیل' }), h('th', { text: 'نقش' }), h('th', { text: 'افزوده‌شده' }), h('th', { text: 'توسط' }), h('th', { text: 'عملیات' })])]), tb])]));
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
    on($('menuBtn'), 'click', function () { document.body.classList.toggle('nav-open'); });
    on($('modalWrap'), 'click', function (e) { if (e.target === $('modalWrap')) $('modalWrap').classList.add('hidden'); });
  }

  bindAuth();
  bind();
  showAuthTab('pass');
  // the setup probe must run on every load: it reveals the bootstrap entry and the admin login domain
  checkSetupState().then(boot, boot);

  // expose only for the router entry of user detail loaded via other views
  window.__ADM = { openUser: openUser };
})();
