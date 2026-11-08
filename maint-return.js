/* On maintenance.html: return visitors to the main site once an admin switches maintenance off. */
(function () {
  if (typeof APP_CONFIG === "undefined" || !APP_CONFIG.SUPABASE_URL) return;
  var url = APP_CONFIG.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/get_maintenance_mode";
  function check() {
    if (document.hidden) return;
    fetch(url, {
      method: "POST",
      headers: { apikey: APP_CONFIG.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: "{}", cache: "no-store"
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.active === false) location.replace("./index.html"); })
      .catch(function () {});
  }
  check();
  setInterval(check, 60000);
  document.addEventListener("visibilitychange", check);
})();
