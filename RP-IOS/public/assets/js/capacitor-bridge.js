/* RP-Hub native shell bridge (0.2.2).
 *
 * Classic script, no imports: it is copied verbatim from publicDir and injected
 * into every page by vite.config.js. In a plain browser it is a complete no-op,
 * so the web release keeps its original behaviour byte-for-byte.
 *
 * Scope is deliberately limited to "shell" concerns. It never changes request
 * routing, model selection, storage or any business logic.
 */
(function () {
    'use strict';

    var C = window.Capacitor;
    var plugins = (C && C.Plugins) || {};
    var native = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());

    var info = {
        native: native,
        platform: (C && typeof C.getPlatform === 'function' && C.getPlatform()) || 'web',
        scheme: location.protocol.replace(/:$/, ''),
        origin: location.origin,
        plugins: Object.keys(plugins).sort(),
        // True when CapacitorHttp has replaced window.fetch with the native bridge.
        // Streaming SSE (api-utils.js uses response.body.getReader()) is then degraded.
        fetchPatched: native && !/^\s*function fetch\s*\(/.test(String(window.fetch))
    };

    try { Object.freeze(info); } catch (_) { }
    window.RPHubNative = info;

    if (!native) return;

    // Enables the safe-area CSS injected by vite.config.js (only on a real device).
    document.documentElement.dataset.rphubNative = 'true';

    // Capacitor only boots index.html, so diagnostics.html needs a reachable
    // entry. This button exists ONLY in a native container; browsers never see it.
    // Set the flag to false once you are done validating the device.
    var SHOW_DIAGNOSTICS_ENTRY = true;
    if (SHOW_DIAGNOSTICS_ENTRY && !/diagnostics\.html/.test(location.pathname)) {
        var addDiagnosticsEntry = function () {
            if (!document.body || document.getElementById('rphub-diag-entry')) return;
            var b = document.createElement('button');
            b.id = 'rphub-diag-entry';
            b.type = 'button';
            b.textContent = '诊断';
            b.setAttribute('aria-label', '打开真机连通性自检');
            b.style.cssText = 'position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));'
                + 'z-index:2147483000;padding:5px 9px;font-size:11px;line-height:1.2;border-radius:8px;'
                + 'border:1px solid rgba(127,127,127,.45);background:rgba(255,255,255,.72);color:#374151;'
                + 'cursor:pointer;opacity:.75';
            b.addEventListener('click', function () { location.href = '/diagnostics.html'; });
            document.body.appendChild(b);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addDiagnosticsEntry, { once: true });
        } else {
            addDiagnosticsEntry();
        }
    }

    try {
        if (plugins.StatusBar) plugins.StatusBar.setOverlaysWebView({ overlays: false });
    } catch (_) { /* optional plugin */ }

    try {
        if (plugins.SplashScreen) plugins.SplashScreen.hide();
    } catch (_) { /* optional plugin */ }

    // Publish keyboard height for input-positioning tweaks; resize mode itself is
    // configured statically via capacitor.config.json ("resize": "body").
    try {
        if (plugins.Keyboard && plugins.Keyboard.addListener) {
            plugins.Keyboard.addListener('keyboardWillShow', function (e) {
                document.documentElement.style.setProperty('--rphub-keyboard-height', (e.keyboardHeight || 0) + 'px');
            });
            plugins.Keyboard.addListener('keyboardWillHide', function () {
                document.documentElement.style.setProperty('--rphub-keyboard-height', '0px');
            });
        }
    } catch (_) { /* optional plugin */ }

    // iOS has no Escape key and no hardware back button. Tapping the dimmed
    // backdrop dispatches Escape so the existing close handlers still work.
    var dispatchEscape = function () {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', bubbles: true
        }));
    };
    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.classList || !target.classList.contains('app-modal-overlay')) return;
        dispatchEscape();
    }, true);

    // Android hardware back (no-op on iOS, kept so one shell serves both).
    try {
        if (plugins.App && plugins.App.addListener) {
            plugins.App.addListener('backButton', function () {
                if (document.querySelector('.app-modal-overlay')) {
                    dispatchEscape();
                    return;
                }
                try { plugins.App.exitApp(); } catch (_) { }
            });
        }
    } catch (_) { /* optional plugin */ }
})();
