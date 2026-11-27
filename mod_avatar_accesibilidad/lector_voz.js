/* Motor de voz de Vigía: sin barra flotante duplicada. */
(function () {
  'use strict';

  var supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  var queue = [];
  var index = 0;
  var token = 0;
  var speaking = false;
  var paused = false;
  var currentUtterance = null;
  var completionCallback = null;

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function chooseVoice() {
    if (!supported) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    var preferred = ['es-EC', 'es-MX', 'es-CO', 'es-US', 'es-ES'];
    for (var i = 0; i < preferred.length; i++) {
      for (var j = 0; j < voices.length; j++) {
        if ((voices[j].lang || '').toLowerCase() === preferred[i].toLowerCase()) return voices[j];
      }
    }
    return voices.find(function (voice) { return /^es([_-]|$)/i.test(voice.lang || ''); }) || null;
  }

  function splitText(text) {
    var clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    var sentences = clean.match(/[^.!?;:]+[.!?;:]*/g) || [clean];
    var chunks = [];
    var current = '';
    sentences.forEach(function (sentence) {
      var part = sentence.trim();
      if (!part) return;
      if ((current + ' ' + part).trim().length > 175 && current) {
        chunks.push(current.trim());
        current = '';
      }
      current = (current + ' ' + part).trim();
    });
    if (current) chunks.push(current);
    return chunks;
  }

  function finish(runToken) {
    if (runToken !== token) return;
    speaking = false;
    paused = false;
    queue = [];
    currentUtterance = null;
    var callback = completionCallback;
    completionCallback = null;
    emit('vigia:voz-fin');
    if (typeof callback === 'function') {
      try { callback(); } catch (_) { /* No interrumpir el lector por un callback externo. */ }
    }
  }

  function speakNext(runToken) {
    if (runToken !== token) return;
    if (index >= queue.length) { finish(runToken); return; }

    var phrase = queue[index];
    var utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'es-EC';
    utterance.rate = 0.94;
    utterance.pitch = 1;
    var voice = chooseVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = function () { emit('vigia:voz-fragmento', { texto: phrase, indice: index + 1, total: queue.length }); };
    utterance.onend = function () {
      if (runToken !== token) return;
      index += 1;
      speakNext(runToken);
    };
    utterance.onerror = function (event) {
      if (runToken !== token) return;
      if (event && (event.error === 'canceled' || event.error === 'interrupted')) return;
      index += 1;
      speakNext(runToken);
    };
    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function stop(silent) {
    var wasSpeaking = speaking;
    token += 1;
    if (supported) window.speechSynthesis.cancel();
    speaking = false;
    paused = false;
    queue = [];
    currentUtterance = null;
    completionCallback = null;
    if (wasSpeaking && !silent) emit('vigia:voz-fin');
  }

  function speak(text, callback) {
    if (!supported) {
      emit('vigia:voz-no-disponible', { mensaje: 'Este navegador no admite lectura de voz.' });
      emit('vigia:voz-fin');
      return;
    }
    stop(true);
    completionCallback = typeof callback === 'function' ? callback : null;
    queue = splitText(text);
    if (!queue.length) {
      var emptyCallback = completionCallback;
      completionCallback = null;
      emit('vigia:voz-fin');
      if (typeof emptyCallback === 'function') { try { emptyCallback(); } catch (_) {} }
      return;
    }
    token += 1;
    index = 0;
    speaking = true;
    paused = false;
    emit('vigia:voz-inicio', { total: queue.length });
    speakNext(token);
  }

  function pause() {
    if (!supported || !speaking || paused) return;
    window.speechSynthesis.pause();
    paused = true;
  }

  function resume() {
    if (!supported || !speaking || !paused) return;
    window.speechSynthesis.resume();
    paused = false;
  }

  window.VigiaVoz = {
    hablar: speak,
    hablarConCallback: function (text, callback) { speak(text, callback); },
    pausar: pause,
    reanudar: resume,
    detener: function () { stop(false); },
    estaHablando: function () { return speaking; },
    estaPausado: function () { return paused; },
    disponible: function () { return supported; }
  };

  window.addEventListener('beforeunload', function () { if (supported) window.speechSynthesis.cancel(); });
})();
