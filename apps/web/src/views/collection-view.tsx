import { useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@creator-studio/ui/button';
import { Input } from '@creator-studio/ui/input';
import { api, messageOf } from '@/api';
import './collections.css';

export type CollectionViewProps = { onOpenSettings: () => void };

type Result<T> = { path: string; data?: T; error?: string };

export function useCollection<T>(path: string, pollMs?: number) {
  const [result, setResult] = useState<Result<T>>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await api<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted) setResult({ path, data });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult(previous => ({ path, data: previous?.path === path ? previous.data : undefined, error: messageOf(error) }));
        }
      } finally {
        // 新一轮读取等待上次请求结束，后台采集期间也可安全刷新列表。
        if (pollMs && !controller.signal.aborted) timer = setTimeout(() => { void load(); }, pollMs);
      }
    }

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, pollMs, revision]);

  const current = result?.path === path ? result : undefined;
  return { data: current?.data, error: current?.error, reload: () => setRevision(value => value + 1) };
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

export function CollectionTime({ value }: { value: number }) {
  return <time dateTime={new Date(value).toISOString()}>{dateFormat.format(value)}</time>;
}

export function CollectionSearch({ label, onSearch }: { label: string; onSearch: (value: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(String(new FormData(event.currentTarget).get('query') ?? '').trim());
  }

  return (
    <form className="collection-search" onSubmit={submit}>
      <Input type="search" name="query" aria-label={label} placeholder={label} />
      <Button type="submit" variant="outline" aria-label="搜索">
        <Search aria-hidden="true" />
      </Button>
    </form>
  );
}

export function CollectionState({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <div className="collection-state" role={retry ? 'alert' : 'status'}>
      <p>{text}</p>
      {retry && <Button type="button" variant="outline" size="sm" onClick={retry}>重试</Button>}
    </div>
  );
}
