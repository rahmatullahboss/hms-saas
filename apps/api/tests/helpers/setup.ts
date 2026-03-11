import { env } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';

import { testSchema } from './db_schema';

export async function setupDb() {
  const db = env.DB;
  
  const cleanSchema = testSchema.replace(/--.*$/gm, '');
  const statements = cleanSchema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
    
  for (const sql of statements) {
    try {
      if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE') || sql.includes('CREATE INDEX') || sql.includes('INSERT')) {
        await db.prepare(sql).run();
      }
    } catch (err: any) {
      if (err.message && err.message.includes('duplicate column name')) {
        // Ignore alter table errors
      } else {
        console.error('Error executing SQL:', sql, err);
      }
    }
  }
}

beforeAll(async () => {
  await setupDb();
});

beforeEach(async () => {
  // Clear tables between tests
  const tables = [
    'invoice_items', 'payments', 'income', 'expenses', 'bills', 
    'medicine_stock_movements', 'medicine_stock_batches', 'medicine_purchase_items', 'medicine_purchases',
    'medicines', 'patients', 'sequence_counters', 'users', 'tenants'
  ];
  for (const table of tables) {
    try {
      await env.DB.exec(`DELETE FROM ${table};`);
    } catch (e) {
      // Ignore if table doesn't exist yet in the cleanup loop
    }
  }
  
  // Insert default tenant
  await env.DB.prepare(
    'INSERT INTO tenants (id, name, subdomain) VALUES (1, "Test Clinic", "test")'
  ).run();
});
