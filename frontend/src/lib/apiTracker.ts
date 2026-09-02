/**
 * API Request Tracker — FPS-style counter for debugging API call frequency.
 *
 * Hooks into the shared Axios instance via interceptors. Tracks:
 *   - Total requests in the last rolling window (default 10 s)
 *   - Per-endpoint breakdown with method + count
 *   - Whether any recent request was a 429 / rate-limit error
 *
 * Usage:
 *   import { apiTracker } from './apiTracker';
 *   apiTracker.install();          // call once at startup
 *   apiTracker.subscribe(cb);      // get periodic snapshots
 *   apiTracker.unsubscribe(cb);
 *   apiTracker.uninstall();        // cleanup
 */

import { api } from './api';
import type { InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EndpointStat {
  method: string;
  url: string;
  count: number;
  lastStatus?: number;
  lastTime: number;
}

export interface TrackerSnapshot {
  /** Total requests in the rolling window */
  totalInWindow: number;
  /** Requests-per-second (window average) */
  rps: number;
  /** Per-endpoint stats sorted by count desc */
  endpoints: EndpointStat[];
  /** Whether any 429 was seen in the window */
  hasRateLimit: boolean;
  /** Timestamp of latest request */
  lastRequestTime: number;
}

type Listener = (snap: TrackerSnapshot) => void;

// ── Internal state ──────────────────────────────────────────────────────────

interface RequestRecord {
  method: string;
  url: string;
  time: number;
  status?: number;
}

const WINDOW_MS = 10_000; // 10-second rolling window
const TICK_MS = 1_000;    // emit snapshots every 1 s

let records: RequestRecord[] = [];
let listeners: Listener[] = [];
let tickInterval: ReturnType<typeof setInterval> | null = null;
let requestInterceptorId: number | null = null;
let responseInterceptorId: number | null = null;
let errorInterceptorId: number | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function normaliseUrl(raw: string | undefined): string {
  if (!raw) return '?';
  // Strip query-string and hash for grouping
  return raw.split('?')[0].split('#')[0];
}

function pruneOld() {
  const cutoff = Date.now() - WINDOW_MS;
  records = records.filter((r) => r.time >= cutoff);
}

function buildSnapshot(): TrackerSnapshot {
  pruneOld();
  const byKey = new Map<string, EndpointStat>();
  let hasRateLimit = false;
  let lastRequestTime = 0;

  for (const r of records) {
    const key = `${r.method.toUpperCase()} ${r.url}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (r.time > existing.lastTime) {
        existing.lastTime = r.time;
        existing.lastStatus = r.status;
      }
    } else {
      byKey.set(key, {
        method: r.method.toUpperCase(),
        url: r.url,
        count: 1,
        lastStatus: r.status,
        lastTime: r.time,
      });
    }
    if (r.status === 429 || r.status === 400) hasRateLimit = true;
    if (r.time > lastRequestTime) lastRequestTime = r.time;
  }

  const endpoints = Array.from(byKey.values()).sort((a, b) => b.count - a.count);

  return {
    totalInWindow: records.length,
    rps: records.length / (WINDOW_MS / 1000),
    endpoints,
    hasRateLimit,
    lastRequestTime,
  };
}

function emit() {
  if (listeners.length === 0) return;
  const snap = buildSnapshot();
  for (const fn of listeners) {
    try { fn(snap); } catch { /* listener errors are non-fatal */ }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

function install() {
  if (requestInterceptorId !== null) return; // already installed

  // Track outgoing requests
  requestInterceptorId = api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const url = normaliseUrl(config.url);
    const method = config.method || 'get';
    records.push({ method, url, time: Date.now() });
    return config;
  });

  // Track successful responses (to capture status codes)
  responseInterceptorId = api.interceptors.response.use((res: AxiosResponse) => {
    const url = normaliseUrl(res.config?.url);
    const method = res.config?.method || 'get';
    // Update the latest record for this url with its status
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].url === url && records[i].method === method && !records[i].status) {
        records[i].status = res.status;
        break;
      }
    }
    return res;
  });

  // Track error responses
  errorInterceptorId = api.interceptors.response.use(undefined, (error: AxiosError) => {
    const url = normaliseUrl(error.config?.url);
    const method = error.config?.method || 'get';
    const status = error.response?.status ?? 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].url === url && records[i].method === method && !records[i].status) {
        records[i].status = status;
        break;
      }
    }
    return Promise.reject(error);
  });

  // Periodic snapshot emission
  if (!tickInterval) {
    tickInterval = setInterval(emit, TICK_MS);
  }
}

function uninstall() {
  if (requestInterceptorId !== null) {
    api.interceptors.request.eject(requestInterceptorId);
    requestInterceptorId = null;
  }
  if (responseInterceptorId !== null) {
    api.interceptors.response.eject(responseInterceptorId);
    responseInterceptorId = null;
  }
  if (errorInterceptorId !== null) {
    api.interceptors.response.eject(errorInterceptorId);
    errorInterceptorId = null;
  }
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  records = [];
}

function subscribe(fn: Listener) {
  listeners.push(fn);
}

function unsubscribe(fn: Listener) {
  listeners = listeners.filter((l) => l !== fn);
}

/** Manual record (HL `/info` from `hyperliquid.ts`, etc.). Safe before install(). */
function record(method: string, url: string, status?: number) {
  records.push({
    method: method || 'get',
    url: normaliseUrl(url),
    time: Date.now(),
    status,
  });
}

export const apiTracker = { install, uninstall, subscribe, unsubscribe, buildSnapshot, record };
