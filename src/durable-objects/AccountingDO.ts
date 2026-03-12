import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';

/**
 * AccountingDashboard Durable Object
 *
 * Manages real-time WebSocket connections for the Accounting Dashboard.
 * Uses the Hibernation API so the DO can sleep when idle — connections
 * stay open but don't cost compute while waiting for messages.
 *
 * How it works:
 * 1. Client (AccountingDashboard.tsx) opens wss://.../api/accounting/ws
 * 2. Worker routes the upgrade request to this DO via DASHBOARD_DO binding
 * 3. DO accepts the WebSocket with ctx.acceptWebSocket (hibernatable)
 * 4. When income/expense data changes, the backend POSTs a "notify" message
 *    to the DO, which broadcasts to all connected dashboards
 */
export class AccountingDashboard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Auto-respond to ping/pong without waking the DO
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ── WebSocket upgrade ─────────────────────────────────────────────
    const upgradeHeader = request.headers.get('Upgrade');
    const hasWsKey = request.headers.get('Sec-WebSocket-Key');
    const isWsPath = url.pathname.endsWith('/ws');
    if (upgradeHeader === 'websocket' || hasWsKey || isWsPath) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept with hibernation — the DO can be evicted while idle
      this.ctx.acceptWebSocket(server);

      // Attach metadata (e.g. tenant or session id) for later use
      const tenantId = url.searchParams.get('tenantId') || 'unknown';
      server.serializeAttachment({ tenantId, connectedAt: Date.now() });

      return new Response(null, { status: 101, webSocket: client });
    }

    // ── Internal: broadcast notification ──────────────────────────────
    // Called by income/expense routes after a mutation:
    //   POST /api/accounting/ws/notify { type: 'income_update', data: {...} }
    if (request.method === 'POST' && url.pathname.endsWith('/notify')) {
      const body = await request.json() as Record<string, unknown>;
      this.broadcast(JSON.stringify(body));
      return new Response('ok');
    }

    return new Response('Expected WebSocket or POST /notify', { status: 400 });
  }

  /** Broadcast a message to every connected WebSocket */
  private broadcast(message: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // Connection already closed — ignore
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Clients may send subscription/filter messages in the future.
    // For now we just acknowledge.
    const data = typeof message === 'string' ? message : '[binary]';
    ws.send(JSON.stringify({ type: 'ack', echo: data }));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    // Codes 1005, 1006, and 1015 are reserved and cannot be sent in a close frame.
    // If the client disconnected abnormally (1006), just use 1000 (normal closure).
    const safeCode = [1005, 1006, 1015].includes(code) ? 1000 : code;
    try {
      ws.close(safeCode, reason || 'Client disconnected');
    } catch {
      // WebSocket may already be closed — ignore
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    ws.close(1011, 'WebSocket error');
  }
}
