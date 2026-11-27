(function () {
  'use strict';
  var MIN = 90, MAX = 150, PASO = 10, DEFECTO = 100;
  var K_ZOOM = 'vigia_zoom', K_CONTRASTE = 'vigia_contraste', K_TEMA = 'vigia_tema';
  var zoom = DEFECTO, nivel, menos, mas, contraste, tema, anuncio;

  function leer(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; }
    catch (e) { return d; }
  }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function crearBoton(texto, etiqueta) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'vg-btn'; b.textContent = texto;
    b.setAttribute('aria-label', etiqueta); b.title = etiqueta;
    return b;
  }
  function aplicarZoom(valor, avisar) {
    zoom = Math.max(MIN, Math.min(MAX, valor));
    document.documentElement.style.fontSize = zoom + '%';
    nivel.textContent = zoom + '%';
    menos.disabled = zoom <= MIN; mas.disabled = zoom >= MAX;
    guardar(K_ZOOM, String(zoom));
    if (avisar) anuncio.textContent = 'Tamaño del texto: ' + zoom + ' por ciento.';
    document.dispatchEvent(new CustomEvent('vigia:zoom', { detail: { zoom: zoom } }));
  }
  function aplicarContraste(activo, avisar) {
    document.documentElement.classList.toggle('alto-contraste', activo);
    contraste.textContent = activo ? 'Contraste activado' : 'Alto contraste';
    contraste.setAttribute('aria-pressed', String(activo));
    guardar(K_CONTRASTE, activo ? '1' : '0');
    if (avisar) anuncio.textContent = activo ? 'Alto contraste activado.' : 'Alto contraste desactivado.';
  }
  function aplicarTema(oscuro, avisar) {
    document.documentElement.classList.toggle('tema-oscuro', oscuro);
    tema.textContent = oscuro ? 'Tema claro' : 'Tema oscuro';
    tema.setAttribute('aria-pressed', String(oscuro));
    guardar(K_TEMA, oscuro ? '1' : '0');
    if (avisar) anuncio.textContent = oscuro ? 'Tema oscuro activado.' : 'Tema claro activado.';
  }
  function iniciar() {
    var barra = document.createElement('div');
    barra.className = 'vg-barra';
    barra.setAttribute('role', 'toolbar');
    barra.setAttribute('aria-label', 'Opciones de accesibilidad');
    var titulo = document.createElement('span');
    titulo.className = 'vg-barra__titulo';
    titulo.textContent = 'VIGÍA-IESS | Accesibilidad';
    var grupo = document.createElement('div');
    grupo.className = 'vg-barra__grupo';
    menos = crearBoton('A-', 'Reducir tamaño del texto');
    nivel = document.createElement('span');
    nivel.className = 'vg-barra__nivel';
    nivel.setAttribute('aria-live', 'polite');
    mas = crearBoton('A+', 'Aumentar tamaño del texto');
    var reset = crearBoton('Restablecer', 'Volver al tamaño normal');
    contraste = crearBoton('Alto contraste', 'Activar o desactivar alto contraste');
    tema = crearBoton('Tema oscuro', 'Activar o desactivar tema oscuro');
    anuncio = document.createElement('span');
    anuncio.className = 'vg-sr-only';
    anuncio.setAttribute('role', 'status');
    anuncio.setAttribute('aria-live', 'polite');
    menos.addEventListener('click', function () { aplicarZoom(zoom - PASO, true); });
    mas.addEventListener('click', function () { aplicarZoom(zoom + PASO, true); });
    reset.addEventListener('click', function () { aplicarZoom(DEFECTO, true); });
    contraste.addEventListener('click', function () {
      aplicarContraste(!document.documentElement.classList.contains('alto-contraste'), true);
    });
    tema.addEventListener('click', function () {
      aplicarTema(!document.documentElement.classList.contains('tema-oscuro'), true);
    });
    [menos, nivel, mas, reset, contraste, tema].forEach(function (e) { grupo.appendChild(e); });
    barra.appendChild(titulo); barra.appendChild(grupo); barra.appendChild(anuncio);
    document.body.insertBefore(barra, document.body.firstChild);
    document.body.classList.add('vigia-con-barra');
    var guardado = parseInt(leer(K_ZOOM, DEFECTO), 10);
    aplicarZoom(isNaN(guardado) ? DEFECTO : guardado, false);
    aplicarContraste(leer(K_CONTRASTE, '0') === '1', false);
    aplicarTema(leer(K_TEMA, '0') === '1', false);
  }
  window.VigiaZoom = {
    subir: function () { aplicarZoom(zoom + PASO, true); },
    bajar: function () { aplicarZoom(zoom - PASO, true); },
    actual: function () { return zoom; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();