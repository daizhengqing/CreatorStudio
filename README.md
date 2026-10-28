# Media Studio

一个**仅供个人本机使用**的媒体素材与视频剪辑工作台。

- 浏览器访问，但采用前后端分离，不使用 Electron。
- UI：**顶部 Toolbar + 自由多窗口工作区**。窗口可移动、改变大小、关闭、重新打开；自动保存布局。
- 本地素材库：视频 / 音频 / 图片导入、预览与检索。
- 支持通过 yt-dlp 下载授权使用的 B站 / 抖音 / YouTube 视频。
- 使用 FFmpeg 裁剪单个视频片段、转换画幅、静音原声、合成 BGM 并导出 MP4。
- 没有注册、登录、云端部署、团队协作、AI / ComfyUI。

> **状态：v0.1.0 开发脚手架。** 这是一个可扩展的起点，**不是完整的第一阶段成品**。当前编辑器只支持单片段的时间范围裁剪和基础导出；多片段拖拽剪辑、切割、非线性时间轴、波形精准预览、完整撤销重做等在后续里程碑实现。详见 [实施计划](docs/PHASE1_PLAN.md)。

## 快速开始

需要：Node.js 22+、pnpm 10+；导出需要 `ffmpeg`/`ffprobe`，跨平台下载需要 `yt-dlp`。

macOS 示例：

```bash
brew install ffmpeg yt-dlp
npm install -g pnpm@10.9.0
pnpm install
pnpm dev
```

Windows PowerShell 一键初始化（推荐 Node.js 22 LTS）：

```powershell
.\scripts\init.cmd
# 关闭并重开 PowerShell 后：
pnpm.cmd dev
```

初始化脚本检查 Node.js、npm、pnpm、FFmpeg、FFprobe、yt-dlp，并通过 winget / npm 安装缺失项，最后按锁文件安装项目依赖。它会将 `yt-dlp.exe` 放入项目的 `.tools` 目录，服务优先从此处启动，避免新安装后 PATH 未刷新的问题。PowerShell 如果禁止运行 npm 生成的 `.ps1` 命令，请使用 `pnpm.cmd`。安装后重开终端，使 pnpm 等命令的 PATH 生效。下载窗口可以粘贴视频链接或完整分享文案；先解析标题、封面和画质，再选择分辨率开始下载。下载中可停止，已结束的任务可删除记录（素材文件保留）。

部分抖音视频需要浏览器的最新 cookies。先在浏览器中打开视频，然后在**启动服务的同一个 PowerShell 窗口**设置浏览器名称，例如：

```powershell
$env:YT_DLP_COOKIES_BROWSER = 'edge'  # 也可用 chrome、firefox
pnpm.cmd dev
```

只有下载抖音视频时才会让 yt-dlp 读取所选浏览器的 cookies；项目不会保存 cookies。该设置不保证绕过平台对特定视频的限制。

- Web 前端：**http://127.0.0.1:8088**
- Fastify API：**http://127.0.0.1:3000**
- 健康检查：`http://127.0.0.1:3000/api/health`

两端都只绑定到 `127.0.0.1`，默认不面向局域网或公网开放。

### 构建后单端口使用

```bash
pnpm build
pnpm start
```

浏览器访问 `http://127.0.0.1:3000`。执行 `pnpm dev` 时前后端分开运行并通过 Vite 代理 API。

### 数据存储

默认目录 `~/MediaStudio`：

```text
~/MediaStudio/
├── database/studio.db      # SQLite；WAL 模式
├── materials/
│   ├── videos/
│   ├── audio/
│   └── images/
├── thumbnails/
├── exports/
├── temp/
├── plugins/               # 安装的第三方插件
├── plugin-data/           # 按插件命名空间保存的数据
└── projects/
```

可设置 `MEDIA_STUDIO_DATA_DIR` 环境变量更改根目录。代码仓库和媒体数据相互独立；不要把下载的视频提交到 Git。**备份时应备份整个 MediaStudio 目录（SQLite 使用 WAL 时先停止服务再复制）。**

`apps/server` 启动时创建 v0.1 所需的 SQLite 表。未来增加或修改数据库字段时应先引入版本化迁移，不要直接依赖 `CREATE TABLE IF NOT EXISTS`。

## 目前能做什么

| 功能 | 状态 |
| --- | --- |
| 顶部工具栏 / 打开与关闭窗口 | ✅ 已实现 |
| 多窗口拖动、缩放、层级、布局保存在当前浏览器 | ✅ 已实现 |
| 本地视频、图片、音频导入 / 展示 / 基本检索 | ✅ 已实现 |
| B站、抖音、YouTube 通过 yt-dlp 下载到本地素材库 | ✅ 支持解析预览、分辨率选择、停止下载与删除任务记录；具体站点受平台规则、权限及 yt-dlp 状态影响 |
| 任务进度与 SQLite 持久化 | ✅ 基础实现；中断的任务会标记失败，需要重新创建 |
| 原视频预览、单片段入点/出点裁剪 | ✅ 基础实现 |
| 16:9、9:16、1:1 画幅导出 / 原声静音 / BGM 合成 | ✅ 基础实现，预览不混音 |
| 视频拆分、多片段非线性剪辑、轨道拖拽 | ⏳ 待开发 |
| 项目持久化（时间轴文档）、历史版本/撤销重做 | ⏳ 待开发 |
| 精确画幅平移、缩放、裁剪位置控制 | ⏳ 待开发 |
| 可暂停/续传的任务与批量链接下载 | ⏳ 待开发 |
| AI / ComfyUI | ❌ 第一阶段不做 |

## 技术栈

- **前端**：React 19、TypeScript、Vite 6、Tailwind CSS 4、shadcn/ui（Neutral）、Zustand、TanStack Query、react-rnd。
- **后端**：Node.js、Fastify、SQLite、Drizzle ORM、FFmpeg/FFprobe、yt-dlp。
- **基础设施**：pnpm workspace、SQLite、本地文件系统；不需要数据库服务、Docker、Redis。

目前已包含 shadcn/ui 兼容的 `Button`、`Input` 组件及 `components.json` 配置。后续直接在 `apps/web` 使用 shadcn CLI 增加需要的 UI 组件；无需另行创建自定义设计系统。

## monorepo

```text
creator-studio/
├── apps/
│   ├── web/                 # React 页面和多窗口工作区
│   └── server/              # Fastify 路由、SQLite、yt-dlp、FFmpeg
├── packages/plugin-sdk/    # 可独立分发的插件契约和媒体类型
├── packages/ui/            # 宿主与内置插件的共享 UI 源码
├── plugins/builtin/        # 五类独立构建的内置窗口插件
├── examples/asset-notes/   # 原生 DOM + Node.js 完整插件示例
├── docs/                   # 第一阶段实施计划 / 架构 / API
├── scripts/
├── AGENTS.md               # Codex 等代码代理开发规范
├── package.json
└── pnpm-workspace.yaml
```

## 设计约束

1. UI 是**工具**而非 SaaS 平台：无左侧固定运营导航、无头像、无统计仪表盘、无用户体系。
2. 顶部 Header 是工具栏；其余区域都是可移动、可缩放、可重叠的窗口工作台。
3. 所有媒体均本地保存；数据库只管理元数据和任务，不存视频二进制。
4. 服务只监听回环地址；不允许任意 URL 下载（现仅允许指定三类平台 HTTPS URL）。
5. 视频修改应采用**非破坏性编辑**；仅在导出时调用 FFmpeg 编码。
6. 在补齐时间轴多轨功能前，不要宣称编辑器已具备完整的非线性剪辑能力。

## 常见问题

- **安装 `better-sqlite3` 失败**：它是原生扩展；请确保 Node 使用常见受支持的版本，必要时安装本机编译工具并重装依赖。
- **下载报未找到 `yt-dlp`**：Windows 重新运行 `.\scripts\init.cmd` 并重启服务；也可设置 `YT_DLP_BIN` 为可执行文件的完整路径。
- **抖音提示需要新鲜 cookies**：按上面的方式设置 `YT_DLP_COOKIES_BROWSER`，在对应浏览器打开并刷新视频，然后重试；仍失败可能是平台或 yt-dlp 解析限制。
- **导出报 `spawn ffmpeg ENOENT`**：安装 FFmpeg 并加入 PATH，或设置 `FFMPEG_BIN`。
- **视频封面未生成**：检查 FFmpeg 是否安装，以及视频格式是否受支持；封面是异步生成的。
- **素材文件很大**：当前 Web 上传暂限制单文件 4 GB，后续需要增加直接索引本地文件的能力，避免重复拷贝。
- **下载某个平台失败**：更新 `yt-dlp`；平台的反爬策略、版权限制、认证需求和地域限制可能导致失败。仅下载你有权获取和使用的内容。

## 插件扩展

工作台采用可信插件模型，前端通过统一 SDK 接入，后端可注册自己的业务接口。现有五类窗口也作为独立插件加载。插件放入数据目录的 `plugins/<pluginId>` 后重启生效，安装插件无需重新构建宿主。

从 [插件开发与安装指南](docs/PLUGINS.md) 开始；`examples/asset-notes` 演示独立构建、窗口通信、后端方法、存储及事件同步。`pnpm dev` 和 `pnpm build` 会先构建 SDK 和内置插件。

## 开发文档

- [确认过的多窗口工作区原型](docs/workspace-prototype.png)
- [第一阶段实施计划](docs/PHASE1_PLAN.md)
- [技术架构](docs/ARCHITECTURE.md)
- [插件开发与安装](docs/PLUGINS.md)
- [API 说明](docs/API.md)
- [代码代理规则](AGENTS.md)
