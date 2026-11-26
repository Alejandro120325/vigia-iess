(function () {
  'use strict';

  var MIN = 90, MAX = 150, PASO = 10, DEFECTO = 100;
  var CLAVE_ZOOM = 'vigia_zoom', CLAVE_CONTRASTE = 'vigia_contraste', CLAVE_TEMA = 'vigia_tema';
  var zoom = DEFECTO, barra, nivelEl, btnMenos, btnMas, btnContraste, btnTema, anuncio;

  function leer(clave, def) {
    try { var v = localStorage.getItem(clave); return v === null ? def : v; }
    catch (e) { return def; }
  }
  function guardar(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (e) { /* se ignora */ }
  }

  function aplicarZoom(nuevo, anunciar) {
    zoom = Math.min(MAX, Math.max(MIN, nuevo));
    document.documentElement.style.fontSize = zoom + '%';
    nivelEl.textContent = zoom + '%';
    btnMenos.disabled = zoom <= MIN;
    btnMas.disabled = zoom >= MAX;
    guardar(CLAVE_ZOOM, zoom);
    if (anunciar) anuncio.textContent = 'Tamaño del texto al ' + zoom + ' por ciento';
    document.dispatchEvent(new CustomEvent('vigia:zoom', { detail: { zoom: zoom } }));
  }

  function aplicarContraste(activo, anunciar) {
    document.documentElement.classList.toggle('alto-contraste', activo);
    btnContraste.setAttribute('aria-pressed', String(activo));
    guardar(CLAVE_CONTRASTE, activo ? '1' : '0');
    if (anunciar) anuncio.textContent = activo ? 'Alto contraste activado' : 'Alto contraste desactivado';
  }

  function aplicarTema(oscuro, anunciar) {\n    document.documentElement.classList.toggle('tema-oscuro', oscuro);\n    btnTema.textContent = oscuro ? '☀ Tema claro' : '☾ Tema oscuro';\n    btnTema.setAttribute('aria-pressed', String(oscuro));\n    guardar(CLAVE_TEMA, oscuro ? '1' : '0');\n    if (anunciar) anuncio.textContent = oscuro ? 'Tema oscuro activado' : 'Tema claro activado';\n  }\n\n  function boton(texto, etiqueta) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vg-btn';
    b.textContent = texto;
    b.setAttribute('aria-label', etiqueta);
    b.title = etiqueta;
    return b;
  }

  function construir() {
    barra = document.createElement('div');
    barra.className = 'vg-barra';
    barra.setAttribute('role', 'toolbar');
    barra.setAttribute('aria-label', 'Opciones de accesibilidad');

    var titulo = document.createElement('span');
    titulo.className = 'vg-barra__titulo';
    titulo.textContent = 'VIGÍA-IESS · Accesibilidad';

    var grupo = document.createElement('div');
    grupo.className = 'vg-barra__grupo';

    btnMenos = boton('-', 'Hacer el texto más pequeño');
    nivelEl = document.createElement('span');
    nivelEl.className = 'vg-barra__nivel';
    nivelEl.setAttribute('aria-hidden', 'true');
    btnMas = boton('+', 'Hacer el texto más grande');
    var btnReset = boton('100%', 'Volver al tamaño normal');
    btnContraste = boton('◐ Contraste', 'Activar o desactivar alto contraste');
    btnContraste.setAttribute('aria-pressed', 'false');\n    btnTema = boton('☾ Tema oscuro', 'Activar o desactivar el tema oscuro');\n    btnTema.addEventListener('click', function () { aplicarTema(!document.documentElement.classList.contains('tema-oscuro'), true); });

    btnMenos.addEventListener('click', function () { aplicarZoom(zoom - PASO, true); });
    btnMas.addEventListener('click', function () { aplicarZoom(zoom + PASO, true); });
    btnReset.addEventListener('click', function () { aplicarZoom(DEFECTO, true); });
    btnContraste.addEventListener('click', function () {
      aplicarContraste(!document.documentElement.classList.contains('alto-contraste'), true);
    });

    anuncio = document.createElement('div');
    anuncio.setAttribute('role', 'status');
    anuncio.setAttribute('aria-live', 'polite');
    anuncio.style.cssText = 'position:absolute;left:-9999px;';

    [btnMenos, nivelEl, btnMas, btnReset, btnTema, btnContraste].forEach(function (el) { grupo.appendChild(el); });
    barra.appendChild(titulo);
    barra.appendChild(grupo);
    barra.appendChild(anuncio);
    document.body.insertBefore(barra, document.body.firstChild);
    document.body.classList.add('vigia-con-barra');
  }

  function iniciar() {
    construir();
    var guardado = parseInt(leer(CLAVE_ZOOM, DEFECTO), 10);
    aplicarZoom(isNaN(guardado) ? DEFECTO : guardado, false);
    aplicarContraste(leer(CLAVE_CONTRASTE, '0') === '1', false);\n    aplicarTema(leer(CLAVE_TEMA, '0') === '1', false);
  }

  window.VigiaZoom = {
    subir: function () { aplicarZoom(zoom + PASO, true); },
    bajar: function () { aplicarZoom(zoom - PASO, true); },
    actual: function () { return zoom; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();