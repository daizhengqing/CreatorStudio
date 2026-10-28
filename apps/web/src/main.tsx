import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initializeRuntime } from './runtime';
import './styles.css';

const container = document.getElementById('root')!;
async function start() {
  const runtime = await initializeRuntime();
  const root = createRoot(container);
  root.render(<StrictMode><App /></StrictMode>);
  await runtime.activate();
  import.meta.hot?.dispose(() => { root.unmount(); runtime.dispose(); });
}
void start().catch((error: Error) => { container.textContent = `工作台启动失败：${error.message}`; });
