/**
 * 🧪 TEA — Operating Theatre (OT) API Tests
 * Risk: HIGH — Surgical scheduling, team coordination, checklist compliance.
 * Coverage: Booking CRUD, team management, checklists, summaries, cancellation,
 *   statistics, validation, tenant isolation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import * as jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-vitest';

function authHeaders(tenantId = 1) {
  const token = jwt.sign(
    { userId: '1', tenantId: String(tenantId), role: 'admin', permissions: [] },
    SECRET,
    { expiresIn: '1h' },
  );
  return { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': 'test', Authorization: `Bearer ${token}` };
}

async function api(method: string, path: string, body?: any, tenantId = 1) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: authHeaders(tenantId),
      body: body ? JSON.stringify(body) : undefined,
    }),
    env as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}

async function createPatient() {
  const res = await api('POST', '/api/patients', {
    name: 'OT Patient',
    mobile: `0174${Date.now().toString().slice(-7)}`,
    fatherHusband: 'Test Father',
    address: 'Test Address',
    gender: 'male',
    age: 50,
  });
  return ((await res.json()) as any).patientId as number;
}

async function createStaff(name: string) {
  const res = await env.DB.prepare(
    "INSERT INTO staff (name, address, position, salary, bank_account, mobile, tenant_id) VALUES (?, 'Dhaka', 'Surgeon', 50000, 'ACC-001', '01700000000', 1)"
  ).bind(name).run();
  return res.meta.last_row_id as number;
}

const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];

describe('Operating Theatre API', () => {
  let patientId: number;

  beforeEach(async () => {
    patientId = await createPatient();
  });

  // ─── Booking CRUD ───────────────────────────────────────────────────────────
  describe('Booking CRUD', () => {
    it('1. Create OT booking', async () => {
      const res = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
        surgery_type: 'Appendectomy',
        diagnosis: 'Acute appendicitis',
        procedure_type: 'Laparoscopic',
        anesthesia_type: 'General',
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.id).toBeDefined();
    });

    it('2. Create booking with team members', async () => {
      const staffId = await createStaff('Dr. Surgeon');
      const res = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
        surgery_type: 'Hernia Repair',
        team: [{ staff_id: staffId, role_type: 'surgeon' }],
      });
      expect(res.status).toBe(201);
    });

    it('3. Non-existent patient → 400', async () => {
      const res = await api('POST', '/api/ot/bookings', {
        patient_id: 999999,
        booked_for_date: TOMORROW,
      });
      expect(res.status).toBe(400);
    });

    it('4. List bookings', async () => {
      await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      const res = await api('GET', '/api/ot/bookings');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.bookings.length).toBeGreaterThan(0);
    });

    it('5. Get single booking detail', async () => {
      const createRes = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      const { id } = (await createRes.json()) as any;
      const res = await api('GET', `/api/ot/bookings/${id}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.booking).toBeDefined();
    });

    it('6. Update booking fields', async () => {
      const createRes = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      const { id } = (await createRes.json()) as any;
      const res = await api('PUT', `/api/ot/bookings/${id}`, {
        surgery_type: 'Updated Surgery',
        remarks: 'Updated remarks',
      });
      expect(res.status).toBe(200);
    });
  });

  // ─── Cancellation ──────────────────────────────────────────────────────────
  describe('Cancellation', () => {
    it('7. Cancel OT booking', async () => {
      const createRes = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      const { id } = (await createRes.json()) as any;
      const res = await api('PUT', `/api/ot/bookings/${id}/cancel`, {
        cancellation_remarks: 'Patient postponed',
      });
      expect(res.status).toBe(200);
    });

    it('8. Cancel already-cancelled booking → 400', async () => {
      const createRes = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      const { id } = (await createRes.json()) as any;
      await api('PUT', `/api/ot/bookings/${id}/cancel`, { cancellation_remarks: 'First' });
      const res = await api('PUT', `/api/ot/bookings/${id}/cancel`, { cancellation_remarks: 'Second' });
      expect(res.status).toBe(400);
    });
  });

  // ─── Team Management ───────────────────────────────────────────────────────
  describe('Team Management', () => {
    let bookingId: number;

    beforeEach(async () => {
      const res = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      bookingId = ((await res.json()) as any).id;
    });

    it('9. Add team member to booking', async () => {
      const staffId = await createStaff('Nurse A');
      const res = await api('POST', '/api/ot/team', {
        booking_id: bookingId,
        patient_id: patientId,
        staff_id: staffId,
        role_type: 'scrub_nurse',
      });
      expect(res.status).toBe(201);
    });

    it('10. List team members', async () => {
      const staffId = await createStaff('Anesthetist');
      await api('POST', '/api/ot/team', {
        booking_id: bookingId,
        patient_id: patientId,
        staff_id: staffId,
        role_type: 'anesthetist',
      });
      const res = await api('GET', `/api/ot/bookings/${bookingId}/team`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.team.length).toBeGreaterThan(0);
    });

    it('11. Remove team member', async () => {
      const staffId = await createStaff('Team Member');
      const addRes = await api('POST', '/api/ot/team', {
        booking_id: bookingId,
        patient_id: patientId,
        staff_id: staffId,
        role_type: 'ot_assistant',
      });
      const { id } = (await addRes.json()) as any;
      const res = await api('DELETE', `/api/ot/team/${id}`);
      expect(res.status).toBe(200);
    });
  });

  // ─── Checklist ─────────────────────────────────────────────────────────────
  describe('Checklist', () => {
    let bookingId: number;

    beforeEach(async () => {
      const res = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      bookingId = ((await res.json()) as any).id;
    });

    it('12. Add checklist item', async () => {
      const res = await api('POST', '/api/ot/checklist', {
        booking_id: bookingId,
        item_name: 'Patient consent signed',
        item_value: true,
      });
      expect(res.status).toBe(201);
    });

    it('13. Get checklist items', async () => {
      await api('POST', '/api/ot/checklist', {
        booking_id: bookingId,
        item_name: 'Consent',
        item_value: true,
      });
      const res = await api('GET', `/api/ot/bookings/${bookingId}/checklist`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.checklist.length).toBeGreaterThan(0);
    });

    it('14. Bulk update checklist (replaces all)', async () => {
      await api('POST', '/api/ot/checklist', {
        booking_id: bookingId,
        item_name: 'Old item',
        item_value: false,
      });
      const res = await api('PUT', `/api/ot/bookings/${bookingId}/checklist/bulk`, {
        items: [
          { item_name: 'New item 1', item_value: true },
          { item_name: 'New item 2', item_value: false },
        ],
      });
      expect(res.status).toBe(200);
      // Verify replacement
      const listRes = await api('GET', `/api/ot/bookings/${bookingId}/checklist`);
      const list = (await listRes.json()) as any;
      expect(list.checklist.length).toBe(2);
    });
  });

  // ─── OT Summary ───────────────────────────────────────────────────────────
  describe('OT Summary', () => {
    let bookingId: number;

    beforeEach(async () => {
      const res = await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      bookingId = ((await res.json()) as any).id;
    });

    it('15. Create OT summary', async () => {
      const res = await api('POST', '/api/ot/summary', {
        booking_id: bookingId,
        pre_op_diagnosis: 'Appendicitis',
        post_op_diagnosis: 'Acute appendicitis confirmed',
        anesthesia: 'General',
        ot_charge: 15000,
        ot_description: 'Laparoscopic appendectomy',
        category: 'major',
      });
      expect(res.status).toBe(201);
    });

    it('16. Duplicate summary → 400', async () => {
      await api('POST', '/api/ot/summary', {
        booking_id: bookingId,
        ot_charge: 10000,
      });
      const res = await api('POST', '/api/ot/summary', {
        booking_id: bookingId,
        ot_charge: 10000,
      });
      expect(res.status).toBe(400);
    });

    it('17. Get OT summary', async () => {
      await api('POST', '/api/ot/summary', {
        booking_id: bookingId,
        ot_charge: 10000,
      });
      const res = await api('GET', `/api/ot/bookings/${bookingId}/summary`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.summary.ot_charge).toBe(10000);
    });

    it('18. Get summary of non-existent → 404', async () => {
      const res = await api('GET', '/api/ot/bookings/999999/summary');
      expect(res.status).toBe(404);
    });
  });

  // ─── Stats ─────────────────────────────────────────────────────────────────
  describe('Statistics', () => {
    it('19. GET /stats returns OT statistics', async () => {
      await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      const res = await api('GET', '/api/ot/stats');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(typeof data.today_bookings).toBe('number');
      expect(typeof data.this_week).toBe('number');
      expect(typeof data.total_upcoming).toBe('number');
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('20. Cross-tenant booking list is empty or blocked', async () => {
      await api('POST', '/api/ot/bookings', {
        patient_id: patientId,
        booked_for_date: TOMORROW,
      });
      const res = await api('GET', '/api/ot/bookings', undefined, 2);
      if (res.status === 200) {
        const data = (await res.json()) as any;
        expect(data.bookings.length).toBe(0);
      } else {
        expect([403, 404].includes(res.status)).toBe(true);
      }
    });
  });
});
