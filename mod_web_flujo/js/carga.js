/* Lectura del correo a través del backend seguro. */
(function () {
  'use strict';

  window.correoVigiaActual = null;

  function ponerTexto(id, valor, respaldo) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor || respaldo || 'No disponible';
  }

  function mostrarLista(id, elementos, construirTexto, vacio) {
    const lista = document.getElementById(id);
    if (!lista) return;
    lista.textContent = '';
    if (!elementos || elementos.length === 0) {
      const li = document.createElement('li');
      li.textContent = vacio;
      lista.appendChild(li);
      return;
    }
    elementos.forEach(function (dato) {
      const li = document.createElement('li');
      li.textContent = construirTexto(dato);
      lista.appendChild(li);
    });
  }

  async function validarCorreo() {
    const inputArchivo = document.getElementById('archivoCorreo');
    const areaTexto = document.getElementById('textoCorreo');
    const boton = document.getElementById('btnValidarCorreo');
    const mensaje = document.getElementById('mensajeCarga');
    const archivo = inputArchivo && inputArchivo.files ? inputArchivo.files[0] : null;
    const texto = areaTexto ? areaTexto.value.trim() : '';

    if (!archivo && !texto) {
      mensaje.textContent = 'Seleccione un PDF/EML o pegue el contenido de un correo.';
      return;
    }
    if (archivo && archivo.size > 10 * 1024 * 1024) {
      mensaje.textContent = 'El archivo supera el límite de 10 MB.';
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Leyendo correo…';
    mensaje.textContent = 'El servidor está extrayendo el mensaje sin abrir sus enlaces ni adjuntos.';

    try {
      const respuesta = await window.VigiaAPI.leerCorreo(archivo, texto);
      const correo = respuesta.correo;
      window.correoVigiaActual = correo;

      ponerTexto('remitente', correo.remitente, 'No identificado');
      ponerTexto('asunto', correo.asunto, 'Sin asunto');
      ponerTexto('fechaCorreo', correo.fecha, 'No especificada');
      ponerTexto('origenCorreo', correo.tipo_origen, 'No especificado');

      const cuerpo = document.getElementById('contenidoCorreoSeguro') || document.getElementById('contenidoCorreo');
      cuerpo.textContent = correo.cuerpo_neutralizado || correo.cuerpo || 'El mensaje no contiene texto legible.';
      ponerTexto('huellaCorreo', correo.huella_sha256, 'No disponible');

      mostrarLista(
        'listaEnlaces',
        correo.enlaces,
        function (enlace) {
          return (enlace.url_neutralizada || enlace.dominio || 'Destino no disponible') +
            ' · ' + (enlace.clasificacion_dominio || 'no_verificado') +
            (enlace.es_acortador ? ' · acortador' : '');
        },
        'No se han detectado enlaces.'
      );

      mostrarLista(
        'listaAdjuntos',
        correo.adjuntos,
        function (adjunto) {
          return (adjunto.nombre || 'Adjunto') + ' · ' +
            (adjunto.extension || 'sin extensión') + ' · ' +
            (adjunto.es_peligroso ? 'extensión de riesgo' : 'sin alerta por extensión');
        },
        'No se han identificado adjuntos.'
      );

      mensaje.textContent = 'Correo leído correctamente. Puede revisar el contenido antes de analizarlo.';
      mensaje.classList.add('mensaje--ok');
      if (typeof mostrarVentana === 'function') mostrarVentana(2);
    } catch (error) {
      mensaje.textContent = error.message;
      mensaje.classList.remove('mensaje--ok');
    } finally {
      boton.disabled = false;
      boton.textContent = 'Leer correo de forma segura';
    }
  }

  window.validarCorreo = validarCorreo;
})();
