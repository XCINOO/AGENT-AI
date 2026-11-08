/* Maintenance gate — status is stored on the server (site_settings via get_maintenance_mode RPC)
   and switched only by admins from the admin panel.
   Preview bypass (?preview) is honoured ONLY for a signed-in owner/admin: the server-side
   is_site_admin() RPC is asked with the visitor's own access token. Anyone else is not bypassed.
   If the status itself cannot be read the normal site stays available (fail-open for availability).
   NOTE: this is a front-end gate; block /api/chat on the backend too if you need a hard stop. */
(function () {
  if (typeof APP_CONFIG === "undefined" || !APP_CONFIG.SUPABASE_URL) return;
  var base = APP_CONFIG.SUPABASE_URL.replace(/\/+$/, "");
  var hdr = { apikey: APP_CONFIG.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };

  function accessToken() {
    try {
      var ref = new URL(base).hostname.split(".")[0];
      var raw = localStorage.getItem("sb-" + ref + "-auth-token");
      var j = raw && JSON.parse(raw);
      return (j && (j.access_token || (j.currentSession && j.currentSession.access_token))) || "";
    } catch (e) { return ""; }
  }
  function post(path, extra, ms) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 4000);
    var h = {}; for (var k in hdr) h[k] = hdr[k]; for (var k2 in (extra || {})) h[k2] = extra[k2];
    return fetch(base + "/rest/v1/rpc/" + path, { method: "POST", headers: h, body: "{}", cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : null; })
      .catch(function () { clearTimeout(timer); return null; });
  }
  function isAdmin() {
    var tok = accessToken();
    if (!tok) return Promise.resolve(false);
    return post("is_site_admin", { Authorization: "Bearer " + tok }).then(function (v) { return v === true; });
  }
  function gate() {
    return post("get_maintenance_mode").then(function (d) {
      if (d && d.active === true) location.replace("./maintenance.html");
    });
  }

  var wantsPreview = false, remembered = false;
  try {
    wantsPreview = /[?&]preview\b/.test(location.search);
    remembered = sessionStorage.getItem("maint_preview") === "1";
  } catch (e) {}

  if (!wantsPreview && !remembered) { gate(); return; }
  isAdmin().then(function (ok) {
    try { if (ok) sessionStorage.setItem("maint_preview", "1"); else sessionStorage.removeItem("maint_preview"); } catch (e) {}
    if (!ok) gate();
  });
})();
