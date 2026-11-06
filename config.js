// Unknown AI configuration
// فقط مقادیر عمومی پروژه را اینجا قرار بده.
// هرگز Secret / service_role / SMTP password را اینجا نگذار.
const APP_CONFIG = {
  SUPABASE_URL: "https://xjdfjepgduxfvwxltiba.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_vU7j_opt2336kIS_Jrpukw_hLNGB1bG",

  // Single source of truth: Cloudflare Worker base URL (no trailing slash).
  // After deploy, set this to your workers.dev or custom domain, e.g.:
  //   "https://unknown-ai-backend.<account>.workers.dev"
  // Chat / usage / support paths are derived as API_BASE_URL + "/api/..."
  API_BASE_URL: "unknown-ai-backend-production.up.railway.app",

  // Leave empty until a Worker activity endpoint exists (empty = tracking off).
  ACTIVITY_ENDPOINT: ""
};

/** Build an API URL from API_BASE_URL. path should start with "/api/". */
function apiUrl(path) {
  var base = String((typeof APP_CONFIG !== "undefined" && APP_CONFIG.API_BASE_URL) || "").trim().replace(/\/+$/, "");
  if (!base || /REPLACE/i.test(base)) return "";
  var p = String(path || "");
  if (p && p.charAt(0) !== "/") p = "/" + p;
  return base + p;
}
