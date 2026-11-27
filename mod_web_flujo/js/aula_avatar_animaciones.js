/* Control de clips de la Pantera. Si aún no existe el GLB combinado, mantiene el clip original. */
(function () {
  'use strict';
  if (window.__VIGIA_ANIMACIONES_PANTERA__) return;
  window.__VIGIA_ANIMACIONES_PANTERA__ = true;

  var MAPA = {
    idle: 'Vigia_IdleOriginal',
    welcome: 'Vigia_Waving',
    talking: 'Vigia_Talking',
    warning: 'Vigia_HeadShake',
    thinking: 'Vigia_HeadShake',
    good: 'Vigia_ThumbsUp',
    charge: 'Vigia_Charge',
    idleBriefcase: 'Vigia_IdleBriefcase'
  };
  var viewer = null;
  var observer = null;
  var vozActiva = false;
  var gestoActual = 'idle';
  var clipActual = '';
  var clipPendiente = null;
  var gestoUnico = false;
  var avisoSinClips = false;

  function normalizar(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function buscarViewer() {
    var host = document.getElementById('avatar-asistente');
    return host ? host.querySelector('model-viewer') : document.querySelector('model-viewer');
  }
  function resolverClip(key) {
    if (!viewer) return null;
    var available = Array.isArray(viewer.availableAnimations) ? viewer.availableAnimations : [];
    if (!available.length) return null;
    var wanted = MAPA[key] || MAPA.idle;
    var exact = available.find(function (name) { return name === wanted; });
    if (exact) return exact;
    var target = normalizar(wanted);
    var partial = available.find(function (name) { return normalizar(name) === target || normalizar(name).indexOf(target) >= 0; });
    if (partial) return partial;
    if (key !== 'idle') return available.find(function (name) { return name === MAPA.idle; }) || available[0];
    return available.find(function (name) { return name === MAPA.idle; }) || available[0];
  }
  function aplicar(key, restart) {
    viewer = buscarViewer();
    if (!viewer) { clipPendiente = key; return false; }
    var clip = resolverClip(key);
    if (!clip) { clipPendiente = key; return false; }
    var found = Array.isArray(viewer.availableAnimations) ? viewer.availableAnimations : [];
    if (key !== 'idle' && clip === (found.find(function (name) { return name === MAPA.idle; }) || found[0]) && !avisoSinClips) {
      avisoSinClips = true;
      console.info('Vigía: aún no se ha activado el GLB combinado; se mantiene la animación original.');
    }
    if (!restart && clipActual === clip && viewer.animationName === clip) return true;

    gestoActual = key;
    clipActual = clip;
    gestoUnico = key !== 'idle' && key !== 'talking';
    viewer.setAttribute('animation-crossfade-duration', '320');
    viewer.animationName = clip;
    try { viewer.currentTime = 0; } catch (_) {}
    // model-viewer controls clip repetition through play({repetitions}),
    // not through a generic HTML loop attribute.
    if (typeof viewer.play === 'function') {
      var repeat = (key === 'idle' || key === 'talking') ? Infinity : 1;
      viewer.play({ repetitions: repeat });
    }
    return true;
  }
  function animar(key) {
    var safe = Object.prototype.hasOwnProperty.call(MAPA, key) ? key : 'idle';
    clipPendiente = safe;
    return aplicar(safe, true);
  }
  function alTerminarAnimacion() {
    if (!gestoUnico) return;
    gestoUnico = false;
    aplicar(vozActiva ? 'talking' : 'idle', true);
  }
  function vincularViewer() {
    var current = buscarViewer();
    if (!current || current === viewer) return;
    viewer = current;
    viewer.addEventListener('load', function () {
      if (clipPendiente) aplicar(clipPendiente, true);
      else aplicar('idle', true);
    });
    viewer.addEventListener('finished', alTerminarAnimacion);
    viewer.addEventListener('animation-finished', alTerminarAnimacion);
    if (viewer.loaded) aplicar(clipPendiente || 'idle', true);
  }
  function elegirGestoPorTexto(texto) {
    var t = String(texto || '').toLowerCase();
    if (/bienvenid|hola,? soy vig[ií]a|vamos a recorrer/.test(t)) return 'welcome';
    if (/no abras|no pulses|no compartas|nunca|contrase|clave|riesgo|robo|estaf|fraude|peligro|sospech/.test(t)) return 'warning';
    if (/deepfake|voz|rostro|video|suplantaci[oó]n|imit/.test(t)) return 'thinking';
    if (/recuerda|verifica|canales oficiales|recomend|protegerte|con calma/.test(t)) return 'good';
    return 'talking';
  }

  window.addEventListener('vigia:aula-animacion', function (event) {
    var gesture = event.detail && event.detail.gesto;
    if (Object.prototype.hasOwnProperty.call(MAPA, gesture)) animar(gesture);
  });
  document.addEventListener('vigia:voz-inicio', function () {
    vozActiva = true;
    if (!gestoUnico) animar('talking');
  });
  document.addEventListener('vigia:voz-fragmento', function (event) {
    var text = event.detail && event.detail.texto;
    if (text) animar(elegirGestoPorTexto(text));
  });
  document.addEventListener('vigia:voz-fin', function () {
    vozActiva = false;
    animar('idle');
  });
  document.addEventListener('vigia:analisis-paso', function () { if (!vozActiva) animar('thinking'); });
  document.addEventListener('vigia:correo-leido', function () { if (!vozActiva) animar('idle'); });

  if (window.VigiaAvatar) window.VigiaAvatar.animar = animar;
  else window.addEventListener('load', function () { if (window.VigiaAvatar) window.VigiaAvatar.animar = animar; }, { once: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      vincularViewer();
      var host = document.getElementById('avatar-asistente');
      if (host && window.MutationObserver) {
        observer = new MutationObserver(vincularViewer);
        observer.observe(host, { childList: true, subtree: true });
      }
    }, { once: true });
  } else {
    vincularViewer();
    var hostNow = document.getElementById('avatar-asistente');
    if (hostNow && window.MutationObserver) {
      observer = new MutationObserver(vincularViewer);
      observer.observe(hostNow, { childList: true, subtree: true });
    }
  }
})();
