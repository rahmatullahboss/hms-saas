import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env, Variables } from '../../types';
import { requireTenantId } from '../../lib/context-helpers';
import { createTeleRoomSchema } from '../../schemas/clinical';

const ALLOWED_ROLES = ['doctor', 'md', 'hospital_admin', 'receptionist', 'nurse'];

/**
 * Telemedicine route — manages rooms via KV store.
 * This doesn't use a DB table; rooms are stored in KV with short TTL.
 * Video/audio uses Cloudflare Realtime SFU via environment bindings.
 */
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Helper: KV key for a room
const roomKey = (tenantId: string, roomId: string) => `tele:${tenantId}:room:${roomId}`;
const roomListKey = (tenantId: string) => `tele:${tenantId}:rooms`;

interface TeleRoom {
  id: string;
  name: string;
  status: 'waiting' | 'in_progress' | 'ended';
  patientId?: number;
  doctorId?: number;
  patientName?: string;
  doctorName?: string;
  createdAt: string;
  sessionId?: string;
}

// ─── GET /api/telemedicine/rooms — list all active rooms ─────────────────────
app.get('/rooms', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  if (!role || !ALLOWED_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to list rooms' });
  }

  const listJson = await c.env.KV.get(roomListKey(tenantId));
  const roomIds: string[] = listJson ? JSON.parse(listJson) : [];

  const rooms: TeleRoom[] = [];
  for (const id of roomIds) {
    const data = await c.env.KV.get(roomKey(tenantId, id));
    if (data) rooms.push(JSON.parse(data));
  }

  return c.json({ rooms: rooms.filter(r => r.status !== 'ended') });
});

// ─── GET /api/telemedicine/rooms/:id — get single room ───────────────────────
app.get('/rooms/:id', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  if (!role || (!ALLOWED_ROLES.includes(role) && role !== 'patient')) {
    throw new HTTPException(403, { message: 'Not authorized to view room' });
  }

  const id = c.req.param('id');
  const data = await c.env.KV.get(roomKey(tenantId, id));
  if (!data) throw new HTTPException(404, { message: 'Room not found' });

  return c.json(JSON.parse(data));
});

// ─── POST /api/telemedicine/rooms — create room ──────────────────────────────
app.post('/rooms', zValidator('json', createTeleRoomSchema), async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  if (!role || !ALLOWED_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to create room' });
  }

  const body = c.req.valid('json');

  const derivedName =
    body.name ||
    (body.doctorName || body.patientName
      ? `${body.doctorName || 'Doctor'} - ${body.patientName || 'Patient'}`
      : 'Telemedicine Room');

  const id = crypto.randomUUID();
  const room: TeleRoom = {
    id,
    name: derivedName,
    status: 'waiting',
    patientId: body.patientId,
    doctorId: body.doctorId,
    patientName: body.patientName,
    doctorName: body.doctorName,
    createdAt: new Date().toISOString(),
  };

  // Store room, TTL 4 hours
  await c.env.KV.put(roomKey(tenantId, id), JSON.stringify(room), { expirationTtl: 14400 });

  // Add to listing
  const listJson = await c.env.KV.get(roomListKey(tenantId));
  const list: string[] = listJson ? JSON.parse(listJson) : [];
  list.push(id);
  await c.env.KV.put(roomListKey(tenantId), JSON.stringify(list), { expirationTtl: 14400 });

  return c.json({ room }, 201);
});

// ─── POST /api/telemedicine/rooms/:id/join — join a room (get SFU session) ───
app.post('/rooms/:id/join', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  if (!role || (!ALLOWED_ROLES.includes(role) && role !== 'patient')) {
    throw new HTTPException(403, { message: 'Not authorized to join room' });
  }

  const id = c.req.param('id');
  const data = await c.env.KV.get(roomKey(tenantId, id));
  if (!data) throw new HTTPException(404, { message: 'Room not found' });

  const room: TeleRoom = JSON.parse(data);

  // If Cloudflare Realtime SFU is configured, create a session
  if (c.env.CF_REALTIME_APP_ID && c.env.CF_REALTIME_APP_SECRET) {
    try {
      const resp = await fetch(
        `https://rtc.live.cloudflare.com/v1/apps/${c.env.CF_REALTIME_APP_ID}/sessions/new`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.CF_REALTIME_APP_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      const session = await resp.json() as { sessionId: string };
      room.sessionId = session.sessionId;
      room.status = 'in_progress';
      await c.env.KV.put(roomKey(tenantId, id), JSON.stringify(room), { expirationTtl: 14400 });
      return c.json({ sessionId: session.sessionId, room });
    } catch {
      // fallback — return without SFU session
    }
  }

  // Fallback: return room without SFU
  room.status = 'in_progress';
  await c.env.KV.put(roomKey(tenantId, id), JSON.stringify(room), { expirationTtl: 14400 });
  return c.json({ sessionId: null, room, message: 'SFU not configured — video not available' });
});

// ─── POST /api/telemedicine/sessions/:sessionId/tracks — proxy to SFU ────────
app.post('/sessions/:sessionId/tracks', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  if (!role || (!ALLOWED_ROLES.includes(role) && role !== 'patient')) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  if (!c.env.CF_REALTIME_APP_ID || !c.env.CF_REALTIME_APP_SECRET) {
    throw new HTTPException(503, { message: 'Realtime SFU not configured' });
  }

  const sessionId = c.req.param('sessionId');

  // Limit opaque SFU payload size (256KB max)
  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > 256 * 1024) {
    throw new HTTPException(413, { message: 'Payload too large' });
  }

  const body = await c.req.json(); // SFU track data is opaque — pass through raw

  const resp = await fetch(
    `https://rtc.live.cloudflare.com/v1/apps/${c.env.CF_REALTIME_APP_ID}/sessions/${sessionId}/tracks/new`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.CF_REALTIME_APP_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const result = await resp.json();
  return c.json(result);
});

// ─── DELETE /api/telemedicine/rooms/:id — end room ───────────────────────────
app.delete('/rooms/:id', async (c) => {
  const tenantId = requireTenantId(c);
  if (!tenantId) throw new HTTPException(401, { message: 'Tenant required' });

  const role = c.get('role');
  if (!role || !ALLOWED_ROLES.includes(role)) {
    throw new HTTPException(403, { message: 'Not authorized to end room' });
  }

  const id = c.req.param('id');
  const data = await c.env.KV.get(roomKey(tenantId, id));
  if (data) {
    const room: TeleRoom = JSON.parse(data);
    room.status = 'ended';
    await c.env.KV.put(roomKey(tenantId, id), JSON.stringify(room), { expirationTtl: 300 });
  }

  // Remove from listing
  const listJson = await c.env.KV.get(roomListKey(tenantId));
  if (listJson) {
    const list: string[] = JSON.parse(listJson);
    await c.env.KV.put(roomListKey(tenantId), JSON.stringify(list.filter(r => r !== id)), { expirationTtl: 14400 });
  }

  return c.json({ success: true });
});

export default app;
