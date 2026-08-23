let perfilActual = null;      // fila de usuarios (id, usuario, rol)
let emprendedorActual = null; // fila de emprendedores
let categorias = [];
let productoEditandoId = null; // null = creando, uuid = editando
let variantesEnEdicion = [];   // [{id?, nombre, valor, precio_adicional, _borrar?}]
let variantesEliminadas = [];  // ids de variantes existentes que se quitaron y hay que borrar en Supabase al guardar
let mediosPagoPerfilSeleccion = [];   // ids seleccionados en "Mi Perfil"
let mediosPagoProductoSeleccion = []; // ids seleccionados en el modal de producto
let productosCache = [];      // último listado de productos traído de Supabase

// URL del Worker de Cloudflare que maneja las suscripciones con MercadoPago.
// Reemplazar por la URL real una vez hecho el "wrangler deploy".
const WORKER_SUSCRIPCIONES_URL = 'https://comunidad-emprendedora-api.kentuckyr2.workers.dev';

// Filtros activos del buscador de "Mis productos"
let filtroBusquedaProductos = '';
let filtroEstadoProductos = 'todos';     // 'todos' | 'visibles' | 'ocultos'
let filtroCategoriaProductos = '';       // '' = todas

const grid = document.getElementById('grid-productos');
const contadorProductos = document.getElementById('contador-productos');
const modal = document.getElementById('modal-form');
const form = document.getElementById('form-producto');
const selectCategoria = document.getElementById('categoria');
const listaVariantes = document.getElementById('lista-variantes');

// Los campos de Instagram/TikTok solo piden el usuario (sin @ ni link).
// Esta función limpia lo que haya en el campo para quedarnos solo con el
// usuario, ya sea que la persona escriba "usuario", "@usuario" o pegue
// por error un link completo (ej: dato viejo guardado como URL entera).
function extraerUsuarioRedSocial(valor) {
    if (!valor) return '';
    let v = valor.trim();
    v = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    v = v.replace(/^(instagram\.com|tiktok\.com)\//i, '');
    v = v.replace(/^@/, '');
    v = v.split(/[?#]/)[0].split('/')[0];
    return v.trim();
}

document.addEventListener('DOMContentLoaded', async () => {
    perfilActual = await requerirSesion('emprendedor');
    if (!perfilActual) return; // requerirSesion ya redirige si no corresponde

    document.getElementById('usuario-sidebar').textContent = '@' + perfilActual.usuario;
    document.getElementById('nombre-tienda-sidebar').textContent = perfilActual.usuario;
    document.getElementById('avatar-sidebar-letra').textContent = perfilActual.usuario.charAt(0).toUpperCase();
    document.getElementById('link-ir-a-mi-perfil').href = urlPerfilPublico();
    await cargarPerfilEmprendedor();
    verificarTerminos();
    await cargarCategorias();
    await renderProductos(true);

    iniciarRealtimeDashboard();
});


function iniciarRealtimeDashboard() {

    const refrescarProductos = debounce(() => renderProductos(), 350);

    const refrescarCategorias = debounce(async () => {
        const seleccionActual = selectCategoria.value;
        await cargarCategorias();
        if (seleccionActual) selectCategoria.value = seleccionActual;
    }, 350);

    suscribirTabla('productos', refrescarProductos, `emprendedor_id=eq.${perfilActual.id}`);
    suscribirTabla('categorias', refrescarCategorias);

    // Si el admin bloquea/activa la tienda mientras el emprendedor está en el
    // panel, el banner se actualiza al toque, sin necesidad de recargar.
    suscribirTabla('emprendedores', (payload) => {
        emprendedorActual = payload.new;
        actualizarBannerBloqueo(emprendedorActual);
        renderEstadoSuscripcion(emprendedorActual);
        evaluarAccesoYAvisar(emprendedorActual);
    }, `id=eq.${perfilActual.id}`);

    // Además del chequeo en tiempo real (que depende de que algo cambie
    // en la fila), revisamos el vencimiento cada 5 minutos por si el
    // panel queda abierto en una pestaña y el plazo se cumple mientras
    // tanto (sin que nadie lo edite desde el admin).
    setInterval(() => evaluarAccesoYAvisar(emprendedorActual), 5 * 60 * 1000);
}

// ============================================================
// AVISO DE SUSCRIPCIÓN VENCIDA / CUENTA BLOQUEADA
// ============================================================
// El bloqueo real pasa por otro lado: cuando la suscripción vence, la
// cuenta se marca como inactiva y la tienda deja de mostrarse en la
// comunidad (eso ya lo refleja el banner #banner-tienda-bloqueada, que
// sigue funcionando igual que antes). Este modal es sólo un aviso: se
// muestra una vez al ingresar para que el emprendedor se entere de que
// tiene que pagar de nuevo, pero no le impide seguir usando el panel.
let avisoVencimientoMostrado = false;

function evaluarAccesoYAvisar(emprendedor) {
    const info = calcularEstadoAcceso(emprendedor);
    if (info.bloqueado && !avisoVencimientoMostrado) {
        mostrarModalVencimiento(info);
        avisoVencimientoMostrado = true;
    }
}

function mostrarModalVencimiento(info) {
    const modal = document.getElementById('modal-vencimiento');
    if (!modal) return;

    const titulo = document.getElementById('modal-vencimiento-titulo');
    const mensaje = document.getElementById('modal-vencimiento-mensaje');
    const btnPagar = document.getElementById('modal-vencimiento-btn-pagar');

    if (info.motivo === 'admin') {
        titulo.textContent = 'Tu tienda está bloqueada';
        mensaje.textContent = info.mensaje;
        // El bloqueo manual del admin no siempre es por falta de pago,
        // así que no mostramos el botón de pagar en ese caso.
        btnPagar.classList.add('hidden');
    } else {
        titulo.textContent = 'Tu mes gratis terminó';
        mensaje.textContent = 'Tu tienda dejó de mostrarse en la comunidad. Para reactivarla, activá tu suscripción mensual.';
        btnPagar.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function cerrarModalVencimiento() {
    const modal = document.getElementById('modal-vencimiento');
    if (!modal) return;
    modal.classList.add('hidden');
    // Sólo liberamos el scroll si no hay otro modal (términos) pidiéndolo.
    const modalTerminos = document.getElementById('modal-terminos');
    if (!modalTerminos || modalTerminos.classList.contains('hidden')) {
        document.body.classList.remove('overflow-hidden');
    }
}

// ============================================================
// TÉRMINOS Y CONDICIONES
// ============================================================
// La fuente de verdad es la columna "terminos_aceptados" en Supabase (así el
// admin puede ver en admin.html quién aceptó y quién rechazó). El localStorage
// es sólo una caché para no mostrar el modal de nuevo en este mismo navegador
// mientras se termina de confirmar el guardado.
function claveTerminosLocalStorage() {
    return `cp_terminos_${perfilActual.id}`;
}

function verificarTerminos() {
    // Ya aceptó según la base de datos -> no mostramos nada.
    if (emprendedorActual && emprendedorActual.terminos_aceptados === true) {
        localStorage.setItem(claveTerminosLocalStorage(), '1');
        return;
    }

    // Todavía no respondió, o rechazó anteriormente -> mostramos el modal para
    // que vuelva a decidir (si rechaza, se le cierra la sesión; sin importar el
    // localStorage: la base manda, por si entra desde otro dispositivo/navegador).
    document.getElementById('modal-terminos').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

async function responderTerminos(acepto) {
    const btnAceptar = document.getElementById('btn-aceptar-terminos');
    const btnRechazar = document.getElementById('btn-rechazar-terminos');
    btnAceptar.disabled = true;
    btnRechazar.disabled = true;

    const { error } = await supabase.from('emprendedores')
        .update({ terminos_aceptados: acepto, terminos_respondido_en: new Date().toISOString() })
        .eq('id', perfilActual.id);

    if (error) {
        btnAceptar.disabled = false;
        btnRechazar.disabled = false;
        mostrarToast('No se pudo guardar tu respuesta. Probá de nuevo.', 'error');
        console.error(error);
        return;
    }

    emprendedorActual.terminos_aceptados = acepto;
    localStorage.setItem(claveTerminosLocalStorage(), '1');

    if (!acepto) {
        // Si rechaza los términos, no puede seguir usando el panel: le avisamos
        // y le cerramos la sesión. La próxima vez que inicie sesión, verificarTerminos()
        // va a volver a mostrarle el modal para que decida.
        mostrarToast('Registramos tu rechazo de los términos. Cerrando sesión...', 'info');
        setTimeout(() => { cerrarSesion(); }, 1800);
        return;
    }

    document.getElementById('modal-terminos').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');

    mostrarToast('Gracias por aceptar los términos.', 'success');
}

// Muestra/oculta el aviso de "tienda bloqueada" según el estado del emprendedor.
function actualizarBannerBloqueo(emprendedor) {
    const banner = document.getElementById('banner-tienda-bloqueada');
    if (!banner) return;

    // Usamos calcularEstadoAcceso() (la misma función que dispara el modal
    // de vencimiento y que usa admin.js) en vez de mirar sólo "activo".
    // "activo" únicamente se pone en false cuando el admin bloquea a mano;
    // cuando lo que pasó es que se venció el mes gratis o la suscripción,
    // "activo" sigue en true y este banner nunca se enteraba.
    const acceso = calcularEstadoAcceso(emprendedor);
    const titulo = document.getElementById('banner-tienda-bloqueada-titulo');
    const motivoEl = document.getElementById('banner-tienda-bloqueada-motivo');

    banner.classList.toggle('hidden', !acceso.bloqueado);
    if (!acceso.bloqueado) return;

    if (acceso.motivo === 'admin') {
        if (titulo) titulo.textContent = 'Tu tienda está bloqueada';
        motivoEl.textContent = emprendedor.motivo_bloqueo || 'Contactate con el equipo de la comunidad para más información.';
    } else {
        if (titulo) titulo.textContent = 'Tu tienda no se muestra en la comunidad';
        motivoEl.textContent = 'Terminó tu mes gratis (o venció tu suscripción) sin renovarse. Activá el pago para que vuelva a aparecer.';
    }
}

async function cargarCategorias() {
    const { data, error } = await supabase.from('categorias').select('*').order('nombre');
    if (error) { console.error(error); return; }
    categorias = data;
    selectCategoria.innerHTML = '<option value="" disabled selected>Elegí categoría</option>'
        + categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

    // Select del filtro de "Mis productos" (conserva la selección si ya había una)
    const selectFiltroCategoria = document.getElementById('filtro-categoria-productos');
    if (selectFiltroCategoria) {
        const seleccionActual = selectFiltroCategoria.value;
        selectFiltroCategoria.innerHTML = '<option value="">Todas las categorías</option>'
            + categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        selectFiltroCategoria.value = seleccionActual;
    }
}

// Buscador con debounce: no filtra en cada tecla, espera a que la persona pare de escribir.
const onFiltroBusquedaProductos = debounce(() => {
    filtroBusquedaProductos = document.getElementById('filtro-busqueda-productos').value;
    pintarGridProductos();
}, 250);

function onFiltroCambiado() {
    filtroEstadoProductos = document.getElementById('filtro-estado-productos').value;
    filtroCategoriaProductos = document.getElementById('filtro-categoria-productos').value;
    pintarGridProductos();
}

function limpiarFiltrosProductos() {
    filtroBusquedaProductos = '';
    filtroEstadoProductos = 'todos';
    filtroCategoriaProductos = '';
    document.getElementById('filtro-busqueda-productos').value = '';
    document.getElementById('filtro-estado-productos').value = 'todos';
    document.getElementById('filtro-categoria-productos').value = '';
    pintarGridProductos();
}

// Aplica los filtros activos (búsqueda + estado + categoría) sobre el listado completo.
function obtenerProductosFiltrados() {
    const termino = filtroBusquedaProductos.trim().toLowerCase();
    return productosCache.filter(p => {
        if (filtroEstadoProductos === 'visibles' && !p.activo) return false;
        if (filtroEstadoProductos === 'ocultos' && p.activo) return false;
        if (filtroCategoriaProductos && String(p.categoria_id) !== String(filtroCategoriaProductos)) return false;
        if (termino && !(p.nombre || '').toLowerCase().includes(termino)) return false;
        return true;
    });
}


// ============================================================
// TRANSFERENCIA BANCARIA / INFORMAR PAGO
// ============================================================

// Copia CBU/alias al portapapeles. Usa la Clipboard API cuando está
// disponible (contexto https) y cae a execCommand como respaldo para
// navegadores o contextos que no la soportan. Da feedback visual en el
// propio botón además del toast, para que quede claro en mobile.
async function copiarTexto(texto, boton) {
    let copiado = false;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
            copiado = true;
        }
    } catch (err) {
        console.error(err);
    }

    if (!copiado) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = texto;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            copiado = true;
        } catch (err) {
            console.error(err);
        }
    }

    if (!copiado) {
        mostrarToast('No se pudo copiar. Copialo manualmente.', 'error');
        return;
    }

    mostrarToast('Copiado al portapapeles', 'success');

    if (boton) {
        const htmlOriginal = boton.innerHTML;
        boton.innerHTML = '¡Copiado!';
        boton.disabled = true;
        setTimeout(() => {
            boton.innerHTML = htmlOriginal;
            boton.disabled = false;
        }, 1500);
    }
}

// Abre WhatsApp con un mensaje pre-armado para informar el pago por
// transferencia. Incluye el usuario del emprendedor para identificar
// rápido qué cuenta hay que activar desde el admin al recibir el
// comprobante (que la persona adjunta a mano en el chat de WhatsApp).
function informarPagoWhatsapp() {
    const usuario = perfilActual ? perfilActual.usuario : '';
    const texto = `Hola! Quiero informar el pago de mi suscripción por transferencia.\n\nUsuario: @${usuario}\n\nTe mando el comprobante 👇`;
    const url = `https://wa.me/549XXXXXXXXXX?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener');
}

const NAV_BASE = "w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 group";
const NAV_ACTIVO = `${NAV_BASE} bg-yellow-400 text-black font-bold shadow-md shadow-yellow-400/10`;
const NAV_INACTIVO = `${NAV_BASE} text-slate-400 hover:text-white hover:bg-white/5`;

function mostrarSeccion(seccionId) {
    const secciones = {
        productos: document.getElementById('section-productos'),
        perfil: document.getElementById('section-perfil'),
        soporte: document.getElementById('section-soporte'),
        anuncios: document.getElementById('section-anuncios'),
        qr: document.getElementById('section-qr'),
        credencial: document.getElementById('section-credencial'),
    };
    const navs = {
        productos: document.getElementById('nav-productos'),
        perfil: document.getElementById('nav-perfil'),
        soporte: document.getElementById('nav-soporte'),
        anuncios: document.getElementById('nav-anuncios'),
        qr: document.getElementById('nav-qr'),
        credencial: document.getElementById('nav-credencial'),
    };

    Object.keys(secciones).forEach((id) => {
        const activa = id === seccionId;
        secciones[id].classList.toggle('hidden', !activa);
        navs[id].className = activa ? NAV_ACTIVO : NAV_INACTIVO;
    });

    if (seccionId === 'anuncios') actualizarContadorAnuncio();
    // La vista previa del cartel QR se arma recién al entrar a la sección
    // (evita generar el QR/objeto de vista previa si el emprendedor nunca la visita).
    if (seccionId === 'qr') renderFormatoQR(formatoQRActivo);
    // Igual con la credencial: se arma al entrar, con los datos ya cargados.
    if (seccionId === 'credencial') renderCredencialQR();
}

async function renderProductos(mostrarSpinner = false) {
    if (mostrarSpinner) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-3 py-24 text-slate-400 font-semibold">
                <svg class="w-6 h-6 animate-spin text-slate-300" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Cargando productos...</span>
            </div>`;
    }

    const { data, error } = await supabase
        .from('productos')
        .select('*, categorias(nombre)')
        .eq('emprendedor_id', perfilActual.id)
        .order('created_at', { ascending: false });

    if (error) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-2 py-24 text-red-400 font-semibold">
                <span>Error cargando productos.</span>
            </div>`;
        contadorProductos.textContent = '';
        console.error(error);
        return;
    }

    productosCache = data;
    pintarGridProductos();
}

function pintarGridProductos() {
    const btnHeader = document.getElementById('btn-nuevo-producto-header');

    // Sin productos cargados todavía (no es un tema de filtros)
    if (productosCache.length === 0) {
        if (btnHeader) btnHeader.classList.add('hidden');
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-3 py-24 text-center">
                <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">🛍️</div>
                <p class="text-slate-500 font-bold">Todavía no subiste productos.</p>
                <p class="text-slate-400 text-sm">Empezá creando tu primer producto para mostrarlo en Comunidad Online y en tu perfil.</p>
                <button onclick="abrirFormulario()" class="mt-2 inline-flex items-center gap-2 bg-obsidian text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-yellow-400 hover:text-black transition-all">
                    + Nuevo Producto
                </button>
            </div>`;
        contadorProductos.textContent = '';
        return;
    }

    if (btnHeader) btnHeader.classList.remove('hidden');

    const productos = obtenerProductosFiltrados();
    const totalVisibles = productosCache.filter(p => p.activo).length;
    const totalDestacados = productosCache.filter(p => p.destacado).length;
    const hayFiltrosActivos = !!(filtroBusquedaProductos.trim() || filtroEstadoProductos !== 'todos' || filtroCategoriaProductos);

    contadorProductos.textContent = hayFiltrosActivos
        ? `${productos.length} de ${productosCache.length} producto${productosCache.length === 1 ? '' : 's'} · ${totalVisibles} con stock en total · ${totalDestacados}/3 destacados`
        : `${productosCache.length} producto${productosCache.length === 1 ? '' : 's'} · ${totalVisibles} con stock · ${totalDestacados}/3 destacados`;

    // Hay productos en la cuenta, pero ninguno coincide con el filtro actual
    if (productos.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-3 py-24 text-center">
                <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">🔎</div>
                <p class="text-slate-500 font-bold">No encontramos productos con esos filtros.</p>
                <p class="text-slate-400 text-sm">Probá con otra búsqueda o cambiá los filtros.</p>
                <button onclick="limpiarFiltrosProductos()" class="mt-2 inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all">
                    Limpiar filtros
                </button>
            </div>`;
        return;
    }

    grid.innerHTML = productos.map(p => `
        <div class="group bg-white rounded-xl sm:rounded-2xl border ${p.destacado ? 'border-yellow-400 ring-1 ring-yellow-400/70 shadow-md shadow-yellow-400/10' : 'border-slate-200 hover:border-slate-300'} shadow-sm hover:shadow-lg hover:shadow-slate-900/5 transition-all duration-300 overflow-hidden flex flex-col">
            <div class="relative aspect-square bg-slate-100 overflow-hidden">
                <img src="${miniaturaCloudinary(p.imagen_url, 400)}" alt="${escapeHtml(p.nombre)}" class="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500" loading="lazy" decoding="async">
                <span class="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 flex items-center gap-1 text-[8px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full backdrop-blur-sm ${p.activo ? 'bg-emerald-500/90 text-white' : 'bg-slate-900/75 text-white'}">
                    <span class="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white/90"></span>
                    ${p.activo ? 'Visible' : 'Sin stock'}
                </span>
                <button onclick="toggleDestacadoProducto('${p.id}', ${!!p.destacado})" title="${p.destacado ? 'Quitar de destacados' : 'Marcar como destacado'}"
                    class="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all backdrop-blur-sm ${p.destacado ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/50' : 'bg-black/35 text-white/85 hover:bg-black/55'}">
                    <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="${p.destacado ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3.6l2.47 5.15 5.58.8-4.03 4.03.95 5.72L12 16.5l-5 2.8.95-5.72-4.03-4.03 5.58-.8L12 3.6z"/>
                    </svg>
                </button>
                ${p.destacado ? `
                <span class="absolute bottom-1.5 left-1.5 sm:bottom-2.5 sm:left-2.5 flex items-center gap-1 text-[8px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-yellow-400 text-black shadow-sm">
                    <svg class="w-2.5 h-2.5 sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.6 5.27 5.82.85-4.21 4.1.99 5.8L12 15.8l-5.2 2.72.99-5.8-4.21-4.1 5.82-.85L12 2.5z"/></svg>
                    Destacado
                </span>` : ''}
                ${esProductoNuevoVigente(p) ? `
                <span title="Le quedan ${diasRestantesNuevo(p)} día${diasRestantesNuevo(p) === 1 ? '' : 's'} de cartel Nuevo" class="absolute bottom-1.5 right-1.5 sm:bottom-2.5 sm:right-2.5 flex items-center gap-1 text-[8px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-sky-500 text-white shadow-sm">
                    Nuevo · ${diasRestantesNuevo(p)}d
                </span>` : ''}
            </div>
            <div class="p-2 sm:p-3.5 flex flex-col gap-0.5 sm:gap-1 flex-1">
                <span class="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">${p.categorias ? escapeHtml(p.categorias.nombre) : 'Sin categoría'}</span>
                <h3 class="font-bold sm:font-extrabold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2">${escapeHtml(p.nombre)}</h3>
                <div class="pt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span class="font-black text-sm sm:text-base text-slate-900">${formatoPrecio(p.precio)}</span>
                    ${calcularDescuentoPorcentaje(p.precio_anterior, p.precio) > 0 ? `
                        <span class="text-[10px] sm:text-xs font-bold text-slate-400 line-through">${formatoPrecio(p.precio_anterior)}</span>
                        <span class="text-[8px] sm:text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-600 text-white">-${calcularDescuentoPorcentaje(p.precio_anterior, p.precio)}% OFF</span>
                    ` : ''}
                </div>
                <div class="mt-auto pt-1.5 sm:pt-2 flex items-center gap-1 sm:gap-1.5 border-t border-slate-100 -mx-2 sm:-mx-3.5 px-2 sm:px-3.5 pt-2">
                    <button onclick="toggleActivoProducto('${p.id}', ${p.activo})" title="${p.activo ? 'Ocultar' : 'Mostrar'}" class="flex-1 h-7 sm:h-8 rounded-lg bg-slate-50 text-slate-600 ${p.activo ? 'hover:bg-slate-700 hover:text-white' : 'hover:bg-emerald-500 hover:text-white'} flex items-center justify-center transition-colors">
                        ${p.activo
                            ? `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`
                            : `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.774 3.162 10.066 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>`}
                    </button>
                    <button onclick="copiarLinkProducto('${p.id}')" title="Copiar link para compartir" class="flex-1 h-7 sm:h-8 rounded-lg bg-slate-50 text-slate-600 hover:bg-sky-500 hover:text-white flex items-center justify-center transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>
                    </button>
                    <button onclick="editarProducto('${p.id}')" title="Editar" class="flex-1 h-7 sm:h-8 rounded-lg bg-slate-50 text-slate-600 hover:bg-yellow-400 hover:text-black flex items-center justify-center transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick="eliminarProducto('${p.id}')" title="Eliminar" class="flex-1 h-7 sm:h-8 rounded-lg bg-slate-50 text-slate-600 hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// Arma el link público del producto (perfil del emprendedor con el modal
// del producto abierto automáticamente) y lo copia al portapapeles.
function copiarLinkProducto(id) {
    copiarAlPortapapeles(`${urlPerfilPublico()}&producto=${id}`, 'Link del producto copiado. ¡Ya lo podés compartir!');
}

// Arma el link público del perfil del emprendedor (emprendedor.html?t=usuario).
// Se usa tanto para "Ir a mi perfil" como para compartir el link de un producto.
// Usa SITIO_PUBLICO (definido en supabase-client.js) en vez de window.location.origin,
// porque el dashboard vive en un dominio distinto (Vercel) al del sitio público
// (Cloudflare), donde realmente está emprendedor.html.
function urlPerfilPublico() {
    return `${SITIO_PUBLICO}/emprendedor.html?t=${encodeURIComponent(perfilActual.usuario)}`;
}

// ============================================================
// MEDIOS DE PAGO
// ============================================================
function renderMediosPagoPerfil() {
    const cont = document.getElementById('medios-pago-perfil');
    cont.innerHTML = MEDIOS_PAGO.map(m => `
        <button type="button" onclick="toggleMedioPagoPerfil('${m.id}')"
            class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${mediosPagoPerfilSeleccion.includes(m.id) ? 'bg-obsidian text-white border-obsidian' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}">
            <span>${m.icon}</span><span>${m.label}</span>
        </button>
    `).join('');
}

function toggleMedioPagoPerfil(id) {
    mediosPagoPerfilSeleccion = mediosPagoPerfilSeleccion.includes(id)
        ? mediosPagoPerfilSeleccion.filter(x => x !== id)
        : [...mediosPagoPerfilSeleccion, id];
    renderMediosPagoPerfil();
}

function renderMediosPagoProducto() {
    const cont = document.getElementById('medios-pago-producto');
    const disponibles = MEDIOS_PAGO.filter(m => (emprendedorActual?.medios_pago || []).includes(m.id));

    if (disponibles.length === 0) {
        cont.innerHTML = `<p class="field-hint" style="margin:0;">Todavía no configuraste medios de pago en <button type="button" onclick="mostrarSeccion('perfil'); cerrarFormulario();" style="text-decoration:underline; font-weight:700; color:inherit; background:none; border:none; cursor:pointer; padding:0;">Mi Perfil</button>.</p>`;
        return;
    }

    cont.innerHTML = disponibles.map(m => `
        <button type="button" onclick="toggleMedioPagoProducto('${m.id}')"
            class="tag-chip ${mediosPagoProductoSeleccion.includes(m.id) ? 'selected' : ''}">
            <span>${m.icon}</span><span>${m.label}</span>
        </button>
    `).join('');
}

function toggleMedioPagoProducto(id) {
    mediosPagoProductoSeleccion = mediosPagoProductoSeleccion.includes(id)
        ? mediosPagoProductoSeleccion.filter(x => x !== id)
        : [...mediosPagoProductoSeleccion, id];
    renderMediosPagoProducto();
}

// ============================================================
// MODAL: ABRIR / CERRAR
// ============================================================
function abrirFormulario() {
    productoEditandoId = null;
    variantesEnEdicion = [];
    variantesEliminadas = [];
    mediosPagoProductoSeleccion = [];
    document.getElementById('titulo-modal').textContent = 'Nuevo producto';
    form.reset();
    document.getElementById('imagen').value = '';
    document.getElementById('categoria').value = '';
    document.getElementById('activo').checked = true;
    document.getElementById('nuevo').checked = false;
    actualizarPreviewImagenProducto('');
    renderVariantes();
    renderMediosPagoProducto();
    modal.classList.add('open');
    document.body.classList.add('overflow-hidden');
    document.getElementById('cuerpo-modal-producto').scrollTop = 0;
    ajustarModalAlViewportVisible();
}

// ============================================================
// TECLADO VIRTUAL EN MOBILE — el modal se ajusta al alto real
// ============================================================
// Muchos navegadores (sobre todo Android) NO achican el layout viewport
// cuando aparece el teclado, así que el 100dvh del modal se queda igual
// de grande y el teclado tapa el campo activo sin dejar nada para
// scrollear. Usamos la Visual Viewport API para conocer el alto
// realmente visible y achicar el modal a ese tamaño en tiempo real;
// así el campo enfocado siempre queda dentro del área con scroll.
function ajustarModalAlViewportVisible() {
    if (!window.visualViewport || !modal.classList.contains('open')) return;
    const vv = window.visualViewport;
    document.documentElement.style.setProperty('--app-height', vv.height + 'px');
    // En iOS, al abrirse el teclado el viewport visual puede desplazarse
    // respecto del layout viewport; corregimos el offset para que el
    // modal (position: fixed) no quede "corrido" hacia arriba o abajo.
    modal.style.top = vv.offsetTop + 'px';
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', ajustarModalAlViewportVisible);
    window.visualViewport.addEventListener('scroll', ajustarModalAlViewportVisible);
}

// Al enfocar un campo dentro del modal, lo centramos en la zona visible.
// Esperamos al evento "resize" del visualViewport (que se dispara cuando
// el teclado termina de abrirse) en vez de un timeout fijo, con un
// timeout de respaldo por si el teclado ya estaba abierto y no hay resize.
document.getElementById('cuerpo-modal-producto').addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el.matches('input, textarea, select')) return;

    const centrarCampo = () => el.scrollIntoView({ block: 'center', behavior: 'smooth' });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', centrarCampo, { once: true });
        setTimeout(centrarCampo, 350); // respaldo si el teclado ya estaba abierto
    } else {
        setTimeout(centrarCampo, 300);
    }
});

function cerrarFormulario() {
    modal.classList.remove('open');
    modal.style.top = '';
    form.reset();
    document.getElementById('imagen').value = '';
    productoEditandoId = null;
    variantesEnEdicion = [];
    variantesEliminadas = [];
    mediosPagoProductoSeleccion = [];
    actualizarPreviewImagenProducto('');
    document.body.classList.remove('overflow-hidden');
}

// ============================================================
// SUBIDA DE IMAGEN — PRODUCTO (Supabase Storage)
// ============================================================
async function manejarSeleccionImagenProducto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const errorValidacion = validarImagenSeleccionada(file);
    if (errorValidacion) {
        mostrarToast(errorValidacion, 'error');
        event.target.value = '';
        return;
    }

    const urlAnterior = document.getElementById('imagen').value;
    mostrarSpinnerImagen('imagen-producto', true);
    try {
        const url = await subirImagenProductoSupabase(file, perfilActual.id);
        document.getElementById('imagen').value = url;
        actualizarPreviewImagenProducto(url);
        // Si estábamos reemplazando una foto subida por este mismo sistema, borramos la
        // vieja (nunca la default, que es compartida por todos los productos sin foto)
        if (urlAnterior && urlAnterior !== IMAGEN_PRODUCTO_DEFAULT) borrarImagenProductoSupabase(urlAnterior);
    } catch (err) {
        console.error(err);
        mostrarToast('No se pudo subir la imagen. Probá de nuevo.', 'error');
    } finally {
        mostrarSpinnerImagen('imagen-producto', false);
        event.target.value = '';
    }
}

function mostrarSpinnerImagen(prefijo, mostrar) {
    const spinner = document.getElementById(`${prefijo}-spinner`);
    if (spinner) spinner.classList.toggle('hidden', !mostrar);
}

async function editarProducto(id) {
    const { data: p, error } = await supabase.from('productos').select('*').eq('id', id).single();
    if (error) { mostrarToast('No se pudo cargar el producto.', 'error'); return; }

    const { data: vs } = await supabase.from('variantes').select('*').eq('producto_id', id);

    productoEditandoId = id;
    variantesEnEdicion = (vs || []).map(v => ({ ...v }));
    variantesEliminadas = [];
    mediosPagoProductoSeleccion = p.medios_pago || [];

    document.getElementById('titulo-modal').textContent = 'Editar producto';
    document.getElementById('nombre').value = p.nombre;
    document.getElementById('precio').value = formatoPrecioInput(p.precio);
    document.getElementById('precio_anterior').value = p.precio_anterior ? formatoPrecioInput(p.precio_anterior) : '';
    document.getElementById('categoria').value = p.categoria_id;
    document.getElementById('imagen').value = p.imagen_url || '';
    document.getElementById('descripcion').value = p.descripcion || '';
    document.getElementById('activo').checked = p.activo;
    document.getElementById('nuevo').checked = !!p.nuevo;
    actualizarPreviewImagenProducto(p.imagen_url);

    renderVariantes();
    renderMediosPagoProducto();
    modal.classList.add('open');
    document.body.classList.add('overflow-hidden');
    document.getElementById('cuerpo-modal-producto').scrollTop = 0;
    ajustarModalAlViewportVisible();
}

// Muestra la preview de la imagen del producto (o el placeholder si está vacía/URL inválida)
function actualizarPreviewImagenProducto(url) {
    const area = document.getElementById('imagen-producto-area');
    const img = document.getElementById('imagen-producto-preview');
    const placeholder = document.getElementById('imagen-producto-preview-placeholder');
    const acciones = document.getElementById('imagen-producto-actions');
    const valor = (url || '').trim();

    if (!valor) {
        img.classList.add('hidden');
        img.src = '';
        placeholder.classList.remove('hidden');
        area.classList.remove('has-image');
        acciones.classList.add('hidden');
        return;
    }

    img.onerror = () => {
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
        area.classList.remove('has-image');
        acciones.classList.add('hidden');
    };
    img.onload = () => {
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
        area.classList.add('has-image');
        acciones.classList.remove('hidden');
    };
    img.src = valor;
}

// Quita la imagen cargada (vuelve al placeholder). Si era una imagen propia
// (no la default compartida), la borra también del storage.
function quitarImagenProducto() {
    const urlAnterior = document.getElementById('imagen').value;
    document.getElementById('imagen').value = '';
    actualizarPreviewImagenProducto('');
    if (urlAnterior && urlAnterior !== IMAGEN_PRODUCTO_DEFAULT) borrarImagenProductoSupabase(urlAnterior);
}

// ============================================================
// VARIANTES (edición en memoria, se guardan al submit)
// ============================================================
function agregarFilaVariante() {
    variantesEnEdicion.push({ nombre: '', valor: '', precio_adicional: 0, disponible: true });
    renderVariantes();
}

function quitarFilaVariante(idx) {
    const v = variantesEnEdicion[idx];
    // Si ya existía guardada en Supabase (tiene id), la anotamos para borrarla
    // de la base al guardar; si es una fila nueva sin guardar, con sacarla
    // del array en memoria alcanza.
    if (v?.id) variantesEliminadas.push(v.id);
    variantesEnEdicion.splice(idx, 1);
    renderVariantes();
}

function actualizarCampoVariante(idx, campo, valor) {
    variantesEnEdicion[idx][campo] = valor;
}

// Precio final de esa variante: si el emprendedor cargó un precio propio para
// la combinación (ej: "Con caja" -> $60.000), se usa ese precio TAL CUAL, sin
// sumarle nada al precio base. Si lo deja vacío/en 0, esa variante no tiene un
// precio distinto y se cobra el precio base del producto.
function calcularTotalVariante(idx) {
    const base = parsearPrecio(document.getElementById('precio').value);
    const propio = parsearPrecio(variantesEnEdicion[idx]?.precio_adicional ?? 0);
    return propio > 0 ? propio : base;
}

function actualizarTotalVariante(idx) {
    const el = document.getElementById(`variant-total-${idx}`);
    if (el) el.textContent = `Precio final: ${formatoPrecio(calcularTotalVariante(idx))}`;
}

// Se llama cuando cambia el precio base: como el precio final de las variantes
// que no tienen precio propio depende de él, hay que refrescar totales Y el
// placeholder (que muestra el precio base como referencia de "si lo dejás
// vacío, se cobra esto").
function actualizarTodosLosTotalesVariantes() {
    const base = formatoPrecioInput(parsearPrecio(document.getElementById('precio').value || 0)) || '0';
    variantesEnEdicion.forEach((_, idx) => {
        actualizarTotalVariante(idx);
        const inputPrecio = document.getElementById(`variant-precio-${idx}`);
        if (inputPrecio) inputPrecio.placeholder = base;
    });
}

// Marca una variante como "con stock" o "sin stock". Sigue existiendo y
// editable, pero se muestra tachada y no seleccionable en la tienda pública.
function marcarStockVariante(idx, disponible) {
    variantesEnEdicion[idx].disponible = disponible;
    renderVariantes();
}

function renderVariantes() {
    if (variantesEnEdicion.length === 0) {
        listaVariantes.innerHTML = `
            <div class="empty-variants">
                <p>Sin variantes cargadas.</p>
                <button type="button" onclick="agregarFilaVariante()">+ Agregar la primera</button>
            </div>`;
        actualizarAvisoSinStock();
        return;
    }

    const encabezado = `
        <div class="variant-header">
            <span>Nombre</span>
            <span>Valor</span>
            <span>Precio</span>
            <span>Stock</span>
            <span></span>
        </div>`;

    listaVariantes.innerHTML = encabezado + variantesEnEdicion.map((v, idx) => {
        const sinStock = v.disponible === false;
        return `
        <div class="variant-row ${sinStock ? 'sin-stock' : ''}">
            <div class="variant-cell variant-cell-nombre">
                <input type="text" placeholder="Ej: Talle, Color, Sabor" value="${escapeHtml(v.nombre)}"
                    oninput="actualizarCampoVariante(${idx}, 'nombre', this.value)">
            </div>
            <div class="variant-cell variant-cell-valor">
                <input type="text" placeholder="Ej: M, Rojo, Chocolate" value="${escapeHtml(v.valor)}"
                    oninput="actualizarCampoVariante(${idx}, 'valor', this.value)">
            </div>
            <div class="variant-cell variant-cell-precio">
                <input type="text" inputmode="decimal" id="variant-precio-${idx}" placeholder="${formatoPrecioInput(parsearPrecio(document.getElementById('precio')?.value || 0)) || '0'}" value="${formatoPrecioInput(parsearPrecio(v.precio_adicional ?? 0)) === '0' ? '' : formatoPrecioInput(parsearPrecio(v.precio_adicional ?? 0))}"
                    oninput="sanitizarInputPrecio(this); actualizarCampoVariante(${idx}, 'precio_adicional', this.value); actualizarTotalVariante(${idx})"
                    onblur="formatearInputPrecio(this)">
                <span class="variant-total-hint" id="variant-total-${idx}">Precio final: ${formatoPrecio(calcularTotalVariante(idx))}</span>
            </div>
            <div class="variant-cell variant-cell-stock">
                <div class="variant-stock-btns">
                    <button type="button" class="variant-stock-btn ${sinStock ? '' : 'activo-on'}" onclick="marcarStockVariante(${idx}, true)"><span class="variant-stock-btn-dot"></span>Con stock</button>
                    <button type="button" class="variant-stock-btn ${sinStock ? 'activo-off' : ''}" onclick="marcarStockVariante(${idx}, false)"><span class="variant-stock-btn-dot"></span>Sin stock</button>
                </div>
            </div>
            <div class="variant-cell variant-cell-remove">
                <button type="button" onclick="quitarFilaVariante(${idx})" title="Quitar variante" class="variant-remove">✕</button>
            </div>
        </div>
    `;
    }).join('');

    actualizarAvisoSinStock();
}

// Muestra/oculta el aviso de "se va a ocultar el producto" en vivo, a medida
// que el emprendedor tilda/destilda variantes como sin stock (sin esperar a guardar).
function actualizarAvisoSinStock() {
    const aviso = document.getElementById('aviso-sin-stock');
    if (!aviso) return;
    const variantesValidas = variantesEnEdicion.filter(v => v.nombre?.trim() && v.valor?.trim());
    const todasSinStock = variantesValidas.length > 0 && variantesValidas.every(v => v.disponible === false);
    aviso.classList.toggle('hidden', !todasSinStock);
}

// ============================================================
// GUARDAR PRODUCTO (crear o editar) + sus variantes
// ============================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // La imagen es opcional: si no subieron ninguna, usamos una foto
    // genérica para que la card del producto no quede vacía/rota.
    const imagenUrl = document.getElementById('imagen').value.trim() || IMAGEN_PRODUCTO_DEFAULT;

    const btn = document.getElementById('btn-guardar-producto');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    // Si el producto tiene variantes cargadas y TODAS quedaron marcadas como
    // "sin stock", no tiene sentido que siga visible en la tienda (no habría
    // nada seleccionable para comprar): lo ocultamos automáticamente aunque
    // el toggle "Visible en la tienda" haya quedado tildado.
    const variantesValidas = variantesEnEdicion.filter(v => v.nombre?.trim() && v.valor?.trim());
    const todasLasVariantesSinStock = variantesValidas.length > 0 && variantesValidas.every(v => v.disponible === false);
    const activoElegido = document.getElementById('activo').checked;
    const seOcultoAutomaticamente = todasLasVariantesSinStock && activoElegido;

    // Precio anterior (para mostrar tachado + % OFF en la tienda): es opcional,
    // pero si se carga tiene que ser mayor al precio actual, si no no hay
    // descuento que mostrar.
    const precioActual = parsearPrecio(document.getElementById('precio').value);
    const precioAnteriorTexto = document.getElementById('precio_anterior').value.trim();
    const precioAnterior = precioAnteriorTexto ? parsearPrecio(precioAnteriorTexto) : null;

    if (precioAnterior !== null && precioAnterior <= precioActual) {
        mostrarToast('El precio anterior tiene que ser mayor al precio actual para mostrarse como oferta.', 'error');
        btn.disabled = false;
        btn.textContent = 'Guardar';
        return;
    }

    const payload = {
        emprendedor_id: perfilActual.id,
        nombre: document.getElementById('nombre').value.trim(),
        precio: precioActual,
        precio_anterior: precioAnterior,
        categoria_id: parseInt(document.getElementById('categoria').value),
        imagen_url: imagenUrl,
        descripcion: document.getElementById('descripcion').value.trim(),
        activo: todasLasVariantesSinStock ? false : activoElegido,
        medios_pago: mediosPagoProductoSeleccion
    };

    // "Nuevo" se marca a mano, pero le ponemos fecha para que no quede pegado
    // para siempre: si se acaba de activar (antes no lo estaba), arrancamos
    // el conteo de 5 días desde ahora. Si ya estaba activo, no tocamos la
    // fecha (para no reiniciar los 5 días en cada edición). Si se desactiva,
    // borramos la fecha.
    const nuevoElegido = document.getElementById('nuevo').checked;
    const productoAnterior = productoEditandoId ? productosCache.find(x => x.id === productoEditandoId) : null;
    const yaEstabaMarcadoNuevo = !!(productoAnterior && productoAnterior.nuevo);

    payload.nuevo = nuevoElegido;
    if (nuevoElegido && !yaEstabaMarcadoNuevo) {
        payload.nuevo_desde = new Date().toISOString();
    } else if (!nuevoElegido) {
        payload.nuevo_desde = null;
    }
    // (si nuevoElegido && yaEstabaMarcadoNuevo: no se incluye nuevo_desde en el
    // payload, así el update no toca la fecha que ya estaba guardada)

    try {
        let productoId = productoEditandoId;

        if (productoId) {
            const { error } = await supabase.from('productos').update(payload).eq('id', productoId);
            if (error) throw error;
        } else {
            const { data, error } = await supabase.from('productos').insert(payload).select().single();
            if (error) throw error;
            productoId = data.id;
        }

        // Borramos en Supabase las variantes que se quitaron en esta edición
        if (variantesEliminadas.length > 0) {
            await supabase.from('variantes').delete().in('id', variantesEliminadas);
        }

        // Sincronizamos variantes: actualizamos las que tienen id, insertamos las nuevas
        for (const v of variantesEnEdicion) {
            if (!v.nombre?.trim() || !v.valor?.trim()) continue; // salteamos filas vacías
            const varPayload = {
                producto_id: productoId,
                nombre: v.nombre.trim(),
                valor: v.valor.trim(),
                precio_adicional: v.precio_adicional ? parsearPrecio(v.precio_adicional) : 0,
                disponible: v.disponible !== false
            };
            if (v.id) {
                await supabase.from('variantes').update(varPayload).eq('id', v.id);
            } else {
                await supabase.from('variantes').insert(varPayload);
            }
        }

        cerrarFormulario();
        await renderProductos();

        if (seOcultoAutomaticamente) {
            mostrarToast('Producto guardado, pero se ocultó de la tienda porque todas sus variantes están sin stock.', 'info', 5500);
        } else {
            mostrarToast(productoEditandoId ? 'Producto actualizado.' : 'Producto creado.', 'success');
        }

    } catch (err) {
        console.error(err);
        mostrarToast('Ocurrió un error guardando el producto.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
    }
});

async function eliminarProducto(id) {
    const confirmado = await confirmarAccion(
        'También se eliminarán sus variantes.',
        { titulo: '¿Eliminar este producto?', textoConfirmar: 'Eliminar' }
    );
    if (!confirmado) return;

    // Guardamos la imagen antes de borrar la fila, porque después de eliminada
    // ya no vamos a poder consultarla. Comparamos como string porque "id" llega
    // como string (viene del atributo onclick) y en el cache puede ser numérico.
    const producto = productosCache.find(p => String(p.id) === String(id));
    const imagenUrl = producto?.imagen_url;

    const { error } = await supabase.from('productos').delete().eq('id', id);
    if (error) { mostrarToast('No se pudo eliminar el producto.', 'error'); console.error(error); return; }

    // Borramos también la imagen del storage para no dejar archivos huérfanos
    // ocupando espacio. Es silencioso a propósito: si falla, no le suma nada
    // al usuario saberlo (el producto ya se eliminó igual). Ojo: nunca borramos
    // la foto default, porque es compartida por todos los productos sin imagen.
    if (imagenUrl && imagenUrl !== IMAGEN_PRODUCTO_DEFAULT) {
        try {
            await borrarImagenProductoSupabase(imagenUrl);
        } catch (err) {
            console.error('No se pudo borrar la imagen del producto eliminado:', err);
        }
    }

    mostrarToast('Producto eliminado.', 'success');
    await renderProductos();
}

// Activa/desactiva el producto directamente desde la card, sin pasar por
// el formulario de edición ni recargar toda la grilla. Un producto oculto
// no se ve en el catálogo público ni se puede agregar al carrito (ver
// sincronizarDisponibilidadCarrito en main.js / emprendedor.js).
async function toggleActivoProducto(id, activoActual) {
    const nuevoEstado = !activoActual;
    const { error } = await supabase.from('productos').update({ activo: nuevoEstado }).eq('id', id);
    if (error) { mostrarToast('No se pudo actualizar la visibilidad del producto.', 'error'); console.error(error); return; }

    // Actualizamos el estado en memoria y repintamos al toque, sin volver
    // a pedirle la lista completa a Supabase (eso evita el parpadeo/spinner
    // que daba sensación de que la página se recargaba).
    const item = productosCache.find(p => String(p.id) === String(id));
    if (item) item.activo = nuevoEstado;
    pintarGridProductos();
}

// Máximo de productos que se pueden marcar como "Destacados": aparecen
// primero en el perfil público, con estrella y borde especial.
const MAX_PRODUCTOS_DESTACADOS = 3;

async function toggleDestacadoProducto(id, destacadoActual) {
    const nuevoEstado = !destacadoActual;

    if (nuevoEstado) {
        const cantidadActual = productosCache.filter(p => p.destacado).length;
        if (cantidadActual >= MAX_PRODUCTOS_DESTACADOS) {
            mostrarToast(`Ya tenés ${MAX_PRODUCTOS_DESTACADOS} productos destacados. Sacá uno para agregar otro.`, 'error');
            return;
        }
    }

    const { error } = await supabase.from('productos').update({ destacado: nuevoEstado }).eq('id', id);
    if (error) { mostrarToast('No se pudo actualizar el producto.', 'error'); console.error(error); return; }

    const item = productosCache.find(p => String(p.id) === String(id));
    if (item) item.destacado = nuevoEstado;
    pintarGridProductos();

    mostrarToast(nuevoEstado ? 'Producto marcado como destacado.' : 'Producto quitado de destacados.', 'success');
}

// ============================================================
// PERFIL DEL EMPRENDEDOR
// ============================================================
async function cargarPerfilEmprendedor() {
    let { data, error } = await supabase
        .from('emprendedores')
        .select('*')
        .eq('id', perfilActual.id)
        .single();

    // Si la cuenta se creó a mano (auth + fila en "usuarios") todavía no existe
    // la fila en "emprendedores" -> la creamos vacía la primera vez que entra.
    if (error && error.code === 'PGRST116') {
        const { data: nuevo, error: errorInsert } = await supabase
            .from('emprendedores')
            .insert({ id: perfilActual.id, nombre_tienda: perfilActual.usuario })
            .select()
            .single();
        if (errorInsert) { console.error(errorInsert); return; }
        data = nuevo;
    } else if (error) {
        console.error(error);
        return;
    }

    emprendedorActual = data;
    actualizarBannerBloqueo(emprendedorActual);
    renderEstadoSuscripcion(emprendedorActual);
    evaluarAccesoYAvisar(emprendedorActual);

    document.getElementById('p-nombre').value = data.nombre_tienda || '';
    document.getElementById('p-nombre-real').value = data.nombre_real || '';
    document.getElementById('p-dni').value = data.dni || '';
    document.getElementById('p-whatsapp').value = (data.whatsapp || '').replace(/^549/, '');
    document.getElementById('p-logo').value = data.logo_url || '';
    document.getElementById('p-banner').value = data.banner_url || '';
    document.getElementById('p-bio').value = data.bio || '';
    document.getElementById('p-ubicacion').value = data.ubicacion || '';
    document.getElementById('p-mapa').value = data.mapa_url || '';
    document.getElementById('p-horario').value = data.horario_atencion || '';
    document.getElementById('p-instagram').value = extraerUsuarioRedSocial(data.instagram || '');
    document.getElementById('p-facebook').value = data.facebook || '';
    document.getElementById('p-tiktok').value = extraerUsuarioRedSocial(data.tiktok || '');
    document.getElementById('p-costo-envio').value = data.costo_envio ? formatoPrecioInput(data.costo_envio) : '';
    document.getElementById('p-anuncio').value = data.anuncio || '';

    mediosPagoPerfilSeleccion = data.medios_pago || [];
    renderMediosPagoPerfil();
    actualizarTarjetaCuentaSidebar(data.nombre_tienda, data.logo_url);
    actualizarPreviewLogo(data.logo_url);
    actualizarPreviewBanner(data.banner_url);
    actualizarContadorAnuncio();
}

// ============================================================
// CREDENCIAL DIGITAL (QR de verificación en comercios)
// ============================================================

// Arma el link único que apunta a la pantalla pública de verificación.
// Usa SITIO_PUBLICO (definido en supabase-client.js) en vez de window.location.origin,
// porque el dashboard vive en un dominio distinto (Vercel) al del sitio público
// (Cloudflare), donde realmente está verificar.html.
function obtenerLinkCredencial() {
    if (!emprendedorActual || !emprendedorActual.id) return '';
    return `${SITIO_PUBLICO}/verificar.html?id=${emprendedorActual.id}`;
}

let qrCredencialInstancia = null;

function renderCredencialQR() {
    const aviso = document.getElementById('credencial-aviso-datos');
    const card = document.getElementById('credencial-card');
    const btnDescargar = document.getElementById('btn-descargar-credencial');
    if (!emprendedorActual) return;

    const faltanDatos = !emprendedorActual.nombre_real || !emprendedorActual.dni;
    aviso.classList.toggle('hidden', !faltanDatos);
    card.classList.toggle('hidden', faltanDatos);
    btnDescargar.disabled = faltanDatos;
    btnDescargar.classList.toggle('opacity-40', faltanDatos);
    btnDescargar.classList.toggle('cursor-not-allowed', faltanDatos);
    if (faltanDatos) return;

    document.getElementById('credencial-nombre-tienda').textContent = emprendedorActual.nombre_tienda || '';

    const box = document.getElementById('credencial-qr-box');
    box.innerHTML = '';
    // El QR en sí queda siempre negro sobre blanco (igual que en qr-cards.js):
    // es lo que garantiza que escanee bien sin importar el diseño del carnet.
    qrCredencialInstancia = new QRCode(box, {
        text: obtenerLinkCredencial(),
        width: 200,
        height: 200,
        colorDark: '#0b0c10',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
    });
}

// html-to-image, por default, escanea TODAS las hojas de estilo de la página
// (incluidas las tipografías del cartel QR que la credencial ni usa) y trata
// de bajar cada fuente para incrustarla como base64 en la imagen exportada.
// En datos móviles ese fetch puede fallar o tardar y tirar un error genérico
// tipo "[object Event]". Por eso: primer intento normal (con fuentes, mejor
// calidad); si falla, reintentamos con skipFonts para garantizar que al
// menos la descarga/compartir funcione, aunque el texto caiga a la fuente
// default en vez de Plus Jakarta Sans.
async function rasterizarConReintento(nodo, opciones) {
    try {
        return await htmlToImage.toBlob(nodo, opciones);
    } catch (err) {
        console.warn('Falló la exportación con fuentes embebidas, reintentando sin ellas:', err);
        return await htmlToImage.toBlob(nodo, { ...opciones, skipFonts: true });
    }
}

// Genera el QR "horneado" como data URL fija (mismo truco que en qr-cards.js:
// generarQRDataUrl). Dibujamos con qrcodejs en un contenedor invisible,
// leemos el <img>/<canvas> resultante como data URL, y descartamos el
// contenedor: así el QR queda como una simple imagen estática en vez de
// quedar vivo (canvas + img mezclados) en el nodo que despues exportamos.
async function generarCredencialQrDataUrl() {
    const link = obtenerLinkCredencial();
    const contenedorTemporal = document.createElement('div');
    contenedorTemporal.style.position = 'fixed';
    contenedorTemporal.style.left = '-9999px';
    document.body.appendChild(contenedorTemporal);

    new QRCode(contenedorTemporal, {
        text: link,
        width: 500,
        height: 500,
        colorDark: '#0b0c10',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
    });

    const img = contenedorTemporal.querySelector('img');
    const canvas = contenedorTemporal.querySelector('canvas');
    const dataUrl = (img && img.src) || (canvas && canvas.toDataURL('image/png'));
    contenedorTemporal.remove();

    if (!dataUrl) throw new Error('No se pudo generar el código QR.');
    return dataUrl;
}

// Arma una copia de la credencial fuera de pantalla, con el QR ya como
// imagen estática (ver generarCredencialQrDataUrl) — igual que hace
// qr-cards.js con sus tarjetas: exportamos esta copia descartable en vez
// del nodo visible real, para no depender de layout/canvas en vivo.
function construirCredencialOffscreen(qrDataUrl) {
    const nombreTienda = (emprendedorActual?.nombre_tienda || '').trim();
    // Escapamos el nombre de la tienda porque va directo en un innerHTML:
    // si tuviera comillas o < > podría romper el markup de la tarjeta.
    const nombreEscapado = nombreTienda
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.innerHTML = `
        <div style="width:300px; border-radius:24px; padding:32px 24px 28px 24px; display:flex; flex-direction:column; align-items:center; text-align:center; background: radial-gradient(circle at 88% 4%, rgba(250,204,21,0.14), transparent 45%), #0b0c10; font-family:'Plus Jakarta Sans', sans-serif;">
            <span style="font-size:10px; font-weight:700; letter-spacing:0.25em; color:rgba(255,255,255,0.4); text-transform:uppercase; white-space:nowrap;">Comunidad Online</span>
            <span style="font-size:10px; font-weight:700; letter-spacing:0.2em; color:#facc15; text-transform:uppercase; margin-top:4px; white-space:nowrap;">Credencial Digital</span>
            <p style="font-size:18px; font-weight:800; line-height:1.375; color:#ffffff; margin:12px 8px 20px 8px;">${nombreEscapado}</p>
            <div style="padding:12px; border-radius:16px; background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)); border:1px solid rgba(250,204,21,0.25);">
                <div style="padding:10px; background:#ffffff; border-radius:12px;">
                    <img src="${qrDataUrl}" width="200" height="200" style="display:block; width:200px; height:200px;" />
                </div>
            </div>
            <p style="font-size:11px; color:rgba(255,255,255,0.4); margin-top:20px; line-height:1.6; max-width:220px;">
                El comercio escanea este código, no necesita ninguna app ni contraseña.
            </p>
        </div>`;
    document.body.appendChild(wrapper);
    return wrapper;
}

async function descargarCredencialQR() {
    const card = document.getElementById('credencial-card');
    if (!card || card.classList.contains('hidden')) return;

    const btn = document.getElementById('btn-descargar-credencial');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generando…';

    let wrapper = null;
    try {
        // Igual que en qr-cards.js: esperamos a que las fuentes estén 100% cargadas
        // antes de rasterizar. Si se captura con la tipografía a medio cargar,
        // html-to-image cae a una fuente de reemplazo más ancha y el texto se
        // desborda y se superpone (el bug que viste en la imagen).
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

        const qrDataUrl = await generarCredencialQrDataUrl();
        wrapper = construirCredencialOffscreen(qrDataUrl);
        const nodo = wrapper.firstElementChild;

        const blob = await rasterizarConReintento(nodo, {
            pixelRatio: 3,
            cacheBust: true,
        });
        if (!blob) throw new Error('htmlToImage.toBlob devolvió null');

        const slug = (emprendedorActual?.nombre_tienda || 'credencial').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const nombreArchivo = `credencial-${slug}.png`;
        const archivo = new File([blob], nombreArchivo, { type: 'image/png' });

        // Mismo criterio que en qr-cards.js: en mobile el <a download> no fuerza
        // la descarga (sobre todo iOS Safari), así que usamos Web Share API para
        // abrir la hoja nativa de guardar/compartir. En desktop seguimos con el
        // <a download> de siempre. esMobile() vive en qr-cards.js, que se carga
        // después de este archivo, pero para cuando el usuario hace click ya
        // están los dos scripts cargados.
        if (typeof esMobile === 'function' && esMobile() && navigator.canShare && navigator.canShare({ files: [archivo] })) {
            await navigator.share({
                files: [archivo],
                title: 'Credencial',
            });
            mostrarToast('¡Listo! Guardala desde el panel para compartir.', 'success');
        } else {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = nombreArchivo;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            mostrarToast('Credencial descargada.', 'success');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Error generando la imagen de la credencial:', err);
            mostrarToast(`No se pudo generar la imagen (${err.name || 'Error'}: ${err.message || err}).`, 'error');
        }
    } finally {
        if (wrapper) wrapper.remove();
        btn.disabled = false;
        btn.textContent = textoOriginal;
    }
}

async function copiarLinkCredencial() {
    const link = obtenerLinkCredencial();
    if (!link) return;
    await copiarAlPortapapeles(link, 'Enlace de credencial copiado.');
}

// ============================================================
// SUBIDA DE IMAGEN — LOGO Y BANNER (Cloudinary)
// ============================================================
async function manejarSeleccionLogo(event) {
    const file = event.target.files[0];
    if (!file) return;

    const errorValidacion = validarImagenSeleccionada(file);
    if (errorValidacion) {
        mostrarToast(errorValidacion, 'error');
        event.target.value = '';
        return;
    }

    mostrarSpinnerImagen('p-logo', true);
    try {
        const url = await subirImagenCloudinary(file, 800);
        document.getElementById('p-logo').value = url;
        actualizarPreviewLogo(url);
        actualizarTarjetaCuentaSidebar(document.getElementById('p-nombre').value, url);
    } catch (err) {
        console.error(err);
        mostrarToast('No se pudo subir el logo. Probá de nuevo.', 'error');
    } finally {
        mostrarSpinnerImagen('p-logo', false);
        event.target.value = '';
    }
}

async function manejarSeleccionBanner(event) {
    const file = event.target.files[0];
    if (!file) return;

    const errorValidacion = validarImagenSeleccionada(file);
    if (errorValidacion) {
        mostrarToast(errorValidacion, 'error');
        event.target.value = '';
        return;
    }

    mostrarSpinnerImagen('p-banner', true);
    try {
        const url = await subirImagenCloudinary(file, 1600);
        document.getElementById('p-banner').value = url;
        actualizarPreviewBanner(url);
    } catch (err) {
        console.error(err);
        mostrarToast('No se pudo subir el banner. Probá de nuevo.', 'error');
    } finally {
        mostrarSpinnerImagen('p-banner', false);
        event.target.value = '';
    }
}

// Muestra la preview del banner (o el placeholder si está vacío/URL inválida)
function actualizarPreviewBanner(url) {
    const img = document.getElementById('p-banner-preview');
    const placeholder = document.getElementById('p-banner-preview-placeholder');
    const valor = (url || '').trim();

    if (!valor) {
        img.classList.add('hidden');
        img.src = '';
        placeholder.classList.remove('hidden');
        return;
    }

    img.onerror = () => {
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
    };
    img.onload = () => {
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
    };
    img.src = valor;
}

// Muestra la preview de la imagen del logo (o el placeholder si está vacío/URL inválida)
function actualizarPreviewLogo(url) {
    const img = document.getElementById('p-logo-preview');
    const placeholder = document.getElementById('p-logo-preview-placeholder');
    const valor = (url || '').trim();

    if (!valor) {
        img.classList.add('hidden');
        img.src = '';
        placeholder.classList.remove('hidden');
        return;
    }

    img.onerror = () => {
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
    };
    img.onload = () => {
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
    };
    img.src = valor;
}

// Refleja el nombre de la tienda (o el usuario si todavía no lo cargó) y el logo
// en la tarjeta de cuenta del sidebar. Si no hay logo (o la URL falla), muestra
// la letra inicial como respaldo.
function actualizarTarjetaCuentaSidebar(nombreTienda, logoUrl) {
    const nombre = (nombreTienda || '').trim() || perfilActual.usuario;
    document.getElementById('nombre-tienda-sidebar').textContent = nombre;

    const letra = document.getElementById('avatar-sidebar-letra');
    const img = document.getElementById('avatar-sidebar-img');
    letra.textContent = nombre.charAt(0).toUpperCase();

    const url = (logoUrl || '').trim();
    if (!url) {
        img.classList.add('hidden');
        img.src = '';
        letra.classList.remove('hidden');
        return;
    }

    img.onload = () => {
        img.classList.remove('hidden');
        letra.classList.add('hidden');
    };
    img.onerror = () => {
        img.classList.add('hidden');
        letra.classList.remove('hidden');
    };
    img.src = url;
}

async function guardarPerfil() {
    const btn = document.getElementById('btn-guardar-perfil-2');
    const textoOriginal = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const datos = {
        nombre_tienda: document.getElementById('p-nombre').value.trim(),
        nombre_real: document.getElementById('p-nombre-real').value.trim(),
        dni: document.getElementById('p-dni').value.trim(),
        whatsapp: (() => {
            const num = document.getElementById('p-whatsapp').value.trim().replace(/\D/g, '');
            if (!num) return '';
            return num.startsWith('549') ? num : '549' + num;
        })(),
        logo_url: document.getElementById('p-logo').value.trim(),
        banner_url: document.getElementById('p-banner').value.trim(),
        bio: document.getElementById('p-bio').value.trim(),
        ubicacion: document.getElementById('p-ubicacion').value.trim(),
        mapa_url: document.getElementById('p-mapa').value.trim(),
        horario_atencion: document.getElementById('p-horario').value.trim(),
        instagram: (() => {
            const usuario = extraerUsuarioRedSocial(document.getElementById('p-instagram').value);
            return usuario ? `https://instagram.com/${usuario}` : '';
        })(),
        facebook: document.getElementById('p-facebook').value.trim(),
        tiktok: (() => {
            const usuario = extraerUsuarioRedSocial(document.getElementById('p-tiktok').value);
            return usuario ? `https://tiktok.com/@${usuario}` : '';
        })(),
        medios_pago: mediosPagoPerfilSeleccion,
        costo_envio: parsearPrecio(document.getElementById('p-costo-envio').value)
    };

    const { error } = await supabase.from('emprendedores').update(datos).eq('id', perfilActual.id);

    if (error) {
        console.error(error);
        btn.innerText = 'Error al guardar ✕';
        btn.classList.replace('bg-obsidian', 'bg-red-500');
    } else {
        if (emprendedorActual) {
            Object.assign(emprendedorActual, datos);
            emprendedorActual.medios_pago = mediosPagoPerfilSeleccion;
            emprendedorActual.costo_envio = datos.costo_envio;
        }
        actualizarTarjetaCuentaSidebar(datos.nombre_tienda, datos.logo_url);
        btn.innerText = '¡PERFIL ACTUALIZADO! ✓';
        btn.classList.replace('bg-obsidian', 'bg-green-500');
    }

    setTimeout(() => {
        btn.innerText = textoOriginal;
        btn.classList.remove('bg-green-500', 'bg-red-500');
        btn.classList.add('bg-obsidian');
        btn.disabled = false;
    }, 2000);
}

// ============================================================
// ANUNCIOS (barra temporal arriba del perfil público)
// ============================================================
function actualizarContadorAnuncio() {
    const texto = document.getElementById('p-anuncio').value;
    document.getElementById('contador-anuncio').textContent = texto.length;

    const previewTexto = texto.trim();
    document.getElementById('preview-anuncio-texto').textContent = previewTexto;
    document.getElementById('preview-anuncio-wrap').classList.toggle('hidden', !previewTexto);
    document.getElementById('preview-anuncio-wrap').classList.toggle('flex', !!previewTexto);
    document.getElementById('preview-anuncio-vacio').classList.toggle('hidden', !!previewTexto);
}

async function guardarAnuncio() {
    const btn = document.getElementById('btn-guardar-anuncio');
    const textoOriginal = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const anuncio = document.getElementById('p-anuncio').value.trim();

    const { error } = await supabase.from('emprendedores').update({ anuncio }).eq('id', perfilActual.id);

    if (error) {
        console.error(error);
        btn.innerText = 'Error al guardar ✕';
        btn.classList.replace('bg-obsidian', 'bg-red-500');
    } else {
        if (emprendedorActual) emprendedorActual.anuncio = anuncio;
        document.getElementById('p-anuncio').value = anuncio;
        actualizarContadorAnuncio();
        btn.innerText = anuncio ? '¡ANUNCIO PUBLICADO! ✓' : '¡ANUNCIO GUARDADO! ✓';
        btn.classList.replace('bg-obsidian', 'bg-green-500');
    }

    setTimeout(() => {
        btn.innerText = textoOriginal;
        btn.classList.remove('bg-green-500', 'bg-red-500');
        btn.classList.add('bg-obsidian');
        btn.disabled = false;
    }, 2000);
}

async function quitarAnuncio() {
    const actual = document.getElementById('p-anuncio').value.trim();
    if (!actual) {
        mostrarToast('No tenés ningún anuncio activo.', 'info');
        return;
    }
    const ok = await confirmarAccion('Se va a dejar de mostrar la barra de anuncio en tu perfil.', {
        titulo: '¿Quitar el anuncio?',
        textoConfirmar: 'Quitar',
        peligro: true,
    });
    if (!ok) return;

    document.getElementById('p-anuncio').value = '';
    await guardarAnuncio();
}

// ============================================================
// SUSCRIPCIÓN (MercadoPago)
// ============================================================

// Pinta la tarjeta de "Suscripción" en section-soporte según el
// estado guardado en la fila de emprendedores.
function renderEstadoSuscripcion(data) {
    const cargando = document.getElementById('susc-cargando');
    const contenido = document.getElementById('susc-contenido');
    const label = document.getElementById('susc-estado-label');
    const vencimientoEl = document.getElementById('susc-vencimiento');
    const badge = document.getElementById('susc-badge');
    const btnPagar = document.getElementById('susc-btn-pagar');

    if (!cargando) return;

    cargando.classList.add('hidden');
    contenido.classList.remove('hidden');

    const estado = data.suscripcion_estado || 'sin_suscripcion';
    const vencimiento = data.fecha_vencimiento_suscripcion
        ? new Date(data.fecha_vencimiento_suscripcion)
        : null;

    // Días que quedan de prueba gratis (0 si ya venció o no aplica)
    const diasRestantesPrueba = (estado === 'prueba_gratis' && vencimiento)
        ? Math.max(0, Math.ceil((vencimiento.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;

    const ESTADOS = {
        sin_suscripcion: { texto: 'Todavía no activaste tu suscripción', color: 'bg-slate-100 text-slate-500', badge: 'Sin activar', mostrarBoton: true },
        prueba_gratis: {
            texto: diasRestantesPrueba > 0
                ? `Estás en tu mes de prueba gratis · te ${diasRestantesPrueba === 1 ? 'queda 1 día' : `quedan ${diasRestantesPrueba} días`}`
                : 'Tu mes de prueba gratis ya terminó',
            color: 'bg-blue-100 text-blue-700', badge: 'Prueba gratis', mostrarBoton: true,
        },
        pending: { texto: 'Autorización de pago pendiente', color: 'bg-amber-100 text-amber-700', badge: 'Pendiente', mostrarBoton: true },
        authorized: { texto: 'Suscripción activa', color: 'bg-emerald-100 text-emerald-700', badge: 'Activa', mostrarBoton: false },
        pago_rechazado: { texto: 'El último cobro fue rechazado', color: 'bg-red-100 text-red-700', badge: 'Pago rechazado', mostrarBoton: true },
        vencida: { texto: 'Suscripción vencida', color: 'bg-red-100 text-red-700', badge: 'Vencida', mostrarBoton: true },
        cancelled: { texto: 'Suscripción cancelada', color: 'bg-red-100 text-red-700', badge: 'Cancelada', mostrarBoton: true },
        paused: { texto: 'Suscripción pausada', color: 'bg-amber-100 text-amber-700', badge: 'Pausada', mostrarBoton: true },
    };

    const info = ESTADOS[estado] || ESTADOS.sin_suscripcion;

    label.textContent = info.texto;
    badge.textContent = info.badge;
    badge.className = 'px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide ' + info.color;

    vencimientoEl.textContent = vencimiento
        ? (estado === 'authorized' ? 'Próximo cobro: '
            : estado === 'prueba_gratis' ? 'Prueba gratis hasta: '
            : 'Venció el: ') + vencimiento.toLocaleDateString('es-AR')
        : '';

    btnPagar.classList.toggle('hidden', !info.mostrarBoton);
}

// ------------------------------------------------------------
// Pago de la suscripción con Card Payment Brick (embebido, sin
// redirigir a mercadopago.com ni abrir la app en mobile).
// ------------------------------------------------------------
let mpInstancia = null;       // instancia del SDK de MercadoPago (se crea una sola vez)
let brickTarjetaControlador = null; // controlador del brick montado actualmente, para poder desmontarlo

// Skeleton que se ve mientras carga el Brick; se restaura acá porque en el
// flujo de error más abajo ese mismo contenedor se reemplaza por un mensaje
// de texto plano, y hay que dejarlo listo para la próxima vez que se abra.
const ESQUELETO_CARGANDO_PAGO = `
    <div class="mps-skeleton-row" style="width:100%"></div>
    <div class="mps-skeleton-row" style="width:72%"></div>
    <div class="mps-skeleton-row" style="width:88%"></div>
    <div class="mps-skeleton-row" style="width:55%"></div>
`;

async function abrirModalPagoSuscripcion() {
    const modal = document.getElementById('modal-pago-suscripcion');
    const cargando = document.getElementById('modal-pago-cargando');
    const contenedorBrick = document.getElementById('brick-tarjeta');
    const montoEl = document.getElementById('modal-pago-monto');

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    cargando.classList.remove('hidden');
    cargando.innerHTML = ESQUELETO_CARGANDO_PAGO;
    contenedorBrick.classList.add('hidden');
    contenedorBrick.innerHTML = '';
    ajustarModalPagoAlViewportVisible();

    try {
        // 1) Traemos public key + precio vigente desde el Worker
        const resConfig = await fetch(`${WORKER_SUSCRIPCIONES_URL}/config-pago`);
        const config = await resConfig.json();
        if (!resConfig.ok || !config.publicKey) {
            throw new Error(config.error || 'No se pudo cargar la configuración de pago');
        }

        montoEl.textContent = formatoPrecio(config.precio);

        // 2) Inicializamos el SDK una sola vez
        if (!mpInstancia) {
            mpInstancia = new MercadoPago(config.publicKey, { locale: 'es-AR' });
        }

        // 3) Si ya había un brick montado (el emprendedor cerró y volvió a
        //    abrir el modal), lo desmontamos antes de crear uno nuevo.
        if (brickTarjetaControlador) {
            await brickTarjetaControlador.unmount();
            brickTarjetaControlador = null;
        }

        const emailPagador = perfilActual?.email || undefined;

        brickTarjetaControlador = await mpInstancia.bricks().create('cardPayment', 'brick-tarjeta', {
            initialization: {
                amount: config.precio,
                payer: emailPagador ? { email: emailPagador } : undefined,
            },
            customization: {
                visual: {
                    style: {
                        theme: 'flat',
                        customVariables: {
                            baseColor: '#0b0c10',
                            formBackgroundColor: '#ffffff',
                            buttonTextColor: '#ffffff',
                            borderRadiusMedium: '10px',
                            // Achicamos el Brick (viene con bastante aire por defecto):
                            // menos padding interno y fuentes un toque más chicas,
                            // así entra sin scroll en pantallas más chicas y no se
                            // ve "agrandado" en mobile.
                            formPadding: '0px',
                            inputVerticalPadding: '10px',
                            inputHorizontalPadding: '12px',
                            fontSizeSmall: '12px',
                            fontSizeMedium: '14px',
                            fontSizeLarge: '15px',
                        },
                    },
                },
            },
            callbacks: {
                onReady: () => {
                    cargando.classList.add('hidden');
                    contenedorBrick.classList.remove('hidden');
                },
                onError: (error) => {
                    console.error('Error del Card Payment Brick:', error);
                },
                onSubmit: (cardFormData) => {
                    return enviarPagoSuscripcion(cardFormData);
                },
            },
        });
    } catch (err) {
        console.error(err);
        cargando.textContent = 'No pudimos cargar el formulario de pago. Cerrá esta ventana y probá de nuevo.';
        mostrarToast('No pudimos iniciar el pago. Probá de nuevo en un momento.', 'error');
    }
}

// Manda el token de la tarjeta (generado por el Brick, nunca el número
// de tarjeta en sí) al Worker, que crea el pago contra la API de MP.
async function enviarPagoSuscripcion(cardFormData) {
    try {
        const res = await fetch(`${WORKER_SUSCRIPCIONES_URL}/procesar-pago-suscripcion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                emprendedor_id: perfilActual.id,
                token: cardFormData.token,
                payment_method_id: cardFormData.payment_method_id,
                issuer_id: cardFormData.issuer_id,
                installments: cardFormData.installments,
                payer: cardFormData.payer,
            }),
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error((data.error || 'No se pudo procesar el pago') + (data.detalle ? ' — ' + JSON.stringify(data.detalle) : ''));
        }

        if (data.status === 'approved') {
            mostrarToast('¡Pago acreditado! Tu suscripción ya está activa.', 'exito');
            cerrarModalPagoSuscripcion();
            await cargarPerfilEmprendedor();
        } else if (data.status === 'in_process' || data.status === 'pending') {
            mostrarToast('Tu pago quedó en revisión. Te avisamos apenas se acredite.', 'info');
            cerrarModalPagoSuscripcion();
        } else {
            mostrarToast(mensajeRechazoPago(data.status_detail), 'error');
        }
    } catch (err) {
        console.error(err);
        mostrarToast('No pudimos procesar el pago. Probá de nuevo o con otra tarjeta.', 'error');
        // Re-lanzamos para que el Brick sepa que falló y no bloquee el botón.
        throw err;
    }
}

// Traduce los motivos de rechazo más comunes de MercadoPago a un mensaje entendible.
function mensajeRechazoPago(statusDetail) {
    const MENSAJES = {
        cc_rejected_insufficient_amount: 'Fondos insuficientes en la tarjeta.',
        cc_rejected_bad_filled_card_number: 'Revisá el número de tarjeta.',
        cc_rejected_bad_filled_date: 'Revisá la fecha de vencimiento.',
        cc_rejected_bad_filled_security_code: 'Revisá el código de seguridad.',
        cc_rejected_bad_filled_other: 'Revisá los datos de la tarjeta.',
        cc_rejected_card_disabled: 'Llamá a tu banco para activar la tarjeta.',
        cc_rejected_call_for_authorize: 'Tenés que autorizar el pago con tu banco.',
        cc_rejected_duplicated_payment: 'Ya hiciste un pago por ese monto, esperá unos minutos.',
        cc_rejected_high_risk: 'El pago fue rechazado por seguridad. Probá con otro medio de pago.',
        cc_rejected_max_attempts: 'Llegaste al límite de intentos permitidos.',
        cc_rejected_other_reason: 'Tu banco rechazó el pago. Probá con otra tarjeta.',
    };
    return MENSAJES[statusDetail] || 'El pago fue rechazado. Probá de nuevo o con otra tarjeta.';
}

function cerrarModalPagoSuscripcion() {
    const modal = document.getElementById('modal-pago-suscripcion');
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    if (brickTarjetaControlador) {
        brickTarjetaControlador.unmount();
        brickTarjetaControlador = null;
    }
}

// ============================================================
// TECLADO VIRTUAL EN MOBILE (modal de pago) — mismo criterio que
// ajustarModalAlViewportVisible() para el modal de producto: en
// Android el layout viewport no se achica cuando aparece el teclado,
// así que usamos la Visual Viewport API para conocer el alto
// realmente visible y achicar el modal a ese tamaño en tiempo real.
// Variable propia (--app-height-pago) para no pisar la del otro modal.
// ============================================================
function ajustarModalPagoAlViewportVisible() {
    const modalPago = document.getElementById('modal-pago-suscripcion');
    if (!window.visualViewport || !modalPago || modalPago.classList.contains('hidden')) return;
    const vv = window.visualViewport;
    document.documentElement.style.setProperty('--app-height-pago', vv.height + 'px');
    modalPago.style.top = vv.offsetTop + 'px';
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', ajustarModalPagoAlViewportVisible);
    window.visualViewport.addEventListener('scroll', ajustarModalPagoAlViewportVisible);
}
