-- =============================================================================
-- HMS SaaS — Demo Hospital Seed
-- Hospital: "City Care General Hospital" | Slug: demo-hospital
-- Run: npx wrangler d1 execute DB --remote --file=migrations/seed_demo.sql
--
-- Demo Login Credentials (password: Demo@1234)
-- ┌─────────────────┬───────────────────────────────────┬──────────────────┐
-- │ Role            │ Email                             │ Password         │
-- ├─────────────────┼───────────────────────────────────┼──────────────────┤
-- │ hospital_admin  │ admin@demo-hospital.com           │ Demo@1234        │
-- │ laboratory      │ lab@demo-hospital.com             │ Demo@1234        │
-- │ reception       │ reception@demo-hospital.com       │ Demo@1234        │
-- │ pharmacist      │ pharmacy@demo-hospital.com        │ Demo@1234        │
-- │ md              │ md@demo-hospital.com              │ Demo@1234        │
-- │ director        │ director@demo-hospital.com        │ Demo@1234        │
-- │ accountant      │ accounts@demo-hospital.com        │ Demo@1234        │
-- └─────────────────┴───────────────────────────────────┴──────────────────┘
-- =============================================================================

-- Disable FK checks during seed to avoid insert-order issues


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TENANT
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO tenants (id, name, subdomain, status, plan, created_at)
VALUES (100, 'City Care General Hospital', 'demo-hospital', 'active', 'enterprise', '2026-01-01 08:00:00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. USERS (all roles) — password hash for "Demo@1234"
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, tenant_id, created_at) VALUES
(101, 'admin@demo-hospital.com',       '$2a$10$TSWUwM6yb1jpP.bUwWaky.9fyI/7E5wOGU6QU2cxUZcN5yNkwppNu', 'Dr. Aminul Islam',    'hospital_admin', 100, '2026-01-01 08:00:00'),
(102, 'lab@demo-hospital.com',         '$2a$10$a55D9eVSqNOuYupSKfeh4uGDUU3jDzGbIugPnUzF5qB4YH7cXWHui', 'Razia Begum',         'laboratory',     100, '2026-01-01 08:30:00'),
(103, 'reception@demo-hospital.com',   '$2a$10$LjKUt4yfyCIcVd6uiJU1xeuzFaW4jF7g5IKXpcbWJyQfU1aA25vd6', 'Shopna Akter',        'reception',      100, '2026-01-01 08:30:00'),
(104, 'pharmacy@demo-hospital.com',    '$2a$10$tfBJe/AbjSz34ltTSjVofuTE1NheIYznqDVqcNxo.3hxePcas9/Ti', 'Kamal Hossain',       'pharmacist',     100, '2026-01-01 08:30:00'),
(105, 'md@demo-hospital.com',          '$2a$10$vdI4NCcmwPkY3XNdQfZQiuE.NxHXcCIvSXJa8cMVjBwZJTqMyr5aa', 'Dr. Md. Shahinur',    'md',             100, '2026-01-01 08:30:00'),
(106, 'director@demo-hospital.com',    '$2a$10$4ksoSbKMObDpjXcExiuCUuKmKE36TzakfedkF/QzeJLJzRQxGpUQO', 'Dr. Nasrin Sultana',  'director',       100, '2026-01-01 08:30:00'),
(107, 'accounts@demo-hospital.com',    '$2a$10$zpg490CcRL6Yp2MhQEvfgOx0aJFCFd4MOt/eF2A/96R0OxCLZtQtO', 'Milon Mahmud',        'accountant',     100, '2026-01-01 08:30:00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DOCTORS (10 doctors)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO doctors (id, name, specialty, mobile_number, consultation_fee, is_active, tenant_id) VALUES
(101, 'Dr. Aminul Islam',    'General Medicine',         '01711000001', 50000,  1, 100),
(102, 'Dr. Fatema Khatun',   'Gynaecology & Obstetrics', '01711000002', 80000,  1, 100),
(103, 'Dr. Rafiqul Haque',   'Cardiology',               '01711000003', 100000, 1, 100),
(104, 'Dr. Sharmin Akter',   'Paediatrics',              '01711000004', 60000,  1, 100),
(105, 'Dr. Mizanur Rahman',  'Orthopaedics',             '01711000005', 80000,  1, 100),
(106, 'Dr. Nasreen Jahan',   'Dermatology',              '01711000006', 70000,  1, 100),
(107, 'Dr. Golam Rabbani',   'ENT',                      '01711000007', 60000,  1, 100),
(108, 'Dr. Sayeda Khanam',   'Ophthalmology',            '01711000008', 60000,  1, 100),
(109, 'Dr. Anwar Hossain',   'Nephrology',               '01711000009', 90000,  1, 100),
(110, 'Dr. Tahmina Sultana', 'Psychiatry',               '01711000010', 70000,  1, 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PATIENTS (20 realistic patients)
-- Schema: id, patient_code, name, father_husband, address, mobile, guardian_mobile, age, gender, blood_group, tenant_id
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO patients (id, patient_code, name, father_husband, address, mobile, guardian_mobile, age, gender, blood_group, tenant_id, created_at) VALUES
(1001, 'P-001', 'Mohammad Ali',      'Abdul Ali',        'Mirpur-10, Dhaka',        '01811000001', '01911000001', 51, 'male',   'B+',  100, '2026-01-05 09:00:00'),
(1002, 'P-002', 'Sumaiya Begum',     'Karim Mia',        'Gulshan-2, Dhaka',        '01811000002', '01911000002', 38, 'female', 'O+',  100, '2026-01-06 10:00:00'),
(1003, 'P-003', 'Karim Mia',         'Salam Mia',        'Dhanmondi, Dhaka',        '01811000003', '01911000003', 66, 'male',   'A+',  100, '2026-01-07 09:30:00'),
(1004, 'P-004', 'Rekha Rani',        'Ratan Das',        'Banani, Dhaka',           '01811000004', '01911000004', 31, 'female', 'AB-', 100, '2026-01-08 11:00:00'),
(1005, 'P-005', 'Sohel Rana',        'Habib Rana',       'Uttara, Dhaka',           '01811000005', '01911000005', 36, 'male',   'O-',  100, '2026-01-09 08:45:00'),
(1006, 'P-006', 'Hosneara Khatun',   'Jalal Uddin',      'Mohammadpur, Dhaka',      '01811000006', '01911000006', 54, 'female', 'A-',  100, '2026-01-10 10:30:00'),
(1007, 'P-007', 'Rashed Hossain',    'Jamal Hossain',    'Tejgaon, Dhaka',          '01811000007', '01911000007', 41, 'male',   'B-',  100, '2026-01-11 09:15:00'),
(1008, 'P-008', 'Sabina Yesmin',     'Rafiq Mia',        'Malibagh, Dhaka',         '01811000008', '01911000008', 26, 'female', 'O+',  100, '2026-01-12 12:00:00'),
(1009, 'P-009', 'Aminul Karim',      'Bashir Karim',     'Wari, Dhaka',             '01811000009', '01911000009', 71, 'male',   'AB+', 100, '2026-01-13 10:00:00'),
(1010, 'P-010', 'Mitu Akter',        'Sumon Akter',      'Lalbagh, Dhaka',          '01811000010', '01911000010', 33, 'female', 'B+',  100, '2026-01-14 09:00:00'),
(1011, 'P-011', 'Jahangir Alam',     'Nuru Alam',        'Rayer Bazar, Dhaka',      '01811000011', '01911000011', 58, 'male',   'A+',  100, '2026-01-15 11:30:00'),
(1012, 'P-012', 'Monira Sultana',    'Faruk Mia',        'Shyamoli, Dhaka',         '01811000012', '01911000012', 47, 'female', 'O-',  100, '2026-01-16 10:45:00'),
(1013, 'P-013', 'Bellal Uddin',      'Kamal Uddin',      'Zinzira, Dhaka',          '01811000013', '01911000013', 44, 'male',   'B+',  100, '2026-01-17 09:30:00'),
(1014, 'P-014', 'Shahida Parvin',    'Manik Mia',        'Jatrabari, Dhaka',        '01811000014', '01911000014', 56, 'female', 'A-',  100, '2026-01-18 08:00:00'),
(1015, 'P-015', 'Nur Mohammad',      'Islam Uddin',      'Demra, Dhaka',            '01811000015', '01911000015', 28, 'male',   'O+',  100, '2026-01-19 10:00:00'),
(1016, 'P-016', 'Taslima Begum',     'Awal Mia',         'Khilgaon, Dhaka',         '01811000016', '01911000016', 61, 'female', 'AB+', 100, '2026-01-20 09:30:00'),
(1017, 'P-017', 'Rubel Mia',         'Abul Mia',         'Basabo, Dhaka',           '01811000017', '01911000017', 35, 'male',   'B-',  100, '2026-01-21 11:00:00'),
(1018, 'P-018', 'Nasrin Akther',     'Mizan Mia',        'Rampura, Dhaka',          '01811000018', '01911000018', 40, 'female', 'O+',  100, '2026-01-22 10:15:00'),
(1019, 'P-019', 'Shahed Ali',        'Salu Ali',         'Badda, Dhaka',            '01811000019', '01911000019', 23, 'male',   'A+',  100, '2026-01-23 09:00:00'),
(1020, 'P-020', 'Parveen Rahmat',    'Rahim Mia',        'Baridhara, Dhaka',        '01811000020', '01911000020', 49, 'female', 'B+',  100, '2026-01-24 10:00:00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LAB TEST CATALOG (30 common tests)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO lab_test_catalog (id, code, name, category, price, is_active, tenant_id) VALUES
(1001, 'CBC',    'Complete Blood Count',              'blood',       50000,  1, 100),
(1002, 'BSF',    'Blood Sugar Fasting',               'blood',       20000,  1, 100),
(1003, 'BS2H',   'Blood Sugar 2hr PP',                'blood',       20000,  1, 100),
(1004, 'CRP',    'C-Reactive Protein',                'blood',       80000,  1, 100),
(1005, 'LFT',    'Liver Function Test',               'blood',       150000, 1, 100),
(1006, 'KFT',    'Kidney Function Test',              'blood',       150000, 1, 100),
(1007, 'LIPID',  'Lipid Profile',                     'blood',       120000, 1, 100),
(1008, 'TSH',    'Thyroid Stimulating Hormone',       'blood',       150000, 1, 100),
(1009, 'HBA1C',  'HbA1c',                             'blood',       120000, 1, 100),
(1010, 'URINE',  'Urine R/E',                         'urine',       15000,  1, 100),
(1011, 'UCR',    'Urine Culture & Sensitivity',       'urine',       60000,  1, 100),
(1012, 'STOOL',  'Stool R/E',                         'urine',       15000,  1, 100),
(1013, 'ECG',    'Electrocardiogram (ECG)',            'ecg',         30000,  1, 100),
(1014, 'ECHO',   'Echocardiography',                  'ecg',         250000, 1, 100),
(1015, 'CXR',    'Chest X-Ray',                       'xray',        40000,  1, 100),
(1016, 'ABDXR',  'Abdomen X-Ray',                     'xray',        40000,  1, 100),
(1017, 'USG',    'Ultrasonogram — Whole Abdomen',     'ultrasound',  80000,  1, 100),
(1018, 'USGLV',  'Ultrasonogram — Lower Abdomen',     'ultrasound',  60000,  1, 100),
(1019, 'USGNCK', 'Ultrasonogram — Neck',              'ultrasound',  60000,  1, 100),
(1020, 'WIDAL',  'Widal Test',                        'blood',       40000,  1, 100),
(1021, 'MPS',    'Malarial Parasite Screen',          'blood',       30000,  1, 100),
(1022, 'DENGUE', 'Dengue NS1 Antigen',                'blood',       80000,  1, 100),
(1023, 'COVID',  'COVID-19 Rapid Antigen',            'blood',       30000,  1, 100),
(1024, 'TROPON', 'Troponin I',                        'blood',       200000, 1, 100),
(1025, 'PT',     'Prothrombin Time (PT)',              'blood',       60000,  1, 100),
(1026, 'APTT',   'APTT',                              'blood',       60000,  1, 100),
(1027, 'BILT',   'Serum Bilirubin (Total)',           'blood',       40000,  1, 100),
(1028, 'HBsAg',  'Hepatitis B Surface Antigen',       'blood',       60000,  1, 100),
(1029, 'ANTIHCV','Anti-HCV Antibody',                'blood',       80000,  1, 100),
(1030, 'PSA',    'Prostate Specific Antigen',         'blood',       120000, 1, 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. MEDICINES (25 common medicines)
-- Schema: id, name, company, generic_name, unit, unit_price, quantity, reorder_level, is_active, tenant_id
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO medicines (id, name, company, generic_name, unit, unit_price, quantity, reorder_level, is_active, tenant_id) VALUES
(1001, 'Napa 500mg',          'Beximco',       'Paracetamol',         'Tablet', 100,   500, 50,  1, 100),
(1002, 'Cefixime 200mg',      'Square',        'Cefixime',            'Capsule',800,   200, 20,  1, 100),
(1003, 'Amoxicillin 500mg',   'Incepta',       'Amoxicillin',         'Capsule',500,   300, 30,  1, 100),
(1004, 'Omeprazole 20mg',     'ACI',           'Omeprazole',          'Capsule',300,   400, 40,  1, 100),
(1005, 'Metformin 500mg',     'Aristopharma',  'Metformin',           'Tablet', 200,   600, 60,  1, 100),
(1006, 'Atorvastatin 10mg',   'Square',        'Atorvastatin',        'Tablet', 600,   200, 20,  1, 100),
(1007, 'Amlodipine 5mg',      'Beximco',       'Amlodipine',          'Tablet', 400,   350, 35,  1, 100),
(1008, 'Losartan 50mg',       'Renata',        'Losartan Potassium',  'Tablet', 500,   250, 25,  1, 100),
(1009, 'Azithromycin 500mg',  'Square',        'Azithromycin',        'Tablet', 1200,  150, 15,  1, 100),
(1010, 'Insulin Glargine',    'Novo Nordisk',  'Insulin Glargine',    'Vial',   80000, 20,  5,   1, 100),
(1011, 'Pantoprazole 40mg',   'Incepta',       'Pantoprazole',        'Tablet', 350,   400, 40,  1, 100),
(1012, 'Metronidazole 400mg', 'Beximco',       'Metronidazole',       'Tablet', 200,   500, 50,  1, 100),
(1013, 'Ibuprofen 400mg',     'ACI',           'Ibuprofen',           'Tablet', 150,   400, 40,  1, 100),
(1014, 'Salbutamol Inhaler',  'GlaxoSmithKl.', 'Salbutamol',          'Inhaler',25000, 30,  5,   1, 100),
(1015, 'Folic Acid 5mg',      'Square',        'Folic Acid',          'Tablet', 80,    800, 80,  1, 100),
(1016, 'Vitamin D3 1000IU',   'Renata',        'Colecalciferol',      'Capsule',200,   600, 60,  1, 100),
(1017, 'Calcium 500mg',       'Aristopharma',  'Calcium Carbonate',   'Tablet', 300,   500, 50,  1, 100),
(1018, 'Ranitidine 150mg',    'Beximco',       'Ranitidine',          'Tablet', 150,   400, 40,  1, 100),
(1019, 'Diclofenac 50mg',     'ACI',           'Diclofenac Sodium',   'Tablet', 120,   600, 60,  1, 100),
(1020, 'Ciprofloxacin 500mg', 'Square',        'Ciprofloxacin',       'Tablet', 700,   200, 20,  1, 100),
(1021, 'Tramadol 50mg',       'Incepta',       'Tramadol HCl',        'Capsule',600,   100, 10,  1, 100),
(1022, 'Dexamethasone 4mg',   'Renata',        'Dexamethasone',       'Tablet', 200,   300, 30,  1, 100),
(1023, 'Furosemide 40mg',     'Beximco',       'Furosemide',          'Tablet', 150,   350, 35,  1, 100),
(1024, 'Spironolactone 25mg', 'ACI',           'Spironolactone',      'Tablet', 350,   200, 20,  1, 100),
(1025, 'Warfarin 5mg',        'Square',        'Warfarin Sodium',     'Tablet', 400,   100, 10,  1, 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VISITS (OPD + IPD)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO visits (id, patient_id, visit_no, doctor_id, visit_type, admission_flag, notes, tenant_id, created_by, created_at) VALUES
(2001, 1001, 'V-0001', 101, 'opd', 0, 'Fever with body ache 3 days. BP: 120/80.',             100, 103, '2026-01-15 09:30:00'),
(2002, 1002, 'V-0002', 102, 'opd', 0, 'ANC checkup 20 weeks pregnant. FHR normal.',            100, 103, '2026-01-15 10:00:00'),
(2003, 1003, 'V-0003', 103, 'opd', 0, 'Chest pain and shortness of breath. ECG ordered.',      100, 103, '2026-01-15 11:00:00'),
(2004, 1004, 'V-0004', 104, 'opd', 0, 'High fever 38.5C, sore throat. Paediatrics consult.',   100, 103, '2026-01-16 09:00:00'),
(2005, 1005, 'V-0005', 105, 'opd', 0, 'Right knee pain after sports injury. X-ray advised.',   100, 103, '2026-01-16 10:30:00'),
(2006, 1006, 'V-0006', 106, 'opd', 0, 'Skin rash and itching. Allergic dermatitis.',           100, 103, '2026-01-17 09:30:00'),
(2007, 1007, 'V-0007', 107, 'opd', 0, 'Ear pain and hearing loss. Otitis media suspected.',    100, 103, '2026-01-17 11:00:00'),
(2008, 1008, 'V-0008', 108, 'opd', 0, 'Blurred vision, eye redness. Conjunctivitis.',          100, 103, '2026-01-18 09:00:00'),
(2009, 1009, 'V-0009', 109, 'opd', 0, 'Leg swelling, foamy urine. KFT + urine ordered.',      100, 103, '2026-01-18 10:00:00'),
(2010, 1010, 'V-0010', 110, 'opd', 0, 'Anxiety and insomnia for 2 months.',                    100, 103, '2026-01-19 09:30:00'),
(2011, 1011, 'V-0011', 101, 'opd', 0, 'Diabetes follow-up. HbA1c ordered.',                    100, 103, '2026-01-20 10:00:00'),
(2012, 1012, 'V-0012', 103, 'opd', 0, 'Palpitation, chest tightness. ECHO ordered.',           100, 103, '2026-01-21 09:00:00'),
(2013, 1013, 'V-0013', 101, 'opd', 0, 'Typhoid suspected. Widal test ordered.',                100, 103, '2026-01-22 10:30:00'),
(2014, 1014, 'V-0014', 102, 'opd', 0, 'Post-menopausal bleeding. USG pelvis ordered.',         100, 103, '2026-01-23 09:00:00'),
(2015, 1015, 'V-0015', 105, 'opd', 0, 'Back pain radiating to left leg.',                      100, 103, '2026-01-24 10:00:00'),
(2016, 1016, 'V-0016', 109, 'opd', 0, 'Uncontrolled HTN. BP 165/100. LFT, KFT ordered.',      100, 103, '2026-01-25 09:00:00'),
(2017, 1017, 'V-0017', 101, 'opd', 0, 'Dengue fever suspected. Dengue NS1 and CBC ordered.',   100, 103, '2026-01-26 10:00:00'),
(2018, 1018, 'V-0018', 106, 'opd', 0, 'Acne vulgaris and oily skin.',                          100, 103, '2026-01-27 09:30:00'),
(2019, 1019, 'V-0019', 104, 'opd', 0, 'Asthma attack. Salbutamol nebulized. Inhaler Rx.',      100, 103, '2026-01-28 10:00:00'),
(2020, 1020, 'V-0020', 103, 'opd', 0, 'Post-MI follow-up. Troponin, ECHO. Warfarin review.',   100, 103, '2026-01-29 09:00:00'),
(2021, 1003, 'V-0021', 103, 'ipd', 1, 'Acute MI — admitted CCU. Troponin elevated.',           100, 103, '2026-02-01 14:00:00'),
(2022, 1009, 'V-0022', 109, 'ipd', 1, 'AKI with oliguria. IV fluid started.',                  100, 103, '2026-02-05 10:00:00'),
(2023, 1016, 'V-0023', 103, 'ipd', 1, 'Hypertensive emergency. IV labetalol started.',         100, 103, '2026-02-08 09:00:00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. LAB ORDERS + ITEMS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO lab_orders (id, order_no, patient_id, visit_id, ordered_by, order_date, tenant_id, created_at) VALUES
(3001, 'LO-0001', 1001, 2001, 101, '2026-01-15', 100, '2026-01-15 09:45:00'),
(3002, 'LO-0002', 1003, 2003, 101, '2026-01-15', 100, '2026-01-15 11:15:00'),
(3003, 'LO-0003', 1009, 2009, 101, '2026-01-18', 100, '2026-01-18 10:15:00'),
(3004, 'LO-0004', 1011, 2011, 101, '2026-01-20', 100, '2026-01-20 10:15:00'),
(3005, 'LO-0005', 1012, 2012, 101, '2026-01-21', 100, '2026-01-21 09:15:00'),
(3006, 'LO-0006', 1013, 2013, 103, '2026-01-22', 100, '2026-01-22 10:45:00'),
(3007, 'LO-0007', 1017, 2017, 103, '2026-01-26', 100, '2026-01-26 10:15:00'),
(3008, 'LO-0008', 1020, 2020, 101, '2026-01-29', 100, '2026-01-29 09:15:00');

INSERT OR IGNORE INTO lab_order_items (id, lab_order_id, lab_test_id, unit_price, discount, line_total, result, status, completed_at, tenant_id) VALUES
(4001, 3001, 1001, 50000,  0, 50000,  'Hb:12.5, WBC:11000 (high), Plt:250000',                 'completed', '2026-01-15 14:00:00', 100),
(4002, 3001, 1020, 40000,  0, 40000,  'Positive 1:160',                                         'completed', '2026-01-15 15:00:00', 100),
(4003, 3002, 1013, 30000,  0, 30000,  'ST-elevation leads II, III, aVF',                        'completed', '2026-01-15 11:30:00', 100),
(4004, 3002, 1024, 200000, 0, 200000, 'Troponin I: 2.5 ng/mL (HIGH)',                           'completed', '2026-01-15 12:00:00', 100),
(4005, 3003, 1006, 150000, 0, 150000, 'Creatinine: 4.2 mg/dL (HIGH), BUN: 62',                 'completed', '2026-01-18 13:00:00', 100),
(4006, 3003, 1010, 15000,  0, 15000,  'Protein: 3+, RBC: 5-8/hpf, casts present',              'completed', '2026-01-18 13:30:00', 100),
(4007, 3004, 1009, 120000, 0, 120000, 'HbA1c: 9.2% (Poorly controlled)',                        'completed', '2026-01-20 13:00:00', 100),
(4008, 3004, 1002, 20000,  0, 20000,  'FBS: 12.5 mmol/L (HIGH)',                                'completed', '2026-01-20 13:30:00', 100),
(4009, 3005, 1014, 250000, 0, 250000, 'EF: 45%, LV dilation, mild MR',                          'completed', '2026-01-22 10:00:00', 100),
(4010, 3005, 1007, 120000, 0, 120000, 'Total Cholesterol: 285, LDL: 190 mg/dL',                 'completed', '2026-01-22 10:30:00', 100),
(4011, 3006, 1001, 50000,  0, 50000,  'Hb:11.2, WBC:3500 (low), Plt:110000',                   'completed', '2026-01-22 13:00:00', 100),
(4012, 3006, 1020, 40000,  0, 40000,  'Positive 1:320',                                         'completed', '2026-01-22 13:30:00', 100),
(4013, 3007, 1022, 80000,  0, 80000,  'NS1 Antigen: Positive',                                  'completed', '2026-01-26 13:00:00', 100),
(4014, 3007, 1001, 50000,  0, 50000,  'Hb:13.1, WBC:2800 (low), Plt:62000 (CRITICAL)',          'completed', '2026-01-26 13:30:00', 100),
(4015, 3008, 1024, 200000, 0, 200000, 'Troponin I: 0.8 ng/mL',                                  'completed', '2026-01-29 12:00:00', 100),
(4016, 3008, 1014, 250000, 0, 250000, 'EF: 40%, Anterior wall hypokinesia',                     'completed', '2026-01-29 13:00:00', 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. BILLS
-- Schema: id, patient_id, visit_id, invoice_no, test_bill, doctor_visit_bill, medicine_bill, discount, total, paid, due, status, tenant_id, created_at
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO bills (id, patient_id, visit_id, invoice_no, test_bill, doctor_visit_bill, admission_bill, operation_bill, medicine_bill, discount, total, paid, due, status, tenant_id, created_at) VALUES
(5001, 1001, 2001, 'INV-0001', 90000,  50000,  0, 0, 0,      0,     140000, 140000, 0,      'paid',    100, '2026-01-15 12:00:00'),
(5002, 1002, 2002, 'INV-0002', 0,      80000,  0, 0, 0,      0,     80000,  80000,  0,      'paid',    100, '2026-01-15 12:30:00'),
(5003, 1003, 2003, 'INV-0003', 230000, 100000, 0, 0, 0,      0,     330000, 200000, 130000, 'partial', 100, '2026-01-15 13:00:00'),
(5004, 1004, 2004, 'INV-0004', 0,      60000,  0, 0, 0,      0,     60000,  60000,  0,      'paid',    100, '2026-01-16 10:00:00'),
(5005, 1005, 2005, 'INV-0005', 0,      80000,  0, 0, 0,      0,     80000,  80000,  0,      'paid',    100, '2026-01-16 11:30:00'),
(5006, 1006, 2006, 'INV-0006', 0,      70000,  0, 0, 0,      5000,  65000,  65000,  0,      'paid',    100, '2026-01-17 11:00:00'),
(5007, 1007, 2007, 'INV-0007', 0,      60000,  0, 0, 0,      0,     60000,  60000,  0,      'paid',    100, '2026-01-17 12:00:00'),
(5008, 1008, 2008, 'INV-0008', 0,      60000,  0, 0, 0,      0,     60000,  0,      60000,  'unpaid',  100, '2026-01-18 10:00:00'),
(5009, 1009, 2009, 'INV-0009', 165000, 90000,  0, 0, 0,      0,     255000, 100000, 155000, 'partial', 100, '2026-01-18 11:00:00'),
(5010, 1010, 2010, 'INV-0010', 0,      70000,  0, 0, 0,      0,     70000,  70000,  0,      'paid',    100, '2026-01-19 10:30:00'),
(5011, 1011, 2011, 'INV-0011', 140000, 50000,  0, 0, 0,      0,     190000, 190000, 0,      'paid',    100, '2026-01-20 11:30:00'),
(5012, 1012, 2012, 'INV-0012', 370000, 100000, 0, 0, 0,      0,     470000, 300000, 170000, 'partial', 100, '2026-01-21 11:00:00'),
(5013, 1013, 2013, 'INV-0013', 90000,  50000,  0, 0, 0,      0,     140000, 140000, 0,      'paid',    100, '2026-01-22 12:00:00'),
(5014, 1014, 2014, 'INV-0014', 60000,  80000,  0, 0, 0,      0,     140000, 140000, 0,      'paid',    100, '2026-01-23 10:00:00'),
(5015, 1015, 2015, 'INV-0015', 0,      80000,  0, 0, 0,      0,     80000,  0,      80000,  'unpaid',  100, '2026-01-24 11:00:00'),
(5016, 1016, 2016, 'INV-0016', 300000, 90000,  0, 0, 0,      0,     390000, 200000, 190000, 'partial', 100, '2026-01-25 10:00:00'),
(5017, 1017, 2017, 'INV-0017', 130000, 50000,  0, 0, 0,      0,     180000, 180000, 0,      'paid',    100, '2026-01-26 11:30:00'),
(5018, 1018, 2018, 'INV-0018', 0,      70000,  0, 0, 0,      0,     70000,  70000,  0,      'paid',    100, '2026-01-27 10:30:00'),
(5019, 1019, 2019, 'INV-0019', 0,      60000,  0, 0, 25000,  0,     85000,  85000,  0,      'paid',    100, '2026-01-28 11:00:00'),
(5020, 1020, 2020, 'INV-0020', 450000, 100000, 0, 0, 30000,  0,     580000, 300000, 280000, 'partial', 100, '2026-01-29 10:30:00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. INCOME
-- Schema: id, date, source, amount, description, bill_id, tenant_id, created_at, created_by
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO income (id, date, source, amount, description, tenant_id, created_by, created_at) VALUES
(6001, '2026-01-15', 'consultation', 280000, 'OPD consultation collections Jan 15',      100, 107, '2026-01-15 18:00:00'),
(6002, '2026-01-15', 'lab',          330000, 'Lab test collections Jan 15',              100, 107, '2026-01-15 18:10:00'),
(6003, '2026-01-16', 'consultation', 200000, 'OPD consultation collections Jan 16',      100, 107, '2026-01-16 18:00:00'),
(6004, '2026-01-17', 'consultation', 130000, 'OPD consultation collections Jan 17',      100, 107, '2026-01-17 18:00:00'),
(6005, '2026-01-18', 'lab',          215000, 'Lab test collections Jan 18',              100, 107, '2026-01-18 18:00:00'),
(6006, '2026-01-19', 'consultation',  70000, 'OPD consultation collections Jan 19',      100, 107, '2026-01-19 18:00:00'),
(6007, '2026-01-20', 'consultation', 190000, 'OPD + lab collections Jan 20',            100, 107, '2026-01-20 18:00:00'),
(6008, '2026-01-21', 'lab',          470000, 'Lab test collections Jan 21',              100, 107, '2026-01-21 18:00:00'),
(6009, '2026-01-22', 'consultation', 140000, 'OPD consultation collections Jan 22',      100, 107, '2026-01-22 18:00:00'),
(6010, '2026-01-22', 'lab',          140000, 'Lab collections Jan 22',                  100, 107, '2026-01-22 18:10:00'),
(6011, '2026-01-22', 'pharmacy',      85000, 'Pharmacy sales Jan W3',                   100, 107, '2026-01-22 18:30:00'),
(6012, '2026-01-25', 'consultation', 420000, 'Collections Jan 23-25',                   100, 107, '2026-01-25 18:00:00'),
(6013, '2026-02-01', 'admission',    150000, 'IPD admission fee — Patient P-003',        100, 107, '2026-02-01 16:00:00'),
(6014, '2026-02-05', 'admission',    120000, 'IPD admission fee — Patient P-009',        100, 107, '2026-02-05 12:00:00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. EXPENSES
-- Schema: id, date, category, amount, description, status, tenant_id, created_at, created_by
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO expenses (id, date, category, amount, description, status, tenant_id, created_by, created_at) VALUES
(7001, '2026-01-31', 'salary',    800000, 'Jan salary — Nurses (10)',                   'approved', 100, 107, '2026-01-31 10:00:00'),
(7002, '2026-01-31', 'salary',    240000, 'Jan salary — Lab technicians (3)',           'approved', 100, 107, '2026-01-31 10:10:00'),
(7003, '2026-01-31', 'salary',     80000, 'Jan salary — Pharmacist',                   'approved', 100, 107, '2026-01-31 10:20:00'),
(7004, '2026-01-31', 'salary',    120000, 'Jan salary — Reception staff (2)',           'approved', 100, 107, '2026-01-31 10:30:00'),
(7005, '2026-01-07', 'utilities', 120000, 'Electricity bill — Jan',                    'approved', 100, 107, '2026-01-07 10:00:00'),
(7006, '2026-01-07', 'utilities',  15000, 'Water bill — Jan',                          'approved', 100, 107, '2026-01-07 10:10:00'),
(7007, '2026-01-07', 'utilities',  25000, 'Internet & telecom — Jan',                  'approved', 100, 107, '2026-01-07 10:20:00'),
(7008, '2026-01-08', 'medicine',  350000, 'Medicine purchase — Jan W1 (Square Pharma)','approved', 100, 107, '2026-01-08 10:00:00'),
(7009, '2026-01-22', 'medicine',  280000, 'Medicine purchase — Jan W3 (Beximco)',      'approved', 100, 107, '2026-01-22 10:00:00'),
(7010, '2026-01-10', 'equipment',  50000, 'Autoclave maintenance',                     'approved', 100, 107, '2026-01-10 10:00:00'),
(7011, '2026-01-12', 'equipment',  90000, 'Reagents and consumables',                  'approved', 100, 107, '2026-01-12 10:00:00'),
(7012, '2026-01-01', 'rent',      500000, 'Hospital building rent — Jan',              'approved', 100, 107, '2026-01-01 09:00:00'),
(7013, '2026-01-20', 'other',      30000, 'Cleaning and housekeeping',                 'approved', 100, 107, '2026-01-20 09:00:00'),
(7014, '2026-01-15', 'other',      12000, 'Stationery and printing',                   'approved', 100, 107, '2026-01-15 09:00:00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. SUPPLIERS + MEDICINE PURCHASES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO suppliers (id, name, mobile_number, address, tenant_id) VALUES
(8001, 'Square Pharma Distributor', '01712000001', 'Tejgaon, Dhaka',  100),
(8002, 'Beximco Pharma Dist.',      '01712000002', 'Tongi, Dhaka',    100),
(8003, 'Incepta Healthcare',        '01712000003', 'Dhamrai, Dhaka',  100);

INSERT OR IGNORE INTO medicine_purchases (id, purchase_no, supplier_id, purchase_date, subtotal, discount_total, total_amount, paid_amount, due_amount, tenant_id, created_by) VALUES
(9001, 'PUR-0001', 8001, '2026-01-08', 350000, 0, 350000, 350000, 0,     100, 107),
(9002, 'PUR-0002', 8002, '2026-01-22', 280000, 0, 280000, 200000, 80000, 100, 107);

INSERT OR IGNORE INTO medicine_purchase_items (id, purchase_id, medicine_id, batch_no, expiry_date, quantity, purchase_price, sale_price, line_total, tenant_id) VALUES
(10001, 9001, 1001, 'B2601', '2027-06-30', 1000, 70,    100,   70000,   100),
(10002, 9001, 1002, 'B2602', '2027-03-31', 200,  600,   800,   120000,  100),
(10003, 9001, 1004, 'B2603', '2027-12-31', 400,  220,   300,   88000,   100),
(10004, 9001, 1005, 'B2604', '2027-12-31', 600,  120,   200,   72000,   100),
(10005, 9002, 1009, 'B2605', '2027-09-30', 100,  900,   1200,  90000,   100),
(10006, 9002, 1014, 'B2607', '2027-06-30', 30,   18000, 25000, 540000,  100);

INSERT OR IGNORE INTO medicine_stock_batches (id, medicine_id, batch_no, expiry_date, quantity_received, quantity_available, purchase_price, sale_price, purchase_item_id, tenant_id) VALUES
(11001, 1001, 'B2601', '2027-06-30', 1000, 500, 70,    100,   10001, 100),
(11002, 1002, 'B2602', '2027-03-31', 200,  200, 600,   800,   10002, 100),
(11003, 1004, 'B2603', '2027-12-31', 400,  400, 220,   300,   10003, 100),
(11004, 1005, 'B2604', '2027-12-31', 600,  600, 120,   200,   10004, 100),
(11005, 1009, 'B2605', '2027-09-30', 100,  150, 900,   1200,  10005, 100),
(11006, 1014, 'B2607', '2027-06-30', 30,   30,  18000, 25000, 10006, 100);

SELECT 'Demo seed applied successfully!' AS status;
SELECT 'Hospital: City Care General Hospital | Slug: demo-hospital' AS info;
SELECT 'Login: /login or /h/demo-hospital/login | Password: Demo@1234' AS login_url;
