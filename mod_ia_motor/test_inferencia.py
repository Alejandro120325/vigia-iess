"""Prueba manual del adaptador y de los artefactos ONNX exportados."""

from __future__ import annotations

import json

from .evaluador import analizar_correo_ia, estado_motor_ia

CASOS = [
    {
        "id": "mensaje_legitimo_conocido",
        "asunto": "Información de seguridad de la cuenta actualizada",
        "cuerpo": "Se inició sesión en su cuenta Microsoft. Puede administrar sus opciones en https://account.microsoft.com/activity.",
        "remitente": "account-security-noreply@accountprotection.microsoft.com",
        "reply_to": "account-security-noreply@accountprotection.microsoft.com",
        "enlaces": [{"url_real": "https://account.microsoft.com/activity", "dominio": "account.microsoft.com", "es_dominio_permitido": True}],
        "adjuntos": [],
        "url_count": 1,
        "attachments_count": 0,
        "enlace_disfrazado": False,
    },
    {
        "id": "mensaje_sospechoso_sintetico",
        "asunto": "URGENTE: reclame su reembolso hoy",
        "cuerpo": "Ingrese su usuario y contraseña. Transfiera $250 para activar el servicio. Acceda en https://t.ly/ejemplo.",
        "remitente": "avisos@iess-beneficio-falso.example",
        "reply_to": "respuestas@otro-dominio.example",
        "enlaces": [{"url_real": "https://t.ly/ejemplo", "dominio": "t.ly", "es_dominio_permitido": False, "es_acortador": True}],
        "adjuntos": [],
        "url_count": 1,
        "attachments_count": 0,
        "enlace_disfrazado": False,
    },
]


def main() -> None:
    print(json.dumps({"estado_motor": estado_motor_ia()}, ensure_ascii=False, indent=2))
    for caso in CASOS:
        resultado = analizar_correo_ia(caso)
        print(json.dumps({
            "caso": caso["id"],
            "veredicto": resultado["veredicto"],
            "codigos_detectados": resultado["codigos_detectados"],
            "probabilidad_ml": resultado["probabilidad_ml"],
            "predicciones_ml_indicios": resultado["predicciones_ml_indicios"],
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
