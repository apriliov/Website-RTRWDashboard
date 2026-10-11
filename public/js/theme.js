(function () {
  try {
    var t = localStorage.getItem('theme');
    if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* ignore */ }
})();
