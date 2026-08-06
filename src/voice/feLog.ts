export function feLog(event: string, data?: unknown): void {
  try {
    void fetch('/api/fe-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

let globalHookInstalled = false;
export function installGlobalErrorHook(): void {
  if (globalHookInstalled || typeof window === 'undefined') return;
  globalHookInstalled = true;

  window.addEventListener('error', (event) => {
    feLog('window.error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.slice(0, 1000),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event.reason;
    feLog('unhandledRejection', {
      message: reason?.message || String(reason),
      stack: reason?.stack?.slice(0, 1000),
    });
  });

  window.addEventListener('beforeunload', () => {
    feLog('page-UNLOAD', { ts: Date.now() });
  });

  window.addEventListener('pagehide', () => {
    feLog('page-HIDE', { ts: Date.now() });
  });

  if (import.meta && (import.meta as any).hot) {
    (import.meta as any).hot.on('vite:beforeUpdate', (payload: any) => {
      feLog('vite-HMR-update', { updates: payload?.updates?.map((u: any) => u.path) });
    });
    (import.meta as any).hot.on('vite:beforeFullReload', () => {
      feLog('vite-HMR-fullReload', {});
    });
    (import.meta as any).hot.on('vite:invalidate', (payload: any) => {
      feLog('vite-HMR-invalidate', { path: payload?.path });
    });
  }
}
