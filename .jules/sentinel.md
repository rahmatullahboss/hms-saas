## 2024-05-24 - Missing Authorization on Mutation Endpoints
**Vulnerability:** Mutation endpoints (POST, PUT, PATCH, DELETE) lacked authorization middleware, allowing any authenticated user to perform sensitive actions like creating admissions or modifying doctor schedules.
**Learning:** In the Hono framework without global role-based middleware, it's crucial to explicitly check `c.get('role')` within each endpoint handler and validate it against an array of permitted roles before processing the request.
**Prevention:** Always verify the user's role and ensure it matches the authorized roles for the specific action before performing any state-changing operations on the database.

## 2024-05-25 - Missing Authorization on Admin Endpoints
**Vulnerability:** The admin endpoints under `/api/admin/*` were only protected by authentication middleware, but lacked role-based authorization. Any authenticated user with a valid JWT could access sensitive admin operations like managing hospitals and usage stats.
**Learning:** In Hono, when an entire sub-router needs to be restricted to a specific role, relying solely on global authentication middleware is insufficient. The authentication middleware sets the user context, but it does not restrict access based on the role.
**Prevention:** Implement endpoint-level role checks or add an authorization middleware within the specific sub-router. When applying an authorization middleware to a sub-router, explicitly exempt public routes (like `/login`) within that sub-router using robust path matching (e.g., `path.endsWith('/login')`) rather than hardcoded absolute paths to prevent brittle access controls.

## 2025-03-21 - Unused Security Utilities
**Vulnerability:** A local `isStrongPassword` utility function existed in the `security.ts` middleware file to validate passwords (min 8 chars, 1 uppercase, 1 lowercase, 1 number), but it was completely unused in the authentication/registration endpoints, enabling the creation of weak user passwords.
**Learning:** Having security-focused code in the repository without actively integrating it into validation pipelines creates a false sense of security. Utility functions like password strength validators must be wired into the request schema validations (e.g., Zod's `.refine()`) to actually protect the application.
**Prevention:** Always verify that security enhancements (like password policies, input sanitizers) are actively consumed in the relevant routing or validation schemas, rather than just existing as standalone logic blocks.
