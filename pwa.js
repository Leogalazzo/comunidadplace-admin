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
            '<span>Hay una nueva versión disponible.</span>' +
            '<button type="button">Actualizar</button>';
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('pwa-update-toast-show'));

        toast.querySelector('button').addEventListener('click', () => {
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
    }

    // --------------------------------------------------------
    // 2) SPLASH SCREEN: solo visible cuando la app corre instalada
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