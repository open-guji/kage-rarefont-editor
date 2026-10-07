# kage-rarefont — 古籍罕用字造字工作台

> A glyph design workbench for rare/obsolete CJK characters missing from Unicode,
> built on the Kage engine (Bezier-optimised C++ core, compiled to WebAssembly).

基于 [GlyphWiki](https://glyphwiki.org/) 的 Kage 字形体系，把 **kage-editor**（浏览器字形编辑器）与 **kage-cpp**（贝塞尔曲线优化版 C++ 引擎）集成为一体：编辑器画布直接由 C++/WASM 引擎以三次贝塞尔曲线渲染，搜字、部件取源、缩略图渲染全部由本地 GlyphWiki dump 数据驱动，离线可用，并支持一键导出 1000×1000 SVG 矢量字形。

本项目的主要用途：**为古籍整理、出土文献、方言用字等场景，制作 Unicode 尚未收录（或无合适字形来源）的罕用字**——通过 Kage 的部件引用机制拼装新字，导出矢量轮廓后接入字库生产流程。

## 功能特性

- **C++ 贝塞尔引擎渲染**：笔画轮廓为 Q/C 曲线而非折线近似；宋体（衬线、钩挑造型优化）与黑体实时切换
- **完整编辑器交互**：笔画/部件选择、控制点拖动、拉伸、复制粘贴、手写、undo/redo、框选、反色蒙版——全部保留 kage-editor 原有能力
- **SVG 导出**：工具栏一键导出，默认 1000×1000 像素（可选 500/2000），viewBox 保持 Kage 坐标系 `0 0 200 200`
- **本地字形库**：加载官方 dump（约 214 万条记录），汉字按码位搜索（含版本变体与 related 关联字形）、部件引用实时取源、搜索结果缩略图由 WASM 引擎即时渲染
- **离线可用**：不启动本地服务时回退 GlyphWiki 在线后端；WASM 加载失败时回退原 JS 引擎（折线渲染）

## 快速部署

环境要求：Node.js ≥ 20（前端构建与服务运行），无需 C++ 工具链（WASM 产物已随仓库提供）。

```bash
# 1. 构建编辑器（需要 Node.js ≥ 20）
cd kage-editor
npm install
npm run build      # 引擎产物 public/kage-wasm/ 会自动带入 build/
cd ..

# 2. 获取 GlyphWiki 官方 dump（约 114 MB，压缩包内含许可与说明；
#    解压后数据约 1.2 GB，超过 GitHub 单文件限制，不随仓库分发，需自行下载）
mkdir -p glyphwiki-dump && cd glyphwiki-dump
curl -L -o dump.tar.gz https://glyphwiki.org/dump.tar.gz
tar xzf dump.tar.gz            # 解出 dump_newest_only.txt 等
cd ..

# 3. 启动本地服务（加载约 214 万字形约 8 秒；node 版引擎产物已在 wasm-build/ 中）
node kage-server.mjs --port 8788

# 4. 浏览器打开（host 参数将编辑器后端指向本地服务）
open "http://localhost:8788/#host=localhost:8788"
```

编辑已有字形示例（"漢"）：`http://localhost:8788/#name=u6f22&host=localhost:8788`
从空白开始造字：直接打开 `http://localhost:8788/#host=localhost:8788`，用手写/笔画工具创作，或搜索部件拼合。

## 项目结构

```
├── kage-editor/                 # 编辑器（React + Vite + TS），集成改造见下
│   ├── wasm-glue/kage_glue.cpp  # Emscripten embind 绑定层（KageEngine 类）
│   ├── public/kage-wasm/        # 浏览器版引擎产物 kage.js/kage.wasm（构建时带入 build/）
│   └── src/
│       ├── kageCpp.ts           # WASM 加载、部件库同步、逐笔画分离渲染
│       ├── svgExport.ts         # SVG 导出（默认 1000×1000）
│       ├── kage.ts              # 统一渲染出口（C++ 优先，JS 引擎兜底）
│       └── components/…         # Stroke/Glyph/EditorControls/PartsList 等适配改造
├── kage-cpp/                    # C++ 引擎上游源码 + 最小扩展（逐笔画分离接口，未改动原算法）
├── kage-server.mjs              # 本地字形数据服务（dump 搜索/取源/SVG 缩略图/静态站点）
├── wasm-build/                  # Node 版引擎产物（服务器渲染缩略图用，已入库免编译）
│   └── verify_node.js           # 回归验证：node wasm-build/verify_node.js
└── glyphwiki-dump/              # 官方 dump 数据（自行下载，不入版本库）
```

### 重新编译 WASM（可选，修改 C++ 后执行）

需要 [emsdk](https://github.com/emscripten-core/emsdk)（本项目使用 6.0.11；请先 `git clone` 并 `./emsdk install latest && ./emsdk activate latest`）：

```bash
source /path/to/emsdk/emsdk_env.sh

# 浏览器版（编辑器渲染）
em++ -std=c++17 -O2 -fexceptions \
  -I kage-cpp/include -I kage-cpp/include_ext \
  kage-editor/wasm-glue/kage_glue.cpp kage-cpp/src/*.cpp \
  -lembind -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 \
  -s EXPORT_NAME=createKageModule -s ENVIRONMENT=web,worker \
  -o kage-editor/public/kage-wasm/kage.js

# Node 版（本地服务缩略图渲染，供 kage-server.mjs 使用）
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
| Kage 引擎原版（JavaScript） | 上地宏一 Kamichi Koichi | <https://github.com/kamichikoichi/kage-engine> | GPL |
| ge9 改版 Kage 引擎 | ge9 | <https://github.com/ge9/kage-engine-2> | GPL |
| kage-engine npm 包（编辑器内置 JS 引擎） | kurgm | <https://www.npmjs.com/package/@kurgm/kage-engine> | GPL-3.0-only |
| 曲线拟合算法 FitCurves | Graphics Gems（Andrew Woo） | <https://github.com/erich666/GraphicsGems/blob/master/gems/FitCurves.c> | 见该仓库说明 |
| GlyphWiki 字形数据库与 dump 数据 | GlyphWiki Project | <https://glyphwiki.org/> | 见下文 |
| utfcpp（kage-cpp 捆绑第三方库） | nemtrif | <https://github.com/nemtrif/utfcpp> | BSL-1.0 |

## 许可协议

### 代码 —— GPL-3.0-only

本仓库全部原创代码（胶水层、集成改造、kage-server）及 kage-editor、kage-cpp 源码均遵循 **GNU GPL v3**（完整文本见 `kage-editor-master/COPYING` 与 `kage-cpp-main/LICENSE`）。由于上游为 GPL v3，对外分发本项目的修改版或衍生品时：

1. 必须一并公开源代码；
2. 只能以 GPL v3（或兼容的更高版本）发布——即 GPL 的传染性；
3. 允许商业使用，无额外限制。

### GlyphWiki dump 数据 —— 宽松许可（非 GPL）

`dump.tar.gz` 内自带的许可声明（`LICENSE.txt`，Copyright 2009 GlyphWiki Project）允许**自由使用、复制、修改与再分发（含商业使用），不提供任何担保**。该数据许可独立于代码的 GPL，不改变代码部分的许可义务。

### 生成的字形 —— 不受 GPL 约束

依据 [GlyphWiki 版权与许可协议](https://zhs.glyphwiki.org/wiki/GlyphWiki:%E8%91%97%E4%BD%9C%E6%9D%83%E4%B8%8E%E8%AE%B8%E5%8F%AF%E5%8D%8F%E8%AE%AE)，**基于 GlyphWiki/Kage 数据生成的字形（含本项目导出的 SVG）不受 GPL 协议约束**，可自由用于字库与出版物。

## 造字工作流建议（古籍罕用字）

1. 搜索现有部件（支持按汉字码位、按名称前缀，如 `toki-`、`jm-`、`akr-` 等文献来源编号）；
2. 用部件引用（`99:` 笔画）拼装新字，调整拉伸参数适配字形框；
3. 缺失部件可直接手绘补制；
4. 导出 1000×1000 SVG 矢量轮廓；
5. 导入 [FontForge](https://fontforge.org/)（引擎亦支持 SFD 输出）或字库生产工具链，注册至 Unicode 私用区（PUA）或配合 IVS 扩展序列方案。
