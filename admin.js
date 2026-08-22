let perfilAdmin = null;
let emprendedoresCache = [];
let filtroEstadoActual = 'todos';
let busquedaActual = '';

document.addEventListener('DOMContentLoaded', async () => {
    perfilAdmin = await requerirSesion('admin');
    if (!perfilAdmin) return;

    await cargarEmprendedores();
    await actualizarBadgePostulacionesPendientes();
    iniciarRealtimeAdmin();
    iniciarBuscadorEmprendedores();
});

function iniciarBuscadorEmprendedores() {
    const input = document.getElementById('buscador-emprendedores');
    if (!input) return;
    input.addEventListener('input', debounce(() => {
        busquedaActual = input.value.trim().toLowerCase();
        document.getElementById('btn-limpiar-busqueda').classList.toggle('hidden', busquedaActual === '');
        renderEmprendedores();
    }, 200));
    setFiltroEmprendedores('todos');
}

function limpiarBusquedaEmprendedores() {
    const input = document.getElementById('buscador-emprendedores');
    input.value = '';
    busquedaActual = '';
    document.getElementById('btn-limpiar-busqueda').classList.add('hidden');
    renderEmprendedores();
    input.focus();
}

function setFiltroEmprendedores(filtro) {
    filtroEstadoActual = filtro;
    document.querySelectorAll('#filtro-estado-emprendedores .filtro-btn').forEach(btn => {
        btn.classList.toggle('filtro-activo', btn.dataset.filtro === filtro);
    });
    renderEmprendedores();
}

function iniciarRealtimeAdmin() {
    suscribirTabla('emprendedores', debounce(cargarEmprendedores, 350));
    suscribirTabla('categorias', debounce(cargarCategoriasAdmin, 350));
    suscribirTabla('productos', debounce(cargarProductosAdmin, 350));
    suscribirTabla('postulaciones', debounce(cargarPostulacionesAdmin, 350));
}

const NAV_BASE = "w-full text-left px-4 py-2.5 rounded-xl transition-all flex items-center justify-between group";
const NAV_ACTIVO = `${NAV_BASE} bg-yellow-400 text-black font-bold shadow-md shadow-yellow-400/10`;
const NAV_INACTIVO = `${NAV_BASE} text-gray-400 hover:text-white`;

function mostrarSeccion(id) {
    const secciones = ['emprendedores', 'categorias', 'productos', 'postulaciones'];
    secciones.forEach(s => {
        document.getElementById('section-' + s).classList.toggle('hidden', s !== id);
        document.getElementById('nav-' + s).className = s === id ? NAV_ACTIVO : NAV_INACTIVO;
    });
    if (id === 'categorias') cargarCategoriasAdmin();
    if (id === 'productos') cargarProductosAdmin();
    if (id === 'postulaciones') cargarPostulacionesAdmin();
}


async function cargarEmprendedores() {
    const grid = document.getElementById('grid-emprendedores');
    const { data, error } = await supabase
        .from('emprendedores')
        .select('*, usuarios(usuario, email)')
        .order('created_at', { ascending: false });

    if (error) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-2 py-24 text-red-400 font-semibold">
                <span>Error cargando emprendedores.</span>
            </div>`;
        document.getElementById('contador-emprendedores').textContent = '';
        console.error(error);
        return;
    }

    emprendedoresCache = data;
    renderEmprendedores();
}

function renderEmprendedores() {
    const grid = document.getElementById('grid-emprendedores');
    const contador = document.getElementById('contador-emprendedores');
    const total = emprendedoresCache.length;

    if (total === 0) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-3 py-24 text-center">
                <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">🏬</div>
                <p class="text-slate-500 font-bold">Todavía no hay emprendedores registrados.</p>
                <p class="text-slate-400 text-sm">Van a aparecer acá apenas alguien se registre en la comunidad.</p>
            </div>`;
        contador.textContent = '';
        return;
    }

    let data = emprendedoresCache;

    if (filtroEstadoActual === 'activo') data = data.filter(e => e.activo);
    if (filtroEstadoActual === 'bloqueado') data = data.filter(e => !e.activo);

    if (busquedaActual) {
        data = data.filter(e => {
            const tienda = (e.nombre_tienda || '').toLowerCase();
            const usuario = (e.usuarios?.usuario || '').toLowerCase();
            const whatsapp = (e.whatsapp || '').toLowerCase();
            return tienda.includes(busquedaActual) || usuario.includes(busquedaActual) || whatsapp.includes(busquedaActual);
        });
    }

    const totalActivos = emprendedoresCache.filter(e => e.activo).length;
    contador.textContent = `${total} emprendedor${total === 1 ? '' : 'es'} · ${totalActivos} activo${totalActivos === 1 ? '' : 's'}` +
        (data.length !== total ? ` · ${data.length} coincidencia${data.length === 1 ? '' : 's'}` : '');

    if (data.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">🔎</div>
                <p class="text-slate-500 font-bold">No encontramos emprendedores con esos filtros.</p>
                <p class="text-slate-400 text-sm">Probá con otro término de búsqueda o cambiá el filtro.</p>
            </div>`;
        return;
    }

    grid.innerHTML = data.map(e => {
        const inicial = e.nombre_tienda ? e.nombre_tienda.charAt(0).toUpperCase() : '?';
        const avatar = e.logo_url
            ? `<img src="${miniaturaCloudinary(e.logo_url, 400)}" alt="${escapeHtml(e.nombre_tienda)}" class="w-full h-full object-cover" loading="lazy" decoding="async">`
            : `<div class="w-full h-full flex items-center justify-center bg-gradient-to-tr from-yellow-400 to-amber-300 text-black font-black text-2xl sm:text-4xl">${escapeHtml(inicial)}</div>`;
        return `
        <div class="group bg-white rounded-xl sm:rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:shadow-slate-900/5 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden flex flex-col cursor-pointer"
            onclick="abrirModalDetalleEmprendedor('${e.id}')">
            <div class="relative aspect-square bg-slate-100 overflow-hidden">
                ${avatar}
                <span class="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 text-[8px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full ${e.activo ? 'bg-emerald-500/95 text-white' : 'bg-red-500/95 text-white'}">
                    ${e.activo ? 'Activo' : 'Bloqueado'}
                </span>
            </div>
            <div class="p-2 sm:p-4 flex flex-col gap-0.5 sm:gap-1.5 flex-1">
                <span class="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">@${e.usuarios ? escapeHtml(e.usuarios.usuario) : '-'}</span>
                <h3 class="font-bold sm:font-extrabold text-slate-900 text-xs sm:text-base leading-snug line-clamp-1">${escapeHtml(e.nombre_tienda)}</h3>
                <p class="text-[10px] sm:text-xs text-slate-500 font-medium truncate">${e.whatsapp ? escapeHtml(e.whatsapp) : 'Sin WhatsApp cargado'}</p>
                <div class="mt-auto pt-1.5 sm:pt-2">
                    <button onclick="event.stopPropagation(); toggleEmprendedor('${e.id}', ${e.activo})"
                        class="w-full h-7 sm:h-auto py-0 sm:py-2.5 rounded-lg sm:rounded-xl font-black text-[8px] sm:text-[10px] uppercase tracking-widest transition-colors ${e.activo ? 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white'}">
                        ${e.activo ? 'Bloquear' : 'Activar'}
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function abrirModalDetalleEmprendedor(id) {
    const e = emprendedoresCache.find(x => String(x.id) === String(id));
    if (!e) return;

    const formatoFecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    // Banner (solo se muestra si el emprendedor cargó uno; si no, queda el
    // patrón de puntos de fondo definido en el HTML).
    const bannerWrap = document.getElementById('detalle-banner-wrap');
    const bannerImg = document.getElementById('detalle-banner');
    if (e.banner_url) {
        bannerImg.src = miniaturaCloudinary(e.banner_url, 800);
        bannerWrap.classList.remove('hidden');
    } else {
        bannerImg.src = '';
        bannerWrap.classList.add('hidden');
    }

    // Avatar / foto de perfil
    const avatarImg = document.getElementById('detalle-avatar');
    const avatarInicial = document.getElementById('detalle-avatar-inicial');
    if (e.logo_url) {
        avatarImg.src = miniaturaCloudinary(e.logo_url, 300);
        avatarImg.classList.remove('hidden');
        avatarInicial.classList.add('hidden');
    } else {
        avatarImg.classList.add('hidden');
        avatarImg.src = '';
        avatarInicial.classList.remove('hidden');
        avatarInicial.textContent = e.nombre_tienda ? e.nombre_tienda.charAt(0).toUpperCase() : '?';
    }

    document.getElementById('detalle-nombre-tienda').textContent = e.nombre_tienda || 'Sin nombre';
    document.getElementById('detalle-usuario').textContent = `@${e.usuarios ? e.usuarios.usuario : '-'}`;

    // Badge activo/bloqueado
    const badgeActivo = document.getElementById('detalle-badge-activo');
    badgeActivo.textContent = e.activo ? 'Activo' : 'Bloqueado';
    badgeActivo.className = `text-[10px] font-black uppercase px-2.5 py-1 rounded-full whitespace-nowrap ${e.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`;

    // Badge términos y condiciones
    const badgeTerminos = document.getElementById('detalle-badge-terminos');
    if (e.terminos_aceptados === true) {
        badgeTerminos.textContent = `Aceptó términos · ${formatoFecha(e.terminos_respondido_en)}`;
        badgeTerminos.className = 'text-[10px] font-black uppercase px-2.5 py-1 rounded-full whitespace-nowrap bg-emerald-100 text-emerald-700';
    } else if (e.terminos_aceptados === false) {
        badgeTerminos.textContent = `Rechazó términos · ${formatoFecha(e.terminos_respondido_en)}`;
        badgeTerminos.className = 'text-[10px] font-black uppercase px-2.5 py-1 rounded-full whitespace-nowrap bg-red-100 text-red-700';
    } else {
        badgeTerminos.textContent = 'Términos pendientes de respuesta';
        badgeTerminos.className = 'text-[10px] font-black uppercase px-2.5 py-1 rounded-full whitespace-nowrap bg-gray-100 text-gray-500';
    }

    // Motivo de bloqueo
    const motivoWrap = document.getElementById('detalle-bloqueo-motivo');
    if (!e.activo && e.motivo_bloqueo) {
        motivoWrap.textContent = `Motivo del bloqueo: ${e.motivo_bloqueo}`;
        motivoWrap.classList.remove('hidden');
    } else {
        motivoWrap.classList.add('hidden');
    }

    document.getElementById('detalle-bio').textContent = e.bio || 'Sin descripción cargada.';
    document.getElementById('detalle-email').textContent = (e.usuarios && e.usuarios.email) || '-';
    document.getElementById('detalle-whatsapp').textContent = e.whatsapp || '-';
    document.getElementById('detalle-ubicacion').textContent = e.ubicacion || '-';
    document.getElementById('detalle-horario').textContent = e.horario_atencion || '-';
    document.getElementById('detalle-costo-envio').textContent =
        (e.costo_envio !== null && e.costo_envio !== undefined && e.costo_envio !== '') ? formatoPrecio(e.costo_envio) : '-';

    const mapaEl = document.getElementById('detalle-mapa');
    mapaEl.innerHTML = e.mapa_url
        ? `<a href="${escapeHtml(e.mapa_url)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline break-all">Ver ubicación</a>`
        : '-';

    // Redes sociales
    const redesCont = document.getElementById('detalle-redes');
    const redes = [
        { url: e.instagram, label: 'Instagram' },
        { url: e.facebook, label: 'Facebook' },
        { url: e.tiktok, label: 'TikTok' },
    ].filter(r => r.url);
    redesCont.innerHTML = redes.length
        ? redes.map(r => `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="inline-flex items-center px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 transition-colors">${r.label}</a>`).join('')
        : `<span class="text-sm text-gray-400">Sin redes cargadas</span>`;

    // Medios de pago
    const mediosCont = document.getElementById('detalle-medios-pago');
    const medios = e.medios_pago || [];
    mediosCont.innerHTML = medios.length
        ? medios.map(m => `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">${escapeHtml(nombreMedioPago(m))}</span>`).join('')
        : `<span class="text-sm text-gray-400">Sin medios de pago cargados</span>`;

    // Suscripción
    const ESTADOS_SUSC_ADMIN = {
        sin_suscripcion: { texto: 'Sin activar', color: 'bg-gray-100 text-gray-500' },
        pending: { texto: 'Autorización pendiente', color: 'bg-amber-100 text-amber-700' },
        authorized: { texto: 'Activa', color: 'bg-emerald-100 text-emerald-700' },
        pago_rechazado: { texto: 'Pago rechazado', color: 'bg-red-100 text-red-700' },
        vencida: { texto: 'Vencida', color: 'bg-red-100 text-red-700' },
        cancelled: { texto: 'Cancelada', color: 'bg-red-100 text-red-700' },
        paused: { texto: 'Pausada', color: 'bg-amber-100 text-amber-700' },
    };
    const estadoSuscInfo = ESTADOS_SUSC_ADMIN[e.suscripcion_estado] || ESTADOS_SUSC_ADMIN.sin_suscripcion;

    document.getElementById('detalle-susc-estado').textContent =
        e.ultimo_pago_en ? `Último pago: ${formatoFecha(e.ultimo_pago_en)}` : 'Todavía sin pagos registrados';

    document.getElementById('detalle-susc-fechas').textContent = e.fecha_vencimiento_suscripcion
        ? `Vencimiento: ${formatoFecha(e.fecha_vencimiento_suscripcion)}`
        : '';

    const badgeSusc = document.getElementById('detalle-susc-badge');
    badgeSusc.textContent = estadoSuscInfo.texto;
    badgeSusc.className = 'px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide ' + estadoSuscInfo.color;

    // Anuncio en tienda
    const anuncioWrap = document.getElementById('detalle-anuncio-wrap');
    if (e.anuncio) {
        document.getElementById('detalle-anuncio').textContent = e.anuncio;
        anuncioWrap.classList.remove('hidden');
    } else {
        anuncioWrap.classList.add('hidden');
    }

    document.getElementById('detalle-creado').textContent = e.created_at ? `Cuenta creada el ${formatoFecha(e.created_at)}` : '';

    // Botón bloquear/activar
    const btnToggle = document.getElementById('detalle-btn-toggle');
    btnToggle.textContent = e.activo ? 'Bloquear tienda' : 'Activar tienda';
    btnToggle.className = `w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm transition-all active:scale-95 ${e.activo ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-black text-white hover:bg-yellow-400 hover:text-black'}`;
    btnToggle.onclick = () => {
        cerrarModalDetalleEmprendedor();
        toggleEmprendedor(e.id, e.activo);
    };

    document.getElementById('modal-detalle-overlay').classList.add('abierto');
    document.getElementById('modal-detalle').classList.add('abierto');
    document.body.classList.add('overflow-hidden');
}

function cerrarModalDetalleEmprendedor() {
    document.getElementById('modal-detalle-overlay').classList.remove('abierto');
    document.getElementById('modal-detalle').classList.remove('abierto');
    document.body.classList.remove('overflow-hidden');
}

async function toggleEmprendedor(id, activoActual) {
    // Bloquear (estaba activo) -> pedimos motivo antes de confirmar, así el
    // emprendedor lo ve reflejado en su panel de gestión (dashboard.html).
    if (activoActual) {
        abrirModalBloqueo(id);
        return;
    }

    // Activar (estaba bloqueado) -> directo, sin pedir motivo, y limpiamos
    // el motivo/fecha del bloqueo anterior.
    const { error } = await supabase.from('emprendedores')
        .update({ activo: true, motivo_bloqueo: null, bloqueado_en: null })
        .eq('id', id);
    if (error) { mostrarToast('No se pudo actualizar el estado.', 'error'); console.error(error); return; }
    mostrarToast('Emprendedor activado.', 'success');
    await cargarEmprendedores();
}

function abrirModalBloqueo(id) {
    document.getElementById('bloqueo-emprendedor-id').value = id;
    document.getElementById('bloqueo-motivo-select').value = 'Falta de pago de la suscripción';
    document.getElementById('bloqueo-detalle').value = '';
    document.getElementById('modal-bloqueo').classList.remove('hidden');
}

function cerrarModalBloqueo() {
    document.getElementById('modal-bloqueo').classList.add('hidden');
}

document.getElementById('form-bloqueo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('bloqueo-emprendedor-id').value;
    const select = document.getElementById('bloqueo-motivo-select');
    const detalle = document.getElementById('bloqueo-detalle').value.trim();

    let motivo = select.value === 'otro' ? '' : select.options[select.selectedIndex].text;
    if (detalle) motivo = motivo ? `${motivo}. ${detalle}` : detalle;
    if (!motivo) motivo = 'Tu tienda fue bloqueada por el equipo de la comunidad.';

    const btn = document.getElementById('btn-confirmar-bloqueo');
    btn.disabled = true;

    const { error } = await supabase.from('emprendedores')
        .update({ activo: false, motivo_bloqueo: motivo, bloqueado_en: new Date().toISOString() })
        .eq('id', id);

    btn.disabled = false;

    if (error) { mostrarToast('No se pudo bloquear al emprendedor.', 'error'); console.error(error); return; }

    mostrarToast('Emprendedor bloqueado.', 'success');
    cerrarModalBloqueo();
    await cargarEmprendedores();
});

async function cargarCategoriasAdmin() {
    const tabla = document.getElementById('tabla-categorias');
    const { data, error } = await supabase.from('categorias').select('*').order('nombre');
    if (error) {
        tabla.innerHTML = `<div class="col-span-full p-8 text-center text-red-400 font-semibold">Error cargando categorías.</div>`;
        return;
    }

    if (data.length === 0) {
        tabla.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 font-semibold">No hay categorías todavía.</div>`;
        return;
    }

    tabla.innerHTML = data.map(c => `
        <div class="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm p-2.5 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 hover:shadow-md transition-shadow">
            <div class="min-w-0">
                <p class="font-bold sm:font-extrabold text-slate-900 text-sm sm:text-base truncate">${escapeHtml(c.nombre)}</p>
                <p class="text-[10px] sm:text-xs text-slate-400 truncate">${escapeHtml(c.slug)}</p>
            </div>
            <div class="flex items-center gap-2 sm:gap-3 shrink-0">
                <button onclick="editarCategoria(${c.id})" class="text-slate-400 hover:text-slate-700 font-black text-[8px] sm:text-[10px] uppercase tracking-widest transition-colors">Editar</button>
                <button onclick="eliminarCategoria(${c.id})" class="text-red-400 hover:text-red-600 font-black text-[8px] sm:text-[10px] uppercase tracking-widest transition-colors">Eliminar</button>
            </div>
        </div>
    `).join('');
}

function abrirModalCategoria(categoria = null) {
    const form = document.getElementById('form-categoria');
    form.reset();

    document.getElementById('cat-id').value = categoria ? categoria.id : '';
    document.getElementById('modal-categoria-titulo').textContent = categoria ? 'Editar categoría' : 'Nueva categoría';
    document.getElementById('modal-categoria-subtitulo').textContent = categoria
        ? 'Modificá el nombre de la categoría'
        : 'Ingresá el nombre que aparecerá en la tienda';
    document.getElementById('btn-guardar-categoria').textContent = categoria ? 'Guardar cambios' : 'Guardar';

    if (categoria) document.getElementById('cat-nombre').value = categoria.nombre;

    document.getElementById('modal-categoria').classList.remove('hidden');
    document.getElementById('cat-nombre').focus();
}
function cerrarModalCategoria() {
    document.getElementById('modal-categoria').classList.add('hidden');
}

async function editarCategoria(id) {
    const { data, error } = await supabase.from('categorias').select('*').eq('id', id).single();
    if (error || !data) { mostrarToast('No se pudo cargar la categoría.', 'error'); return; }
    abrirModalCategoria(data);
}

document.getElementById('form-categoria').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cat-id').value;
    const nombre = document.getElementById('cat-nombre').value.trim();
    const slug = nombre.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca tildes
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const btnGuardar = document.getElementById('btn-guardar-categoria');
    btnGuardar.disabled = true;

    const { error } = id
        ? await supabase.from('categorias').update({ nombre, slug }).eq('id', id)
        : await supabase.from('categorias').insert({ nombre, slug });

    btnGuardar.disabled = false;

    if (error) {
        mostrarToast(error.message.includes('duplicate') ? 'Esa categoría ya existe.' : 'No se pudo guardar la categoría.', 'error');
        return;
    }

    mostrarToast(id ? 'Categoría actualizada.' : 'Categoría creada.', 'success');
    cerrarModalCategoria();
    await cargarCategoriasAdmin();
});

async function eliminarCategoria(id) {
    const confirmado = await confirmarAccion(
        'Los productos que la usan quedarán sin categoría.',
        { titulo: '¿Eliminar esta categoría?', textoConfirmar: 'Eliminar' }
    );
    if (!confirmado) return;

    const { error } = await supabase.from('categorias').delete().eq('id', id);
    if (error) { mostrarToast('No se pudo eliminar la categoría.', 'error'); return; }
    mostrarToast('Categoría eliminada.', 'success');
    await cargarCategoriasAdmin();
}

async function cargarProductosAdmin() {
    const tabla = document.getElementById('tabla-productos-admin');
    const { data, error } = await supabase
        .from('productos')
        .select('*, emprendedores(nombre_tienda)')
        .order('created_at', { ascending: false });

    if (error) { tabla.innerHTML = `<div class="p-8 text-center text-red-400 font-semibold">Error cargando productos.</div>`; return; }

    if (data.length === 0) {
        tabla.innerHTML = `<div class="p-8 text-center text-slate-400 font-semibold">No hay productos cargados todavía.</div>`;
        return;
    }

    tabla.innerHTML = data.map(p => `
        <div class="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm p-2.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:shadow-md transition-shadow">
            <div class="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <img src="${miniaturaCloudinary(p.imagen_url, 60)}" class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl object-cover border border-slate-100 bg-slate-100 flex-shrink-0" loading="lazy" decoding="async">
                <div class="min-w-0">
                    <p class="font-bold sm:font-extrabold text-slate-900 text-sm sm:text-base truncate">${escapeHtml(p.nombre)}</p>
                    <p class="text-[10px] sm:text-xs text-slate-400 truncate">${p.emprendedores ? escapeHtml(p.emprendedores.nombre_tienda) : '-'}</p>
                </div>
            </div>
            <div class="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 flex-shrink-0 pl-[50px] sm:pl-0">
                <span class="font-black text-slate-900 text-sm sm:text-base whitespace-nowrap">${formatoPrecio(p.precio)}</span>
                <span class="text-[8px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full whitespace-nowrap ${p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}">
                    ${p.activo ? 'Visible' : 'Oculto'}
                </span>
                <button onclick="eliminarProductoAdmin('${p.id}')" class="text-red-400 hover:text-red-600 font-black text-[8px] sm:text-[10px] uppercase tracking-widest transition-colors whitespace-nowrap">Eliminar</button>
            </div>
        </div>
    `).join('');
}

async function eliminarProductoAdmin(id) {
    const confirmado = await confirmarAccion(
        'Esta acción no se puede deshacer.',
        { titulo: '¿Eliminar este producto de la plataforma?', textoConfirmar: 'Eliminar' }
    );
    if (!confirmado) return;

    const { error } = await supabase.from('productos').delete().eq('id', id);
    if (error) { mostrarToast('No se pudo eliminar el producto.', 'error'); return; }
    mostrarToast('Producto eliminado.', 'success');
    await cargarProductosAdmin();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
// ============================================================
// POSTULACIONES: pedidos del botón "Quiero vender" del sitio
// público (emprendedores y comercios, venta o membresía).
// ============================================================
let postulacionesCache = [];
let filtroTipoPostulacionesActual = 'todos';
let filtroEstadoPostulacionesActual = 'pendiente';

const POSTULACION_TIPO_LABEL = {
    emprendedor: 'Emprendedor',
    comercio_vender: 'Comercio · Vender',
    comercio_membresia: 'Comercio · Membresía',
};
const POSTULACION_TIPO_COLOR = {
    emprendedor: 'bg-yellow-100 text-yellow-800',
    comercio_vender: 'bg-blue-100 text-blue-700',
    comercio_membresia: 'bg-purple-100 text-purple-700',
};
const POSTULACION_ESTADO_LABEL = {
    pendiente: 'Pendiente',
    contactado: 'Contactado',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
};
const POSTULACION_ESTADO_COLOR = {
    pendiente: 'bg-amber-100 text-amber-800',
    contactado: 'bg-blue-100 text-blue-700',
    aprobada: 'bg-emerald-100 text-emerald-700',
    rechazada: 'bg-rose-100 text-rose-700',
};

async function actualizarBadgePostulacionesPendientes() {
    const { count, error } = await supabase
        .from('postulaciones')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente');

    const badge = document.getElementById('badge-postulaciones-pendientes');
    if (error || !count) { badge.classList.add('hidden'); return; }
    badge.textContent = count;
    badge.classList.remove('hidden');
}

async function cargarPostulacionesAdmin() {
    const cont = document.getElementById('lista-postulaciones');
    const { data, error } = await supabase
        .from('postulaciones')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        cont.innerHTML = `<div class="p-8 text-center text-red-400 font-semibold">Error cargando postulaciones.</div>`;
        console.error(error);
        return;
    }

    postulacionesCache = data;
    renderPostulaciones();
    actualizarBadgePostulacionesPendientes();
}

function setFiltroTipoPostulaciones(filtro) {
    filtroTipoPostulacionesActual = filtro;
    document.querySelectorAll('#filtro-tipo-postulaciones .filtro-btn').forEach(btn => {
        btn.classList.toggle('filtro-activo', btn.dataset.filtro === filtro);
    });
    renderPostulaciones();
}

function setFiltroEstadoPostulaciones(filtro) {
    filtroEstadoPostulacionesActual = filtro;
    document.querySelectorAll('#filtro-estado-postulaciones .filtro-btn').forEach(btn => {
        btn.classList.toggle('filtro-activo', btn.dataset.filtro === filtro);
    });
    renderPostulaciones();
}

function renderPostulaciones() {
    const cont = document.getElementById('lista-postulaciones');
    const contador = document.getElementById('contador-postulaciones');

    let lista = postulacionesCache;
    if (filtroTipoPostulacionesActual === 'emprendedor') {
        lista = lista.filter(p => p.tipo === 'emprendedor');
    } else if (filtroTipoPostulacionesActual === 'comercio') {
        lista = lista.filter(p => p.tipo === 'comercio_vender' || p.tipo === 'comercio_membresia');
    }
    if (filtroEstadoPostulacionesActual !== 'todos') {
        lista = lista.filter(p => p.estado === filtroEstadoPostulacionesActual);
    }

    contador.textContent = `${lista.length} postulación${lista.length === 1 ? '' : 'es'}`;

    if (lista.length === 0) {
        cont.innerHTML = `<div class="p-8 text-center text-slate-400 font-semibold">No hay postulaciones con estos filtros.</div>`;
        return;
    }

    cont.innerHTML = lista.map(p => `
        <button onclick="abrirModalPostulacionDetalle(${p.id})" class="w-full text-left bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm p-3.5 sm:p-4 flex items-center gap-3 hover:shadow-md hover:border-slate-300 transition-all">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                    <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${POSTULACION_TIPO_COLOR[p.tipo] || 'bg-slate-100 text-slate-600'}">${POSTULACION_TIPO_LABEL[p.tipo] || p.tipo}</span>
                    <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${POSTULACION_ESTADO_COLOR[p.estado] || 'bg-slate-100 text-slate-600'}">${POSTULACION_ESTADO_LABEL[p.estado] || p.estado}</span>
                </div>
                <p class="font-bold text-slate-900 text-sm truncate">${escapeHtml(p.nombre)}${p.nombre_negocio ? ' · ' + escapeHtml(p.nombre_negocio) : ''}</p>
                <p class="text-xs text-slate-400 truncate">${escapeHtml(p.whatsapp)} · ${escapeHtml(p.email)}</p>
            </div>
            <span class="text-slate-300 flex-shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </span>
        </button>
    `).join('');
}

function abrirModalPostulacionDetalle(id) {
    const p = postulacionesCache.find(x => x.id === id);
    if (!p) return;

    document.getElementById('pd-id').value = p.id;
    document.getElementById('pd-badge-tipo').textContent = POSTULACION_TIPO_LABEL[p.tipo] || p.tipo;
    document.getElementById('pd-badge-tipo').className = `text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${POSTULACION_TIPO_COLOR[p.tipo] || 'bg-slate-100 text-slate-600'}`;
    document.getElementById('pd-nombre').textContent = p.nombre;
    document.getElementById('pd-negocio').textContent = p.nombre_negocio || '—';
    document.getElementById('pd-whatsapp').textContent = p.whatsapp;
    document.getElementById('pd-email').textContent = p.email;
    document.getElementById('pd-ciudad').textContent = p.ciudad || '—';
    document.getElementById('pd-categoria').textContent = p.categoria || '—';

    const wrapIg = document.getElementById('pd-instagram-wrap');
    if (p.instagram) {
        wrapIg.classList.remove('hidden');
        document.getElementById('pd-instagram').textContent = p.instagram;
    } else {
        wrapIg.classList.add('hidden');
    }

    document.getElementById('pd-mensaje').textContent = p.mensaje || 'Sin mensaje adicional.';
    document.getElementById('pd-creado').textContent = 'Recibida el ' + new Date(p.created_at).toLocaleString('es-AR');

    document.getElementById('modal-postulacion-detalle').classList.remove('hidden');
}

function cerrarModalPostulacionDetalle() {
    document.getElementById('modal-postulacion-detalle').classList.add('hidden');
}

async function actualizarEstadoPostulacion(estado) {
    const id = document.getElementById('pd-id').value;
    if (!id) return;

    const { error } = await supabase.from('postulaciones').update({ estado }).eq('id', id);
    if (error) { mostrarToast('No se pudo actualizar el estado.', 'error'); return; }

    mostrarToast('Postulación marcada como ' + (POSTULACION_ESTADO_LABEL[estado] || estado).toLowerCase() + '.', 'success');
    cerrarModalPostulacionDetalle();
    await cargarPostulacionesAdmin();
}

async function eliminarPostulacion() {
    const id = document.getElementById('pd-id').value;
    if (!id) return;

    const confirmado = await confirmarAccion(
        'Esta acción no se puede deshacer.',
        { titulo: '¿Eliminar esta postulación?', textoConfirmar: 'Eliminar' }
    );
    if (!confirmado) return;

    const { error } = await supabase.from('postulaciones').delete().eq('id', id);
    if (error) { mostrarToast('No se pudo eliminar la postulación.', 'error'); return; }

    mostrarToast('Postulación eliminada.', 'success');
    cerrarModalPostulacionDetalle();
    await cargarPostulacionesAdmin();
}
