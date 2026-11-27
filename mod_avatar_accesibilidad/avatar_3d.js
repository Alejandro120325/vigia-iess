(function () {
  'use strict';
  var estado = 'reposo';
  var cargado = false;
  var mixer = null;
  var accion = null;
  var modelo = null;
  var reloj = null;
  var lienzo = null;
  var renderer = null;
  var escena = null;
  var camara = null;
  var frame = null;
  var movimientoReducido = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function emitir(nombre, detalle) {
    document.dispatchEvent(new CustomEvent(nombre, { detail: detalle || {} }));
  }

  function detenerFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function animar() {
    if (!renderer || !escena || !camara || !reloj) return;
    frame = requestAnimationFrame(animar);
    var delta = Math.min(reloj.getDelta(), 0.05);
    if (mixer && !movimientoReducido) mixer.update(delta);
    renderer.render(escena, camara);
  }

  function mostrarEstado(texto) {
    estado = texto || 'reposo';
    if (!mixer || !accion) {
      emitir('vigia:avatar-estado', { estado: estado });\n    var textoEstado = document.getElementById('vg-avatar-estado');\n    if (textoEstado) textoEstado.textContent = estado === 'hablando' ? 'Vigía está hablando.' : estado === 'alerta' ? 'Vigía detectó señales sospechosas.' : estado === 'acierto' ? 'No se encontraron indicios determinísticos.' : estado === 'analizando' ? 'Vigía está revisando el correo.' : 'Vigía está listo.'
      return;
    }
    if (estado === 'alerta' || estado === 'error') {
      accion.setEffectiveTimeScale(1);
      accion.reset().play();
    } else if (estado === 'hablando' || estado === 'analizando') {
      accion.setEffectiveTimeScale(estado === 'hablando' ? 1 : 0.65);
      accion.reset().play();
    } else if (estado === 'acierto') {
      accion.setEffectiveTimeScale(0.8);
      accion.reset().play();
    } else {
      accion.setEffectiveTimeScale(0.35);
      accion.reset().play();
    }
    emitir('vigia:avatar-estado', { estado: estado });
  }

  function iniciar() {
    var host = document.getElementById('vg-avatar-3d');
    if (host) host.parentElement.style.display = 'block';
    if (!host) return;
    if (!window.THREE || !THREE.GLTFLoader) {
      host.textContent = 'Modelo 3D no disponible en esta sesión. El asistente conserva voz y subtítulos.';
      emitir('vigia:avatar-error', { mensaje: 'Three.js GLTFLoader no está disponible.' });
      return;
    }

    lienzo = document.createElement('canvas');
    lienzo.setAttribute('aria-label', 'Modelo 3D del asistente Vigía');
    host.textContent = '';
    host.appendChild(lienzo);

    renderer = new THREE.WebGLRenderer({ canvas: lienzo, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 320, host.clientHeight || 300, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    escena = new THREE.Scene();
    camara = new THREE.PerspectiveCamera(32, (host.clientWidth || 320) / (host.clientHeight || 300), 0.1, 1000);
    camara.position.set(0, 1.35, 4.2);
    escena.add(new THREE.HemisphereLight(0xffffff, 0x52657a, 2));
    var luz = new THREE.DirectionalLight(0xffffff, 2.4);
    luz.position.set(2, 4, 3);
    escena.add(luz);

    reloj = new THREE.Clock();
    var loader = new THREE.GLTFLoader();
    loader.load('/accesibilidad/models/panteraups.glb', function (gltf) {
      modelo = gltf.scene;
      var caja = new THREE.Box3().setFromObject(modelo);\n      var tamano = caja.getSize(new THREE.Vector3());\n      var centro = caja.getCenter(new THREE.Vector3());\n      var escala = 2.25 / Math.max(tamano.x, tamano.y, tamano.z, 0.001);\n      modelo.scale.setScalar(escala);\n      modelo.position.sub(centro.multiplyScalar(escala));
      modelo.position.set(0, -1.0, 0);
      escena.add(modelo);
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(modelo);
        // El GLB recibido trae un clip Mixamo llamado "mixamo.com".
        accion = mixer.clipAction(gltf.animations[0]);
        accion.setLoop(THREE.LoopRepeat);
        accion.play();
      }
      cargado = true;\n      var etiqueta = document.getElementById('vg-avatar-estado');\n      if (etiqueta) etiqueta.textContent = 'Modelo 3D cargado. Animación disponible: ' + ((gltf.animations && gltf.animations[0] && gltf.animations[0].name) || 'sin nombre');
      mostrarEstado(estado);
      emitir('vigia:avatar-listo', { animaciones: (gltf.animations || []).map(function (a) { return a.name; }) });
    }, undefined, function (error) {
      host.textContent = 'No se pudo cargar el archivo 3D. Vigía continuará con voz y subtítulos.';
      emitir('vigia:avatar-error', { mensaje: 'Error al cargar panteraups.glb.' });
      console.error('Error al cargar avatar 3D:', error);
    });

    animar();
    window.addEventListener('resize', function () {
      if (!renderer || !camara) return;
      var w = host.clientWidth || 320;
      var h = host.clientHeight || 300;
      renderer.setSize(w, h, false);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
    });
  }

  window.VigiaAvatar3D = {
    estado: mostrarEstado,
    disponible: function () { return cargado; },
    destruir: function () { detenerFrame(); if (renderer) renderer.dispose(); }
  };

  document.addEventListener('vigia:voz-inicio', function () { mostrarEstado('hablando'); });
  document.addEventListener('vigia:voz-fin', function () {
    mostrarEstado(document.documentElement.dataset.vigiaResultado || 'reposo');
  });
  document.addEventListener('vigia:resultado', function (e) {
    var r = e.detail || {};
    document.documentElement.dataset.vigiaResultado = r.es_phishing ? 'alerta' : 'acierto';
    mostrarEstado(r.es_phishing ? 'alerta' : 'acierto');
  });
  document.addEventListener('vigia:analisis-paso', function (e) {
    mostrarEstado((e.detail && e.detail.estado) || 'analizando');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();