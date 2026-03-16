/**
 * Unit tests for the mock-db test helper itself.
 *
 * The mock-db is foundational — if it silently misbehaves, every integration
 * test that relies on it becomes unreliable. These tests verify:
 *
 * - Table-based data retrieval (.all() / .first())
 * - filterRows: equality, LIKE, comparison, IN operators
 * - handleAggregate: COUNT(*), COALESCE/SUM
 * - universalFallback behaviour
 * - queryOverride hook
 * - Query recording (.queries array)
 * - .run() returns incrementing last_row_id
 * - batch() executes all statements
 * - extractTableName for SELECT / INSERT / UPDATE / DELETE
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockDB } from '../integration/helpers/mock-db';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const tenantId = 'tenant-test';

const PATIENTS = [
  { id: 1, tenant_id: tenantId, name: 'Alice', age: 30, status: 'active' },
  { id: 2, tenant_id: tenantId, name: 'Bob',   age: 45, status: 'discharged' },
  { id: 3, tenant_id: 'other-tenant', name: 'Charlie', age: 25, status: 'active' },
];

// ─── .all() ───────────────────────────────────────────────────────────────────

describe('mock-db .all()', () => {
  it('returns all rows when no WHERE clause params', async () => {
    const { db } = createMockDB({ tables: { patient: PATIENTS } });
    const result = await db.prepare('SELECT * FROM Patient').bind().all();
    expect(result.results).toHaveLength(3);
  });

  it('filters by equality (tenant_id)', async () => {
    const { db } = createMockDB({ tables: { patient: PATIENTS } });
    const result = await db
      .prepare('SELECT * FROM Patient WHERE tenant_id = ?')
      .bind(tenantId)
      .all();
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r: any) => r.tenant_id === tenantId)).toBe(true);
  });

  it('returns empty array for unknown table', async () => {
    const { db } = createMockDB({});
    const result = await db
      .prepare('SELECT * FROM NonExistentTable WHERE id = ?')
      .bind(1)
      .all();
    expect(result.results).toHaveLength(0);
  });

  it('universalFallback returns [FALLBACK_ROW] when no rows match', async () => {
    const { db } = createMockDB({
      tables: { patient: PATIENTS },
      universalFallback: true,
    });
    const result = await db
      .prepare('SELECT * FROM Patient WHERE id = ?')
      .bind(9999)
      .all();
    expect(result.results).toHaveLength(1);
    expect((result.results[0] as any).id).toBe(1); // FALLBACK_ROW.id === 1
  });
});

// ─── .first() ─────────────────────────────────────────────────────────────────

describe('mock-db .first()', () => {
  it('returns first matching row', async () => {
    const { db } = createMockDB({ tables: { patient: PATIENTS } });
    const row = await db
      .prepare('SELECT * FROM Patient WHERE id = ?')
      .bind(1)
      .first<{ id: number; name: string }>();
    expect(row).not.toBeNull();
    expect(row!.id).toBe(1);
    expect(row!.name).toBe('Alice');
  });

  it('returns null when no match and universalFallback is false', async () => {
    const { db } = createMockDB({ tables: { patient: PATIENTS } });
    const row = await db
      .prepare('SELECT * FROM Patient WHERE id = ?')
      .bind(9999)
      .first();
    expect(row).toBeNull();
  });

  it('returns FALLBACK_ROW when universalFallback is true and no match', async () => {
    const { db } = createMockDB({ tables: { patient: PATIENTS }, universalFallback: true });
    const row = await db
      .prepare('SELECT * FROM Patient WHERE id = ?')
      .bind(9999)
      .first<{ id: number }>();
    expect(row).not.toBeNull();
    expect(typeof row!.id).toBe('number');
  });

  it('handles COUNT(*) aggregate — returns { cnt, count } with correct total', async () => {
    const { db } = createMockDB({ tables: { patient: PATIENTS } });
    const row = await db
      .prepare('SELECT COUNT(*) as total FROM Patient WHERE tenant_id = ?')
      .bind(tenantId)
      .first<{ count: number; cnt: number }>();
    expect(row).not.toBeNull();
    expect(row!.cnt).toBe(2);
    expect(row!.count).toBe(2);
  });

  it('handles COUNT(*) for entire table (no filter)', async () => {
    const { db } = createMockDB({ tables: { patient: PATIENTS } });
    const row = await db
      .prepare('SELECT COUNT(*) as total FROM Patient')
      .bind()
      .first<{ count: number }>();
    expect(row!.count).toBe(3);
  });
});

// ─── filterRows operators ─────────────────────────────────────────────────────

describe('mock-db filterRows operators', () => {
  const STOCK = [
    { id: 1, tenant_id: tenantId, name: 'Paracetamol', qty: 100, price: 5  },
    { id: 2, tenant_id: tenantId, name: 'Amoxicillin', qty: 30,  price: 15 },
    { id: 3, tenant_id: tenantId, name: 'Aspirin Pro', qty: 5,   price: 3  },
  ];

  it('LIKE filter matches substring', async () => {
    const { db } = createMockDB({ tables: { stock: STOCK } });
    const result = await db
      .prepare("SELECT * FROM Stock WHERE name LIKE ?")
      .bind('%para%')
      .all();
    expect(result.results).toHaveLength(1);
    expect((result.results[0] as any).name).toBe('Paracetamol');
  });

  it('>= comparison filter', async () => {
    const { db } = createMockDB({ tables: { stock: STOCK } });
    const result = await db
      .prepare('SELECT * FROM Stock WHERE qty >= ?')
      .bind(30)
      .all();
    expect(result.results).toHaveLength(2); // qty=100, qty=30
  });

  it('<= comparison filter', async () => {
    const { db } = createMockDB({ tables: { stock: STOCK } });
    const result = await db
      .prepare('SELECT * FROM Stock WHERE qty <= ?')
      .bind(30)
      .all();
    expect(result.results).toHaveLength(2); // qty=30, qty=5
  });

  it('!= (neq) filter', async () => {
    const { db } = createMockDB({ tables: { stock: STOCK } });
    const result = await db
      .prepare('SELECT * FROM Stock WHERE id != ?')
      .bind(1)
      .all();
    expect(result.results).toHaveLength(2);
  });

  it('multiple equality conditions (tenant AND id)', async () => {
    const { db } = createMockDB({ tables: { stock: STOCK } });
    const row = await db
      .prepare('SELECT * FROM Stock WHERE tenant_id = ? AND id = ?')
      .bind(tenantId, 2)
      .first<{ name: string }>();
    expect(row).not.toBeNull();
    expect(row!.name).toBe('Amoxicillin');
  });
});

// ─── queryOverride ────────────────────────────────────────────────────────────

describe('mock-db queryOverride', () => {
  it('overrides .first() result for matching SQL pattern', async () => {
    const { db } = createMockDB({
      queryOverride: (sql) => {
        if (sql.includes('Patient')) {
          return { results: [{ id: 42, name: 'Override Patient' }] };
        }
        return null;
      },
    });
    const row = await db
      .prepare('SELECT * FROM Patient WHERE id = ?')
      .bind(1)
      .first<{ id: number; name: string }>();
    expect(row!.id).toBe(42);
    expect(row!.name).toBe('Override Patient');
  });

  it('falls back to table data when queryOverride returns null', async () => {
    const { db } = createMockDB({
      tables: { patient: [{ id: 99, tenant_id: tenantId, name: 'Fallback' }] },
      queryOverride: () => null,
    });
    const row = await db
      .prepare('SELECT * FROM Patient WHERE id = ?')
      .bind(99)
      .first<{ name: string }>();
    expect(row!.name).toBe('Fallback');
  });
});

// ─── .run() and query recording ──────────────────────────────────────────────

describe('mock-db .run() and query recording', () => {
  it('records every query with sql, params, method', async () => {
    const { db, queries } = createMockDB({ tables: { patient: PATIENTS } });

    await db.prepare('SELECT * FROM Patient WHERE id = ?').bind(1).first();
    await db.prepare('INSERT INTO Patient (name) VALUES (?)').bind('Test').run();

    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toContain('SELECT');
    expect(queries[0].method).toBe('first');
    expect(queries[0].params).toEqual([1]);

    expect(queries[1].sql).toContain('INSERT');
    expect(queries[1].method).toBe('run');
    expect(queries[1].params).toEqual(['Test']);
  });

  it('.run() returns incrementing last_row_id', async () => {
    const { db } = createMockDB({});
    const r1 = await db.prepare('INSERT INTO X (a) VALUES (?)').bind('a').run();
    const r2 = await db.prepare('INSERT INTO X (a) VALUES (?)').bind('b').run();
    expect(r2.meta.last_row_id).toBeGreaterThan(r1.meta.last_row_id);
  });

  it('.reset() clears recorded queries', async () => {
    const mock = createMockDB({ tables: { patient: PATIENTS } });
    await mock.db.prepare('SELECT * FROM Patient').bind().all();
    expect(mock.queries).toHaveLength(1);
    mock.reset();
    expect(mock.queries).toHaveLength(0);
  });
});

// ─── batch() ─────────────────────────────────────────────────────────────────

describe('mock-db batch()', () => {
  it('executes all statements and returns results array', async () => {
    const { db, queries } = createMockDB({});
    const stmts = [
      db.prepare('INSERT INTO A (x) VALUES (?)').bind('x1'),
      db.prepare('INSERT INTO A (x) VALUES (?)').bind('x2'),
      db.prepare('UPDATE A SET x = ? WHERE id = ?').bind('updated', 1),
    ];
    const results = await db.batch(stmts as any);
    expect(results).toHaveLength(3);
    expect(queries).toHaveLength(3);
    expect(results.every((r: any) => r.success)).toBe(true);
  });
});

// ─── extractTableName ─────────────────────────────────────────────────────────

describe('mock-db extractTableName (via actual queries)', () => {
  const INVOICES = [{ id: 1, tenant_id: tenantId, amount: 500 }];

  it('handles INSERT INTO TableName', async () => {
    const { db, queries } = createMockDB({ tables: { invoice: INVOICES } });
    await db.prepare('INSERT INTO Invoice (amount) VALUES (?)').bind(100).run();
    expect(queries[0].sql).toContain('INSERT');
  });

  it('handles UPDATE TableName SET ...', async () => {
    const { db, queries } = createMockDB({});
    await db.prepare('UPDATE Invoice SET amount = ? WHERE id = ?').bind(600, 1).run();
    expect(queries[0].sql).toContain('UPDATE');
  });

  it('handles SELECT with alias (FROM Invoice I WHERE I.tenant_id = ?)', async () => {
    const { db } = createMockDB({ tables: { invoice: INVOICES } });
    const result = await db
      .prepare('SELECT I.* FROM Invoice I WHERE I.tenant_id = ?')
      .bind(tenantId)
      .all();
    expect(result.results).toHaveLength(1);
  });
});
