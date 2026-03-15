// accounting-helpers.ts — shared audit + dashboard notification utilities

export async function notifyDashboard(
  env: { DASHBOARD_DO?: DurableObjectNamespace },
  tenantId: string,
  type: 'income' | 'expense',
  amount: number,
  isToday: boolean = true,
  isMTD: boolean = true
): Promise<void> {
  // Fire-and-forget: dashboard notification failures must never break the main flow
  try {
    if (!env.DASHBOARD_DO) return;
    const doId = env.DASHBOARD_DO.idFromName(tenantId);
    const doStub = env.DASHBOARD_DO.get(doId) as DurableObjectStub & {
      updateIncome?: (amount: number, isToday: boolean, isMTD: boolean) => Promise<void>;
      updateExpense?: (amount: number, isToday: boolean, isMTD: boolean) => Promise<void>;
    };

    if (type === 'income' && doStub.updateIncome) {
      await doStub.updateIncome(amount, isToday, isMTD);
    } else if (type === 'expense' && doStub.updateExpense) {
      await doStub.updateExpense(amount, isToday, isMTD);
    }
  } catch (error) {
    console.error('Error notifying dashboard:', error);
  }
}

export async function createAuditLog(
  env: { DB: D1Database },
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
