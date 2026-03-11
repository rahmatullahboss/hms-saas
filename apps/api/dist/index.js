// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tenantMiddleware } from "./middleware/tenant";
import { authMiddleware } from "./middleware/auth";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/tenant/auth";
import patientRoutes from "./routes/tenant/patients";
import testRoutes from "./routes/tenant/tests";
import billingRoutes from "./routes/tenant/billing";
import pharmacyRoutes from "./routes/tenant/pharmacy";
import staffRoutes from "./routes/tenant/staff";
import dashboardRoutes from "./routes/tenant/dashboard";
import settingsRoutes from "./routes/tenant/settings";
import shareholderRoutes from "./routes/tenant/shareholders";
import seedRoutes from "./routes/seed";
import initRoutes from "./routes/init";
import accountingRoutes from "./routes/tenant/accounting";
import incomeRoutes from "./routes/tenant/income";
import expenseRoutes from "./routes/tenant/expenses";
import accountsRoutes from "./routes/tenant/accounts";
import reportsRoutes from "./routes/tenant/reports";
import auditRoutes from "./routes/tenant/audit";
import profitRoutes from "./routes/tenant/profit";
import journalRoutes from "./routes/tenant/journal";
import recurringRoutes from "./routes/tenant/recurring";
var app = new Hono();
app.use("*", cors());
app.use("*", logger());
app.get("/", (c) => c.json({
  message: "HMS API Running",
  version: "1.0.0",
  timestamp: (/* @__PURE__ */ new Date()).toISOString()
}));
app.get("/health", (c) => c.json({ status: "ok" }));
app.use("/api/auth/*", tenantMiddleware);
app.route("/api/auth", authRoutes);
app.route("/api/seed", seedRoutes);
app.route("/api/init", initRoutes);
app.route("/api/admin", adminRoutes);
app.use("/api/*", tenantMiddleware);
app.use("/api/*", authMiddleware);
app.route("/api/patients", patientRoutes);
app.route("/api/tests", testRoutes);
app.route("/api/billing", billingRoutes);
app.route("/api/pharmacy", pharmacyRoutes);
app.route("/api/staff", staffRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/shareholders", shareholderRoutes);
app.route("/api/accounting", accountingRoutes);
app.route("/api/income", incomeRoutes);
app.route("/api/expenses", expenseRoutes);
app.route("/api/accounts", accountsRoutes);
app.route("/api/reports", reportsRoutes);
app.route("/api/audit", auditRoutes);
app.route("/api/profit", profitRoutes);
app.route("/api/journal", journalRoutes);
app.route("/api/recurring", recurringRoutes);
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("Error:", err);
  return c.json({ error: err.message }, 500);
});
var src_default = app;
export {
  src_default as default
};
