"""
Canales oficiales del IESS y dominios institucionales permitidos.
"""

CANALES_OFICIALES_IESS = {
    "portal_institucional": "www.iess.gob.ec",
    "aplicaciones_afiliado": "app.iess.gob.ec",
    "denuncias_web": "denuncias.iess.gob.ec",
    "denuncias_correo": "gestiondenuncias@iess.gob.ec",
    "whatsapp_institucional": "+593 9 62532338",
    "atencion_correo": "atencionalusuario@iess.gob.ec",
    "atencion_telefono": "593 2 3945666",
    "seguridad_informacion": "seguridad.informacion@iess.gob.ec",
    "portal_estado": "www.gob.ec/iess"
}

DOMINIOS_PERMITIDOS = (
    "iess.gob.ec",
    "biess.fin.ec",
    "gob.ec",
    "sri.gob.ec",
    "registrocivil.gob.ec",
    "microsoft.com",
    "accountprotection.microsoft.com",
    "google.com",
    "zoom.us"
)

ACORTADORES_CONOCIDOS = (
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "cutt.ly",
    "t.ly",
    "cshort.jp",
    "goo.gl",
    "ow.ly",
    "is.gd"
)

EXTENSIONES_ADJUNTOS_PELIGROSAS = (
    ".zip", ".rar", ".exe", ".apk", ".html", ".htm",
    ".docm", ".xlsm", ".scr", ".bat", ".js", ".vbs"
)


def es_dominio_oficial_o_conocido(dominio: str) -> bool:
    """Verifica si el dominio pertenece al IESS, Estado ecuatoriano o servicios permitidos."""
    dom = (dominio or "").lower().strip().lstrip("www.")
    if not dom:
        return True
    return any(dom == permitido or dom.endswith("." + permitido) for permitido in DOMINIOS_PERMITIDOS)
