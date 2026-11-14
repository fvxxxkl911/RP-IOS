import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Injected only into the built HTML. The three business pages stay byte-identical
// to the 0.2.2 web release, so browser-side behaviour does not change at all.
function iosShellPlugin() {
    return {
        name: 'rphub-ios-shell',
        transformIndexHtml: {
            order: 'post',
            handler(html, ctx) {
                // dev: ctx.path = /novel/index.html ; build: ctx.filename = /abs/.../novel/index.html
                const probe = `${ctx.filename || ''}|${ctx.path || ''}`.replace(/\\/g, '/');
                const nested = /(?:^|\/)(novel|character)\/index\.html/.test(probe);
                const base = nested ? '../assets/js/' : 'assets/js/';

                // Only inject the bridge script. Do NOT rewrite the viewport and do NOT
                // add body safe-area padding: StatusBar.overlaysWebView=false already
                // keeps the WKWebView inside the safe area. Adding viewport-fit=cover
                // plus body padding made env(safe-area-inset-top) non-zero while the app
                // CSS forces html/body/#app to height:var(--app-visual-height)!important
                // with overflow:hidden -- the extra padding pushed #app down and clipped
                // its bottom. Keyboard avoidance is handled natively by
                // Keyboard.resize="native", so no CSS compensation is needed here.
                //
                // Single-line injection: keeps each file's original CRLF/LF style untouched.
                const injection = `<script src="${base}capacitor-bridge.js"><\/script>`;
                return html.replace('</head>', `${injection}</head>`);
            }
        }
    };
}

export default defineConfig({
    root: here,
    publicDir: 'public',
    appType: 'mpa',
    plugins: [iosShellPlugin()],
    server: { host: '0.0.0.0', port: 5173 },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // No bundling of business scripts: they are plain classic scripts loaded in
        // order (some via document.write) and copied verbatim from publicDir.
        rollupOptions: {
            input: {
                main: resolve(here, 'index.html'),
                novel: resolve(here, 'novel/index.html'),
                character: resolve(here, 'character/index.html'),
                diagnostics: resolve(here, 'diagnostics.html')
            }
        }
    }
});
