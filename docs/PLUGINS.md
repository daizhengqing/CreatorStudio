# 插件开发与安装

插件通过 SDK 访问工作台能力，独立构建后放入数据目录即可接入。内置的六类窗口使用完全相同的加载器和契约。

采用 ComfyUI 式可信扩展：前端共享浏览器页面，后端共享本地 Node.js 进程。模块边界用于组织代码，不提供安全沙箱、进程故障隔离或依赖隔离。

## 先运行示例

在仓库根目录执行：

```sh
pnpm install
pnpm build:plugins
pnpm --filter @creator-studio/example-asset-notes build
```

将 `examples/asset-notes/dist` 整个目录复制为 `~/MediaStudio/plugins/example.asset-notes`，然后执行 `pnpm dev`。如果使用 `MEDIA_STUDIO_DATA_DIR`，安装位置为该目录下的 `plugins/example.asset-notes`。

Windows 默认数据目录是用户主目录下的 `MediaStudio`；同样复制到其 `plugins/example.asset-notes` 子目录。

工作台出现“素材笔记”按钮后：

1. 导入并选中素材，打开素材笔记。
2. 输入笔记，点击“保存笔记”。
3. 点击“新建笔记窗口”，两个实例展示同一素材的笔记；保存后通过事件同步。
4. 点击“在详情中查看”，示例通过公开窗口接口联动内置详情窗口。
5. 关闭笔记窗口，后端接口仍然存在；重开或重启服务后笔记仍保留。

示例前端使用原生 DOM，后端使用 TypeScript 构建的 Node.js 模块，无需 React 或打包后的 SDK 运行时。

## 在仓库外开发

先在工作台仓库构建并打包 SDK：

```sh
pnpm sdk:pack
```

SDK 包位于仓库的 `artifacts/creator-studio-plugin-sdk-1.0.0.tgz`。将 `examples/asset-notes` 复制到自己的开发目录，进入该目录，使用 SDK 压缩包的绝对路径替换开发依赖：

```sh
pnpm add -D @creator-studio/plugin-sdk@file:/absolute/path/to/creator-studio-plugin-sdk-1.0.0.tgz
pnpm build
```

只分发 `dist`。宿主不会为插件执行安装脚本，也不会替插件安装依赖。第三方库由作者打包进产物；后端需要额外文件或 `node_modules` 时一并分发。后端入口推荐使用 `.mjs`。

## 插件清单

```json
{
  "id": "example.asset-notes",
  "name": "素材笔记示例",
  "version": "1.0.0",
  "sdkVersion": 1,
  "frontend": "frontend.js",
  "backend": "backend.mjs",
  "styles": ["style.css"],
  "windows": [{
    "id": "main",
    "title": "素材笔记",
    "singleton": false,
    "width": 420,
    "height": 360,
    "minWidth": 280,
    "minHeight": 260,
    "toolbar": "素材笔记"
  }]
}
```

| 字段 | 含义 |
| --- | --- |
| `id` | 全局唯一插件标识，以小写字母开头，使用小写字母、数字、点和连字符 |
| `name`、`version` | 展示名称和插件自身版本 |
| `sdkVersion` | 当前仅接受数字 `1`，不匹配时终止启动并指出插件名称 |
| `frontend` | 相对于插件根目录的 ES 模块，默认导出 `FrontendPlugin`；没有前端时省略 |
| `backend` | 相对于插件根目录的 Node.js ES 模块，默认导出 `BackendPlugin`；没有后端时省略 |
| `styles` | 加载到页面的 CSS 相对路径列表，默认空列表 |
| `windows` | 窗口定义列表，纯后台插件使用 `[]` |
| `windows[].id` | 插件内部唯一标识；完整 `viewId` 为 `插件标识/窗口标识` |
| `singleton` | `true` 时重新打开会聚焦并恢复已有窗口；`false` 时创建新实例 |
| `width`、`height` | 新窗口尺寸，单位 px |
| `minWidth`、`minHeight` | 窗口允许的最小尺寸，单位 px |
| `toolbar` | 可选的顶部工具栏按钮文字；全部窗口都会出现在“新建窗口”菜单 |
| `actions` | 可选的工具栏动作，格式 `{ title, method, input }`；先打开窗口，再调用其接口 |
| `defaultSlot` | 可选默认布局位置：`left`、`center`、`right-top`、`right-bottom`；同一位置由一个插件声明 |

安装、更新、移除插件都在服务停止后修改插件目录，随后重启服务并刷新页面。插件标识冲突和重复窗口标识会直接报错，不覆盖已有注册。

## 前端生命周期

前端模块导出 `{ activate?, windows }`。可选 `activate(sdk)` 在工作台渲染后执行，用于不依赖某个窗口的初始化，可返回清理函数。

每个窗口提供 `mount(container, context)`：挂载内容，注册窗口方法，返回清理函数；也可返回 `Promise<清理函数>`。异步挂载完成且接口注册完毕后再返回，调用方才能在 `await open()` 后立即调用。

宿主通过 `context.sdk` 提供能力，通过 `context.window` 提供实例信息、输入和接口注册。界面框架、运行时依赖和根节点由插件管理。CSS 使用 `[data-plugin="插件标识"]` 限定作用范围；主题颜色继承宿主的 `--background`、`--foreground`、`--border`、`--accent` 等变量。

最小化只隐藏内容；关闭窗口调用清理函数。SDK 自动回收窗口创建的接口、SDK 事件订阅和选择订阅；插件清理自身 DOM、定时器、媒体和框架根节点。

## SDK 能力

| 能力 | 浏览器 | 后端 |
| --- | --- | --- |
| `media` | 素材、下载、导出 API，以及 `upload(File)` | 相同领域 API，以及 `importFile(绝对路径)` |
| `windows` | 打开、查找、聚焦、关闭、调用实例接口 | 不提供；后端通过事件通知界面 |
| `selection` | `getSnapshot()`、`subscribe(listener)`、`set(assetId 或 null)` | 不提供；浏览器选择不属于服务端状态 |
| `plugins` | 调用插件后端接口 | 在服务内直接调用插件后端接口 |
| `events` | 发布事件并订阅 SSE 转发的事件 | 发布和订阅同一事件总线 |
| `storage` | 当前插件的持久化存储 | 同一插件的同一存储 |
| `dataDirectory` | 不提供 | 宿主创建的插件专属绝对目录，可在其中维护 SQLite 或其他文件 |
| `api` | 窗口通过 `context.window.expose` 注册接口 | `context.api.expose` 注册插件接口 |

`media` 提供 `assets()`、`downloads()`、`previewDownload(url)`、`startDownload({ previewId, resolution })`、`cancelDownload(id)`、`deleteDownload(id)`、`exports()`、`startExport(request)`。下载和导出仍由现有媒体服务执行；二进制素材走 HTTP 上传或流式读取。

`storage.get<T>(key)` 返回值或 `undefined`，`set(key, JsonValue)` 和 `delete(key)` 返回 `Promise<void>`。数据保存在 `plugin-data/<pluginId>/storage.json`，同一插件按顺序写入。清空键使用 `delete`，保存空值使用 `null`。

`ServerContext.dataDirectory` 是只读目录路径，后台可以在其中创建自己的数据文件。`storage` 有浏览器读取接口，密钥与来源 Cookie 应通过后台专用接口写入插件数据库，读取配置只返回是否已配置。

## 注册和调用接口

前后端共享一个只包含类型的契约文件：

```ts
export type NotesApi = {
  save: {
    input: { assetId: string; note: string };
    output: { saved: boolean };
  };
};
```

后端注册一次，整个服务生命周期均可调用：

后端 `activate` 负责注册方法；跨插件调用放在业务方法内触发，不依赖其他插件的初始化先后顺序。

```ts
return context.api.expose<NotesApi>({
  async save({ assetId, note }) {
    await context.storage.set(`note:${assetId}`, note);
    await context.events.emit('example.asset-notes.saved', { assetId, note });
    return { saved: true };
  },
});
```

前端调用时获得输入和输出类型检查：

```ts
const notes = sdk.plugins.client<NotesApi>('example.asset-notes');
await notes.call('save', { assetId, note: '用于开场' });
```

窗口通过 `context.window.expose<窗口契约>(handlers)` 注册，按实例 ID 调用：

```ts
const editor = await sdk.windows.open('studio.editor/main');
await sdk.windows.call(editor.id, 'loadAsset', { assetId });
await sdk.windows.call(editor.id, 'seek', { seconds: 2 });
```

需要完整类型检查时使用 `sdk.windows.client<窗口契约>(windowId).call(method, input)`。未指定契约的动态 `call(target, method, input)` 返回 `Promise<unknown>`。未知接口、已关闭的窗口和插件抛出的错误都会使调用拒绝。

`windows.list(viewId?)` 返回当前页面的实例列表，`focus(id)` 置顶，`close(id)` 关闭。窗口接口属于当前浏览器页面；不同标签页不共享窗口 ID。

`open(viewId, input?)` 的输入可通过 `context.window.input.getSnapshot()` 和 `subscribe()` 读取。重新打开单例时，提供输入会替换当前输入；不提供则保留原值。输入必须是 JSON 值，会随布局保存。

## 内置窗口接口

所有无参数、无返回值的接口均使用 `null`。

| 窗口 | 方法及输入 | 返回值 |
| --- | --- | --- |
| `studio.assets/main` | `importFiles(null)`、`selectAsset({ assetId })` | `null` |
| `studio.assets/main` | `getSelection(null)` | 素材 ID 或 `null` |
| `studio.downloads/main` | `focusInput(null)`、`preview({ url })` | `null` |
| `studio.editor/main` | `loadAsset({ assetId })`、`seek({ seconds })`、`play(null)`、`pause(null)` | `null` |
| `studio.editor/main` | `getState(null)` | `{ assetId, cursor, playing }` |
| `studio.inspector/main` | `showAsset({ assetId })` | `null` |
| `studio.exports/main` | `refresh(null)` | `null` |

剪辑器的播放和定位方法要求先加载视频。素材选择保留现有行为：素材库、详情和单例剪辑器跟随同一浏览器选择状态。

## 状态和事件

浏览器每次建立或重新建立 SSE 连接时，会本地派发 `studio.connection.open`，插件可订阅并重读业务快照。热点插件另外发布 `studio.trends.changed` 通知资讯、来源状态和 AI 处理变化。

状态使用“先读取快照，再订阅变化”。事件只通知已经发生的变化，不提供历史重放。自定义主题以插件 ID 为前缀，负载为 JSON 值：

```ts
const unsubscribe = sdk.events.subscribe<{ assetId: string; note: string }>(
  'example.asset-notes.saved',
  event => { textarea.value = event.note; },
);
await sdk.events.emit('example.asset-notes.saved', { assetId, note: '新笔记' });
```

前端发布通过 HTTP 送到服务，服务再经 SSE 广播给各页面，发布者也会收到一次。不需要调用后手动再广播。本地窗口调用不经过 HTTP。

内置通知为 `media.assets.changed`、`media.downloads.changed`、`media.exports.changed`，负载均为 `null`。SSE 首次连接及重连时宿主触发三类刷新通知，插件据此重新读取权威状态。

## 开发与验收

```sh
pnpm typecheck
pnpm build
```

修改内置插件后执行 `pnpm build:plugins`，刷新浏览器；修改清单或后端入口后重启服务。当前不提供插件热替换。

验收完整路径：独立目录安装 → 多实例打开 → 调用窗口接口 → 调用后端 → 保存数据 → 事件同步 → 关闭重开 → 重启后读取。无需新增测试文件。
