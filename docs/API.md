# API（v0.1.0）

基础地址：本机 `http://127.0.0.1:3000`。开发期浏览器使用 `/api` 的 Vite 代理。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/assets` | 返回全部素材元数据 |
| POST | `/api/assets/upload` | multipart/form-data，字段 `file`，最大 4 GiB |
| GET | `/api/assets/:id/stream` | 支持 Range 的视频/音频/图片读取 |
| GET | `/api/assets/:id/thumbnail` | 视频 JPG 缩略图，生成前返回 404 |
| GET | `/api/downloads` | 下载任务列表 |
| POST | `/api/downloads/preview` | `{ "url": "https://..." }`；解析链接或分享文案，返回标题、封面、时长、可选分辨率和短期有效的 `id` |
| POST | `/api/downloads` | `{ "previewId": "<preview-id>", "resolution": 720 }`；`resolution: null` 表示自动最高画质。旧格式 `{ "url": "https://..." }` 仍可用，按自动画质下载 |
| POST | `/api/downloads/:id/cancel` | 停止排队或正在运行的下载 |
| DELETE | `/api/downloads/:id` | 删除已结束的任务记录，不删除素材文件 |
| GET | `/api/exports` | 导出任务列表 |
| POST | `/api/exports` | 创建基础视频导出任务 |
| GET | `/api/exports/:id/file` | 读取已完成 MP4 |
| GET | `/api/events` | SSE；`changed` 事件、`data: {type: 'assets'/'downloads'/'exports'}` |

POST `/api/exports` 示例：

```json
{
  "assetId": "<asset-uuid>",
  "start": 0,
  "end": 12.5,
  "aspect": "9:16",
  "mute": false,
  "bgmAssetId": "<optional-audio-asset-uuid>",
  "bgmVolume": 0.5
}
```

`aspect`: `original` / `16:9` / `9:16` / `1:1`。

`downloadTasks` / `exportTasks` 的 `status`: `queued`, `running`, `completed`, `failed`, `cancelled`。预览 `id` 有效期 10 分钟，分辨率取自该视频实际格式；停止下载会清理临时文件。当前未实现重试端点。

文件路径由后端控制；不提供通用的任意磁盘文件 API。
