## 2024-05-24 - Missing Authorization on Mutation Endpoints
**Vulnerability:** Mutation endpoints (POST, PUT, PATCH, DELETE) lacked authorization middleware, allowing any authenticated user to perform sensitive actions like creating admissions or modifying doctor schedules.
**Learning:** In the Hono framework without global role-based middleware, it's crucial to explicitly check `c.get('role')` within each endpoint handler and validate it against an array of permitted roles before processing the request.
**Prevention:** Always verify the user's role and ensure it matches the authorized roles for the specific action before performing any state-changing operations on the database.
