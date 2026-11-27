/* ==========================================================
   VIGÍA-IESS · avatar_asistente.js (Integrante 4)
   Asistente ficticio "Vigía" (NO es una persona real).
   - Explica qué es el phishing y su impacto.
   - Semáforo progresivo (Verde -> Amarillo -> Rojo) conforme se detectan fallos.
   - Preguntas cortas interactivas por fallo del correo.
   - Listo para recibir modelo 3D (.glb) cuando esté terminado.
   ========================================================== */
(function () {
  'use strict';

  var NOMBRE = 'Vigía';
  var CORREO = 'seguridad.informacion@iess.gob.ec';

  var config3D = {
    url: '',
    animHablar: 'hablar',
    animReposo: 'reposo',
    animAlerta: 'alerta',
    animAcierto: 'acierto'
  };

  var SVG = `
<svg class="vg-av__svg" viewBox="0 0 200 200" role="img" aria-label="Vigía, asistente ficticio. No es una persona real.">
  <ellipse cx="100" cy="192" rx="50" ry="5" fill="rgba(0,0,0,.15)"/>
  <polygon points="52,66 62,22 92,50" fill="#0b2e59"/>
  <polygon points="148,66 138,22 108,50" fill="#0b2e59"/>
  <ellipse cx="100" cy="120" rx="64" ry="66" fill="#0b2e59"/>
  <ellipse cx="100" cy="140" rx="40" ry="44" fill="#dce9f7"/>
  <path d="M100 120 L120 127 L118 150 Q116 162 100 170 Q84 162 82 150 L80 127 Z" fill="#ffc20e"/>
  <path d="M91 146 L98 154 L111 136" fill="none" stroke="#0b2e59" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="36" cy="125" rx="16" ry="38" fill="#123f7a" transform="rotate(8 36 125)"/>
  <ellipse cx="164" cy="125" rx="16" ry="38" fill="#123f7a" transform="rotate(-8 164 125)"/>
  <ellipse cx="100" cy="80" rx="56" ry="46" fill="#123f7a"/>
  <circle cx="74" cy="76" r="23" fill="#fff" stroke="#ffc20e" stroke-width="4"/>
  <circle cx="126" cy="76" r="23" fill="#fff" stroke="#ffc20e" stroke-width="4"/>
  <circle cx="77" cy="78" r="11" fill="#111"/>
  <circle cx="123" cy="78" r="11" fill="#111"/>
  <circle cx="81" cy="73" r="3.5" fill="#fff"/>
  <circle cx="127" cy="73" r="3.5" fill="#fff"/>
  <ellipse class="vg-parpado" cx="74" cy="76" rx="27" ry="27" fill="#123f7a"/>
  <ellipse class="vg-parpado" cx="126" cy="76" rx="27" ry="27" fill="#123f7a"/>
  <ellipse class="vg-av__boca" cx="100" cy="110" rx="8" ry="0.5" fill="#5a1d00"/>
  <polygon points="89,93 111,93 100,108" fill="#ffc20e"/>
  <g class="vg-av__pico"><polygon points="92,108 108,108 100,117" fill="#f29c0b"/></g>
  <path d="M82 190 l-6 8 M88 190 l0 9 M112 190 l0 9 M118 190 l6 8" stroke="#f29c0b" stroke-width="4" stroke-linecap="round"/>
</svg>`;

  var tarjeta, boca, pico, ondas, sub, veredicto, estado, msgCopia;
  var focoVerde, focoAmarillo, focoRojo, semTxt, claseBox, nota3D, figBox;
  var animBoca = null, ultimo = null;
  var erroresDetectados = 0, totalFallos = 0, pasoActual = 0;
  var sinMovimiento = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  function boton(clase, texto) {
    var b = el('button', clase, texto);
    b.type = 'button';
    return b;
  }

  /* ---------- Soporte de modelo 3D ---------- */
  function asegurarModelViewer(cb) {
    if (window.customElements && customElements.get('model-viewer')) { cb(true); return; }
    if (document.getElementById('vg-mv-script')) {
      customElements.whenDefined('model-viewer').then(function () { cb(true); }, function () { cb(false); });
      return;
    }
    var s = document.createElement('script');
    s.id = 'vg-mv-script';
    s.type = 'module';
    s.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js';
    s.onload = function () {
      customElements.whenDefined('model-viewer').then(function () { cb(true); }, function () { cb(false); });
    };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }

  function animar3D(nombreAnim) {
    var mv = figBox && figBox.querySelector('model-viewer');
    if (!mv || !nombreAnim) return;
    mv.setAttribute('animation-name', nombreAnim);
    if (typeof mv.play === 'function') mv.play();
  }

  function aplicarModelo3D(url) {
    config3D.url = url || '';
    if (!figBox) return;
    if (!config3D.url) {
      figBox.innerHTML = SVG;
      boca = figBox.querySelector('.vg-av__boca');
      pico = figBox.querySelector('.vg-av__pico');
      if (nota3D) nota3D.textContent = 'Búho 3D: en preparación';
      return;
    }
    asegurarModelViewer(function (ok) {
      if (!ok) return;
      figBox.innerHTML = '';
      var mv = document.createElement('model-viewer');
      mv.className = 'vg-av__mv';
      mv.setAttribute('src', config3D.url);
      mv.setAttribute('alt', 'Búho 3D Vigía, asistente virtual');
      mv.setAttribute('autoplay', '');
      if (!sinMovimiento) mv.setAttribute('camera-controls', '');
      mv.setAttribute('disable-tap', '');
      figBox.appendChild(mv);
      boca = null;
      pico = null;
      if (nota3D) nota3D.textContent = 'Búho 3D activo';
      animar3D(config3D.animReposo);
    });
  }

  /* ---------- Normaliza lo que mande el backend ---------- */
  function preguntaPorDefecto(nombre, explicacion) {
    var base = nombre || 'este detalle del correo';
    return {
      enunciado: 'En este correo aparece «' + base + '». ¿Por qué es una señal de alerta?',
      opciones: [
        {
          t: 'Porque intenta apresurarme o engañarme para que entregue datos o haga clic.',
          ok: true,
          f: explicacion || ('Detectar «' + base + '» ayuda a frenar el engaño a tiempo.')
        },
        {
          t: 'Porque es una garantía de que el correo es 100% oficial y seguro.',
          ok: false,
          f: 'No confíe a ciegas. ' + (explicacion || 'Revise siempre por un canal oficial.')
        }
      ]
    };
  }

  function normalizar(r) {
    r = r || {};
    var crudo = r.indicios || r.indicators || [];
    var indicios = crudo.map(function (i, n) {
      if (typeof i === 'string') {
        return {
          nombre: i,
          explicacion: '',
          pregunta: preguntaPorDefecto(i, '')
        };
      }
      var nom = i.nombre || i.titulo || i.name || ('Fallo ' + (n + 1));
      var exp = i.explicacion || i.descripcion || i.explanation || '';
      var preg = i.pregunta || preguntaPorDefecto(nom, exp);
      return { nombre: nom, explicacion: exp, pregunta: preg };
    });
    var es = typeof r.es_phishing === 'boolean' ? r.es_phishing
           : typeof r.phishing === 'boolean' ? r.phishing
           : indicios.length > 0;
    return { es: es, indicios: indicios };
  }

  /* ---------- Semáforo progresivo ---------- */
  function actualizarSemaforo() {
    var nivel = 'verde', etiqueta = 'Nivel de riesgo bajo: todavía no hay fallos confirmados.';
    if (erroresDetectados >= 3 || (totalFallos > 0 && erroresDetectados >= totalFallos)) {
      nivel = 'rojo';
      etiqueta = 'Nivel de riesgo alto: ' + erroresDetectados + ' de ' + Math.max(totalFallos, erroresDetectados) + ' fallos detectados. Alto riesgo de phishing.';
    } else if (erroresDetectados >= 1) {
      nivel = 'amarillo';
      etiqueta = 'Nivel de riesgo moderado: ' + erroresDetectados + ' fallo(s) detectado(s). Precaución.';
    }
    
    
    
    semTxt.textContent = etiqueta;
  }

  /* ---------- Voz y subtítulos ---------- */
  function decir(texto) {
    if (sub) sub.textContent = texto;
    if (window.VigiaVoz && 'speechSynthesis' in window) window.VigiaVoz.hablar(texto);
  }

  function explicarAnalisis(resultado) {
    var datos = resultado || {};
    ultimo = normalizar(datos);
    totalFallos = ultimo.indicios.length;
    erroresDetectados = 0;
    pasoActual = 0;
    if (tarjeta) {
      tarjeta.classList.toggle('vg-av--alerta', ultimo.es);
      tarjeta.classList.toggle('vg-av--ok', !ultimo.es);
    }
    if (veredicto) {
      veredicto.hidden = false;
      veredicto.textContent = ultimo.es
        ? 'Posible phishing: ' + totalFallos + ' indicio(s) determinístico(s) detectado(s).'
        : 'No se detectaron indicios determinísticos. Esto no garantiza legitimidad.';
    }
    if (semTxt) semTxt.textContent = ultimo.es
      ? 'Nivel de riesgo alto: el motor detectó ' + totalFallos + ' indicio(s).'
      : 'Nivel de riesgo bajo según reglas: no se detectaron indicios.';
    if (claseBox) {
      claseBox.textContent = '';
      claseBox.appendChild(el('h3', '', 'Explicación del análisis real'));
      if (ultimo.indicios.length) {
        ultimo.indicios.forEach(function (item, index) {
          var titulo = (item.codigo ? item.codigo + ': ' : '') + item.nombre;
          claseBox.appendChild(el('h4', '', (index + 1) + '. ' + titulo));
          if (item.explicacion) claseBox.appendChild(el('p', '', item.explicacion));
          if (item.evidencia) claseBox.appendChild(el('p', '', 'Evidencia: ' + item.evidencia));
          if (item.consejo) claseBox.appendChild(el('p', '', 'Recomendación: ' + item.consejo));
        });
      } else {
        claseBox.appendChild(el('p', '', 'No se encontraron coincidencias en las reglas determinísticas I1–I11. La ausencia de coincidencias no demuestra que el correo sea legítimo.'));
      }
    }
    var resumen = ultimo.es
      ? 'El motor detectó señales de posible phishing. No pulse enlaces ni abra adjuntos y compruebe el mensaje por canales oficiales.'
      : 'No se detectaron indicios determinísticos de phishing. Mantenga la precaución y verifique cualquier solicitud sensible por un canal independiente.';
    decir(resumen);
  }

  function saludar() {
    decir('Hola, soy ' + NOMBRE + ', un asistente ficticio. Le explicaré qué es el phishing, su impacto y revisaremos los fallos del correo paso a paso.');
  }

  /* ---------- Clase interactiva: Phishing + Impacto + Fallos ---------- */
  function pintarPasoClase() {
    claseBox.textContent = '';
    if (!ultimo) {
      claseBox.appendChild(el('h3', '', 'Clase interactiva de seguridad'));
      claseBox.appendChild(el('p', '', 'Pulse «Simular: SÍ es phishing» o «Simular: NO es phishing» para iniciar la explicación guiada.'));
      return;
    }

    if (pasoActual === 0) {
      var introTitulo = '1. ¿Qué es el phishing y qué impacto puede tener?';
      var introTexto = 'El phishing es un engaño en el que alguien se hace pasar por una institución o persona de confianza para que usted entregue claves, dinero o datos personales. Su impacto puede ser grave: pérdida de dinero, robo de identidad o acceso indebido a sus cuentas.';
      claseBox.appendChild(el('h3', '', introTitulo));
      claseBox.appendChild(el('p', '', introTexto));

      var btnSig = boton('vg-av__btn', 'Comenzar revisión de fallos →');
      btnSig.addEventListener('click', function () {
        if (ultimo.indicios.length > 0) {
          pasoActual = 1;
          pintarPasoClase();
        } else {
          pasoActual = ultimo.indicios.length + 1;
          pintarPasoClase();
        }
      });
      claseBox.appendChild(btnSig);
      decir(introTexto);
      return;
    }

    if (pasoActual >= 1 && pasoActual <= ultimo.indicios.length) {
      var idx = pasoActual - 1;
      var fallo = ultimo.indicios[idx];
      claseBox.appendChild(el('h3', '', 'Fallo ' + pasoActual + ' de ' + ultimo.indicios.length + ': ' + fallo.nombre));
      if (fallo.explicacion) {
        claseBox.appendChild(el('p', '', fallo.explicacion));
      }

      var preg = fallo.pregunta || preguntaPorDefecto(fallo.nombre, fallo.explicacion);
      claseBox.appendChild(el('p', '', 'Pregunta rápida: ' + preg.enunciado));

      var opsDiv = el('div', 'vg-av__ops');
      var fb = el('p', 'vg-av__fb', '');
      fb.setAttribute('role', 'status');
      fb.setAttribute('aria-live', 'polite');
      var sigBtn = boton('vg-av__btn', pasoActual < ultimo.indicios.length ? 'Siguiente fallo →' : 'Ver resumen final →');
      sigBtn.hidden = true;
      var btns = [];

      preg.opciones.forEach(function (op, i) {
        var b = boton('vg-av__op', String.fromCharCode(65 + i) + ') ' + op.t);
        btns.push(b);
        b.addEventListener('click', function () {
          btns.forEach(function (x) { x.disabled = true; });
          b.classList.add(op.ok ? 'vg-av__op--ok' : 'vg-av__op--mal');
          if (op.ok) {
            erroresDetectados = Math.min(totalFallos, erroresDetectados + 1);
            actualizarSemaforo();
            
          } else {
            
          }
          fb.textContent = (op.ok ? '¡Correcto! ' : 'Revisemos: ') + op.f;
          sigBtn.hidden = false;
          decir(fb.textContent);
        });
        opsDiv.appendChild(b);
      });

      sigBtn.addEventListener('click', function () {
        pasoActual++;
        pintarPasoClase();
      });

      claseBox.appendChild(opsDiv);
      claseBox.appendChild(fb);
      claseBox.appendChild(sigBtn);
      decir('Fallo ' + pasoActual + ': ' + fallo.nombre + '. ' + (fallo.explicacion || '') + ' ' + preg.enunciado);
      return;
    }

    claseBox.appendChild(el('h3', '', 'Resumen y qué hacer ahora'));
    var cierre = ultimo.es
      ? 'Si el correo tiene estas señales, no haga clic en enlaces, no abra adjuntos ni entregue datos. Repórtelo al canal oficial ' + CORREO + '.'
      : 'En este ejemplo no se encontraron fallos de phishing. Aun así, verifique siempre por canales oficiales si algo le genera dudas.';
    claseBox.appendChild(el('p', '', cierre));
    var btnReiniciar = boton('vg-av__btn-sec', 'Repetir clase desde el inicio');
    btnReiniciar.addEventListener('click', function () {
      erroresDetectados = 0;
      pasoActual = 0;
      actualizarSemaforo();
      pintarPasoClase();
    });
    claseBox.appendChild(btnReiniciar);
    decir(cierre);
  }

  function explicar(resultado) {
    ultimo = normalizar(resultado);
    totalFallos = ultimo.indicios.length;
    erroresDetectados = 0;
    pasoActual = 0;

    tarjeta.classList.remove('vg-av--alerta', 'vg-av--ok');
    tarjeta.classList.add(ultimo.es ? 'vg-av--alerta' : 'vg-av--ok');
    veredicto.hidden = false;
    veredicto.textContent = ultimo.es
      ? 'Posible phishing: ' + totalFallos + (totalFallos === 1 ? ' fallo por revisar' : ' fallos por revisar')
      : 'No se detectaron señales de phishing';

    actualizarSemaforo();
    pintarPasoClase();
  }

  /* ---------- Animación de boca (respaldo SVG) ---------- */
  function abrirBoca() {
    if (sinMovimiento || animBoca || !boca || !pico) return;
    animBoca = setInterval(function () {
      var a = 1 + Math.random() * 6;
      boca.setAttribute('ry', a.toFixed(1));
      pico.setAttribute('transform', 'translate(0,' + (a * 0.7).toFixed(1) + ')');
    }, 120);
  }
  function cerrarBoca() {
    clearInterval(animBoca); animBoca = null;
    if (!boca || !pico) return;
    boca.setAttribute('ry', '0.5');
    pico.setAttribute('transform', 'translate(0,0)');
  }

  /* ---------- Construcción ---------- */
  function construir(host) {
    tarjeta = el('section', 'vg-av');
    tarjeta.setAttribute('aria-label', 'Asistente Vigía');

    var cab = el('div', 'vg-av__cab');
    figBox = el('div', 'vg-av__fig');
    figBox.innerHTML = SVG;
    boca = figBox.querySelector('.vg-av__boca');
    pico = figBox.querySelector('.vg-av__pico');
    nota3D = el('span', 'vg-av__3d-nota', 'Búho 3D: modelo provisional');
    figBox.appendChild(nota3D);

    var info = el('div', 'vg-av__info');
    info.appendChild(el('h2', 'vg-av__nombre', NOMBRE + ', su asistente'));
    info.appendChild(el('p', 'vg-av__ficticio', 'Personaje ficticio (no es una persona real)'));
    ondas = el('div', 'vg-ondas'); ondas.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 5; i++) ondas.appendChild(document.createElement('span'));
    info.appendChild(ondas);
    estado = el('p', '', ''); estado.style.cssText = 'margin:.3rem 0 0;font-weight:700';
    info.appendChild(estado);

    var btn = boton('vg-av__btn', 'Hablar con Vigía');
    btn.addEventListener('click', function () { ultimo ? pintarPasoClase() : saludar(); });
    info.appendChild(btn);

    cab.appendChild(figBox);
    cab.appendChild(info);

    veredicto = el('p', 'vg-av__veredicto', ''); veredicto.hidden = true;
    veredicto.setAttribute('role', 'status');

    var sem = el('div', 'vg-av__semaforo');
    semTxt = el('div', 'vg-sem__txt', 'Nivel de riesgo bajo: todavía no hay fallos confirmados.');
    semTxt.setAttribute('role', 'status'); semTxt.setAttribute('aria-live', 'polite');
    sem.appendChild(semTxt);

    claseBox = el('div', 'vg-av__clase');
    claseBox.setAttribute('role', 'region');
    claseBox.setAttribute('aria-label', 'Clase interactiva sobre phishing');
    claseBox.appendChild(el('h3', '', 'Clase interactiva de seguridad'));
    claseBox.appendChild(el('p', '', 'Pulse «Simular: SÍ es phishing» para comenzar la clase con explicación de phishing, impacto y preguntas cortas.'));

    sub = el('div', 'vg-av__sub', 'Hola, soy ' + NOMBRE + '. Aquí verá los subtítulos en letra grande.');
    sub.setAttribute('aria-live', 'off');

    var rep = el('div', 'vg-av__rep');
    rep.appendChild(el('span', '', 'Reporte al canal oficial:'));
    rep.appendChild(el('strong', '', CORREO));
    var copiar = boton('vg-av__copia', 'Copiar');
    msgCopia = el('span', '', ''); msgCopia.setAttribute('role', 'status');
    copiar.addEventListener('click', function () {
      function ok() { msgCopia.textContent = 'Correo copiado.'; }
      function fallo() { msgCopia.textContent = 'Seleccione y copie el texto'; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(CORREO).then(ok, fallo);
      } else { fallo(); }
    });
    rep.appendChild(copiar); rep.appendChild(msgCopia);

    [cab, veredicto, sem, claseBox, sub, rep].forEach(function (n) { tarjeta.appendChild(n); });
    aplicarModelo3D('/accesibilidad/models/panteraups.glb');
    host.appendChild(tarjeta);
  }

  function conectarVoz() {
    document.addEventListener('vigia:voz-inicio', function () {
      ondas.classList.add('activa');
      abrirBoca();
      animar3D(config3D.animHablar);
      estado.textContent = 'Hablando…';
    });
    document.addEventListener('vigia:voz-fragmento', function (e) {
      sub.textContent = (e.detail && e.detail.texto) || '';
    });
    document.addEventListener('vigia:voz-fin', function () {
      ondas.classList.remove('activa');
      cerrarBoca();
      animar3D(config3D.animReposo);
      estado.textContent = '';
    });
    document.addEventListener('vigia:resultado', function (e) { explicar(e.detail); });
  }

  function configurar(opts) {
    if (!opts) return;
    if (opts.animHablar) config3D.animHablar = opts.animHablar;
    if (opts.animReposo) config3D.animReposo = opts.animReposo;
    if (opts.animAlerta) config3D.animAlerta = opts.animAlerta;
    if (opts.animAcierto) config3D.animAcierto = opts.animAcierto;
    if (typeof opts.modelo3d === 'string') aplicarModelo3D(opts.modelo3d);
  }

  function iniciar() {
    var host = document.getElementById('avatar-asistente');
    if (!host) {
      host = el('div'); host.id = 'avatar-asistente';
      (document.querySelector('main') || document.body).appendChild(host);
    }
    construir(host);
    conectarVoz();
  }

  window.VigiaAvatar = {
    explicar: explicar,
    explicarAnalisis: explicarAnalisis,
    decir: decir,
    saludar: saludar,
    configurar: configurar
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();