"""Reglas deterministas locales para detectar indicios de phishing del IESS."""

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

DOMINIOS_PERMITIDOS = [
    "iess.gob.ec",
    "app.iess.gob.ec",
    "denuncias.iess.gob.ec",
    "gob.ec",
    "sri.gob.ec",
    "registrocivil.gob.ec",
    "microsoft.com",
    "google.com",
    "zoom.us",
]

DOMINIOS_ACORTADORES = [
    "bit.ly",
    "cutt.ly",
    "cshort.jp",
    "tinyurl.com",
    "t.co",
    "goo.gl",
]

DOMINIOS_CORREO_GRATUITO = [
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "yahoo.com",
    "yahoo.es",
    "icloud.com",
    "live.com",
    "proton.me",
]

URL_REGEX = r"https?://[^\s<>\"'()[\]]+"
HTML_LINK_REGEX = r"""<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a\s*>"""

PATRONES = {
    "I1": [
        r"\b(?:act[uú]e|actuar|responda|confirme|valide|regularice)\s+(?:hoy|ahora|de inmediato|inmediatamente)\b",
        r"\b(?:[uú]ltimo aviso|plazo m[aá]ximo|en las pr[oó]ximas?\s+\d+\s*(?:horas?|minutos?)|antes de hoy)\b",
        r"\b(?:urgente|con urgencia|acci[oó]n inmediata)\b",
    ],
    "I2": [URL_REGEX],
    "I3": [
        r"\b(?:ingrese|env[ií]e|comparta|confirme|actualice|proporcione)\b.{0,70}\b(?:contrase[nñ]a|clave|c[oó]digo|token|tarjeta|CVV|PIN)\b",
        r"\b(?:contrase[nñ]a|clave|c[oó]digo|token|tarjeta|CVV|PIN)\b.{0,70}\b(?:ingrese|env[ií]e|comparta|confirme|actualice|proporcione)\b",
        r"\b(?:usuario\s+y\s+contrase[nñ]a|credenciales)\b",
    ],
    "I4": [
        r"https?://(?:bit\.ly|cutt\.ly|cshort\.jp|tinyurl\.com|t\.co|goo\.gl)/",
        r"<a\b[^>]*href\s*=\s*['\"][^'\"]+['\"][^>]*>.*?</a\s*>",
    ],
    "I5": [
        r"\b[\w.-]+\.(?:zip|exe|apk|html?|js|docm|xlsm)\b",
        r"\b(?:instale|descargue|instalar|descargar)\b.{0,50}\b(?:aplicaci[oó]n|app|programa|archivo)\b",
        r"\b(?:aplicaci[oó]n|app|programa)\b.{0,50}\b(?:instale|descargue|instalar|descargar)\b",
    ],
    "I6": [
        r"\b(?:premio|bono|reembolso|devoluci[oó]n|saldo a su favor|pago en exceso)\b",
        r"\b(?:ha ganado|gan[oó]|reciba)\b.{0,40}\b(?:premio|bono|reembolso|dinero)\b",
    ],
    "I8": [
        r"\b(?:suspensi[oó]n|suspend(?:er|ida)|bloqueo|bloquear|multa|embargo|p[eé]rdida de beneficios?)\b",
        r"\b(?:ser[aá] suspendid[oa]|se bloquear[aá]|perder[aá] sus beneficios)\b",
    ],
    "I9": [
        r"\b(?:env[ií]e|ingrese|proporcione|adjunte|cargue|confirme)\b.{0,70}\b(?:c[eé]dula|identificaci[oó]n|fecha de nacimiento|documento|selfie|datos personales)\b",
        r"\b(?:c[eé]dula|fecha de nacimiento|selfie con documento|datos personales)\b",
    ],
    "I10": [
        r"\b(?:transfiera|deposite|pague|realice el pago|efect[uú]e el pago|env[ií]e dinero)\b",
        r"\b(?:dep[oó]sito|transferencia|tasa de activaci[oó]n|multa|criptomonedas?|bitcoin)\b",
    ],
    "I7": [
        r"[\w.+-]+@[\w.-]+\.[a-z]{2,}",
        r"\bReply-To\b",
    ],
    "I11": [
        r"\b(?:c[oó]digo|escanee|escanear)\s+QR\b",
        r"\bQR\b",
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
    """Devuelve la configuración serializable que comparten Python, Flutter y JS."""
    descriptions = {
        "I1": "Plazos artificialmente cortos o presión para actuar de inmediato.",
        "I2": "Alguna URL apunta a un dominio que no está en la lista permitida.",
        "I3": "El mensaje pide credenciales, claves, códigos o datos de tarjeta.",
        "I4": "La URL usa un acortador o el texto visible oculta su destino.",
        "I5": "Adjunto con extensión riesgosa o solicitud de instalar software.",
        "I6": "Premio, bono, devolución o reembolso inesperado.",
        "I7": "Remitente de correo gratuito, dominio IESS parecido o Reply-To distinto.",
        "I8": "Amenaza de suspensión, bloqueo, multa, embargo o pérdida de beneficios.",
        "I9": "Solicitud de cédula, documentos u otros datos personales.",
        "I10": "Solicitud de pago, depósito, transferencia o criptomonedas.",
        "I11": "Mención de QR junto con un destino no permitido.",
    }
    return {
        "version": 1,
        "regla_negocio": "Phishing si se detecta al menos un indicio I1-I11.",
        "listas_blancas": DOMINIOS_PERMITIDOS,
        "listas_negras": {
            "dominios_acortadores": DOMINIOS_ACORTADORES,
            "dominios_correo_gratuito": DOMINIOS_CORREO_GRATUITO,
            "extensiones_sospechosas": [
                ".zip", ".exe", ".apk", ".html", ".htm", ".js", ".docm", ".xlsm"
            ],
        },
        "remitentes_iess_oficiales": ["iess.gob.ec"],
        "patrones": {code: patterns for code, patterns in PATRONES.items()},
        "regex": {
            "url": URL_REGEX,
            "enlace_html": HTML_LINK_REGEX,
            "banderas": "i",
        },
        "indicios": [
            {
                "codigo": code,
                "nombre": INDICIO_NAMES[code],
                "descripcion": descriptions[code],
            }
            for code in INDICIO_NAMES
        ],
        "canales_oficiales": CANALES_OFICIALES,
    }


def construir_texto_modelo(email: Mapping[str, Any]) -> str:
    """Construye la misma entrada textual para entrenamiento e inferencia."""
    fields = (
        "subject",
        "body",
        "urls",
        "attachments_types",
        "attachments_sizes",
        "sender",
        "reply_to",
    )
    return "\n".join(
        f"{field}: {email[field]}"
        for field in fields
        if email.get(field) is not None and str(email[field]).strip()
    )


def _dominio_de_url(url: str) -> str:
    candidate = url.strip().rstrip(".,;:!?)]}")
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    try:
        return (urlsplit(candidate).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


def _dominio_permitido(domain: str, allowlist: list[str]) -> bool:
    return any(domain == allowed or domain.endswith(f".{allowed}") for allowed in allowlist)


def _get_text(email: Mapping[str, Any]) -> str:
    return "\n".join(
        str(email.get(key, "") or "")
        for key in ("subject", "body", "urls", "attachments_types", "attachments_sizes")
    )


def _urls(text: str, pattern: str) -> list[str]:
    return [match.rstrip(".,;:!?)]}") for match in re.findall(pattern, text, re.IGNORECASE)]


def _detect_url_indicios(text: str, config: Mapping[str, Any]) -> list[dict[str, str]]:
    allowlist = list(config["listas_blancas"])
    shorteners = list(config["listas_negras"]["dominios_acortadores"])
    urls = _urls(text, config["regex"]["url"])
    found: list[dict[str, str]] = []
    external_urls = [
        url for url in urls
        if (domain := _dominio_de_url(url)) and not _dominio_permitido(domain, allowlist)
    ]

    if external_urls:
        found.append({
            "codigo": "I2",
            "nombre": INDICIO_NAMES["I2"],
            "evidencia": f"Dominio no permitido: {_dominio_de_url(external_urls[0])}",
        })

    shortened = [
        url for url in urls
        if _dominio_permitido(_dominio_de_url(url), shorteners)
    ]
    html_links = re.findall(config["regex"]["enlace_html"], text, re.IGNORECASE | re.DOTALL)
    hidden_link = None
    for raw_url, raw_visible in html_links:
        visible = html.unescape(re.sub(r"<[^>]+>", "", raw_visible)).strip()
        destination = _dominio_de_url(html.unescape(raw_url))
        if visible and destination and destination not in visible.lower():
            hidden_link = (visible, destination)
            break
    if shortened or hidden_link:
        evidence = (
            f"Acortador detectado: {_dominio_de_url(shortened[0])}"
            if shortened
            else f"Texto visible «{hidden_link[0]}» oculta el dominio {hidden_link[1]}"
        )
        found.append({"codigo": "I4", "nombre": INDICIO_NAMES["I4"], "evidencia": evidence})

    if re.search(r"\bQR\b", text, re.IGNORECASE) and external_urls:
        found.append({
            "codigo": "I11",
            "nombre": INDICIO_NAMES["I11"],
            "evidencia": f"QR asociado a dominio no permitido: {_dominio_de_url(external_urls[0])}",
        })
    return found


def _detect_sender(email: Mapping[str, Any], config: Mapping[str, Any]) -> dict[str, str] | None:
    sender = str(email.get("sender", "") or "").strip().lower()
    reply_to = str(email.get("reply_to", "") or "").strip().lower()
    sender_address = re.search(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}", sender)
    reply_address = re.search(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}", reply_to)
    sender_address_text = sender_address.group(0) if sender_address else ""
    reply_address_text = reply_address.group(0) if reply_address else ""
    sender_domain = sender_address_text.rsplit("@", 1)[-1] if sender_address_text else ""
    free_domains = config["listas_negras"]["dominios_correo_gratuito"]

    if sender_domain and _dominio_permitido(sender_domain, free_domains):
        return {
            "codigo": "I7",
            "nombre": INDICIO_NAMES["I7"],
            "evidencia": f"Remitente usa dominio de correo gratuito: {sender_domain}",
        }
    if sender_domain and "iess" in sender_domain and sender_domain != "iess.gob.ec":
        return {
            "codigo": "I7",
            "nombre": INDICIO_NAMES["I7"],
            "evidencia": f"Dominio parecido al IESS, pero no oficial: {sender_domain}",
        }
    if sender_domain and not _dominio_permitido(sender_domain, config["listas_blancas"]):
        return {
            "codigo": "I7",
            "nombre": INDICIO_NAMES["I7"],
            "evidencia": f"Remitente usa un dominio no incluido en la lista permitida: {sender_domain}",
        }
    if sender_address_text and reply_address_text and sender_address_text != reply_address_text:
        return {
            "codigo": "I7",
            "nombre": INDICIO_NAMES["I7"],
            "evidencia": f"From y Reply-To no coinciden: {sender_address_text} / {reply_address_text}",
        }
    return None


def detectar_indicios(
    email: Mapping[str, Any],
    config: Mapping[str, Any] | None = None,
) -> list[dict[str, str]]:
    """Detecta indicios y devuelve su código, nombre y evidencia textual."""
    rules = config or crear_config_reglas()
    text = _get_text(email)
    found = _detect_url_indicios(text, rules)

    for code, patterns in rules["patrones"].items():
        if code in {"I2", "I4", "I7", "I11"}:
            continue
        match = None
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.UNICODE)
            if match:
                break
        if match:
            found.append({
                "codigo": code,
                "nombre": INDICIO_NAMES[code],
                "evidencia": match.group(0),
            })

    sender_indication = _detect_sender(email, rules)
    if sender_indication:
        found.append(sender_indication)

    # El nombre del archivo puede llegar separado del texto del correo.
    attachments = str(email.get("attachments_types", "") or "")
    filename = str(email.get("attachments", "") or "")
    attachment_text = f"{attachments} {filename}"
    if not any(item["codigo"] == "I5" for item in found):
        match = None
        for pattern in rules["patrones"]["I5"]:
            match = re.search(pattern, attachment_text, re.IGNORECASE)
            if match:
                break
        if match:
            found.append({
                "codigo": "I5",
                "nombre": INDICIO_NAMES["I5"],
                "evidencia": match.group(0),
            })

    return sorted(found, key=lambda item: int(item["codigo"][1:]))
