/* Runs in <head> so the saved theme is applied before first paint (no flash). */
(function () {
  document.documentElement.classList.add('js');
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) { /* storage unavailable — keep default */ }
})();
