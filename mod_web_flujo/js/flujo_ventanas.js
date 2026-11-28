/* Navegación por ventanas, análisis y presentación del resultado. */
(function () {
  'use strict';

  var analysisRunning = false;

  function showWindow(number) {
    if (!Number.isInteger(number) || number < 1 || number > 4) return;
    document.querySelectorAll('main .paso').forEach(function (section) {
      var active = section.id === 'ventana' + number;
      section.classList.toggle('ventana-activa', active);
      section.classList.toggle('ventana-oculta', !active);
      section.setAttribute('aria-hidden', String(!active));
    });
    document.querySelectorAll('[data-ir-paso]').forEach(function (button) {
      var active = Number(button.dataset.irPaso) === number;
      button.classList.toggle('paso-activo', active);
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.dispatchEvent(new CustomEvent('vigia:ventana', { detail: { paso: number } }));
  }

  function setProgress(value, text) {
    var progress = document.getElementById('barraProgreso');
    var label = document.getElementById('porcentajeProgreso');
    var status = document.getElementById('estadoAnalisis');
    var liveBar = document.getElementById('vigia-live-risk-bar');
    var liveState = document.getElementById('vigia-live-risk-state');
    var safeValue = Math.max(0, Math.min(100, Number(value) || 0));

    if (progress) progress.value = safeValue;
    if (label) label.textContent = safeValue + ' %';
    if (status) status.textContent = text;
    if (liveBar) {
      liveBar.style.width = safeValue + '%';
      liveBar.setAttribute('aria-valuenow', String(safeValue));
    }
    if (liveState) {
      var phase = 'Preparado';
      if (analysisRunning) {
        if (/esperando/i.test(text || '')) phase = 'Esperando respuesta';
        else if (safeValue >= 94) phase = 'Finalizando';
        else phase = 'Analizando';
      }
      if (/no se pudo completar/i.test(text || '')) phase = 'Error';
      else if (safeValue >= 100) phase = 'Completado';
      liveState.textContent = phase + ' · ' + safeValue + ' %';
    }
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function animateProgress(from, to, duration, message) {
    return new Promise(function (resolve) {
      var started = null;
      function frame(timestamp) {
        if (started === null) started = timestamp;
        var elapsed = Math.min(1, (timestamp - started) / duration);
        var eased = 1 - Math.pow(1 - elapsed, 3);
        var value = Math.round(from + (to - from) * eased);
        setProgress(value, message);
        if (elapsed < 1) window.requestAnimationFrame(frame);
        else resolve();
      }
      window.requestAnimationFrame(frame);
    });
  }

  async function animateAnalysisProgress() {
    setProgress(4, 'Preparando el correo para la revisión…');
    await animateProgress(4, 18, 4000, 'Verificando la integridad del mensaje…');
    await animateProgress(18, 34, 4800, 'Revisando remitente, asunto y contenido…');
    await animateProgress(34, 52, 5200, 'Inspeccionando enlaces y dominios…');
    await animateProgress(52, 68, 5200, 'Comprobando adjuntos y solicitudes de datos…');
    await animateProgress(68, 84, 5800, 'Aplicando las reglas I1–I11 y consultando la señal ML…');
    setProgress(84, 'Esperando la respuesta del motor local…');
  }

  function addListItem(list, title, detail) {
    var li = document.createElement('li');
    var strong = document.createElement('strong');
    strong.textContent = title;
    li.appendChild(strong);
    if (detail) {
      var p = document.createElement('p');
      p.textContent = detail;
      li.appendChild(p);
    }
    list.appendChild(li);
  }

  // Patrones visuales tomados del detector móvil (email_highlight_screen.dart).
  // Se muestran como orientación y se contrastan con las reglas I1-I11 del backend.
  var EMAIL_HIGHLIGHT_RULES = [
    { code: 'I1', label: 'Urgencia artificial', description: 'Puede presionar para que actúes sin verificar.', pattern: '\\b(?:hoy mismo|último aviso|urgente|inmediatamente|en las próximas 24 horas|plazo de hoy)\\b' },
    { code: 'I5', label: 'Instalación o descarga', description: 'Pide instalar software o descargar una supuesta herramienta.', pattern: '\\b(?:instala|descarga e instala|aplicación de seguridad|programa de verificación)\\b' },
    { code: 'I9', label: 'Datos personales', description: 'Menciona cédula, identidad o datos personales que no debes entregar sin verificar.', pattern: '\\b(?:cédula|documento de identidad|datos personales|número de identidad|foto de tu documento)\\b' },
    { code: 'I10', label: 'Pago o transferencia', description: 'Menciona pagos, depósitos, transferencias o criptomonedas.', pattern: '\\b(?:pago|pagar|depósito|transferencia|criptomoneda|bitcoin|costo de trámite)\\b' },
    { code: 'I6', label: 'Premio o beneficio inesperado', description: 'Ofrece premios, bonos o reembolsos que podrían ser un gancho.', pattern: '\\b(?:premio|ganaste|bono|reembolso|devolución inesperada|beneficio exclusivo)\\b' },
    { code: 'I3', label: 'Claves y credenciales', description: 'Menciona claves, contraseñas, PIN, tokens o códigos de acceso.', pattern: '\\b(?:clave|contraseña|password|pin|token|tarjeta bancaria|código de acceso)\\b' },
    { code: 'I8', label: 'Amenaza o bloqueo', description: 'Menciona suspensión, bloqueo, multas o pérdida de beneficios.', pattern: '\\b(?:suspensión|suspendido|bloqueo|bloquear|multa|embargo|pérdida de beneficios|ser cancelado)\\b' },
    { code: 'I11', label: 'Código QR', description: 'Solicita escanear un QR cuyo destino debe verificarse antes de abrirlo.', pattern: '\\b(?:código qr|escanea el qr|escanea este código)\\b' }
  ];

  var EMAIL_HIGHLIGHT_EXPLANATIONS = {
    I2: 'El destino del enlace no está en la lista de dominios permitidos. No lo abras; verifica el portal escribiendo su dirección manualmente.',
    I4: 'El enlace puede estar acortado o mostrar un texto distinto de su destino real. No lo abras desde el mensaje.',
    I7: 'El remitente no coincide con un dominio reconocido o el campo Reply-To es distinto. Comprueba la dirección completa.'
  };

  function buildEmailHighlightSource(email) {
    email = email || {};
    var parts = [];
    if (email.remitente) parts.push('Remitente: ' + email.remitente);
    if (email.asunto) parts.push('Asunto: ' + email.asunto);
    var body = email.cuerpo_neutralizado || email.cuerpo || '';
    if (body) parts.push('Contenido del mensaje:\n' + body);
    return parts.join('\n\n') || 'No se pudo recuperar el texto del correo.';
  }

  function collectEmailHighlightMatches(source, email, result) {
    var candidates = [];
    var indicators = Array.isArray(result && result.indicios) ? result.indicios : [];
    var detectedCodes = new Set(indicators.map(function (item) { return String(item.codigo || '').toUpperCase(); }));

    function add(start, end, code, label, description, detected) {
      if (start < 0 || end <= start || end > source.length) return;
      candidates.push({ start: start, end: end, code: code || '', label: label || 'Fragmento para revisar',
        description: description || 'Revisa este fragmento dentro del contexto del mensaje.', detected: !!detected });
    }

    EMAIL_HIGHLIGHT_RULES.forEach(function (rule) {
      var regex = new RegExp(rule.pattern, 'gi');
      var match;
      while ((match = regex.exec(source)) !== null) {
        add(match.index, match.index + match[0].length, rule.code, rule.label,
          rule.description, detectedCodes.has(rule.code));
        if (match[0].length === 0) regex.lastIndex++;
      }
    });

    // Cuando el motor ya entregó evidencia textual exacta, también la marcamos.
    indicators.forEach(function (item) {
      var evidence = String(item.evidencia || '').trim();
      if (!evidence || evidence.length > 220) return;
      var index = source.toLocaleLowerCase().indexOf(evidence.toLocaleLowerCase());
      if (index >= 0) {
        add(index, index + evidence.length, String(item.codigo || '').toUpperCase(),
          item.nombre || 'Evidencia del análisis', item.explicacion || item.evidencia, true);
      }
    });

    // Resalta los destinos no permitidos/acortados si el texto neutralizado los contiene.
    (Array.isArray(email && email.enlaces) ? email.enlaces : []).forEach(function (link) {
      var suspiciousDomain = link && (link.es_dominio_permitido === false || link.es_acortador === true);
      var disguised = !!(email && email.enlace_disfrazado);
      if (!suspiciousDomain && !disguised) return;
      var values = [link.url_neutralizada, link.texto_visible].filter(Boolean);
      values.forEach(function (value) {
        value = String(value);
        var index = source.toLocaleLowerCase().indexOf(value.toLocaleLowerCase());
        if (index >= 0) {
          var code = link.es_acortador || disguised ? 'I4' : 'I2';
          add(index, index + value.length, code,
            code === 'I4' ? 'Enlace acortado u oculto' : 'Dominio de enlace no verificado',
            EMAIL_HIGHLIGHT_EXPLANATIONS[code], detectedCodes.has(code));
        }
      });
    });

    // Si el remitente o un adjunto es la evidencia y no aparece en el cuerpo,
    // se conserva como explicación de metadatos en la lista de hallazgos.
    var unique = new Map();
    candidates.forEach(function (item) {
      var key = [item.start, item.end, item.code].join(':');
      if (!unique.has(key)) unique.set(key, item);
    });
    return Array.from(unique.values()).sort(function (a, b) {
      return a.start - b.start || (b.end - b.start) - (a.end - a.start);
    });
  }

  function renderEmailHighlights(email, result) {
    var preview = document.getElementById('correoMarcado');
    var summary = document.getElementById('correoMarcadoResumen');
    if (!preview || !summary) return;

    var source = buildEmailHighlightSource(email);
    var matches = collectEmailHighlightMatches(source, email || {}, result || {});
    preview.textContent = '';

    var cursor = 0;
    var rendered = [];
    matches.forEach(function (item) {
      if (item.start < cursor) return;
      if (item.start > cursor) preview.appendChild(document.createTextNode(source.slice(cursor, item.start)));
      var mark = document.createElement('mark');
      mark.className = 'email-highlight-mark ' + (item.detected ? 'is-detected' : 'is-pattern');
      mark.textContent = source.slice(item.start, item.end);
      mark.title = (item.code ? item.code + ' · ' : '') + item.label + '. ' + item.description;
      preview.appendChild(mark);
      cursor = item.end;
      rendered.push(item);
    });
    if (cursor < source.length) preview.appendChild(document.createTextNode(source.slice(cursor)));

    var confirmed = rendered.filter(function (item) { return item.detected; }).length;
    var contextual = rendered.length - confirmed;
    if (!rendered.length) {
      summary.textContent = 'No se encontraron frases para resaltar. Revise igualmente el remitente, los enlaces y los archivos adjuntos.';
    } else {
      summary.textContent = rendered.length + ' partes marcadas. ' + confirmed + ' coinciden con señales del análisis' +
        (contextual ? ' y ' + contextual + ' requieren revisar el contexto.' : '.');
    }
  }

  function renderResult(result) {
    var panel = document.getElementById('veredictoPanel');
    var phishing = result.es_phishing === true;
    var indicators = Array.isArray(result.indicios) ? result.indicios : [];
    renderEmailHighlights(window.correoVigiaActual || {}, result);

    if (panel) {
      panel.classList.toggle('veredicto--alerta', phishing);
      panel.classList.toggle('veredicto--limpio', !phishing);
    }
    var title = document.getElementById('resultadoAnalisis');
    var summary = document.getElementById('resumenAnalisis');
    var count = document.getElementById('totalIndicios');
    var nextAction = document.getElementById('resultadoAcciones');
    if (title) title.textContent = phishing
      ? 'Posible phishing detectado'
      : 'No se detectaron señales de phishing';
    if (summary) summary.textContent = phishing
      ? 'Vigía encontró ' + indicators.length + ' señales que debe revisar.'
      : 'No hubo coincidencias en las reglas. Esto no garantiza que el mensaje sea legítimo.';
    if (count) count.textContent = indicators.length +
      (indicators.length === 1 ? ' indicio detectado' : ' indicios detectados');
    if (nextAction) nextAction.textContent = phishing
      ? 'No responda. No abra enlaces ni adjuntos. No comparta claves o códigos. Reporte el mensaje usando los canales oficiales de esta página.'
      : 'No se encontraron señales conocidas. Aun así, verifique cualquier solicitud importante entrando directamente a www.iess.gob.ec.';

    if (window.VigiaAvatar && typeof window.VigiaAvatar.explicarAnalisis === 'function') {
      window.VigiaAvatar.explicarAnalisis(result);
    }
  }

  async function analyzeEmail() {
    if (analysisRunning) return;
    var email = window.correoVigiaActual;
    if (!email) {
      setProgress(0, 'Primero debe cargar y leer un correo en el paso uno.');
      showWindow(1);
      return;
    }

    analysisRunning = true;
    var button = document.getElementById('btnAnalizar');
    var list = document.getElementById('listaComprobaciones');
    button.disabled = true;
    button.textContent = 'Analizando…';
    list.textContent = '';
    addListItem(list, 'Integridad del mensaje', 'El backend verificará la firma HMAC antes de continuar.');
    addListItem(list, 'Reglas determinísticas I1–I11', 'El motor local comprobará indicadores en remitente, enlaces, texto y adjuntos.');
    addListItem(list, 'Clasificador ONNX', 'Se consultará su disponibilidad; su salida es complementaria.');
    setProgress(4, 'Preparando el objeto firmado…');
    document.dispatchEvent(new CustomEvent('vigia:analisis-paso', { detail: { estado: 'analizando' } }));
    if (window.VigiaAvatar && typeof window.VigiaAvatar.expandir === 'function') window.VigiaAvatar.expandir();
    if (window.VigiaVoz) window.VigiaVoz.detener();

    try {
      // El backend procesa la solicitud completa. La barra acompaña visualmente
      // las etapas mientras llega la respuesta, sin afirmar que hay streaming por regla.
      var requestPromise = window.VigiaAPI.analizarCorreo(email).then(
        function (response) { return { ok: true, response: response }; },
        function (error) { return { ok: false, error: error }; }
      );
      await animateAnalysisProgress();
      var requestResult = await requestPromise;
      if (!requestResult.ok) throw requestResult.error;

      var response = requestResult.response;
      var result = response.resultado || {};
      var indicators = Array.isArray(result.indicios) ? result.indicios : [];
      var model = result.modelo || {};

      list.textContent = '';
      addListItem(list, 'Integridad del mensaje', result.integridad_paso1_verificada
        ? 'Firma HMAC verificada correctamente.'
        : 'No se confirmó la firma HMAC.');
      addListItem(list, 'Reglas determinísticas I1–I11',
        indicators.length + (indicators.length === 1 ? ' indicio detectado.' : ' indicios detectados.'));
      indicators.forEach(function (item) {
        addListItem(list, (item.codigo || '') + ' · ' + (item.nombre || 'Indicio'),
          (item.explicacion || '') +
          (item.evidencia ? ' Evidencia: ' + item.evidencia : '') +
          (item.consejo ? ' Recomendación: ' + item.consejo : ''));
      });
      if (!indicators.length) {
        addListItem(list, 'Sin coincidencias determinísticas', 'La ausencia de coincidencias no demuestra legitimidad.');
      }
      addListItem(list, 'Modelo ONNX', model.modelo_ml_disponible
        ? 'Disponible; la estimación es complementaria.'
        : 'No disponible; se conserva el análisis basado en reglas.');

      await animateProgress(84, 94, 1700, 'Resultado recibido. Preparando la explicación…');
      renderResult(result);
      await animateProgress(94, 100, 1200, 'Análisis completado.');
      showWindow(4);
      document.dispatchEvent(new CustomEvent('vigia:resultado', {
        detail: { es_phishing: result.es_phishing === true }
      }));
    } catch (error) {
      setProgress(0, 'No se pudo completar el análisis: ' + (error && error.message ? error.message : 'error desconocido'));
    } finally {
      analysisRunning = false;
      button.disabled = false;
      button.textContent = 'Iniciar análisis local →';
    }
  }

  document.querySelectorAll('[data-ir-paso]').forEach(function (button) {
    button.addEventListener('click', function () { showWindow(Number(button.dataset.irPaso)); });
  });

  window.mostrarVentana = showWindow;
  window.analizarCorreo = analyzeEmail;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { showWindow(1); });
  } else {
    showWindow(1);
  }
})();