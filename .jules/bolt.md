## 2024-05-24 - Initial Review\n**Learning:** The dashboard stats endpoint (`/api/dashboard/stats`) has severe performance issues.\n**Action:** Optimize `dashboard.ts` by using aggregate queries instead of fetching full tables.
## 2024-03-12 - Memoize sorting and pagination in DataTable

**Learning:** Array sorting (`Array.prototype.sort`) mutates the array and sorting/slicing on every React render can be a major performance bottleneck, especially on dashboard data tables that are re-rendered frequently (e.g., when the current page or specific data properties change).
**Action:** Always wrap derived large computations like list sorting or pagination slices in `useMemo` hooks, keeping dependencies accurate to avoid unnecessary recalculations during unrelated re-renders.

## 2024-03-13 - [Fix N+1 query in Nurse Station dashboard]
**Learning:** Sequential queries in a loop (`for (const item of items) { await db.prepare(...) }`) over lists of entities (like `admissions`) lead to N+1 query problems and significantly increase response latency due to multiple network roundtrips to the D1 database.
**Action:** Always batch related queries using `c.env.DB.batch(statements)` when fetching related data for a list of items. Group the statements into an array and execute them concurrently in a single round-trip, then map the `batchResults` back to the original items.
