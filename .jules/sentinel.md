## 2026-03-12 - [Missing Super Admin Auth Check]
**Vulnerability:** The `/api/admin/*` routes in `src/index.ts` only validated if a JWT was present, but failed to verify if the user actually held the `super_admin` role. This allowed any authenticated user to access super admin routes.
**Learning:** In Hono, when using a catch-all auth middleware for a group of routes, be very careful to also apply role-based authorization checks. Checking for token validity is not enough when routes require elevated privileges.
**Prevention:** Always combine authentication middleware with authorization (role-checking) logic for sensitive route groups, especially admin or super admin sections.
## 2025-03-10 - Fix missing authorization on tenant settings routes
**Vulnerability:** Missing authorization on tenant settings routes `PUT /api/settings/:key` and `PUT /api/settings`
**Learning:** Any authenticated user with a valid JWT could update critical hospital settings like `share_price` and `profit_percentage` because the settings routes lacked role checks.
**Prevention:** Explicitly verify the user's role (`c.get('role')`) in the route handler against authorized roles (`hospital_admin`, `director`, `md`) before proceeding with the update.
