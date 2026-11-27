# Vigía IESS

Aplicación educativa para reconocer señales de phishing en correos relacionados con trámites y comunicaciones institucionales. Integra el flujo web, API Flask, extracción segura, reglas I1–I11, modelos ONNX y herramientas de accesibilidad.

## Requisitos

- Python 3.10 o superior.
- Windows, Linux o macOS.
- Conexión a Internet solo para instalar dependencias. El análisis de los mensajes se ejecuta localmente.

## Instalación en Windows (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Abra **http://127.0.0.1:5000** en el navegador. Mantenga abierta la terminal mientras utiliza la aplicación.

## Instalación en Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

## Flujo funcional

1. **Cargar correo:** recibe un PDF exportado desde Gmail, un archivo EML o texto pegado.
2. **Lectura segura:** el servidor extrae el contenido, calcula SHA-256 y neutraliza los enlaces para evitar aperturas accidentales. No visita URLs ni ejecuta adjuntos.
3. **Análisis:** verifica la firma HMAC del paso anterior y aplica reglas determinísticas I1–I11. Los modelos ONNX ofrecen señales complementarias cuando ONNX Runtime está instalado.
4. **Resultado:** presenta indicios, evidencias, recomendaciones, canales configurados y la opción de ejecutar la auditoría de cinco correos de práctica.
5. **Accesibilidad:** incorpora aumento/reducción de texto, alto contraste, lector de voz, avatar educativo y guía de cultura consciente.

## Variables de entorno

- `VIGIA_INTEGRITY_SECRET`: clave opcional de al menos 32 caracteres para firmar la información entre el paso de lectura y el análisis. Si no se define, se genera una clave aleatoria al iniciar el servidor. En cada reinicio sin variable configurada, los correos ya cargados dejan de ser válidos y deben leerse de nuevo.
- `VIGIA_HOST`: por defecto `127.0.0.1`. Solo cambie este valor si necesita exponer el servicio en una red controlada.
- `VIGIA_PORT`: puerto local; por defecto `5000`.

## API disponible

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/salud` | Estado del backend y del motor |
| GET | `/api/canales-oficiales` | Canales institucionales configurados |
| POST | `/api/paso1-leer` | Extracción segura de PDF, EML o texto |
| POST | `/api/paso2-analizar` | Análisis del objeto firmado |
| GET | `/api/auditoria-practica` | Análisis de los cinco correos de ejemplo |

## Pruebas

```bash
python -m unittest discover -v
```

## Estructura

- `mod_backend_api/`: API REST, configuración de canales y extractor seguro.
- `mod_ia_motor/`: reglas I1–I11, adaptador ML y modelos ONNX.
- `mod_web_flujo/`: interfaz web y cliente API.
- `mod_avatar_accesibilidad/`: avatar, cultura consciente, zoom, contraste y voz.
- `data/practica/`: cinco mensajes EML usados en la auditoría de demostración.
- `tests/`: pruebas unitarias e integración.

## Consideraciones de uso

Vigía IESS es un prototipo educativo de apoyo. Un resultado sin indicios no demuestra que un correo sea legítimo. La probabilidad del clasificador no está calibrada y no sustituye la revisión humana ni la verificación por canales oficiales. No se deben ingresar correos reales con información personal sensible en una demostración pública.
