# RP Hub Dev 0.2.2 · iOS 工程骨架（未签名 IPA 云编译）

这份工程把上一轮交付的 `/workspace/RP-Hub-dev-0.2.2.zip`（纯前端网页版）装进 **Capacitor 8 + Vite 8** 的壳，用于自己签名、自己安装到 iPhone。

> **边界先说清**：交付的是「能编译出 IPA 的工程骨架」，**不是能直接安装的 IPA**，也不是已经成熟的原生 App。
> 编译 IPA 必须 macOS + Xcode，当前环境是 Linux，所以这一步放在 GitHub Actions 的 macOS runner 上；签名必须过你自己的 Apple ID，按你说的自签处理，本工程完全不碰签名。

---

## 1. 做了什么 / 没做什么

**做了**

| 项 | 说明 |
| --- | --- |
| Vite 8 多页工程 | `index.html` / `novel/` / `character/` / `diagnostics.html` 四个入口，产出 `dist/` |
| 业务逻辑零改动 | 三个业务 HTML 与 0.2.2 **字节级一致**；`assets/` 全部由 `public/` 原样复制，不参与打包 |
| iOS 适配全部走原生桥 | 构建产物只注入 `capacitor-bridge.js`；键盘避让、密钥字段、圆角/安全区、键盘动画性能规则都在桥里按 `isNativePlatform()` 生效，不改 viewport、不加 body padding（原因见第 7 节），浏览器里是严格 no-op |
| Capacitor 8 iOS 原生工程 | `ios/`（Swift Package Manager，无 CocoaPods）、4 个官方插件（App / Keyboard / StatusBar / SplashScreen） |
| 补齐 shared scheme | 官方模板没生成 `App.xcscheme`，已补，否则 CI 的 `xcodebuild -scheme App` 会失败 |
| 未签名 IPA 云编译 | `.github/workflows/build-unsigned-ipa.yml`（最终可直接运行版：配置预检 → 构建校验 → 无签名 Archive → IPA 结构校验 → 带运行号的 artifact → 构建摘要），零配置、无需证书 |
| 真机连通性自检页 | `diagnostics.html`，验证 CORS、流式 SSE、原生 HTTP；首轮 6 项全绿，**入口已关闭**（见第 6 节） |
| 版本号 | `MARKETING_VERSION = 0.2.2`，页面 title/公告沿用 0.2.2 |

**没做**（属于后续步骤，见第 8 节）

- 首轮 CI 归档已由你在 GitHub macOS runner 上跑通，未签名 IPA 也已自签装进 iPhone；**布局修复与本次键盘/密钥字段修复都需重新跑一次 CI 才生效**；
- WKWebView 的 CORS / 流式 SSE **已在真机验证通过**（诊断页 6 项全绿）；跨 iframe 主题同步、三页数据同步、重启持久化仍待按清单 L2/L3 实测；
- 本次修复（页面偏移 / 键盘遮挡 / 键盘卡顿 / 键盘旁黑色填充 / 安全键盘 / 16 Pro 圆角）**已改代码并在 Chromium 实跑验证逻辑，但视觉观感仍未经真机确认**；
- 三页没有合并成 SPA、数据仍在 IndexedDB（没迁 SQLite / Keychain）、Key 仍明文；
- 图标是 Capacitor 默认图标；Google Fonts 仍是可选外链（离线自动回退系统字体）；
- 没有上架任何商店，也不涉及审核。

---

## 2. 目录

```
RP-Hub-iOS/
├── index.html / novel/index.html / character/index.html   ← 0.2.2 原样，勿手改
├── diagnostics.html                    ← 新增：真机连通性自检
├── public/assets/                      ← 业务脚本 + 8 个本地依赖（源码真身）
│   └── js/capacitor-bridge.js          ← 新增：原生壳桥接（浏览器 no-op）
├── vite.config.js                      ← 多入口 + iOS 注入插件
├── capacitor.config.json               ← appId / webDir / 插件开关
├── scripts/check-dist.cjs              ← 构建产物完整性校验
├── tests/provider-routing.test.cjs     ← 0.2.2 原有 12 项单测
├── ios/App/App.xcodeproj/...           ← Xcode 工程（含补的 App.xcscheme）
├── ios/App/App/Info.plist              ← 加了 ATS 例外
├── .github/workflows/build-unsigned-ipa.yml
└── presence-server/                    ← 原网页版附带，iOS 不用，原样保留
```

`npm run build` = `vite build` + `check-dist.cjs`；`npm run cap:sync` = 构建 + `cap sync ios`。

---

## 3. 第一步：改 bundle id（必做）

默认是 `cn.rphub.dev`，**只是占位**。免费 Apple ID 侧载时 bundle id 必须唯一，和别人撞了会签名失败或覆盖别人的 App。改两处，保持一致：

1. `capacitor.config.json` → `"appId"`；
2. `ios/App/App.xcodeproj/project.pbxproj` → 两处 `PRODUCT_BUNDLE_IDENTIFIER`。

建议 `com.<你的标识>.rphub`。**定好后不要改**：7 天续签要用同一个 id 重签，换了 id 会被当成新 App，聊天记录会丢。

> workflow 的预检步骤会自动比对 `capacitor.config.json` 与 `pbxproj` 两处是否一致，只改一处会直接报错终止，不会出现「编译成功但装上去 id 不对」。

---

## 4. 云编译出未签名 IPA

workflow：`.github/workflows/build-unsigned-ipa.yml`（**零配置**，不需要任何证书、账号或 secrets）。

1. 先按第 3 节把 bundle id 改好并定下来。
2. 新建 GitHub 仓库，把整个 `RP-Hub-iOS/` 作为仓库根目录 push 上去。**`package-lock.json` 必须一起提交**，否则 `npm ci` 直接失败；`.gitignore` 已正确放行 `public/`、`capacitor.config.json`、`ios/`，只忽略 `dist/`、`node_modules/`、构建产物。
3. 两种触发方式：
   - push 到 `main` / `master` 自动构建（改 `.md`、`.gitignore`、`LICENSE` 不触发）；
   - 或打开 **Actions → Build unsigned IPA → Run workflow** 手动触发，可填两个可选项：`xcode_path`（指定 Xcode 绝对路径）、`retention_days`（产物保留 1–90 天，默认 30）。
4. 等约 5–20 分钟（首次要拉 Swift 包，会慢些）。成功后在该次运行页面底部下载 **`RP-Hub-unsigned-IPA-<运行号>`**，得到 `RP-Hub-0.2.2-unsigned-<运行号>.ipa`；运行页顶部还有一份构建摘要（版本、bundle id、commit、大小、SHA256）。

workflow 依次做了什么：

| 步骤 | 作用 |
| --- | --- |
| 预检 | 打印工具链；校验 `package-lock.json`、shared scheme 存在；**比对 `capacitor.config.json` 的 `appId` 与 `pbxproj` 两处 bundle id 一致**，不一致直接报错 |
| `npm ci` | 锁文件精确安装（Node 22 + npm 缓存） |
| `npm test` | 12 项供应商路由单测 |
| `npm run build` | Vite 多页构建 + `check-dist.cjs` 完整性校验 |
| `npx cap sync ios` | 同步原生工程，并比对 `dist/index.html` 与 `ios/App/App/public/index.html` |
| `-resolvePackageDependencies` | 解析 SPM（`Package.swift` 同时引用远程 `capacitor-swift-pm@8.6.2` 和本地 `node_modules/@capacitor/*`，所以必须在 `npm ci` 之后） |
| `xcodebuild archive` | `CODE_SIGNING_ALLOWED=NO` / `CODE_SIGNING_REQUIRED=NO` / `DEVELOPMENT_TEAM=""`，**完全不签名** |
| 打包 + 校验 | `App.app` → `Payload/`，断言 IPA 结构里存在 `Info.plist`、`unzip -t` 校验完整性、记录 SHA256 |
| 上传 | Actions artifact，产物名带运行号，便于区分多次构建 |

**如果报 Xcode 版本过旧**：Capacitor 8 需要 Xcode 16+，`macos-latest` 预装版本通常满足。两种处理——

- 手动触发时填 `xcode_path`（如 `/Applications/Xcode_26.app`，先在 runner 上 `ls /Applications` 确认），或
- 把 workflow 里的 `runs-on: macos-latest` 改成更新的 macOS 镜像标签。

> 默认分支若既不叫 `main` 也不叫 `master`，改 workflow 里 `push.branches`。
> macOS runner 计费倍率高于 Linux；公开仓库免费，私有仓库消耗每月免费额度，以 GitHub 账单页为准。

---

## 5. 签名安装（你自签的部分）

`RP-Hub-unsigned.ipa` **未签名，不能直接装**。用你习惯的工具签：

- **Sideloadly / AltStore / SideStore / Xcode 直装**均可，填自己的 Apple ID；
- 免费账号签名有效期 **7 天**，AltStore/SideStore 可在同 WiFi 或后台自动续签；
- iOS 16+ 需在「设置 → 隐私与安全性 → 开发者模式」打开，首次启动要在「设置 → 通用 → VPN 与设备管理」信任证书；
- 续签时保持 **同一个 bundle id**，否则数据不保留。

---

## 6. 装完先做真机自检（首轮已完成，可跳过）

首轮真机自检 **6 项全绿**：`origin capacitor://localhost`、① `/models` HTTP 200（135 个可用模型）、② 非流式对话 200、③ SSE 11 分片且逐字流式正常、④ `CapacitorHttp` 未接管。结论是：**WebView 原生 fetch 在这台设备上直连中转站没有 CORS 问题，SSE 流式也正常**，所以 `CapacitorHttp` 保持 `enabled: false` 不要动。

**诊断入口已关闭**：`capacitor-bridge.js` 里 `SHOW_DIAGNOSTICS_ENTRY = false`，App 左下角不再出现「诊断」按钮。`diagnostics.html` 仍留在包里（约 11 KB），以后换中转站、升级 Capacitor 想复测，把这个 flag 改回 `true` 再 `npm run build && npx cap sync ios` 即可。要彻底删除，需同时改 `vite.config.js` 的 `input.diagnostics` 与 `scripts/check-dist.cjs` 的 `pages` 列表。

> 顺带修了诊断页一个显示 bug：`首片` 曾显示成 `-1794622242262ms`（把绝对时间戳多减了一次）。它不影响对话，新版已改为显示真实首片耗时。

### 这一版要复验的是键盘与密钥输入

首轮反馈了三个现象：页面整体下移（顶部被裁、底部贴边）、键盘弹起后聊天输入框位置错乱、设置/诊断页输入框被键盘遮挡导致没法粘贴。第二轮又反馈了：键盘升起时聊天框卡顿、键盘旁有黑色填充、输 API Key 时弹出「此 App 的密码」安全键盘（第三方输入法与剪贴板都用不了）、输入框与设置控件没适配 16 Pro 圆角。修复见第 7 节，重新构建 IPA 后按下面几条确认：

| 检查 | 通过的样子 |
| --- | --- |
| 导航菜单 / 聊天页位置 | 「RP HUB」卡片居中，顶部标题完整、底部不贴物理底边、不被裁切；聊天与小说两个视图都看一遍 |
| 键盘弹起 | 聊天输入框贴在键盘正上方、能正常打字；键盘收起后回到屏幕底部；设置页输 API Key 能长按粘贴 |
| 左下角 | 不再出现「诊断」按钮，不会挡住输入框左侧 |
| **输 API Key 的键盘** | 顶栏不再是「此 App 的密码 / 密码」+ 钥匙图标，左下角有**地球图标**可切换第三方输入法；能长按粘贴、能正常打字。Key 仍显示为圆点，点右侧眼睛可看明文 |
| **键盘旁的填充色** | 输入框下沿与键盘之间、键盘两侧不再是黑色带，变成与状态栏一致的浅色 `#f9fafb` |
| **键盘弹起流畅度** | 输入框随键盘平滑升起，没有明显卡顿或抖动 |
| **16 Pro 圆角 / 边距** | 底部输入框不贴 Home Indicator、左右留白与屏幕物理圆角协调；设置页输入框与卡片圆角接近 iOS 风格（支持的 WebKit 上为连续圆角） |

> 这些改动在 WebView 资源与原生配置里，**必须重新构建并重装 IPA 才生效**；旧包不会自己变好。

### 为什么默认不开启 CapacitorHttp（保留原理）

0.2.2 的聊天主链路用 `response.body.getReader()` 做 SSE 逐字输出（`api-utils.js:363`），`cloud-backup.js:50` 也用了流；而 Capacitor 8 的 `CapacitorHttp` 原生响应只有 `data/status/headers/url`，不提供真正的流式响应。全局开启虽能绕开 CORS，但会把逐字输出缓冲成「等全部生成完一次性显示」，甚至让流解析报错。iOS 上页面 origin 是 `capacitor://localhost`，多数 OpenAI 兼容中转站返回 `Access-Control-Allow-Origin: *`，首轮已证实直连没问题。

**万一以后换的中转站确实被 CORS 挡住**，按顺序：① `plugins.CapacitorHttp.enabled` 改 `true`；② 重新 `npm run build && npx cap sync ios` 并重新编译 IPA；③ 接受逐字输出退化，按上面方法把诊断入口改回 `true` 复测。若该中转站是 `http://` 且开了原生 HTTP，`Info.plist` 的 `NSAllowsArbitraryLoadsInWebContent` 只豁免 WebView 内容，还需在 `NSAppTransportSecurity` 补 `NSAllowsArbitraryLoads = true`；默认（未开启）已配好 WebView 内容与局域网例外。

---

## 7. 几个技术决定，避免你踩回去

- **不 bundle 业务脚本**：0.2.1/0.2.2 用 `document.write` 按固定顺序拼 9 个 classic script，还带 `Date.now()` 缓存戳。改成 ES module 会破坏加载顺序，风险远大于收益，所以 `public/` 原样复制。构建时的 `can't be bundled without type="module"` 警告是**预期的**，不是错误。
- **`transformIndexHtml` 只注入原生桥脚本**：`capacitor-bridge.js` 只在构建产物里出现，源码三页不变；`npm run dev` 与 `vite build` 两条路径都验过，子页面会自动用 `../assets/js/`。不再改写 `<meta name="viewport">`、不再注入 CSS。
- **`theme.js` 有同源校验**：`location.origin` 在 `capacitor://localhost` 下通常是 `"null"`，源码里已有 `location.origin === 'null' ? '*' : ...` 兜底，理论上能通，但**这是真机最可能静默失效的地方**。如果小说页/工坊页主题或设置不同步，优先查这里。
- **iOS 没有 ESC 键、没有返回键**：原生桥做了「点弹窗遮罩背景 → 派发 Escape」兜底，复用页面原有 ESC 关闭逻辑。但下拉菜单类交互仍建议补可见关闭按钮（第 8 节）。
- **远程版本检测保持关闭**：沿用上一轮的 `UPDATE_CHECK_ENABLED = false`；`rphub-update-api` meta 保留给云备份共用，不要置空。
- **键盘用 `Keyboard.resize: "native"`，不要改回 `"body"`**：`native` 让整个 WKWebView 随键盘缩小，`100dvh` 与 `visualViewport` 跟着变，聊天页自带的 `--app-visual-height` / `--keyboard-inset` 就能算对，聊天、小说、设置、诊断四页的输入框自动避让。`body` 模式只缩 `body`、不改 viewport，而业务 CSS 用 `html,body,#app{height:var(--app-visual-height)!important;overflow:hidden}` 把高度锁死，resize 等于失效，键盘会直接盖住输入框。**两者不要叠加**：`native` 已处理布局，桥接里的 `--rphub-keyboard-height` 只是诊断信息，接进定位规则会让输入框多抬一个键盘高度。
- **不要给 `body` 加安全区 padding、不要注入 `viewport-fit=cover`**：`StatusBar.overlaysWebView: false` 时 WebView 本身就在安全区内。加了 `viewport-fit=cover` 会让 `env(safe-area-inset-top)` 变非零，配合 body padding 会把 `#app`（高度被 `!important` 锁成 `--app-visual-height`）整体下推一个状态栏高度、底部被 `overflow:hidden` 裁掉——首轮「页面偏下、顶部被切、底部贴边」就是这么来的。`check-dist.cjs` 现在会断言三页 viewport 与源码字节一致、且没有注入 body padding。

- **密钥字段在 iOS 上不能是 `type="password"`**：`SecretInput`（设置页 API Key）、Tavily Key、诊断页 Key 原本都渲染成密码框。WKWebView 会把它当作安全文本输入，强制启用「此 App 的密码」自动填充专用键盘，**禁用第三方键盘扩展**、粘贴也不顺手。原生桥把所有 `input[type=password]` 转成 `text`，加 `autocomplete/autocorrect/autocapitalize=off`，再用 `-webkit-text-security: disc` 做视觉打码；`MutationObserver` 跟踪 Vue 对 `:type` 的重绑定与眼睛按钮的 `aria-pressed`，保证「显示/隐藏」照常工作。业务脚本一行没改，浏览器里完全不触发（桥在 `isNativePlatform()` 为假时直接 return）。
- **键盘旁的黑色填充是 `UIWindow` 背景，不是网页背景**：`resize: "native"` 会缩小 WKWebView 的 frame，键盘顶沿到 WebView 底边之间露出的那段属于原生窗口，默认黑色。Capacitor Keyboard 插件的 `autoBackdropColor` 默认是 `off`；设成 `auto` 后，插件在 `keyboardWillShow` 时把 `UIWindow.backgroundColor` 涂成 `ios.backgroundColor`（`#f9fafb`），黑带就变成和状态栏一致的浅色。`style: "LIGHT"` 同时把键盘外观固定为浅色。**不要靠给 body 加背景色去遮它**，那层在 WebView 外面，CSS 够不着。
- **冻结 JS 写的视觉视口变量，消除键盘卡顿**：`native` 缩小 WebView 时 `visualViewport.resize` 每帧触发，`app.js` 的 `syncMobileVisualViewport` 又每帧重写 `--app-visual-height` / `--keyboard-inset` / `--chat-bg-height`，而业务 CSS 用这三个变量把 `html,body,#app` 高度锁成 `!important`——逐帧强制重排，就是输入框升起时卡顿/抖动的来源。原生桥在根元素上拦截这三个变量的 `setProperty` / `removeProperty`，布局完全交给 `100dvh` + 原生 frame 缩放；键盘活动期再加一个 `rphub-keyboard-active` 类，临时关掉 transition、animation 与模糊滤镜。这三个变量**不要重新接回去**，也不要把 `--rphub-keyboard-height` 接进定位规则。
- **圆角适配只动 composer 自己的 padding**：16 Pro 的物理圆角与 Home Indicator 靠 `.input-area-mobile` 的左右/底部 padding 与 `env(safe-area-inset-*)` 处理，主要容器用统一圆角，并在支持 `corner-shape: squircle`（连续圆角）的 WebKit 上渐进启用。**只改这个绝对定位浮层的内边距，不给 `html/body/#app` 加任何 padding**——后者正是上一轮造成整体下移的原因。

---

## 8. 还差什么才算「成熟」（按优先级）

1. ~~**真机跑通自检页**~~ —— 已完成（6 项全绿）；下面按优先级继续。
2. **导出/导入备份**：数据仍在 IndexedDB，清 WebView 数据或卸载即全丢；侧载又有 7 天重签风险，iOS 上比安卓更该先做。
3. **Key 挪进 Keychain**，别继续明文躺在 IndexedDB。
4. **合并三页为 SPA**：干掉跨 iframe `postMessage` 同步这一整类机型兼容问题。
5. **UI 补可见关闭按钮**（下拉菜单类仍缺）、内置字体子集去掉 Google Fonts 外链、替换默认图标；键盘、安全区、安全键盘、黑色填充与 16 Pro 圆角的基础问题已在本次修复。
6. **Tailwind 换预编译 CSS**：现在是运行时 JIT 版，每次冷启动现场扫 DOM，手机上就是白屏时间和耗电。
7. 需要时再做 SQLite、应用内更新提示、Android 端。

---

## 9. 验证记录（本工程在 Linux 沙箱内已跑）

| 项目 | 结果 |
| --- | --- |
| `npm test` 供应商路由单测 | 12/12 |
| Vite 构建 + `check-dist.cjs` 产物校验 | 通过（4 页 / 12 业务脚本 / 8 本地依赖） |
| 浏览器冒烟（挂载、设置页、模型选择器、供应商 2 个） | 13/13 |
| 完全断网（三页挂载、Tailwind JIT、图标内联） | 19/19 |
| 多 Key 分组交互 / 自定义供应商增删 | 10/10、8/8 |
| 更新检测关闭 + 云备份未受影响 | 7/7 |
| 原生桥与自检页（含浏览器 no-op、模拟原生、诊断入口） | 19/19 |
| `npx cap sync ios` 与 dist 一致性、scheme/plist 检查 | 通过 |
| Vite dev 与 build 两种注入路径 | 通过 |
| **本次 workflow 校验**：YAML 解析、10 个 `run` 步骤 `bash -n`、引用路径检查、`npm ci`（119 包 / 0 漏洞）、12 项单测、`npm run build` + 产物校验、bundle id 一致性预检、`cap sync` 一致性、IPA 打包与结构断言脚本本地模拟 | 全部通过 |
| **actionlint 静态校验**（GitHub 表达式上下文可用性） | 修复前精确复现 40/41/42 行 `runner` 上下文报错；修复后 0 错误。另加入 job 级 `env` 上下文可用性的回归检查 |
| **首轮真机自检**（用户提供截图）：环境 `capacitor://localhost`、`/models` 200 / 135 模型、非流式 200、SSE 11 分片、原生 HTTP 未接管 | 6 项全绿 |
| **本次布局修复**：`Keyboard.resize=native` 写入原生配置、移除 viewport 改写与 body padding、三页 viewport 与源码字节一致、`check-dist.cjs` 新增反向断言、诊断入口关闭、诊断页首片显示修正 | 15 条不变量断言 + 12 项单测 + 4 页产物校验 + actionlint 全部通过 |
| **本次键盘 / 密钥字段修复**：`Keyboard.autoBackdropColor=auto` + `style=LIGHT`、密钥字段通用转换、冻结视觉视口变量、键盘活动期性能规则、16 Pro 圆角与安全区 CSS 全部走原生桥 | 12 项单测 + 4 页产物校验 + 三处副本一致 + `cap sync` 同步 + actionlint 0 错误；**真实 Chromium 交互实跑 22/22**（密码→文本转换、眼睛显示/隐藏、Vue 重绑定回改、动态插入字段、变量冻结、键盘性能类、MutationObserver 10 次收敛无循环） |

**真机已验证**（首轮，用户提供设备与截图）：CI 归档产出未签名 IPA 并自签安装成功；`capacitor://localhost` 下 CORS 直连、非流式对话、SSE 流式（11 分片）、`CapacitorHttp` 未接管。

**仍待设备上确认**：本次修复的实际观感（黑色填充是否变浅、键盘是否流畅、安全键盘是否被普通键盘取代、16 Pro 圆角与边距）、跨 iframe 主题/设置同步、三页数据同步、重启持久化、7 天续签。Linux 沙箱没有 iOS 设备与 WKWebView，Chromium 只能验证 DOM/CSS 逻辑、验证不了原生 `UIWindow` 上色与真机键盘；第 6 节复验表与清单 L2 就是为此准备的。

---

## 10. 常见失败

| 现象 | 处理 |
| --- | --- |
| `xcodebuild: Scheme App is not currently configured` | 确认 `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` 已提交到仓库 |
| `缺少 package-lock.json` | 提交锁文件；`npm ci` 不接受缺锁的仓库 |
| `bundle id 不一致` | 只改了一处；按第 3 节同时改 `capacitor.config.json` 的 `appId` 与 `pbxproj` 两处 `PRODUCT_BUNDLE_IDENTIFIER` |
| `无效的工作流文件 / 无法识别的命名值：runner` | job 级 `env` 不支持 `runner` 上下文（只在步骤级可用）。已改为在步骤里用 GitHub 注入的 `$RUNNER_TEMP`；不要再把 `${{ runner.temp }}` 写回 job 级 `env` |
| SPM 解析失败 / 拉不到 `capacitor-swift-pm` | 检查 runner 网络；`npm ci` 必须成功（`Package.swift` 引用了 `node_modules/@capacitor/*`），且 `cap sync ios` 必须在解析之前 |
| Archive 报签名相关错误 | 确认 workflow 里 `CODE_SIGNING_ALLOWED=NO`、`CODE_SIGNING_REQUIRED=NO`、`DEVELOPMENT_TEAM=""` 都在；不要加回 provisioning 参数 |
| Archive 报 Xcode 版本过旧 | 手动触发时填 `xcode_path`，或换更新的 `runs-on` 镜像标签 |
| 装完白屏 | `webDir: dist` 与 `cap sync` 是否执行；看 workflow 里 `cap sync OK` 那一步 |
| 页面整体下移、顶部被裁、底部贴边 | 旧版注入的 `body` 安全区 padding 与 `--app-visual-height` 冲突；已移除，**重新构建 IPA 才生效**（第 7 节） |
| 键盘弹起挡住输入框、密钥没法粘贴 | 确认 `Keyboard.resize` 是 `native`；`body` 模式会被业务 CSS 的 `!important` 锁死而失效；也别再把键盘高度变量接进定位规则 |
| 输 API Key 弹出「此 App 的密码」安全键盘、切不了第三方输入法 | 装的是旧包，或原生桥没生效：确认 `data-rphub-native="true"` 在 `<html>` 上、输入框 `type` 已是 `text` 且带 `data-rphub-secure`；新版由桥自动转换，不改业务源码 |
| 键盘旁边仍有黑色填充带 | 确认 `capacitor.config.json` 的 `plugins.Keyboard.autoBackdropColor` 是 `auto` 且 `ios.backgroundColor` 为浅色；改完要 `cap sync ios` 并重新编译 IPA（这是原生层配置，网页 CSS 改不了） |
| 键盘弹起时输入框卡顿 / 抖动 | 确认原生桥里三个视觉视口变量仍被冻结、`rphub-keyboard-active` 类有加上；不要把这些变量重新接回 `app.js` |
| 输入密钥时明文直接显示（没有圆点） | 检查注入的 `#rphub-native-shell-css` 是否存在、`-webkit-text-security:disc` 规则是否命中；该效果只在 WKWebView/Chromium 生效 |
| 装完仍看到左下角「诊断」按钮 | 装的是旧包；新版 `SHOW_DIAGNOSTICS_ENTRY = false`，需重新构建 |
| App 里 API 报 CORS | 先跑诊断页；确需原生 HTTP 再按第 6 节开启 |
| 续签后数据没了 | bundle id 变了，改回原来的 |
