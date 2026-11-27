(function () {
  'use strict';
  var IDIOMA = 'es-EC', VELOCIDAD = 0.92, TONO = 1;
  var RESPALDO = ['es-EC', 'es-MX', 'es-US', 'es-CO', 'es-ES'];
  var SEL_PANTALLA = '#contenido-principal, main';
  var SEL_CORREO = '[data-correo], #correo-leido';

  var soportado = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  var cola = [], indice = 0, token = 0, hablando = false, pausado = false, actual = null;
  var panel, btnPantalla, btnCorreo, btnPausa, btnStop, estadoEl;

  /* ---------- Voz: es-EC, y si no existe, la más parecida ---------- */
  function elegirVoz() {
    var voces = window.speechSynthesis.getVoices() || [];
    var norm = function (v) { return (v.lang || '').replace('_', '-').toLowerCase(); };
    for (var i = 0; i < RESPALDO.length; i++) {
      for (var j = 0; j < voces.length; j++) {
        if (norm(voces[j]) === RESPALDO[i].toLowerCase()) return voces[j];
      }
    }
    for (var k = 0; k < voces.length; k++) {
      if (norm(voces[k]).indexOf('es') === 0) return voces[k];
    }
    return null; // el navegador usará su voz por defecto con lang es-EC
  }

  /* ---------- Partir en frases (Chrome corta textos largos) ---------- */
  function partir(texto) {
    var limpio = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!limpio) return [];
    var frases = limpio.match(/[^.!?;:]+[.!?;:]*/g) || [limpio];
    var trozos = [], acum = '';
    frases.forEach(function (f) {
      if ((acum + f).length > 180 && acum) { trozos.push(acum.trim()); acum = ''; }
      acum += f + ' ';
    });
    if (acum.trim()) trozos.push(acum.trim());
    return trozos;
  }

  function emitir(nombre, detalle) {
    document.dispatchEvent(new CustomEvent(nombre, { detail: detalle || {} }));
  }

  function actualizarBotones() {
    if (!panel) return;
    btnPausa.disabled = !hablando;
    btnStop.disabled = !hablando;
    btnPausa.textContent = pausado ? '▶ Continuar' : '⏸ Pausar';
    btnPausa.setAttribute('aria-label', pausado ? 'Continuar la lectura' : 'Pausar la lectura');
    estadoEl.textContent = !hablando ? '' : (pausado ? 'En pausa' : 'Leyendo…');
  }

  function siguiente(t) {
    if (t !== token) return;                       // lectura cancelada
    if (indice >= cola.length) { terminar(t); return; }
    var u = new SpeechSynthesisUtterance(cola[indice]);
    u.lang = IDIOMA; u.rate = VELOCIDAD; u.pitch = TONO;
    var voz = elegirVoz(); if (voz) u.voice = voz;
    u.onstart = function () { emitir('vigia:voz-fragmento', { texto: cola[indice] }); };
    u.onend = function () { indice++; siguiente(t); };
    u.onerror = function (e) {
      if (e && (e.error === 'canceled' || e.error === 'interrupted')) return;
      terminar(t);
    };
    actual = u;                                    // evita que el navegador lo recoja antes de hablar
    window.speechSynthesis.speak(u);
  }

  function terminar(t) {
    if (t !== token) return;
    hablando = false; pausado = false; cola = []; actual = null;
    actualizarBotones();
    emitir('vigia:voz-fin');
  }

  function hablar(texto) {
    if (!soportado) { avisarNoSoportado(); emitir('vigia:voz-fin'); return; }
    detener(true);
    cola = partir(texto);
    if (!cola.length) { emitir('vigia:voz-fin'); return; }
    token++; indice = 0; hablando = true; pausado = false;
    actualizarBotones();
    emitir('vigia:voz-inicio');
    siguiente(token);
  }

  function pausar() {
    if (!hablando || pausado) return;
    window.speechSynthesis.pause(); pausado = true; actualizarBotones();
  }
  function reanudar() {
    if (!hablando || !pausado) return;
    window.speechSynthesis.resume(); pausado = false; actualizarBotones();
  }
  function detener(silencioso) {
    var estaba = hablando;
    token++;                                       // invalida callbacks pendientes
    if (soportado) window.speechSynthesis.cancel();
    hablando = false; pausado = false; cola = []; actual = null;
    actualizarBotones();
    if (estaba && !silencioso) emitir('vigia:voz-fin');
  }

  /* ---------- Qué se lee ---------- */
  function textoDe(selector) {
    var el = document.querySelector(selector);
    if (!el) return '';
    var copia = el.cloneNode(true);
    copia.querySelectorAll('script,style,[aria-hidden="true"],.vg-barra,.vg-voz,[hidden]')
      .forEach(function (n) { n.remove(); });
    return copia.textContent.replace(/\s+/g, ' ').trim();
  }

  function escucharPantalla() {
    var t = textoDe(SEL_PANTALLA);
    hablar(t || 'No encontré texto para leer en esta pantalla.');
  }
  function leerCorreo() {
    var t = textoDe(SEL_CORREO);
    hablar(t || 'Todavía no hay un correo cargado. Primero suba un correo en el paso uno.');
  }

  /* ---------- Panel de botones (parte inferior, siempre visible) ---------- */
  function boton(texto, etiqueta, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'vg-btn vg-btn--voz';
    b.textContent = texto; b.setAttribute('aria-label', etiqueta); b.title = etiqueta;
    b.addEventListener('click', fn);
    return b;
  }

  function avisarNoSoportado() {
    if (estadoEl) estadoEl.textContent = 'Este navegador no puede leer en voz alta. Use Chrome o Edge.';
  }

  function construir() {
    panel = document.createElement('div');
    panel.className = 'vg-voz';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Lector de voz');

    btnPantalla = boton('🔊 Escuchar pantalla', 'Escuchar el contenido de la pantalla', escucharPantalla);
    btnCorreo = boton('✉ Leer correo', 'Leer en voz alta el correo cargado', leerCorreo);
    btnPausa = boton('⏸ Pausar', 'Pausar la lectura', function () { pausado ? reanudar() : pausar(); });
    btnStop = boton('⏹ Detener', 'Detener la lectura', function () { detener(false); });
    estadoEl = document.createElement('span');
    estadoEl.className = 'vg-voz__estado';
    estadoEl.setAttribute('role', 'status');
    estadoEl.setAttribute('aria-live', 'polite');

    [btnPantalla, btnCorreo, btnPausa, btnStop, estadoEl].forEach(function (e) { panel.appendChild(e); });
    document.body.appendChild(panel);
    document.body.classList.add('vigia-con-voz');
    actualizarBotones();
    if (!soportado) avisarNoSoportado();
  }

  function iniciar() {
    construir();
    // Las voces cargan de forma asíncrona en algunos navegadores
    if (soportado && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = function () { elegirVoz(); };
    }
    // Tecla Escape = detener (útil si algo suena sin querer)
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && hablando) detener(false); });
    // Al cerrar o recargar la página, que no siga hablando
    window.addEventListener('beforeunload', function () { if (soportado) window.speechSynthesis.cancel(); });
  }

  window.VigiaVoz = {
    hablar: hablar, pausar: pausar, reanudar: reanudar, detener: function () { detener(false); },
    estaHablando: function () { return hablando; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();