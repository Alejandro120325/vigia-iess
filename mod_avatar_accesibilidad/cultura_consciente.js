/* Guía sencilla para exportar el correo como PDF. No contiene cuestionarios. */
(function () {
  'use strict';

  var STEPS = [
    { title: 'Abre el correo en Gmail', text: 'Entra a Gmail y selecciona el mensaje que quieres revisar. No pulses enlaces ni abras archivos adjuntos.' },
    { title: 'Abre la opción Imprimir', text: 'Usa el icono de la impresora o el menú de tres puntos y selecciona Imprimir.' },
    { title: 'Guarda como PDF', text: 'En Destino selecciona Guardar como PDF. Guarda el archivo y selecciónalo en el paso uno de Vigía.' }
  ];

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function speak(text) {
    if (window.VigiaVoz && typeof window.VigiaVoz.hablar === 'function') {
      window.VigiaVoz.hablar(text);
    }
  }

  function build(host) {
    host.classList.add('vg-cc');
    host.appendChild(element('h3', '', '¿Necesitas guardar un correo de Gmail en PDF?'));
    host.appendChild(element('p', '', 'Sigue estos tres pasos. No necesitas abrir ningún enlace del mensaje.'));
    var list = element('ol', 'vg-cc__pasos');
    STEPS.forEach(function (step, index) {
      var item = element('li', 'vg-cc__paso');
      item.appendChild(element('span', 'vg-cc__num', String(index + 1)));
      var copy = element('div', 'vg-cc__txt');
      copy.appendChild(element('strong', '', step.title));
      copy.appendChild(element('span', '', step.text));
      item.appendChild(copy);
      var button = element('button', 'vg-cc__btn', 'Escuchar');
      button.type = 'button';
      button.addEventListener('click', function () {
        speak('Paso ' + (index + 1) + '. ' + step.title + '. ' + step.text);
      });
      item.appendChild(button);
      list.appendChild(item);
    });
    host.appendChild(list);
  }

  function start() {
    var host = document.getElementById('cultura-consciente');
    if (host) build(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();