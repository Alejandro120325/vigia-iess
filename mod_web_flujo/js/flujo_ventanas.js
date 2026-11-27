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
    if (progress) progress.value = value;
    if (label) label.textContent = value + ' %';
    if (status) status.textContent = text;
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
    setProgress(5, 'Preparando el correo para la revisión…');
    await animateProgress(5, 18, 620, 'Verificando la integridad del mensaje…');
    await animateProgress(18, 36, 680, 'Revisando remitente, asunto y contenido…');
    await animateProgress(36, 54, 680, 'Inspeccionando enlaces y dominios…');
    await animateProgress(54, 70, 680, 'Comprobando adjuntos y solicitudes de datos…');
    await animateProgress(70, 84, 680, 'Aplicando las reglas I1–I11 y consultando la señal ML…');
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

  function showChannels(channels) {
    var list = document.getElementById('listaCanales');
    list.textContent = '';
    var entries = Object.entries(channels || {});
    if (!entries.length) {
      addListItem(list, 'Canales no disponibles', 'Consulte el portal institucional escribiendo la dirección directamente en el navegador.');
      return;
    }
    entries.forEach(function (entry) {
      var value = Array.isArray(entry[1]) ? entry[1].join(' / ') : String(entry[1]);
      addListItem(list, entry[0].replaceAll('_', ' '), value);
    });
  }

  function renderResult(result) {
    var panel = document.getElementById('veredictoPanel');
    var list = document.getElementById('indicadoresEncontrados');
    var phishing = result.es_phishing === true;
    var indicators = Array.isArray(result.indicios) ? result.indicios : [];

    panel.classList.toggle('veredicto--alerta', phishing);
    panel.classList.toggle('veredicto--limpio', !phishing);
    document.getElementById('resultadoAnalisis').textContent = phishing
      ? 'Posible phishing detectado'
      : 'No se detectaron señales de phishing';
    document.getElementById('resumenAnalisis').textContent = phishing
      ? 'Vigía encontró ' + indicators.length + ' señal(es). La mascota te explicará cómo actuar.'
      : 'No hubo coincidencias en las reglas. Esto no garantiza que el mensaje sea legítimo.';
    document.getElementById('totalIndicios').textContent = indicators.length +
      (indicators.length === 1 ? ' indicio detectado' : ' indicios detectados');

    list.textContent = '';
    if (indicators.length) {
      indicators.forEach(function (item) {
        addListItem(list, (item.codigo || '') + ' · ' + (item.nombre || 'Indicio'),
          (item.explicacion || '') +
          (item.evidencia ? ' Evidencia: ' + item.evidencia : '') +
          (item.consejo ? ' Recomendación: ' + item.consejo : ''));
      });
    } else {
      addListItem(list, 'Sin coincidencias en las reglas I1–I11',
        'Esto no demuestra que el mensaje sea auténtico. Compruebe el remitente y cualquier solicitud por un canal oficial.');
    }

    document.getElementById('probabilidadML').textContent =
      typeof result.probabilidad_ml === 'number'
        ? result.probabilidad_ml.toFixed(1) + ' % de estimación complementaria del clasificador'
        : 'No disponible: el clasificador ONNX no produjo una estimación.';
    document.getElementById('notaML').textContent = result.probabilidad_ml_nota ||
      'La estimación ML es complementaria y no sustituye el resultado de las reglas determinísticas.';
    document.getElementById('recomendacionesAnalisis').textContent = result.guion_avatar ||
      'No abra enlaces ni adjuntos. No comparta claves ni códigos. Verifique cualquier trámite por canales oficiales.';
    showChannels(result.canales_oficiales);

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
    setProgress(12, 'Preparando el objeto firmado…');
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

      await animateProgress(84, 94, 420, 'Resultado recibido. Preparando la explicación…');
      renderResult(result);
      await animateProgress(94, 100, 360, 'Análisis completado.');
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

  async function runPracticeAudit() {
    var button = document.getElementById('btnAuditoria');
    var status = document.getElementById('estadoAuditoria');
    var output = document.getElementById('resultadosAuditoria');
    button.disabled = true;
    status.textContent = 'Procesando los correos de práctica…';
    output.textContent = '';

    try {
      var data = await window.VigiaAPI.auditoriaPractica();
      var table = document.createElement('table');
      table.className = 'tabla-auditoria';
      var head = document.createElement('thead');
      var headerRow = document.createElement('tr');
      ['Archivo', 'Remitente', 'Veredicto', 'Indicios', 'Huella SHA-256'].forEach(function (label) {
        var th = document.createElement('th');
        th.textContent = label;
        headerRow.appendChild(th);
      });
      head.appendChild(headerRow);
      table.appendChild(head);

      var body = document.createElement('tbody');
      (data.resultados || []).forEach(function (item) {
        var row = document.createElement('tr');
        [
          item.archivo, item.remitente, item.veredicto,
          (item.indicios || []).join(', ') || 'Ninguno', item.huella_sha256
        ].forEach(function (value) {
          var td = document.createElement('td');
          td.textContent = String(value || '—');
          row.appendChild(td);
        });
        body.appendChild(row);
      });
      table.appendChild(body);
      output.appendChild(table);
      status.textContent = 'Auditoría finalizada: ' + data.total_probados + ' de ' + data.total_esperados + ' correos procesados.';
      if (data.errores && data.errores.length) {
        var errors = document.createElement('p');
        errors.textContent = 'Archivos con errores: ' + data.errores.map(function (item) {
          return item.archivo + ' (' + item.error + ')';
        }).join('; ');
        output.appendChild(errors);
      }
    } catch (error) {
      status.textContent = error.message || 'No se pudo completar la auditoría.';
    } finally {
      button.disabled = false;
    }
  }

  document.querySelectorAll('[data-ir-paso]').forEach(function (button) {
    button.addEventListener('click', function () { showWindow(Number(button.dataset.irPaso)); });
  });

  window.mostrarVentana = showWindow;
  window.analizarCorreo = analyzeEmail;
  window.ejecutarAuditoriaPractica = runPracticeAudit;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { showWindow(1); });
  } else {
    showWindow(1);
  }
})();