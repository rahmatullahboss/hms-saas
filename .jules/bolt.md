## 2024-05-24 - Initial Review\n**Learning:** The dashboard stats endpoint (`/api/dashboard/stats`) has severe performance issues.\n**Action:** Optimize `dashboard.ts` by using aggregate queries instead of fetching full tables.
## 2024-03-12 - Memoize sorting and pagination in DataTable

**Learning:** Array sorting (`Array.prototype.sort`) mutates the array and sorting/slicing on every React render can be a major performance bottleneck, especially on dashboard data tables that are re-rendered frequently (e.g., when the current page or specific data properties change).
**Action:** Always wrap derived large computations like list sorting or pagination slices in `useMemo` hooks, keeping dependencies accurate to avoid unnecessary recalculations during unrelated re-renders.
