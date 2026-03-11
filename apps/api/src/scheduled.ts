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
    // Get all tenants
    const tenants = await env.DB.prepare(
      'SELECT id FROM tenants WHERE status = ?'
    ).bind('active').all<{ id: number }>();

    for (const tenant of tenants.results) {
      const tenantId = tenant.id.toString();
      
      // Get all active recurring expenses due today
      const today = new Date().toISOString().split('T')[0];
      
      const recurringExpenses = await env.DB.prepare(`
        SELECT r.*, ec.name as category_name
        FROM recurring_expenses r
        LEFT JOIN expense_categories ec ON r.category_id = ec.id
        WHERE r.tenant_id = ? AND r.is_active = 1 AND r.next_run_date <= ?
      `).bind(tenantId, today).all<any>();

      for (const recurring of recurringExpenses.results) {
        try {
          // Create the expense
          const expenseResult = await env.DB.prepare(`
            INSERT INTO expenses (date, category, amount, description, status, tenant_id, created_by, approved_by, approved_at)
            VALUES (?, ?, ?, ?, 'approved', ?, 1, 1, datetime('now'))
          `).bind(
            today,
            recurring.category_name,
            recurring.amount,
            `Recurring expense - ${recurring.description || recurring.id}`,
            tenantId
          ).run();

          // Calculate next run date
          let nextRunDate = new Date(recurring.next_run_date);
          if (recurring.frequency === 'daily') {
            nextRunDate.setDate(nextRunDate.getDate() + 1);
          } else if (recurring.frequency === 'weekly') {
            nextRunDate.setDate(nextRunDate.getDate() + 7);
          } else if (recurring.frequency === 'monthly') {
            nextRunDate.setMonth(nextRunDate.getMonth() + 1);
          }

          // Update next run date
          await env.DB.prepare(`
            UPDATE recurring_expenses SET next_run_date = ? WHERE id = ? AND tenant_id = ?
          `).bind(nextRunDate.toISOString().split('T')[0], recurring.id, tenantId).run();

          // Notify dashboard
          try {
            const doId = env.DASHBOARD_DO.idFromName(tenantId);
            const doStub = env.DASHBOARD_DO.get(doId);
            await doStub.updateExpense(recurring.amount, true, true);
          } catch (doError) {
            console.error('Error notifying dashboard:', doError);
          }

          console.log(`Created recurring expense ${expenseResult.meta.last_row_id} for tenant ${tenantId}`);
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

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UPLOADS: R2Bucket;
  DASHBOARD_DO: DurableObjectNamespace;
  ENVIRONMENT: string;
}
