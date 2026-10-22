
"use strict";

const $ = id => document.getElementById(id);

const PRODUCTOS = [
    {id:"pizza",nombre:"Pizza Familiar",categoria:"comida",precio:12,emoji:"🍕"},
    {id:"hamburguesa",nombre:"Hamburguesa con Queso",categoria:"comida",precio:7.5,emoji:"🍔"},
    {id:"tacos",nombre:"Orden de Tacos",categoria:"comida",precio:6,emoji:"🌮"},
    {id:"ensalada",nombre:"Ensalada César",categoria:"comida",precio:5.5,emoji:"🥗"},
    {id:"pollo",nombre:"Pollo a la Parrilla",categoria:"comida",precio:9.5,emoji:"🍗"},
    {id:"pasta",nombre:"Pasta Italiana",categoria:"comida",precio:8,emoji:"🍝"},
    {id:"refresco",nombre:"Refresco",categoria:"bebida",precio:1.5,emoji:"🥤"},
    {id:"agua",nombre:"Agua Mineral",categoria:"bebida",precio:1,emoji:"💧"},
    {id:"cafe",nombre:"Café",categoria:"bebida",precio:2,emoji:"☕"},
    {id:"jugo",nombre:"Jugo Natural",categoria:"bebida",precio:2.5,emoji:"🧃"},
    {id:"papas",nombre:"Papas Fritas",categoria:"extra",precio:2.5,emoji:"🍟"},
    {id:"queso",nombre:"Extra Queso",categoria:"extra",precio:1.5,emoji:"🧀"},
    {id:"helado",nombre:"Helado de Vainilla",categoria:"extra",precio:1.8,emoji:"🍨"},
    {id:"tocino",nombre:"Tocino",categoria:"extra",precio:2,emoji:"🥓"}
];

const db = window.Dexie ? new Dexie("NovaBiteProDB") : null;

db?.version(1).stores({
    pedidos: "++id, fechaISO, estado, nombre",
    inventario: "id"
});

let carrito = [];
let inventario = {};
let pedidos = [];
let ultimoPedido = null;
let categoriaActual = "todos";
let avisoTimer;
let sistemaListo = false;
let guardando = false;

const dinero = n => "$" + Number(n).toFixed(2);

function escapar(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, c => ({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#39;"
    })[c]);
}

function avisar(mensaje) {
    const elemento = $("notificacion");
    elemento.textContent = mensaje;
    elemento.classList.add("visible");

    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => {
        elemento.classList.remove("visible");
    }, 3500);
}

function fechaLocal(iso) {
    return new Date(iso).toLocaleString("es-GT");
}

function fechaDia(iso) {
    const d = new Date(iso);
    return [
        d.getFullYear(),
        String(d.getMonth()+1).padStart(2,"0"),
        String(d.getDate()).padStart(2,"0")
    ].join("-");
}

async function iniciarInventario() {
    await db.transaction("rw", db.inventario, async () => {
        for (const producto of PRODUCTOS) {
            const existente = await db.inventario.get(producto.id);

            if (!existente) {
                await db.inventario.put({
                    id: producto.id,
                    stock: 30
                });
            }
        }
    });

    await cargarInventario();
}

async function cargarInventario() {
    const registros = await db.inventario.toArray();
    inventario = Object.fromEntries(
        registros.map(p => [p.id, p.stock])
    );

    renderProductos();
    renderInventario();
}


document.querySelectorAll(".nav-btn").forEach(boton => {
    boton.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach(b =>
            b.classList.remove("activo")
        );

        document.querySelectorAll(".vista").forEach(v =>
            v.classList.remove("activa")
        );

        boton.classList.add("activo");

        const vista = boton.dataset.vista;

        $("vista-" + vista).classList.add("activa");

        const titulos = {
            ventas:"Punto de venta",
            historial:"Historial de pedidos",
            inventario:"Inventario",
            reportes:"Reportes de ventas"
        };

        $("tituloVista").textContent = titulos[vista];
    });
});

function renderProductos() {
    const busqueda = $("buscarProducto").value
        .trim().toLowerCase();

    const filtrados = PRODUCTOS.filter(p =>
        (categoriaActual === "todos" ||
         p.categoria === categoriaActual) &&
        p.nombre.toLowerCase().includes(busqueda)
    );

    $("contadorProductos").textContent = filtrados.length;
    $("gridProductos").innerHTML = filtrados.map(p => {
        const disponible = inventario[p.id] || 0;
        const enCarrito = carrito.find(c => c.id === p.id)?.cantidad || 0;
        const agotado = disponible <= enCarrito;

        return `
            <article class="producto ${enCarrito ? "seleccionado" : ""} ${disponible === 0 ? "sin-stock" : ""}" data-categoria="${p.categoria}">
                ${enCarrito ? `<span class="selected-count">${enCarrito} en pedido</span>` : ""}
                <div class="emoji">${p.emoji}</div>
                <h3>${escapar(p.nombre)}</h3>
                <p>${disponible === 0 ? "Sin existencias" : `${disponible - enCarrito} disponibles para agregar`}</p>
                <div class="producto-pie">
                    <span class="precio">${dinero(p.precio)}</span>
                    <button class="btn-agregar"
                        data-agregar="${p.id}"
                        aria-label="Agregar ${escapar(p.nombre)}"
                        ${agotado || !sistemaListo || guardando ? "disabled" : ""}>
                        ${agotado ? (disponible ? "Límite" : "Agotado") : "+ Agregar"}
                    </button>
                </div>
            </article>
        `;
    }).join("") || '<div class="carrito-vacio"><p>No encontramos ese producto</p><small>Prueba con otro nombre o categoría.</small></div>';
}

$("buscarProducto").addEventListener("input", renderProductos);

document.querySelectorAll(".categoria").forEach(boton => {
    boton.addEventListener("click", () => {
        categoriaActual = boton.dataset.categoria;

        document.querySelectorAll(".categoria").forEach(b =>
            b.classList.remove("activa")
        );

        boton.classList.add("activa");
        renderProductos();
    });
});

$("gridProductos").addEventListener("click", event => {
    const boton = event.target.closest("[data-agregar]");
    if (boton) agregarProducto(boton.dataset.agregar);
});

function agregarProducto(id) {
    if (!sistemaListo || guardando) return;
    const producto = PRODUCTOS.find(p => p.id === id);
    if (!producto) return;

    const existente = carrito.find(p => p.id === id);
    const cantidad = existente?.cantidad || 0;

    if (cantidad >= (inventario[id] || 0)) {
        avisar("No hay suficientes existencias.");
        return;
    }

    if (existente) {
        existente.cantidad++;
    } else {
        carrito.push({...producto, cantidad:1});
    }

    renderCarrito();
}

function modificarCantidad(id, cambio) {
    if (!sistemaListo || guardando || ![-1, 1].includes(cambio)) return;
    const item = carrito.find(p => p.id === id);
    if (!item) return;

    const nueva = item.cantidad + cambio;

    if (cambio > 0 && nueva > (inventario[id] || 0)) {
        avisar("Stock insuficiente.");
        return;
    }

    if (nueva <= 0) {
        carrito = carrito.filter(p => p.id !== id);
    } else {
        item.cantidad = nueva;
    }

    renderCarrito();
}

$("listaCarrito").addEventListener("click", event => {
    const boton = event.target.closest("[data-cantidad]");
    if (!boton) return;

    modificarCantidad(
        boton.dataset.id,
        Number(boton.dataset.cantidad)
    );
});

$("vaciarCarrito").addEventListener("click", async () => {
    if (guardando || !carrito.length) return;
    if (!await confirmar("¿Vaciar el pedido?", "Se quitarán los productos seleccionados de este pedido.")) return;
    if (guardando) return;
    carrito = [];
    renderCarrito();
});

function renderCarrito() {
    $("contadorCarrito").textContent = carrito.reduce((s,p) => s + p.cantidad, 0);
    $("vaciarCarrito").disabled = guardando || !carrito.length;
    $("listaCarrito").innerHTML = carrito.length
        ? carrito.map(p => `
            <div class="carrito-item">
                <span>${p.emoji}</span>
                <div class="carrito-info">
                    <strong>${escapar(p.nombre)}</strong>
                    <small>${dinero(p.precio)} c/u</small>
                </div>
                <div class="cantidad-control">
                    <button data-id="${p.id}"
                        data-cantidad="-1"
                        aria-label="Restar ${escapar(p.nombre)}">−</button>
                    <strong>${p.cantidad}</strong>
                    <button data-id="${p.id}"
                        data-cantidad="1"
                        aria-label="Sumar ${escapar(p.nombre)}"
                        ${p.cantidad >= inventario[p.id] ? "disabled" : ""}>+</button>
                </div>
            </div>
        `).join("")
        : `<div class="carrito-vacio">
            🛒<p>Tu carrito está vacío</p>
            <small>Agrega productos del menú</small>
           </div>`;

    renderProductos();
    calcularTotales();
}

const centavos = valor => Math.round(Number(valor) * 100);

function calcularTotales() {
    const subtotalCentavos = carrito.reduce(
        (suma,p) => suma + centavos(p.precio) * p.cantidad,
        0
    );

    const descuento = Number($("descuento").value);
    const porcentaje = Number.isFinite(descuento)
        ? Math.min(100, Math.max(0, descuento))
        : 0;

    const descuentoCentavos = Math.round(
        subtotalCentavos * porcentaje / 100
    );

    const totalCentavos = subtotalCentavos - descuentoCentavos;

    const efectivo = Number($("efectivoRecibido").value);
    const efectivoCentavos = Number.isFinite(efectivo)
        ? Math.max(0, centavos(efectivo))
        : 0;

    const cambioCentavos = Math.max(
        0, efectivoCentavos - totalCentavos
    );

    $("subtotal").textContent = dinero(subtotalCentavos / 100);
    $("montoDescuento").textContent = dinero(descuentoCentavos / 100);
    $("totalFinal").textContent = dinero(totalCentavos / 100);
    $("cambio").textContent = dinero(cambioCentavos / 100);

    return {
        subtotal: subtotalCentavos / 100,
        descuento: descuentoCentavos / 100,
        porcentaje,
        total: totalCentavos / 100,
        cambio: $("metodoPago").value === "Efectivo" ? cambioCentavos / 100 : 0,
        efectivo: $("metodoPago").value === "Efectivo" ? efectivoCentavos / 100 : 0
    };
}

$("descuento").addEventListener("input", calcularTotales);
$("efectivoRecibido").addEventListener("input", calcularTotales);

$("metodoPago").addEventListener("change", () => {
    const efectivo = $("metodoPago").value === "Efectivo";

    $("campoEfectivo").hidden = !efectivo;
    $("filaCambio").hidden = !efectivo;

    calcularTotales();
});

$("guardarPedido").addEventListener("click", async () => {
    if (!sistemaListo || guardando) return;
    if (!validarPedido()) return;
    const nombre = $("nombreCliente").value.trim();

    if (!nombre) {
        avisar("Ingresa el nombre del cliente.");
        return;
    }

    if (!carrito.length) {
        avisar("Agrega al menos un producto.");
        return;
    }

    const calculo = calcularTotales();
    const metodo = $("metodoPago").value;

    if (metodo === "Efectivo" &&
        calculo.efectivo < calculo.total) {
        avisar("El efectivo recibido es insuficiente.");
        return;
    }

    const boton = $("guardarPedido");
    let confirmado = false;
    guardando = true;
    bloquearCobro(true);

    const pedido = {
        nombre,
        tipo: $("tipoPedido").value,
        notas: $("notas").value.trim(),
        productos: carrito.map(p => ({
            id:p.id,
            nombre:p.nombre,
            precio:p.precio,
            cantidad:p.cantidad
        })),
        ...calculo,
        metodo,
        fechaISO: new Date().toISOString(),
        estado:"Pendiente"
    };

    try {
        await db.transaction(
            "rw",
            db.pedidos,
            db.inventario,
            async () => {
                for (const item of pedido.productos) {
                    const registro = await db.inventario.get(item.id);

                    if (!registro || !Number.isSafeInteger(registro.stock) || registro.stock < item.cantidad) {
                        throw new Error(
                            "Stock insuficiente: " + item.nombre
                        );
                    }

                    await db.inventario.update(item.id, {
                        stock: registro.stock - item.cantidad
                    });
                }

                pedido.id = await db.pedidos.add(pedido);
            }
        );

        confirmado = true;
        ultimoPedido = pedido;

        $("mensajePedido").className = "";
        $("mensajePedido").innerHTML = `
            <p class="mensaje-exito">
                ✓ Pedido #${pedido.id} guardado.
                Total: ${dinero(pedido.total)}
            </p>
        `;

        $("descargarFactura").hidden = false;

        carrito = [];
        $("nombreCliente").value = "";
        $("notas").value = "";
        $("descuento").value = 0;
        $("efectivoRecibido").value = "";

        await cargarInventario();
        await cargarPedidos();
        ["nombreCliente", "notas", "descuento", "efectivoRecibido"].forEach(id => errorCampo($(id), ""));
        renderCarrito();

        avisar("Pedido guardado correctamente.");

    } catch (error) {
        console.error(error);
        $("mensajePedido").textContent = confirmado
            ? "Pedido #" + pedido.id + " guardado. No se pudo actualizar la vista; recarga la página antes de continuar."
            : "No se guardó el pedido. " + error.message;
        $("mensajePedido").className = "mensaje-error";
        if (confirmado) { sistemaListo = false; $("estadoSistema").textContent = "Recarga para continuar"; }
        avisar(confirmado ? "La venta se guardó. Recarga para actualizar la caja." : "No se guardó el pedido. Revisa las existencias e inténtalo de nuevo.");
        await cargarInventario().catch(() => {});
    } finally {
        guardando = false;
        bloquearCobro(false);
        renderCarrito();
        boton.disabled = !sistemaListo;
    }
});

function generarPDF(pedido) {
    if (!window.jspdf?.jsPDF) {
        avisar("No se pudo cargar la librería PDF.");
        return;
    }

    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF();

    let y = 55;

    function nuevaPaginaSiHaceFalta(altura = 12) {
        if (y + altura > 265) {
            pdf.addPage();
            y = 22;
        }
    }

    pdf.setFillColor(40,79,57);
    pdf.rect(0,0,210,42,"F");

    pdf.setTextColor(255,255,255);
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(24);
    pdf.text("NovaBite Pro",18,22);

    pdf.setFontSize(10);
    pdf.text("COMPROBANTE DE VENTA",18,33);

    pdf.setTextColor(35,40,55);
    pdf.setFontSize(15);
    pdf.text("Pedido #" + pedido.id,18,y);
    y += 10;

    pdf.setFont("helvetica","normal");
    pdf.setFontSize(10);

    const informacion = [
        "Fecha: " + fechaLocal(pedido.fechaISO),
        "Cliente: " + pedido.nombre,
        "Tipo: " + pedido.tipo,
        "Pago: " + pedido.metodo,
        "Estado: " + pedido.estado
    ];

    informacion.forEach(linea => {
        const lineas = pdf.splitTextToSize(linea,170);
        nuevaPaginaSiHaceFalta(lineas.length * 6);
        pdf.text(lineas,18,y);
        y += lineas.length * 6 + 2;
    });

    y += 6;
    nuevaPaginaSiHaceFalta(20);
    pdf.setFont("helvetica","bold");
    pdf.text("PRODUCTOS",18,y);
    y += 9;

    pedido.productos.forEach(p => {
        nuevaPaginaSiHaceFalta(18);

        pdf.setFont("helvetica","normal");

        const nombre = pdf.splitTextToSize(
            p.cantidad + " x " + p.nombre,115
        );

        pdf.text(nombre,18,y);
        pdf.text(
            dinero(p.precio * p.cantidad),
            190,y,{align:"right"}
        );

        y += Math.max(10,nombre.length * 6 + 3);
    });

    nuevaPaginaSiHaceFalta(48);
    pdf.setDrawColor(210,215,225);
    pdf.line(18,y,192,y);
    y += 10;

    pdf.text("Subtotal:",18,y);
    pdf.text(dinero(pedido.subtotal),190,y,{align:"right"});
    y += 8;

    pdf.text("Descuento:",18,y);
    pdf.text(dinero(pedido.descuento),190,y,{align:"right"});
    y += 12;

    pdf.setFont("helvetica","bold");
    pdf.setFontSize(16);
    pdf.text("TOTAL:",18,y);
    pdf.text(dinero(pedido.total),190,y,{align:"right"});
    y += 12;

    pdf.setFontSize(10);
    pdf.setFont("helvetica","normal");

    if (pedido.metodo === "Efectivo") {
        nuevaPaginaSiHaceFalta(18);
        pdf.text("Recibido: " + dinero(pedido.efectivo),18,y);
        y += 7;
        pdf.text("Cambio: " + dinero(pedido.cambio),18,y);
        y += 10;
    }

    if (pedido.notas) {
        const notas = pdf.splitTextToSize(
            "Notas: " + pedido.notas,170
        );

        notas.forEach(linea => {
            nuevaPaginaSiHaceFalta(6);
            pdf.text(linea,18,y);
            y += 6;
        });
        y += 5;
    }

    nuevaPaginaSiHaceFalta(25);
    pdf.setTextColor(100,105,120);
    pdf.text("Gracias por tu compra.",105,y,{align:"center"});
    y += 7;
    pdf.setFontSize(8);
    pdf.text(
        "Comprobante interno - No es factura fiscal autorizada",
        105,y,{align:"center"}
    );

    pdf.save("NovaBite_Factura_" + pedido.id + ".pdf");
}

$("descargarFactura").addEventListener("click", () => {
    if (ultimoPedido) generarPDF(ultimoPedido);
});

async function cargarPedidos() {
    pedidos = await db.pedidos.orderBy("id").reverse().toArray();

    renderPedidos();
    renderReportes();
}

function renderPedidos() {
    const buscar = $("buscarPedido").value.toLowerCase().trim();
    const estado = $("filtroEstado").value;

    const filtrados = pedidos.filter(p =>
        (String(p.id).includes(buscar) ||
         p.nombre.toLowerCase().includes(buscar)) &&
        (estado === "todos" || p.estado === estado)
    );

    $("listaPedidos").innerHTML = filtrados.map(p => `
        <article class="pedido-card">
            <div class="pedido-cabecera">
                <strong>Pedido #${p.id}</strong>
                <span class="estado ${escapar(p.estado)}">
                    ${escapar(p.estado)}
                </span>
            </div>

            <p>👤 ${escapar(p.nombre)}</p>
            <p>📅 ${escapar(fechaLocal(p.fechaISO))}</p>
            <p>🍽️ ${escapar(p.tipo)}</p>
            <p>💳 ${escapar(p.metodo)}</p>
            <p><strong>Total: ${dinero(p.total)}</strong></p>

            <div class="pedido-acciones">
                <select data-estado-id="${p.id}"
                    aria-label="Estado del pedido ${p.id}">
                    ${["Pendiente","Preparando","Entregado"].map(e =>
                        `<option value="${e}"
                            ${p.estado === e ? "selected" : ""}>
                            ${e}
                        </option>`
                    ).join("")}
                </select>

                <button class="btn-secundario"
                    data-pdf-id="${p.id}">
                    📄 Descargar PDF
                </button>
            </div>
        </article>
    `).join("") || `
        <p class="carrito-vacio">
            No se encontraron pedidos.
        </p>
    `;
}

$("buscarPedido").addEventListener("input",renderPedidos);
$("filtroEstado").addEventListener("change",renderPedidos);

$("listaPedidos").addEventListener("click", event => {
    const boton = event.target.closest("[data-pdf-id]");
    if (!boton) return;

    const pedido = pedidos.find(
        p => p.id === Number(boton.dataset.pdfId)
    );

    if (pedido) generarPDF(pedido);
});

$("listaPedidos").addEventListener("change", async event => {
    const select = event.target.closest("[data-estado-id]");
    if (!select) return;

    const id = Number(select.dataset.estadoId);
    if (!sistemaListo || !Number.isSafeInteger(id) || !["Pendiente","Preparando","Entregado"].includes(select.value)) { await cargarPedidos(); return; }
    select.disabled = true;

    try {
        const actualizados = await db.pedidos.update(id, {
            estado:select.value
        });
        if (!actualizados) throw new Error("El pedido ya no existe.");

        await cargarPedidos();
        avisar("Estado actualizado.");
    } catch (error) {
        console.error(error);
        avisar("No se pudo actualizar el estado.");
        await cargarPedidos();
    }
});

function renderInventario() {
    $("listaInventario").innerHTML = PRODUCTOS.map(p => `
        <div class="inventario-item">
            <span style="font-size:27px">${p.emoji}</span>

            <div class="inventario-info">
                <strong>${escapar(p.nombre)}</strong>
                <small>Stock: ${inventario[p.id] || 0} unidades</small>
            </div>

            <input type="number" min="0" max="100000"
                step="1" value="${inventario[p.id] || 0}"
                id="stock-${p.id}"
                aria-label="Stock de ${escapar(p.nombre)}">

            <button class="btn-stock"
                data-stock-id="${p.id}">
                Guardar
            </button>
        </div>
    `).join("");
}

$("listaInventario").addEventListener("click", async event => {
    const boton = event.target.closest("[data-stock-id]");
    if (!boton) return;

    const id = boton.dataset.stockId;
    if (!sistemaListo || guardando || !PRODUCTOS.some(p => p.id === id)) return;
    const input = $("stock-" + id);
    const cantidad = Number(input.value);

    if (input.value.trim() === "" || !input.checkValidity() || !Number.isSafeInteger(cantidad) ||
        cantidad < 0 || cantidad > 100000) {
        errorCampo(input, "Ingresa un entero entre 0 y 100000.");
        input.focus();
        avisar("Ingresa una cantidad válida.");
        return;
    }

    if (cantidad < (carrito.find(p => p.id === id)?.cantidad || 0)) {
        errorCampo(input, "El stock no puede ser menor que la cantidad del pedido actual.");
        input.focus();
        return;
    }
    boton.disabled = true;
    try {
        await db.inventario.put({id,stock:cantidad});
        await cargarInventario();
        renderCarrito();
        avisar("Inventario actualizado.");
    } catch (error) {
        console.error(error);
        avisar("Error al guardar inventario.");
    } finally { boton.disabled = false; }
});

function renderReportes() {
    const ventas = pedidos.reduce(
        (s,p) => s + Number(p.total),0
    );

    const cantidad = pedidos.length;
    const promedio = cantidad ? ventas / cantidad : 0;
    const hoy = fechaDia(new Date().toISOString());

    const ventasHoy = pedidos
        .filter(p => fechaDia(p.fechaISO) === hoy)
        .reduce((s,p) => s + Number(p.total),0);

    $("reporteVentas").textContent = dinero(ventas);
    $("reportePedidos").textContent = cantidad;
    $("reportePromedio").textContent = dinero(promedio);
    $("reporteHoy").textContent = dinero(ventasHoy);

    const conteo = {};

    pedidos.forEach(p => {
        p.productos.forEach(item => {
            const clave = item.nombre;
            conteo[clave] = (conteo[clave] || 0) + item.cantidad;
        });
    });

    const populares = Object.entries(conteo)
        .sort((a,b) => b[1] - a[1])
        .slice(0,6);

    const maximo = populares[0]?.[1] || 1;

    $("productosPopulares").innerHTML = populares.map(
        ([nombre,cantidad]) => `
            <div class="popular-item">
                <div>
                    <strong>${escapar(nombre)}</strong>
                    <span>${cantidad} vendidos</span>
                </div>
                <div class="barra">
                    <span style="width:${cantidad/maximo*100}%"></span>
                </div>
            </div>
        `
    ).join("") || "<p>Todavía no hay ventas.</p>";
}

function csvSeguro(valor) {
    let texto = String(valor ?? "");

    if (/^\s*[=+\-@\t\r]/.test(texto)) {
        texto = "'" + texto;
    }

    return '"' + texto.replace(/"/g,'""') + '"';
}

$("exportarCSV").addEventListener("click", () => {
    if (!pedidos.length) {
        avisar("No hay pedidos para exportar.");
        return;
    }

    const filas = [
        ["ID","Fecha","Cliente","Tipo","Estado",
         "Pago","Subtotal","Descuento","Total","Productos"],

        ...pedidos.map(p => [
            p.id,
            fechaLocal(p.fechaISO),
            p.nombre,
            p.tipo,
            p.estado,
            p.metodo,
            p.subtotal.toFixed(2),
            p.descuento.toFixed(2),
            p.total.toFixed(2),
            p.productos.map(x =>
                `${x.cantidad} x ${x.nombre}`
            ).join(" | ")
        ])
    ];

    const csv = "\uFEFF" + filas
        .map(f => f.map(csvSeguro).join(";"))
        .join("\r\n");

    const blob = new Blob([csv],{
        type:"text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = "Ventas_NovaBite.csv";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    setTimeout(() => URL.revokeObjectURL(url),1000);
});


$("borrarHistorial").addEventListener("click", async () => {
    if (!sistemaListo || guardando) return;
    if (!pedidos.length) { avisar("No hay pedidos para eliminar."); return; }
    if (!await confirmar("¿Eliminar el historial?", "Se eliminarán permanentemente todos los pedidos y sus reportes. El inventario no se restablecerá. Esta acción no se puede deshacer.")) return;
    if (guardando) return;
    $("borrarHistorial").disabled = true;

    try {
        await db.pedidos.clear();

        ultimoPedido = null;
        $("descargarFactura").hidden = true;
        $("mensajePedido").textContent = "";

        await cargarPedidos();
        avisar("Historial eliminado.");
    } catch (error) {
        console.error(error);
        
        avisar("Error al eliminar historial.");
    } finally { $("borrarHistorial").disabled = false; }
});

async function iniciar() {
    $("fechaActual").textContent =
        new Date().toLocaleDateString("es-GT",{
            weekday:"long",
            year:"numeric",
            month:"long",
            day:"numeric"
        });

    try {
        if (!db) throw new Error("No se cargó la base de datos. Revisa tu conexión y vuelve a abrir la página.");
        await iniciarInventario();
        await cargarPedidos();
        sistemaListo = true;
        $("estadoSistema").textContent = "Caja lista";
        $("guardarPedido").disabled = false;
        renderCarrito();
    } catch (error) {
        console.error(error);
        $("estadoSistema").textContent = "Caja no disponible";
        $("mensajePedido").textContent = "No se pudo iniciar la base de datos. Comprueba la conexión, permite el almacenamiento del navegador y recarga la página.";
        $("mensajePedido").className = "mensaje-error";
        avisar("No se pudo iniciar la caja. Revisa el aviso del pedido.");
    }
}

// Errores junto a cada campo, accesibles y sin modificar silenciosamente los valores.
function errorCampo(input, mensaje) {
    const id = "error-" + input.id;
    let error = $(id);
    if (!error) { error = document.createElement("small"); error.id = id; error.className = "error-campo"; input.after(error); }
    error.textContent = mensaje;
    error.hidden = !mensaje;
    input.setAttribute("aria-invalid", String(Boolean(mensaje)));
    if (mensaje) input.setAttribute("aria-describedby", id);
    else input.removeAttribute("aria-describedby");
    return !mensaje;
}

function validarCampo(input) {
    const valor = input.value.trim();
    let mensaje = "";
    if (input.id === "nombreCliente") {
        if (valor.length < 2 || valor.length > 100 || !/\p{L}/u.test(valor) || /[\p{Cc}<>]/u.test(valor)) mensaje = "Escribe un nombre de 2 a 100 caracteres que incluya letras.";
    } else if (input.id === "notas") {
        if (input.value.length > 500 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(input.value)) mensaje = "Las notas admiten hasta 500 caracteres de texto.";
    } else if (input.id === "descuento") {
        if (!valor || !input.checkValidity() || !Number.isInteger(Number(valor)) || Number(valor) < 0 || Number(valor) > 100) mensaje = "Ingresa un porcentaje entero entre 0 y 100.";
    } else if (input.id === "efectivoRecibido" && $("metodoPago").value === "Efectivo") {
        if (!valor || !input.checkValidity() || !Number.isFinite(Number(valor)) || Number(valor) < 0 || Number(valor) > 10000000) mensaje = "Ingresa un monto entre 0 y 10000000 con hasta 2 decimales.";
        else if (centavos(valor) < centavos(calcularTotales().total)) mensaje = "El efectivo recibido debe cubrir el total del pedido.";
    } else if (input.id === "tipoPedido" && !["Local", "Para llevar"].includes(valor)) mensaje = "Selecciona un tipo de pedido válido.";
    else if (input.id === "metodoPago" && !["Efectivo", "Tarjeta"].includes(valor)) mensaje = "Selecciona un método de pago válido.";
    return errorCampo(input, mensaje);
}

function validarPedido() {
    const campos = ["nombreCliente", "tipoPedido", "notas", "descuento", "metodoPago", "efectivoRecibido"].map($);
    const invalidos = campos.filter(input => !validarCampo(input));
    if (invalidos.length) { invalidos[0].focus(); avisar("Revisa los campos marcados antes de cobrar."); return false; }
    if (!carrito.length) { avisar("Agrega al menos un producto al pedido."); $("buscarProducto").focus(); return false; }
    for (const item of carrito) {
        const producto = PRODUCTOS.find(p => p.id === item.id);
        if (!producto || !Number.isSafeInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > (inventario[item.id] || 0) || item.precio !== producto.precio) {
            avisar("Revisa las cantidades y existencias del pedido."); return false;
        }
    }
    return true;
}

function bloquearCobro(bloquear) {
    document.querySelectorAll(".panel-carrito input, .panel-carrito select, .panel-carrito textarea, .panel-carrito button").forEach(el => { el.disabled = bloquear; });
    $("guardarPedido").textContent = bloquear ? "Guardando pedido…" : "Confirmar y cobrar ↗";
    $("guardarPedido").setAttribute("aria-busy", String(bloquear));
    renderProductos();
}

function confirmar(titulo, texto) {
    const dialogo = $("confirmacion");
    if (dialogo.open) return Promise.resolve(false);
    $("confirmacionTitulo").textContent = titulo;
    $("confirmacionTexto").textContent = texto;
    return new Promise(resolve => {
        dialogo.returnValue = "cancelar";
        dialogo.addEventListener("close", () => resolve(dialogo.returnValue === "aceptar"), {once:true});
        dialogo.showModal();
    });
}

["nombreCliente", "tipoPedido", "notas", "descuento", "metodoPago", "efectivoRecibido"].forEach(id => {
    const input = $(id);
    input.addEventListener("blur", () => validarCampo(input));
    input.addEventListener("input", () => {
        if (input.getAttribute("aria-invalid") === "true") validarCampo(input);
    });
});
$("metodoPago").addEventListener("change", () => validarCampo($("efectivoRecibido")));
document.querySelectorAll(".categoria").forEach(boton => {
    boton.setAttribute("aria-pressed", String(boton.classList.contains("activa")));
    boton.addEventListener("click", () => document.querySelectorAll(".categoria").forEach(b => b.setAttribute("aria-pressed", String(b === boton))));
});
document.querySelectorAll(".nav-btn").forEach(boton => {
    boton.setAttribute("aria-current", boton.classList.contains("activo") ? "page" : "false");
    boton.addEventListener("click", () => document.querySelectorAll(".nav-btn").forEach(b => b.setAttribute("aria-current", b === boton ? "page" : "false")));
});

renderCarrito();
iniciar();
