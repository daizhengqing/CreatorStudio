# 本地 API

下文路径相对于本机 Fastify 服务，默认地址为 `http://127.0.0.1:3000`。写入 JSON 时使用 `Content-Type: application/json`。

## 会话

| 方法与路径 | 入参 | 返回 |
| --- | --- | --- |
| `GET /api/agent/sessions` | | 会话列表，每项包含 `id`、`title` 和 `updatedAt` |
| `POST /api/agent/sessions` | `{"text":"查询视频素材","assetIds":[]}` | HTTP 202，`{sessionId, runId}` |
| `POST /api/agent/sessions/:id/messages` | 同首次提交。省略 `assetIds` 时传入纯文字 | HTTP 202，`{sessionId, runId}` |
| `GET /api/agent/sessions/:id/events` | | SSE。首帧为快照，随后是条目、文本增量、运行状态 |
| `POST /api/agent/sessions/:id/abort` | | HTTP 204 |

重复向运行中的会话发送消息时返回 HTTP 409。模型未配置、文字为空或素材不存在时返回 HTTP 400。访问不存在的会话时返回 HTTP 404。

每个 SSE 事件的 data 是一个 JSON 对象。快照包含 `session`、`entries` 和 `run`，可以用于恢复整个界面。

| `type` | 字段 |
| --- | --- |
| `snapshot` | `snapshot` 包含已知历史与本轮状态 |
| `entry` | `entry` 包含用户、助手或工具条目，按 `id` 更新 |
| `text_delta` | `id` 和要追加的 `delta` |
| `run` | `session` 和 `run`，状态为 `running`、`completed`、`failed` 或 `cancelled` |

## 文件和媒体任务

| 方法与路径 | 返回 |
| --- | --- |
| `GET /api/assets` | 最近导入的素材 |
| `POST /api/assets/upload` | 使用 multipart 表单字段 `file` 上传单个素材，HTTP 201 返回素材对象 |
| `GET /api/assets/:id` | 素材详情，包括 ID、类型和 `streamUrl` |
| `GET /api/assets/:id/stream` | 原始文件，支持字节 Range |
| `GET /api/assets/:id/thumbnail` | 视频缩略图 |
| `GET /api/downloads/:id` | 下载任务状态、进度和入库后的 `assetId` |
| `GET /api/exports/:id` | 导出任务状态、进度和可用后的 `playbackUrl` |
| `GET /api/exports/:id/file` | 已完成的 MP4，支持字节 Range |

## 设置

### 模型

| 方法与路径 | 用途 | 返回 |
| --- | --- | --- |
| `GET /api/models/config` | 读取模型列表和当前选择 | 配置 |
| `POST /api/models` | 新增模型。当前无模型时自动启用 | HTTP 201，配置 |
| `PUT /api/models/:id` | 更新指定模型 | 配置 |
| `POST /api/models/:id/activate` | 将指定模型用于后续对话和热点摘要 | 配置 |
| `DELETE /api/models/:id` | 删除指定模型。删除当前模型时启用首个剩余有效模型 | 配置 |
| `POST /api/models/:id/test` | 测试已保存模型的流式工具调用和 JSON 摘要 | `{agent, summary, config}`。两项检查均返回 `{ok, message}` |

新增和更新模型提交以下字段。`protocol` 可选 `openai-completions` 或 `anthropic-messages`。`proxyUrl` 留空时直连，`contextWindow` 填正整数或 `null`。编辑时省略 `apiKey` 会保留已保存的密钥，传入空字符串会清除。

```json
{
  "protocol": "openai-completions",
  "baseUrl": "http://127.0.0.1:11434/v1",
  "model": "qwen3",
  "proxyUrl": "",
  "contextWindow": null,
  "supportsImages": false
}
```

配置包含 `activeModelId` 和 `models`。未启用模型时 `activeModelId` 为 `null`。每个模型包含 `id`、密钥以外的配置字段，以及 `hasKey`、`agentVerified` 和 `summaryVerified`。无效的配置返回 HTTP 400，访问不存在的模型返回 HTTP 404。

### 采集

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/settings/trends` | 获取采集配置与来源状态 |
| `PUT /api/settings/trends/proxy` | 保存 `{"proxyUrl":"http://127.0.0.1:7897"}` |
| `PUT /api/settings/trends/weibo` | 保存并试采 `{"cookie":"…"}`，传空字符串清除 |
| `GET /api/settings/x/runtime` | 准备并检查 X Monitor 的 Python 环境 |
| `GET /api/settings/x/accounts` | 查看已保存的 X 账号及状态 |
| `POST /api/settings/x/accounts` | 保存 `{username, mode:"cookie", cookie}` 或 `{username, mode:"password", password, email, emailPassword?, totpSecret?}` |
| `DELETE /api/settings/x/accounts/:username` | 移除登录账号，返回 HTTP 204 |
