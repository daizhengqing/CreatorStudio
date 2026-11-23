import { X_MONITOR_PLUGIN_ID } from '@creator-studio/plugin-sdk/x-monitor';
import type { XMonitorReadApi, XMonitorTarget } from '@creator-studio/plugin-sdk/x-monitor';

export const STATUS_CHANGED = `${X_MONITOR_PLUGIN_ID}.status.changed`;
export const DEFAULT_INTERVAL = 5;
export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

export type Backfill = { mode: 'from_now' } | { mode: 'days' | 'latest'; amount: number };
export type AddTarget = { handle: string; intervalMinutes: number; backfill: Backfill };
export type UpdateTarget = { id: string; intervalMinutes?: number; enabled?: boolean };

export type LoginDetails = { username: string } & (
  | { mode: 'cookie'; cookie: string }
  | { mode: 'password'; password: string; email: string; emailPassword?: string; totpSecret?: string }
);
export type LoginAccount = {
  username: string;
  state: 'configured' | 'ready' | 'rate_limited' | 'needs_auth';
  lastUsedAt: number | null;
};
export type RuntimeStatus = { ready: boolean; message: string | null };

export type XMonitorApi = XMonitorReadApi & {
  getRuntime: { input: null; output: RuntimeStatus };
  listLoginAccounts: { input: null; output: LoginAccount[] };
  saveLoginAccount: { input: LoginDetails; output: LoginAccount };
  removeLoginAccount: { input: { username: string }; output: null };
  addTarget: { input: AddTarget; output: XMonitorTarget };
  updateTarget: { input: UpdateTarget; output: null };
  removeTarget: { input: { id: string }; output: null };
  collectNow: { input: { id: string }; output: null };
};
