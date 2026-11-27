(function () {
  'use strict';

  var CSS = `
.vg-cc{max-width:46rem;margin:1.5rem auto;padding:1.25rem;border:.3rem solid #0b2e59;border-radius:1.2rem;background:#fff;color:#14213d;font-family:system-ui,"Segoe UI",Arial,sans-serif}
.vg-cc h2{margin:0 0 .4rem;font-size:1.6rem}
.vg-cc h3{margin:1.5rem 0 .5rem;font-size:1.4rem}
.vg-cc p{font-size:1.2rem;line-height:1.5;margin:.3rem 0}
.vg-cc__pasos{list-style:none;margin:1rem 0 0;padding:0;display:grid;gap:1rem}
.vg-cc__paso{display:flex;flex-wrap:wrap;align-items:center;gap:1rem;padding:1rem;border:.15rem solid #b8c9de;border-radius:1rem;background:#f4f8fd}
.vg-cc__num{flex:none;width:3.5rem;height:3.5rem;border-radius:50%;background:#0b2e59;color:#fff;font-size:1.8rem;font-weight:800;display:flex;align-items:center;justify-content:center}
.vg-cc__ico{flex:none;font-size:3rem;line-height:1}
.vg-cc__txt{flex:1;min-width:12rem}
.vg-cc__txt strong{display:block;font-size:1.3rem;margin-bottom:.2rem}
.vg-cc__btn,.vg-cc__op{min-height:3rem;padding:.4rem 1rem;border:.15rem solid #0b2e59;border-radius:.7rem;background:#fff;color:#0b2e59;font-size:1.15rem;font-weight:700;cursor:pointer}
.vg-cc__btn:hover,.vg-cc__op:hover:not(:disabled){background:#ffc20e;color:#000}
.vg-cc__aviso{margin-top:1rem;padding:.8rem 1rem;border-left:.4rem solid #ffc20e;background:#fff8e1}
.vg-cc__ops{display:grid;gap:.7rem;margin:.8rem 0}
.vg-cc__op{text-align:left;font-size:1.2rem;padding:.7rem 1rem}
.vg-cc__op:disabled{cursor:default}
.vg-cc__op--ok{background:#e8f5e9;border-color:#2e7d32;color:#1b5e20}
.vg-cc__op--mal{background:#fdecea;border-color:#c62828;color:#8e1b1b}
.vg-cc__fb{min-height:2rem;font-weight:700}
html.alto-contraste .vg-cc{background:#000;color:#fff;border-color:#ffe600}
html.alto-contraste .vg-cc__paso,html.alto-contraste .vg-cc__aviso{background:#000;border-color:#ffe600;color:#fff}
html.alto-contraste .vg-cc__num{background:#ffe600;color:#000}
html.alto-contraste .vg-cc__btn,html.alto-contraste .vg-cc__op{background:#000;color:#ffe600;border-color:#ffe600}
html.alto-contraste .vg-cc__op--ok,html.alto-contraste .vg-cc__op--mal{background:#000;color:#fff}
`;

  var PASOS = [
    { titulo: 'Abra el correo en Gmail',
      texto: 'Entre a Gmail desde la computadora y haga clic en el correo que quiere revisar. No toque ningún enlace ni archivo adjunto.' },
    { titulo: 'Pulse el icono de la impresora',
      texto: 'Arriba a la derecha del correo está el icono de la impresora. Si no lo ve, pulse los tres puntos y elija Imprimir.' },
    { titulo: 'Guárdelo como PDF',
      texto: 'En la ventana que se abre, en Destino elija Guardar como PDF y pulse Guardar. Después suba ese archivo aquí.' }
  ];

  var PREGUNTAS = [
    { enunciado: 'Recibe un correo que dice: «Su cuenta será bloqueada hoy. Haga clic aquí para evitarlo». ¿Qué hace?',
      opciones: [
        { t: 'Hago clic rápido para que no me bloqueen.', ok: false, f: 'Eso es lo que buscan los estafadores: que actúe con prisa y sin pensar.' },
        { t: 'No hago clic y llamo al número oficial que ya conozco.', ok: true, f: 'Verificar por otro canal es la mejor defensa.' },
        { t: 'Respondo el correo con mi clave para confirmar.', ok: false, f: 'Nunca entregue claves por correo. Ninguna institución seria se las pide así.' }
      ] },
    { enunciado: 'Un correo dice ser del IESS, pero llega de una dirección que termina en @gmail.com. ¿Qué significa?',
      opciones: [
        { t: 'Es normal, el IESS usa Gmail.', ok: false, f: 'Las instituciones usan su propio dominio oficial, no correos gratuitos.' },
        { t: 'Es sospechoso: debe venir de un dominio oficial.', ok: true, f: 'Revisar la dirección completa del remitente ayuda a descubrir engaños.' },
        { t: 'Significa que el correo es más seguro.', ok: false, f: 'Al contrario: cualquiera puede crear una cuenta de Gmail en minutos.' }
      ] },
    { enunciado: 'Recibió un correo sospechoso que dice ser del IESS. ¿Dónde lo reporta?',
      opciones: [
        { t: 'Lo reenvío a todos mis contactos para avisarles.', ok: false, f: 'Así el engaño se propaga. Mejor repórtelo solo al canal oficial.' },
        { t: 'Al correo oficial seguridad.informacion@iess.gob.ec', ok: true, f: 'Reportarlo ayuda a proteger a otros afiliados.' },
        { t: 'No hago nada.', ok: false, f: 'Reportar es importante: así el IESS puede avisar a más personas.' }
      ] }
  ];

  var indicePregunta = 0;

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function boton(clase, texto) {
    var b = el('button', clase, texto); b.type = 'button'; return b;
  }
  function hablar(texto) {
    if (window.VigiaVoz && 'speechSynthesis' in window) window.VigiaVoz.hablar(texto);
  }

  function mostrarPregunta(cont) {
    cont.textContent = '';
    var p = PREGUNTAS[indicePregunta % PREGUNTAS.length];
    cont.appendChild(el('p', '', p.enunciado));

    var caja = el('div', 'vg-cc__ops');
    var fb = el('p', 'vg-cc__fb', ''); fb.setAttribute('role', 'status'); fb.setAttribute('aria-live', 'polite');
    var sig = boton('vg-cc__btn', 'Otra pregunta →'); sig.hidden = true;
    var botones = [];

    p.opciones.forEach(function (o, i) {
      var b = boton('vg-cc__op', String.fromCharCode(65 + i) + ') ' + o.t);
      botones.push(b);
      b.addEventListener('click', function () {
        botones.forEach(function (x) { x.disabled = true; });
        b.classList.add(o.ok ? 'vg-cc__op--ok' : 'vg-cc__op--mal');
        b.textContent = b.textContent;
        if (!o.ok) {
          p.opciones.forEach(function (c, j) {
            if (c.ok) { botones[j].classList.add('vg-cc__op--ok'); botones[j].textContent = botones[j].textContent; }
          });
        }
        fb.textContent = (o.ok ? '¡Muy bien! ' : 'Casi. La respuesta correcta está marcada. ') + o.f;
        sig.hidden = false;
        hablar(fb.textContent);
      });
      caja.appendChild(b);
    });

    sig.addEventListener('click', function () { indicePregunta++; mostrarPregunta(cont); });
    cont.appendChild(caja); cont.appendChild(fb); cont.appendChild(sig);
  }

  function construir(host) {
    host.classList.add('vg-cc');
    host.textContent = '';
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Cultura consciente');

    host.appendChild(el('h2', '', 'Cómo guardar su correo de Gmail en PDF'));
    host.appendChild(el('p', '', 'Son solo 3 pasos. Tómese su tiempo, no hay prisa.'));

    var ol = el('ol', 'vg-cc__pasos');
    PASOS.forEach(function (paso, n) {
      var li = el('li', 'vg-cc__paso');
      li.appendChild(el('span', 'vg-cc__num', String(n + 1)));
      var txt = el('div', 'vg-cc__txt');
      txt.appendChild(el('strong', '', paso.titulo));
      txt.appendChild(el('span', '', paso.texto));
      li.appendChild(txt);
      var esc = boton('vg-cc__btn', 'Escuchar paso');
      esc.setAttribute('aria-label', 'Escuchar el paso ' + (n + 1));
      esc.addEventListener('click', function () { hablar('Paso ' + (n + 1) + '. ' + paso.titulo + '. ' + paso.texto); });
      li.appendChild(esc);
      ol.appendChild(li);
    });
    host.appendChild(ol);

    var aviso = el('p', 'vg-cc__aviso', 'Su correo se queda en este equipo. Nunca haga clic en enlaces ni abra adjuntos mientras lo revisa.');
    host.appendChild(aviso);

    host.appendChild(el('h3', '', 'Una pregunta rápida'));
    var cont = el('div', 'vg-cc__preg');
    host.appendChild(cont);
    mostrarPregunta(cont);
  }

  function iniciar() {
    if (!document.getElementById('vg-cc-css')) {
      var s = document.createElement('style'); s.id = 'vg-cc-css'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    var host = document.getElementById('cultura-consciente');
    if (!host) {
      host = el('div'); host.id = 'cultura-consciente';
      (document.querySelector('main') || document.body).appendChild(host);
    }
    construir(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();