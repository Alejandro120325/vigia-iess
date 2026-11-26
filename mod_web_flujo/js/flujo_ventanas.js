
/* =================================
NAVEGACIÓN DE LAS CUATRO VENTANAS
================================= */

function mostrarVentana(numero) {

    // Comprobar que el número sea válido
    if (numero < 1 || numero > 4) {
        return;
    }

    // Obtener todas las ventanas
    const ventanas = document.querySelectorAll("main section");

    // Ocultar todas las ventanas
    ventanas.forEach(function(ventana) {
        ventana.classList.remove("ventana-activa");
        ventana.classList.add("ventana-oculta");
    });

    // Mostrar la ventana seleccionada
    const ventanaSeleccionada = document.getElementById("ventana" + numero);

    ventanaSeleccionada.classList.remove("ventana-oculta");
    ventanaSeleccionada.classList.add("ventana-activa");

    // Actualizar el botón seleccionado
    const botones = document.querySelectorAll("nav button");

    botones.forEach(function(boton, indice) {

        boton.classList.remove("paso-activo");

        if (indice + 1 === numero) {
            boton.classList.add("paso-activo");
        }

    });

}


/* =================================
ANÁLISIS DE SEGURIDAD DEL CORREO
================================= */

let analisisEnCurso = false;

async function analizarCorreo() {

    // Evitar iniciar dos análisis al mismo tiempo
    if (analisisEnCurso) {
        return;
    }

    analisisEnCurso = true;

    // Obtener el contenido del correo
    const correo = document.getElementById("contenidoCorreo").textContent.toLowerCase();

    // Obtener elementos de la pantalla
    const barra = document.getElementById("barraProgreso");
    const porcentaje = document.getElementById("porcentajeProgreso");
    const estado = document.getElementById("estadoAnalisis");
    const lista = document.getElementById("listaComprobaciones");

    // Reiniciar el análisis
    barra.value = 0;
    porcentaje.textContent = "0 %";
    lista.textContent = "";

    const indicadores = [];

    // Definir las comprobaciones
    const comprobaciones = [
        {
            nombre: "Enlaces externos",
            buscar: /https?:\/\/|www\./i,
            mensaje: "Se encontraron enlaces externos."
        },
        {
            nombre: "Mensajes de urgencia",
            buscar: /\b(urgente|inmediatamente|última oportunidad|ultimo aviso|hoy mismo)\b/i,
            mensaje: "Se encontraron expresiones de urgencia."
        },
        {
            nombre: "Solicitudes de contraseñas",
            buscar: /\b(contraseña|contrasena|clave|password|credenciales)\b/i,
            mensaje: "Se encontraron referencias a contraseñas o credenciales."
        }
    ];

    try {

        // Ejecutar las tres comprobaciones
        for (let i = 0; i < comprobaciones.length; i++) {

            const comprobacion = comprobaciones[i];

            estado.textContent = "Revisando: " + comprobacion.nombre + "...";

            // Simular el tiempo de revisión
            await new Promise(resolve => setTimeout(resolve, 800));

            const encontrado = comprobacion.buscar.test(correo);

            // Crear el resultado de la comprobación
            const elemento = document.createElement("li");

            elemento.textContent = encontrado
                ? comprobacion.nombre + ": señal encontrada"
                : comprobacion.nombre + ": sin coincidencias";

            lista.appendChild(elemento);

            // Guardar los indicadores encontrados
            if (encontrado) {
                indicadores.push(comprobacion.mensaje);
            }

            // Actualizar el progreso
            const avance = Math.round(((i + 1) / comprobaciones.length) * 100);

            barra.value = avance;
            porcentaje.textContent = avance + " %";
        }

        estado.textContent = "Comprobaciones finalizadas.";

        // Preparar el veredicto
        mostrarVeredicto(indicadores);

        // Mostrar la cuarta ventana
        mostrarVentana(4);

    } catch (error) {

        console.error("Error durante el análisis:", error);

        estado.textContent = "No se pudo completar el análisis.";

        alert("Ocurrió un error durante las comprobaciones.");

    } finally {

        analisisEnCurso = false;
    }
}


// Mostrar el resultado de las comprobaciones
function mostrarVeredicto(indicadores) {

    const resultado = document.getElementById("resultadoAnalisis");
    const listaIndicadores = document.getElementById("indicadoresEncontrados");
    const recomendaciones = document.getElementById("recomendacionesAnalisis");

    // Limpiar los resultados anteriores
    listaIndicadores.textContent = "";

    if (indicadores.length > 0) {

        resultado.textContent = "Se encontraron señales que requieren revisión.";

        indicadores.forEach(function(indicador) {

            const elemento = document.createElement("li");

            elemento.textContent = indicador;

            listaIndicadores.appendChild(elemento);
        });

        recomendaciones.textContent =
            "No abras enlaces ni compartas contraseñas o información personal. Verifica el remitente por un canal oficial.";

    } else {

        resultado.textContent = "No se encontraron señales en estas comprobaciones.";

        const elemento = document.createElement("li");

        elemento.textContent = "No se detectaron coincidencias con los indicadores revisados.";

        listaIndicadores.appendChild(elemento);

        recomendaciones.textContent =
            "Mantén las precauciones. La ausencia de estas señales no garantiza que el correo sea seguro.";
    }
}

