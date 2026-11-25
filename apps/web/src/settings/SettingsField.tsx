import type { ReactNode } from 'react';

export function SettingsField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="settings-field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>;
}
