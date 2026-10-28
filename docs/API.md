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
| GET | `/api/events` | SSE；`studio` 事件、`data: {topic, payload}`；内置主题为 `media.assets.changed` / `media.downloads.changed` / `media.exports.changed`，负载 `null` |

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

## 插件 HTTP 接口（SDK v1）

插件通常使用 SDK，不直接拼接这些 URL。无参数的后端方法请求体为 `null`，参数和结果使用 JSON。

| 方法 | 路径 | 请求 / 返回 |
| --- | --- | --- |
| GET | `/api/plugins` | 返回 `{ manifest, frontendUrl?, styleUrls }[]`，包括内置和安装的插件 |
| POST | `/api/plugins/:id/call/:method` | 请求体为方法输入；返回注册方法的结果，空结果序列化为 `null` |
| GET | `/api/plugins/:id/storage/:key` | 返回 `{ value }`；键不存在时返回 `{}` |
| PUT | `/api/plugins/:id/storage/:key` | 请求 `{ value: JsonValue }`；返回 `{ saved: true }` |
| DELETE | `/api/plugins/:id/storage/:key` | 返回 `{ deleted: true }` |
| POST | `/api/plugins/:id/events` | 请求 `{ topic, payload }`；返回 `{ emitted: true }` |
| GET | `/plugins/:id/*` | 读取插件目录的前端模块及静态资源 |

`:id` 是清单中的插件标识，`:method` 是后端注册的方法名，`:key` 是存储键；各路径段使用 URL 编码。成功返回 `200`；插件 ID 不存在返回 `404`；方法不存在或插件抛出错误返回 `500`，`message` 描述具体原因。JSON 格式错误由服务返回 `400`。

素材笔记示例安装后，保存一条笔记：

```sh
curl -X POST http://127.0.0.1:3000/api/plugins/example.asset-notes/call/save \
  -H 'Content-Type: application/json' \
  -d '{"assetId":"<asset-id>","note":"用于开场"}'
```

返回 `{"saved":true}`，同时 SSE 发出：

```text
event: studio
data: {"topic":"example.asset-notes.saved","payload":{"assetId":"<asset-id>","note":"用于开场"}}
```

窗口实例接口只在对应浏览器页面内调用，不提供 HTTP 入口。接口列表、前后端契约和生命周期见 [插件开发指南](PLUGINS.md)。
