import { Hono } from 'hono';

const seedRoutes = new Hono<{
  Bindings: {
    DB: D1Database;
    ENVIRONMENT: string;
  };
}>();


// ⚠️  SAFETY: seed routes are guarded by TWO checks:
//   1. Runtime: ENVIRONMENT must equal 'development'
//   2. Compile-time: ALLOW_SEED must be true (set this only in local dev builds)
// Never set ALLOW_SEED = true in production code.
const ALLOW_SEED = true; // <── flip to `false` before ANY production build



seedRoutes.post('/dev', async (c) => {
  if (!ALLOW_SEED || c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Seed only works in development' }, 403);
  }

  try {
    // Create super admin
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO users (email, password_hash, name, role, tenant_id) VALUES (?, ?, ?, ?, ?)'
    ).bind('admin@hms.com', 'hashed_admin123', 'Super Admin', 'super_admin', null).run();

    // Create sample hospital
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO tenants (id, name, subdomain, status, plan) VALUES (?, ?, ?, ?, ?)'
    ).bind(1, 'General Hospital', 'general', 'active', 'basic').run();

    // Create hospital users
    const users = [
      { email: 'hospital@general.com', name: 'Hospital Admin', role: 'hospital_admin' },
      { email: 'lab@general.com', name: 'Lab Technician', role: 'laboratory' },
      { email: 'reception@general.com', name: 'Receptionist', role: 'reception' },
      { email: 'md@general.com', name: 'Managing Director', role: 'md' },
      { email: 'director@general.com', name: 'Director', role: 'director' },
    ];

    for (const user of users) {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO users (email, password_hash, name, role, tenant_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(user.email, 'hashed_hospital123', user.name, user.role, 1).run();
    }

    // Create sample patients
    const patients = [
      { name: 'Rahim Khan', father: 'Karim Khan', address: 'Dhaka', mobile: '01711111111' },
      { name: 'Karim Khan', father: 'Rahim Khan', address: 'Chittagong', mobile: '01722222222' },
      { name: 'Fatema Begum', father: 'Ahmed Khan', address: 'Sylhet', mobile: '01733333333' },
    ];

    for (const patient of patients) {
      await c.env.DB.prepare(
        'INSERT INTO patients (name, father_husband, address, mobile, tenant_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(patient.name, patient.father, patient.address, patient.mobile, 1).run();
    }

    // Create sample medicines
    const medicines = [
      { name: 'Paracetamol 500mg', company: 'Square Pharma', price: 2, qty: 1000 },
      { name: 'Amoxicillin 250mg', company: 'Beximco', price: 5, qty: 500 },
      { name: 'Metronidazole 400mg', company: 'Incepta', price: 3, qty: 800 },
    ];

    for (const med of medicines) {
      await c.env.DB.prepare(
        'INSERT INTO medicines (name, company, unit_price, quantity, tenant_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(med.name, med.company, med.price, med.qty, 1).run();
    }

    // Create sample staff
    const staff = [
      { name: 'Nurse Joya', position: 'Nurse', salary: 15000, address: 'Dhaka', bank: '1234567890', mobile: '01744444444' },
      { name: 'Nurse Rina', position: 'Nurse', salary: 15000, address: 'Dhaka', bank: '1234567891', mobile: '01755555555' },
      { name: 'Guard Alam', position: 'Security', salary: 10000, address: 'Dhaka', bank: '1234567892', mobile: '01766666666' },
    ];

    for (const s of staff) {
      await c.env.DB.prepare(
        'INSERT INTO staff (name, position, salary, address, bank_account, mobile, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(s.name, s.position, s.salary, s.address, s.bank, s.mobile, 1).run();
    }

    // Create sample shareholders
    const shareholders = [
      { name: 'Partner 1', type: 'profit', shares: 3, investment: 300000, phone: '01711111111', address: 'Dhaka' },
      { name: 'Partner 2', type: 'profit', shares: 3, investment: 300000, phone: '01722222222', address: 'Chittagong' },
      { name: 'Partner 3', type: 'profit', shares: 3, investment: 300000, phone: '01733333333', address: 'Sylhet' },
      { name: 'Owner 1', type: 'owner', shares: 50, investment: 5000000, phone: '01777777777', address: 'Dhaka' },
      { name: 'Owner 2', type: 'owner', shares: 100, investment: 10000000, phone: '01788888888', address: 'Dhaka' },
    ];

    for (const sh of shareholders) {
      await c.env.DB.prepare(
        'INSERT INTO shareholders (name, type, share_count, investment, phone, address, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(sh.name, sh.type, sh.shares, sh.investment, sh.phone, sh.address, 1).run();
    }

    // Create settings
    const settings = [
      { key: 'share_price', value: '100000' },
      { key: 'total_shares', value: '300' },
      { key: 'profit_percentage', value: '30' },
      { key: 'profit_partner_count', value: '100' },
      { key: 'owner_partner_count', value: '200' },
      { key: 'shares_per_profit_partner', value: '3' },
      { key: 'fire_service_charge', value: '50' },
      { key: 'ambulance_charge', value: '500' },
    ];

    for (const setting of settings) {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO settings (key, value, tenant_id) VALUES (?, ?, ?)'
      ).bind(setting.key, setting.value, 1).run();
    }

    return c.json({
      message: 'Seed data created successfully!',
      hospital: 'general.yourdomain.com',
      // Credentials NOT returned in response for security — check seed code for defaults
    });
  } catch (error) {
    console.error('Seed error:', error);
    return c.json({ error: 'Seed failed', details: String(error) }, 500);
  }
});

seedRoutes.post('/accounting', async (c) => {
  if (!ALLOW_SEED || c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Seed only works in development' }, 403);
  }

  try {
    // Create tables using prepare instead of exec to avoid issues
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        tenant_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id INTEGER,
        is_active INTEGER DEFAULT 1,
        tenant_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        description TEXT,
        debit_account_id INTEGER,
        credit_account_id INTEGER,
        amount REAL NOT NULL,
        created_by INTEGER,
        tenant_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        user_id INTEGER,
        action TEXT NOT NULL,
        table_name TEXT,
        record_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        frequency TEXT NOT NULL,
        next_run_date DATE NOT NULL,
        end_date DATE,
        is_active INTEGER DEFAULT 1,
        created_by INTEGER,
        tenant_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Recreate income table with correct schema
    try {
      await c.env.DB.prepare('DROP TABLE IF EXISTS income').run();
    } catch (e) {}
    
    await c.env.DB.prepare(`
      CREATE TABLE income (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('pharmacy', 'laboratory', 'doctor_visit', 'admission', 'operation', 'ambulance', 'other')),
        amount REAL NOT NULL,
        description TEXT,
        bill_id INTEGER,
        tenant_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER
      )
    `).run();

    // Recreate expenses table
    try {
      await c.env.DB.prepare('DROP TABLE IF EXISTS expenses').run();
    } catch (e) {}
    
    await c.env.DB.prepare(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'rejected')),
        approved_by INTEGER,
        approved_at DATETIME,
        tenant_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER
      )
    `).run();

    const categories = [
      { name: 'Staff Salary', code: 'SALARY' },
      { name: 'Medicine Purchase', code: 'MEDICINE' },
      { name: 'Rent', code: 'RENT' },
      { name: 'Electricity', code: 'ELECTRICITY' },
      { name: 'Water Supply', code: 'WATER' },
      { name: 'Internet & Phone', code: 'COMMUNICATION' },
      { name: 'Maintenance', code: 'MAINTENANCE' },
      { name: 'Medical Supplies', code: 'SUPPLIES' },
      { name: 'Marketing', code: 'MARKETING' },
      { name: 'Bank Charges', code: 'BANK' },
      { name: 'Miscellaneous', code: 'MISC' },
    ];

    for (const cat of categories) {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO expense_categories (name, code, tenant_id) VALUES (?, ?, ?)'
      ).bind(cat.name, cat.code, 1).run();
    }

    const accounts = [
      { code: '1000', name: 'Cash', type: 'asset' },
      { code: '1100', name: 'Bank', type: 'asset' },
      { code: '1200', name: 'Receivables', type: 'asset' },
      { code: '2000', name: 'Payables', type: 'liability' },
      { code: '3000', name: 'Capital', type: 'equity' },
      { code: '4000', name: 'Pharmacy Income', type: 'income' },
      { code: '4100', name: 'Laboratory Income', type: 'income' },
      { code: '4200', name: 'Doctor Visit Income', type: 'income' },
      { code: '5000', name: 'Salary Expense', type: 'expense' },
      { code: '5100', name: 'Medicine Expense', type: 'expense' },
      { code: '5200', name: 'Rent Expense', type: 'expense' },
    ];

    for (const acc of accounts) {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO chart_of_accounts (code, name, type, tenant_id) VALUES (?, ?, ?, ?)'
      ).bind(acc.code, acc.name, acc.type, 1).run();
    }

    // Add sample income data - using valid source values
    const incomes = [
      { date: '2026-03-10', source: 'pharmacy', amount: 5000, description: 'Medicine sales' },
      { date: '2026-03-10', source: 'laboratory', amount: 8000, description: 'Lab tests' },
      { date: '2026-03-09', source: 'doctor_visit', amount: 3000, description: 'Consultation fees' },
      { date: '2026-03-08', source: 'pharmacy', amount: 4500, description: 'Medicine sales' },
      { date: '2026-03-07', source: 'admission', amount: 15000, description: 'Patient admission' },
    ];

    for (const inc of incomes) {
      await c.env.DB.prepare(
        'INSERT INTO income (date, source, amount, description, tenant_id, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(inc.date, inc.source, inc.amount, inc.description, 1, 7).run();
    }

    // Add sample expense data
    const expenses = [
      { date: '2026-03-10', category: 'SALARY', amount: 25000, description: 'Staff salary', status: 'approved' },
      { date: '2026-03-10', category: 'MEDICINE', amount: 12000, description: 'Medicine purchase', status: 'approved' },
      { date: '2026-03-09', category: 'RENT', amount: 30000, description: 'Monthly rent', status: 'approved' },
      { date: '2026-03-08', category: 'ELECTRICITY', amount: 8000, description: 'Electricity bill', status: 'approved' },
      { date: '2026-03-07', category: 'MAINTENANCE', amount: 5000, description: 'Equipment maintenance', status: 'approved' },
    ];

    for (const exp of expenses) {
      await c.env.DB.prepare(
        'INSERT INTO expenses (date, category, amount, description, status, tenant_id, created_by, approved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(exp.date, exp.category, exp.amount, exp.description, exp.status, 1, 7, 7).run();
    }

    return c.json({ message: 'Accounting tables and sample data created successfully!' });
  } catch (error) {
    console.error('Seed error:', error);
    return c.json({ error: 'Seed failed', details: String(error) }, 500);
  }
});

export default seedRoutes;
