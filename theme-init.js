/* Runs before first paint (loaded in <head>) so the saved theme / sidebar state never flashes. */
(function () {
  var root = document.documentElement;
  var theme = null, side = null;
  try { theme = localStorage.getItem('adm-theme'); side = localStorage.getItem('adm-side'); } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', theme);
  if (side === 'collapsed') root.classList.add('side-collapsed');
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', theme === 'dark' ? '#0b0b0c' : '#e9e9eb');
})();
