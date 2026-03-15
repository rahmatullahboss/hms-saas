import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-vitest';

// ─── Helpers ─────────────────────────────────────────────────────────

function getAuthHeaders(tenantId: number, userId = 1, role = 'hospital_admin') {
  const token = jwt.sign(
    { userId: userId.toString(), tenantId: String(tenantId), role, permissions: [] },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
  return {
    'Content-Type': 'application/json',
    'X-Tenant-Subdomain': 'test',
    'Authorization': `Bearer ${token}`,
  };
}

async function api(method: string, path: string, body?: any, tenantId = 1) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: getAuthHeaders(tenantId),
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
}

// ─── Tests ───────────────────────────────────────────────────────────
// Telemedicine routes use external CF Calls API + KV.
// In the test environment, CF_CALLS_APP_ID/SECRET are not set, so
// routes that call CF Calls return 503. We test:
//   1. Config validation (503 when not configured)
//   2. KV-based room CRUD (get/delete/list)
//   3. Tenant isolation
//   4. Auth enforcement

describe('Telemedicine API - Real Integration Tests', () => {

  // ─── Create Room ───────────────────────────────────────────────────
  describe('POST /api/telemedicine/rooms', () => {
    it('returns 503 when CF Calls is not configured', async () => {
      const res = await api('POST', '/api/telemedicine/rooms', {
        appointmentId: '123',
        doctorId: '1',
        patientId: '2',
        doctorName: 'Dr. Rahim',
        patientName: 'Karim',
      });

      expect(res.status).toBe(503);
      const data = await res.json() as any;
      expect(data.error).toContain('not configured');
    });
  });

  // ─── Get Room (KV-based) ──────────────────────────────────────────
  describe('GET /api/telemedicine/rooms/:roomId', () => {
    it('returns 404 for non-existent room', async () => {
      const res = await api('GET', '/api/telemedicine/rooms/nonexistent-room');
      expect(res.status).toBe(404);
    });

    it('returns room data from KV when available', async () => {
      const roomData = {
        roomId: 'tele_test123',
        sessionId: 'sess_abc',
        tenantId: '1',
        doctorName: 'Dr. Test',
        patientName: 'Patient Test',
        status: 'waiting',
        createdAt: new Date().toISOString(),
      };
      await env.KV.put('room:1:tele_test123', JSON.stringify(roomData), { expirationTtl: 3600 });

      const res = await api('GET', '/api/telemedicine/rooms/tele_test123');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.room.doctorName).toBe('Dr. Test');
      expect(data.room.status).toBe('waiting');
    });
  });

  // ─── Delete Room ──────────────────────────────────────────────────
  describe('DELETE /api/telemedicine/rooms/:roomId', () => {
    it('deletes room from KV and returns success', async () => {
      await env.KV.put('room:1:tele_del_test', JSON.stringify({ roomId: 'tele_del_test' }), { expirationTtl: 3600 });

      const res = await api('DELETE', '/api/telemedicine/rooms/tele_del_test');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);

      const check = await env.KV.get('room:1:tele_del_test');
      expect(check).toBeNull();
    });
  });

  // ─── List Active Rooms ─────────────────────────────────────────────
  describe('GET /api/telemedicine/rooms', () => {
    it('returns rooms array', async () => {
      const res = await api('GET', '/api/telemedicine/rooms');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.rooms).toBeDefined();
      expect(Array.isArray(data.rooms)).toBe(true);
    });

    it('returns rooms for current tenant only (tenant isolation)', async () => {
      await env.KV.put('room:1:tele_t1', JSON.stringify({ roomId: 'tele_t1', tenantId: 1 }), { expirationTtl: 3600 });
      await env.KV.put('room:2:tele_t2', JSON.stringify({ roomId: 'tele_t2', tenantId: 2 }), { expirationTtl: 3600 });

      const res = await api('GET', '/api/telemedicine/rooms');
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      const roomIds = data.rooms.map((r: any) => r.roomId);
      expect(roomIds).toContain('tele_t1');
      expect(roomIds).not.toContain('tele_t2');
    });
  });

  // ─── Join Room ─────────────────────────────────────────────────────
  describe('POST /api/telemedicine/rooms/:roomId/join', () => {
    it('returns 503 when CF Calls is not configured (even for existing room)', async () => {
      // CF config check happens before room lookup — always 503 without config
      await env.KV.put('room:1:tele_join_test', JSON.stringify({ roomId: 'tele_join_test' }), { expirationTtl: 3600 });

      const res = await api('POST', '/api/telemedicine/rooms/tele_join_test/join');
      expect(res.status).toBe(503);
    });
  });

  // ─── Push Tracks ───────────────────────────────────────────────────
  describe('POST /api/telemedicine/sessions/:sessionId/tracks', () => {
    it('returns 503 when CF Calls is not configured', async () => {
      const res = await api('POST', '/api/telemedicine/sessions/some-session/tracks', {
        sessionDescription: { type: 'offer', sdp: 'test-sdp' },
      });

      expect(res.status).toBe(503);
    });
  });

  // ─── Auth Enforcement ──────────────────────────────────────────────
  describe('Auth Enforcement', () => {
    it('returns 401 without token', async () => {
      const req = new Request('http://localhost/api/telemedicine/rooms', {
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test' },
      });
      const res = await app.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any);
      expect(res.status).toBe(401);
    });
  });
});
