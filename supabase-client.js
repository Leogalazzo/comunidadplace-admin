var SUPABASE_URL = "https://zlqzsxyhyfrmmhzwfikj.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_eMPALOR2u8FrIrKM2NMRVA_zXKYaV9o";

var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var SITIO_PUBLICO = "https://comunidademprendedora.com.ar";

const IMAGEN_PRODUCTO_DEFAULT = "https://res.cloudinary.com/dl2tftoum/image/upload/v1786256135/d5q4mgovgeaev2xkt3rq.webp";

// ------------------------------------------------------------
// VISITOR ID (para favoritos sin necesidad de cuenta)
// ------------------------------------------------------------
function obtenerVisitorId() {
    let vid = localStorage.getItem('cp_visitor_id');
    if (!vid) {
        vid = crypto.randomUUID();
        localStorage.setItem('cp_visitor_id', vid);
    }
    return vid;
}

async function obtenerSesion() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// Devuelve la fila de `usuarios` (con rol) del usuario logueado, o null
async function obtenerPerfilUsuario() {
    const session = await obtenerSesion();
    if (!session) return null;
    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', session.user.id)
        .single();
    if (error) {
        console.error('Error obteniendo perfil de usuario:', error);
        return null;
    }
    return data;
}

// Protege una página: si no hay sesión (o no tiene el rol pedido) redirige a login.html
async function requerirSesion(rolRequerido) {
    const perfil = await obtenerPerfilUsuario();
    if (!perfil) {
        window.location.href = 'login.html';
        return null;
    }
    if (rolRequerido && perfil.rol !== rolRequerido) {
        mostrarToast('No tenés permiso para acceder a esta sección.', 'error');
        setTimeout(() => { window.location.href = 'index.html'; }, 1600);
        return null;
    }
    return perfil;
}

async function cerrarSesion() {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
}

// Confirmación antes de cerrar sesión desde el botón del menú (usa el mismo
// modal de confirmación que el resto del sitio). El cierre automático que
// ocurre al rechazar los Términos y Condiciones sigue llamando a
// cerrarSesion() directamente, sin pedir confirmación.
async function confirmarCerrarSesion() {
    const ok = await confirmarAccion(
        'Vas a tener que volver a iniciar sesión para acceder a tu panel.',
        { titulo: '¿Cerrar sesión?', textoConfirmar: 'Cerrar sesión' }
    );
    if (!ok) return;
    await cerrarSesion();
}

// Formatea precio en pesos
function formatoPrecio(n) {
    return '$' + Number(n).toLocaleString('es-AR');
}

// ------------------------------------------------------------
// PRECIOS: entrada flexible (el emprendedor puede escribir "1000"
// o "1.000", ambos se interpretan igual). Formato argentino:
// el punto separa miles, la coma separa decimales.
// ------------------------------------------------------------

// Convierte lo que el usuario escribió en un número real.
// Acepta: "1000", "1.000", "1000,50", "1.000,50", "10.5" (decimal suelto)
function parsearPrecio(valor) {
    if (valor === null || valor === undefined) return 0;
    let str = String(valor).trim();
    if (str === '') return 0;

    if (str.includes(',')) {
        // Hay coma: es el formato AR completo -> los puntos son miles, la coma es el decimal
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes('.')) {
        const partes = str.split('.');
        const ultimaParte = partes[partes.length - 1];
        // Más de un punto ("1.000.000") o el último grupo tiene 3 dígitos ("1.000")
        // -> son separadores de miles, no un decimal.
        if (partes.length > 2 || ultimaParte.length === 3) {
            str = str.replace(/\./g, '');
        }
        // Si no (ej "10.5"), se deja tal cual: es un decimal suelto.
    }

    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

// Formatea un número para mostrarlo dentro de un input de precio (sin $).
function formatoPrecioInput(n) {
    if (n === null || n === undefined || n === '') return '';
    const num = Number(n);
    if (isNaN(num)) return '';
    return num.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

// Deja sólo dígitos, puntos y una coma mientras el usuario escribe
// (bloquea letras y comas de más, sin reformatear todavía).
function sanitizarInputPrecio(el) {
    let valor = el.value.replace(/[^0-9.,]/g, '');
    const primeraComa = valor.indexOf(',');
    if (primeraComa !== -1) {
        valor = valor.slice(0, primeraComa + 1) + valor.slice(primeraComa + 1).replace(/,/g, '');
    }
    el.value = valor;
}

// Al salir del campo, lo reformatea prolijo (ej: "1000" -> "1.000").
function formatearInputPrecio(el) {
    if (el.value.trim() === '') return;
    el.value = formatoPrecioInput(parsearPrecio(el.value));
}

// ------------------------------------------------------------
// PRECIO PROMOCIONAL: dado un precio_anterior (tachado) y el precio
// actual, calcula el % de descuento a mostrar. Devuelve 0 si no
// corresponde mostrar oferta (sin precio_anterior, o no es mayor
// que el precio actual).
// ------------------------------------------------------------
function calcularDescuentoPorcentaje(precioAnterior, precioActual) {
    const anterior = Number(precioAnterior) || 0;
    const actual = Number(precioActual) || 0;
    if (anterior <= 0 || actual <= 0 || anterior <= actual) return 0;
    return Math.round((1 - actual / anterior) * 100);
}

// ------------------------------------------------------------
// PORTAPAPELES: copia texto (ej: link de un producto) y avisa con un
// toast. Usa la Clipboard API moderna y, si no está disponible (http
// sin TLS, navegador viejo), cae a un textarea temporal + execCommand.
// ------------------------------------------------------------
async function copiarAlPortapapeles(texto, mensajeExito = 'Copiado al portapapeles.') {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = texto;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }
        mostrarToast(mensajeExito, 'success');
        return true;
    } catch (err) {
        console.error('Error copiando al portapapeles:', err);
        mostrarToast('No se pudo copiar. Copialo manualmente: ' + texto, 'error', 7000);
        return false;
    }
}

function miniaturaCloudinary(url, size = 60) {
    if (!url) return '';
    const marcador = '/upload/';
    const i = url.indexOf(marcador);
    if (i === -1) return url; // no es una URL de Cloudinary, se usa tal cual
    const inicio = i + marcador.length;
    return url.slice(0, inicio) + `w_${size},h_${size},c_fill,q_auto,f_auto/` + url.slice(inicio);
}

// ------------------------------------------------------------
// MINIATURA DE FOTOS DE PRODUCTO (Supabase Storage)
// ------------------------------------------------------------
// A diferencia de Cloudinary, el bucket de Storage no redimensiona al vuelo
// en el plan free: la miniatura se sube como archivo aparte al cargar la
// foto (ver image-upload.js, solo cargado en dashboard.html). Esta función
// SÍ hace falta en todas las páginas que muestran productos (catálogo,
// tienda, panel), por eso vive acá y no en image-upload.js.
const BUCKET_PRODUCTOS = 'productos-imagenes';
const IMG_THUMB_SUFIJO = '-thumb';

// Dado el imagen_url completa guardada en la fila del producto, arma la URL
// de su miniatura liviana para usar en las cards de grilla. Si la imagen es
// de antes de este cambio (no tiene thumb subido), cae de vuelta a la
// imagen completa: no rompe nada de lo que ya estaba cargado.
function urlThumbProducto(imagenUrl) {
    if (!imagenUrl) return imagenUrl;
    const marcador = `/${BUCKET_PRODUCTOS}/`;
    const idx = imagenUrl.indexOf(marcador);
    if (idx === -1) return imagenUrl; // no es una imagen de este bucket (ej: Cloudinary u otra URL vieja)
    const puntoExtension = imagenUrl.lastIndexOf('.webp');
    if (puntoExtension === -1) return imagenUrl;
    return imagenUrl.slice(0, puntoExtension) + IMG_THUMB_SUFIJO + imagenUrl.slice(puntoExtension);
}


// Íconos SVG (stroke="currentColor": heredan el color del texto donde se usen)
const ICONO_SVG_BILLETES =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>';

const ICONO_SVG_MANOS =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg>';

const ICONO_SVG_TARJETA =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';

// Ícono genérico de "tres puntos" para la opción Otro
const ICONO_SVG_OTRO =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>';

const MEDIOS_PAGO = [
    { id: 'transferencia', label: 'Transferencia',      icon: ICONO_SVG_MANOS },
    { id: 'debito',        label: 'Tarjeta de débito',  icon: ICONO_SVG_TARJETA },
    { id: 'credito',       label: 'Tarjeta de crédito', icon: ICONO_SVG_TARJETA },
    { id: 'efectivo',      label: 'Efectivo',           icon: ICONO_SVG_BILLETES },
    { id: 'otro',          label: 'Otro',               icon: ICONO_SVG_OTRO },
];

function nombreMedioPago(id) {
    const m = MEDIOS_PAGO.find(m => m.id === id);
    return m ? m.label : id;
}

function iconoMedioPago(id) {
    const m = MEDIOS_PAGO.find(m => m.id === id);
    return m ? m.icon : ICONO_SVG_TARJETA;
}

function suscribirTabla(tabla, callback, filtro) {
    const config = { event: '*', schema: 'public', table: tabla };
    if (filtro) config.filter = filtro;
    const nombreCanal = `rt-${tabla}-${filtro || 'all'}-${Math.random().toString(36).slice(2, 8)}`;

    // "Red de seguridad": si el canal se cae o el usuario vuelve a la
    // pestaña / recupera conexión, forzamos una resincronización por si en
    // el medio se perdió algún evento. PERO esto no puede dispararse cada
    // vez que el usuario cambia de pestaña un segundo y vuelve (pasa todo
    // el tiempo en el celular): antes eso pisaba avisos/estado que el
    // usuario todavía no había visto y hacía "temblar" la grilla sin
    // necesidad. Por eso lo limitamos a como mucho 1 vez cada 20s, y solo
    // si de verdad pasó ese tiempo desde el último dato fresco (evento real
    // recibido o resync anterior).
    const MIN_MS_ENTRE_RESYNC_PASIVO = 20000;
    let ultimoDatoFresco = Date.now();

    function resyncPasivo(motivo) {
        if (Date.now() - ultimoDatoFresco < MIN_MS_ENTRE_RESYNC_PASIVO) return;
        ultimoDatoFresco = Date.now();
        console.debug(`Realtime "${tabla}": resync pasivo (${motivo})`);
        try { callback(); } catch (e) { /* noop */ }
    }

    const canal = supabase
        .channel(nombreCanal)
        .on('postgres_changes', config, (payload) => {
            ultimoDatoFresco = Date.now();
            callback(payload);
        })
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') ultimoDatoFresco = Date.now();
            // Si el canal se cae (wifi que titila, el celular cambia de red,
            // la notebook se suspendió, etc.) por defecto nos quedaríamos
            // escuchando un canal muerto en silencio hasta que alguien
            // recargue la página a mano. Acá lo detectamos y reintentamos.
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                console.warn(`Realtime "${tabla}": canal caído (${status}), reintentando...`, err || '');
                resyncPasivo('canal caído');
                setTimeout(() => {
                    if (document.visibilityState === 'visible') canal.subscribe();
                }, 2000);
            }
        });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resyncPasivo('volvió a la pestaña');
    });
    window.addEventListener('online', () => resyncPasivo('recuperó conexión'));

    return canal;
}


// ------------------------------------------------------------
// ACCESO / PAYWALL: calcula si a un emprendedor hay que mostrarle el
// splash de bloqueo (sin salida salvo pagar o cerrar sesión).
//
// Se bloquea por dos motivos posibles:
//   1) "admin"  -> el equipo lo bloqueó a mano (activo === false).
//   2) "pago"   -> no tiene una suscripción "authorized" (pagando al
//      día) y ya venció el plazo: la fecha de vencimiento guardada
//      (prueba gratis, pago rechazado, etc.), o si esa fecha nunca se
//      cargó, 30 días desde la creación de la cuenta.
// ------------------------------------------------------------
const DIAS_PRUEBA_GRATIS = 30;

// Únicos valores de "suscripcion_estado" que indican que alguna vez hubo
// un intento real de suscripción en MercadoPago (se generó, quedó
// pendiente, se rechazó un cobro, se canceló o se pausó). Cualquier otro
// valor -incluido 'sin_suscripcion', 'vencida' como default de la
// columna, vacío, etc.- significa que la cuenta todavía no pasó por MP y
// puede seguir dentro de su mes gratis, sin importar qué fecha haya
// quedado guardada en "fecha_vencimiento_suscripcion".
const ESTADOS_SUSCRIPCION_REAL = ['authorized', 'pending', 'pago_rechazado', 'cancelled', 'paused'];

function calcularEstadoAcceso(emprendedor) {
    if (!emprendedor) return { bloqueado: false };

    if (emprendedor.activo === false) {
        return {
            bloqueado: true,
            motivo: 'admin',
            mensaje: emprendedor.motivo_bloqueo || 'Tu cuenta fue bloqueada por el equipo de la comunidad.',
        };
    }

    const estado = emprendedor.suscripcion_estado || 'sin_suscripcion';
    if (estado === 'authorized') return { bloqueado: false };

    // Las cuentas "solo beneficios" las crea el admin a mano después de que
    // el comercio ya pagó la membresía por afuera del sistema (no pasan por
    // MercadoPago). Por eso también reciben el mismo mes de margen desde
    // que se crea la cuenta antes de considerarse vencidas: no tendría
    // sentido mostrarles el botón de pago al toque si ya cobramos.
    const esSoloBeneficios = !!emprendedor.solo_beneficios;
    const enPruebaGratis = !ESTADOS_SUSCRIPCION_REAL.includes(estado);
    const diasPrueba = DIAS_PRUEBA_GRATIS;

    let vencimiento = emprendedor.fecha_vencimiento_suscripcion
        ? new Date(emprendedor.fecha_vencimiento_suscripcion)
        : null;

    // Nunca se activó ninguna prueba/suscripción -> el límite es
    // "diasPrueba" días desde que se creó la cuenta (0 para solo beneficios).
    if (!vencimiento && emprendedor.created_at) {
        vencimiento = new Date(new Date(emprendedor.created_at).getTime() + diasPrueba * 24 * 60 * 60 * 1000);
    }

    if (vencimiento && Date.now() > vencimiento.getTime()) {
        return { bloqueado: true, motivo: 'pago', vencimiento, enPruebaGratis, soloBeneficios: esSoloBeneficios };
    }

    return { bloqueado: false, enPruebaGratis, vencimiento, soloBeneficios: esSoloBeneficios };
}

// ------------------------------------------------------------
// PRODUCTO "NUEVO": se marca a mano al cargar/editar el producto
// (no es automático por fecha de creación), pero para que nadie
// se olvide de sacarlo, deja de mostrarse solo a los 5 días de
// haberse marcado.
// ------------------------------------------------------------
const DIAS_VIGENCIA_NUEVO = 5;

function esProductoNuevoVigente(p) {
    if (!p || !p.nuevo || !p.nuevo_desde) return false;
    const diasTranscurridos = (Date.now() - new Date(p.nuevo_desde).getTime()) / (1000 * 60 * 60 * 24);
    return diasTranscurridos < DIAS_VIGENCIA_NUEVO;
}

// Días que le quedan al badge "Nuevo" antes de vencer (0 si ya venció o no aplica)
function diasRestantesNuevo(p) {
    if (!esProductoNuevoVigente(p)) return 0;
    const diasTranscurridos = (Date.now() - new Date(p.nuevo_desde).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(DIAS_VIGENCIA_NUEVO - diasTranscurridos));
}

function debounce(fn, espera = 350) {
    let temporizador = null;
    return (...args) => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => fn(...args), espera);
    };
}

(function initUIKit() {
    if (document.getElementById('cp-uikit-styles')) return;

    const style = document.createElement('style');
    style.id = 'cp-uikit-styles';
    style.textContent = `
        .cp-toast-container {
            position: fixed; top: 1rem; right: 1rem; z-index: 9999;
            display: flex; flex-direction: column; gap: 0.5rem;
            max-width: min(360px, calc(100vw - 2rem));
        }
        .cp-toast {
            display: flex; align-items: flex-start; gap: 0.6rem;
            padding: 0.85rem 1rem; border-radius: 14px;
            font-family: inherit, sans-serif; font-size: 0.8rem; font-weight: 600;
            color: #fff; box-shadow: 0 10px 30px -5px rgba(0,0,0,0.3);
            animation: cp-toast-in 0.25s cubic-bezier(0.16,1,0.3,1);
            line-height: 1.4;
        }
        .cp-toast.error { background: #dc2626; }
        .cp-toast.success { background: #059669; }
        .cp-toast.info { background: #0b0c10; }
        .cp-toast button {
            background: none; border: none; color: inherit; opacity: 0.7;
            cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0;
            margin-left: auto; flex-shrink: 0;
        }
        .cp-toast button:hover { opacity: 1; }
        @keyframes cp-toast-in { from { opacity:0; transform: translateX(16px);} to {opacity:1; transform:translateX(0);} }
        @keyframes cp-toast-out { from {opacity:1;} to {opacity:0; transform: translateX(16px);} }

        .cp-confirm-overlay {
            position: fixed; inset: 0; z-index: 9998;
            /* Antes tenía backdrop-filter: blur(6px), que obliga al navegador a
               recalcular en vivo, frame a frame, el desenfoque de TODO lo que
               queda atrás (que acá encima es el modal de QR ya abierto): eso
               era el lag/"fondo que se transparenta en vivo". Lo sacamos y
               dejamos un fondo semitransparente plano, igual que el resto de
               los modales del sitio (que usan bg-black/85 sin blur): un solo
               blend, sin recálculo continuo. */
            background: rgba(0,0,0,0.85);
            display: flex; align-items: center; justify-content: center;
            padding: 1rem; animation: cp-fade-in 0.2s ease;
        }
        @keyframes cp-fade-in { from {opacity:0;} to {opacity:1;} }
        .cp-confirm-box {
            background: #fff; width: 100%; max-width: 380px; border-radius: 24px;
            padding: 1.75rem; font-family: inherit, sans-serif;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
        }
        .cp-confirm-title { font-weight: 800; font-size: 1.1rem; color: #0f172a; margin: 0 0 0.4rem; }
        .cp-confirm-msg { font-size: 0.85rem; color: #64748b; font-weight: 500; line-height: 1.5; margin: 0 0 1.5rem; }
        .cp-confirm-actions { display: flex; gap: 0.75rem; }
        .cp-confirm-actions button {
            flex: 1; padding: 0.85rem; border-radius: 12px; font-weight: 800;
            font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
            border: none; cursor: pointer; transition: all 0.15s;
        }
        .cp-confirm-cancel { background: #f1f5f9; color: #64748b; }
        .cp-confirm-cancel:hover { background: #e2e8f0; }
        .cp-confirm-ok { background: #0b0c10; color: #fff; }
        .cp-confirm-ok:hover { background: #facc15; color: #000; }
        .cp-confirm-ok.peligro { background: #dc2626; }
        .cp-confirm-ok.peligro:hover { background: #b91c1c; }

        .cp-aviso-textarea {
            width: 100%; min-height: 110px; resize: vertical;
            border: 1.5px solid #e2e8f0; border-radius: 12px;
            padding: 0.75rem; font-family: inherit, sans-serif;
            font-size: 0.85rem; color: #0f172a; margin: 0 0 1.25rem;
            box-sizing: border-box;
        }
        .cp-aviso-textarea:focus { outline: none; border-color: #0b0c10; }

        /* Modal de aviso del admin: mismo acento amarillo/obsidiana que el
           resto del panel (botón "Enviar aviso", banners de anuncio), pero
           con más peso visual para que se note que es un mensaje, no una
           confirmación cualquiera. */
        .cp-aviso-box {
            border-top: 5px solid #facc15;
            padding-top: 1.5rem;
        }
        .cp-aviso-icono {
            width: 60px; height: 60px; border-radius: 9999px;
            background: linear-gradient(135deg, #fef08a, #facc15);
            display: flex; align-items: center; justify-content: center;
            font-size: 1.6rem; margin: 0 auto 0.9rem;
            box-shadow: 0 8px 18px -6px rgba(250, 204, 21, 0.55);
        }
        .cp-aviso-remitente {
            display: inline-flex; align-items: center; gap: 0.35rem;
            font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
            letter-spacing: 0.06em; color: #92400e;
            background: #fffbeb; border: 1px solid #fde68a;
            padding: 0.3rem 0.7rem; border-radius: 9999px;
            margin: 0 0 1.5rem;
        }
        .cp-aviso-msg-box {
            background: #f8fafc; border: 1px solid #eef2f6;
            border-radius: 14px; padding: 0.9rem 1rem;
            margin: 0 0 0.75rem;
        }
        .cp-aviso-btn {
            display: flex; align-items: center; justify-content: center;
            gap: 0.4rem;
            background: #0b0c10; color: #facc15;
            border-radius: 16px; padding: 0.95rem;
            font-weight: 800; font-size: 0.75rem;
            text-transform: uppercase; letter-spacing: 0.06em;
            border: none; cursor: pointer;
            box-shadow: 0 10px 20px -8px rgba(11, 12, 16, 0.45);
            transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease;
        }
        .cp-aviso-btn:hover {
            background: #facc15; color: #0b0c10;
            transform: translateY(-1px);
            box-shadow: 0 12px 22px -8px rgba(250, 204, 21, 0.55);
        }
        .cp-aviso-btn:active { transform: translateY(0); }
    `;
    document.head.appendChild(style);

    const contenedorToasts = document.createElement('div');
    contenedorToasts.className = 'cp-toast-container';
    contenedorToasts.id = 'cp-toast-container';
    document.body.appendChild(contenedorToasts);
})();

// Muestra una notificación flotante (reemplaza alert()).
// tipo: 'error' | 'success' | 'info'
function mostrarToast(mensaje, tipo = 'error', duracion = 4000) {
    const cont = document.getElementById('cp-toast-container');
    if (!cont) return;

    const toast = document.createElement('div');
    toast.className = `cp-toast ${tipo}`;

    const texto = document.createElement('span');
    texto.textContent = mensaje;

    const btnCerrar = document.createElement('button');
    btnCerrar.setAttribute('aria-label', 'Cerrar');
    btnCerrar.textContent = '✕';

    toast.append(texto, btnCerrar);

    const quitar = () => {
        toast.style.animation = 'cp-toast-out 0.2s ease forwards';
        setTimeout(() => toast.remove(), 200);
    };
    btnCerrar.addEventListener('click', quitar);

    cont.appendChild(toast);
    setTimeout(quitar, duracion);
}

// Modal de confirmación (reemplaza confirm()). Devuelve una Promise<boolean>.
// Uso: const ok = await confirmarAccion('¿Seguro?', { titulo: '...', textoConfirmar: 'Eliminar' });
function confirmarAccion(mensaje, opciones = {}) {
    const {
        titulo = '¿Estás seguro?',
        textoConfirmar = 'Confirmar',
        textoCancelar = 'Cancelar',
        peligro = true,
    } = opciones;

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'cp-confirm-overlay';

        const box = document.createElement('div');
        box.className = 'cp-confirm-box';

        const pTitulo = document.createElement('p');
        pTitulo.className = 'cp-confirm-title';
        pTitulo.textContent = titulo;

        const pMsg = document.createElement('p');
        pMsg.className = 'cp-confirm-msg';
        pMsg.textContent = mensaje;

        const acciones = document.createElement('div');
        acciones.className = 'cp-confirm-actions';

        const btnCancelar = document.createElement('button');
        btnCancelar.type = 'button';
        btnCancelar.className = 'cp-confirm-cancel';
        btnCancelar.textContent = textoCancelar;

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = `cp-confirm-ok ${peligro ? 'peligro' : ''}`;
        btnOk.textContent = textoConfirmar;

        acciones.append(btnCancelar, btnOk);
        box.append(pTitulo, pMsg, acciones);
        overlay.appendChild(box);

        const cerrar = (resultado) => {
            overlay.remove();
            if (typeof desbloquearScrollBody === 'function') {
                desbloquearScrollBody();
            } else {
                document.body.classList.remove('overflow-hidden');
            }
            resolve(resultado);
        };
        btnCancelar.addEventListener('click', () => cerrar(false));
        btnOk.addEventListener('click', () => cerrar(true));

        if (typeof bloquearScrollBody === 'function') {
            bloquearScrollBody();
        } else {
            document.body.classList.add('overflow-hidden');
        }
        document.body.appendChild(overlay);
    });
}

// ============================================================
// AVISOS INDIVIDUALES (admin -> un emprendedor puntual)
// ============================================================

// Modal para que el admin escriba el mensaje de un aviso individual
// (reemplaza prompt()). Devuelve el texto escrito, o null si canceló.
// Uso: const mensaje = await pedirAviso('Nombre de la tienda');
function pedirAviso(nombreTienda) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'cp-confirm-overlay';

        const box = document.createElement('div');
        box.className = 'cp-confirm-box';

        const pTitulo = document.createElement('p');
        pTitulo.className = 'cp-confirm-title';
        pTitulo.textContent = `Enviar aviso a ${nombreTienda}`;

        const pMsg = document.createElement('p');
        pMsg.className = 'cp-confirm-msg';
        pMsg.textContent = 'Le va a aparecer como un mensaje emergente la próxima vez que entre a su panel (o al toque, si ya está adentro).';

        const textarea = document.createElement('textarea');
        textarea.className = 'cp-aviso-textarea';
        textarea.placeholder = 'Ej: Vimos que todavía no cargaste tu foto de perfil. Subila para que los compradores confíen más en tu tienda 📸';
        textarea.maxLength = 500;

        const acciones = document.createElement('div');
        acciones.className = 'cp-confirm-actions';

        const btnCancelar = document.createElement('button');
        btnCancelar.type = 'button';
        btnCancelar.className = 'cp-confirm-cancel';
        btnCancelar.textContent = 'Cancelar';

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = 'cp-confirm-ok';
        btnOk.textContent = 'Enviar aviso';

        acciones.append(btnCancelar, btnOk);
        box.append(pTitulo, pMsg, textarea, acciones);
        overlay.appendChild(box);

        const cerrar = (resultado) => {
            overlay.remove();
            if (typeof desbloquearScrollBody === 'function') {
                desbloquearScrollBody();
            } else {
                document.body.classList.remove('overflow-hidden');
            }
            resolve(resultado);
        };
        btnCancelar.addEventListener('click', () => cerrar(null));
        btnOk.addEventListener('click', () => {
            const texto = textarea.value.trim();
            if (!texto) { textarea.focus(); return; }
            cerrar(texto);
        });

        if (typeof bloquearScrollBody === 'function') {
            bloquearScrollBody();
        } else {
            document.body.classList.add('overflow-hidden');
        }
        document.body.appendChild(overlay);
        setTimeout(() => textarea.focus(), 50);
    });
}

function mostrarAvisoModal(mensaje) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'cp-confirm-overlay';

        const box = document.createElement('div');
        box.className = 'cp-confirm-box cp-aviso-box';
        box.style.textAlign = 'center';

        const icono = document.createElement('div');
        icono.className = 'cp-aviso-icono';
        icono.textContent = '📣';

        const pTitulo = document.createElement('p');
        pTitulo.className = 'cp-confirm-title';
        pTitulo.style.textAlign = 'center';
        pTitulo.textContent = 'Aviso importante';

        // Este remitente es fijo: por ahora sólo el administrador puede
        // enviar este tipo de aviso (ver enviarAvisoIndividual en admin.js),
        // así que no hace falta guardarlo en la fila de avisos_admin ni
        // pasarlo como parámetro. Si en el futuro otros roles pudieran
        // mandar avisos, esto tendría que volverse dinámico.
        const pRemitente = document.createElement('p');
        pRemitente.className = 'cp-aviso-remitente';
        pRemitente.innerHTML = 'Enviado por Admin';

        const msgBox = document.createElement('div');
        msgBox.className = 'cp-aviso-msg-box';

        const pMsg = document.createElement('p');
        pMsg.className = 'cp-confirm-msg';
        pMsg.textContent = mensaje;
        pMsg.style.whiteSpace = 'pre-wrap';
        pMsg.style.textAlign = 'left';
        pMsg.style.margin = '0';
        msgBox.appendChild(pMsg);

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = 'cp-aviso-btn';
        btnOk.style.width = '100%';
        btnOk.innerHTML = '✓ Entendido';

        box.append(icono, pTitulo, pRemitente, msgBox, btnOk);
        overlay.appendChild(box);

        const cerrar = () => {
            overlay.remove();
            if (typeof desbloquearScrollBody === 'function') {
                desbloquearScrollBody();
            } else {
                document.body.classList.remove('overflow-hidden');
            }
            resolve();
        };
        btnOk.addEventListener('click', cerrar);

        if (typeof bloquearScrollBody === 'function') {
            bloquearScrollBody();
        } else {
            document.body.classList.add('overflow-hidden');
        }
        document.body.appendChild(overlay);
    });
}
async function mostrarAvisosPendientes(emprendedorId) {
    const { data, error } = await supabase
        .from('avisos_admin')
        .select('*')
        .eq('emprendedor_id', emprendedorId)
        .eq('leido', false)
        .order('creado_en', { ascending: true });

    if (error) { console.error('Error trayendo avisos:', error); return; }
    if (!data || data.length === 0) return;

    for (const aviso of data) {
        await mostrarAvisoModal(aviso.mensaje);
        await supabase.from('avisos_admin').update({ leido: true }).eq('id', aviso.id);
    }
}
