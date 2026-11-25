import { useEffect, useState } from 'react';
import type { SessionEvent, SessionSnapshot } from '@creator-studio/contracts';

function apply(previous: SessionSnapshot | null, event: SessionEvent): SessionSnapshot | null {
  if (event.type === 'snapshot') return event.snapshot;
  if (!previous) return null;
  if (event.type === 'run') return { ...previous, run: event.run, session: event.session };
  if (event.type === 'text_delta') {
    return { ...previous, entries: previous.entries.map(entry =>
      entry.id === event.id && entry.role === 'assistant' ? { ...entry, text: entry.text + event.delta } : entry) };
  }

  const found = previous.entries.some(entry => entry.id === event.entry.id);
  return { ...previous, entries: found
    ? previous.entries.map(entry => entry.id === event.entry.id ? event.entry : entry)
    : [...previous.entries, event.entry] };
}

export function useSession(id: string | null) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!id) return;
    const stream = new EventSource(`/api/agent/sessions/${id}/events`);
    stream.onmessage = message => {
      const event = JSON.parse(message.data) as SessionEvent;
      setSnapshot(current => apply(current?.session.id === id ? current : null, event));
      setOffline(false);
    };
    stream.onerror = () => setOffline(true);
    return () => stream.close();
  }, [id]);

  return { snapshot: snapshot?.session.id === id ? snapshot : null, offline: Boolean(id && offline) };
}
