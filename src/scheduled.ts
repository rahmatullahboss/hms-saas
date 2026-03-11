export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 0 * * *') {
      await processRecurringExpenses(env);
    }
  }
};

async function processRecurringExpenses(env: Env): Promise<void> {
  console.log('Running recurring expenses job...');

  try {
    // Get all active tenants
    const tenants = await env.DB.prepare(
      'SELECT id FROM tenants WHERE status = ?'
    ).bind('active').all<{ id: number }>();

    for (const tenant of tenants.results) {
      const tenantId = tenant.id.toString();

      // Resolve a valid system user for this tenant (first hospital_admin)
      // This replaces the old hardcoded `created_by = 1` which could reference
      // a non-existent user if the tenant's first user was deleted.
      const systemUser = await env.DB.prepare(
        `SELECT id FROM users WHERE tenant_id = ? AND role = 'hospital_admin' ORDER BY id ASC LIMIT 1`
      ).bind(tenantId).first<{ id: number }>();

      if (!systemUser) {
        console.warn(`No hospital_admin found for tenant ${tenantId} — skipping recurring expenses`);
        continue;
      }

      const systemUserId = systemUser.id;

      // Get all active recurring expenses due today or overdue
      const today = new Date().toISOString().split('T')[0];

      const recurringExpenses = await env.DB.prepare(`
        SELECT r.*, ec.name as category_name
        FROM recurring_expenses r
        LEFT JOIN expense_categories ec ON r.category_id = ec.id
        WHERE r.tenant_id = ? AND r.is_active = 1 AND r.next_run_date <= ?
      `).bind(tenantId, today).all<{
        id: number;
        amount: number;
        description: string;
        frequency: string;
        next_run_date: string;
        category_name: string;
      }>();

      for (const recurring of recurringExpenses.results) {
        try {
          // Insert expense + update next_run_date atomically
          const nextRunDate = computeNextRunDate(recurring.next_run_date, recurring.frequency);

          await env.DB.batch([
            env.DB.prepare(`
              INSERT INTO expenses (date, category, amount, description, status, tenant_id, created_by, approved_by, approved_at)
              VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, datetime('now'))
            `).bind(
              today,
              recurring.category_name,
              recurring.amount,
              `Recurring: ${recurring.description || `expense #${recurring.id}`}`,
              tenantId,
              systemUserId,
              systemUserId
            ),
            env.DB.prepare(`
              UPDATE recurring_expenses SET next_run_date = ? WHERE id = ? AND tenant_id = ?
            `).bind(nextRunDate, recurring.id, tenantId),
          ]);

          console.log(`Created recurring expense for tenant ${tenantId} (next run: ${nextRunDate})`);
        } catch (expenseError) {
          console.error(`Error creating expense for recurring ${recurring.id}:`, expenseError);
        }
      }
    }

    console.log('Recurring expenses job completed');
  } catch (error) {
    console.error('Error in recurring expenses job:', error);
  }
}

/**
 * Calculate the next run date for a recurring expense.
 * Handles daily, weekly, and monthly frequencies.
 */
function computeNextRunDate(currentDate: string, frequency: string): string {
  const d = new Date(currentDate);
  if (frequency === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else {
    // monthly (default)
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

// ─── Local Env interface (DASHBOARD_DO removed) ───────────────────────────────
interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPLOADS: R2Bucket;
  ENVIRONMENT: string;
  JWT_SECRET: string;
}
