// ============================================================
// PWA - Registro de Service Worker + splash screen
// Comunidad Place
// ============================================================
(function () {

    // --------------------------------------------------------
    // 1) SERVICE WORKER: registro y detección de actualizaciones
    // --------------------------------------------------------
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
                .then((reg) => {
                    // Chequeo periódico de actualizaciones (cada 60s) y al volver
                    // a la pestaña, para detectar deploys nuevos en Vercel rápido.
                    setInterval(() => reg.update(), 60 * 1000);
                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible') reg.update();
                    });

                    reg.addEventListener('updatefound', () => {
                        const nuevoWorker = reg.installing;
                        if (!nuevoWorker) return;
                        nuevoWorker.addEventListener('statechange', () => {
                            // "installed" + ya había un controller = es una ACTUALIZACIÓN
                            // (no la primera instalación).
                            if (nuevoWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                mostrarAvisoActualizacion(reg);
                            }
                        });
                    });
                })
                .catch((err) => console.error('[PWA] Error registrando el Service Worker:', err));

            // Cuando el nuevo SW toma control, recargamos una sola vez para
            // que el usuario vea la versión más reciente.
            let recargando = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (recargando) return;
                recargando = true;
                window.location.reload();
            });
        });
    }

    function mostrarAvisoActualizacion(reg) {
        if (document.querySelector('.pwa-update-toast')) return;

        const toast = document.createElement('div');
        toast.className = 'pwa-update-toast';
        toast.innerHTML =
            '<span class="pwa-update-toast__icon">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M21 12a9 9 0 1 1-2.64-6.36"></path><polyline points="21 3 21 9 15 9"></polyline>' +
                '</svg>' +
            '</span>' +
            '<span class="pwa-update-toast__text">' +
                '<span class="pwa-update-toast__title">Nueva versión de la app</span>' +
                '<span class="pwa-update-toast__desc">Actualizá para ver los últimos cambios</span>' +
            '</span>' +
            '<button type="button">Actualizar</button>';
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('pwa-update-toast-show'));

        toast.querySelector('button').addEventListener('click', () => {
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
    }

    // --------------------------------------------------------
    // 2) INSTALAR APP: botón "Instalar app" en login.html
    //    - Chrome/Edge/Android: usamos el evento beforeinstallprompt,
    //      que el navegador dispara si la PWA cumple los requisitos
    //      (manifest + service worker + servida por https).
    //    - iOS/Safari: no existe ese evento, así que si detectamos iOS
    //      y la app no está ya instalada, mostramos el botón igual pero
    //      al tocarlo abrimos un modal con instrucciones manuales
    //      (Compartir → Agregar a inicio).
    //    - Si la app ya corre instalada (standalone), el botón queda oculto.
    // --------------------------------------------------------
    (function () {
        const bloqueInstalar = document.getElementById('bloque-instalar-app');
        const btnInstalar = document.getElementById('btn-install-app');
        if (!bloqueInstalar || !btnInstalar) return;

        const modalIOS = document.getElementById('modal-instalar-ios');
        const modalIOSOverlay = document.getElementById('modal-instalar-ios-overlay');
        const modalIOSCerrar = document.getElementById('modal-instalar-ios-cerrar');
        const modalIOSEntendido = document.getElementById('modal-instalar-ios-entendido');

        const esStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

        if (esStandalone) return; // ya instalada, no mostramos nada

        let promptDiferido = null;

        function mostrarBotonInstalar() {
            bloqueInstalar.classList.remove('hidden');
        }

        function ocultarBotonInstalar() {
            bloqueInstalar.classList.add('hidden');
        }

        function abrirModalIOS() {
            if (!modalIOS) return;
            modalIOS.classList.remove('hidden');
        }

        function cerrarModalIOS() {
            if (!modalIOS) return;
            modalIOS.classList.add('hidden');
        }

        if (modalIOSOverlay) modalIOSOverlay.addEventListener('click', cerrarModalIOS);
        if (modalIOSCerrar) modalIOSCerrar.addEventListener('click', cerrarModalIOS);
        if (modalIOSEntendido) modalIOSEntendido.addEventListener('click', cerrarModalIOS);

        // Chrome / Edge / Android: el navegador avisa que la PWA es instalable
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            promptDiferido = e;
            mostrarBotonInstalar();
        });

        // iOS Safari: no hay beforeinstallprompt, mostramos el botón directo
        // (solo si estamos en Safari, no en apps embebidas como Instagram/FB
        // donde "Agregar a inicio" no está disponible igual).
        if (esIOS) {
            mostrarBotonInstalar();
        }

        btnInstalar.addEventListener('click', async () => {
            if (promptDiferido) {
                promptDiferido.prompt();
                const resultado = await promptDiferido.userChoice;
                promptDiferido = null;
                if (resultado && resultado.outcome === 'accepted') {
                    ocultarBotonInstalar();
                }
                return;
            }

            if (esIOS) {
                abrirModalIOS();
                return;
            }

            // Otros navegadores sin soporte de instalación (ej. Firefox
            // desktop): no hay nada que ofrecer, así que ocultamos el botón.
            ocultarBotonInstalar();
        });

        // Se disparó una instalación exitosa (Chrome/Edge/Android)
        window.addEventListener('appinstalled', () => {
            promptDiferido = null;
            ocultarBotonInstalar();
            cerrarModalIOS();
        });
    })();

    // --------------------------------------------------------
    // 3) SPLASH SCREEN: solo visible cuando la app corre instalada
    //    (display-mode: standalone). Se oculta con fade una vez que
    //    la página terminó de cargar, respetando un tiempo mínimo
    //    para que no "parpadee" en conexiones rápidas.
    // --------------------------------------------------------
    const INICIO_SPLASH = Date.now();
    const SPLASH_MIN_MS = 550;

    function ocultarSplash() {
        const splash = document.querySelector('.pwa-splash');
        if (!splash) return;
        splash.classList.add('pwa-splash-hide');
        setTimeout(() => splash.remove(), 500);
    }

    function finalizarSplashCuandoListo() {
        const transcurrido = Date.now() - INICIO_SPLASH;
        const espera = Math.max(0, SPLASH_MIN_MS - transcurrido);
        setTimeout(ocultarSplash, espera);
    }

    if (document.readyState === 'complete') {
        finalizarSplashCuandoListo();
    } else {
        window.addEventListener('load', finalizarSplashCuandoListo);
    }
})();
