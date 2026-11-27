/* Controles de tema y tamaño de texto de Vigía IESS. */
(function () {
  'use strict';

  var MIN = 80;
  var MAX = 150;
  var STEP = 10;
  var DEFAULT_ZOOM = 100;
  var KEY_ZOOM = 'vigia_zoom';
  var KEY_THEME = 'vigia_tema';
  var zoom = DEFAULT_ZOOM;
  var minusButton;
  var plusButton;
  var valueButton;
  var themeButton;
  var announcement;

  function read(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function save(key, value) {
    try { window.localStorage.setItem(key, String(value)); }
    catch (_error) { /* La interfaz sigue funcionando sin almacenamiento local. */ }
  }

  function makeButton(text, className, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  }

  function applyZoom(nextZoom, announce) {
    zoom = Math.max(MIN, Math.min(MAX, nextZoom));
    document.documentElement.style.fontSize = zoom + '%';
    valueButton.textContent = zoom + '%';
    valueButton.setAttribute('aria-label', 'Tamaño actual del texto: ' + zoom + ' por ciento. Pulsar para restablecer al 100 por ciento.');
    minusButton.disabled = zoom <= MIN;
    plusButton.disabled = zoom >= MAX;
    save(KEY_ZOOM, zoom);
    if (announce) announcement.textContent = 'Tamaño del texto: ' + zoom + ' por ciento.';
    document.dispatchEvent(new CustomEvent('vigia:zoom', { detail: { zoom: zoom } }));
  }

  function applyTheme(enabled, announce) {
    document.documentElement.classList.toggle('tema-oscuro', enabled);
    document.documentElement.classList.remove('alto-contraste');
    themeButton.textContent = enabled ? 'Tema claro' : 'Tema oscuro';
    themeButton.setAttribute('aria-pressed', String(enabled));
    themeButton.setAttribute('aria-label', enabled ? 'Cambiar al tema claro' : 'Activar tema oscuro');
    save(KEY_THEME, enabled ? '1' : '0');
    if (announce) announcement.textContent = enabled ? 'Tema oscuro activado.' : 'Tema claro activado.';
  }

  function start() {
    var host = document.querySelector('.header-side');
    if (!host || document.getElementById('vigiaFontControls')) return;

    /* El enlace de salto ya no ocupa espacio en la barra superior. */
    var oldLink = host.querySelector('.header-link');
    if (oldLink) oldLink.remove();

    themeButton = document.getElementById('vigiaThemeToggle');
    if (!themeButton) {
      themeButton = makeButton('Tema oscuro', 'theme-toggle', 'Activar tema oscuro');
      themeButton.id = 'vigiaThemeToggle';
    }
    themeButton.addEventListener('click', function () {
      applyTheme(!document.documentElement.classList.contains('tema-oscuro'), true);
    });

    var group = document.createElement('div');
    group.id = 'vigiaFontControls';
    group.className = 'font-size-controls';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Tamaño del texto');

    minusButton = makeButton('A−', 'font-size-minus', 'Reducir tamaño del texto');
    valueButton = makeButton('100%', 'font-size-value font-size-reset', 'Restablecer tamaño del texto al 100 por ciento');
    plusButton = makeButton('A+', 'font-size-plus', 'Aumentar tamaño del texto');
    announcement = document.createElement('span');
    announcement.className = 'sr-only';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');

    minusButton.addEventListener('click', function () { applyZoom(zoom - STEP, true); });
    plusButton.addEventListener('click', function () { applyZoom(zoom + STEP, true); });
    valueButton.addEventListener('click', function () { applyZoom(DEFAULT_ZOOM, true); });

    group.appendChild(minusButton);
    group.appendChild(valueButton);
    group.appendChild(plusButton);

    /* Orden final: perfil, tema y controles A−/A+. */
    host.appendChild(themeButton);
    host.appendChild(group);
    host.appendChild(announcement);

    var savedZoom = parseInt(read(KEY_ZOOM, DEFAULT_ZOOM), 10);
    if (isNaN(savedZoom)) savedZoom = DEFAULT_ZOOM;
    applyZoom(savedZoom, false);
    applyTheme(read(KEY_THEME, '0') === '1', false);
  }

  window.VigiaZoom = {
    subir: function () { applyZoom(zoom + STEP, true); },
    bajar: function () { applyZoom(zoom - STEP, true); },
    restablecer: function () { applyZoom(DEFAULT_ZOOM, true); },
    actual: function () { return zoom; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
