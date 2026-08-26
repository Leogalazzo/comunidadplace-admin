// ============================================================
// TARJETAS QR PARA IMPRIMIR — Cartel de mostrador, Sticker e Historia IG
// Depende de: perfilActual, emprendedorActual (definidos en dashboard.js),
// miniaturaCloudinary() (definida en supabase-client.js),
// y de las libs QRCode (cdn "qrcode") y htmlToImage (cdn "html-to-image").
//
// Vive dentro de #section-qr (una sección más del dashboard, no un modal):
// dashboard.js llama a renderFormatoQR() al entrar a esa sección.
// ============================================================

const FORMATOS_QR = {
    poster: {
        label: 'Cartel de Mostrador',
        sub: 'A5 vertical · para portahojas o stand',
        ancho: 480, alto: 600,
        archivo: 'cartel-mostrador',
    },
    sticker: {
        label: 'Sticker / Tarjeta',
        sub: 'Cuadrado · vidriera, bolsas o pedidos',
        ancho: 480, alto: 480,
        archivo: 'sticker-pedido',
    },
    story: {
        label: 'Historia de Instagram',
        sub: 'Vertical · para Stories o WhatsApp',
        ancho: 405, alto: 720,
        archivo: 'historia-instagram',
    },
};

// Paleta = un solo color de acento (el resto del diseño usa siempre negro/blanco
// para que el contraste quede garantizado sin importar qué acento se elija).
const PALETAS_QR = {
    amarillo:   { label: 'Amarillo',    acento: '#facc15' },
    lima:       { label: 'Lima',        acento: '#a3e635' },
    verde:      { label: 'Verde',       acento: '#4ade80' },
    esmeralda:  { label: 'Esmeralda',   acento: '#34d399' },
    menta:      { label: 'Menta',       acento: '#5eead4' },
    turquesa:   { label: 'Turquesa',    acento: '#2dd4bf' },
    aguamarina: { label: 'Aguamarina',  acento: '#2dd4bf' },
    cyan:       { label: 'Cian',        acento: '#22d3ee' },
    celeste:    { label: 'Celeste',     acento: '#38bdf8' },
    azul:       { label: 'Azul',        acento: '#60a5fa' },
    azul_oceano:{ label: 'Azul océano', acento: '#3b82f6' },
    azul_real:  { label: 'Azul real',   acento: '#2563eb' },
    azul_noche: { label: 'Azul noche',  acento: '#1e40af' },
    indigo:     { label: 'Índigo',      acento: '#818cf8' },
    lavanda:    { label: 'Lavanda',     acento: '#c4b5fd' },
    violeta:    { label: 'Violeta',     acento: '#a78bfa' },
    morado:     { label: 'Morado',      acento: '#c084fc' },
    uva:        { label: 'Uva',          acento: '#9333ea' },
    fucsia:     { label: 'Fucsia',      acento: '#e879f9' },
    magenta:    { label: 'Magenta',     acento: '#d946ef' },
    rosa:       { label: 'Rosa',        acento: '#f472b6' },
    rosa_pastel: { label: 'Rosa pastel', acento: '#f9a8d4' },
    frambuesa:  { label: 'Frambuesa',   acento: '#e11d48' },
    coral:      { label: 'Coral',       acento: '#fb7185' },
    salmon:     { label: 'Salmón',      acento: '#fb7185' },
    rojo:       { label: 'Rojo',        acento: '#ef4444' },
    rojo_oscuro:{ label: 'Rojo oscuro', acento: '#b91c1c' },
    bordo:      { label: 'Bordó',       acento: '#9f1239' },
    naranja:    { label: 'Naranja',     acento: '#fb923c' },
    mandarina:  { label: 'Mandarina',   acento: '#f97316' },
    durazno:    { label: 'Durazno',     acento: '#fdba74' },
    terracota:  { label: 'Terracota',   acento: '#c2410c' },
    dorado:     { label: 'Dorado',      acento: '#fbbf24' },
    mostaza:    { label: 'Mostaza',     acento: '#eab308' },
    beige:      { label: 'Beige',       acento: '#d6b98c' },
    marron:     { label: 'Marrón',      acento: '#a16207' },
    chocolate:  { label: 'Chocolate',   acento: '#78350f' },
    blanco:     { label: 'Blanco y negro', acento: '#f4f4f5' },
    plata:      { label: 'Plata',       acento: '#d4d4d8' },
    gris:       { label: 'Gris',        acento: '#a1a1aa' },
    grafito:    { label: 'Grafito',     acento: '#52525b' },
    negro:      { label: 'Negro',       acento: '#18181b' },
};
// Tipografías: además de la Plus Jakarta Sans que ya usa todo el dashboard,
// sumamos 3 estilos bien distintos (cargadas en dashboard.html vía Google Fonts).
const FUENTES_QR = {
    jakarta:   { label: 'Moderna',       family: "'Plus Jakarta Sans', sans-serif" },
    poppins:   { label: 'Redondeada',    family: "'Poppins', sans-serif" },
    montserrat:{ label: 'Geométrica',    family: "'Montserrat', sans-serif" },
    inter:     { label: 'Minimalista',   family: "'Inter', sans-serif" },
    roboto:    { label: 'Clásica',       family: "'Roboto', sans-serif" },
    nunito:    { label: 'Amigable',      family: "'Nunito', sans-serif" },
    outfit:    { label: 'Contemporánea', family: "'Outfit', sans-serif" },
    raleway:   { label: 'Fina',          family: "'Raleway', sans-serif" },
    oswald:    { label: 'Estrecha',      family: "'Oswald', sans-serif" },
    bebas:     { label: 'Potente',       family: "'Bebas Neue', sans-serif" },
    anton:     { label: 'Impacto',       family: "'Anton', sans-serif" },
    archivo:   { label: 'Profesional',   family: "'Archivo', sans-serif" },
    barlow:    { label: 'Tecnológica',   family: "'Barlow', sans-serif" },
    space:     { label: 'Futurista',     family: "'Space Grotesk', sans-serif" },
    orbitron:  { label: 'Digital',       family: "'Orbitron', sans-serif" },

    playfair:  { label: 'Elegante',      family: "'Playfair Display', serif" },
    cormorant: { label: 'Sofisticada',   family: "'Cormorant Garamond', serif" },
    lora:      { label: 'Editorial',     family: "'Lora', serif" },
    merriweather:{ label: 'Tradicional', family: "'Merriweather', serif" },
    libre:     { label: 'Clásica',       family: "'Libre Baskerville', serif" },

    dancing:   { label: 'Manuscrita',   family: "'Dancing Script', cursive" },
    greatvibes:{ label: 'Caligráfica',   family: "'Great Vibes', cursive" },
    pacifico:  { label: 'Casual',        family: "'Pacifico', cursive" },
    lobster:   { label: 'Decorativa',    family: "'Lobster', cursive" },
    caveat:    { label: 'Escrita',       family: "'Caveat', cursive" },
};

let formatoQRActivo = 'poster';
let paletaQRActiva = 'amarillo';
let fuenteQRActiva = 'jakarta';
let qrDataUrlCache = null; // el QR es siempre el mismo link, lo generamos una sola vez

// Usa SITIO_PUBLICO (definido en supabase-client.js) en vez de window.location.origin,
// porque este panel puede vivir en un dominio distinto (Vercel) al del sitio
// público (Cloudflare), donde realmente está emprendedor.html.
function obtenerLinkTienda() {
    return `${SITIO_PUBLICO}/emprendedor.html?t=${encodeURIComponent(perfilActual.usuario)}`;
}

async function generarQRDataUrl() {
    if (qrDataUrlCache) return qrDataUrlCache;
    const link = obtenerLinkTienda();

    // qrcodejs dibuja el QR directo en un elemento del DOM (canvas + img),
    // no devuelve una promesa: lo hacemos en un contenedor invisible y
    // leemos el resultado apenas termina de dibujar (es sincrónico).
    const contenedorTemporal = document.createElement('div');
    contenedorTemporal.style.position = 'fixed';
    contenedorTemporal.style.left = '-9999px';
    document.body.appendChild(contenedorTemporal);

    // El QR en sí queda siempre en negro sobre blanco (sin importar la paleta
    // elegida): es lo que garantiza el contraste mínimo para que escanee bien.
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
    qrDataUrlCache = (img && img.src) || (canvas && canvas.toDataURL('image/png'));

    contenedorTemporal.remove();

    if (!qrDataUrlCache) throw new Error('No se pudo generar el código QR.');
    return qrDataUrlCache;
}

// Marco tipo "visor de cámara" alrededor del QR: 4 esquinas en L.
function construirEsquinasQR(color = '#0b0c10', tamano = 20, grosor = 4) {
    const base = `position:absolute; width:${tamano}px; height:${tamano}px; border-color:${color}; border-style:solid;`;
    return `
        <div style="${base} top:-${grosor}px; left:-${grosor}px; border-width:${grosor}px 0 0 ${grosor}px; border-top-left-radius:8px;"></div>
        <div style="${base} top:-${grosor}px; right:-${grosor}px; border-width:${grosor}px ${grosor}px 0 0; border-top-right-radius:8px;"></div>
        <div style="${base} bottom:-${grosor}px; left:-${grosor}px; border-width:0 0 ${grosor}px ${grosor}px; border-bottom-left-radius:8px;"></div>
        <div style="${base} bottom:-${grosor}px; right:-${grosor}px; border-width:0 ${grosor}px ${grosor}px 0; border-bottom-right-radius:8px;"></div>
    `;
}

// Textura de puntos sutil (efecto impresión/serigrafía) para fondos amarillos u oscuros.
function estiloPuntos(colorPunto, tamanoPunto = 1.5, espaciado = 16) {
    return `background-image: radial-gradient(${colorPunto} ${tamanoPunto}px, transparent ${tamanoPunto}px); background-size: ${espaciado}px ${espaciado}px;`;
}

// Convierte un hex (#rrggbb o #rgb) a rgba(...) para poder aplicar opacidad
// al color de acento elegido (los blobs decorativos usan el acento "diluido").
function hexARgba(hex, alpha) {
    const limpio = String(hex).replace('#', '');
    const completo = limpio.length === 3 ? limpio.split('').map(c => c + c).join('') : limpio;
    const num = parseInt(completo, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Arma el HTML interno de cada formato. logoHtml/nombre ya vienen resueltos.
// paleta y fuente son entradas de PALETAS_QR / FUENTES_QR: todo el color y la
// tipografía del diseño salen de acá, el resto de la estructura es fija.
function construirTarjetaHTML(formato, { nombre, logoHtml, qr, host, paleta, fuente }) {
    const esquinasNegras = construirEsquinasQR('#0b0c10', 20, 4);
    const acento = paleta.acento;
    const acento25 = hexARgba(acento, 0.25);
    const acento20 = hexARgba(acento, 0.20);
    const acento10 = hexARgba(acento, 0.10);
    const estiloFuente = `font-family:${fuente.family};`;

    if (formato === 'poster') {
        return `
            <div class="w-[480px] h-[600px] flex flex-col overflow-hidden relative" style="background:${acento}; ${estiloFuente} ${estiloPuntos('rgba(11,12,16,0.12)', 1.6, 15)}">
                <div class="relative px-7 pt-6 pb-11 flex items-center gap-2.5" style="background:#0b0c10; clip-path: polygon(0 0, 100% 0, 100% 72%, 0 100%);">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${acento};"></span>
                    <span class="text-white text-[15px] font-extrabold uppercase tracking-tight leading-none whitespace-nowrap">Comunidad Place</span>
                </div>

                <div class="flex-1 flex flex-col items-center px-7 -mt-7 relative z-10">
                    <div class="w-full bg-white rounded-[28px] shadow-2xl px-6 pt-7 pb-6 flex flex-col items-center gap-3.5 border border-black/5">
                        ${logoHtml}
                        <div class="text-[21px] font-extrabold text-slate-900 text-center leading-tight">${nombre}</div>
                        <div class="relative mt-1" style="padding:6px;">
                            ${esquinasNegras}
                            <img src="${qr}" crossorigin="anonymous" class="w-44 h-44 rounded-xl" />
                        </div>
                    </div>

                    <div class="mt-6 text-center">
                        <div class="text-black text-[30px] font-extrabold uppercase leading-[1.02] tracking-tight">Escaneá el<br>código</div>
                        <div class="text-black/70 text-sm font-bold mt-2 uppercase tracking-wide">Catálogo, precios y pedidos</div>
                    </div>
                </div>

                <div class="relative text-white text-center py-4 text-xs font-bold tracking-[0.2em] uppercase whitespace-nowrap overflow-hidden text-ellipsis px-4" style="background:#0b0c10; clip-path: polygon(0 30%, 100% 0, 100% 100%, 0 100%);">
                    ${host}
                </div>
            </div>`;
    }

    if (formato === 'sticker') {
        return `
            <div class="w-[480px] h-[480px] relative flex flex-col items-center justify-center gap-5 px-10 text-center overflow-hidden" style="background:#0b0c10; ${estiloFuente}">
                <div class="absolute -top-24 -left-20 w-72 h-72 rounded-full" style="background:${acento25};"></div>
                <div class="absolute -bottom-28 -right-24 w-80 h-80 rounded-full" style="background:${acento10};"></div>
                <div class="absolute inset-0" style="${estiloPuntos('rgba(255,255,255,0.04)', 1.2, 14)}"></div>

                <div class="relative rounded-[30px] p-5 shadow-2xl" style="background:${acento};">
                    <div class="relative bg-white rounded-2xl p-4" style="padding:18px;">
                        ${esquinasNegras}
                        <img src="${qr}" crossorigin="anonymous" class="w-36 h-36" />
                    </div>
                </div>

                <div class="relative text-xs font-extrabold uppercase tracking-[0.25em] mt-1 whitespace-nowrap" style="color:${acento};">Volvé a pedir</div>
                <div class="relative text-white text-2xl font-extrabold leading-tight px-2">${nombre}</div>
                <div class="relative text-slate-400 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap">Escaneá el código QR</div>
            </div>`;
    }

    // story
    return `
        <div class="w-[405px] h-[720px] flex flex-col items-center justify-center gap-6 px-10 text-center relative overflow-hidden" style="background:#0b0c10; ${estiloFuente}">
            <div class="absolute -top-24 -right-20 w-72 h-72 rounded-full" style="background:${acento20};"></div>
            <div class="absolute -bottom-28 -left-20 w-80 h-80 rounded-full" style="background:${acento10};"></div>
            <div class="absolute inset-0" style="${estiloPuntos('rgba(255,255,255,0.035)', 1.2, 15)}"></div>

            <div class="relative flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" style="background:${acento};"></span>
                <span class="text-xs font-extrabold uppercase tracking-[0.28em] whitespace-nowrap" style="color:${acento};">Comunidad Place</span>
            </div>

            <!-- Título en dos líneas fijas y cortas: cada línea es su propio bloque
                 (no depende de que el ancho/tamaño de fuente "adivine" el salto),
                 así nunca se parte en una 3ra línea que pise el QR de más abajo. -->
            <div class="relative text-white font-extrabold leading-[1.15] tracking-tight">
                <div class="text-[26px] whitespace-nowrap">¡Ya tenemos</div>
                <div class="text-[26px] whitespace-nowrap">catálogo online!</div>
            </div>

            <div class="relative rounded-[34px] p-6 shadow-2xl" style="background:${acento};">
                <div class="relative bg-white rounded-3xl" style="padding:20px;">
                    ${esquinasNegras}
                    <img src="${qr}" crossorigin="anonymous" class="w-44 h-44" />
                </div>
            </div>

            <div class="relative text-white font-extrabold text-2xl leading-tight px-2">${nombre}</div>
            <div class="relative text-slate-400 text-xs font-bold uppercase tracking-widest whitespace-nowrap">${host}</div>
        </div>`;
}

// Arma (una sola vez) los selectores de paleta y tipografía, y refresca cuál
// está marcada como activa. Se llama en cada render porque es muy barato y
// así queda simple mantener el estado sincronizado.
function renderSelectoresQR() {
    const filaPaleta = document.getElementById('qr-paleta-row');
    if (filaPaleta && !filaPaleta.dataset.armada) {
        filaPaleta.innerHTML = Object.entries(PALETAS_QR).map(([key, p]) => `
            <button type="button" id="qr-color-${key}" class="qr-color-swatch" style="background:${p.acento};"
                title="${p.label}" aria-label="Paleta ${p.label}" onclick="seleccionarPaletaQR('${key}')"></button>
        `).join('');
        filaPaleta.dataset.armada = '1';
    }

    const listaFuentes = document.getElementById('qr-fuente-lista');
    if (listaFuentes && !listaFuentes.dataset.armada) {
        listaFuentes.innerHTML = Object.entries(FUENTES_QR).map(([key, f]) => `
            <button type="button" id="qr-fuente-${key}" class="qr-fuente-opcion" onclick="seleccionarFuenteQR('${key}')">
                <span class="qr-fuente-preview" style="font-family:${f.family};">Aa</span>
                <span class="qr-fuente-nombre">${f.label}</span>
                <span class="qr-fuente-check">✓</span>
            </button>
        `).join('');
        listaFuentes.dataset.armada = '1';
    }

    Object.keys(PALETAS_QR).forEach(key => {
        const el = document.getElementById(`qr-color-${key}`);
        if (el) el.classList.toggle('qr-color-activa', key === paletaQRActiva);
    });
    Object.keys(FUENTES_QR).forEach(key => {
        const el = document.getElementById(`qr-fuente-${key}`);
        if (el) el.classList.toggle('qr-fuente-activa', key === fuenteQRActiva);
    });

    // Sincroniza los botones "Color" y "Tipografía" de la fila inferior
    // (el punto de color y la "Aa" muestran siempre la selección actual).
    const dotColor = document.getElementById('qr-trigger-color-dot');
    if (dotColor) dotColor.style.background = PALETAS_QR[paletaQRActiva].acento;

    const aaFuente = document.getElementById('qr-trigger-fuente-aa');
    if (aaFuente) aaFuente.style.fontFamily = FUENTES_QR[fuenteQRActiva].family;
}

// ============================================================
// PANELES DE "Color" y "Tipografía": dropdown que se ubica con
// position:fixed en coordenadas de PANTALLA (no del documento), calculado
// por JS cada vez que se abre. Con esto:
//  - Nunca queda cortado arriba de la pantalla: si no entra hacia arriba,
//    se abre hacia abajo automáticamente.
//  - No modifica el alto scrolleable de la página al abrir/cerrar, así
//    que seleccionar una opción no hace saltar el scroll.
// Los paneles se mueven una sola vez a <body> porque la sección donde
// viven tiene una animación con "transform", y eso rompe position:fixed
// (lo vuelve relativo a esa sección en vez de a la pantalla).
// ============================================================
function moverPanelesQRaBody() {
    ['color', 'fuente'].forEach(tipo => {
        const panel = document.getElementById(`panel-qr-${tipo}`);
        if (panel && panel.parentElement !== document.body) {
            document.body.appendChild(panel);
        }
    });
}

function toggleQRPanel(tipo) {
    const panel = document.getElementById(`panel-qr-${tipo}`);
    if (!panel) return;
    const abierto = !panel.classList.contains('hidden');
    cerrarPanelQR('color');
    cerrarPanelQR('fuente');
    if (!abierto) abrirPanelQR(tipo);
}

function abrirPanelQR(tipo) {
    const btn = document.getElementById(`qr-btn-${tipo}`);
    const panel = document.getElementById(`panel-qr-${tipo}`);
    if (!btn || !panel) return;
    moverPanelesQRaBody();
    // Se posiciona con visibility:hidden primero para poder medir su
    // tamaño real sin que se vea "saltar" de un lugar a otro.
    panel.style.visibility = 'hidden';
    panel.classList.remove('hidden');
    posicionarPanelQR(btn, panel);
    panel.style.visibility = '';
    const chevron = document.getElementById(`chevron-qr-${tipo}`);
    if (chevron) chevron.classList.add('rotate-180');
}

function cerrarPanelQR(tipo) {
    const panel = document.getElementById(`panel-qr-${tipo}`);
    if (panel) panel.classList.add('hidden');
    const chevron = document.getElementById(`chevron-qr-${tipo}`);
    if (chevron) chevron.classList.remove('rotate-180');
}

// Calcula la posición del panel en coordenadas de pantalla a partir del
// botón que lo abrió. Preferimos abrir hacia arriba (pedido explícito),
// pero si no hay suficiente espacio libre arriba del botón, lo abrimos
// hacia abajo para que nunca quede cortado por el borde de la pantalla.
function posicionarPanelQR(btn, panel) {
    const margen = 12;
    const separacion = 8;
    const rectBtn = btn.getBoundingClientRect();

    const anchoPanel = Math.min(panel.offsetWidth || 304, window.innerWidth - margen * 2);
    let left = rectBtn.left;
    if (left + anchoPanel > window.innerWidth - margen) left = window.innerWidth - margen - anchoPanel;
    if (left < margen) left = margen;

    const espacioArriba = rectBtn.top - margen;
    const espacioAbajo = window.innerHeight - rectBtn.bottom - margen;
    const altoPanel = panel.scrollHeight || panel.offsetHeight || 0;

    const abrirHaciaArriba = espacioArriba >= Math.min(altoPanel, 200) || espacioArriba >= espacioAbajo;
    const espacioDisponible = Math.max(120, abrirHaciaArriba ? espacioArriba : espacioAbajo);
    const altoFinal = Math.min(altoPanel, espacioDisponible);

    const top = abrirHaciaArriba
        ? Math.max(margen, rectBtn.top - altoFinal - separacion)
        : rectBtn.bottom + separacion;

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${espacioDisponible}px`;
}

// Cerrar al hacer clic afuera (el botón y el panel viven en <body> ahora,
// pero closest() por id sigue funcionando sin importar dónde estén).
document.addEventListener('click', (e) => {
    ['color', 'fuente'].forEach(tipo => {
        if (!e.target.closest(`#qr-btn-${tipo}`) && !e.target.closest(`#panel-qr-${tipo}`)) {
            cerrarPanelQR(tipo);
        }
    });
});

// Al hacer scroll de la PÁGINA (el fondo), la posición calculada del panel
// deja de ser válida: lo más simple y predecible es cerrarlo. Pero hay que
// ignorar el scroll que pasa DENTRO del propio panel (la lista de paleta o
// de tipografías puede necesitar scroll interno) — si no, cualquier intento
// de scrollear esa lista cerraba el panel al toque.
window.addEventListener('scroll', (e) => {
    const vieneDeAdentro = e.target && e.target.closest &&
        (e.target.closest('#panel-qr-color') || e.target.closest('#panel-qr-fuente'));
    if (vieneDeAdentro) return;
    cerrarPanelQR('color');
    cerrarPanelQR('fuente');
}, true);

window.addEventListener('resize', () => {
    cerrarPanelQR('color');
    cerrarPanelQR('fuente');
});

function seleccionarPaletaQR(key) {
    paletaQRActiva = key;
    renderFormatoQR(formatoQRActivo);
    cerrarPanelQR('color');
}

function seleccionarFuenteQR(key) {
    fuenteQRActiva = key;
    renderFormatoQR(formatoQRActivo);
    cerrarPanelQR('fuente');
}

async function renderFormatoQR(formato) {
    formatoQRActivo = formato;

    // Resaltar el tile de formato elegido
    Object.keys(FORMATOS_QR).forEach(key => {
        const tile = document.getElementById(`qr-tile-${key}`);
        if (tile) tile.classList.toggle('qr-tile-activo', key === formato);
    });

    renderSelectoresQR();

    const contenedor = document.getElementById('qr-preview-stage');
    if (!contenedor) return; // la sección QR no está montada/visible todavía

    const cfg = FORMATOS_QR[formato];
    contenedor.innerHTML = `<div class="flex items-center justify-center py-16 text-slate-400 text-xs font-bold">Generando vista previa…</div>`;

    let qr;
    try {
        qr = await generarQRDataUrl();
    } catch (err) {
        console.error('Error generando el QR:', err);
        contenedor.innerHTML = `<div class="flex items-center justify-center py-16 text-red-500 text-xs font-bold text-center px-6">No se pudo generar el QR. Recargá la página e intentá de nuevo.</div>`;
        return;
    }
    const nombre = (emprendedorActual && emprendedorActual.nombre_tienda) || perfilActual.usuario;
    const logoUrl = emprendedorActual && emprendedorActual.logo_url;
    const logoHtml = logoUrl
        ? `<img src="${miniaturaCloudinary(logoUrl, 160)}" crossorigin="anonymous" class="w-16 h-16 rounded-2xl object-cover border border-slate-200" />`
        : '';
    // Se muestra como texto en el cartel (ej. "comunidadplace.pages.dev"). Usa
    // SITIO_PUBLICO en vez de window.location.hostname porque este panel puede
    // vivir en un dominio distinto (Vercel) al del sitio público (Cloudflare).
    const host = SITIO_PUBLICO.replace(/^https?:\/\//, '');
    const paleta = PALETAS_QR[paletaQRActiva];
    const fuente = FUENTES_QR[fuenteQRActiva];

    const html = construirTarjetaHTML(formato, { nombre, logoHtml, qr, host, paleta, fuente });

    // Escala de la vista previa para que entre en el stage sin importar el tamaño real.
    // El stage tiene un alto FIJO (ver dashboard.html: h-[420px] sm:h-[480px]) para que
    // el contenedor nunca cambie de tamaño al cambiar de formato — si cambiara, todo lo
    // de abajo (color/tipografía/guardar) se correría y daba la sensación de que la
    // página "saltaba" o hacía scroll solo. Acá medimos el ancho/alto REALES ya
    // descontando el padding, así siempre calza dentro de esa misma caja fija.
    const estilos = getComputedStyle(contenedor);
    const padX = parseFloat(estilos.paddingLeft) + parseFloat(estilos.paddingRight);
    const padY = parseFloat(estilos.paddingTop) + parseFloat(estilos.paddingBottom);
    const anchoDisponible = (contenedor.clientWidth || 320) - padX;
    const altoDisponible = (contenedor.clientHeight || 420) - padY;
    const escala = Math.min(anchoDisponible / cfg.ancho, altoDisponible / cfg.alto, 0.9);

    contenedor.innerHTML = `
        <div style="width:${cfg.ancho * escala}px; height:${cfg.alto * escala}px;" class="mx-auto overflow-hidden rounded-2xl shadow-xl border border-slate-200">
            <div id="qr-tarjeta-real" style="width:${cfg.ancho}px; height:${cfg.alto}px; transform:scale(${escala}); transform-origin: top left;">
                ${html}
            </div>
        </div>`;
}

// true solo en celular/tablet real (no en desktop, aunque el navegador
// exponga navigator.share como Edge o Chrome en Windows, o aunque la PC
// tenga pantalla táctil / trackpad que el navegador reporte como "coarse").
// Nos basamos únicamente en el userAgent: es la única señal que distingue
// de forma confiable un dispositivo mobile real de una PC con touch/trackpad,
// que es justamente el caso que hacía aparecer el share sheet en desktop.
function esMobile() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function descargarTarjetaQR() {
    const btn = document.getElementById('btn-descargar-qr');
    const label = document.getElementById('qr-btn-guardar-label');
    const textoOriginal = label.textContent;
    btn.disabled = true;
    label.textContent = 'Generando…';

    try {
        // Esperamos a que las fuentes estén 100% cargadas antes de rasterizar:
        // si se captura con una tipografía a medio cargar, html-to-image cae a una
        // fuente de reemplazo más ancha y el texto puede desbordar y tapar el QR.
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

        const nodo = document.getElementById('qr-tarjeta-real');
        // Sacamos el transform de escala del preview: exportamos al tamaño real del diseño.
        const dataUrl = await htmlToImage.toPng(nodo, {
            pixelRatio: 3,
            backgroundColor: '#ffffff',
            style: { transform: 'none' },
            cacheBust: true,
        });

        const slug = (perfilActual.usuario || 'tienda').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const nombreArchivo = `${FORMATOS_QR[formatoQRActivo].archivo}-${slug}.png`;

        // En mobile (sobre todo iOS Safari) el <a download> no sirve como "forzar
        // descarga": al llegar acá ya pasamos por dos await (fonts.ready y
        // htmlToImage.toPng), así que el click() ya no cuenta como gesto directo
        // del usuario, y Safari nunca soportó bien 'download' con data URLs de
        // todos modos — en vez de guardar, abre la imagen en una pestaña nueva.
        // Por eso en mobile usamos Web Share API: dispara la hoja nativa de
        // compartir/guardar, que es el flujo que sí funciona ahí. En desktop
        // seguimos con el <a download> de toda la vida.
        const blob = await (await fetch(dataUrl)).blob();
        const archivo = new File([blob], nombreArchivo, { type: 'image/png' });

        if (esMobile() && navigator.canShare && navigator.canShare({ files: [archivo] })) {
            await navigator.share({
                files: [archivo],
                title: 'Credencial QR',
            });
            mostrarToast('¡Listo! Guardala desde el panel para compartir.', 'success');
        } else {
            const link = document.createElement('a');
            link.download = nombreArchivo;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            link.remove();
            mostrarToast('Imagen descargada. ¡Lista para imprimir o compartir!', 'success');
        }
    } catch (err) {
        // Si el usuario cancela el panel de compartir (navigator.share) no es un
        // error real, así que no mostramos el toast de "algo salió mal".
        if (err.name !== 'AbortError') {
            console.error('Error generando la tarjeta QR:', err);
            mostrarToast('No se pudo generar la imagen. Probá de nuevo.', 'error');
        }
    } finally {
        btn.disabled = false;
        label.textContent = textoOriginal;
    }
}
