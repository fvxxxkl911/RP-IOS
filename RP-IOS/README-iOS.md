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
| iOS 适配全部构建期注入 | `viewport-fit=cover`、安全区 CSS、原生桥脚本由 `vite.config.js` 注入，浏览器里是严格 no-op |
| Capacitor 8 iOS 原生工程 | `ios/`（Swift Package Manager，无 CocoaPods）、4 个官方插件（App / Keyboard / StatusBar / SplashScreen） |
| 补齐 shared scheme | 官方模板没生成 `App.xcscheme`，已补，否则 CI 的 `xcodebuild -scheme App` 会失败 |
| 未签名 IPA 云编译 | `.github/workflows/build-unsigned-ipa.yml`（最终可直接运行版：配置预检 → 构建校验 → 无签名 Archive → IPA 结构校验 → 带运行号的 artifact → 构建摘要），零配置、无需证书 |
| 真机连通性自检页 | `diagnostics.html`，验证 CORS、流式 SSE、原生 HTTP 三件事 |
| 版本号 | `MARKETING_VERSION = 0.2.2`，页面 title/公告沿用 0.2.2 |

**没做**（属于后续步骤，见第 8 节）

- 没有 macOS/Xcode，**workflow 没在真实 macOS runner 上跑过**，最终 Archive 需你 push 后验证；
- 没有真机，WKWebView 的 CORS / 流式 / 跨 iframe 消息**未经设备实测**，诊断页就是为此准备的；
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

## 6. 装完先做真机自检（重要）

App 左下角有一个低调的「**诊断**」按钮（**只在真机容器里出现，浏览器里完全不显示**），点开 `diagnostics.html`，填 API 地址和 Key（**用完即弃，不写入任何存储**），点「运行全部测试」：

| 测试 | 看什么 |
| --- | --- |
| ① `/models` | 中转站能否直连。若失败且报 CORS / 网络错误 → 看下面「开启原生 HTTP」 |
| ② 非流式对话 | 基本请求链路是否正常 |
| ③ 流式对话 SSE | **关键**：看「分片数」。>1 且首片明显早于总耗时 = 逐字流式正常；仅 1 片且几乎同时返回 = 输出被缓冲，逐字效果丢失 |
| ④ 原生 HTTP 状态 | 显示当前 `CapacitorHttp` 是否接管了 fetch |

**为什么默认不开启 CapacitorHttp**：0.2.2 的聊天主链路用 `response.body.getReader()` 做 SSE 逐字输出（`api-utils.js:363`），`cloud-backup.js:50` 也用了流；而 Capacitor 8 的 `CapacitorHttp` 原生响应只有 `data/status/headers/url`，不提供真正的流式响应。全局开启虽然能绕开 CORS，但会把逐字输出缓冲成「等全部生成完一次性显示」，甚至让流解析报错。所以骨架默认 `enabled: false`，保住 WebView 原生 fetch 与流式。

iOS 上页面 origin 是 `capacitor://localhost`（Origin 通常为 `null`），多数 OpenAI 兼容中转站返回 `Access-Control-Allow-Origin: *`，**大概率本来就直连得上**——这正是自检页要验证的，不要提前开原生 HTTP。

**如果 ①③ 确实被 CORS 挡住**，再按这个顺序：

1. `capacitor.config.json` → `plugins.CapacitorHttp.enabled` 改 `true`；
2. 重新 `npm run build && npx cap sync ios`，重新编译 IPA；
3. 接受「逐字输出退化为一次性显示」，用诊断页复测确认没有报错。

> 另一个坑：若填了 `http://` 的自定义中转站，且**开启**了 CapacitorHttp，请求走原生层，`Info.plist` 里现有的 `NSAllowsArbitraryLoadsInWebContent` 只豁免 WebView 内容，需要在 `NSAppTransportSecurity` 里补 `NSAllowsArbitraryLoads = true`。默认（未开启原生 HTTP）已配好 WebView 内容与局域网例外，够用。

---

## 7. 几个技术决定，避免你踩回去

- **不 bundle 业务脚本**：0.2.1/0.2.2 用 `document.write` 按固定顺序拼 9 个 classic script，还带 `Date.now()` 缓存戳。改成 ES module 会破坏加载顺序，风险远大于收益，所以 `public/` 原样复制。构建时的 `can't be bundled without type="module"` 警告是**预期的**，不是错误。
- **`transformIndexHtml` 注入**：iOS 相关的 meta/style/script 只在构建产物里出现，源码三页不变；`npm run dev` 与 `vite build` 两条路径都验过，子页面会自动用 `../assets/js/`。
- **`theme.js` 有同源校验**：`location.origin` 在 `capacitor://localhost` 下通常是 `"null"`，源码里已有 `location.origin === 'null' ? '*' : ...` 兜底，理论上能通，但**这是真机最可能静默失效的地方**。如果小说页/工坊页主题或设置不同步，优先查这里。
- **iOS 没有 ESC 键、没有返回键**：原生桥做了「点弹窗遮罩背景 → 派发 Escape」兜底，复用页面原有 ESC 关闭逻辑。但下拉菜单类交互仍建议补可见关闭按钮（第 8 节）。
- **远程版本检测保持关闭**：沿用上一轮的 `UPDATE_CHECK_ENABLED = false`；`rphub-update-api` meta 保留给云备份共用，不要置空。

---

## 8. 还差什么才算「成熟」（按优先级）

1. **真机跑通自检页** —— 在此之前下面所有投入都是假设。
2. **导出/导入备份**：数据仍在 IndexedDB，清 WebView 数据或卸载即全丢；侧载又有 7 天重签风险，iOS 上比安卓更该先做。
3. **Key 挪进 Keychain**，别继续明文躺在 IndexedDB。
4. **合并三页为 SPA**：干掉跨 iframe `postMessage` 同步这一整类机型兼容问题。
5. **UI 补可见关闭按钮**、状态栏/键盘/安全区细节打磨、内置字体子集去掉 Google Fonts 外链、替换默认图标。
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

**没验证的**：真实 macOS 上的 `xcodebuild -resolvePackageDependencies` 与 `xcodebuild archive`、真机 WKWebView 的 CORS/流式/postMessage、实际签名安装。这几项只能在你那边跑，诊断页和 workflow 的日志就是为此准备的。

---

## 10. 常见失败

| 现象 | 处理 |
| --- | --- |
| `xcodebuild: Scheme App is not currently configured` | 确认 `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` 已提交到仓库 |
| `缺少 package-lock.json` | 提交锁文件；`npm ci` 不接受缺锁的仓库 |
| `bundle id 不一致` | 只改了一处；按第 3 节同时改 `capacitor.config.json` 的 `appId` 与 `pbxproj` 两处 `PRODUCT_BUNDLE_IDENTIFIER` |
| SPM 解析失败 / 拉不到 `capacitor-swift-pm` | 检查 runner 网络；`npm ci` 必须成功（`Package.swift` 引用了 `node_modules/@capacitor/*`），且 `cap sync ios` 必须在解析之前 |
| Archive 报签名相关错误 | 确认 workflow 里 `CODE_SIGNING_ALLOWED=NO`、`CODE_SIGNING_REQUIRED=NO`、`DEVELOPMENT_TEAM=""` 都在；不要加回 provisioning 参数 |
| Archive 报 Xcode 版本过旧 | 手动触发时填 `xcode_path`，或换更新的 `runs-on` 镜像标签 |
| 装完白屏 | `webDir: dist` 与 `cap sync` 是否执行；看 workflow 里 `cap sync OK` 那一步 |
| App 里 API 报 CORS | 先跑诊断页；确需原生 HTTP 再按第 6 节开启 |
| 续签后数据没了 | bundle id 变了，改回原来的 |
