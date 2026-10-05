import { readFileSync, writeFileSync, renameSync } from 'node:fs';

// This bridge is intentionally opt-in. Without a launcher session, Vite behaves normally.
export function enmannerLiveUpdates() {
  const stateFile = process.env.ENMANNER_LIVE_UPDATES_FILE;
  let state = { paused: false, revision: 0 };
  let endpoint;
  const readState = () => {
    try {
      const next = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (typeof next.paused === 'boolean' && Number.isSafeInteger(next.revision)) state = next;
    } catch {
      // Preserve the last state across a transient read failure.
    }
    return state;
  };

  return {
    name: 'enmanner-live-updates',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      endpoint = `${config.base}__enmanner_live_updates`;
    },
    configureServer(server) {
      if (!stateFile) return;
      readState();
      const originalSend = server.ws.send;
      server.ws.send = function (...args) {
        const type = args[0]?.type;
        if (readState().paused && ['update', 'full-reload', 'error'].includes(type)) return;
        return originalSend.apply(this, args);
      };
      const acknowledge = () => {
        try {
          const temporary = `${stateFile}.ack.${process.pid}`;
          writeFileSync(temporary, JSON.stringify({ adapter: 'vite', timestamp: Date.now() / 1000 }), { mode: 0o600 });
          renameSync(temporary, `${stateFile}.ack`);
        } catch { /* The launcher may already have quit. */ }
      };
      acknowledge();
      const heartbeat = setInterval(acknowledge, 500);
      heartbeat.unref();
      server.httpServer?.once('close', () => clearInterval(heartbeat));
      server.middlewares.use((request, response, next) => {
        // Vite can strip the configured base before invoking middleware.
        const path = request.url?.split('?')[0];
        if (path !== endpoint && path !== '/__enmanner_live_updates') return next();
        if (request.method !== 'GET') {
          response.writeHead(405).end();
          return;
        }
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(readState()));
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (!stateFile) return;
        return [{
          tag: 'script',
          injectTo: 'head-prepend',
          children: `(${browserBridge.toString()})(${JSON.stringify(endpoint)}, ${JSON.stringify(readState())});`,
        }];
      },
    },
  };
}

// Keep application WebSockets untouched. The browser bridge also prevents Vite's
// reconnect handler from reloading a paused page when its dev server restarts.
export function browserBridge(endpoint, initialState) {
  let state = initialState;
  const initialRevision = state.revision;
  let disconnected = false;
  let reloading = false;
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      const vite = protocols === 'vite-hmr' || (Array.isArray(protocols) && protocols.includes('vite-hmr'));
      if (!vite) return;
      let connected = false;
      this.addEventListener('open', () => { connected = true; });
      this.addEventListener('message', (event) => {
        let payload;
        try { payload = JSON.parse(event.data); } catch { return; }
        if (state.paused && ['update', 'full-reload', 'error'].includes(payload.type)) {
          event.stopImmediatePropagation();
        }
      });
      this.addEventListener('close', (event) => {
        if (!connected) return; // Preserve Vite's initial-connection fallback.
        // Own reconnection while the adapter is active. Polling below reloads
        // only once the server is available and updates are enabled.
        event.stopImmediatePropagation();
        disconnected = true;
      });
    }
  };
  const poll = async () => {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) return;
      const next = await response.json();
      if (typeof next.paused !== 'boolean' || !Number.isSafeInteger(next.revision)) return;
      state = next;
      if (!state.paused && (state.revision !== initialRevision || disconnected) && !reloading) {
        reloading = true;
        window.location.reload();
      }
    } catch { /* Retry after a server restart without disturbing the page. */ }
    finally { if (!reloading) setTimeout(poll, 250); }
  };
  setTimeout(poll, 250);
}
