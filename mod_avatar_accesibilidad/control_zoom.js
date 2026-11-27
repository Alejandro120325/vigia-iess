/* Control visual reducido: conserva únicamente el tema oscuro. */
(function () {
  'use strict';

  var KEY = 'vigia_tema';

  function readSavedTheme() {
    try { return localStorage.getItem(KEY) === '1'; }
    catch (_error) { return false; }
  }

  function saveTheme(enabled) {
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); }
    catch (_error) { /* La app sigue funcionando si el navegador bloquea storage. */ }
  }

  function applyTheme(enabled, button) {
    document.documentElement.classList.toggle('tema-oscuro', enabled);
    document.documentElement.classList.remove('alto-contraste');
    button.textContent = enabled ? 'Tema claro' : 'Tema oscuro';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Cambiar al tema claro' : 'Activar tema oscuro');
    saveTheme(enabled);
  }

  function start() {
    var host = document.querySelector('.header-side') || document.querySelector('.header-inner');
    if (!host || document.getElementById('vigiaThemeToggle')) return;

    var button = document.createElement('button');
    button.id = 'vigiaThemeToggle';
    button.type = 'button';
    button.className = 'theme-toggle';
    button.addEventListener('click', function () {
      applyTheme(!document.documentElement.classList.contains('tema-oscuro'), button);
    });

    var link = host.querySelector('.header-link');
    if (link) host.insertBefore(button, link);
    else host.appendChild(button);

    applyTheme(readSavedTheme(), button);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
