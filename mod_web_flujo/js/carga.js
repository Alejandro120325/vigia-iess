
/* =================================
LECTURA Y VALIDACIÓN DEL CORREO
================================= */

// Configurar el trabajador de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


// Extraer los datos del correo
function extraerDatosCorreo(texto) {

    const partes = texto.split(/\r?\n\r?\n/);

    const encabezados = (partes[0] || "")
        .replace(/\r?\n[ \t]+/g, " ");

    const remitenteEncontrado = texto.match(
        /^(?:From|De|Remitente):\s*(.+)$/im
    );

    const asuntoEncontrado = texto.match(
        /^(?:Subject|Asunto):\s*(.+)$/im
    );

    return {
        remitente: remitenteEncontrado
            ? remitenteEncontrado[1].trim()
            : "No identificado",

        asunto: asuntoEncontrado
            ? asuntoEncontrado[1].trim()
            : "Sin asunto",

        contenido: partes.length > 1
            ? partes.slice(1).join("\n\n").trim()
            : texto.trim()
    };
}


// Leer el texto de un archivo PDF
async function extraerTextoPDF(archivo) {

    const datosArchivo = await archivo.arrayBuffer();

    const documento = await pdfjsLib.getDocument({
        data: datosArchivo
    }).promise;

    let textoCompleto = "";

    // Recorrer todas las páginas del PDF
    for (let numero = 1; numero <= documento.numPages; numero++) {

        const pagina = await documento.getPage(numero);

        const contenidoPagina = await pagina.getTextContent();

        const textoPagina = contenidoPagina.items
            .map(elemento => elemento.str)
            .join(" ");

        textoCompleto += textoPagina + "\n\n";
    }

    return textoCompleto.trim();
}


// Validar y leer el correo
async function validarCorreo() {

    const archivo = document.querySelector(
        'input[type="file"]'
    ).files[0];

    const contenido = document.querySelector(
        "textarea"
    ).value.trim();

    if (!archivo && contenido === "") {
        alert("Por favor, selecciona un correo o pega su contenido.");
        return;
    }

    let textoCorreo = contenido;

    try {

        // Si se seleccionó un archivo
        if (archivo) {

            const nombreArchivo = archivo.name.toLowerCase();

            if (nombreArchivo.endsWith(".eml")) {

                textoCorreo = await archivo.text();

            } else if (nombreArchivo.endsWith(".pdf")) {

                textoCorreo = await extraerTextoPDF(archivo);

                if (textoCorreo === "") {
                    alert("No encontramos texto en el PDF. Puede ser un documento escaneado.");
                    return;
                }

            } else {

                alert("Formato no compatible. Selecciona un archivo PDF o EML.");
                return;
            }
        }

        // Extraer los datos del correo
        const datos = extraerDatosCorreo(textoCorreo);

        // Mostrar remitente
        document.getElementById("remitente").textContent =
            datos.remitente;

        // Mostrar asunto
        document.getElementById("asunto").textContent =
            datos.asunto;

        // Mostrar contenido
        document.getElementById("contenidoCorreo").textContent =
            datos.contenido;

        // Avanzar a Lectura Segura
        mostrarVentana(2);

    } catch (error) {

        console.error("Error al leer el archivo:", error);

        alert("No se pudo leer el archivo. Comprueba que sea un PDF o EML válido.");
    }
}
