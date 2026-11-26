"""Prueba local del modelo ONNX junto con las reglas compartidas del detector."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort

from reglas_indicios import construir_texto_modelo, detectar_indicios


HERE = Path(__file__).resolve().parent
EXPORT_DIR = HERE / "export"

EMAILS = [
    {
        "id": "legitimo",
        "subject": "Planilla de aportes disponible",
        "body": (
            "Su planilla de aportes de enero está disponible. Consulte el detalle "
            "en el portal oficial https://www.iess.gob.ec."
        ),
        "urls": "https://www.iess.gob.ec",
        "attachments_types": "",
        "sender": "notificaciones@iess.gob.ec",
        "reply_to": "notificaciones@iess.gob.ec",
    },
    {
        "id": "phishing",
        "subject": "URGENTE: último aviso, reclame su bono hoy",
        "body": (
            "Su cuenta será bloqueada y perderá sus beneficios. Para recibir el "
            "reembolso ingrese usuario y contraseña, envíe su cédula y transfiera "
            "una tasa hoy mismo. Escanee el QR y continúe en "
            "https://bit.ly/bono-iess."
        ),
        "urls": "https://bit.ly/bono-iess",
        "attachments_types": "[archivo.exe]",
        "sender": "notificaciones@iess-servicios.example",
        "reply_to": "respuesta@correo-gratis.example",
    },
]


def _extract_model_labels(session: ort.InferenceSession, text: str) -> list[int]:
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: np.asarray([[text]], dtype=object)})
    metadata = session.get_outputs()

    # Preferimos salidas de etiquetas por nombre o por tipo entero y forma compatible.
    label_values: list[int] | None = None
    for meta, output in zip(metadata, outputs):
        array = np.asarray(output)
        name = meta.name.lower()
        if "label" in name and array.size == 11:
            label_values = array.reshape(-1).astype(int).tolist()
            break
    if label_values is None:
        for meta, output in zip(metadata, outputs):
            array = np.asarray(output)
            if "int64" in meta.type and array.size == 11:
                label_values = array.reshape(-1).astype(int).tolist()
                break
    if label_values is None:
        raise RuntimeError(
            "No se pudo identificar la salida ONNX con las 11 etiquetas. "
            f"Salidas: {[(item.name, item.type, item.shape) for item in metadata]}"
        )
    if any(value not in (0, 1) for value in label_values):
        raise RuntimeError(f"El modelo devolvió etiquetas inesperadas: {label_values}")
    return label_values


def _avatar_script(indications: list[dict[str, str]], phishing: bool) -> str:
    if not phishing:
        return (
            "Este correo no presenta indicios detectados por las reglas ni por el modelo. "
            "Aun así, verifique el remitente y acceda al IESS escribiendo "
            "www.iess.gob.ec directamente en su navegador."
        )
    summary = "; ".join(
        f"{item['codigo']}: {item['nombre']}" for item in indications
    )
    return (
        f"Alerta: este correo presenta señales de phishing. Indicios: {summary}. "
        "No abra enlaces ni adjuntos, y no comparta claves o datos personales. "
        "Verifique el mensaje en www.iess.gob.ec o repórtelo en "
        "denuncias.iess.gob.ec. "
        "Subtítulo: No compartas tus claves; verifica siempre en canales oficiales."
    )


def main() -> None:
    model_path = EXPORT_DIR / "detector_iess.onnx"
    config_path = EXPORT_DIR / "config_reglas.json"
    for path in (model_path, config_path):
        if not path.is_file():
            raise FileNotFoundError(
                f"Falta {path.name}. Ejecuta primero: "
                "source .venv/bin/activate && python train_export.py"
            )

    with config_path.open(encoding="utf-8") as file:
        config: dict[str, Any] = json.load(file)
    session = ort.InferenceSession(
        str(model_path),
        providers=["CPUExecutionProvider"],
    )

    results = []
    for email in EMAILS:
        indications_by_code = {
            item["codigo"]: item
            for item in detectar_indicios(email, config)
        }
        predicted = _extract_model_labels(
            session,
            construir_texto_modelo(email),
        )
        for index, value in enumerate(predicted, start=1):
            code = f"I{index}"
            if value and code not in indications_by_code:
                indications_by_code[code] = {
                    "codigo": code,
                    "nombre": next(
                        item["nombre"] for item in config["indicios"]
                        if item["codigo"] == code
                    ),
                    "evidencia": "Señal estimada por el modelo a partir del contenido del correo.",
                }

        indications = sorted(
            indications_by_code.values(),
            key=lambda item: int(item["codigo"][1:]),
        )
        phishing = bool(indications)
        results.append({
            "id": email["id"],
            "es_phishing": phishing,
            "indicios_detectados": indications,
            "guion_avatar": _avatar_script(indications, phishing),
            "canales_oficiales": config["canales_oficiales"],
        })

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
