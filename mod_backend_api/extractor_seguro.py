"""
Extracción y aislamiento seguro de correos electrónicos en formato:
1. PDF exportado desde Gmail (.pdf)
2. Archivo estándar de correo (.eml)
3. Texto pegado manualmente
"""

from __future__ import annotations

import hashlib
import html
import io
import re
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from pypdf import PdfReader

from mod_backend_api.config_canales import (
    EXTENSIONES_ADJUNTOS_PELIGROSAS,
    clasificar_dominio,
    es_acortador,
    es_dominio_oficial_iess,
    es_dominio_oficial_o_conocido,
    normalizar_dominio,
)

MAX_ARCHIVO_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGINAS = 40
URL_REGEX = re.compile(r"https?://[^\s<>\"'`]+", re.IGNORECASE)


class ErrorExtraccion(ValueError):
    """Error controlado al validar o extraer un documento."""


class _ExtractorHTML(HTMLParser):
    """Obtiene texto visible y destinos href sin insertar HTML en la interfaz."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.links: list[dict[str, str]] = []
        self._anchor_stack: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        attributes = dict(attrs)
        href = html.unescape(attributes.get("href") or "").strip()
        if href:
            link = {"href": href, "visible": ""}
            self.links.append(link)
            self._anchor_stack.append(link)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._anchor_stack:
            self._anchor_stack.pop()

    def handle_data(self, data: str) -> None:
        if not data:
            return
        self.text_parts.append(data)
        for anchor in self._anchor_stack:
            anchor["visible"] += data

    def texto_plano(self) -> str:
        return re.sub(r"[ \t]+", " ", "\n".join(self.text_parts)).strip()


def _decodificar_parte(parte: Any) -> str:
    try:
        contenido = parte.get_content()
        return contenido if isinstance(contenido, str) else str(contenido)
    except Exception:
        payload = parte.get_payload(decode=True) or b""
        charset = parte.get_content_charset() or "utf-8"
        try:
            return payload.decode(charset, errors="replace")
        except LookupError:
            return payload.decode("utf-8", errors="replace")


def _extension(nombre: str) -> str:
    return Path(nombre or "").suffix.lower()


def _sanear_nombre(nombre: str) -> str:
    # El nombre solo se muestra como metadato; nunca se usa como ruta de escritura.
    nombre = (nombre or "adjunto_sin_nombre").replace("\\", "/").split("/")[-1]
    nombre = re.sub(r"[^\w.() -]", "_", nombre, flags=re.UNICODE).strip(" .")
    return (nombre or "adjunto_sin_nombre")[:180]


def _host_de_url(url: str) -> str:
    candidato = html.unescape((url or "").strip()).rstrip(".,;:!?)]}\u00bb")
    if not candidato:
        return ""
    try:
        partes = urlsplit(candidato)
        if partes.scheme.lower() not in {"http", "https"}:
            return ""
        return normalizar_dominio(partes.hostname or "")
    except ValueError:
        return ""


def _normalizar_url(url: str) -> str:
    return html.unescape((url or "").strip()).rstrip(".,;:!?)]}\u00bb")


def _neutralizar_url(url: str) -> str:
    return re.sub(r"^https?://", lambda m: m.group(0).replace("://", "[://]"), url, flags=re.IGNORECASE)


def _host_texto_visible(texto: str) -> str:
    coincidencia = URL_REGEX.search(texto or "")
    if coincidencia:
        return _host_de_url(coincidencia.group(0))
    posible = (texto or "").strip().strip("<>[](){}.,; ")
    if posible.lower().startswith("www."):
        posible = "https://" + posible
    if "://" not in posible and re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}(?:/.*)?", posible, re.I):
        posible = "https://" + posible
    return _host_de_url(posible)


def _procesar_enlaces(
    textos: list[str],
    enlaces_html: list[dict[str, str]] | None = None,
) -> tuple[list[dict[str, Any]], bool]:
    """Recopila URLs sin resolver redirecciones ni abrirlas."""
    candidatos: list[tuple[str, str]] = []

    for texto in textos:
        for coincidencia in URL_REGEX.findall(texto or ""):
            candidatos.append((_normalizar_url(coincidencia), ""))

    for enlace in enlaces_html or []:
        destino = _normalizar_url(enlace.get("href", ""))
        visible = re.sub(r"\s+", " ", html.unescape(enlace.get("visible", ""))).strip()
        if destino.lower().startswith(("http://", "https://")):
            candidatos.append((destino, visible))
        # Un texto visible puede contener una URL aunque el href esté vacío.
        for coincidencia in URL_REGEX.findall(visible):
            candidatos.append((_normalizar_url(coincidencia), visible))

    enlaces: list[dict[str, Any]] = []
    vistos: set[str] = set()
    enlace_disfrazado = False

    for url, visible in candidatos:
        host = _host_de_url(url)
        if not host or url in vistos:
            continue
        vistos.add(url)
        clase = clasificar_dominio(host)
        host_visible = _host_texto_visible(visible) if visible else ""
        if host_visible and host_visible != host:
            enlace_disfrazado = True
        elif visible and "iess.gob.ec" in visible.lower() and not (
            host == "iess.gob.ec" or host.endswith(".iess.gob.ec")
        ):
            enlace_disfrazado = True

        enlaces.append({
            "url_real": url,
            "url_neutralizada": _neutralizar_url(url),
            "dominio": host,
            "clasificacion_dominio": clase,
            "es_oficial": es_dominio_oficial_iess(host),
            "es_dominio_permitido": es_dominio_oficial_o_conocido(host),
            "es_acortador": es_acortador(host),
            "texto_visible": visible,
        })

    return enlaces, enlace_disfrazado


def _adjunto_desde_parte(parte: Any) -> dict[str, Any]:
    nombre = _sanear_nombre(parte.get_filename() or "adjunto_sin_nombre")
    contenido = parte.get_payload(decode=True) or b""
    extension = _extension(nombre)
    media_type = parte.get_content_type() or "application/octet-stream"
    return {
        "nombre": nombre,
        "extension": extension,
        "media_type": media_type,
        "tamano_bytes": len(contenido),
        "sha256": hashlib.sha256(contenido).hexdigest(),
        "es_peligroso": extension in EXTENSIONES_ADJUNTOS_PELIGROSAS,
        "parece_qr": "qr" in nombre.lower() or "qr" in str(parte.get("Content-ID", "")).lower(),
        "disposicion": str(parte.get("Content-Disposition", "")),
    }


def _extraer_eml(contenido: bytes) -> dict[str, Any]:
    try:
        mensaje = BytesParser(policy=policy.default).parsebytes(contenido)
    except Exception as exc:
        raise ErrorExtraccion(f"No se pudo interpretar el correo EML: {exc}") from exc

    if mensaje.defects and len(mensaje.defects) > 10:
        raise ErrorExtraccion("El correo EML contiene demasiados defectos de estructura MIME.")

    remitente = str(mensaje.get("From", "No especificado"))
    reply_to = str(mensaje.get("Reply-To", ""))
    asunto = str(mensaje.get("Subject", "Sin asunto detectado"))
    fecha = str(mensaje.get("Date", "Fecha no especificada"))
    received_count = len(mensaje.get_all("Received") or [])

    textos: list[str] = []
    html_partes: list[str] = []
    adjuntos: list[dict[str, Any]] = []

    partes = mensaje.walk() if mensaje.is_multipart() else [mensaje]
    for parte in partes:
        if parte.is_multipart():
            continue
        content_type = parte.get_content_type().lower()
        disposition = str(parte.get("Content-Disposition", "")).lower()
        filename = parte.get_filename()
        content_id = str(parte.get("Content-ID", "")).strip()
        es_adjunto = (
            bool(filename)
            or "attachment" in disposition
            or bool(content_id)
            or content_type.startswith("image/")
        )

        if es_adjunto:
            adjuntos.append(_adjunto_desde_parte(parte))
            continue

        if content_type == "text/plain":
            textos.append(_decodificar_parte(parte))
        elif content_type == "text/html":
            html_partes.append(_decodificar_parte(parte))

    html_links: list[dict[str, str]] = []
    html_textos: list[str] = []
    for html_crudo in html_partes:
        parser = _ExtractorHTML()
        try:
            parser.feed(html_crudo)
            parser.close()
        except Exception:
            # El HTML es contenido no confiable: si no parsea, no se renderiza.
            pass
        html_links.extend(parser.links)
        html_textos.append(parser.texto_plano())

    if not textos:
        textos = html_textos
    cuerpo = "\n".join(t.strip() for t in textos if t and t.strip()).strip()
    return {
        "remitente": remitente,
        "reply_to": reply_to,
        "asunto": asunto,
        "fecha": fecha,
        "cuerpo": cuerpo,
        "html_links": html_links,
        "adjuntos": adjuntos,
        "received_headers_count": received_count,
    }


def _extraer_pdf(contenido: bytes) -> dict[str, Any]:
    if not contenido.startswith(b"%PDF-"):
        raise ErrorExtraccion("El archivo tiene extensión PDF, pero no presenta una cabecera PDF válida.")
    try:
        lector = PdfReader(io.BytesIO(contenido), strict=False)
        if lector.is_encrypted:
            raise ErrorExtraccion("El PDF está cifrado. Exporte una copia legible desde Gmail.")
        if len(lector.pages) > MAX_PDF_PAGINAS:
            raise ErrorExtraccion(f"El PDF supera el límite de {MAX_PDF_PAGINAS} páginas.")
        paginas: list[str] = []
        links_pdf: list[dict[str, str]] = []
        for pagina in lector.pages:
            paginas.append(pagina.extract_text() or "")
            for anotacion_ref in pagina.get("/Annots", []) or []:
                try:
                    anotacion = anotacion_ref.get_object()
                    accion = anotacion.get("/A")
                    if accion:
                        accion = accion.get_object()
                        destino = str(accion.get("/URI", "")).strip()
                        if destino:
                            links_pdf.append({"href": destino, "visible": ""})
                except Exception:
                    continue
    except ErrorExtraccion:
        raise
    except Exception as exc:
        raise ErrorExtraccion(f"No se pudo leer el PDF: {exc}") from exc

    texto = "\n".join(paginas).strip()
    lineas = [linea.strip() for linea in texto.splitlines() if linea.strip()]
    remitente = "No especificado en el documento"
    reply_to = ""
    asunto = "Sin asunto detectado"
    for linea in lineas[:40]:
        lower = linea.lower()
        if "@" in linea and remitente == "No especificado en el documento":
            remitente = linea
        if lower.startswith(("asunto:", "subject:")):
            asunto = linea.split(":", 1)[1].strip() or asunto
        if lower.startswith(("responder a:", "reply-to:")):
            reply_to = linea.split(":", 1)[1].strip()

    adjuntos: list[dict[str, Any]] = []
    patron = re.compile(r"[\w.() -]+\.(?:zip|rar|7z|exe|apk|html?|docm|xlsm|scr|bat|js|vbs|pdf|png|jpg|jpeg)\b", re.I)
    for nombre in dict.fromkeys(patron.findall(texto)):
        nombre = _sanear_nombre(nombre)
        ext = _extension(nombre)
        adjuntos.append({
            "nombre": nombre,
            "extension": ext,
            "media_type": "application/x-referencia-en-texto",
            "tamano_bytes": 0,
            "sha256": None,
            "es_peligroso": ext in EXTENSIONES_ADJUNTOS_PELIGROSAS,
            "parece_qr": "qr" in nombre.lower(),
            "disposicion": "mencionado_en_pdf_no_extraido",
        })

    return {
        "remitente": remitente,
        "reply_to": reply_to,
        "asunto": asunto,
        "fecha": "No identificada en PDF",
        "cuerpo": texto,
        "html_links": links_pdf,
        "adjuntos": adjuntos,
        "received_headers_count": None,
    }


def extraer_correo_seguro(
    archivo_bytes: bytes | None = None,
    nombre_archivo: str = "",
    texto_pegado: str = "",
) -> dict[str, Any]:
    """Normaliza un correo y devuelve metadatos seguros para API y motor IA."""
    nombre = (nombre_archivo or "").strip()
    extension = Path(nombre).suffix.lower()

    if archivo_bytes is not None:
        if len(archivo_bytes) == 0:
            raise ErrorExtraccion("El archivo seleccionado está vacío.")
        if len(archivo_bytes) > MAX_ARCHIVO_BYTES:
            raise ErrorExtraccion("El archivo supera el límite de 10 MB.")
        if extension == ".eml":
            extraido = _extraer_eml(archivo_bytes)
            tipo_origen = f"Archivo de correo (.eml): {_sanear_nombre(nombre)}"
        elif extension == ".pdf":
            extraido = _extraer_pdf(archivo_bytes)
            tipo_origen = f"Documento PDF (Gmail): {_sanear_nombre(nombre)}"
        else:
            raise ErrorExtraccion("Formato no permitido. Utilice únicamente PDF, EML o texto pegado.")
        huella = hashlib.sha256(archivo_bytes).hexdigest()
        bytes_originales = len(archivo_bytes)
    else:
        texto = (texto_pegado or "").strip()
        if not texto:
            raise ErrorExtraccion("No se recibió un archivo ni texto para analizar.")
        if len(texto.encode("utf-8")) > MAX_ARCHIVO_BYTES:
            raise ErrorExtraccion("El texto supera el límite permitido de 10 MB.")
        remitente = "No especificado"
        reply_to = ""
        asunto = "Sin asunto detectado"
        for linea in texto.splitlines()[:20]:
            lower = linea.lower().strip()
            if lower.startswith(("de:", "from:")):
                remitente = linea.split(":", 1)[1].strip()
            elif lower.startswith(("responder a:", "reply-to:")):
                reply_to = linea.split(":", 1)[1].strip()
            elif lower.startswith(("asunto:", "subject:")):
                asunto = linea.split(":", 1)[1].strip()
        extraido = {
            "remitente": remitente,
            "reply_to": reply_to,
            "asunto": asunto,
            "fecha": "No especificada",
            "cuerpo": texto,
            "html_links": [],
            "adjuntos": [],
            "received_headers_count": None,
        }
        huella = hashlib.sha256(texto.encode("utf-8")).hexdigest()
        bytes_originales = len(texto.encode("utf-8"))
        tipo_origen = "Texto pegado manualmente"

    cuerpo = extraido["cuerpo"]
    asunto = extraido["asunto"]
    enlaces, enlace_disfrazado = _procesar_enlaces(
        [asunto, cuerpo],
        extraido.get("html_links", []),
    )
    adjuntos = extraido["adjuntos"]
    total_adjuntos_bytes = sum(int(adjunto.get("tamano_bytes", 0)) for adjunto in adjuntos)
    tipos_adjuntos = ", ".join(sorted({a.get("extension", "") for a in adjuntos if a.get("extension")}))
    tamanos_adjuntos = "; ".join(
        f"{a['nombre']}:{a.get('tamano_bytes', 0)}" for a in adjuntos
    )

    # La interfaz debe renderizar estos campos como texto, nunca como HTML ni enlaces.
    cuerpo_neutralizado = URL_REGEX.sub(
        lambda match: _neutralizar_url(_normalizar_url(match.group(0))),
        cuerpo,
    )

    resultado: dict[str, Any] = {
        "tipo_origen": tipo_origen,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "nombre_archivo": _sanear_nombre(nombre) if nombre else None,
        "tamano_original_bytes": bytes_originales,
        "huella_sha256": huella,
        "remitente": extraido["remitente"],
        "reply_to": extraido["reply_to"],
        "asunto": asunto,
        "fecha": extraido["fecha"],
        "cuerpo": cuerpo,
        "cuerpo_neutralizado": cuerpo_neutralizado,
        "url_count": len(enlaces),
        "enlaces": enlaces,
        "enlace_disfrazado": enlace_disfrazado,
        "attachments_count": len(adjuntos),
        "attachments_total_size": total_adjuntos_bytes,
        "attachments_types": tipos_adjuntos,
        "attachments_sizes": tamanos_adjuntos,
        "adjuntos": adjuntos,
        # No se visitan enlaces; por tanto no se calcula la cantidad de redirecciones.
        "hops_count": None,
        # Este dato es distinto de los saltos HTTP de una URL.
        "received_headers_count": extraido.get("received_headers_count"),
    }
    return resultado
