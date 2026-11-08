/* Unknown AI - account layer: phone field helpers, profile completion, language sync with the profile.
   Depends on: i18n.js, phone.js and the globals created by index.html (sb, user, renderChats).
   Everything here is best-effort: if migration_001_profiles.sql has not been applied yet,
   profile calls fail quietly and sign-in/chat keep working exactly as before. */
(function () {
  'use strict';
  var g = function (i) { return document.getElementById(i); };
  var T = function (k, p) { return I18N.t(k, p); };

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
    return null;
  }

  /* ---------- country selector + "already saved" convenience (local only; reveals nothing about accounts) ---------- */
  var sel = g('phoneCountry'), phoneInput = g('phone'), emailInput = g('email');

  function fillCountries() {
    if (!sel || !window.PHONE) return;
    var cur = sel.value || ls('phone_cc') || 'IR';
    sel.textContent = '';
    PHONE.COUNTRIES.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.c;
      o.textContent = c[I18N.lang] + '  (+' + c.d + ')';
      sel.appendChild(o);
    });
    sel.value = cur;
  }
  if (sel) {
    fillCountries();
    sel.addEventListener('change', function () { ls('phone_cc', sel.value); });
  }

  function doneKey(email) { return 'ph_ok:' + String(email || '').trim().toLowerCase(); }
  window.__phoneOptional = function (email) { return ls(doneKey(email)) === '1'; };
  function syncOptional() {
    if (!phoneInput || !emailInput) return;
    var opt = window.__phoneOptional(emailInput.value);
    phoneInput.setAttribute('data-i18n-placeholder', opt ? 'auth.phone.optional' : 'auth.phone.placeholder');
    phoneInput.setAttribute('placeholder', T(opt ? 'auth.phone.optional' : 'auth.phone.placeholder'));
  }
  if (emailInput) emailInput.addEventListener('input', syncOptional);

  /* ---------- profile API (security-definer RPC; identity comes from the session, never from the page) ---------- */
  var profilesOk = true;
  async function saveProfile(phone, lang) {
    try {
      var r = await sb.rpc('upsert_my_profile', { p_phone: phone || null, p_language: lang || null });
      if (r.error) throw r.error;
      return r.data || true;
    } catch (e) {
      console.warn('profile save failed', e && (e.message || e));
      return null;
    }
  }

  /* ---------- profile completion modal (reuses the site's confirm-dialog look) ---------- */
  var modal = null, mErr = null, mPhone = null, mCc = null, mSave = null, mLastFocus = null, curUser = null;

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'cd-modal'; modal.setAttribute('aria-hidden', 'true'); modal.id = 'profileModal';
    modal.innerHTML =
      '<div class="cd-panel" role="dialog" aria-modal="true" aria-labelledby="pfTitle" aria-describedby="pfDesc">' +
        '<h2 class="cd-title" id="pfTitle" data-i18n="profile.title"></h2>' +
        '<p class="cd-sub" id="pfDesc" data-i18n="profile.desc"></p>' +
        '<div class="phonerow"><select id="pfCc" class="authinput phonecc" data-i18n-aria="auth.phone.country"></select>' +
        '<input id="pfPhone" class="authinput phoneinput" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" dir="ltr" data-i18n-placeholder="auth.phone.placeholder" data-i18n-aria="auth.phone.label"></div>' +
        '<div id="pfErr" class="authmsg" role="status" aria-live="polite"></div>' +
        '<div class="cd-actions"><button type="button" class="cd-btn cd-keep" id="pfSave" data-i18n="profile.save"></button>' +
        '<button type="button" class="cd-btn us-sec" id="pfLater" data-i18n="profile.later"></button></div>' +
      '</div>';
    document.body.appendChild(modal);
    I18N.apply(modal);
    mErr = g('pfErr'); mPhone = g('pfPhone'); mCc = g('pfCc'); mSave = g('pfSave');
    PHONE.COUNTRIES.forEach(function (c) {
      var o = document.createElement('option'); o.value = c.c; o.textContent = c[I18N.lang] + '  (+' + c.d + ')'; mCc.appendChild(o);
    });
    mCc.value = ls('phone_cc') || 'IR';
    mSave.addEventListener('click', submit);
    g('pfLater').addEventListener('click', function () { try { sessionStorage.setItem('pf_later', '1'); } catch (e) {} closeModal(); });
    mPhone.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeModal(); return; }
      if (e.key === 'Tab') {
        var f = [].filter.call(modal.querySelectorAll('button,select,input'), function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }
  var waitTries = 0;
  function openModal() {
    /* never stack on top of the (required) avatar picker: wait until it is closed */
    if (document.querySelector('.av-modal.open') && waitTries++ < 240) { setTimeout(openModal, 500); return; }
    waitTries = 0;
    if (!modal) buildModal();
    if (modal.classList.contains('open')) return;
    mLastFocus = document.activeElement;
    mErr.textContent = ''; mErr.className = 'authmsg';
    void modal.offsetWidth;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    setTimeout(function () { try { mPhone.focus({ preventScroll: true }); } catch (e) {} }, 80);
  }
  function closeModal() {
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
    if (mLastFocus && mLastFocus.focus && document.contains(mLastFocus)) try { mLastFocus.focus({ preventScroll: true }); } catch (e) {}
  }
  async function submit() {
    var raw = mPhone.value.trim();
    var r = raw ? PHONE.normalize(mCc.value, raw) : { ok: false, reason: 'empty' };
    if (!r.ok) { mErr.textContent = T(r.reason === 'empty' ? 'auth.err.phoneEmpty' : 'auth.err.phoneInvalid'); mErr.className = 'authmsg autherr'; return; }
    mSave.disabled = true; mErr.className = 'authmsg'; mErr.textContent = T('profile.saving');
    ls('phone_cc', mCc.value);
    var res = await saveProfile(r.e164, I18N.lang);
    mSave.disabled = false;
    if (!res) { mErr.textContent = T('profile.err'); mErr.className = 'authmsg autherr'; return; }
    if (curUser) ls(doneKey(curUser.email), '1');
    closeModal();
  }

  /* ---------- after sign-in: sync language, store pending phone, or ask for it ---------- */
  var handledFor = null, langTimer = null;
  async function onUser(u) {
    if (!u || handledFor === u.id) return;
    handledFor = u.id; curUser = u;
    var prof = null;
    try {
      var r = await sb.from('profiles').select('phone,phone_verified,language').eq('id', u.id).maybeSingle();
      if (r.error) throw r.error;
      prof = r.data;
    } catch (e) { profilesOk = false; console.warn('profiles unavailable (migration not applied?)', e && (e.message || e)); return; }

    var dbLang = prof && prof.language;
    if (dbLang && !I18N.hasStored()) I18N.setLang(dbLang);                 /* new device: adopt saved preference */
    else if (dbLang !== I18N.lang) saveProfile(null, I18N.lang);           /* local choice wins and is stored */

    if (prof && prof.phone) { ls(doneKey(u.email), '1'); return; }
    if (window.__pendingPhone) {
      var saved = await saveProfile(window.__pendingPhone, I18N.lang);
      window.__pendingPhone = null;
      if (saved) { ls(doneKey(u.email), '1'); return; }
    }
    var later = null; try { later = sessionStorage.getItem('pf_later'); } catch (e) {}
    if (!later) openModal();
  }
  try {
    sb.auth.onAuthStateChange(function (ev, session) {
      if (session && session.user) setTimeout(function () { onUser(session.user); }, 0);
      else { handledFor = null; curUser = null; closeModal(); }
    });
  } catch (e) { console.warn('account: auth listener unavailable', e); }

  /* ---------- language switch side effects ---------- */
  document.addEventListener('langchange', function () {
    fillCountries(); syncOptional();
    if (modal) { var cc = mCc.value; [].forEach.call(mCc.options, function (o) { var c = PHONE.COUNTRIES.filter(function (x) { return x.c === o.value; })[0]; if (c) o.textContent = c[I18N.lang] + '  (+' + c.d + ')'; }); mCc.value = cc; }
    [].forEach.call(document.querySelectorAll('.msg.user .avatar'), function (a) { a.textContent = T('chat.you'); });
    try { if (typeof renderChats === 'function') renderChats(); } catch (e) {}
    if (curUser && profilesOk) { clearTimeout(langTimer); langTimer = setTimeout(function () { saveProfile(null, I18N.lang); }, 600); }
  });
})();
