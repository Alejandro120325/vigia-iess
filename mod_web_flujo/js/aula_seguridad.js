/* Aula de Seguridad Digital v2. Comparte el motor de voz y el asistente Vigía. */
(function () {
  'use strict';
  if (window.__VIGIA_AULA_SEGURIDAD_V2__) return;
  window.__VIGIA_AULA_SEGURIDAD_V2__ = true;

  var ESCENAS = [
    {
      titulo: 'Llega un correo que parece urgente',
      voz: 'Imagina que recibes un correo que dice: Su cuenta será bloqueada hoy mismo. Entre aquí para confirmar sus datos. Ese apuro busca asustarte para que actúes sin pensar. Detente y verifica con calma.',
      foco: 'urgencia',
      badge: 'Señal 1 · Te apuran para que no pienses',
      recordatorio: 'Desconfía de los mensajes que amenazan con bloquear tu cuenta si no actúas inmediatamente.'
    },
    {
      titulo: 'Revisa quién lo envía y dónde te quiere llevar',
      voz: 'Aunque el mensaje use el nombre o el logotipo de una institución conocida, revisa la dirección completa del remitente. En este ejemplo, el dominio iess alerta falsa punto com no pertenece al IESS. El botón también es una trampa para llevarte a una página falsa.',
      foco: 'remitente',
      badge: 'Señal 2 · Remitente y enlace engañosos',
      recordatorio: 'Lee el dominio completo. No pulses el botón ni copies tus claves en páginas que llegaron desde un correo inesperado.'
    },
    {
      titulo: 'Riesgos de entregar tus datos',
      voz: 'Si escribes tu contraseña, número de cédula o códigos de verificación en una página falsa, los estafadores podrían acceder a tus cuentas, suplantar tu identidad o intentar robar tu dinero. Nunca compartas tus claves ni códigos.',
      foco: 'riesgo',
      badge: 'Riesgo · Robo de claves e identidad',
      recordatorio: 'No entregues contraseñas, códigos SMS, tokens ni datos bancarios por un enlace recibido inesperadamente.'
    },
    {
      titulo: 'También pueden suplantar a un familiar por mensaje, voz o video',
      voz: 'Observa este ejemplo de un mensaje que intenta hacerse pasar por un familiar. Inventa una emergencia y pide datos sensibles del IESS. Este video representa una suplantación por mensajería; no es un deepfake de rostro o voz. También existen videos y audios manipulados con inteligencia artificial para imitar a alguien. No envíes dinero ni claves por presión. Llama al número que ya tienes guardado y confirma por otro medio.',
      foco: 'deepfake',
      badge: 'Alerta · Suplantación familiar y deepfakes',
      recordatorio: 'Verifica por otro medio: llama al número guardado de tu familiar o contacta a otra persona de confianza.'
    },
    {
      titulo: 'Verifica y utiliza los canales oficiales',
      voz: 'Para revisar tus trámites, escribe tú mismo www punto iess punto gob punto ec en el navegador. Si recibes un correo sospechoso, el IESS indica que puedes reenviarlo a atencionalusuario arroba iess punto gob punto ec. También puedes consultar los canales institucionales de atención y denuncias. Nunca uses los teléfonos o enlaces que aparecen en el mensaje sospechoso.',
      foco: 'acciones',
      badge: 'Regla de oro · No hagas clic; verifica',
      recordatorio: 'Guarda el mensaje como evidencia y repórtalo por un canal institucional verificado.'
    }
  ];

  var ui = {};
  var indice = 0;
  var recorridoAutomatico = false;
  var pausado = false;
  var vozActiva = false;
  var narracionDeEscena = false;
  var videoPausoVoz = false;
  var bienvenidaActiva = false;

  function obtener(id) { return document.getElementById(id); }
  function voz() { return window.VigiaVoz || null; }
  function vozDisponible() {
    var motor = voz();
    return !!(motor && (typeof motor.disponible !== 'function' || motor.disponible()));
  }
  function detenerVozSilenciosamente() {
    var motor = voz();
    if (motor && typeof motor.detener === 'function') motor.detener();
    vozActiva = false;
    pausado = false;
    narracionDeEscena = false;
    videoPausoVoz = false;
    bienvenidaActiva = false;
  }
  function animarPantera(gesto) {
    try {
      if (window.VigiaAvatar && typeof window.VigiaAvatar.animar === 'function') {
        window.VigiaAvatar.animar(gesto);
      } else {
        document.dispatchEvent(new CustomEvent('vigia:aula-animacion', { detail: { gesto: gesto } }));
      }
    } catch (error) { console.warn('Vigía: no se pudo solicitar el gesto 3D.', error); }
  }
  function gestoEscena(escena) {
    if (escena.foco === 'urgencia') return 'thinking';
    if (escena.foco === 'remitente' || escena.foco === 'riesgo') return 'warning';
    if (escena.foco === 'deepfake') return 'thinking';
    return 'good';
  }
  function cargarPreferenciaSubtitulos() {
    try { return localStorage.getItem('vigia_aula_subtitulos') !== 'off'; }
    catch (_) { return true; }
  }
  function mostrarSubtitulos(texto) {
    if (!ui.subtitulo) return;
    ui.subtitulo.textContent = String(texto || 'Escucha la explicación de Vigía.');
  }
  function actualizarControles() {
    if (!ui.iniciar) return;
    ui.iniciar.textContent = recorridoAutomatico ? 'Recorrido en curso…' : (indice === ESCENAS.length - 1 && !vozActiva ? '↻ Repetir recorrido' : '▶ Iniciar recorrido');
    ui.iniciar.disabled = recorridoAutomatico;
    ui.anterior.disabled = indice <= 0;
    ui.pausar.disabled = !vozActiva;
    ui.pausar.textContent = pausado ? '▶ Reanudar' : 'Ⅱ Pausar';
    ui.repetir.disabled = !vozDisponible();
    ui.siguiente.disabled = indice >= ESCENAS.length - 1;
    ui.detener.disabled = !vozActiva && !recorridoAutomatico;
  }
  function renderizarEscena() {
    var escena = ESCENAS[indice];
    ui.paso.textContent = 'ESCENA ' + (indice + 1) + ' DE ' + ESCENAS.length;
    ui.badge.textContent = escena.badge;
    ui.titulo.textContent = escena.titulo;
    ui.narracion.textContent = escena.voz;
    ui.recordatorio.textContent = escena.recordatorio;
    ui.email.dataset.foco = escena.foco;
    ui.email.hidden = escena.foco === 'deepfake' || escena.foco === 'acciones';
    ui.riesgo.hidden = escena.foco !== 'riesgo';
    ui.deepfake.hidden = escena.foco !== 'deepfake';
    ui.canales.hidden = escena.foco !== 'acciones';
    ui.visualTitle.textContent = escena.foco === 'deepfake' ? 'Ejemplo de suplantación familiar' :
      escena.foco === 'acciones' ? 'Canales institucionales verificados' : 'Correo de ejemplo';
    ui.visualSubtitle.textContent = escena.foco === 'deepfake'
      ? 'Conversación simulada por WhatsApp · No es un deepfake facial o de voz'
      : escena.foco === 'acciones' ? 'Enlaces y contactos de páginas oficiales del IESS' : 'Simulación educativa · No es un mensaje real';

    ui.progreso.forEach(function (barra, i) {
      barra.classList.toggle('is-active', i === indice);
      barra.classList.toggle('is-complete', i < indice);
    });
    ui.estado.textContent = 'Escena ' + (indice + 1) + ' de ' + ESCENAS.length;
    ui.estadoVoz.textContent = vozDisponible()
      ? 'La Pantera narrará esta escena con la voz configurada en Vigía.'
      : 'La voz no está disponible. Puedes leer los subtítulos y avanzar manualmente.';
    mostrarSubtitulos(escena.voz);
    if (ui.video && escena.foco === 'deepfake') {
      try { ui.video.pause(); ui.video.currentTime = 0; } catch (_) {}
    }
    animarPantera(gestoEscena(escena));
    actualizarControles();
  }
  function finalizarNarracionDeEscena() {
    if (!narracionDeEscena) return;
    narracionDeEscena = false;
    vozActiva = false;
    pausado = false;
    if (recorridoAutomatico) {
      if (indice < ESCENAS.length - 1) {
        window.setTimeout(function () {
          if (!recorridoAutomatico || ui.seccion.hidden) return;
          indice += 1;
          renderizarEscena();
          narrarEscena();
        }, 650);
      } else {
        recorridoAutomatico = false;
        ui.estado.textContent = 'Recorrido completado. Recuerda verificar antes de actuar.';
        ui.estadoVoz.textContent = 'Terminaste las cinco escenas. Puedes repetir el recorrido o volver al análisis.';
        mostrarSubtitulos('Recuerda: detente, verifica y utiliza los canales oficiales del IESS.');
        animarPantera('good');
      }
    } else {
      ui.estado.textContent = 'Escena ' + (indice + 1) + ' finalizada.';
      ui.estadoVoz.textContent = 'Puedes repetir esta escena o avanzar a la siguiente.';
      animarPantera('idle');
    }
    actualizarControles();
  }
  function narrarEscena() {
    var escena = ESCENAS[indice];
    var motor = voz();
    if (ui.video && !ui.video.paused && !ui.video.muted) { try { ui.video.pause(); } catch (_) {} }
    if (!vozDisponible()) {
      narracionDeEscena = false;
      recorridoAutomatico = false;
      vozActiva = false;
      pausado = false;
      ui.estado.textContent = 'Narración no disponible; puedes continuar leyendo.';
      ui.estadoVoz.textContent = 'Activa una voz en español en el navegador para escuchar a Vigía.';
      mostrarSubtitulos(escena.voz);
      actualizarControles();
      return false;
    }

    narracionDeEscena = true;
    pausado = false;
    if (window.VigiaAvatar && typeof window.VigiaAvatar.estado === 'function') {
      window.VigiaAvatar.estado('Vigía explica la escena ' + (indice + 1));
    }
    if (typeof motor.hablarConCallback === 'function') {
      vozActiva = true;
      motor.hablarConCallback(escena.voz, finalizarNarracionDeEscena);
    } else if (typeof motor.hablar === 'function') {
      vozActiva = true;
      narracionDeEscena = false;
      motor.hablar(escena.voz);
      ui.estadoVoz.textContent = 'Esta versión del lector no permite avanzar automáticamente. Usa los controles para continuar.';
    } else {
      narracionDeEscena = false;
      vozActiva = false;
      ui.estado.textContent = 'No se encontró el lector de voz de Vigía.';
      actualizarControles();
      return false;
    }
    ui.estado.textContent = 'Vigía está narrando la escena ' + (indice + 1) + '…';
    ui.estadoVoz.textContent = 'Narración en curso. Puedes pausar, repetir o avanzar.';
    actualizarControles();
    return true;
  }
  function iniciarRecorrido() {
    detenerVozSilenciosamente();
    indice = 0;
    recorridoAutomatico = true;
    renderizarEscena();
    narrarEscena();
  }
  function repetirEscena() {
    detenerVozSilenciosamente();
    narrarEscena();
  }
  function avanzarEscena() {
    if (indice >= ESCENAS.length - 1) return;
    detenerVozSilenciosamente();
    indice += 1;
    renderizarEscena();
    narrarEscena();
  }
  function retrocederEscena() {
    if (indice <= 0) return;
    detenerVozSilenciosamente();
    indice -= 1;
    renderizarEscena();
    narrarEscena();
  }
  function pausarContinuar() {
    var motor = voz();
    if (!motor) return;
    if (!pausado) {
      if (typeof motor.pausar === 'function') motor.pausar();
      pausado = true;
      ui.estado.textContent = 'Narración en pausa.';
      ui.estadoVoz.textContent = 'Pulsa Reanudar cuando quieras continuar.';
    } else {
      if (typeof motor.reanudar === 'function') motor.reanudar();
      pausado = false;
      ui.estado.textContent = 'Vigía continúa narrando…';
      ui.estadoVoz.textContent = 'La explicación continúa.';
    }
    actualizarControles();
  }
  function detenerRecorrido() {
    recorridoAutomatico = false;
    detenerVozSilenciosamente();
    ui.estado.textContent = 'Recorrido detenido. Puedes volver a iniciarlo cuando quieras.';
    ui.estadoVoz.textContent = 'La simulación está detenida.';
    animarPantera('idle');
    actualizarControles();
  }
  function abrirAula() {
    var layout = document.querySelector('.layout-principal');
    var nav = document.querySelector('.step-nav');
    if (layout) layout.hidden = true;
    if (nav) nav.hidden = true;
    var activeStep = document.querySelector('.step-link[aria-current="step"]');
    ui.pasoAnterior = activeStep ? Number(activeStep.getAttribute('data-ir-paso')) || 1 : 1;
    ui.seccion.hidden = false;
    indice = 0;
    recorridoAutomatico = false;
    vozActiva = false;
    pausado = false;
    narracionDeEscena = false;
    bienvenidaActiva = true;
    renderizarEscena();
    ui.seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var bienvenida = 'Bienvenido al Aula de Seguridad Digital. Soy Vigía. Vamos a recorrer cinco escenas para aprender a reconocer correos falsos, proteger tus claves y detectar intentos de suplantación. Puedes escuchar, pausar, repetir o avanzar a tu ritmo.';
    if (window.VigiaAvatar && typeof window.VigiaAvatar.estado === 'function') window.VigiaAvatar.estado('Vigía te da la bienvenida al aula');
    if (window.VigiaAvatar && typeof window.VigiaAvatar.animar === 'function') window.VigiaAvatar.animar('welcome');
    if (window.VigiaAvatar && typeof window.VigiaAvatar.decir === 'function') window.VigiaAvatar.decir(bienvenida);
    else if (voz() && typeof voz().hablar === 'function') voz().hablar(bienvenida);
    ui.estado.textContent = 'Bienvenido. La simulación está lista.';
    ui.estadoVoz.textContent = 'Puedes iniciar el recorrido cuando estés listo.';
    mostrarSubtitulos(bienvenida);
  }
  function salirAula() {
    detenerRecorrido();
    videoPausoVoz = false;
    if (ui.video) { try { ui.video.pause(); ui.video.currentTime = 0; } catch (_) {} }
    ui.seccion.hidden = true;
    var layout = document.querySelector('.layout-principal');
    var nav = document.querySelector('.step-nav');
    if (layout) layout.hidden = false;
    if (nav) nav.hidden = false;
    if (typeof window.mostrarVentana === 'function') window.mostrarVentana(ui.pasoAnterior || 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function alternarProyector() {
    var active = ui.seccion.classList.toggle('aula--proyector');
    ui.proyector.setAttribute('aria-pressed', String(active));
    ui.proyector.textContent = active ? 'Vista normal' : 'Vista proyector';
  }
  function alternarSubtitulos() {
    var active = ui.subtitulos.getAttribute('aria-pressed') !== 'true';
    ui.subtitulos.setAttribute('aria-pressed', String(active));
    ui.subtitulos.textContent = active ? 'CC · Subtítulos activados' : 'CC · Subtítulos desactivados';
    ui.subtitleDock.classList.toggle('is-captions-off', !active);
    try { localStorage.setItem('vigia_aula_subtitulos', active ? 'on' : 'off'); } catch (_) {}
  }
  function alternarSonidoVideo() {
    if (!ui.video) return;
    ui.video.muted = !ui.video.muted;
    ui.videoSound.setAttribute('aria-pressed', String(!ui.video.muted));
    ui.videoSound.textContent = ui.video.muted ? 'Activar sonido' : 'Silenciar video';
    var motor = voz();
    // Si el usuario activa el audio mientras el video ya se reproduce, pausa
    // la narración. Si vuelve a silenciarlo, la narración se reanuda enseguida.
    if (!ui.video.muted && !ui.video.paused && motor && motor.estaHablando && motor.estaHablando() &&
        motor.estaPausado && !motor.estaPausado()) {
      motor.pausar(); videoPausoVoz = true; pausado = true;
      ui.estadoVoz.textContent = 'Narración pausada para escuchar el video.';
      actualizarControles();
    } else if (ui.video.muted && videoPausoVoz && motor && typeof motor.reanudar === 'function') {
      motor.reanudar(); videoPausoVoz = false; pausado = false;
      ui.estadoVoz.textContent = 'Narración reanudada.';
      actualizarControles();
    }
  }
  function actualizarSubtituloPorVoz(event) {
    if (ui.seccion.hidden || (!narracionDeEscena && !bienvenidaActiva)) return;
    var detail = event.detail || {};
    if (detail.texto) mostrarSubtitulos(detail.texto);
  }
  function init() {
    ui.seccion = obtener('aulaSeguridad');
    if (!ui.seccion) return;
    ui.entrada = obtener('btnAbrirAulaSeguridad');
    ui.salir = obtener('btnSalirAula');
    ui.paso = obtener('aulaPaso');
    ui.badge = obtener('aulaBadge');
    ui.titulo = obtener('aulaEscenaTitulo');
    ui.narracion = obtener('aulaNarracion');
    ui.recordatorio = obtener('aulaRecordatorio');
    ui.email = obtener('aulaEmail');
    ui.riesgo = obtener('aulaRiesgo');
    ui.deepfake = obtener('aulaDeepfake');
    ui.canales = obtener('aulaCanales');
    ui.visualTitle = obtener('aulaVisualTitle');
    ui.visualSubtitle = obtener('aulaVisualSubtitle');
    ui.estado = obtener('aulaEstado');
    ui.estadoVoz = obtener('aulaEstadoVoz');
    ui.progreso = Array.prototype.slice.call(ui.seccion.querySelectorAll('[data-aula-progreso]'));
    ui.iniciar = obtener('btnAulaIniciar');
    ui.anterior = obtener('btnAulaAnterior');
    ui.pausar = obtener('btnAulaPausar');
    ui.repetir = obtener('btnAulaRepetir');
    ui.siguiente = obtener('btnAulaSiguiente');
    ui.detener = obtener('btnAulaDetener');
    ui.proyector = obtener('btnAulaProyector');
    ui.subtitulos = obtener('btnAulaSubtitulos');
    ui.subtitleDock = ui.seccion.querySelector('.aula-subtitle-dock');
    ui.subtitulo = obtener('aulaSubtitulosTexto');
    ui.video = obtener('aulaVideoEjemplo');
    ui.videoSound = obtener('btnAulaVideoSonido');

    if (ui.entrada) ui.entrada.addEventListener('click', abrirAula);
    if (ui.salir) ui.salir.addEventListener('click', salirAula);
    ui.iniciar.addEventListener('click', iniciarRecorrido);
    ui.anterior.addEventListener('click', retrocederEscena);
    ui.pausar.addEventListener('click', pausarContinuar);
    ui.repetir.addEventListener('click', repetirEscena);
    ui.siguiente.addEventListener('click', avanzarEscena);
    ui.detener.addEventListener('click', detenerRecorrido);
    ui.proyector.addEventListener('click', alternarProyector);
    ui.subtitulos.addEventListener('click', alternarSubtitulos);
    ui.videoSound.addEventListener('click', alternarSonidoVideo);

    var captionsOn = cargarPreferenciaSubtitulos();
    ui.subtitulos.setAttribute('aria-pressed', String(captionsOn));
    ui.subtitulos.textContent = captionsOn ? 'CC · Subtítulos activados' : 'CC · Subtítulos desactivados';
    ui.subtitleDock.classList.toggle('is-captions-off', !captionsOn);
    if (ui.video) {
      ui.video.muted = true;
      function reanudarVozTrasVideo() {
        if (videoPausoVoz && voz() && typeof voz().reanudar === 'function') {
          voz().reanudar(); videoPausoVoz = false; pausado = false;
          ui.estadoVoz.textContent = 'Narración reanudada.'; actualizarControles();
        }
      }
      ui.video.addEventListener('play', function () {
        ui.estadoVoz.textContent = ui.video.muted ? 'Video reproduciéndose sin audio para evitar voces superpuestas.' : 'Video reproduciéndose con sonido.';
        if (!ui.video.muted && voz() && typeof voz().estaHablando === 'function' && voz().estaHablando() && !voz().estaPausado()) {
          voz().pausar(); videoPausoVoz = true; pausado = true; actualizarControles();
        }
      });
      ui.video.addEventListener('pause', reanudarVozTrasVideo);
      ui.video.addEventListener('ended', reanudarVozTrasVideo);
    }

    document.addEventListener('vigia:voz-inicio', function () {
      if (ui.seccion.hidden || (!narracionDeEscena && !bienvenidaActiva)) return;
      vozActiva = true;
      ui.estadoVoz.textContent = 'Vigía está hablando…';
      actualizarControles();
    });
    document.addEventListener('vigia:voz-fragmento', actualizarSubtituloPorVoz);
    document.addEventListener('vigia:voz-fin', function () {
      if (ui.seccion.hidden) return;
      if (bienvenidaActiva) {
        bienvenidaActiva = false;
        vozActiva = false;
        pausado = false;
        ui.estadoVoz.textContent = 'Bienvenida terminada. Puedes iniciar el recorrido cuando quieras.';
        animarPantera('idle');
        actualizarControles();
        return;
      }
      if (!videoPausoVoz) vozActiva = false;
      actualizarControles();
    });
    document.addEventListener('vigia:voz-no-disponible', function () {
      if (ui.seccion.hidden) return;
      ui.estado.textContent = 'No hay una voz disponible en español.';
      ui.estadoVoz.textContent = 'Puedes leer los subtítulos y avanzar manualmente.';
      mostrarSubtitulos(ESCENAS[indice].voz);
    });

    renderizarEscena();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
