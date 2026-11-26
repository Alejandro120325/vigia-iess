"""Pruebas locales del extractor y reglas; no requieren Flask ni ONNX Runtime."""

from __future__ import annotations

import hashlib
import unittest
from email.message import EmailMessage

from mod_backend_api.config_canales import clasificar_dominio
from mod_backend_api.extractor_seguro import extraer_correo_seguro
from mod_ia_motor.reglas_indicios import detectar_indicios


class TestClasificacionDominios(unittest.TestCase):
    def test_microsoft_no_se_presenta_como_iess(self):
        self.assertEqual(clasificar_dominio("accountprotection.microsoft.com"), "servicio_externo_conocido")

    def test_subdominio_iess_es_oficial(self):
        self.assertEqual(clasificar_dominio("app.iess.gob.ec"), "oficial_iess")

    def test_dominio_parecido_no_es_oficial(self):
        self.assertEqual(clasificar_dominio("iess-gob-ec.example"), "no_verificado")


class TestExtractor(unittest.TestCase):
    def test_sha256_cubre_archivo_completo_y_enlaces_se_neutralizan(self):
        mensaje = EmailMessage()
        mensaje["From"] = "Prueba <prueba@example.com>"
        mensaje["To"] = "destino@example.com"
        mensaje["Subject"] = "Mensaje de prueba"
        mensaje.set_content("Revise https://t.ly/demo")
        mensaje.add_alternative(
            '<html><body><a href="https://destino-falso.example">https://www.iess.gob.ec</a></body></html>',
            subtype="html",
        )
        original = mensaje.as_bytes()
        correo = extraer_correo_seguro(original, "mensaje.eml")
        self.assertEqual(correo["huella_sha256"], hashlib.sha256(original).hexdigest())
        self.assertIsNone(correo["hops_count"])
        self.assertTrue(correo["enlace_disfrazado"])
        self.assertTrue(any("https[://]t.ly" in correo["cuerpo_neutralizado"] for _ in [0]))
        self.assertGreaterEqual(correo["url_count"], 2)

    def test_archivo_con_extension_pdf_pero_no_es_pdf_se_rechaza(self):
        with self.assertRaises(ValueError):
            extraer_correo_seguro(b"esto no es pdf", "malicioso.pdf")


class TestReglas(unittest.TestCase):
    def test_acortador_tly_es_i2_e_i4(self):
        correo = {
            "subject": "Aviso",
            "body": "Continúe en https://t.ly/ruta",
            "urls": "https://t.ly/ruta",
            "attachments_types": "",
            "sender": "notificaciones@iess.gob.ec",
        }
        codes = {item["codigo"] for item in detectar_indicios(correo)}
        self.assertIn("I2", codes)
        self.assertIn("I4", codes)

    def test_qr_se_detecta_sin_visitar_ni_resolver_la_imagen(self):
        correo = {
            "subject": "Turno confirmado",
            "body": "Escanee el código QR y actualice sus datos personales.",
            "sender": "aviso@portal-falso.example",
            "reply_to": "",
            "adjuntos": [{"nombre": "codigo_qr.png", "extension": ".png", "parece_qr": True}],
        }
        codes = {item["codigo"] for item in detectar_indicios(correo)}
        self.assertIn("I11", codes)
        self.assertIn("I9", codes)

    def test_adjunto_pdf_no_es_peligroso_por_extension(self):
        correo = {
            "subject": "Planilla disponible",
            "body": "Consulte su planilla de aportes.",
            "sender": "notificaciones@iess.gob.ec",
            "reply_to": "",
            "attachments_types": ".pdf",
            "adjuntos": [{"nombre": "planilla.pdf", "extension": ".pdf", "parece_qr": False}],
        }
        codes = {item["codigo"] for item in detectar_indicios(correo)}
        self.assertNotIn("I5", codes)
        self.assertEqual(codes, set())

    def test_qr_no_se_confunde_con_solicitud_de_codigo_de_seguridad(self):
        correo = {
            "subject": "Turno confirmado",
            "body": "Escanee el código QR. Actualice sus datos personales.",
            "sender": "usuario@iess.gob.ec",
            "reply_to": "",
            "attachments_types": ".png",
            "adjuntos": [{"nombre": "codigo_qr.png", "extension": ".png", "parece_qr": True}],
        }
        codes = {item["codigo"] for item in detectar_indicios(correo)}
        self.assertNotIn("I3", codes)
        self.assertIn("I11", codes)


if __name__ == "__main__":
    unittest.main(verbosity=2)
