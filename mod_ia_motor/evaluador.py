"""Adaptador entre el contrato JSON del backend de Alejo y los modelos de Alex.

El dictamen oficial se obtiene de los indicios determinísticos I1-I11.
El clasificador ML aporta una probabilidad complementaria, no sustituye la regla.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

import numpy as np

from .reglas_indicios import (
    CANALES_OFICIALES,
    CONSEJOS,
    INDICIO_DESCRIPTIONS,
    construir_texto_modelo,
    crear_config_reglas,
    detectar_indicios,
)

BASE_DIR = Path(__file__).resolve().parent
EXPORT_DIR = BASE_DIR / "export"
INDICATOR_MODEL = EXPORT_DIR / "detector_iess.onnx"
PHISHING_MODEL = EXPORT_DIR / "clasificador_phishing.onnx"

try:
    import onnxruntime as ort
    ONNX_RUNTIME_DISPONIBLE = True
except Exception:  # La API puede funcionar solo con reglas si falta ONNX Runtime.
    ort = None
    ONNX_RUNTIME_DISPONIBLE = False


def _cargar_configuracion() -> dict[str, Any]:
    archivo = EXPORT_DIR / "config_reglas.json"
    if archivo.is_file():
        try:
            with archivo.open("r", encoding="utf-8") as f:
                config = json.load(f)
            if config.get("version", 0) >= 2:
                return config
        except (OSError, json.JSONDecodeError):
            pass
    return crear_config_reglas()


@lru_cache(maxsize=4)
def _sesion_onnx(ruta: str):
    if not ONNX_RUNTIME_DISPONIBLE:
        raise RuntimeError("onnxruntime no está instalado")
    return ort.InferenceSession(ruta, providers=["CPUExecutionProvider"])


def _modelo_puede_cargarse(ruta: Path) -> bool:
    if not ONNX_RUNTIME_DISPONIBLE or not ruta.is_file():
        return False
    try:
        _sesion_onnx(str(ruta))
        return True
    except Exception:
        return False


def estado_motor_ia() -> dict[str, Any]:
    modelo_indicios_ok = _modelo_puede_cargarse(INDICATOR_MODEL)
    clasificador_ok = _modelo_puede_cargarse(PHISHING_MODEL)
    return {
        "reglas_deterministicas": True,
        "onnxruntime_instalado": ONNX_RUNTIME_DISPONIBLE,
        "modelo_indicios_disponible": modelo_indicios_ok,
        "clasificador_phishing_disponible": clasificador_ok,
        "modelo_ml_disponible": clasificador_ok,
        "directorio_modelos": str(EXPORT_DIR),
    }


def _normalizar_correo(datos: Mapping[str, Any]) -> dict[str, Any]:
    enlaces = datos.get("enlaces") or []
    urls = [
        str(item.get("url_real") or item.get("url_neutralizada") or "")
        for item in enlaces if isinstance(item, Mapping)
    ]
    adjuntos = datos.get("adjuntos") or []
    tipos = sorted({
        str(item.get("extension", "")).lower()
        for item in adjuntos
        if isinstance(item, Mapping) and item.get("extension")
    })
    tamanos = [
        f"{item.get('nombre', 'adjunto')}:{item.get('tamano_bytes', 0)}"
        for item in adjuntos if isinstance(item, Mapping)
    ]
    nombres_adjuntos = [
        str(item.get("nombre", ""))
        for item in adjuntos if isinstance(item, Mapping)
    ]

    # Claves inglesas compatibles con el CSV y las funciones actuales de Alex.
    return {
        "subject": str(datos.get("asunto") or datos.get("subject") or ""),
        "body": str(datos.get("cuerpo") or datos.get("body") or ""),
        "urls": " ".join(urls) if urls else str(datos.get("urls") or ""),
        "attachments_types": ", ".join(tipos) if tipos else str(datos.get("attachments_types") or ""),
        "attachments_sizes": "; ".join(tamanos) if tamanos else str(datos.get("attachments_sizes") or ""),
        "attachments": " ".join(nombres_adjuntos),
        "sender": str(datos.get("remitente") or datos.get("sender") or ""),
        "reply_to": str(datos.get("reply_to") or ""),
        "url_count": int(datos.get("url_count") or len(urls)),
        "attachments_count": int(datos.get("attachments_count") or len(adjuntos)),
        "adjuntos": adjuntos,
        "enlaces": enlaces,
        "enlace_disfrazado": bool(datos.get("enlace_disfrazado")),
        "hops_count": datos.get("hops_count"),
    }


def _extraer_probabilidad_phishing(texto: str) -> float | None:
    """Obtiene P(clase=phishing) del clasificador binario ONNX, si existe."""
    if not (ONNX_RUNTIME_DISPONIBLE and PHISHING_MODEL.is_file()):
        return None
    try:
        session = _sesion_onnx(str(PHISHING_MODEL))
        input_name = session.get_inputs()[0].name
        outputs = session.run(None, {input_name: np.asarray([[texto]], dtype=object)})
        metadata = session.get_outputs()
        for meta, output in zip(metadata, outputs):
            array = np.asarray(output)
            if "float" in meta.type and array.ndim >= 2 and array.shape[-1] == 2:
                return round(float(array.reshape(-1, 2)[0, 1]) * 100, 1)
        return None
    except Exception:
        return None


def _extraer_predicciones_indicios(texto: str) -> list[str]:
    """Devuelve salidas del modelo multietiqueta separadas de los indicios confirmados."""
    if not (ONNX_RUNTIME_DISPONIBLE and INDICATOR_MODEL.is_file()):
        return []
    try:
        session = _sesion_onnx(str(INDICATOR_MODEL))
        input_name = session.get_inputs()[0].name
        outputs = session.run(None, {input_name: np.asarray([[texto]], dtype=object)})
        for meta, output in zip(session.get_outputs(), outputs):
            array = np.asarray(output)
            if "label" in meta.name.lower() and array.size == 11:
                values = array.reshape(-1).astype(int).tolist()
                return [f"I{index}" for index, value in enumerate(values, start=1) if value == 1]
        return []
    except Exception:
        return []


def _guion_avatar(indicios: list[dict[str, Any]], es_phishing: bool) -> str:
    if not es_phishing:
        return (
            "Este correo no presenta indicios determinísticos de phishing. "
            "Eso no garantiza que sea legítimo. Revise el remitente y, si tiene dudas, "
            "entre escribiendo usted mismo www.iess.gob.ec en el navegador. "
            "Nunca comparta claves ni códigos de verificación."
        )
    resumen = "; ".join(f"{item['codigo']}: {item['nombre']}" for item in indicios)
    return (
        f"Atención. Este correo presenta señales de posible phishing. "
        f"Detectamos: {resumen}. No abra enlaces ni adjuntos y no comparta claves, "
        "códigos ni datos personales. Verifique la información directamente en "
        "www.iess.gob.ec o utilice los canales oficiales del IESS."
    )


def analizar_correo_ia(datos_correo: dict) -> dict[str, Any]:
    """Analiza el correo y devuelve el contrato que consume rutas_api.py.

    La probabilidad ML es complementaria. La regla oficial del prototipo se decide
    exclusivamente por los indicios determinísticos detectados.
    """
    if not isinstance(datos_correo, Mapping):
        raise TypeError("datos_correo debe ser un diccionario JSON")

    correo = _normalizar_correo(datos_correo)
    config = _cargar_configuracion()
    indicios_detectados = detectar_indicios(correo, config)
    codigos = [item["codigo"] for item in indicios_detectados]
    es_phishing = len(codigos) >= 1
    texto_modelo = construir_texto_modelo(correo)

    probabilidad_ml = _extraer_probabilidad_phishing(texto_modelo)
    predicciones_ml = _extraer_predicciones_indicios(texto_modelo)

    indicios_salida = []
    for item in indicios_detectados:
        codigo = item["codigo"]
        indicios_salida.append({
            "codigo": codigo,
            "nombre": item["nombre"],
            "explicacion": INDICIO_DESCRIPTIONS.get(codigo, item["nombre"]),
            "consejo": CONSEJOS.get(codigo, "Verifique el mensaje por un canal oficial."),
            "evidencia": item.get("evidencia", ""),
            "origen": "regla_deterministica",
        })

    estado = estado_motor_ia()
    return {
        "veredicto": "Sí es phishing" if es_phishing else "No es phishing",
        "es_phishing": es_phishing,
        "total_indicios": len(indicios_salida),
        "codigos_detectados": codigos,
        "indicios": indicios_salida,
        "probabilidad_ml": probabilidad_ml,
        "probabilidad_ml_disponible": probabilidad_ml is not None,
        "probabilidad_ml_nota": (
            "Estimación del clasificador binario; no está calibrada y no sustituye la regla de indicios."
            if probabilidad_ml is not None
            else "No disponible. Entrene/exporte clasificador_phishing.onnx e instale onnxruntime."
        ),
        "predicciones_ml_indicios": predicciones_ml,
        "revision_sugerida_por_ml": None,
        "guion_avatar": _guion_avatar(indicios_salida, es_phishing),
        "canales_oficiales": CANALES_OFICIALES,
        "modelo": estado,
        "regla_negocio": "Uno o más indicios determinísticos => Sí es phishing; cero indicios => No es phishing.",
    }
