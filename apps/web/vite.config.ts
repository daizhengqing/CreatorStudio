import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { env } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const target = `http://127.0.0.1:${env.PORT ?? 3000}`;

async function waitForApi() {
  const signal = AbortSignal.timeout(30_000);
  while (!signal.aborted) {
    const ready = await fetch(`${target}/api/health`, { signal }).then(response => response.ok, () => false);
    if (ready) return;
    await delay(100);
  }
  throw new Error(`CreatorStudio API 未就绪（${target}）。请查看后端启动日志。`);
}

export default defineConfig(async ({ command, isPreview }) => {
  // 开发地址可访问时，设置页和对话页已能请求后端。
  if (command === 'serve' && !isPreview) await waitForApi();
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 8088,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  };
});
