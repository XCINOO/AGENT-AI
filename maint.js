/* حالت بروزرسانی
   برای نمایش صفحه‌ی «در حال بروزرسانی» مقدار را true بگذار، بعد از اتمام کار false.
   خودت با افزودن ?preview به آخر آدرس سایت می‌توانی سایت واقعی را ببینی. */
(function () {
  var MAINTENANCE = true;
  var preview = false;
  try {
    var hasPreview = /[?&]preview\b/.test(location.search);
    if (hasPreview) sessionStorage.setItem("maint_preview", "1");
    preview = hasPreview || sessionStorage.getItem("maint_preview") === "1";
  } catch (e) {}
  if (MAINTENANCE && !preview) { location.replace("./maintenance.html"); }
})();
