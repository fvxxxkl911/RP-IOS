/* Verifies the Vite output is a complete, self-contained static site for Capacitor.
 * Run automatically by `npm run build` and by the CI workflow before archiving.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const problems = [];
const notes = [];

const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const pages = ['index.html', 'novel/index.html', 'character/index.html', 'diagnostics.html'];
for (const page of pages) {
    const file = path.join(dist, page);
    if (!fs.existsSync(file)) { problems.push(`缺少页面: ${page}`); continue; }
    const html = fs.readFileSync(file, 'utf8');

    ok(/capacitor-bridge\.js/.test(html), `${page}: 未注入原生桥脚本`);

    // The shell injects ONLY the bridge script. The viewport tag must stay
    // byte-identical to the source page: adding viewport-fit=cover plus body
    // safe-area padding made env(safe-area-inset-top) non-zero while the app CSS
    // forces html/body/#app to --app-visual-height with overflow:hidden, which
    // pushed #app down and clipped its bottom on real iOS devices.
    const src = fs.readFileSync(path.join(root, page), 'utf8');
    const viewport = t => (t.match(/<meta name="viewport"[^>]*>/) || [''])[0];
    ok(viewport(html) === viewport(src), `${page}: viewport 被改写，应与源页面一致`);
    ok(!/data-rphub-native="true"\]\s*body\s*\{[^}]*padding/.test(html),
        `${page}: 仍注入了 body 安全区 padding`);

    // Resolve every src/href that points at a local asset, relative to the page.
    // Strict path characters on purpose: document.write builds script tags from
    // string concatenation, which must NOT be mistaken for a real reference.
    const refs = [...html.matchAll(/(?:src|href)="((?:\.\.\/)?assets\/[A-Za-z0-9_./-]+\.(?:js|css|svg|png|jpe?g|webp|woff2?))(?:\?[A-Za-z0-9_.=&-]*)?"/g)]
        .map(m => m[1]);
    for (const ref of refs) {
        const target = path.resolve(path.dirname(file), ref);
        ok(fs.existsSync(target), `${page}: 引用了不存在的资源 ${ref}`);
    }
    notes.push(`${page}: ${refs.length} 个静态引用, ${(html.length / 1024).toFixed(0)} KB`);
}

// Business scripts must be present verbatim (publicDir copy, no bundling).
const requiredScripts = [
    'app.js', 'ui-components.js', 'core-utils.js', 'api-utils.js', 'data-services.js',
    'runtime-services.js', 'built-in-content.js', 'cloud-backup.js', 'update-check.js',
    'tailwind-theme.js', 'theme.js', 'capacitor-bridge.js'
];
for (const name of requiredScripts) {
    ok(fs.existsSync(path.join(dist, 'assets/js', name)), `缺少业务脚本: assets/js/${name}`);
}
for (const name of ['vue.global.prod.js', 'tailwindcss.js', 'marked.min.js', 'purify.min.js',
    'Sortable.min.js', 'localforage.min.js', 'jquery.min.js', 'daisyui.full.min.css']) {
    ok(fs.existsSync(path.join(dist, 'assets/vendor', name)), `缺少本地依赖: assets/vendor/${name}`);
}
for (const name of ['styles.css', 'theme.css']) {
    ok(fs.existsSync(path.join(dist, 'assets/css', name)), `缺少样式: assets/css/${name}`);
}

// Guard against an accidental remote-version check regression.
const updateCheck = fs.readFileSync(path.join(dist, 'assets/js/update-check.js'), 'utf8');
ok(/UPDATE_CHECK_ENABLED\s*=\s*false/.test(updateCheck), '远程版本检测意外被重新启用');

console.log('=== dist 校验 ===');
notes.forEach(n => console.log('  ' + n));
if (problems.length) {
    console.error('\n校验失败:');
    problems.forEach(p => console.error('  x ' + p));
    process.exit(1);
}
console.log(`  通过: ${pages.length} 个页面, ${requiredScripts.length} 个业务脚本, 8 个本地依赖`);
