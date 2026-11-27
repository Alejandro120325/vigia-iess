/* Cliente único de comunicación entre la interfaz y Flask. */
(function () {
  'use strict';
  async function solicitarJSON(ruta, opciones) {
    let respuesta;
    try {
      respuesta = await fetch(ruta, {credentials:'same-origin',headers:Object.assign({Accept:'application/json'},(opciones&&opciones.headers)||{}),...(opciones||{})});
    } catch (_error) { throw new Error('No se pudo conectar con Vigía IESS. Compruebe que app.py esté ejecutándose.'); }
    let datos;
    try { datos=await respuesta.json(); } catch (_error) { throw new Error('El servidor devolvió una respuesta no válida.'); }
    if (!respuesta.ok || datos.ok===false) throw new Error(datos.error||('La solicitud falló (HTTP '+respuesta.status+').'));
    return datos;
  }
  function leerCorreo(archivo,texto) {
    const f=new FormData();
    if(archivo) f.append('archivo',archivo,archivo.name); else f.append('texto_pegado',texto||'');
    return solicitarJSON('/api/paso1-leer',{method:'POST',body:f});
  }
  function analizarCorreo(correo) {
    return solicitarJSON('/api/paso2-analizar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo})});
  }
  const api={
    leerCorreo,analizarCorreo,
    obtenerSalud:()=>solicitarJSON('/api/salud'),
    obtenerCanales:()=>solicitarJSON('/api/canales-oficiales'),
    auditoriaPractica:()=>solicitarJSON('/api/auditoria-practica')
  };
  window.VigiaAPI=Object.freeze(api);
  async function estado() {
    const el=document.getElementById('estadoSistema'); if(!el)return;
    try {
      const s=await api.obtenerSalud(),m=s.motor||{};
      el.textContent='API activa · reglas I1–I11 '+(m.reglas_deterministicas?'activas':'no disponibles')+' · ONNX '+(m.onnxruntime_instalado?'instalado':'no instalado')+' · ML '+(m.modelo_ml_disponible?'disponible':'no disponible');
      el.classList.add('estado-sistema--activo');
    } catch(e) {el.textContent=e.message;el.classList.add('estado-sistema--error');}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',estado);else estado();
})();