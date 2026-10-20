# 架构与关键设计

## 进程

```text
Browser / React + shadcn/ui + Zustand
                 |
          HTTP + EventSource
                 |
       127.0.0.1:3000 Fastify
                 |
    +------------+-------------+
    |                          |
SQLite (Drizzle)        本地后台任务队列
    |                     |          |
  Metadata             yt-dlp     FFmpeg
    |                     |          |
    +--------------------+----------+
                         |
                 ~/MediaStudio/*
```

- 开发期 Vite `127.0.0.1:5173` 代理 `/api` 到 Fastify。
- 构建后 Fastify 托管静态 Web，访问端口 3000。
- 默认无认证，仅绑定回环地址；**绝不直接改成监听 `0.0.0.0` 提供公网服务**。
- `EventSource('/api/events')` 通知前端刷新相应查询。断线会自动重连。
- 当前任务队列在本进程内串行执行，SQLite 记录持久化状态；进程重启后未完成任务标记失败。

## 窗口系统

- `WindowRecord`：窗口 type/id/x/y/width/height/z/minimized。
- `Zustand persist`：浏览器 `localStorage` 保存当前窗口布局（并非数据库中的剪辑项目）。
- `react-rnd`：拖拽/缩放，`bounds="parent"` 保持窗口在工作区内。
- 应独立维护「窗口状态」「素材状态」「剪辑项目状态」，不要把时间轴片段放进窗口布局对象。

## 媒体资源

- SQLite `assets` 保存素材元数据及自动生成的安全文件名。
- 服务器路由以 Asset ID 查找对应文件，不接受任意用户传入的路径。
- 视频预览支持 Range 请求。
- 缩略图初版使用 FFmpeg 异步生成。
- 注意浏览器对 MOV/MKV/部分视频编码兼容有限，后续需要代理转码并保留源文件。

## 下载隔离

- 分享文案先提取 URL，`platformFromUrl` 仅允许受支持的平台 HTTPS URL；任务只保存校验后的链接。
- `spawn(yt-dlp, args, { shell: false })` 防止 shell 注入。
- 抖音下载可通过 `YT_DLP_COOKIES_BROWSER` 显式选择浏览器，yt-dlp 在执行时读取 cookies，项目不持久化 cookies。
- yt-dlp 及站点提取器自身可能跟随跳转；**不要**把这个本地服务开放到不可信网络。
- 未来要增加限速、空间配额、批量任务与可视化 cookie 授权。

## FFmpeg 导出

- 初版仅面向单视频素材 `ExportRequest`；start/end 为素材时间，aspect 为目标画幅。
- 根据参数构造固定 FFmpeg 参数数组，避免用户拼接 CLI 片段。
- BGM 与原声音轨可在导出时做 FFmpeg 音频混合；预览端目前不混音。
- 未来：应设计稳定、可序列化的项目 JSON，并由后端翻译成 FFmpeg filter_complex，处理视频片段与多个音轨。

## 数据库演进

- 目前 `src/db/index.ts` 以 `CREATE TABLE IF NOT EXISTS` 自举（方便首次运行）。
- **下一次新增字段以前**：改为 Drizzle Kit 迁移，避免已经创建的数据库因旧表结构缺少列而失败。
- 素材按源文件不可变方式管理。删除动作需要引用检查/软删除机制（未实现）。
