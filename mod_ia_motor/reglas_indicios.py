"""Reglas determinísticas I1-I11 del motor Vigía IESS.

Las descripciones y criterios conservan la definición documentada en el módulo
actual de Alex. El resultado determinístico es el que aplica la regla de negocio:
uno o más indicios => phishing; cero indicios => no phishing.
"""

from __future__ import annotations

import html
import re
from typing import Any, Mapping
from urllib.parse import urlsplit

INDICIO_NAMES = {
    "I1": "Urgencia artificial",
    "I2": "Enlace a dominio no oficial",
    "I3": "Solicitud de credenciales, claves, códigos o tarjeta",
    "I4": "Enlace acortado u oculto",
    "I5": "Adjunto o instalación sospechosa",
    "I6": "Premio, bono o reembolso inesperado",
    "I7": "Remitente no oficial",
    "I8": "Amenaza o pérdida de beneficio",
    "I9": "Solicitud de datos personales o documentos",
    "I10": "Solicitud de pago o transferencia",
    "I11": "Código QR hacia sitio no verificable",
}

INDICIO_DESCRIPTIONS = {
    "I1": "El correo utiliza plazos cortos o presión para provocar una acción inmediata.",
    "I2": "El mensaje incluye un enlace cuyo dominio no está en la lista permitida.",
    "I3": "El mensaje solicita contraseñas, claves, códigos, tokens o datos de tarjeta.",
    "I4": "El enlace utiliza un acortador o muestra un destino distinto al enlace real.",
    "I5": "El mensaje incluye un adjunto peligroso o solicita instalar/descargar software.",
    "I6": "El mensaje ofrece un premio, bono, devolución o reembolso inesperado.",
    "I7": "El remitente no pertenece a un dominio reconocido o el Reply-To no coincide.",
    "I8": "El mensaje amenaza con suspensión, bloqueo, multa o pérdida de beneficios.",
    "I9": "El mensaje solicita cédula, documentos u otros datos personales.",
    "I10": "El mensaje solicita pagos, depósitos, transferencias o criptomonedas.",
    "I11": "El mensaje pide escanear un QR cuyo destino no ha sido verificado.",
}

CONSEJOS = {
    "I1": "No actúe por presión. Verifique el aviso entrando por su cuenta al portal oficial.",
    "I2": "No abra el enlace. Escriba usted mismo www.iess.gob.ec en el navegador.",
    "I3": "Nunca comparta claves, contraseñas ni códigos de verificación por correo.",
    "I4": "No utilice enlaces acortados o disfrazados. Verifique el destino por un canal oficial.",
    "I5": "No abra ni ejecute el adjunto. Confirme el mensaje por un canal oficial.",
    "I6": "Desconfíe de beneficios inesperados que exigen datos, pagos o validaciones externas.",
    "I7": "Compruebe el dominio completo del remitente y no responda a direcciones sospechosas.",
    "I8": "No permita que una amenaza le haga actuar rápido. Consulte directamente al IESS.",
    "I9": "No envíe su cédula ni datos personales mediante enlaces recibidos por correo.",
    "I10": "No transfiera ni deposite dinero para desbloquear supuestos beneficios.",
    "I11": "No escanee el QR. Su destino no se ha verificado; consulte por un canal oficial.",
}

DOMINIOS_PERMITIDOS = [
    "iess.gob.ec", "biess.fin.ec", "gob.ec", "sri.gob.ec",
    "registrocivil.gob.ec", "microsoft.com", "google.com", "zoom.us",
]
DOMINIOS_ACORTADORES = [
    "bit.ly", "tinyurl.com", "t.co", "cutt.ly", "t.ly", "cshort.jp", "goo.gl", "ow.ly", "is.gd",
]
DOMINIOS_CORREO_GRATUITO = [
    "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.es",
    "icloud.com", "live.com", "proton.me",
]

URL_REGEX = r"https?://[^\s<>\"'`]+"
HTML_LINK_REGEX = r"""<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a\s*>"""

PATRONES = {
    "I1": [
        r"\b(?:act[uú]e|actuar|responda|confirme|valide|regularice)\s+(?:hoy|ahora|de inmediato|inmediatamente)\b",
        r"\b(?:[uú]ltimo aviso|plazo m[aá]ximo|en las pr[oó]ximas?\s+\d+\s*(?:horas?|minutos?)|antes de hoy)\b",
        r"\b(?:urgente|con urgencia|acci[oó]n inmediata)\b",
    ],
    "I3": [
        r"\b(?:ingrese|env[ií]e|comparta|confirme|actualice|proporcione|escriba)\b[^.!?\n]{0,55}\b(?:contrase[nñ]a|clave|token|tarjeta|CVV|PIN)\b",
        r"\b(?:contrase[nñ]a|clave|token|tarjeta|CVV|PIN)\b[^.!?\n]{0,55}\b(?:ingrese|env[ií]e|comparta|confirme|actualice|proporcione|escriba)\b",
        r"\b(?:ingrese|env[ií]e|comparta|confirme|proporcione|escriba)\b[^.!?\n]{0,45}\bc[oó]digo\s+(?:de\s+(?:verificaci[oó]n|seguridad|acceso)|SMS|temporal)\b",
        r"\b(?:c[oó]digo\s+(?:de\s+(?:verificaci[oó]n|seguridad|acceso)|SMS|temporal))\b[^.!?\n]{0,45}\b(?:ingrese|env[ií]e|comparta|confirme|proporcione|escriba)\b",
        r"\b(?:usuario\s+y\s+contrase[nñ]a|credenciales)\b",
    ],
    "I5": [
        r"\b[\w.-]+\.(?:zip|rar|7z|exe|apk|html?|js|docm|xlsm|scr|bat|cmd|vbs|ps1|jar|msi|iso)\b",
        r"\b(?:instale|descargue|instalar|descargar)\b.{0,60}\b(?:aplicaci[oó]n|app|programa|archivo)\b",
        r"\b(?:aplicaci[oó]n|app|programa)\b.{0,60}\b(?:instale|descargue|instalar|descargar)\b",
    ],
    "I6": [
        r"\b(?:premio|bono|reembolso|devoluci[oó]n|saldo a su favor|pago en exceso)\b",
        r"\b(?:ha ganado|gan[oó]|reciba)\b.{0,50}\b(?:premio|bono|reembolso|dinero)\b",
    ],
    "I8": [
        r"\b(?:suspensi[oó]n|suspend(?:er|ida)|bloqueo|bloquear|multa|embargo|p[eé]rdida de beneficios?)\b",
        r"\b(?:ser[aá] suspendid[oa]|se bloquear[aá]|perder[aá] sus beneficios)\b",
    ],
    "I9": [
        r"\b(?:env[ií]e|ingrese|proporcione|adjunte|cargue|confirme|actualice)\b.{0,90}\b(?:c[eé]dula|identificaci[oó]n|fecha de nacimiento|documento|selfie|datos personales|nombres completos|n[uú]mero de celular)\b",
        r"\b(?:c[eé]dula|fecha de nacimiento|selfie con documento|datos personales|nombres completos)\b",
    ],
    "I10": [
        r"\b(?:transfiera|deposite|pague|realice el pago|efect[uú]e el pago|env[ií]e dinero)\b",
        r"\b(?:dep[oó]sito|transferencia|tasa de activaci[oó]n|multa|criptomonedas?|bitcoin)\b",
    ],
}

CANALES_OFICIALES = {
    "portal": "www.iess.gob.ec",
    "app_afiliado": "app.iess.gob.ec",
    "denuncias": ["denuncias.iess.gob.ec", "gestiondenuncias@iess.gob.ec"],
    "whatsapp": "+593 9 62532338",
    "atencion_telefonica": "02 3945666",
    "atencion_correo": "atencionalusuario@iess.gob.ec",
    "seguridad_informacion": "seguridad.informacion@iess.gob.ec",
}


def crear_config_reglas() -> dict[str, Any]:
    return {
        "version": 2,
        "regla_negocio": "Phishing si se detecta al menos un indicio I1-I11; sin indicios, no phishing.",
        "listas_blancas": DOMINIOS_PERMITIDOS,
        "listas_negras": {
            "dominios_acortadores": DOMINIOS_ACORTADORES,
            "dominios_correo_gratuito": DOMINIOS_CORREO_GRATUITO,
            "extensiones_sospechosas": [
                ".zip", ".rar", ".7z", ".exe", ".apk", ".html", ".htm", ".js",
                ".docm", ".xlsm", ".scr", ".bat", ".cmd", ".vbs", ".ps1", ".jar", ".msi", ".iso",
            ],
        },
        "remitentes_iess_oficiales": ["iess.gob.ec"],
        "patrones": PATRONES,
        "regex": {"url": URL_REGEX, "enlace_html": HTML_LINK_REGEX, "banderas": "i"},
        "indicios": [
            {"codigo": code, "nombre": INDICIO_NAMES[code], "descripcion": INDICIO_DESCRIPTIONS[code]}
            for code in (f"I{i}" for i in range(1, 12))
        ],
        "consejos": CONSEJOS,
        "canales_oficiales": CANALES_OFICIALES,
    }


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return " ".join(_as_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_as_text(item) for item in value.values())
    return str(value)


def construir_texto_modelo(email: Mapping[str, Any]) -> str:
    """Misma composición para entrenamiento e inferencia; admite claves ES/EN."""
    aliases = {
        "subject": ("subject", "asunto"),
        "body": ("body", "cuerpo"),
        "urls": ("urls", "enlaces"),
        "attachments_types": ("attachments_types",),
        "attachments_sizes": ("attachments_sizes",),
        "sender": ("sender", "remitente"),
        "reply_to": ("reply_to",),
    }
    output: list[str] = []
    for feature, keys in aliases.items():
        value = next((email.get(key) for key in keys if email.get(key) not in (None, "", [])), None)
        text = _as_text(value).strip()
        if text:
            output.append(f"{feature}: {text}")
    return "\n".join(output)


def _dominio_de_url(url: str) -> str:
    candidate = html.unescape((url or "").strip().rstrip(".,;:!?)]}"))
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    try:
        return (urlsplit(candidate).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


def _dominio_permitido(domain: str, allowlist: list[str]) -> bool:
    domain = (domain or "").lower().rstrip(".")
    return any(domain == allowed or domain.endswith(f".{allowed}") for allowed in allowlist)


def _urls(text: str, pattern: str = URL_REGEX) -> list[str]:
    return list(dict.fromkeys(
        match.rstrip(".,;:!?)]}") for match in re.findall(pattern, text or "", re.IGNORECASE)
    ))


def _detectar_indicios_url(email: Mapping[str, Any], text: str, config: Mapping[str, Any]) -> list[dict[str, str]]:
    allowlist = list(config["listas_blancas"])
    shorteners = list(config["listas_negras"]["dominios_acortadores"])
    structured_links = email.get("enlaces") or []
    urls = _urls(text)
    for item in structured_links:
        if isinstance(item, Mapping):
            url = str(item.get("url_real") or item.get("url_neutralizada") or "")
            if url:
                urls.append(url)
    urls = list(dict.fromkeys(urls))

    external = []
    short = []
    for url in urls:
        host = _dominio_de_url(url)
        if not host:
            continue
        if not _dominio_permitido(host, allowlist):
            external.append((url, host))
        if _dominio_permitido(host, shorteners):
            short.append((url, host))

    found: list[dict[str, str]] = []
    if external:
        found.append({
            "codigo": "I2",
            "nombre": INDICIO_NAMES["I2"],
            "evidencia": f"Dominio no incluido en la lista permitida: {external[0][1]}",
        })

    disguised = bool(email.get("enlace_disfrazado"))
    for raw_url, raw_visible in re.findall(HTML_LINK_REGEX, text, re.IGNORECASE | re.DOTALL):
        visible = html.unescape(re.sub(r"<[^>]+>", "", raw_visible)).strip()
        visible_host = _dominio_de_url(visible) if visible else ""
        real_host = _dominio_de_url(raw_url)
        if visible_host and real_host and visible_host != real_host:
            disguised = True
        elif "iess.gob.ec" in visible.lower() and real_host and not (
            real_host == "iess.gob.ec" or real_host.endswith(".iess.gob.ec")
        ):
            disguised = True

    if short or disguised:
        if short:
            evidence = f"Enlace acortado detectado: {short[0][1]}"
        else:
            evidence = "El texto visible del enlace no coincide con el dominio real."
        found.append({"codigo": "I4", "nombre": INDICIO_NAMES["I4"], "evidencia": evidence})
    return found


def _detectar_remitente(email: Mapping[str, Any], config: Mapping[str, Any]) -> dict[str, str] | None:
    sender = _as_text(email.get("sender") or email.get("remitente")).strip().lower()
    reply = _as_text(email.get("reply_to")).strip().lower()
    sender_match = re.search(r"[\w.+-]+@([\w.-]+\.[a-z]{2,})", sender)
    reply_match = re.search(r"[\w.+-]+@([\w.-]+\.[a-z]{2,})", reply)
    sender_address = sender_match.group(0) if sender_match else ""
    reply_address = reply_match.group(0) if reply_match else ""
    sender_domain = sender_match.group(1).lower().rstrip(".") if sender_match else ""

    if sender_address and reply_address and sender_address != reply_address:
        return {
            "codigo": "I7",
            "nombre": INDICIO_NAMES["I7"],
            "evidencia": f"From y Reply-To no coinciden: {sender_address} / {reply_address}",
        }

    if not sender_domain:
        return None

    free_domains = list(config["listas_negras"]["dominios_correo_gratuito"])
    if _dominio_permitido(sender_domain, free_domains):
        return {
            "codigo": "I7", "nombre": INDICIO_NAMES["I7"],
            "evidencia": f"El remitente utiliza un servicio de correo gratuito: {sender_domain}",
        }

    if "iess" in sender_domain and sender_domain != "iess.gob.ec" and not sender_domain.endswith(".iess.gob.ec"):
        return {
            "codigo": "I7", "nombre": INDICIO_NAMES["I7"],
            "evidencia": f"El dominio parece imitar al IESS, pero no es oficial: {sender_domain}",
        }

    if not _dominio_permitido(sender_domain, list(config["listas_blancas"])):
        return {
            "codigo": "I7", "nombre": INDICIO_NAMES["I7"],
            "evidencia": f"El dominio del remitente no está reconocido: {sender_domain}",
        }
    return None


def detectar_indicios(
    email: Mapping[str, Any],
    config: Mapping[str, Any] | None = None,
) -> list[dict[str, str]]:
    """Devuelve solo indicios determinísticos con evidencia legible."""
    rules = config or crear_config_reglas()
    text = "\n".join(
        _as_text(email.get(key))
        for key in ("subject", "asunto", "body", "cuerpo", "urls", "attachments_types", "attachments_sizes")
        if email.get(key) not in (None, "", [])
    )

    found = _detectar_indicios_url(email, text, rules)

    for code in ("I1", "I3", "I5", "I6", "I8", "I9", "I10"):
        for pattern in rules["patrones"][code]:
            match = re.search(pattern, text, re.IGNORECASE | re.UNICODE)
            if match:
                found.append({"codigo": code, "nombre": INDICIO_NAMES[code], "evidencia": match.group(0)})
                break

    # I5 también revisa los metadatos estructurados de adjuntos, sin abrirlos.
    adjuntos = email.get("adjuntos") or []
    if not any(item["codigo"] == "I5" for item in found):
        for adjunto in adjuntos:
            if not isinstance(adjunto, Mapping):
                continue
            extension = _as_text(adjunto.get("extension")).lower()
            if extension and extension in rules["listas_negras"]["extensiones_sospechosas"]:
                found.append({
                    "codigo": "I5", "nombre": INDICIO_NAMES["I5"],
                    "evidencia": f"Adjunto con extensión de riesgo: {adjunto.get('nombre', extension)}",
                })
                break

    remitente_indicio = _detectar_remitente(email, rules)
    if remitente_indicio:
        found.append(remitente_indicio)

    # La hoja de práctica espera I11 para instrucciones de escanear QR con destino
    # no verificable, incluso cuando el correo no contiene una URL legible.
    texto_qr = bool(re.search(r"\b(?:c[oó]digo\s+QR|escanee\s+(?:el\s+)?(?:c[oó]digo\s+)?QR|escanear\s+(?:el\s+)?QR)\b", text, re.I))
    qr_adjunto = any(
        isinstance(adjunto, Mapping) and bool(adjunto.get("parece_qr"))
        for adjunto in adjuntos
    )
    if texto_qr or qr_adjunto:
        found.append({
            "codigo": "I11", "nombre": INDICIO_NAMES["I11"],
            "evidencia": "El correo solicita escanear un código QR cuyo destino no se ha verificado.",
        })

    # Un mismo código aparece una sola vez; conserva la primera evidencia.
    unique: dict[str, dict[str, str]] = {}
    for item in found:
        unique.setdefault(item["codigo"], item)
    return [unique[code] for code in sorted(unique, key=lambda value: int(value[1:]))]
