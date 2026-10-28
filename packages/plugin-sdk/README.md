# CreatorStudio Plugin SDK v1

可信的本地插件契约。前端使用独立 ES 模块，后端使用 Node.js ES 模块；安装后的产物不需要依赖此 npm 包的运行时代码。

- `@creator-studio/plugin-sdk`：插件清单、媒体类型、接口契约、存储和事件类型。
- `@creator-studio/plugin-sdk/browser`：`FrontendPlugin`、`WindowMount`、`BrowserSDK`。
- `@creator-studio/plugin-sdk/server`：`BackendPlugin`、`ServerContext`。
- `@creator-studio/plugin-sdk/runtime`：宿主装配所用的注册表、事件总线和生命周期工具。

前端从宿主收到 SDK，无需自行连接服务：

```ts
import type { FrontendPlugin } from '@creator-studio/plugin-sdk/browser';

export default {
  windows: {
    main(container, { sdk, window }) {
      const label = document.createElement('p');
      label.textContent = `窗口 ${window.id}`;
      container.append(label);
      void sdk.media.assets().then(assets => {
        label.textContent = `共有 ${assets.length} 项素材`;
      });
      return () => label.remove();
    },
  },
} satisfies FrontendPlugin;
```

插件根目录需要 `plugin.json`，其 `sdkVersion` 为 `1`，窗口 `id` 与 `windows` 中的键一致。前后端接口参数和结果使用 JSON 值；没有参数或结果时使用 `null`。

完整安装步骤、清单字段、通信和清理约定见 CreatorStudio 仓库的 `docs/PLUGINS.md`；可运行模板位于 `examples/asset-notes`。
