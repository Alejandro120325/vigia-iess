"""
Rutas REST de mod_backend_api / Responsable: Alejandro Ojeda.
Conecta la interfaz web y una futura app móvil con el motor de IA.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from pathlib import Path
from typing import Any

from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from mod_backend_api.config_canales import CANALES_OFICIALES_IESS
from mod_backend_api.extractor_seguro import ErrorExtraccion, extraer_correo_seguro

backend_bp = Blueprint("backend_bp", __name__)
ROOT_DIR = Path(__file__).resolve().parents[1]
PRACTICA_DIR = ROOT_DIR / "data" / "practica"

try:
    from mod_ia_motor.evaluador import analizar_correo_ia, estado_motor_ia
    from mod_ia_motor.reglas_indicios import detectar_indicios
    MOTOR_MODULO_DISPONIBLE = True
    MOTOR_ERROR_IMPORTACION = None
except Exception as exc:  # La API sigue disponible para informar el problema.
    analizar_correo_ia = None
    detectar_indicios = None
    estado_motor_ia = None
    MOTOR_MODULO_DISPONIBLE = False
    MOTOR_ERROR_IMPORTACION = f"{type(exc).__name__}: {exc}"


def _json_canonico(datos: dict[str, Any]) -> bytes:
    copia = {key: value for key, value in datos.items() if key != "token_integridad"}
    return json.dumps(copia, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _crear_firma(datos: dict[str, Any]) -> str:
    secreto = current_app.config["INTEGRITY_SECRET"]
    if isinstance(secreto, str):
        secreto = secreto.encode("utf-8")
    return hmac.new(secreto, _json_canonico(datos), hashlib.sha256).hexdigest()


def _firmar_correo(datos: dict[str, Any]) -> dict[str, Any]:
    datos["token_integridad"] = _crear_firma(datos)
    return datos


def _verificar_firma(datos: dict[str, Any]) -> bool:
    token = datos.get("token_integridad")
    if not isinstance(token, str) or not token:
        return False
    esperado = _crear_firma(datos)
    return hmac.compare_digest(token, esperado)


def _error_mensaje(mensaje: str, status: int):
    return jsonify({"ok": False, "error": mensaje}), status


def _evaluacion_solo_reglas(datos_correo: dict[str, Any]) -> dict[str, Any]:
    """Respaldo explícito: nunca inventa probabilidades ML."""
    if detectar_indicios is None:
        return {
            "veredicto": "No disponible",
            "es_phishing": None,
            "total_indicios": 0,
            "codigos_detectados": [],
            "indicios": [],
            "probabilidad_ml": None,
            "guion_avatar": "No fue posible cargar el motor de reglas. Revise la instalación.",
            "error_motor": MOTOR_ERROR_IMPORTACION,
        }
    indicios = detectar_indicios(datos_correo)
    salida = [{
        "codigo": item["codigo"],
        "nombre": item["nombre"],
        "explicacion": item.get("evidencia", "Indicio detectado por regla local."),
        "consejo": "No abra enlaces ni adjuntos. Verifique por los canales oficiales del IESS.",
        "evidencia": item.get("evidencia", ""),
        "origen": "regla_deterministica",
    } for item in indicios]
    es_phishing = bool(salida)
    return {
        "veredicto": "Sí es phishing" if es_phishing else "No es phishing",
        "es_phishing": es_phishing,
        "total_indicios": len(salida),
        "codigos_detectados": [item["codigo"] for item in salida],
        "indicios": salida,
        "probabilidad_ml": None,
        "guion_avatar": (
            "El mensaje presenta indicios de phishing. No abra enlaces ni adjuntos y consulte los canales oficiales."
            if es_phishing else
            "No se detectaron indicios determinísticos. Esto no garantiza que el correo sea legítimo."
        ),
        "aviso": "El adaptador completo de Alex no pudo cargarse; se ejecutaron únicamente las reglas disponibles.",
    }


@backend_bp.get("/api/salud")
def api_salud():
    estado = estado_motor_ia() if MOTOR_MODULO_DISPONIBLE and estado_motor_ia else {
        "reglas_deterministicas": detectar_indicios is not None,
        "modelo_ml_disponible": False,
        "error_importacion": MOTOR_ERROR_IMPORTACION,
    }
    return jsonify({
        "ok": True,
        "servicio": "Vigía IESS API",
        "modulo": "mod_backend_api",
        "version_backend": "2.0.0",
        "motor_ia_conectado": MOTOR_MODULO_DISPONIBLE,
        "motor": estado,
        "modo_ejecucion": "Local; no se visitan enlaces ni se envían correos a terceros.",
        "limite_archivo_bytes": current_app.config.get("MAX_CONTENT_LENGTH"),
    })


@backend_bp.get("/api/canales-oficiales")
def api_canales_oficiales():
    return jsonify({"ok": True, "canales": CANALES_OFICIALES_IESS})


@backend_bp.post("/api/paso1-leer")
def api_paso1_leer():
    archivo = request.files.get("archivo")
    texto_pegado = request.form.get("texto_pegado", "")
    if archivo and archivo.filename:
        nombre = archivo.filename
        if not nombre.lower().endswith((".pdf", ".eml")):
            return _error_mensaje("Formato no permitido. Suba únicamente PDF de Gmail o archivo .eml.", 400)
        contenido = archivo.stream.read(current_app.config["MAX_CONTENT_LENGTH"] + 1)
        if len(contenido) > current_app.config["MAX_CONTENT_LENGTH"]:
            return _error_mensaje("El archivo supera el límite de 10 MB.", 413)
        try:
            correo = extraer_correo_seguro(
                archivo_bytes=contenido,
                nombre_archivo=nombre,
            )
        except ErrorExtraccion as exc:
            return _error_mensaje(str(exc), 422)
    elif texto_pegado.strip():
        try:
            correo = extraer_correo_seguro(texto_pegado=texto_pegado)
        except ErrorExtraccion as exc:
            return _error_mensaje(str(exc), 422)
    else:
        return _error_mensaje("Suba un PDF, un correo .eml o pegue el texto del mensaje.", 400)

    _firmar_correo(correo)
    return jsonify({"ok": True, "correo": correo})


@backend_bp.post("/api/paso2-analizar")
def api_paso2_analizar():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_mensaje("El cuerpo debe ser JSON válido.", 400)
    datos_correo = payload.get("correo")
    if not isinstance(datos_correo, dict):
        return _error_mensaje("No se recibió el objeto correo devuelto por /api/paso1-leer.", 400)

    if current_app.config.get("REQUIRE_SIGNED_CORREO", True):
        if not _verificar_firma(datos_correo):
            return _error_mensaje(
                "El correo no tiene una firma de integridad válida. Vuelva a ejecutar el paso 1 y envíe su objeto completo.",
                400,
            )

    try:
        if MOTOR_MODULO_DISPONIBLE and analizar_correo_ia:
            resultado = analizar_correo_ia(datos_correo)
        else:
            resultado = _evaluacion_solo_reglas(datos_correo)
    except Exception as exc:
        current_app.logger.exception("Fallo al analizar correo")
        return _error_mensaje(f"No se pudo completar el análisis: {type(exc).__name__}.", 500)

    resultado["canales_oficiales"] = CANALES_OFICIALES_IESS
    resultado["huella_auditoria_sha256"] = datos_correo.get("huella_sha256", "")
    resultado["integridad_paso1_verificada"] = bool(datos_correo.get("token_integridad"))
    return jsonify({"ok": True, "resultado": resultado})


@backend_bp.get("/api/auditoria-practica")
def api_auditoria_practica():
    resultados = []
    errores = []
    for indice in range(1, 6):
        nombre = f"P0{indice}.eml"
        ruta = PRACTICA_DIR / nombre
        if not ruta.is_file():
            errores.append({"archivo": nombre, "error": "No encontrado"})
            continue
        try:
            datos = extraer_correo_seguro(archivo_bytes=ruta.read_bytes(), nombre_archivo=nombre)
            if MOTOR_MODULO_DISPONIBLE and analizar_correo_ia:
                evaluacion = analizar_correo_ia(datos)
            else:
                evaluacion = _evaluacion_solo_reglas(datos)
            resultados.append({
                "archivo": nombre,
                "remitente": datos["remitente"],
                "asunto": datos["asunto"],
                "veredicto": evaluacion.get("veredicto"),
                "es_phishing": evaluacion.get("es_phishing"),
                "indicios": evaluacion.get("codigos_detectados", []),
                "total_indicios": evaluacion.get("total_indicios", 0),
                "huella_sha256": datos["huella_sha256"],
                "probabilidad_ml": evaluacion.get("probabilidad_ml"),
            })
        except Exception as exc:
            current_app.logger.exception("Error en auditoría de práctica: %s", nombre)
            errores.append({"archivo": nombre, "error": type(exc).__name__})

    return jsonify({
        "ok": len(resultados) > 0,
        "motor_ia_conectado": MOTOR_MODULO_DISPONIBLE,
        "total_esperados": 5,
        "total_probados": len(resultados),
        "errores": errores,
        "resultados": resultados,
        "nota": "La auditoría procesa mensajes de ejemplo; no utiliza ni expone la hoja interna de respuestas.",
    }), (200 if resultados else 404)
