# CreatorStudio

CreatorStudio 是运行在本机浏览器里的创作 Agent。Pi 负责对话、工具调用和会话历史。CreatorStudio 提供素材、视频下载与导出、热点追踪和 X 监控，工具结果与媒体任务进度显示在对话里。

## 本地启动

安装 Node.js 22.19 或更新版本和 pnpm 10 后，从项目根目录启动开发服务。

```bash
pnpm dev
```

终端显示网页地址后，打开 [本地开发页面](http://127.0.0.1:8088)。Fastify API 默认运行在 3000 端口。

`pnpm dev` 和 `pnpm start` 会在启动前检查工作区依赖、FFmpeg、FFprobe、yt-dlp 和 X 监控的 Python 环境。缺失的系统工具由 Homebrew 或 WinGet 安装。X 监控会复用可用的 Python 3.10 或更新版本，并在数据目录的 `collections/x-monitor/python` 下准备依赖。准备失败时，终端会显示失败的步骤。

Windows 上可先运行 `.\scripts\init.cmd` 安装 Node.js、pnpm 和项目运行依赖，然后运行 `pnpm.cmd dev`。

从源码构建并通过同一个 Fastify 服务访问网页。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

打开 [CreatorStudio](http://127.0.0.1:3000)。

## 配置模型

1. 打开「设置 → 模型」，在本地模型或远程 API 中填写支持 OpenAI Chat Completions 的根地址和模型 ID。使用本地 Ollama 时，根地址可以填写 `http://127.0.0.1:11434/v1`。
2. 按服务要求填写 API Key，选择当前使用的模型并保存。使用远程代理时，在同一页填写 HTTP(S) 代理地址。
3. 点击「测试连接」。工具调用检查会实际跑一轮 Pi 流式调用。JSON 检查通过后，可以用此模型自动翻译和摘要热点。
4. 在对话中发送指令，例如「查询最近导入的三个视频素材」。

## 在对话里工作

| 能力 | 示例 |
| --- | --- |
| 素材 | 上传图片、音频或视频，发送「列出我上传的素材和视频时长」 |
| 下载 | 粘贴 B站、抖音或 YouTube 的可下载视频链接，发送「解析这个链接，列出画质」 |
| 导出 | 上传视频，发送「将前 10 秒裁成竖屏，静音，导出 MP4」 |
| 热点 | 发送「查询最近的 AI 热点，把第一条收藏为选题并附上原文链接」 |
| X | 录入登录账号后，发送「每 15 分钟监控 @用户名，补采最新 10 条」 |

下载和导出提交后会在对话中显示任务进度，导出完成后可播放或保存 MP4。停止本轮对话不会影响已提交的任务，下载任务可通过 Agent 单独停止。

在「设置 → 热点采集」可填写采集代理和微博 Cookie。微博登录态通过试采后启用。其余来源默认按五分钟间隔刷新。

项目启动时会准备 X 监控的 Python 环境。在「设置 → X 账号」可以使用自己的 X 浏览器 Cookie 或账号密码登录。Cookie 支持请求头或 JSON 格式，须包含 `auth_token` 和 `ct0`。X 监控在服务启动期间按目标间隔运行。

## 本地数据和环境变量

默认数据根目录为 `~/CreatorStudio`。

```text
~/CreatorStudio/
├── agent/sessions/       Pi 会话历史
├── collections/          热点库、X 监控库及登录会话
├── database/studio.db    素材、任务及模型设置
├── materials/            已入库的原始媒体
├── thumbnails/
└── exports/
```

在启动命令的同一个终端中设置环境变量。

| 变量 | 用途 |
| --- | --- |
| `CREATOR_STUDIO_DATA_DIR` | 选择数据根目录。例如 macOS 上用 `CREATOR_STUDIO_DATA_DIR="$PWD/data" pnpm dev` 从空目录启动 |
| `PORT` | 设置本机 API 端口，默认为 `3000` |
| `FFMPEG_BIN`、`FFPROBE_BIN`、`YT_DLP_BIN` | 指定媒体工具的可执行文件 |
| `YT_DLP_COOKIES_BROWSER` | 抖音下载需要登录态时，指定自己使用的浏览器，例如 `edge` |
| `X_MONITOR_PYTHON` | 指定 X Monitor 使用的 Python 解释器 |

备份时先停止服务，再复制整个数据根目录。模型密钥和采集登录态与其他本机数据一起备份。

## 开发参考

- [运行架构](docs/ARCHITECTURE.md)
- [本地 API](docs/API.md)
- `pnpm typecheck` 检查 TypeScript。
- `pnpm build` 构建网页、后端和 X 运行文件。
- `pnpm run doctor` 查看 Node.js、媒体工具和 X 监控环境的检查结果。
- `pnpm run setup` 准备运行环境，适合在启动服务前单独执行。
