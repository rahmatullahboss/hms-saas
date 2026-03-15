## 2024-05-24 - Initial Review\n**Learning:** The dashboard stats endpoint (`/api/dashboard/stats`) has severe performance issues.\n**Action:** Optimize `dashboard.ts` by using aggregate queries instead of fetching full tables.
## 2024-03-12 - Memoize sorting and pagination in DataTable

**Learning:** Array sorting (`Array.prototype.sort`) mutates the array and sorting/slicing on every React render can be a major performance bottleneck, especially on dashboard data tables that are re-rendered frequently (e.g., when the current page or specific data properties change).
**Action:** Always wrap derived large computations like list sorting or pagination slices in `useMemo` hooks, keeping dependencies accurate to avoid unnecessary recalculations during unrelated re-renders.

## 2024-03-13 - [Fix N+1 query in Nurse Station dashboard]
**Learning:** Sequential queries in a loop (`for (const item of items) { await db.prepare(...) }`) over lists of entities (like `admissions`) lead to N+1 query problems and significantly increase response latency due to multiple network roundtrips to the D1 database.
**Action:** Always batch related queries using `c.env.DB.batch(statements)` when fetching related data for a list of items. Group the statements into an array and execute them concurrently in a single round-trip, then map the `batchResults` back to the original items.

## 2024-03-14 - Optimizing Promise.all in D1
**Learning:** In Cloudflare D1, `Promise.all` with multiple queries sends multiple HTTP requests, causing significant overhead. Using `c.env.DB.batch(statements)` sends a single network request. When converting `Promise.all` to `batch`, the array of prepared statements should not include `.first()` or `.all()`. The results are returned as an array of `D1Result` objects where `.results` must be accessed manually.
**Action:** Always prefer `c.env.DB.batch()` over `Promise.all()` for concurrent database queries in D1 to minimize network latency. When mapping the results, extract single rows via `batchResult.results[0]`.

## 2024-03-14 - [Fix N+1 query and atomicity issue in Pharmacy sales]
**Learning:** Executing sequential write queries (`UPDATE`, `INSERT`) inside a loop over a list of items (e.g., in a shopping cart or pharmacy sale) not only causes an N+1 query bottleneck but also loses database atomicity. If a query fails midway, data will be left in an inconsistent state.
**Action:** Collect all write queries across the entire loop into a single `batchStmts` array and execute them concurrently with `await c.env.DB.batch(batchStmts)` at the end. This guarantees both optimal performance (single round-trip) and transactional atomicity for the entire operation.
