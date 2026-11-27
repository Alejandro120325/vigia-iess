/*
 * Integración visual de Vigía IESS.
 * Aporta gauge circular, nivel de riesgo visual y tarjetas de estado.
 * No reemplaza el backend ni altera la estimación complementaria del modelo ML.
 */
(function () {
  'use strict';

  if (window.__VIGIA_DEMO_VISUAL_INSTALADO__) return;
  window.__VIGIA_DEMO_VISUAL_INSTALADO__ = true;

  var ultimoResultado = null;
  var intervaloAnimacion = null;

  function hablarPasoAside(boton) {
    var paso = boton.closest('.aside-paso');
    var texto = paso && paso.querySelector('.aside-paso__txt span');
    if (texto && window.VigiaVoz && typeof window.VigiaVoz.hablar === 'function') {
      window.VigiaVoz.hablar(texto.textContent);
    }
  }

  function actualizarAside(numero) {
    document.querySelectorAll('.aside-paso').forEach(function (item) {
      var paso = Number(item.dataset.pasoAside);
      item.classList.toggle('activo', paso === numero);
      item.classList.toggle('completado', paso < numero);
    });
  }

  function crear(tag, clase, texto) {
    var nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined && texto !== null) nodo.textContent = texto;
    return nodo;
  }

  function calcularNivel(indicios, esPhishing) {
    var total = Array.isArray(indicios) ? indicios.length : 0;
    if (total === 0) return esPhishing ? 35 : 0;
    if (total === 1) return 35;
    // Escala heurística tomada del componente visual del equipo.
    // Se etiqueta como índice visual, nunca como probabilidad estadística.
    return Math.min(95, 70 + (total * 5));
  }

  function clasificarNivel(porcentaje) {
    if (porcentaje >= 65) return { clase: 'is-high', texto: 'Riesgo elevado', color: '#c84a4a' };
    if (porcentaje >= 30) return { clase: 'is-medium', texto: 'Precaución', color: '#c18a24' };
    return { clase: 'is-low', texto: 'Riesgo bajo', color: '#26845b' };
  }

  function prepararDashboard() {
    var ventana = document.getElementById('ventana4');
    var panel = document.getElementById('veredictoPanel');
    if (!ventana || !panel) return null;

    var existente = document.getElementById('vigiaResumenVisual');
    if (existente) return existente;

    var dashboard = crear('section', 'vigia-visual-result');
    dashboard.id = 'vigiaResumenVisual';
    dashboard.setAttribute('aria-label', 'Resumen visual del nivel de riesgo');

    var gaugeWrap = crear('div', 'vigia-visual-gauge-wrap');
    var gauge = crear('div', 'vigia-visual-gauge');
    gauge.id = 'vigiaGauge';
    gauge.setAttribute('role', 'img');
    gauge.setAttribute('aria-label', 'Índice visual de riesgo: pendiente');
    var center = crear('div', 'vigia-visual-gauge-center');
    var value = crear('strong', 'vigia-visual-value', '—%');
    value.id = 'vigiaGaugeValue';
    var label = crear('span', 'vigia-visual-gauge-label', 'Riesgo estimado');
    center.appendChild(value);
    center.appendChild(label);
    gauge.appendChild(center);
    gaugeWrap.appendChild(gauge);

    var info = crear('div', 'vigia-visual-info');
    var eyebrow = crear('p', 'vigia-visual-eyebrow', 'RESUMEN DEL ANÁLISIS');
    var title = crear('h3', 'vigia-visual-title', 'Esperando el análisis');
    title.id = 'vigiaGaugeTitle';
    var description = crear('p', 'vigia-visual-description', 'El nivel se calculará cuando el motor termine de revisar el correo.');
    description.id = 'vigiaGaugeDescription';
    var note = crear('p', 'vigia-visual-note', 'Índice heurístico basado en la cantidad de indicios determinísticos; no representa una probabilidad estadística.');
    info.appendChild(eyebrow);
    info.appendChild(title);
    info.appendChild(description);
    info.appendChild(note);

    dashboard.appendChild(gaugeWrap);
    dashboard.appendChild(info);

    var cards = crear('div', 'vigia-visual-checks');
    cards.id = 'vigiaResumenChecks';
    [
      ['integridad', 'Integridad del mensaje', 'Pendiente'],
      ['reglas', 'Reglas I1–I11', 'Pendiente'],
      ['modelo', 'Modelo ONNX', 'Pendiente']
    ].forEach(function (item) {
      var card = crear('article', 'vigia-visual-check is-pending');
      card.dataset.visualCheck = item[0];
      var dot = crear('span', 'vigia-visual-check-dot', '•');
      var content = crear('div', 'vigia-visual-check-content');
      var strong = crear('strong', '', item[1]);
      var detail = crear('span', '', item[2]);
      detail.dataset.visualCheckDetail = item[0];
      content.appendChild(strong);
      content.appendChild(detail);
      card.appendChild(dot);
      card.appendChild(content);
      cards.appendChild(card);
    });
    dashboard.appendChild(cards);

    panel.parentNode.insertBefore(dashboard, panel);
    return dashboard;
  }

  function actualizarCheck(clave, estado, detalle) {
    var card = document.querySelector('[data-visual-check="' + clave + '"]');
    var text = document.querySelector('[data-visual-check-detail="' + clave + '"]');
    if (!card || !text) return;
    card.classList.remove('is-pending', 'is-ok', 'is-warning');
    card.classList.add(estado);
    text.textContent = detalle;
  }

  function contarHasta(destino) {
    var label = document.getElementById('vigiaGaugeValue');
    if (!label) return;
    if (intervaloAnimacion) window.clearInterval(intervaloAnimacion);
    var actual = 0;
    var pasos = Math.max(1, Math.ceil(destino / 45));
    var espera = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 24;
    if (espera === 0) {
      label.textContent = destino + '%';
      return;
    }
    intervaloAnimacion = window.setInterval(function () {
      actual = Math.min(destino, actual + pasos);
      label.textContent = actual + '%';
      if (actual >= destino) {
        window.clearInterval(intervaloAnimacion);
        intervaloAnimacion = null;
      }
    }, espera);
  }

  function pintarResultado(resultado) {
    if (!resultado || typeof resultado !== 'object') return;
    ultimoResultado = resultado;
    var dashboard = prepararDashboard();
    if (!dashboard) return;

    var indicios = Array.isArray(resultado.indicios) ? resultado.indicios : [];
    var total = indicios.length;
    var score = calcularNivel(indicios, resultado.es_phishing === true);
    var nivel = clasificarNivel(score);
    var gauge = document.getElementById('vigiaGauge');
    var title = document.getElementById('vigiaGaugeTitle');
    var description = document.getElementById('vigiaGaugeDescription');

    gauge.classList.remove('is-low', 'is-medium', 'is-high');
    gauge.classList.add(nivel.clase);
    gauge.style.setProperty('--vigia-risk', score + '%');
    gauge.setAttribute('aria-label', 'Índice visual de riesgo: ' + score + ' por ciento. ' + nivel.texto);
    title.textContent = nivel.texto;
    description.textContent = total === 0
      ? 'Las reglas I1–I11 no encontraron indicios determinísticos. Esto no garantiza que el mensaje sea legítimo.'
      : 'Se detectaron ' + total + (total === 1 ? ' indicio. ' : ' indicios. ') + 'Revisa las evidencias y sigue las recomendaciones de Vigía.';
    contarHasta(score);

    var hmac = resultado.integridad_paso1_verificada === true;
    actualizarCheck('integridad', hmac ? 'is-ok' : 'is-warning', hmac ? 'Firma HMAC verificada' : 'No confirmada');
    actualizarCheck('reglas', total > 0 ? 'is-warning' : 'is-ok', total + (total === 1 ? ' indicio detectado' : ' indicios detectados'));

    var modelo = resultado.modelo || {};
    if (modelo.modelo_ml_disponible === true) {
      var mlText = 'Clasificador disponible';
      if (typeof resultado.probabilidad_ml === 'number') {
        mlText += ' · ' + resultado.probabilidad_ml.toFixed(1) + '%';
      }
      actualizarCheck('modelo', 'is-ok', mlText);
    } else {
      actualizarCheck('modelo', 'is-warning', 'Sin estimación ONNX');
    }
  }

  function estadoInicial() {
    prepararDashboard();
    var section = document.getElementById('ventana3');
    if (section && !document.getElementById('vigia-live-risk')) {
      var host = section.querySelector('.analysis-status-card');
      if (host) {
        var live = crear('div', 'vigia-live-risk');
        live.id = 'vigia-live-risk';
        live.innerHTML = '<div class="vigia-live-risk-head"><strong>Comprobaciones en curso</strong><span id="vigia-live-risk-state">Preparado · 0 %</span></div><div class="vigia-live-risk-track"><span id="vigia-live-risk-bar" role="progressbar" aria-label="Avance de comprobaciones" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></span></div><p>El avance acompaña las etapas de revisión y espera la respuesta real del motor local.</p>';
        host.parentNode.insertBefore(live, host.nextSibling);
      }
    }
  }

  function activar() {
    estadoInicial();

    document.querySelectorAll('.aside-paso__btn').forEach(function (boton) {
      boton.addEventListener('click', function () { hablarPasoAside(boton); });
    });
    actualizarAside(1);
    document.addEventListener('vigia:ventana', function (event) {
      var paso = Number(event.detail && event.detail.paso);
      if (paso >= 1 && paso <= 3) actualizarAside(paso);
      else if (paso === 4) actualizarAside(3);
    });

    // El flujo principal entrega el resultado real al avatar. Lo envolvemos sin
    // reemplazar el asistente, su voz, sus subtítulos ni sus controles.
    if (window.VigiaAvatar && typeof window.VigiaAvatar.explicarAnalisis === 'function' && !window.VigiaAvatar.explicarAnalisis.__vigiaVisualWrapped) {
      var original = window.VigiaAvatar.explicarAnalisis;
      var wrapped = function (resultado) {
        var respuesta = original.apply(this, arguments);
        pintarResultado(resultado);
        return respuesta;
      };
      wrapped.__vigiaVisualWrapped = true;
      window.VigiaAvatar.explicarAnalisis = wrapped;
    }

    document.addEventListener('vigia:analisis-paso', function (event) {
      var state = (event.detail && event.detail.estado) || 'analizando';
      var label = document.getElementById('vigia-live-risk-state');
      var bar = document.getElementById('vigia-live-risk-bar');
      if (label) label.textContent = state === 'analizando' ? 'Analizando' : 'Preparado';
      if (bar) bar.classList.toggle('is-active', state === 'analizando');
    });

    document.addEventListener('vigia:ventana', function (event) {
      if (event.detail && event.detail.paso === 4 && ultimoResultado) pintarResultado(ultimoResultado);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activar, { once: true });
  else activar();

  window.VigiaDemo = {
    pintarResultado: pintarResultado,
    calcularNivel: calcularNivel
  };
})();
