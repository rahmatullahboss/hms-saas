# P2 Known Issues — Lab Module & System-Wide

> Identified during adversarial code review (2026-03-13). Deferred as acceptable for current scale.

---

## 1. Race Condition on `getNextSequence`

**Scope**: System-wide (Lab, Billing, Pharmacy, Patients)
**File**: [`apps/api/src/lib/sequence.ts`](file:///Users/rahmatullahzisan/Desktop/Dev/hms/hms-saas/apps/api/src/lib/sequence.ts)

**Problem**: Two simultaneous requests can generate duplicate sequence numbers because the read-then-write pattern is not atomic.

```
Request A: reads max = 5 → writes 6
Request B: reads max = 5 → writes 6  ← DUPLICATE
```

**Impact**: Low — current user base is small; concurrent order creation is rare.

**Fix Options**:
1. Use D1 transaction with `UPDATE sequences SET val = val + 1 WHERE ... RETURNING val`
2. Add a `UNIQUE` constraint on order numbers so duplicates fail with a retry loop
3. Use a UUID-based order numbering scheme

**Priority**: Fix when scaling to 10+ concurrent users per tenant.

---

## 2. Approximate Critical Threshold in `detectAbnormalFlag`

**File**: [`apps/api/src/routes/tenant/lab.ts`](file:///Users/rahmatullahzisan/Desktop/Dev/hms/hms-saas/apps/api/src/routes/tenant/lab.ts) (lines 39-41)

**Problem**: Critical thresholds are computed as `2× the normal range width`, which is a rough heuristic — not clinically accurate.

```typescript
const criticalLow = low - (high - low);    // e.g., for 70-100 → critical < 40
const criticalHigh = high + (high - low);  // e.g., for 70-100 → critical > 130
```

For narrow-range tests (e.g., Potassium 3.5-5.0), critical = `<2.0` / `>6.5` — reasonable but not precise.

**Fix**: Add `critical_low` and `critical_high` columns to `lab_test_catalog` for test-specific critical values.

```sql
ALTER TABLE lab_test_catalog ADD COLUMN critical_low REAL;
ALTER TABLE lab_test_catalog ADD COLUMN critical_high REAL;
```

**Priority**: Fix when onboarding pathology labs with strict clinical reporting requirements.

---

## 3. No Pagination on Lab Queue Endpoint

**File**: [`apps/api/src/routes/tenant/lab.ts`](file:///Users/rahmatullahzisan/Desktop/Dev/hms/hms-saas/apps/api/src/routes/tenant/lab.ts) (line 173)

**Problem**: `GET /orders/queue/today` returns ALL lab items for today without `LIMIT`/`OFFSET`. For high-volume labs (200+ tests/day), response size and query time will degrade.

**Impact**: Low — target market is small-medium diagnostic centers (20-80 tests/day).

**Fix**: Add `?page=1&limit=50` query params with:
```typescript
const page = parseInt(c.req.query('page') ?? '1');
const limit = parseInt(c.req.query('limit') ?? '50');
const offset = (page - 1) * limit;
// ... append `LIMIT ? OFFSET ?` to query
```

**Priority**: Fix when onboarding labs processing 100+ tests/day.

---

## Quick Reference

| # | Issue | Scope | Status |
|---|-------|-------|--------|
| 1 | Sequence race condition | System-wide | Deferred (10+ concurrent users) |
| 2 | Approximate critical thresholds | Lab | Deferred (strict clinical labs) |
| 3 | No pagination on queue | Lab | Deferred (100+ tests/day labs) |
| 4 | Missing tenant_id in billing JOINs | Billing | **Fixed** (2026-03-13) |
| 5 | Unsafe toLocaleString in BillingDashboard | Frontend | **Fixed** (2026-03-13) |
| 6 | Recharts dimension warnings | Frontend | **Fixed** (2026-03-13) |

---

## 4. Missing Tenant Isolation in Billing JOINs — ✅ Fixed

**Files**: `billing.ts` (list, due, detail endpoints)

**Problem**: `JOIN patients p ON b.patient_id = p.id` lacked `AND p.tenant_id = b.tenant_id`, risking cross-tenant data leaks. Error logging was suppressed with empty `catch` blocks.

**Fix**: Added tenant_id filter to all JOIN clauses + `console.error` before re-throwing.

---

## 5. Unsafe `.toLocaleString()` in BillingDashboard — ✅ Fixed

**File**: `BillingDashboard.tsx`

**Problem**: `bill.total_amount.toLocaleString()` crashed with `TypeError` when API returned null fields.

**Fix**: Added `?? 0` null coalescing before all `.toLocaleString()` calls.

---

## 6. Recharts Dimension Warnings — ✅ Fixed

**File**: `HospitalAdminDashboard.tsx`

**Problem**: `ResponsiveContainer` logged width/height = -1 warnings during initial render.

**Fix**: Added `minHeight={0}` prop to suppress the warning.
