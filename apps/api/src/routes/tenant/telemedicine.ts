import { Hono } from 'hono';
import type { Env } from '../../types';

/**
 * Telemedicine routes — proxies to Cloudflare Calls API for WebRTC signalling.
 *
 * Flow:
 *  1. Doctor creates a room → backend creates a CF Calls session, stores roomId in KV
 *  2. Both parties join → each gets their own session, pushes tracks & pulls the other's tracks
 *  3. Room metadata (appointment link, patient/doctor IDs) stored in KV with TTL
 */

const CF_CALLS_BASE = 'https://rtc.live.cloudflare.com/v1';

const telemedicineRoutes = new Hono<{ Bindings: Env }>();

// ─── Create Room ─────────────────────────────────────────────────────────────
// Creates a Cloudflare Calls session and stores room metadata
telemedicineRoutes.post('/rooms', async (c) => {
  const appId = c.env.CF_CALLS_APP_ID;
  const appSecret = c.env.CF_CALLS_APP_SECRET;

  if (!appId || !appSecret) {
    return c.json({ error: 'Cloudflare Calls not configured' }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const { appointmentId, doctorId, patientId, doctorName, patientName } = body as Record<string, string>;

  // Create a new CF Calls session
  const cfRes = await fetch(`${CF_CALLS_BASE}/apps/${appId}/sessions/new`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${appSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!cfRes.ok) {
    const err = await cfRes.text();
    console.error('[Telemedicine] CF Calls error:', err);
    return c.json({ error: 'Failed to create room' }, 502);
  }

  const { sessionId } = (await cfRes.json()) as { sessionId: string };

  // Store room metadata in KV (expires in 2 hours)
  const roomId = `tele_${Date.now()}_${sessionId.slice(0, 8)}`;
  const roomData = {
    roomId,
    sessionId,
    appointmentId: appointmentId || null,
    doctorId: doctorId || null,
    patientId: patientId || null,
    doctorName: doctorName || 'Doctor',
    patientName: patientName || 'Patient',
    createdAt: new Date().toISOString(),
    status: 'waiting',
  };

  await c.env.KV.put(`room:${roomId}`, JSON.stringify(roomData), { expirationTtl: 7200 });

  return c.json({ room: roomData });
});

// ─── Get Room ────────────────────────────────────────────────────────────────
telemedicineRoutes.get('/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId');
  const raw = await c.env.KV.get(`room:${roomId}`);
  if (!raw) return c.json({ error: 'Room not found or expired' }, 404);
  return c.json({ room: JSON.parse(raw) });
});

// ─── Join Room (create a new peer session) ───────────────────────────────────
// Each participant gets their own CF Calls session to push/pull tracks
telemedicineRoutes.post('/rooms/:roomId/join', async (c) => {
  const roomId = c.req.param('roomId');
  const appId = c.env.CF_CALLS_APP_ID;
  const appSecret = c.env.CF_CALLS_APP_SECRET;

  if (!appId || !appSecret) {
    return c.json({ error: 'Cloudflare Calls not configured' }, 503);
  }

  const raw = await c.env.KV.get(`room:${roomId}`);
  if (!raw) return c.json({ error: 'Room not found or expired' }, 404);

  const room = JSON.parse(raw);

  // Create a new session for this participant
  const cfRes = await fetch(`${CF_CALLS_BASE}/apps/${appId}/sessions/new`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${appSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!cfRes.ok) {
    return c.json({ error: 'Failed to create peer session' }, 502);
  }

  const { sessionId } = (await cfRes.json()) as { sessionId: string };

  // Update room status
  room.status = 'active';
  await c.env.KV.put(`room:${roomId}`, JSON.stringify(room), { expirationTtl: 7200 });

  return c.json({ sessionId, appId, room });
});

// ─── Push Tracks (SDP renegotiation proxy) ───────────────────────────────────
telemedicineRoutes.post('/sessions/:sessionId/tracks', async (c) => {
  const sessionId = c.req.param('sessionId');
  const appId = c.env.CF_CALLS_APP_ID;
  const appSecret = c.env.CF_CALLS_APP_SECRET;

  if (!appId || !appSecret) {
    return c.json({ error: 'Cloudflare Calls not configured' }, 503);
  }

  const body = await c.req.json();

  const cfRes = await fetch(`${CF_CALLS_BASE}/apps/${appId}/sessions/${sessionId}/tracks/new`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${appSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!cfRes.ok) {
    const err = await cfRes.text();
    console.error('[Telemedicine] Push tracks error:', err);
    return c.json({ error: 'Failed to push tracks' }, 502);
  }

  const data = await cfRes.json();
  return c.json(data);
});

// ─── Renegotiate (update SDP) ────────────────────────────────────────────────
telemedicineRoutes.put('/sessions/:sessionId/renegotiate', async (c) => {
  const sessionId = c.req.param('sessionId');
  const appId = c.env.CF_CALLS_APP_ID;
  const appSecret = c.env.CF_CALLS_APP_SECRET;

  if (!appId || !appSecret) {
    return c.json({ error: 'Cloudflare Calls not configured' }, 503);
  }

  const body = await c.req.json();

  const cfRes = await fetch(`${CF_CALLS_BASE}/apps/${appId}/sessions/${sessionId}/renegotiate`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${appSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!cfRes.ok) {
    const err = await cfRes.text();
    console.error('[Telemedicine] Renegotiate error:', err);
    return c.json({ error: 'Renegotiation failed' }, 502);
  }

  const data = await cfRes.json();
  return c.json(data);
});

// ─── End Room ────────────────────────────────────────────────────────────────
telemedicineRoutes.delete('/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId');
  await c.env.KV.delete(`room:${roomId}`);
  return c.json({ success: true });
});

// ─── List Active Rooms ───────────────────────────────────────────────────────
telemedicineRoutes.get('/rooms', async (c) => {
  const { keys } = await c.env.KV.list({ prefix: 'room:tele_' });
  const rooms = await Promise.all(
    keys.map(async (k) => {
      const raw = await c.env.KV.get(k.name);
      return raw ? JSON.parse(raw) : null;
    })
  );
  return c.json({ rooms: rooms.filter(Boolean) });
});

export default telemedicineRoutes;
