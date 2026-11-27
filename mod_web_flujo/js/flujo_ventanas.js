/* Navegación y resultados de la aplicación integrada. */
(function () {
  'use strict';

  let analisisEnCurso = false;

  function mostrarVentana(numero) {
    if (!Number.isInteger(numero) || numero < 1 || numero > 4) return;
    document.querySelectorAll('main .paso').forEach(function (ventana) {
      ventana.classList.toggle('ventana-activa', ventana.id === 'ventana' + numero);
      ventana.classList.toggle('ventana-oculta', ventana.id !== 'ventana' + numero);
    });
    document.querySelectorAll('[data-ir-paso]').forEach(function (boton) {
      const activo = Number(boton.dataset.irPaso) === numero;
      boton.classList.toggle('paso-activo', activo);
      if (activo) boton.setAttribute('aria-current', 'step');
      else boton.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function actualizarProgreso(valor, texto) {
    document.getElementById('barraProgreso').value = valor;
    document.getElementById('porcentajeProgreso').textContent = valor + ' %';
    document.getElementById('estadoAnalisis').textContent = texto;
  }



  function esperar(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function animarProgreso(desde, hasta, duracion, texto) {
    const pasos = Math.max(1, Math.ceil(duracion / 65));
    for (let paso = 1; paso <= pasos; paso++) {
      const valor = Math.round(desde + (hasta - desde) * (paso / pasos));
      actualizarProgreso(valor, texto);
      await esperar(duracion / pasos);
    }
  }

  function agregarElemento(lista, titulo, detalle) {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = titulo;
    li.appendChild(strong);
    if (detalle) {
      const p = document.createElement('p');
      p.textContent = detalle;
      li.appendChild(p);
    }
    lista.appendChild(li);
  }

  function mostrarCanales(canales) {
    const lista = document.getElementById('listaCanales');
    lista.textContent = '';
    const entradas = Object.entries(canales || {});
    if (entradas.length === 0) {
      agregarElemento(lista, 'Canales no disponibles', 'Consulte el portal institucional escribiendo la dirección directamente en el navegador.');
      return;
    }
    entradas.forEach(function (par) {
      const valor = Array.isArray(par[1]) ? par[1].join(' / ') : String(par[1]);
      agregarElemento(lista, par[0].replaceAll('_', ' '), valor);
    });
  }

  async function narrar(texto) {
    if (!window.VigiaVoz || typeof window.VigiaVoz.hablar !== 'function') return;
    await new Promise(function (resolve) {
      var terminado = false;
      var finalizar = function () {
        if (terminado) return;
        terminado = true;
        document.removeEventListener('vigia:voz-fin', finalizar);
        resolve();
      };
      document.addEventListener('vigia:voz-fin', finalizar);
      window.VigiaVoz.hablar(texto);
      window.setTimeout(finalizar, Math.max(5000, texto.length * 100));
    });
  }

  async function narrarResultado(resultado) {
    const indicios = resultado.indicios || [];
    await narrar('El análisis ha finalizado. Le explicaré los hallazgos que detectó el motor de seguridad.');
    if (indicios.length) {
      for (let i = 0; i < indicios.length; i++) {
        const item = indicios[i];
        const texto = 'Indicio ' + (i + 1) + ' de ' + indicios.length + '. Código ' +
          (item.codigo || '') + '. ' + (item.nombre || 'Señal detectada') + '. ' +
          (item.explicacion || '') +
          (item.evidencia ? ' Evidencia encontrada: ' + item.evidencia : '') +
          (item.consejo ? ' Recomendación: ' + item.consejo : '');
        if (window.VigiaAvatar3D) window.VigiaAvatar3D.estado('alerta');
        await narrar(texto);
      }
    } else {
      await narrar('No se encontraron coincidencias determinísticas en las reglas I uno a I once. Esto no garantiza que el correo sea legítimo. Compruebe el remitente por un canal oficial.');
    }
    if (typeof resultado.probabilidad_ml === 'number') {
      await narrar('El clasificador de aprendizaje automático produjo una estimación de ' +
        resultado.probabilidad_ml + ' por ciento. Esta cifra es complementaria, no está calibrada y no decide por sí sola el veredicto.');
    } else {
      await narrar('El clasificador de aprendizaje automático no entregó una estimación disponible. El veredicto se basa en las reglas determinísticas.');
    }
    await narrar(resultado.guion_avatar || 'No abra enlaces ni entregue datos personales. Verifique siempre por canales oficiales.');
  }

  function mostrarResultado(resultado) {
    const panel = document.getElementById('veredictoPanel');
    const lista = document.getElementById('indicadoresEncontrados');
    lista.textContent = '';

    const esPhishing = resultado.es_phishing === true;
    panel.classList.toggle('veredicto--alerta', esPhishing);
    panel.classList.toggle('veredicto--limpio', !esPhishing);

    document.getElementById('resultadoAnalisis').textContent =
      esPhishing ? 'Se detectaron señales de posible phishing' : 'No se detectaron indicios determinísticos';
    document.getElementById('resumenAnalisis').textContent =
      resultado.regla_negocio || resultado.guion_avatar ||
      'El resultado se basa en los indicios detectados por el motor local.';

    if (resultado.indicios && resultado.indicios.length) {
      resultado.indicios.forEach(function (indicio) {
        const detalle = (indicio.explicacion || '') +
          (indicio.evidencia ? ' Evidencia: ' + indicio.evidencia : '') +
          (indicio.consejo ? ' Recomendación: ' + indicio.consejo : '');
        agregarElemento(lista, (indicio.codigo || '') + ' · ' + (indicio.nombre || 'Indicio'), detalle);
      });
    } else {
      agregarElemento(lista, 'Sin coincidencias en las reglas I1–I11', 'Esto no garantiza que el mensaje sea legítimo. Revise el remitente y verifique cualquier solicitud por un canal oficial.');
    }

    const probabilidad = resultado.probabilidad_ml;
    document.getElementById('probabilidadML').textContent =
      typeof probabilidad === 'number'
        ? probabilidad.toFixed(1) + ' % de probabilidad estimada por el clasificador'
        : 'No disponible: el clasificador ONNX no pudo producir una estimación.';
    document.getElementById('notaML').textContent =
      resultado.probabilidad_ml_nota ||
      'La estimación ML es complementaria y no sustituye las reglas de seguridad.';
    document.getElementById('recomendacionesAnalisis').textContent =
      resultado.guion_avatar ||
      (esPhishing
        ? 'No abra enlaces ni adjuntos. No comparta claves ni datos personales. Verifique por los canales oficiales.'
        : 'Mantenga la precaución. La ausencia de indicios no demuestra que el mensaje sea auténtico.');
    mostrarCanales(resultado.canales_oficiales);

    if (window.VigiaAvatar && typeof window.VigiaAvatar.explicar === 'function') {
      if (typeof window.VigiaAvatar.explicarAnalisis === 'function') {
        window.VigiaAvatar.explicarAnalisis(resultado);
      } else {
        window.VigiaAvatar.explicar({
          es_phishing: esPhishing,
          indicios: resultado.indicios || []
        });
      }
    }
    document.dispatchEvent(new CustomEvent('vigia:resultado', {
      detail: { es_phishing: esPhishing }
    }));
  }

  async function analizarCorreo() {
    if (analisisEnCurso) return;
    const correo = window.correoVigiaActual;
    if (!correo) {
      document.getElementById('estadoAnalisis').textContent = 'Primero debe cargar y leer un correo en el paso 1.';
      mostrarVentana(1);
      return;
    }

    analisisEnCurso = true;
    const boton = document.getElementById('btnAnalizar');
    boton.disabled = true;
    boton.textContent = 'Analizando…';
    const lista = document.getElementById('listaComprobaciones');
    lista.textContent = '';
    agregarElemento(lista, 'Integridad del correo', 'El servidor comprobó la firma HMAC antes de analizar el mensaje.');
    agregarElemento(lista, 'Reglas I1–I11', 'El motor revisará las señales determinísticas del correo.');
    agregarElemento(lista, 'Clasificador ML', 'El modelo ONNX aportará una señal complementaria si está disponible.');
    if (window.VigiaAvatar3D) window.VigiaAvatar3D.estado('analizando');
    document.dispatchEvent(new CustomEvent('vigia:analisis-paso', { detail: { estado: 'analizando' } }));
    actualizarProgreso(0, 'Preparando la revisión segura…');

    try {
      const solicitudAnalisis = window.VigiaAPI.analizarCorreo(correo).then(
        function (respuesta) { return { correcto: true, respuesta: respuesta }; },
        function (error) { return { correcto: false, error: error }; }
      );
      await animarProgreso(0, 22, 700, 'Leyendo el correo y comprobando su integridad…');
      await animarProgreso(22, 48, 850, 'Revisando el remitente, el asunto y el contenido…');
      await animarProgreso(48, 72, 900, 'Analizando enlaces, urgencia y solicitudes de datos…');
      const estadoSolicitud = await solicitudAnalisis;
      if (!estadoSolicitud.correcto) throw estadoSolicitud.error;
      const respuesta = estadoSolicitud.respuesta;
      const datosResultado = respuesta.resultado || {};
      const indiciosEncontrados = datosResultado.indicios || [];
      lista.textContent = '';
      agregarElemento(lista, 'Integridad del correo', datosResultado.integridad_paso1_verificada
        ? 'Firma HMAC verificada correctamente.'
        : 'No se confirmó la firma HMAC del mensaje.');
      agregarElemento(lista, 'Reglas determinísticas I1–I11',
        indiciosEncontrados.length + ' indicio(s) encontrados por el motor.');
      if (indiciosEncontrados.length) {
        indiciosEncontrados.forEach(function (item) {
          agregarElemento(lista, (item.codigo || '') + ' · ' + (item.nombre || 'Indicio'),
            (item.explicacion || '') +
            (item.evidencia ? ' Evidencia: ' + item.evidencia : '') +
            (item.consejo ? ' Recomendación: ' + item.consejo : ''));
        });
      } else {
        agregarElemento(lista, 'Sin coincidencias I1–I11',
          'No se detectaron indicios determinísticos; esto no garantiza legitimidad.');
      }
      const modeloResultado = datosResultado.modelo || {};
      agregarElemento(lista, 'Modelo ONNX',
        modeloResultado.modelo_ml_disponible
          ? 'Modelo disponible; su salida es complementaria.'
          : 'Modelo no disponible; el análisis conserva el resultado por reglas.');
      document.dispatchEvent(new CustomEvent('vigia:analisis-resultados', {
        detail: { total: indiciosEncontrados.length, es_phishing: datosResultado.es_phishing === true }
      }));

      if (window.VigiaAvatar3D) window.VigiaAvatar3D.estado(respuesta.resultado.es_phishing ? 'alerta' : 'acierto');

      await animarProgreso(72, 96, 550, 'Preparando el resultado y las recomendaciones…');
      mostrarResultado(respuesta.resultado);
      actualizarProgreso(100, 'Análisis completado.');
      mostrarVentana(4);
      await narrarResultado(respuesta.resultado);
    } catch (error) {
      actualizarProgreso(0, 'No se pudo completar el análisis: ' + error.message);
    } finally {
      analisisEnCurso = false;
      boton.disabled = false;
      boton.textContent = 'Iniciar análisis real';
    }
  }

  async function ejecutarAuditoriaPractica() {
    const boton = document.getElementById('btnAuditoria');
    const estado = document.getElementById('estadoAuditoria');
    const contenedor = document.getElementById('resultadosAuditoria');
    boton.disabled = true;
    estado.textContent = 'Procesando los cinco correos de ejemplo…';
    contenedor.textContent = '';

    try {
      const datos = await window.VigiaAPI.auditoriaPractica();
      const tabla = document.createElement('table');
      tabla.className = 'tabla-auditoria';
      const thead = document.createElement('thead');
      const filaCabecera = document.createElement('tr');
      ['Archivo', 'Remitente', 'Veredicto', 'Indicios', 'SHA-256'].forEach(function (titulo) {
        const th = document.createElement('th');
        th.textContent = titulo;
        filaCabecera.appendChild(th);
      });
      thead.appendChild(filaCabecera);
      tabla.appendChild(thead);

      const tbody = document.createElement('tbody');
      (datos.resultados || []).forEach(function (resultado) {
        const fila = document.createElement('tr');
        [
          resultado.archivo,
          resultado.remitente,
          resultado.veredicto,
          (resultado.indicios || []).join(', ') || 'Ninguno',
          resultado.huella_sha256
        ].forEach(function (valor) {
          const td = document.createElement('td');
          td.textContent = String(valor || '—');
          fila.appendChild(td);
        });
        tbody.appendChild(fila);
      });
      tabla.appendChild(tbody);
      contenedor.appendChild(tabla);

      estado.textContent = 'Auditoría finalizada: ' + datos.total_probados + ' de ' + datos.total_esperados + ' archivos procesados.';
      if (datos.errores && datos.errores.length) {
        const p = document.createElement('p');
        p.textContent = 'Archivos con errores: ' + datos.errores.map(function (e) {
          return e.archivo + ' (' + e.error + ')';
        }).join('; ');
        contenedor.appendChild(p);
      }
    } catch (error) {
      estado.textContent = error.message;
    } finally {
      boton.disabled = false;
    }
  }

  window.mostrarVentana = mostrarVentana;
  window.analizarCorreo = analizarCorreo;
  window.ejecutarAuditoriaPractica = ejecutarAuditoriaPractica;
})();
