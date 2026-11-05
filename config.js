
// Unknown AI configuration
// فقط مقادیر عمومی پروژه را اینجا قرار بده.
// هرگز Secret / service_role / SMTP password را اینجا نگذار.

const APP_CONFIG = {
  SUPABASE_URL: "https://xjdfjepgduxfvwxltiba.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_vU7j_opt2336kIS_Jrpukw_hLNGB1bG",

  API_BASE_URL: "https://s422nb.bot-keep.xyz",

  ACTIVITY_ENDPOINT: ""
};

/** Build an API URL from API_BASE_URL. */
function apiUrl(path) {
  var base = String(
    (typeof APP_CONFIG !== "undefined" && APP_CONFIG.API_BASE_URL) || ""
  ).trim().replace(/\/+$/, "");

  if (!base || /REPLACE/i.test(base)) return "";

  var p = String(path || "");
  if (p && p.charAt(0) !== "/") p = "/" + p;

  return base + p;
}
```
