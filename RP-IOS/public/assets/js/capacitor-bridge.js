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

    // Enables the native-only CSS below (only on a real device).
    var rootEl = document.documentElement;
    rootEl.dataset.rphubNative = 'true';

    // ----------------------------------------------------------------------
    // iOS shell polish. Injected from JS rather than from the built HTML so the
    // three business pages stay byte-identical to the 0.2.2 web release.
    // ----------------------------------------------------------------------
    var SHELL_CSS = [
        // (1) Secure keyboard. iOS forces a password-only keyboard on
        //     input[type=password]: third-party keyboards are disabled, the
        //     paste/ AutoFill bar becomes "此 App 的密码", and the key is offered
        //     to the keychain. Secret fields are converted to plain text inputs
        //     below; this rule keeps the dots without the secure traits.
        'html[data-rphub-native="true"] input[data-rphub-secure]:not([data-rphub-plain]){-webkit-text-security:disc}',
        'html[data-rphub-native="true"] input[data-rphub-secure]{-webkit-appearance:none;appearance:none}',

        // (2) iPhone 16 Pro: physical screen corners + Home Indicator. Only the
        //     composer's OWN padding is touched. Never add padding to html/body/
        //     #app: that made env(safe-area-inset-top) non-zero while the app CSS
        //     forces height:var(--app-visual-height)!important, pushing the whole
        //     page down and clipping its bottom in the previous build.
        'html[data-rphub-native="true"] .input-area-mobile{padding-left:max(.75rem,env(safe-area-inset-left,0px))!important;padding-right:max(.75rem,env(safe-area-inset-right,0px))!important;padding-bottom:calc(.75rem + env(safe-area-inset-bottom,0px))!important}',
        'html[data-rphub-native="true"] .input-island{border-radius:1.5rem!important}',
        'html[data-rphub-native="true"] .app-navigation-panel{border-radius:1.625rem!important}',
        'html[data-rphub-native="true"] .settings-card{border-radius:1.375rem!important}',
        'html[data-rphub-native="true"] .settings-view .settings-control{border-radius:.875rem!important}',
        // Continuous ("squircle") corners are an iOS signature. Progressive:
        // older WebKit simply ignores the rule and keeps the plain radius.
        '@supports (corner-shape:squircle){html[data-rphub-native="true"] :is(.input-island,.app-navigation-panel,.settings-card,.settings-view .settings-control,.list-card){corner-shape:squircle}}',

        // (3) Keyboard animation. Keyboard.resize="native" shrinks the WKWebView
        //     itself. Dropping transitions, live blur and backdrop filters for the
        //     ~0.25 s frame animation removes the frame-by-frame relayout that
        //     made the composer stutter. The composer sits flush to the keyboard.
        'html.rphub-keyboard-active :is(.app-main,.chat-view-root,.input-area-mobile,.input-island,.char-bg-blur,.app-navigation-panel){transition:none!important;animation:none!important}',
        'html.rphub-keyboard-active .char-bg-blur{filter:none!important;will-change:auto!important}',
        'html.rphub-keyboard-active *{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}',
        'html[data-rphub-native="true"].rphub-keyboard-active .input-area-mobile{padding-bottom:0!important}'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.id = 'rphub-native-shell-css';
    styleEl.textContent = SHELL_CSS;
    (document.head || rootEl).appendChild(styleEl);

    // ----------------------------------------------------------------------
    // Secret fields -> plain text fields, masked with -webkit-text-security.
    // Covers every page and every Vue-rendered dialog (settings API Key,
    // Tavily key, diagnostics key, ...). No business script is modified.
    // ----------------------------------------------------------------------
    var SECURE_SEL = 'input[type="password"], input[data-rphub-secure]';

    var normalizeSecureFields = function () {
        var fields = document.querySelectorAll(SECURE_SEL);
        for (var i = 0; i < fields.length; i++) {
            var el = fields[i];
            if (!el.hasAttribute('data-rphub-secure')) {
                el.setAttribute('data-rphub-secure', '');
                el.setAttribute('autocomplete', 'off');
                el.setAttribute('autocorrect', 'off');
                el.setAttribute('autocapitalize', 'off');
                el.setAttribute('spellcheck', 'false');
            }
            // Vue rebinds :type as the eye button toggles. Always force it back;
            // visibility is driven by the button's aria-pressed, not by type.
            if (el.type !== 'text') el.type = 'text';
        }
        var boxes = document.querySelectorAll('.secret-input');
        for (var j = 0; j < boxes.length; j++) {
            var input = boxes[j].querySelector('input[data-rphub-secure]');
            if (!input) continue;
            var btn = boxes[j].querySelector('.secret-input__actions button[aria-pressed]');
            var plain = !!btn && (btn.getAttribute('aria-pressed') === 'true' || btn.getAttribute('title') === '隐藏');
            if (plain) input.setAttribute('data-rphub-plain', '');
            else input.removeAttribute('data-rphub-plain');
        }
    };

    normalizeSecureFields();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', normalizeSecureFields, { once: true });
    }
    try {
        var secureObserver = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length)) {
                    normalizeSecureFields();
                    return;
                }
                if (r.type === 'attributes' &&
                    (r.attributeName === 'type' || r.attributeName === 'aria-pressed' || r.attributeName === 'title')) {
                    normalizeSecureFields();
                    return;
                }
            }
        });
        secureObserver.observe(rootEl, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['type', 'aria-pressed', 'title']
        });
    } catch (_) { /* MutationObserver unavailable: static fields were already converted */ }

    // ----------------------------------------------------------------------
    // Freeze the JS-driven viewport variables on <html>. With native resize the
    // WKWebView frame itself shrinks, so 100dvh / visualViewport are already
    // correct; app.js rewriting --app-visual-height on every animation frame
    // caused a relayout on every frame (the composer stutter). Do NOT wire
    // --rphub-keyboard-height into any positioning rule.
    // ----------------------------------------------------------------------
    var FROZEN_VARS = Object.create(null);
    FROZEN_VARS['--app-visual-height'] = 1;
    FROZEN_VARS['--keyboard-inset'] = 1;
    FROZEN_VARS['--chat-bg-height'] = 1;
    var rootStyle = rootEl.style;
    try {
        var origSetProperty = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function (name) {
            if (this === rootStyle && FROZEN_VARS[name]) return;
            return origSetProperty.apply(this, arguments);
        };
        var origRemoveProperty = CSSStyleDeclaration.prototype.removeProperty;
        CSSStyleDeclaration.prototype.removeProperty = function (name) {
            if (this === rootStyle && FROZEN_VARS[name]) return '';
            return origRemoveProperty.apply(this, arguments);
        };
    } catch (_) { /* non-fatal: layout still follows 100dvh */ }

    // Capacitor only boots index.html, so diagnostics.html needs a reachable
    // entry. This button exists ONLY in a native container; browsers never see it.
    // Device validation is done (all checks green), so the entry is off by default.
    // Set it back to true if you ever need to re-run the network/SSE checks.
    var SHOW_DIAGNOSTICS_ENTRY = false;
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

    // Keyboard state: performance class + diagnostic height. Layout itself is
    // owned by Keyboard.resize="native" (capacitor.config.json); the black band
    // beside the keyboard is fixed by Keyboard.autoBackdropColor="auto".
    try {
        if (plugins.Keyboard && plugins.Keyboard.addListener) {
            plugins.Keyboard.addListener('keyboardWillShow', function (e) {
                rootEl.classList.add('rphub-keyboard-active');
                rootEl.style.setProperty('--rphub-keyboard-height', (e.keyboardHeight || 0) + 'px');
            });
            var onKeyboardHide = function () {
                rootEl.classList.remove('rphub-keyboard-active');
                rootEl.style.setProperty('--rphub-keyboard-height', '0px');
            };
            plugins.Keyboard.addListener('keyboardWillHide', onKeyboardHide);
            plugins.Keyboard.addListener('keyboardDidHide', onKeyboardHide);
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
