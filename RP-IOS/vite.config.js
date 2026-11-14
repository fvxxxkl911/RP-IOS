import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Injected only into the built HTML. The three business pages stay byte-identical
// to the 0.2.2 web release, so browser-side behaviour does not change at all.
const SAFE_AREA_CSS = 'html[data-rphub-native="true"] body{padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)}';

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

                // iOS needs viewport-fit=cover before env(safe-area-inset-*) resolves.
                html = html.replace(/<meta\s+name="viewport"\s+content="([^"]*)"\s*\/?>/g, (tag, content) => {
                    if (/viewport-fit\s*=\s*cover/.test(content)) return tag;
                    return tag.replace(content, `${content.replace(/\s+$/, '')}, viewport-fit=cover`);
                });

                // Single-line injection: keeps each file's original CRLF/LF style untouched.
                const injection = `<script src="${base}capacitor-bridge.js"><\/script><style>${SAFE_AREA_CSS}</style>`;
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
