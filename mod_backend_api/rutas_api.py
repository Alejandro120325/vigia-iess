"""
Rutas REST de mod_backend_api (Responsable: Alejo).
Conecta la interfaz web (Jesly + Jos) y una futura app móvil con el motor de IA (Alex).
"""
import os
from flask import Blueprint, jsonify, request
from mod_backend_api.config_canales import CANALES_OFICIALES_IESS
from mod_backend_api.extractor_seguro import extraer_correo_seguro

backend_bp = Blueprint("backend_bp", __name__)

# Integración desacoplada con el módulo de Alex (mod_ia_motor)
try:
    from mod_ia_motor.evaluador import analizar_correo_ia
    MOTOR_ALEX_DISPONIBLE = True
except ImportError:
    MOTOR_ALEX_DISPONIBLE = False


def _evaluacion_respaldo_si_falta_alex(datos_correo: dict) -> dict:
    """
    Adaptador de seguridad para que Alejo pueda probar su API de punta a punta
    incluso antes de que Alex haga merge de mod_ia_motor.
    """
    enlaces_falsos = [e for e in datos_correo.get("enlaces", []) if not e["es_oficial"]]
    indicios = []
    if enlaces_falsos:
        indicios.append({
            "codigo": "I2",
            "nombre": "Enlace a dominio no oficial",
            "explicacion": f"Se detectaron enlaces externos: {', '.join(e['dominio'] for e in enlaces_falsos)}.",
            "consejo": "No haga clic. Ingrese únicamente a www.iess.gob.ec."
        })
    es_phishing = len(indicios) > 0
    return {
        "veredicto": "Sí es phishing" if es_phishing else "No es phishing",
        "es_phishing": es_phishing,
        "total_indicios": len(indicios),
        "codigos_detectados": [i["codigo"] for i in indicios],
        "indicios": indicios,
        "probabilidad_ml": 95.0 if es_phishing else 5.0,
        "guion_avatar": (
            "Resultado preliminar del respaldo local. Conecte mod_ia_motor de Alex para evaluar los 11 indicios completos."
        ),
        "canales_oficiales": CANALES_OFICIALES_IESS
    }


@backend_bp.route("/api/salud", methods=["GET"])
def api_salud():
    """Verifica el estado del servidor local y la conexión con el motor de Alex."""
    return jsonify({
        "ok": True,
        "modulo": "mod_backend_api",
        "motor_ia_conectado": MOTOR_ALEX_DISPONIBLE,
        "modo_ejecucion": "100% Local (Sin envío de datos externos)"
    })


@backend_bp.route("/api/canales-oficiales", methods=["GET"])
def api_canales_oficiales():
    """Devuelve los canales oficiales del IESS para mostrarlos en la web o app móvil."""
    return jsonify({
        "ok": True,
        "canales": CANALES_OFICIALES_IESS
    })


@backend_bp.route("/api/paso1-leer", methods=["POST"])
def api_paso1_leer():
    """
    Ventana 1 -> Ventana 2:
    Recibe un PDF de Gmail, un archivo .eml o texto pegado y devuelve sus partes
    aisladas y neutralizadas.
    """
    archivo = request.files.get("archivo")
    texto_pegado = request.form.get("texto_pegado", "")

    if archivo and archivo.filename:
        nombre = archivo.filename
        if not nombre.lower().endswith((".pdf", ".eml")):
            return jsonify({
                "ok": False,
                "error": "Formato no permitido. Suba únicamente un archivo PDF de Gmail o un correo .eml."
            }), 400

        contenido = archivo.read()
        if not contenido:
            return jsonify({"ok": False, "error": "El archivo seleccionado está vacío."}), 400

        datos = extraer_correo_seguro(
            archivo_bytes=contenido,
            nombre_archivo=nombre,
            texto_pegado=texto_pegado
        )
    elif texto_pegado.strip():
        datos = extraer_correo_seguro(texto_pegado=texto_pegado)
    else:
        return jsonify({
            "ok": False,
            "error": "Por favor suba un archivo PDF de Gmail, un archivo .eml o pegue el texto del mensaje."
        }), 400

    return jsonify({"ok": True, "correo": datos})


@backend_bp.route("/api/paso2-analizar", methods=["POST"])
def api_paso2_analizar():
    """
    Ventana 2 -> Ventana 3 & 4:
    Envía los datos aislados del correo al motor de IA de Alex (mod_ia_motor)
    y retorna el dictamen ('Sí es phishing' / 'No es phishing'), los indicios I1-I11
    y el guion listo para el Avatar de Jos.
    """
    payload = request.get_json(silent=True) or {}
    datos_correo = payload.get("correo")

    if not datos_correo:
        return jsonify({"ok": False, "error": "No se recibieron los datos extraídos del correo."}), 400

    if MOTOR_ALEX_DISPONIBLE:
        resultado = analizar_correo_ia(datos_correo)
    else:
        resultado = _evaluacion_respaldo_si_falta_alex(datos_correo)

    resultado["canales_oficiales"] = CANALES_OFICIALES_IESS
    resultado["huella_auditoria_sha256"] = datos_correo.get("huella_sha256", "")
    return jsonify({"ok": True, "resultado": resultado})


@backend_bp.route("/api/auditoria-practica", methods=["GET"])
def api_auditoria_practica():
    """
    Ejecuta automáticamente los 5 correos .eml de práctica (P01..P05) para
    demostrar evidencia ante el jurado o validar cambios del equipo.
    """
    carpeta_practica = os.path.join("data", "practica")
    if not os.path.exists(carpeta_practica):
        return jsonify({
            "ok": False,
            "error": "Coloque la carpeta (practica) dentro de (datos/practica) para ejecutar la auditoría."
        }), 404

    resultados = []
    for idx in range(1, 6):
        nombre_eml = f"P0{idx}.eml"
        ruta = os.path.join(carpeta_practica, nombre_eml)
        if os.path.exists(ruta):
            with open(ruta, "rb") as f:
                extraido = extraer_correo_seguro(archivo_bytes=f.read(), nombre_archivo=nombre_eml)
            eval_res = (
                analizar_correo_ia(extraido)
                if MOTOR_ALEX_DISPONIBLE
                else _evaluacion_respaldo_si_falta_alex(extraido)
            )
            resultados.append({
                "archivo": nombre_eml,
                "remitente": extraido["remitente"],
                "asunto": extraido["asunto"],
                "veredicto": eval_res["veredicto"],
                "indicios": eval_res["codigos_detectados"],
                "huella_sha256": extraido["huella_sha256"][:16]
            })

    return jsonify({
        "ok": True,
        "motor_ia_conectado": MOTOR_ALEX_DISPONIBLE,
        "total_probados": len(resultados),
        "resultados": resultados
    })