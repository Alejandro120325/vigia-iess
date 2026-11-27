"""Aplicación integrada de Vigía IESS.

Sirve la interfaz web, expone la API REST y conecta el motor de análisis.
Por defecto escucha solo en localhost para mantener el procesamiento local.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from flask import Flask, jsonify, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge

from mod_backend_api.rutas_api import backend_bp

ROOT_DIR = Path(__file__).resolve().parent
WEB_DIR = ROOT_DIR / "mod_web_flujo"
ACCESSIBILITY_DIR = ROOT_DIR / "mod_avatar_accesibilidad"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
app.config["REQUIRE_SIGNED_CORREO"] = True

# La firma evita que el objeto del paso 1 sea alterado antes del análisis.
# En producción puede definirse VIGIA_INTEGRITY_SECRET (mínimo 32 caracteres).
secret_configurado = os.environ.get("VIGIA_INTEGRITY_SECRET", "").strip()
if secret_configurado and len(secret_configurado) < 32:
    raise RuntimeError("VIGIA_INTEGRITY_SECRET debe tener al menos 32 caracteres.")
app.config["INTEGRITY_SECRET"] = secret_configurado or secrets.token_hex(32)

app.register_blueprint(backend_bp)


@app.get("/")
def inicio():
    """Entrega la aplicación web principal."""
    return send_from_directory(WEB_DIR, "index_integrado.html")


@app.get("/assets/<path:filename>")
def assets_web(filename: str):
    """Sirve CSS y JavaScript del flujo web."""
    return send_from_directory(WEB_DIR, filename)


@app.get("/accesibilidad/<path:filename>")
def assets_accesibilidad(filename: str):
    """Sirve los módulos locales de accesibilidad y el avatar."""
    return send_from_directory(ACCESSIBILITY_DIR, filename)


@app.after_request
def cabeceras_seguridad(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://ajax.googleapis.com; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "font-src 'self' data:; connect-src 'self'; object-src 'none'; "
        "base-uri 'self'; frame-ancestors 'none'",
    )
    return response


@app.errorhandler(RequestEntityTooLarge)
def archivo_demasiado_grande(_error):
    return jsonify({
        "ok": False,
        "error": "El archivo supera el límite permitido de 10 MB.",
    }), 413


if __name__ == "__main__":
    host = os.environ.get("VIGIA_HOST", "127.0.0.1")
    port = int(os.environ.get("VIGIA_PORT", "5000"))
    print("=" * 68)
    print("VIGÍA IESS · Aplicación integrada")
    print(f"Interfaz: http://{host}:{port}")
    print("Procesamiento local · No visita enlaces ni envía correos a terceros")
    print("=" * 68)
    app.run(host=host, port=port, debug=False)
