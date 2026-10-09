# kage-rarefont — 古籍罕用字造字工作台

> A glyph design workbench for rare/obsolete CJK characters missing from Unicode,
> built on the Kage engine (Bezier-optimised C++ core, compiled to WebAssembly).

基于 [GlyphWiki](https://glyphwiki.org/) 的 Kage 字形体系，把 **kage-editor**（浏览器字形编辑器）与 **kage-cpp**（贝塞尔曲线优化版 C++ 引擎）集成为一体：编辑器画布直接由 C++/WASM 引擎以三次贝塞尔曲线渲染，搜字、部件取源、缩略图渲染全部由随仓库提供的 GlyphWiki dump 静态数据驱动，不访问任何外部服务器，并支持一键导出 1000×1000 SVG 矢量字形与 Kage 源数据。

本项目的主要用途：**为古籍整理、出土文献、方言用字等场景，制作 Unicode 尚未收录（或无合适字形来源）的罕用字**——通过 Kage 的部件引用机制拼装新字，导出矢量轮廓后接入字库生产流程。

## 功能特性

- **C++ 贝塞尔引擎渲染**：笔画轮廓为 Q/C 曲线而非折线近似；宋体（衬线、钩挑造型优化）与黑体实时切换
- **完整编辑器交互**：笔画/部件选择、控制点拖动、拉伸、复制粘贴、手写、undo/redo、框选、反色蒙版——全部保留 kage-editor 原有能力
- **SVG 导出**：工具栏一键导出，默认 1000×1000 像素（可选 500/2000），viewBox 保持 Kage 坐标系 `0 0 200 200`
- **Kage 数据导出**：「导出KAGE数据」按钮（或 Ctrl/⌘+S）下载当前字形的 Kage 源码 `<名字>.kage.txt`，可再导入 GlyphWiki 或其他 Kage 工具（原版编辑器的「编辑完毕」提交 GlyphWiki 功能已移除）
- **内置字形库**：GlyphWiki 官方 dump（约 214 万条记录）预处理后随仓库提供；按汉字/码位搜索（含版本变体与 related 关联字形）、名字前缀搜索（≥5 字符，如 `toki-00`）、部件引用按需取源，搜索结果缩略图由浏览器内 WASM 引擎即时渲染
- **纯静态、无外部依赖**：dump 预处理为分片静态文件（`kage-editor/public/glyph-data/`，已入库），编辑器只请求自身站点的文件，可部署到 Cloudflare Pages 等任意静态托管；WASM 加载失败时回退原 JS 引擎（折线渲染）

## 部署

编辑器是纯静态站点：构建产物 `kage-editor/build/`（前端约 1 MB + 字形数据约 230 MB / 8400 余个文件）放到任意静态托管即可，运行时只请求本站点的文件，不需要任何后端或外部服务。环境要求：Node.js ≥ 20（仅构建时需要），无需 C++ 工具链（WASM 产物已随仓库提供）。

### Cloudflare Pages（Git 集成，推荐）

在 Cloudflare 控制台 Workers & Pages → Create → Pages → 连接本 GitHub 仓库，构建设置：

| 设置 | 值 |
|---|---|
| Production branch | `main` |
| Root directory | `kage-editor` |
| Build command | `npm run build` |
| Build output directory | `build` |
| 环境变量 | `NODE_VERSION=20` |

之后每次推送 `main`（包括刷新字形数据）都会自动重新部署。

### Cloudflare Pages（直接上传）

```bash
cd kage-editor
npm ci
npm run build
npx wrangler pages deploy build --project-name <项目名>
```

### 其他静态托管

同样执行 `npm ci && npm run build`，把 `kage-editor/build/` 的全部内容上传到站点根目录即可。

注意：

- 需部署在**域名根路径**（`index.html` 以绝对路径 `/manifest.json` 引用 manifest；其他资源均为相对路径）；
- Cloudflare Pages 单站点上限 2 万个文件、单文件 25 MB，当前数据约 8400 个文件、单文件不超过 100 KB；
- 数据文件为 `.txt`/`.json` 文本，托管方开启 gzip/brotli 压缩可显著减少传输（Cloudflare 默认开启）。

### 本地开发 / 预览

```bash
cd kage-editor
npm install
npm run dev                         # 开发服务器（读取 public/glyph-data/）
npm run build && npm run preview    # 预览构建产物
```

### 使用方式

打开站点即可从空白开始造字（手写/笔画工具，或搜索部件拼合）。URL 参数（写在 `#` 之后，用 `&` 连接）：

| 参数 | 说明 |
|---|---|
| `name` | 字形名，作为初始搜索词和导出文件名，如 `#name=u6f22` |
| `data` | 初始 Kage 数据（URL 编码），如 `#data=99:0:0:0:0:200:200:u6f22` 以「漢」为部件开始编辑 |
| `lang` | 界面语言：`ja`（默认）/ `en` / `ko` / `zh-Hans` / `zh-Hant` |

成果导出：「导出SVG」下载矢量轮廓；「导出KAGE数据」（或 Ctrl/⌘+S）下载 Kage 源码文本。

### 刷新字形数据（不定期）

```bash
# 下载官方 dump（约 114 MB，解压后约 1.2 GB，不入库）
mkdir -p glyphwiki-dump && curl -L https://glyphwiki.org/dump.tar.gz | tar xz -C glyphwiki-dump
node --max-old-space-size=8000 tools/build-glyph-data.mjs   # 约 30 秒
git add kage-editor/public/glyph-data && git commit -m "glyph-data: GlyphWiki dump YYYY-MM-DD"
```

推送到 `main` 后，Cloudflare Pages（Git 集成）会自动以新数据重新部署。数据格式见 `tools/build-glyph-data.mjs` 头部注释。分块边界在刷新时保持稳定（沿用已有清单，仅拆分过大的块），只有内容变化的块会被改写，仓库增量较小。被引用的旧版本部件（如 `u963f@9`）从 `dump_all_versions.txt` 补入，按引用的确切版本渲染。dump 日期记录在 `glyph-data/meta.json`。

## 本地服务 kage-server.mjs（参考，编辑器已不再使用）

`kage-server.mjs` 是早期的本地 dump 服务（取源/搜索/SVG 缩略图接口，Node 版引擎在 `wasm-build/`），编辑器前端已不再对接它，保留作参考：`node kage-server.mjs --port 8788`（需 `glyphwiki-dump/`）。注意它对 `name@版本` 引用返回的是最新版而非该版本。

## 项目结构

```
├── kage-editor/                 # 编辑器（React + Vite + TS），集成改造见下
│   ├── wasm-glue/kage_glue.cpp  # Emscripten embind 绑定层（KageEngine 类）
│   ├── public/kage-wasm/        # 浏览器版引擎产物 kage.js/kage.wasm（构建时带入 build/）
│   └── src/
│       ├── kageCpp.ts           # WASM 加载、部件库同步、逐笔画分离渲染
│       ├── glyphData.ts         # 字形数据（读取 glyph-data/ 分片：取源、搜索）
│       ├── thumbnail.ts         # 浏览器内 WASM 渲染搜索缩略图
│       ├── svgExport.ts         # SVG 导出（默认 1000×1000）
│       ├── kage.ts              # 统一渲染出口（C++ 优先，JS 引擎兜底）
│       └── components/…         # Stroke/Glyph/EditorControls/PartsList 等适配改造
├── kage-cpp/                    # C++ 引擎（submodule → open-guji/kage-cpp：上游 + 逐笔画分离接口）
├── kage-server.mjs              # 早期本地 dump 服务（参考，编辑器已不使用）
├── tools/build-glyph-data.mjs   # dump → 静态分片数据（kage-editor/public/glyph-data/）
├── wasm-build/                  # Node 版引擎产物（kage-server 用，已入库免编译）
│   └── verify_node.js           # 回归验证：node wasm-build/verify_node.js
├── kage-editor/public/glyph-data/  # 预处理后的字形数据（生成文件，入库）
└── glyphwiki-dump/              # 官方 dump 原始数据（刷新数据时下载，已 gitignore）
```

### 重新编译 WASM（可选，修改 C++ 后执行）

C++ 引擎源码以 git submodule 形式位于 `kage-cpp/`，指向 [open-guji/kage-cpp](https://github.com/open-guji/kage-cpp)。它 fork 自上游 [takushun-wu/kage-cpp](https://github.com/takushun-wu/kage-cpp)，在上游 `6043d9a` 之上只加了一个提交：逐笔画分离渲染接口（`KageFont::DrawGlyphSeparated`、`Kage::MakeGlyphSeparatedOut`，供胶水层做笔画选择/拖动），来自 UltraBriefnessCinema (mahiro) 的 patch，未改动原有算法。

取得源码：`git clone --recurse-submodules <本仓库>`；已 clone 的仓库执行 `git submodule update --init`。

编译需要 [emsdk](https://github.com/emscripten-core/emsdk)。仓库中的 WASM 产物用 emsdk 4.0.22 编译（`./emsdk install 4.0.22 && ./emsdk activate 4.0.22`）：

```bash
source /path/to/emsdk/emsdk_env.sh

# 浏览器版（编辑器渲染）
em++ -std=c++17 -O2 -fexceptions \
  -I kage-cpp/include -I kage-cpp/include_ext \
  kage-editor/wasm-glue/kage_glue.cpp kage-cpp/src/*.cpp \
  -lembind -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 \
  -s EXPORT_NAME=createKageModule -s ENVIRONMENT=web,worker \
  -o kage-editor/public/kage-wasm/kage.js

# Node 版（仅供 kage-server.mjs 参考实现使用）
em++ -std=c++17 -O2 -fexceptions \
  -I kage-cpp/include -I kage-cpp/include_ext \
  kage-editor/wasm-glue/kage_glue.cpp kage-cpp/src/*.cpp \
  -lembind -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 \
  -s EXPORT_NAME=createKageModule -s ENVIRONMENT=node \
  -o wasm-build/kage-node.js

# 回归验证
node wasm-build/verify_node.js
```

## 上游作者与出处

本项目是以下开源工作的集成衍生品，谨此致谢：

| 组件 | 作者 | 仓库 | 许可 |
|---|---|---|---|
| kage-editor（字形编辑器） | kurgm | <https://github.com/kurgm/kage-editor> | GPL-3.0-only |
| kage-cpp（贝塞尔优化 C++ 引擎） | Takushun Wu (takushun-wu) | <https://github.com/takushun-wu/kage-cpp> | GPL-3.0 |
| kage-cpp 逐笔画分离接口 patch | mahiro (UltraBriefnessCinema) | <https://github.com/open-guji/kage-cpp> | GPL-3.0 |
| Kage 引擎原版（JavaScript） | 上地宏一 Kamichi Koichi | <https://github.com/kamichikoichi/kage-engine> | GPL |
| ge9 改版 Kage 引擎 | ge9 | <https://github.com/ge9/kage-engine-2> | GPL |
| kage-engine npm 包（编辑器内置 JS 引擎） | kurgm | <https://www.npmjs.com/package/@kurgm/kage-engine> | GPL-3.0-only |
| 曲线拟合算法 FitCurves | Graphics Gems（Andrew Woo） | <https://github.com/erich666/GraphicsGems/blob/master/gems/FitCurves.c> | 见该仓库说明 |
| GlyphWiki 字形数据库与 dump 数据 | GlyphWiki Project | <https://glyphwiki.org/> | 见下文 |
| utfcpp（kage-cpp 捆绑第三方库） | nemtrif | <https://github.com/nemtrif/utfcpp> | BSL-1.0 |

## 许可协议

### 代码 —— GPL-3.0-only

本仓库全部原创代码（胶水层、集成改造、数据预处理脚本、kage-server）及 kage-editor、kage-cpp（`kage-cpp/` submodule 及其编译产物）均遵循 **GNU GPL v3**（完整文本见根目录 `LICENSE` 与 `kage-editor/COPYING`）。由于上游为 GPL v3，对外分发本项目的修改版或衍生品时：

1. 必须一并公开源代码；
2. 只能以 GPL v3（或兼容的更高版本）发布——即 GPL 的传染性；
3. 允许商业使用，无额外限制。

### GlyphWiki dump 数据 —— 宽松许可（非 GPL）

`dump.tar.gz` 内自带的许可声明（`LICENSE.txt`，Copyright 2009 GlyphWiki Project）允许**自由使用、复制、修改与再分发（含商业使用），不提供任何担保**。该数据许可独立于代码的 GPL，不改变代码部分的许可义务。随仓库分发的预处理数据附带该许可：`kage-editor/public/glyph-data/GLYPHWIKI-LICENSE.txt`。

### 生成的字形 —— 不受 GPL 约束

依据 [GlyphWiki 版权与许可协议](https://zhs.glyphwiki.org/wiki/GlyphWiki:%E8%91%97%E4%BD%9C%E6%9D%83%E4%B8%8E%E8%AE%B8%E5%8F%AF%E5%8D%8F%E8%AE%AE)，**基于 GlyphWiki/Kage 数据生成的字形（含本项目导出的 SVG）不受 GPL 协议约束**，可自由用于字库与出版物。

## 造字工作流建议（古籍罕用字）

1. 搜索现有部件（支持按汉字码位、按名称前缀，如 `toki-`、`jm-`、`akr-` 等文献来源编号）；
2. 用部件引用（`99:` 笔画）拼装新字，调整拉伸参数适配字形框；
3. 缺失部件可直接手绘补制；
4. 导出 1000×1000 SVG 矢量轮廓，并「导出KAGE数据」保存可再编辑的 Kage 源码（可通过 `#data=` 参数重新打开，或提交到 GlyphWiki）；
5. 导入 [FontForge](https://fontforge.org/)（引擎亦支持 SFD 输出）或字库生产工具链，注册至 Unicode 私用区（PUA）或配合 IVS 扩展序列方案。
