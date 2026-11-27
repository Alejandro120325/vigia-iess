/* Lectura segura de archivos o texto y soporte de arrastrar/soltar. */
(function () {
  'use strict';

  window.correoVigiaActual = null;

  function setText(id, value, fallback) {
    var node = document.getElementById(id);
    if (node) node.textContent = value || fallback || 'No disponible';
  }

  function renderList(id, items, formatter, emptyText) {
    var list = document.getElementById(id);
    if (!list) return;
    list.textContent = '';
    if (!items || !items.length) {
      var li = document.createElement('li');
      li.textContent = emptyText;
      list.appendChild(li);
      return;
    }
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = formatter(item);
      list.appendChild(li);
    });
  }

  function selectedFile(input) {
    var file = input && input.files ? input.files[0] : null;
    var label = document.querySelector('.file-drop');
    var name = document.getElementById('archivoSeleccionado');
    if (name) name.textContent = file ? file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : 'Sin archivo seleccionado';
    if (label) label.classList.toggle('has-file', !!file);
    var clearButton = document.getElementById('btnQuitarArchivo');
    if (clearButton) clearButton.disabled = !file;
    var selectButton = document.getElementById('btnSeleccionarArchivo');
    if (selectButton) selectButton.textContent = file ? 'Cambiar archivo' : 'Subir archivo';
  }

  function configureDropArea() {
    var input = document.getElementById('archivoCorreo');
    var drop = document.querySelector('.file-drop');
    if (!input || !drop) return;
    input.addEventListener('change', function () {
      selectedFile(input);
      var message = document.getElementById('mensajeCarga');
      if (message && input.files && input.files[0]) message.textContent = 'Archivo listo. Pulsa «Leer correo de forma segura» para continuar.';
    });
    var selectButton = document.getElementById('btnSeleccionarArchivo');
    if (selectButton) selectButton.addEventListener('click', function () { input.click(); });
    var clearButton = document.getElementById('btnQuitarArchivo');
    if (clearButton) clearButton.addEventListener('click', function () {
      input.value = '';
      window.correoVigiaActual = null;
      selectedFile(input);
      setText('mensajeCarga', 'Archivo quitado. Puedes seleccionar otro correo.');
      var message = document.getElementById('mensajeCarga');
      if (message) message.classList.remove('mensaje--ok');
    });
    var clearText = document.getElementById('btnLimpiarTexto');
    if (clearText) clearText.addEventListener('click', function () {
      var textarea = document.getElementById('textoCorreo');
      if (textarea) textarea.value = '';
      setText('mensajeCarga', 'Texto eliminado.');
    });
    selectedFile(input);
    input.addEventListener('focus', function () { drop.classList.add('is-focused'); });
    input.addEventListener('blur', function () { drop.classList.remove('is-focused'); });

    ['dragenter', 'dragover'].forEach(function (eventName) {
      drop.addEventListener(eventName, function (event) {
        event.preventDefault();
        event.stopPropagation();
        drop.classList.add('is-dragging');
      });
    });
    ['dragleave', 'dragend'].forEach(function (eventName) {
      drop.addEventListener(eventName, function (event) {
        event.preventDefault();
        event.stopPropagation();
        drop.classList.remove('is-dragging');
      });
    });
    drop.addEventListener('drop', function (event) {
      event.preventDefault();
      event.stopPropagation();
      drop.classList.remove('is-dragging');
      var files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) return;
      var file = files[0];
      if (!/\.(pdf|eml)$/i.test(file.name)) {
        setText('mensajeCarga', 'Formato no permitido. Selecciona un archivo PDF o EML.');
        return;
      }
      var transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      selectedFile(input);
      setText('mensajeCarga', 'Archivo seleccionado. Pulsa «Leer correo de forma segura» para continuar.');
    });
  }

  async function validateEmail() {
    var input = document.getElementById('archivoCorreo');
    var textarea = document.getElementById('textoCorreo');
    var button = document.getElementById('btnValidarCorreo');
    var message = document.getElementById('mensajeCarga');
    var file = input && input.files ? input.files[0] : null;
    var text = textarea ? textarea.value.trim() : '';

    message.classList.remove('mensaje--ok');
    if (!file && !text) {
      message.textContent = 'Selecciona un PDF/EML o pega el contenido de un correo.';
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      message.textContent = 'El archivo supera el límite permitido de 10 MB.';
      return;
    }

    button.disabled = true;
    button.textContent = 'Leyendo correo…';
    message.textContent = 'El servidor está extrayendo el mensaje de forma segura.';

    try {
      var response = await window.VigiaAPI.leerCorreo(file, text);
      var email = response.correo;
      window.correoVigiaActual = email;

      setText('remitente', email.remitente, 'No identificado');
      setText('asunto', email.asunto, 'Sin asunto');
      setText('fechaCorreo', email.fecha, 'No especificada');
      setText('origenCorreo', email.tipo_origen, 'No especificado');

      var body = document.getElementById('contenidoCorreoSeguro') || document.getElementById('contenidoCorreo');
      if (body) body.textContent = email.cuerpo_neutralizado || email.cuerpo || 'El mensaje no contiene texto legible.';
      setText('huellaCorreo', email.huella_sha256, 'No disponible');

      renderList('listaEnlaces', email.enlaces, function (link) {
        return (link.url_neutralizada || link.dominio || 'Destino no disponible') +
          ' · ' + (link.clasificacion_dominio || 'no_verificado') +
          (link.es_acortador ? ' · acortador' : '');
      }, 'No se han detectado enlaces.');

      renderList('listaAdjuntos', email.adjuntos, function (attachment) {
        return (attachment.nombre || 'Adjunto') + ' · ' +
          (attachment.extension || 'sin extensión') + ' · ' +
          (attachment.es_peligroso ? 'extensión de riesgo' : 'sin alerta por extensión');
      }, 'No se han identificado adjuntos.');

      message.textContent = 'Correo leído correctamente. Revisa los datos extraídos antes de continuar.';
      message.classList.add('mensaje--ok');
      document.dispatchEvent(new CustomEvent('vigia:correo-leido', { detail: { remitente: email.remitente, asunto: email.asunto } }));
      if (typeof window.mostrarVentana === 'function') window.mostrarVentana(2);
    } catch (error) {
      message.textContent = error.message || 'No se pudo leer el correo.';
    } finally {
      button.disabled = false;
      button.textContent = 'Leer correo de forma segura';
    }
  }

  window.validarCorreo = validateEmail;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configureDropArea);
  else configureDropArea();
})();