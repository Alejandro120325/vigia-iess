/* Vigía: mascota 3D persistente y asistente contextual para todas las ventanas. */
(function () {
  'use strict';

  var MODEL_URL = '/accesibilidad/models/panteraups.glb?v=20261127-pantera-zoom14-fov30';
  var MODEL_VIEWER_URL = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js';
  var CAMERA_ORBIT = '0deg 75deg 14%';
  var CAMERA_FIELD_OF_VIEW = '30deg';
  var viewerPromise = null;
  var host, widget, stage, stageStatus, captions, captionsToggle, voiceState;
  var pauseButton, findings, questionInput, questionAnswer, mouth;
  var viewer = null;
  var modelFramed = false;
  var resizeObserver = null;
  var illustration = null;
  var launcherLabel = null;
  var dragState = null;
  var suppressStageClick = false;
  var profilePicker = null;
  var profileIcon = null;
  var profileDialog = null;
  var currentScreen = 1;
  var currentMood = 'idle';
  var lastResult = null;
  var lastVoiceText = '';
  var captionsVisible = true;
  var expanded = false;
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Respaldo vectorial propio que solo se muestra si el visor 3D no puede cargar el GLB.
  var FALLBACK_SVG = `
  <svg class="vg-assistant__illustration-svg" viewBox="0 0 180 180" role="img" aria-label="Vigía, mascota ilustrada">
    <ellipse cx="90" cy="163" rx="42" ry="7" fill="rgba(10,35,55,.14)"/>
    <path d="M45 66 35 30l36 17M135 66l10-36-36 17" fill="#173c5e" stroke="#d8ac42" stroke-width="5" stroke-linejoin="round"/>
    <rect x="42" y="47" width="96" height="103" rx="39" fill="#173c5e" stroke="#d8ac42" stroke-width="5"/>
    <path d="M57 112q33 25 66 0v19q-33 25-66 0z" fill="#0a7550"/>
    <ellipse cx="69" cy="88" rx="13" ry="16" fill="#fff"/>
    <ellipse cx="111" cy="88" rx="13" ry="16" fill="#fff"/>
    <circle cx="72" cy="90" r="6" fill="#102b46"/>
    <circle cx="108" cy="90" r="6" fill="#102b46"/>
    <path d="M77 111q13 12 26 0" fill="none" stroke="#f4c65e" stroke-width="5" stroke-linecap="round"/>
    <path d="M75 143v15m30-15v15" stroke="#f4c65e" stroke-width="8" stroke-linecap="round"/>
    <path d="M52 70q38-26 76 0" fill="none" stroke="#f4c65e" stroke-width="5"/>
    <circle cx="90" cy="58" r="8" fill="#f4c65e"/>
  </svg>`;


  var SCREEN_HELP = {
    1: 'Puedo ayudarte a cargar un correo PDF o EML, o pegar su contenido. No necesitas abrir el mensaje ni pulsar sus enlaces.',
    2: 'En esta pantalla revisamos remitente, asunto, fecha, contenido, enlaces, adjuntos y huella SHA-256. Los destinos se muestran sin visitarlos.',
    3: 'Aquí Vigía verifica la integridad del mensaje y ejecuta las reglas locales I1 a I11. El modelo ONNX aporta una señal complementaria cuando está disponible.',
    4: 'Este es el veredicto. Puedo explicar cada indicio, leer la evidencia, recomendar qué hacer y orientarte sobre los canales del IESS.'
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, className, handler) {
    var node = el('button', className || 'vg-assistant__button', label);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  }

  function loadModelViewer() {
    if (window.customElements && customElements.get('model-viewer')) return Promise.resolve(true);
    if (viewerPromise) return viewerPromise;
    viewerPromise = new Promise(function (resolve) {
      var script = document.createElement('script');
      script.type = 'module';
      script.src = MODEL_VIEWER_URL;
      script.onload = function () {
        if (window.customElements && customElements.whenDefined) {
          customElements.whenDefined('model-viewer').then(function () { resolve(true); }).catch(function () { resolve(false); });
        } else resolve(false);
      };
      script.onerror = function () { resolve(false); };
      document.head.appendChild(script);
      window.setTimeout(function () { resolve(!!(window.customElements && customElements.get('model-viewer'))); }, 15000);
    });
    return viewerPromise;
  }

  function setCaption(text) {
    if (!captions) return;
    captions.textContent = String(text || 'Estoy aquí para ayudarte a utilizar Vigía IESS.');
  }

  function applyCloseCamera() {
    if (!viewer) return;
    viewer.setAttribute('camera-target', 'auto auto auto');
    viewer.setAttribute('camera-orbit', CAMERA_ORBIT);
    viewer.setAttribute('field-of-view', CAMERA_FIELD_OF_VIEW);
    if (typeof viewer.jumpCameraToGoal === 'function') viewer.jumpCameraToGoal();
  }

  function updateViewerFraming() {
    if (!viewer) return;
    viewer.setAttribute('camera-target', 'auto auto auto');
    if (typeof viewer.updateFraming === 'function') {
      Promise.resolve(viewer.updateFraming()).then(function () {
        applyCloseCamera();
      }).catch(function () { applyCloseCamera(); });
    } else {
      applyCloseCamera();
    }
  }


  function setExpanded(value) {
    expanded = !!value;
    if (!widget) return;

    widget.classList.toggle('is-expanded', expanded);
    widget.classList.toggle('is-collapsed', !expanded);
    if (host) {
      host.classList.toggle('is-expanded', expanded);
      host.classList.toggle('is-collapsed', !expanded);
    }

    var toggle = widget.querySelector('.vg-assistant__toggle');
    if (toggle) {
      toggle.textContent = expanded ? 'Minimizar' : 'Abrir';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', expanded ? 'Minimizar asistente Vigía' : 'Expandir asistente Vigía');
    }
    if (stage) {
      stage.setAttribute('aria-label', expanded ? 'Mascota Vigía' : 'Abrir asistente Vigía');
      stage.setAttribute('role', expanded ? 'img' : 'button');
      stage.tabIndex = expanded ? -1 : 0;
    }

    // No se destruye ni se recrea <model-viewer> al abrir/minimizar.
    // Solo cambiamos la interacción; la cámara y el estado de la animación se conservan.
    if (viewer) viewer.style.pointerEvents = expanded ? 'auto' : 'none';

    window.requestAnimationFrame(function () {
      updateViewerFraming();
      clampWidgetToViewport();
    });
  }



  var PROFILE_AVATARS = [
    { id: 'joven-mujer', label: 'Joven', age: 'Juventud', src: '/assets/img/avatars/joven-mujer.webp' },
    { id: 'joven-hombre', label: 'Joven', age: 'Juventud', src: '/assets/img/avatars/joven-hombre.webp' },
    { id: 'adulta-mujer', label: 'Adulta', age: 'Adultez', src: '/assets/img/avatars/adulta-mujer.webp' },
    { id: 'adulto-hombre', label: 'Adulto', age: 'Adultez', src: '/assets/img/avatars/adulto-hombre.webp' },
    { id: 'mayor-mujer', label: 'Adulta mayor', age: 'Personas mayores', src: '/assets/img/avatars/mayor-mujer.webp' },
    { id: 'mayor-hombre', label: 'Adulto mayor', age: 'Personas mayores', src: '/assets/img/avatars/mayor-hombre.webp' }
  ];

  function getProfileAvatar(id) {
    return PROFILE_AVATARS.find(function (item) { return item.id === id; }) || PROFILE_AVATARS[0];
  }

  function updateProfileAvatar(id) {
    var item = getProfileAvatar(id);
    if (profileIcon) {
      profileIcon.src = item.src;
      profileIcon.alt = 'Avatar de perfil: ' + item.label;
    }
    if (profilePicker) {
      profilePicker.setAttribute('aria-label', 'Avatar de perfil seleccionado: ' + item.label + '. Pulsa para cambiar.');
      var label = profilePicker.querySelector('.profile-picker__text');
      if (label) label.textContent = item.label;
    }
    if (profileDialog) {
      profileDialog.querySelectorAll('[data-profile-avatar]').forEach(function (option) {
        var selected = option.getAttribute('data-profile-avatar') === item.id;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-pressed', String(selected));
      });
    }
    try { localStorage.setItem('vigia_profile_avatar', item.id); } catch (_) {}
  }

  function closeProfileDialog() {
    if (!profileDialog || profileDialog.hidden) return;
    profileDialog.hidden = true;
    if (profilePicker) {
      profilePicker.setAttribute('aria-expanded', 'false');
      profilePicker.focus();
    }
  }

  function openProfileDialog() {
    if (!profileDialog) return;
    profileDialog.hidden = false;
    if (profilePicker) profilePicker.setAttribute('aria-expanded', 'true');
    var first = profileDialog.querySelector('[data-profile-avatar]');
    if (first) first.focus();
  }

  function configureProfilePicker() {
    profilePicker = document.getElementById('selectorPerfil');
    profileIcon = document.getElementById('perfilIcono');
    if (!profilePicker || !profileIcon) return;

    var saved = 'joven-mujer';
    try { saved = localStorage.getItem('vigia_profile_avatar') || saved; } catch (_) {}
    updateProfileAvatar(saved);

    profileDialog = el('div', 'vigia-profile-modal');
    profileDialog.hidden = true;
    profileDialog.setAttribute('role', 'presentation');

    var dialog = el('section', 'vigia-profile-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'vigia-profile-title');

    var head = el('div', 'vigia-profile-head');
    var headCopy = el('div', 'vigia-profile-head-copy');
    headCopy.appendChild(el('span', 'vigia-profile-eyebrow', 'PERSONALIZA TU EXPERIENCIA'));
    var title = el('h2', '', 'Elige tu avatar');
    title.id = 'vigia-profile-title';
    headCopy.appendChild(title);
    headCopy.appendChild(el('p', '', 'Selecciona una ilustración para tu perfil. La mascota 3D de Vigía no cambia.'));
    var close = button('×', 'vigia-profile-close', closeProfileDialog);
    close.setAttribute('aria-label', 'Cerrar selector de avatar');
    head.appendChild(headCopy);
    head.appendChild(close);

    var grid = el('div', 'vigia-profile-grid');
    PROFILE_AVATARS.forEach(function (item) {
      var option = button('', 'vigia-profile-option', function () {
        updateProfileAvatar(item.id);
        closeProfileDialog();
      });
      option.setAttribute('data-profile-avatar', item.id);
      option.setAttribute('aria-label', 'Elegir avatar ' + item.label + ', ' + item.age);
      option.setAttribute('aria-pressed', 'false');

      var image = document.createElement('img');
      image.src = item.src;
      image.alt = '';
      image.loading = 'lazy';
      option.appendChild(image);
      option.appendChild(el('strong', '', item.label));
      option.appendChild(el('small', '', item.age));
      grid.appendChild(option);
    });

    var foot = el('p', 'vigia-profile-foot', 'Tu elección se guarda solo en este navegador.');
    dialog.appendChild(head);
    dialog.appendChild(grid);
    dialog.appendChild(foot);
    profileDialog.appendChild(dialog);
    document.body.appendChild(profileDialog);

    profilePicker.addEventListener('click', openProfileDialog);
    profileDialog.addEventListener('click', function (event) {
      if (event.target === profileDialog) closeProfileDialog();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !profileDialog.hidden) closeProfileDialog();
    });
    updateProfileAvatar(saved);
  }


  function clampWidgetToViewport() {
    if (!host || !widget) return;
    var rect = host.getBoundingClientRect();
    var margin = 8;
    var maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    var maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    var left = Math.min(Math.max(rect.left, margin), maxLeft);
    var top = Math.min(Math.max(rect.top, margin), maxTop);
    // Solo convertimos right/bottom a coordenadas explícitas si el usuario ya movió la mascota.
    if (host.dataset.userMoved === 'true' || host.style.left || host.style.top) {
      host.style.left = left + 'px';
      host.style.top = top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    }
  }

  function restoreWidgetPosition() {
    if (!host) return;
    try {
      var saved = JSON.parse(localStorage.getItem('vigia_mascot_position') || 'null');
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        host.style.left = saved.left + 'px';
        host.style.top = saved.top + 'px';
        host.style.right = 'auto';
        host.style.bottom = 'auto';
        host.dataset.userMoved = 'true';
        window.requestAnimationFrame(clampWidgetToViewport);
      }
    } catch (_) {}
  }

  function bindMascotDrag() {
    if (!stage) return;
    stage.addEventListener('pointerdown', function (event) {
      if (expanded || (event.pointerType === 'mouse' && event.button !== 0)) return;
      var rect = host.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false
      };
      try { stage.setPointerCapture(event.pointerId); } catch (_) {}
    });

    stage.addEventListener('pointermove', function (event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      var dx = event.clientX - dragState.startX;
      var dy = event.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(dx, dy) > 6) {
        dragState.moved = true;
        widget.classList.add('is-dragging');
        host.dataset.userMoved = 'true';
      }
      if (!dragState.moved) return;
      event.preventDefault();
      var maxLeft = Math.max(8, window.innerWidth - host.offsetWidth - 8);
      var maxTop = Math.max(8, window.innerHeight - host.offsetHeight - 8);
      var left = Math.min(Math.max(8, dragState.left + dx), maxLeft);
      var top = Math.min(Math.max(8, dragState.top + dy), maxTop);
      host.style.left = left + 'px';
      host.style.top = top + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    });

    function finishDrag(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      var moved = dragState.moved;
      dragState = null;
      widget.classList.remove('is-dragging');
      try { stage.releasePointerCapture(event.pointerId); } catch (_) {}
      if (moved) {
        suppressStageClick = true;
        try {
          var rect = host.getBoundingClientRect();
          localStorage.setItem('vigia_mascot_position', JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
        } catch (_) {}
        window.setTimeout(function () { suppressStageClick = false; }, 180);
      }
    }
    stage.addEventListener('pointerup', finishDrag);
    stage.addEventListener('pointercancel', finishDrag);
  }

  function setMood(mood) {
    if (!widget) return;
    var allowed = ['idle', 'thinking', 'alert', 'success'];
    currentMood = allowed.indexOf(mood) >= 0 ? mood : 'idle';
    widget.classList.remove('mood-idle', 'mood-thinking', 'mood-alert', 'mood-success');
    widget.classList.add('mood-' + currentMood);
    updateViewerMotion();
  }

  function updateViewerMotion() {
    if (!viewer) return;
    var speaking = widget && widget.classList.contains('is-speaking');
    var canRotate = !reducedMotion && !speaking && (currentMood === 'idle' || currentMood === 'success');
    if (canRotate) viewer.setAttribute('auto-rotate', '');
    else viewer.removeAttribute('auto-rotate');
  }

  function say(text) {
    var clean = String(text || '').trim();
    if (!clean) return;
    lastVoiceText = clean;
    setCaption(clean);
    if (window.VigiaVoz && typeof window.VigiaVoz.hablar === 'function') {
      window.VigiaVoz.hablar(clean);
    } else {
      stageStatus.textContent = 'La voz no está disponible en este navegador';
    }
  }

  function helpCurrentScreen() {
    var text = SCREEN_HELP[currentScreen] || SCREEN_HELP[1];
    if (currentScreen === 4 && lastResult) {
      text = 'El análisis terminó. ' + (lastResult.es_phishing === true
        ? 'El mensaje presenta señales de posible phishing. ' + (lastResult.indicios || []).length + ' indicios requieren atención.'
        : 'No se encontraron coincidencias en las reglas locales. Esto no garantiza que el correo sea legítimo.');
      text += ' Pulsa explicar resultado para escuchar el detalle.';
    }
    say(text);
  }

  function readEmail() {
    var email = window.correoVigiaActual || {};
    if (!email || (!email.remitente && !email.asunto && !email.cuerpo)) {
      say('Todavía no has cargado un correo. Ve al primer paso, selecciona un archivo o pega el texto y pulsa leer correo de forma segura.');
      return;
    }
    say('Resumen del correo. Remitente: ' + (email.remitente || 'no identificado') + '. Asunto: ' +
      (email.asunto || 'sin asunto') + '. Fecha: ' + (email.fecha || 'no especificada') +
      '. Contenido: ' + String(email.cuerpo_neutralizado || email.cuerpo || 'sin texto legible').slice(0, 1000));
  }

  function buildNarrative(result) {
    var indicators = Array.isArray(result.indicios) ? result.indicios : [];
    var channels = result.canales_oficiales || {};
    var reportEmail = channels.seguridad_informacion || channels.denuncias_correo || 'seguridad.informacion@iess.gob.ec';
    var reportWeb = channels.denuncias_web || 'https://denuncias.iess.gob.ec';
    var spokenEmail = String(reportEmail).replace(/@/g, ' arroba ').replace(/\./g, ' punto ');
    var spokenWeb = String(reportWeb).replace(/^https?:\/\//, '').replace(/\./g, ' punto ').replace(/\//g, ' diagonal ');
    var parts = [];

    parts.push('Hola, soy Vigía, tu asistente de seguridad. Ya terminé de revisar el correo.');
    if (result.es_phishing === true) {
      parts.push('Atención. Encontré ' + indicators.length + ' indicio' + (indicators.length === 1 ? '' : 's') + ' de posible phishing.');
    } else {
      parts.push('No encontré indicios determinísticos de phishing. Esto no garantiza que el mensaje sea legítimo.');
    }

    indicators.forEach(function (item, index) {
      parts.push('Indicio ' + (index + 1) + ' de ' + indicators.length + '. ' + (item.codigo || '') + '. ' + (item.nombre || 'Señal detectada') + '.');
      if (item.evidencia) parts.push('Evidencia observada: ' + item.evidencia + '.');
      if (item.explicacion) parts.push(item.explicacion);
      if (item.consejo) parts.push('Qué hacer: ' + item.consejo);
    });

    parts.push('Si caes en un engaño, podrían robar tus claves, suplantar tu identidad, acceder a tus cuentas o utilizar tus datos para estafar a tus contactos.');
    parts.push('También existen los deepfakes. Con fotos o videos públicos pueden crear audios o videos falsos que imitan a una persona. Si recibes una petición urgente de dinero por voz o video, confirma por otro medio y llama a un número que ya conozcas.');
    parts.push('No abras enlaces ni adjuntos sospechosos, no compartas claves ni códigos y conserva el mensaje como evidencia.');
    parts.push('Puedes reportarlo mediante ' + spokenEmail + ' o en ' + spokenWeb + '. Vigía no envía el reporte automáticamente; te orienta para que utilices los canales institucionales.');

    if (typeof result.probabilidad_ml === 'number') {
      parts.push('El clasificador produjo una señal complementaria de ' + result.probabilidad_ml + ' por ciento. El veredicto de este prototipo se determina por las reglas locales.');
    } else {
      parts.push('El clasificador no produjo una estimación disponible. El veredicto se basa en las reglas determinísticas.');
    }
    return parts.join(' ');
  }

  function renderFindings(result) {
    if (!findings) return;
    findings.textContent = '';
    var list = Array.isArray(result.indicios) ? result.indicios : [];
    if (!list.length) {
      findings.appendChild(el('p', 'vg-assistant__empty', 'No se encontraron coincidencias en I1–I11. Mantén la precaución y verifica por un canal oficial.'));
      return;
    }

    list.forEach(function (item, index) {
      var row = el('article', 'vg-assistant__finding');
      var copy = el('div', 'vg-assistant__finding-copy');
      copy.appendChild(el('strong', '', (item.codigo || 'Indicio') + ' · ' + (item.nombre || 'Señal detectada')));
      copy.appendChild(el('p', '', item.evidencia || item.explicacion || 'Señal identificada por el motor local.'));
      var listen = button('Escuchar', 'vg-assistant__listen', function () {
        say('Indicio ' + (index + 1) + '. ' + (item.nombre || '') + '. ' +
          (item.explicacion || '') + (item.evidencia ? ' Evidencia: ' + item.evidencia : '') +
          (item.consejo ? ' Recomendación: ' + item.consejo : ''));
      });
      row.appendChild(copy);
      row.appendChild(listen);
      findings.appendChild(row);
    });
  }

  function explainAnalysis(result, autoSpeak) {
    lastResult = result || {};
    var phishing = lastResult.es_phishing === true;
    var total = Array.isArray(lastResult.indicios) ? lastResult.indicios.length : 0;
    var badge = widget && widget.querySelector('.vg-assistant__badge');
    var title = widget && widget.querySelector('.vg-assistant__headline');
    if (badge) badge.textContent = phishing ? 'Riesgo detectado' : 'Sin coincidencias';
    if (title) title.textContent = phishing ? 'Encontré señales de phishing' : 'No encontré señales determinísticas';
    stageStatus.textContent = phishing ? total + ' indicios requieren atención' : 'No se detectaron coincidencias';
    renderFindings(lastResult);
    setMood(phishing ? 'alert' : 'success');
    setExpanded(true);
    currentScreen = 4;
    if (autoSpeak !== false) say(buildNarrative(lastResult));
    else setCaption(phishing
      ? 'Vigía encontró ' + total + ' señales. Puedes escuchar el detalle de cada una.'
      : 'No se detectaron indicios determinísticos. Esto no garantiza legitimidad.');
  }

  function answerQuestion(query) {
    var q = String(query || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!q) return;
    var response;

    if (/deep.?fake|video falso|voz falsa|suplant/.test(q)) {
      response = 'Un deepfake es un audio, imagen o video manipulado para imitar a una persona. Si alguien te pide dinero o códigos por una llamada o video inesperado, cuelga y confirma con esa persona mediante otro número o canal que ya conozcas.';
    } else if (/report|denunci|canal|correo del iess|donde aviso/.test(q)) {
      response = 'Para reportar un correo sospechoso, conserva el mensaje como evidencia y no abras sus enlaces ni adjuntos. Puedes escribir a seguridad.informacion arroba iess punto gob punto ec o consultar el portal de denuncias del IESS. Vigía no envía el reporte automáticamente.';
    } else if (/phishing|fraude|estafa|enga[nñ]o/.test(q)) {
      response = 'El phishing es un engaño que suplanta a una institución o persona de confianza para conseguir claves, dinero o datos. Vigía revisa señales como urgencia, enlaces no oficiales, solicitudes de credenciales, adjuntos y remitentes sospechosos.';
    } else if (/pdf|eml|archivo|adjunt|subir|cargar/.test(q)) {
      response = 'En el primer paso puedes subir un PDF exportado desde Gmail, un archivo EML o pegar el texto del correo. El tamaño máximo es diez megabytes. Selecciona el archivo y pulsa leer correo de forma segura. No abras enlaces ni adjuntos.';
    } else if (/enlace|link|url|clic/.test(q)) {
      response = 'Vigía extrae los enlaces y muestra sus dominios de forma neutralizada. No los visita ni sigue redirecciones. No pulses un enlace sospechoso; escribe tú mismo la dirección del portal oficial.';
    } else if (/resultado|indicio|regla|i1|i2|i3|i4|i5|i6|i7|i8|i9|i10|i11/.test(q)) {
      response = lastResult
        ? buildNarrative(lastResult)
        : 'El veredicto aparece después del análisis. Vigía revisa once reglas determinísticas y muestra cada indicio con su evidencia y recomendación.';
    } else if (/normal|legitimo|seguro|limpio/.test(q)) {
      response = 'Si no se encuentran indicios, eso no demuestra que el correo sea legítimo. Comprueba el dominio del remitente y cualquier trámite entrando por tu cuenta al portal oficial del IESS.';
    } else if (/como funciona|que haces|ayuda|pantalla|paso/.test(q)) {
      response = SCREEN_HELP[currentScreen];
    } else {
      response = 'Puedo ayudarte con las funciones de Vigía: cargar PDF o EML, revisar el correo, entender los indicios, interpretar el veredicto, prevenir deepfakes y conocer cómo reportar. Todavía no estoy conectado a un asistente de IA general.';
    }
    questionAnswer.textContent = response;
    say(response);
  }


  function createModel() {
    loadModelViewer().then(function (ready) {
      if (!ready || !stage) {
        stageStatus.textContent = 'No se pudo iniciar el visor 3D. Comprueba la conexión al visor.';
        illustration.hidden = false;
        return;
      }

      // Se conserva el GLB con su armadura y animación. El tamaño visible se ajusta
      // con camera-orbit y field-of-view, sin deformar ni reescalar los huesos.
      viewer = document.createElement('model-viewer');
      viewer.className = 'vg-assistant__model';
      viewer.setAttribute('src', MODEL_URL);
      viewer.setAttribute('alt', 'Vigía, mascota virtual 3D del asistente de seguridad');
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('reveal', 'auto');
      viewer.setAttribute('autoplay', '');
      viewer.setAttribute('animation-loop', '');
      viewer.setAttribute('animation-name', 'mixamo.com');
      viewer.setAttribute('camera-controls', '');
      viewer.setAttribute('disable-zoom', '');
      viewer.setAttribute('disable-pan', '');
      viewer.setAttribute('disable-tap', '');
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('camera-target', 'auto auto auto');
      // Encuadre cercano para que la mascota ocupe el escenario sin recortar el cuerpo.
      // El mismo encuadre se conserva al minimizar y expandir: no se recrea el visor.
      viewer.setAttribute('camera-orbit', CAMERA_ORBIT);
      viewer.setAttribute('field-of-view', CAMERA_FIELD_OF_VIEW);
      viewer.setAttribute('interpolation-decay', '180');
      viewer.setAttribute('rotation-per-second', '10deg');
      viewer.setAttribute('auto-rotate-delay', '0');
      viewer.setAttribute('shadow-intensity', '0.65');
      viewer.setAttribute('exposure', '1');
      viewer.style.width = '100%';
      viewer.style.height = '100%';
      viewer.style.display = 'block';
      viewer.style.pointerEvents = 'none';

      viewer.addEventListener('progress', function (event) {
        var progress = event.detail && event.detail.totalProgress;
        if (typeof progress === 'number' && progress < 1) {
          stageStatus.textContent = 'Cargando Pantera 3D… ' + Math.round(progress * 100) + '%';
        }
      });

      viewer.addEventListener('load', function () {
        // Se conserva la escala útil del GLB distribuido (Armature 0.5).
        // No se modifica el rig ni los canales Mixamo; solo se acerca la cámara.
        var dimensions = typeof viewer.getDimensions === 'function' ? viewer.getDimensions() : null;
        var maxDimension = dimensions
          ? Math.max(dimensions.x || 0, dimensions.y || 0, dimensions.z || 0)
          : 0;

        if (dimensions && maxDimension > 0 && maxDimension < 0.4) {
          stageStatus.textContent = 'El modelo se cargó, pero su escala sigue siendo demasiado pequeña.';
          illustration.hidden = false;
          console.error('Vigía: dimensiones inesperadas del modelo GLB:', dimensions);
          return;
        }

        stageStatus.textContent = 'Ajustando cámara de Pantera 3D…';

        var finishFraming = function () {
          viewer.setAttribute('camera-target', 'auto auto auto');
          viewer.setAttribute('camera-orbit', CAMERA_ORBIT);
          viewer.setAttribute('field-of-view', CAMERA_FIELD_OF_VIEW);
          viewer.setAttribute('interpolation-decay', '120');
          if (typeof viewer.jumpCameraToGoal === 'function') viewer.jumpCameraToGoal();
          if (typeof viewer.play === 'function') viewer.play();
          modelFramed = true;
          illustration.hidden = true;
          stageStatus.textContent = 'Pantera 3D cargada · Animación Mixamo';
        };

        // El visor calcula el centro del modelo y después aplica un encuadre más cercano.
        if (typeof viewer.updateFraming === 'function') {
          Promise.resolve(viewer.updateFraming()).then(finishFraming).catch(finishFraming);
        } else {
          finishFraming();
        }
      });

      viewer.addEventListener('error', function (event) {
        var detail = event.detail || {};
        var kind = detail.type || 'error de carga';
        stageStatus.textContent = 'No se pudo mostrar el GLB (' + kind + '). Se muestra el respaldo visual.';
        illustration.hidden = false;
        console.error('Error cargando mascota GLB:', detail);
      });

      viewer.addEventListener('model-visibility', function (event) {
        // Este evento solo informa que el visor está dentro del viewport;
        // no se usa como prueba de que el modelo se haya dibujado correctamente.
        if (modelFramed && event.detail && event.detail.visible === true) {
          stageStatus.textContent = 'Pantera 3D cargada · Animación Mixamo';
        }
      });

      stage.appendChild(viewer);
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(function () {
          if (viewer && modelFramed) updateViewerFraming();
        });
        resizeObserver.observe(stage);
      }
    });
  }


  function build() {
    host = document.getElementById('avatar-asistente');
    if (!host) return;
    host.textContent = '';
    widget = el('aside', 'vg-assistant is-collapsed');
    widget.setAttribute('aria-label', 'Asistente virtual Vigía disponible en todas las pantallas');

    var header = el('div', 'vg-assistant__header');
    var identity = el('div', 'vg-assistant__identity');
    identity.appendChild(el('span', 'vg-assistant__online-dot'));
    var name = el('div', 'vg-assistant__name');
    name.appendChild(el('strong', '', 'Vigía'));
    name.appendChild(el('small', '', 'Asistente de seguridad'));
    identity.appendChild(name);
    var badge = el('span', 'vg-assistant__badge', 'Listo para ayudarte');
    var toggle = button('Abrir', 'vg-assistant__toggle', function () { setExpanded(!expanded); });
    header.appendChild(identity);
    header.appendChild(toggle);

    // El selector del encabezado cambia el icono del perfil del usuario, no la mascota 3D.
    configureProfilePicker();

    stage = el('div', 'vg-assistant__stage');
    stageStatus = el('span', 'vg-assistant__status', 'Cargando mascota 3D…');
    stage.appendChild(stageStatus);
    illustration = el('div', 'vg-assistant__illustration');
    illustration.innerHTML = FALLBACK_SVG;
    illustration.hidden = true;
    stage.appendChild(illustration);
    launcherLabel = el('span', 'vg-assistant__launcher-label', 'Vigía');
    stage.appendChild(launcherLabel);
    stage.addEventListener('click', function (event) {
      if (suppressStageClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressStageClick = false;
        return;
      }
      if (!expanded) setExpanded(true);
    });
    bindMascotDrag();
    stage.addEventListener('keydown', function (event) {
      if (!expanded && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        setExpanded(true);
      }
    });
    mouth = el('span', 'vg-assistant__mouth');
    mouth.setAttribute('aria-hidden', 'true');
    stage.appendChild(mouth);

    var bubbleHead = el('div', 'vg-assistant__bubble-head');
    bubbleHead.appendChild(el('strong', 'vg-assistant__headline', 'Estoy aquí para ayudarte'));
    bubbleHead.appendChild(badge);

    captions = el('div', 'vg-assistant__captions', SCREEN_HELP[1]);
    captions.id = 'vigia-subtitulos';
    captions.setAttribute('role', 'status');
    captions.setAttribute('aria-live', 'polite');
    captions.setAttribute('aria-atomic', 'true');

    var expandedContent = el('div', 'vg-assistant__expanded-content');
    var controls = el('div', 'vg-assistant__controls');
    controls.appendChild(button('Ayuda en esta pantalla', 'vg-assistant__button vg-assistant__button--primary', helpCurrentScreen));
    controls.appendChild(button('Leer correo', 'vg-assistant__button', readEmail));
    controls.appendChild(button('Explicar resultado', 'vg-assistant__button', function () {
      if (lastResult) explainAnalysis(lastResult, true);
      else say('Todavía no hay un resultado. Primero carga un correo y ejecuta el análisis.');
    }));
    pauseButton = button('Pausar', 'vg-assistant__button', function () {
      if (!window.VigiaVoz) return;
      if (window.VigiaVoz.estaPausado && window.VigiaVoz.estaPausado()) {
        window.VigiaVoz.reanudar();
        widget.classList.remove('is-paused');
        pauseButton.textContent = 'Pausar';
        stageStatus.textContent = 'Vigía continúa hablando';
      } else {
        window.VigiaVoz.pausar();
        widget.classList.add('is-paused');
        pauseButton.textContent = 'Continuar';
        stageStatus.textContent = 'Explicación en pausa';
      }
    });
    pauseButton.disabled = true;
    controls.appendChild(pauseButton);
    controls.appendChild(button('Detener', 'vg-assistant__button', function () {
      if (window.VigiaVoz) window.VigiaVoz.detener();
      stageStatus.textContent = 'Lectura detenida';
    }));
    captionsToggle = button('Ocultar subtítulos', 'vg-assistant__button vg-assistant__button--subtitles', function () {
      captionsVisible = !captionsVisible;
      widget.classList.toggle('captions-hidden', !captionsVisible);
      captionsToggle.textContent = captionsVisible ? 'Ocultar subtítulos' : 'Mostrar subtítulos';
      captionsToggle.setAttribute('aria-pressed', String(captionsVisible));
    });
    captionsToggle.setAttribute('aria-pressed', 'true');
    controls.appendChild(captionsToggle);

    var quick = el('div', 'vg-assistant__quick');
    quick.appendChild(button('¿Qué es phishing?', 'vg-assistant__chip', function () { answerQuestion('¿Qué es phishing?'); }));
    quick.appendChild(button('¿Cómo reporto?', 'vg-assistant__chip', function () { answerQuestion('¿Cómo reporto?'); }));
    quick.appendChild(button('¿Qué es un deepfake?', 'vg-assistant__chip', function () { answerQuestion('¿Qué es un deepfake?'); }));

    var form = el('form', 'vg-assistant__ask');
    questionInput = document.createElement('input');
    questionInput.type = 'text';
    questionInput.placeholder = 'Pregunta sobre Vigía…';
    questionInput.maxLength = 220;
    questionInput.setAttribute('aria-label', 'Pregunta sobre cómo usar Vigía');
    var askButton = document.createElement('button');
    askButton.type = 'submit';
    askButton.textContent = 'Enviar';
    form.appendChild(questionInput);
    form.appendChild(askButton);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      answerQuestion(questionInput.value);
      questionInput.value = '';
    });
    questionAnswer = el('p', 'vg-assistant__answer', 'Puedes preguntarme cómo usar cada paso de Vigía.');
    questionAnswer.setAttribute('aria-live', 'polite');
    findings = el('div', 'vg-assistant__findings');

    expandedContent.appendChild(controls);
    expandedContent.appendChild(quick);
    expandedContent.appendChild(form);
    expandedContent.appendChild(questionAnswer);
    expandedContent.appendChild(findings);

    widget.appendChild(header);
    widget.appendChild(stage);
    widget.appendChild(bubbleHead);
    widget.appendChild(captions);
    widget.appendChild(expandedContent);
    host.appendChild(widget);
    setExpanded(false);
    setMood('idle');
    restoreWidgetPosition();
    createModel();
    window.addEventListener('resize', clampWidgetToViewport);
  }

  function onVoiceStart() {
    if (!widget) return;
    widget.classList.add('is-speaking');
    if (mouth) mouth.classList.add('is-moving');
    pauseButton.disabled = false;
    stageStatus.textContent = 'Vigía está hablando…';
    updateViewerMotion();
  }

  function onVoiceFragment(event) {
    var detail = event.detail || {};
    setCaption(detail.texto || lastVoiceText);
  }

  function onVoiceEnd() {
    if (!widget) return;
    widget.classList.remove('is-speaking', 'is-paused');
    if (mouth) mouth.classList.remove('is-moving');
    pauseButton.disabled = true;
    pauseButton.textContent = 'Pausar';
    stageStatus.textContent = lastResult ? 'Explicación disponible' : 'Vigía está listo';
    updateViewerMotion();
  }

  function onScreenChange(event) {
    currentScreen = Number(event.detail && event.detail.paso) || 1;
    if (currentScreen === 3) setMood('thinking');
    else if (currentScreen === 4 && lastResult) setMood(lastResult.es_phishing === true ? 'alert' : 'success');
    else setMood('idle');
    if (window.VigiaVoz && window.VigiaVoz.estaHablando && window.VigiaVoz.estaHablando()) return;
    var hint = SCREEN_HELP[currentScreen] || SCREEN_HELP[1];
    if (currentScreen === 4 && lastResult) {
      hint = lastResult.es_phishing === true
        ? 'Vigía encontró ' + ((lastResult.indicios || []).length) + ' señales. Abre el asistente para escuchar la explicación.'
        : 'No se detectaron coincidencias en las reglas. Recuerda que eso no garantiza legitimidad.';
    }
    setCaption(hint);
    var title = widget && widget.querySelector('.vg-assistant__headline');
    if (title) title.textContent = currentScreen === 4 ? 'Tu resultado está listo' : '¿Necesitas ayuda?';
  }

  function init() {
    build();
    document.addEventListener('vigia:voz-inicio', onVoiceStart);
    document.addEventListener('vigia:voz-fragmento', onVoiceFragment);
    document.addEventListener('vigia:voz-fin', onVoiceEnd);
    document.addEventListener('vigia:ventana', onScreenChange);
    document.addEventListener('vigia:correo-leido', function () {
      lastResult = null;
      setMood('success');
      if (findings) findings.textContent = '';
      var badge = widget && widget.querySelector('.vg-assistant__badge');
      var headline = widget && widget.querySelector('.vg-assistant__headline');
      if (badge) badge.textContent = 'Correo listo';
      if (headline) headline.textContent = 'Vamos a revisarlo';
      setCaption('Correo leído de forma segura. En el siguiente paso podrás revisar remitente, contenido, enlaces y adjuntos.');
      stageStatus.textContent = 'Correo preparado para revisar';
    });
    document.addEventListener('vigia:analisis-paso', function () {
      setMood('thinking');
      stageStatus.textContent = 'Analizando el correo localmente…';
      setCaption('Estoy observando las comprobaciones de integridad y las reglas de seguridad. El resultado aparecerá cuando termine el análisis.');
    });
    document.addEventListener('vigia:voz-no-disponible', function () {
      stageStatus.textContent = 'Voz no disponible en este navegador';
    });
  }

  window.VigiaAvatar = {
    explicar: function (result) { explainAnalysis(result, true); },
    explicarAnalisis: function (result) { explainAnalysis(result, true); },
    decir: say,
    saludar: helpCurrentScreen,
    ayudar: helpCurrentScreen,
    ayudaPregunta: answerQuestion,
    leerCorreo: readEmail,
    estado: function (text) { stageStatus.textContent = String(text || 'Vigía está listo'); },
    expandir: function () { setExpanded(true); },
    minimizar: function () { setExpanded(false); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
