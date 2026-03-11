// accounting-helpers.ts — shared audit + dashboard notification utilities

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPLOADS: R2Bucket;
  // Note: DASHBOARD_DO was removed — Durable Object not yet registered in wrangler.toml
  // Add it back when the DO class is implemented and the binding is configured.
  ENVIRONMENT: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function notifyDashboard(
  env: Env,
  tenantId: string,
  type: 'income' | 'expense',
  amount: number,
  isToday: boolean = true,
  isMTD: boolean = true
): Promise<void> {
  // DASHBOARD_DO binding is not yet configured — this is a future feature.
  // Will be implemented when a DurableObject class is created and registered.
}



export async function createAuditLog(
  env: Env,
  tenantId: string,
  userId: string,
  action: string,
  tableName: string,
  recordId: number,
  oldValue?: any,
  newValue?: any,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId,
      userId,
      action,
      tableName,
      recordId,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress || null,
      userAgent || null
    ).run();
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}
