"""
VigíaIESS - Servidor local (Reto 1: Seguridad inteligente, cultura consciente)
4 módulos separados para el equipo:
- Alejo: mod_backend_api
- Alex:  mod_ia_motor
- Jos:   mod_avatar_accesibilidad
- Jesly: mod_web_flujo
"""
import os
from flask import Flask, render_template
from mod_backend_api.rutas_api import backend_bp

app = Flask(
    __name__,
    template_folder="mod_web_flujo/templates",
    static_folder="mod_web_flujo/static"
)

# Limitar tamaño máximo de subida a 10 MB por seguridad
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Registrar Blueprint de Alejo (mod_backend_api)
app.register_blueprint(backend_bp)


@app.route("/")
def index():
    """Renderiza la interfaz paso a paso (Jesly + Jos)."""
    template_path = os.path.join(app.template_folder, "index.html")
    if os.path.exists(template_path):
        return render_template("index.html")
    return {
        "servicio": "VigíaIESS Backend API",
        "estado": "Activo (100% Local)",
        "mensaje": "Backend listo. Esperando flujo web",
        "endpoints": [
            "GET  /api/salud",
            "POST /api/paso1-leer",
            "POST /api/paso2-analizar",
            "GET  /api/canales-oficiales",
            "GET  /api/auditoria-practica"
        ]
    }


if __name__ == "__main__":
    print("==================================================================")
    print("  VigíaIESS • Servidor Local Activo en http://localhost:5000")
    print("  Ejecución 100% privada sin envío de correos a terceros")
    print("==================================================================")
    app.run(host="0.0.0.0", port=5000, debug=True)
