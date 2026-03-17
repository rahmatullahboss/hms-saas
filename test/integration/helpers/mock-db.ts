/// <reference types="@cloudflare/workers-types" />
/**
 * Mock D1 Database factory for integration tests.
 *
 * Simulates the Cloudflare D1 `.prepare().bind().all() / .first() / .run()`
 * chain so route handlers can execute without a real database.
 *
 * Usage:
 *   const { db, queries } = createMockDB({
 *     tables: {
 *       admissions: [{ id: 1, tenant_id: 'tenant-1', ... }],
 *       patients: [...],
 *     },
 *   });
 */

export interface MockDBOptions {
  /** Map of table name → array of row objects to return */
  tables?: Record<string, Record<string, unknown>[]>;
  /**
   * Optional override: given (sql, params) returns a custom result.
   * If provided and returns non-null, this value is used instead of table data.
   */
  queryOverride?: (sql: string, params: unknown[]) => MockQueryResult | null;
  /**
   * When true, .first() never returns null — returns a universal fallback row
   * with common field names. This forces handlers past "not found" guards.
   */
  universalFallback?: boolean;
}

export interface MockQueryResult {
  results?: Record<string, unknown>[];
  first?: Record<string, unknown> | null;
  success?: boolean;
  meta?: Record<string, unknown>;
}

/** Recorded query for assertions in tests */
export interface RecordedQuery {
  sql: string;
  params: unknown[];
  method: 'all' | 'first' | 'run';
}

export interface MockDB {
  /** Mock D1Database interface (compatible with Cloudflare D1) */
  db: D1Database;
  /** All queries executed so far — use for assertions */
  queries: RecordedQuery[];
  /** Reset recorded queries between tests */
  reset(): void;
}

// ─── Internal D1 stub types ────────────────────────────────────────────────

interface MockBound {
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta: object }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { last_row_id: number; changes: number; duration: number } }>;
}

// ─── Row-ID counter (resets per `createMockDB` call) ──────────────────────

let _rowIdCounter = 1000;

// ─── Factory ───────────────────────────────────────────────────────────────

export function createMockDB(options: MockDBOptions = {}): MockDB {
  const queries: RecordedQuery[] = [];
  const { tables = {}, queryOverride, universalFallback = false } = options;

  // Universal fallback row — provides common fields for any table
  const FALLBACK_ROW: Record<string, unknown> = {
    id: 1, name: 'Test', status: 'active', tenant_id: 'tenant-1',
    patient_id: 1, doctor_id: 1, bill_id: 1, amount: 500, total: 1000,
    due: 500, paid: 500, fee: 500, price: 500, quantity: 10,
    created_at: '2025-01-01', updated_at: '2025-01-01',
    email: 'test@test.com', role: 'hospital_admin', is_active: 1,
    is_read: 0, type: 'cash', category: 'general', description: 'Test',
    patient_name: 'Ali', doctor_name: 'Dr Khan', mobile: '017',
    address: 'Dhaka', gender: 'Male', age: 30, specialization: 'General',
    visit_type: 'opd', triage_level: 'yellow', chief_complaint: 'Test',
    diagnosis: 'Test', notes: 'Test notes', procedure: 'Test',
    ward: 'General', bed_number: 'B1', rate_per_day: 500,
    policy_number: 'P1', provider: 'ABC', allergen: 'Test',
    severity: 'low', share_token: 'tok123', token: 'tok123',
    subdomain: 'test', plan: 'premium', password_hash: '$2a$10$x',
    bill_no: 'B001', order_number: 'L001', patient_code: 'P001',
    share_count: 10, investment: 50000, profit_percentage: 50,
    code: '1000', unit_price: 500, sale_price: 1000,
    admission_id: 1, bed_id: 1, visit_id: 1, surgeon_id: 1,
    ot_date: '2025-06-01', appt_date: '2025-06-15',
    admission_date: '2025-01-01', discharge_date: '2025-01-05',
    key: 'hospital_name', value: 'Test Hospital',
    slug: 'about', title: 'About', content: 'Info',
    batch_number: 'B1', expiry_date: '2026-12-31',
    medicine_name: 'Paracetamol', dosage: '500mg', frequency: 'TDS',
    day_of_week: 'monday', start_time: '09:00', end_time: '17:00',
    subject: 'Test', body: 'Hello', sender_id: 1, recipient_id: 2,
    from_user: 1, to_user: 2, reason: 'Test', balance: 5000,
    salary: 20000, position: 'Nurse', bank_account: 'B123',
    systolic: 120, diastolic: 80, pulse: 72, temperature: 98.6,
    month: '2025-01', total_profit: 100000, distributable_profit: 60000,
    next_run_date: '2025-02-01', is_active_num: 1,
    contact: '017', company: 'ABC', contact_person: 'Ali',
    // Additional fields for deeper handler coverage
    is_deleted: 0, verified: 1, category_id: 1,
    share_expires: new Date(Date.now() + 86400000).toISOString(),
    invited_by: 1, accepted_at: null,
    last_run_date: '2025-01-01', parent_id: null,
    generic_name: 'Test', form: 'Tablet', strength: '500mg',
    reorder_level: 20, stock_quantity: 100,
    sample_status: 'received', rx_no: 'RX001',
    supplier_id: 1, purchase_date: '2025-01-01',
    invoice_no: 'INV001', batch_no_2: 'B001',
    reference_no: 'REF001', debit_account_id: 1, credit_account_id: 2,
    lab_test_id: 1, test_name: 'CBC', result: '5.5',
    recorded_at: '2025-01-01', recorded_by: 1,
    visit_no: 'V001', visit_date: '2025-01-01',
    order_no: 'L001', order_date: '2025-01-01',
    charge_date: '2025-01-01', cn_no: 'CN001',
    requested_by: 1, expires_at: '2099-12-31',
    arrival_time: '2025-01-01T10:00:00Z', assigned_doctor: 1,
    discharge_notes_text: 'Stable', discharge_disposition: 'home',
    alert_type: 'vitals',
    task_type: 'medication', assigned_to: 1, priority: 'high',
    consultation_fee: 500, follow_up_date: '2025-01-15',
    sort_order: 1, icon: '🔹',
    invited_by_name: 'Admin', account_name: 'Cash',
    debit_account_name: 'Cash', credit_account_name: 'Bank',
    lab_test_name: 'CBC', medicine_id: 1,
    service_type: 'consultation', percentage: 20, flat_amount: 0,
    profit_sharing_percent: 60, reserve_percent: 10,
    distributable: 30000, net_profit: 20000,
    total_income: 50000, total_expense: 30000,
    period: '2025-01', heart_rate: 72, spo2: 99,
    date_of_birth: '1990-01-01',
    reaction: 'Rash', coverage_type: 'full', policy_no: 'P001',
    claim_amount: 5000,
  };

  /**
   * SQL → table-name extractor.
   * For SELECT queries with subqueries (e.g. COALESCE(SELECT ... FROM inner)),
   * finds the OUTERMOST FROM by tracking parenthesis depth.
   */
  function extractTableName(sql: string): string | null {
    const normalised = sql.replace(/\s+/g, ' ').trim().toUpperCase();
    // INSERT INTO table
    let m = normalised.match(/INSERT\s+INTO\s+([A-Z_]+)/);
    if (m) return m[1].toLowerCase();
    // UPDATE table
    m = normalised.match(/^UPDATE\s+([A-Z_]+)/);
    if (m) return m[1].toLowerCase();
    // DELETE FROM table
    m = normalised.match(/DELETE\s+FROM\s+([A-Z_]+)/);
    if (m) return m[1].toLowerCase();
    // SELECT ... FROM table — find outermost FROM (depth == 0)
    let depth = 0;
    for (let i = 0; i < normalised.length; i++) {
      if (normalised[i] === '(') { depth++; continue; }
      if (normalised[i] === ')') { depth--; continue; }
      if (depth === 0 && normalised.substring(i, i + 5) === 'FROM ') {
        const rest = normalised.substring(i + 5).trimStart();
        const tableMatch = rest.match(/^([A-Z_]+)/);
        if (tableMatch) return tableMatch[1].toLowerCase();
      }
    }
    return null;
  }

  /**
   * Filter rows from a table by the bound params.
   *
   * Handles:
   * - `col = ?`  equality conditions
   * - `col LIKE ?` pattern conditions
   * - `col IN (?, ?, ...)` multi-value membership
   */
  function filterRows(
    sql: string,
    params: unknown[],
    rows: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    const upper = sql.toUpperCase();

    type Condition =
      | { col: string; op: 'eq'; paramIdx: number }
      | { col: string; op: 'like'; paramIdx: number }
      | { col: string; op: 'neq'; paramIdx: number }
      | { col: string; op: 'gte'; paramIdx: number }
      | { col: string; op: 'lte'; paramIdx: number }
      | { col: string; op: 'gt'; paramIdx: number }
      | { col: string; op: 'lt'; paramIdx: number }
      | { col: string; op: 'in'; values: unknown[] };

    const conditions: Condition[] = [];
    let paramOffset = 0;

    // Positional scan: walk the normalised SQL and assign params as they appear
    // Updated regex: handles optional table alias (e.g., a.col_name) and more operators
    const tokenRegex = /(?:[A-Z_]+\.)?([A-Z_]+)\s+(>=|<=|<>|!=|=|LIKE|>|<)\s+\?|(?:[A-Z_]+\.)?([A-Z_]+)\s+IN\s*\(([^)]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(upper)) !== null) {
      if (match[1] && match[2]) {
        // equality, comparison, or LIKE
        const col = match[1].toLowerCase();
        const rawOp = match[2];
        let op: Condition['op'];
        if (rawOp === 'LIKE') op = 'like';
        else if (rawOp === '>=' ) op = 'gte';
        else if (rawOp === '<=') op = 'lte';
        else if (rawOp === '>' ) op = 'gt';
        else if (rawOp === '<' ) op = 'lt';
        else if (rawOp === '!=' || rawOp === '<>') op = 'neq';
        else op = 'eq';
        conditions.push({ col, op, paramIdx: paramOffset });
        paramOffset++;
      } else if (match[3] && match[4]) {
        // IN (?, ?, ...) — only create condition when there are ? placeholders
        // Literal values like IN ('refund', 'adjustment') should be ignored
        const col = match[3].toLowerCase();
        const inContent = match[4];
        const questionCount = (inContent.match(/\?/g) || []).length;
        if (questionCount > 0) {
          const values = params.slice(paramOffset, paramOffset + questionCount);
          conditions.push({ col, op: 'in', values });
        }
        paramOffset += questionCount;
      }
    }

    if (conditions.length === 0 || params.length === 0) return rows;

    return rows.filter((row) =>
      conditions.every((cond) => {
        const value = row[cond.col];
        if (cond.op === 'in') {
          // eslint-disable-next-line eqeqeq
          return cond.values.some((v) => value == v);
        }
        const param = params[cond.paramIdx];
        if (cond.op === 'like') {
          const pattern = String(param).replace(/%/g, '');
          return String(value ?? '').toLowerCase().includes(pattern.toLowerCase());
        }
        if (cond.op === 'neq') {
          // eslint-disable-next-line eqeqeq
          return value != param;
        }
        if (cond.op === 'gte') return String(value ?? '') >= String(param);
        if (cond.op === 'lte') return String(value ?? '') <= String(param);
        if (cond.op === 'gt') return String(value ?? '') > String(param);
        if (cond.op === 'lt') return String(value ?? '') < String(param);
        // eslint-disable-next-line eqeqeq
        return value == param;
      }),
    );
  }

  /**
   * Handle aggregate queries — COUNT(*), COALESCE(SUM(...)), etc.
   * Returns { cnt: N, count: N, balance: 0, returned: 0 } as a sensible default.
   */
  function handleAggregate(
    sql: string,
    params: unknown[],
    table: string,
  ): Record<string, unknown> | null {
    const upper = sql.toUpperCase();

    if (/COUNT\s*\(\s*\*\s*\)/i.test(sql)) {
      const rows = tables[table] ?? [];
      const filtered = filterRows(sql, params, rows);
      return { cnt: filtered.length, count: filtered.length };
    }

    // Aggregate with COALESCE/SUM — sum actual rows instead of returning 0
    if (/COALESCE\s*\(|SUM\s*\(/i.test(sql)) {
      const rows = tables[table] ?? [];
      const filtered = filterRows(sql, params, rows);
      const total = filtered.reduce((sum, row) => {
        const amt = Number(row['amount'] ?? row['line_total'] ?? row['quantity'] ?? 0);
        return sum + (isNaN(amt) ? 0 : amt);
      }, 0);
      return { balance: total, returned: 0, new_total: total, cnt: filtered.length };
    }

    return null;
  }

  function buildBound(sql: string, params: unknown[]): MockBound {
    return {
      async all<T = Record<string, unknown>>() {
        queries.push({ sql, params, method: 'all' });
        const table = extractTableName(sql);
        const rows = table ? filterRows(sql, params, tables[table] ?? []) : [];
        // If universalFallback is on and query returned no rows, return a
        // single fallback row so handlers proceed to data-processing code
        if (rows.length === 0 && universalFallback && table) {
          return { results: [FALLBACK_ROW] as T[], success: true, meta: {} };
        }
        return { results: rows as T[], success: true, meta: {} };
      },
      async first<T = Record<string, unknown>>() {
        queries.push({ sql, params, method: 'first' });
        const table = extractTableName(sql);
        if (!table) return null;

        // Handle aggregate queries
        const agg = handleAggregate(sql, params, table);
        if (agg !== null) return agg as T;

        const rows = filterRows(sql, params, tables[table] ?? []);
        if (rows[0]) return rows[0] as T;
        // If universalFallback is on, return a generic row instead of null
        if (universalFallback) return FALLBACK_ROW as T;
        return null;
      },
      async run() {
        queries.push({ sql, params, method: 'run' });
        const rowId = ++_rowIdCounter;
        const upper = sql.replace(/\s+/g, ' ').trim().toUpperCase();
        let changes = 1; // default for INSERT
        // For UPDATE/DELETE, calculate changes based on matching rows
        if (upper.startsWith('UPDATE') || upper.startsWith('DELETE')) {
          const table = extractTableName(sql);
          if (table) {
            const rows = tables[table] ?? [];
            const filtered = filterRows(sql, params, rows);
            changes = filtered.length;
          } else {
            changes = 0;
          }
        }
        return {
          success: true,
          meta: {
            last_row_id: rowId,
            changes,
            duration: 0,
          },
        };
      },
    };
  }

  function buildStatement(sql: string) {
    return {
      bind(...params: unknown[]): MockBound {
        // Custom override hook
        if (queryOverride) {
          const override = queryOverride(sql, params);
          if (override !== null) {
            const bound: MockBound = {
              async all<T>() {
                queries.push({ sql, params, method: 'all' });
                return { results: (override.results ?? []) as T[], success: true, meta: {} };
              },
              async first<T>() {
                queries.push({ sql, params, method: 'first' });
                // Use override.first if set, otherwise fall back to first result row
                return (override.first ?? override.results?.[0] ?? null) as T | null;
              },
              async run() {
                queries.push({ sql, params, method: 'run' });
                return {
                  success: override.success ?? true,
                  meta: {
                    last_row_id: Number(override.meta?.last_row_id ?? ++_rowIdCounter),
                    changes: Number(override.meta?.changes ?? 1),
                    duration: 0,
                  },
                };
              },
            };
            return bound;
          }
        }
        return buildBound(sql, params);
      },
    };
  }

  const db = {
    prepare(sql: string) {
      return buildStatement(sql);
    },
    dump() {
      return Promise.resolve(new ArrayBuffer(0));
    },
    /** Execute a batch of statements — calls run() on each and records their queries */
    async batch(statements: Array<MockBound>) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
  } as unknown as D1Database;

  return {
    db,
    queries,
    reset() {
      queries.length = 0;
    },
  };
}

// ─── Mock KV Namespace ─────────────────────────────────────────────────────

export interface MockKV {
  kv: KVNamespace;
  store: Map<string, string>;
  reset(): void;
}

export function createMockKV(initial: Record<string, string> = {}): MockKV {
  const store = new Map<string, string>(Object.entries(initial));

  const kv = {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, _opts?: object): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async list(): Promise<{ keys: Array<{ name: string }> }> {
      return { keys: [...store.keys()].map((name) => ({ name })) };
    },
  } as unknown as KVNamespace;

  return {
    kv,
    store,
    reset() {
      store.clear();
      Object.entries(initial).forEach(([k, v]) => store.set(k, v));
    },
  };
}
