// Parser-blocking theme bootstrap (no flash). External file so the CSP needs no 'unsafe-inline'.
(function () {
  var theme = null;
  try {
    theme = window.localStorage.getItem('portfolio.theme');
  } catch {
    theme = null;
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
