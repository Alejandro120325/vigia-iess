"""
Extracción y aislamiento seguro de correos electrónicos en formato:
1. PDF exportado desde Gmail (.pdf)
2. Archivo estándar de correo (.eml)
3. Texto pegado manualmente
"""

import hashlib
import io
import re
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from urllib.parse import urlparse
from pypdf import PdfReader

from mod_backend_api.config_canales import (
    ACORTADORES_CONOCIDOS,
    EXTENSIONES_ADJUNTOS_PELIGROSAS,
    es_dominio_oficial_o_conocido,
)


def _neutralizar_url(url: str) -> str:
    """Desactiva visualmente la URL para impedir clics accidentales."""
    return url.replace("https://", "https[://]").replace("http://", "http[://]")


def _procesar_enlaces(texto_completo: str, html_crudo: str = "") -> tuple[list[dict], bool]:
    """Extrae URLs del texto y del HTML oculto, clasificando su legitimidad."""
    urls_raw = re.findall(r'https?://[^\s<>"\')]+', f"{texto_completo} {html_crudo}", flags=re.I)
    urls_unicas = list(dict.fromkeys([u.rstrip(".,;:)") for u in urls_raw]))

    enlaces = []
    for u in urls_unicas:
        parsed = urlparse(u)
        dominio = parsed.netloc.lower()
        es_oficial = es_dominio_oficial_o_conocido(dominio)
        es_acortador = any(ac in dominio for ac in ACORTADORES_CONOCIDOS)
        enlaces.append({
            "url_real": u,
            "url_neutralizada": _neutralizar_url(u),
            "dominio": dominio or "Dominio no identificado",
            "es_oficial": es_oficial,
            "es_acortador": es_acortador
        })

    # Verificar si el texto visible del enlace engaña respecto al destino real (Indicio I4)
    enlace_oculto_disfrazado = False
    pares_anchor = re.findall(
        r'<a[^>]+href=["\'](https?://[^"\']+)["\'][^>]*>(.*?)</a>',
        html_crudo,
        flags=re.I | re.S
    )
    for href, texto_visible in pares_anchor:
        visible_limpio = re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", texto_visible)).strip().lower()
        dom_real = urlparse(href).netloc.lower().lstrip("www.")
        if ("iess.gob.ec" in visible_limpio or "http" in visible_limpio) and dom_real not in visible_limpio:
            enlace_oculto_disfrazado = True

    return enlaces, enlace_oculto_disfrazado


def extraer_correo_seguro(archivo_bytes: bytes | None = None, nombre_archivo: str = "", texto_pegado: str = "") -> dict:
    """
    Punto único de extracción segura para Paso 1 -> Paso 2.
    Devuelve una estructura normalizada compatible con el dataset oficial del IESS
    (subject, body, urls, attachments_types, hops_count) y lista para mod_ia_motor.
    """
    remitente = "No especificado en el documento"
    reply_to = ""
    asunto = "Sin asunto detectado"
    fecha = "Fecha no especificada"
    cuerpo = ""
    html_crudo = ""
    adjuntos_detalle = []
    hops_count = 1
    tipo_origen = "Texto pegado manualmente"

    nombre_lower = (nombre_archivo or "").lower().strip()

    # CASO A: ARCHIVO .EML (Formato oficial de práctica y evaluación del jurado)
    if archivo_bytes and nombre_lower.endswith(".eml"):
        tipo_origen = f"Archivo de correo (.eml): {nombre_archivo}"
        msg = BytesParser(policy=policy.default).parsebytes(archivo_bytes)

        remitente = str(msg.get("From", remitente))
        reply_to = str(msg.get("Reply-To", ""))
        asunto = str(msg.get("Subject", asunto))
        fecha = str(msg.get("Date", fecha))
        recibidos = msg.get_all("Received") or []
        hops_count = max(1, len(recibidos))

        partes_texto = []
        if msg.is_multipart():
            for part in msg.walk():
                ct = part.get_content_type()
                disp = str(part.get("Content-Disposition", ""))
                filename = part.get_filename()
                if filename or "attachment" in disp:
                    payload_adj = part.get_payload(decode=True) or b""
                    nombre_adj = filename or "adjunto_sin_nombre"
                    ext = "." + nombre_adj.rsplit(".", 1)[-1].lower() if "." in nombre_adj else ""
                    adjuntos_detalle.append({
                        "nombre": nombre_adj,
                        "extension": ext,
                        "tamano_bytes": len(payload_adj),
                        "es_peligroso": ext in EXTENSIONES_ADJUNTOS_PELIGROSAS,
                        "tiene_qr": "qr" in nombre_adj.lower()
                    })
                elif ct == "text/plain":
                    try:
                        partes_texto.append(part.get_content())
                    except Exception:
                        raw = part.get_payload(decode=True)
                        if raw:
                            partes_texto.append(raw.decode("utf-8", errors="ignore"))
                elif ct == "text/html":
                    try:
                        html_crudo += part.get_content() + "\n"
                    except Exception:
                        pass
        else:
            ct = msg.get_content_type()
            try:
                contenido = msg.get_content()
                if ct == "text/html":
                    html_crudo = contenido
                else:
                    partes_texto.append(contenido)
            except Exception:
                raw = msg.get_payload(decode=True)
                if raw:
                    partes_texto.append(raw.decode("utf-8", errors="ignore"))

        if partes_texto:
            cuerpo = "\n".join(partes_texto).strip()
        elif html_crudo:
            cuerpo = re.sub(r"<[^>]+>", " ", html_crudo).strip()

    # CASO B: DOCUMENTO PDF EXPORTADO DESDE GMAIL (.pdf)
    elif archivo_bytes and nombre_lower.endswith(".pdf"):
        tipo_origen = f"Documento PDF (Gmail): {nombre_archivo}"
        reader = PdfReader(io.BytesIO(archivo_bytes))
        paginas_texto = [page.extract_text() or "" for page in reader.pages]
        texto_pdf = "\n".join(paginas_texto).strip()
        cuerpo = texto_pdf

        lineas = [l.strip() for l in texto_pdf.splitlines() if l.strip()]
        for idx, linea in enumerate(lineas[:25]):
            if "@" in linea and remitente == "No especificado en el documento":
                remitente = linea
            if linea.lower().startswith(("asunto:", "subject:")):
                asunto = linea.split(":", 1)[1].strip()
            elif idx == 1 and len(linea) > 6 and "@" not in linea and "gmail" not in linea.lower() and asunto == "Sin asunto detectado":
                asunto = linea
            if linea.lower().startswith(("responder a:", "reply-to:")):
                reply_to = linea.split(":", 1)[1].strip()

        posibles_adjuntos = re.findall(
            r"[\w\-. ]+\.(?:zip|rar|exe|scr|html|htm|docm|xlsm|apk|png|jpg|pdf)\b",
            texto_pdf,
            flags=re.I
        )
        vistos_adj = set()
        for adj in posibles_adjuntos:
            adj_limpio = adj.strip()
            if adj_limpio.lower() != nombre_lower and adj_limpio.lower() not in vistos_adj:
                vistos_adj.add(adj_limpio.lower())
                ext = "." + adj_limpio.rsplit(".", 1)[-1].lower()
                adjuntos_detalle.append({
                    "nombre": adj_limpio,
                    "extension": ext,
                    "tamano_bytes": 0,
                    "es_peligroso": ext in EXTENSIONES_ADJUNTOS_PELIGROSAS,
                    "tiene_qr": "qr" in adj_limpio.lower()
                })

    # CASO C: TEXTO PEGADO MANUALMENTE
    else:
        cuerpo = (texto_pegado or "").strip()
        for linea in cuerpo.splitlines()[:12]:
            low = linea.lower()
            if low.startswith(("de:", "from:")):
                remitente = linea.split(":", 1)[1].strip()
            elif low.startswith(("responder a:", "reply-to:")):
                reply_to = linea.split(":", 1)[1].strip()
            elif low.startswith(("asunto:", "subject:")):
                asunto = linea.split(":", 1)[1].strip()

    enlaces, enlace_disfrazado = _procesar_enlaces(f"{asunto} {cuerpo}", html_crudo)

    # Huella digital SHA-256 para evidencia forense en la auditoría del Hackatón
    material_hash = f"{remitente}|{asunto}|{cuerpo[:500]}".encode("utf-8", errors="ignore")
    huella_sha256 = hashlib.sha256(material_hash).hexdigest()

    return {
        "tipo_origen": tipo_origen,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "huella_sha256": huella_sha256,
        "remitente": remitente,
        "reply_to": reply_to,
        "asunto": asunto,
        "fecha": fecha,
        "cuerpo": cuerpo,
        "url_count": len(enlaces),
        "enlaces": enlaces,
        "enlace_disfrazado": enlace_disfrazado,
        "attachments_count": len(adjuntos_detalle),
        "adjuntos": adjuntos_detalle,
        "hops_count": hops_count
    }