"""
Canales y dominios clasificados para Vigía IESS.
IMPORTANTE: un servicio externo conocido no se presenta como canal oficial del IESS.
"""

CANALES_OFICIALES_IESS = {
    "portal_institucional": "https://www.iess.gob.ec",
    "aplicaciones_afiliado": "https://app.iess.gob.ec",
    "denuncias_web": "https://denuncias.iess.gob.ec",
    "denuncias_correo": "gestiondenuncias@iess.gob.ec",
    "whatsapp_institucional": "+593 9 62532338",
    "atencion_correo": "atencionalusuario@iess.gob.ec",
    "atencion_telefono": "02 3945666",
    "seguridad_informacion": "seguridad.informacion@iess.gob.ec",
    "portal_estado": "https://www.gob.ec/iess",
}

# Dominios institucionales del IESS.
DOMINIOS_OFICIALES_IESS = (
    "iess.gob.ec",
)

# Otros dominios públicos/institucionales.
DOMINIOS_INSTITUCIONALES_ECUADOR = (
    "biess.fin.ec",
    "gob.ec",
    "sri.gob.ec",
    "registrocivil.gob.ec",
)

# Servicios externos legítimos contemplados por los escenarios de evaluación.
DOMINIOS_SERVICIOS_EXTERNOS_CONOCIDOS = (
    "microsoft.com",
    "google.com",
    "zoom.us",
)

DOMINIOS_PERMITIDOS = (
    DOMINIOS_OFICIALES_IESS
    + DOMINIOS_INSTITUCIONALES_ECUADOR
    + DOMINIOS_SERVICIOS_EXTERNOS_CONOCIDOS
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
    "is.gd",
)

DOMINIOS_CORREO_GRATUITO = (
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "yahoo.com",
    "yahoo.es",
    "icloud.com",
    "live.com",
    "proton.me",
)

EXTENSIONES_ADJUNTOS_PELIGROSAS = (
    ".zip", ".rar", ".7z", ".exe", ".apk", ".html", ".htm",
    ".docm", ".xlsm", ".scr", ".bat", ".cmd", ".js", ".vbs",
    ".ps1", ".jar", ".msi", ".iso",
)


def normalizar_dominio(dominio: str) -> str:
    """Normaliza hostnames sin aceptar coincidencias por subcadenas."""
    host = (dominio or "").strip().lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError:
        return ""
    return host


def dominio_pertenece_a_lista(dominio: str, lista: tuple[str, ...]) -> bool:
    host = normalizar_dominio(dominio)
    return bool(host) and any(
        host == permitido or host.endswith("." + permitido)
        for permitido in lista
    )


def clasificar_dominio(dominio: str) -> str:
    """Devuelve una categoría precisa para mostrar en la interfaz."""
    if dominio_pertenece_a_lista(dominio, DOMINIOS_OFICIALES_IESS):
        return "oficial_iess"
    if dominio_pertenece_a_lista(dominio, DOMINIOS_INSTITUCIONALES_ECUADOR):
        return "institucional_ecuatoriano"
    if dominio_pertenece_a_lista(dominio, DOMINIOS_SERVICIOS_EXTERNOS_CONOCIDOS):
        return "servicio_externo_conocido"
    return "no_verificado"


def es_dominio_oficial_o_conocido(dominio: str) -> bool:
    """Compatibilidad con código anterior: indica si la política permite el dominio."""
    return dominio_pertenece_a_lista(dominio, DOMINIOS_PERMITIDOS)


def es_dominio_oficial_iess(dominio: str) -> bool:
    return dominio_pertenece_a_lista(dominio, DOMINIOS_OFICIALES_IESS)


def es_acortador(dominio: str) -> bool:
    return dominio_pertenece_a_lista(dominio, ACORTADORES_CONOCIDOS)
