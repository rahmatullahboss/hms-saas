# HMS - Hospital Management System

A comprehensive, multi-tenant Hospital Management System built with Cloudflare Workers, D1, and React.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)

---

## Features

### 🔐 Authentication & Security
- Multi-role authentication (Admin, Doctor, Receptionist, Pharmacist, Accountant, Lab Assistant, Director, MD)
- Multi-Factor Authentication (MFA) support
- Rate limiting protection
- JWT-based sessions
- Role-based access control (RBAC)
- SQL injection & XSS prevention

### 🏥 Patient Management
- Patient registration with unique codes
- Medical history tracking
- Visit management (outpatient & admission)
- Mobile number validation (Bangladeshi format)

### 💰 Billing & Payments
- Comprehensive billing (tests, admission, doctor visits, operations, medicines)
- Discount management
- Multiple payment types (current, due, fire service)
- Automatic receipt generation
- Due tracking

### 💊 Pharmacy Management
- Medicine inventory with batch tracking
- Expiry date management
- Low stock alerts
- Purchase & sales tracking
- Profit calculation

### 📊 Financial Management
- Income & expense tracking
- Double-entry accounting (Journal)
- Chart of Accounts
- Recurring expenses
- Audit logging

### 👥 Staff Management
- Staff registration
- Salary management
- Payment tracking

### 📈 Profit Sharing
- 300 shares system (100 profit partners, 200 owners)
- 30%/70% profit distribution
- Monthly profit calculation
- Automatic distribution reports

### 📱 Portals
- **Laboratory**: Test management (read-only)
- **Reception**: Patient registration & billing
- **Pharmacy**: Medicine management
- **MD/Director**: Full access & reports

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Backend | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 (SQLite) |
| Authentication | JWT + MFA |
| Deployment | Cloudflare Pages + Workers |

---

## Project Structure

```
hms-saas/
├── apps/
│   ├── api/                 # Cloudflare Workers API
│   │   ├── src/
│   │   │   ├── routes/     # API endpoints
│   │   │   ├── middleware/ # Auth, rate limiting
│   │   │   └── lib/        # Helpers
│   │   ├── tests/          # Unit tests
│   │   └── wrangler.toml   # Cloudflare config
│   │
│   └── web/                # React Frontend
│       ├── src/
│       │   ├── pages/      # UI pages
│       │   └── components/ # Reusable components
│       ├── e2e/            # Playwright tests
│       └── playwright.config.ts
│
├── packages/
│   └── shared/             # Shared types
│
└── .github/
    └── workflows/          # CI/CD pipelines
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 8+
- Cloudflare account

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd hms-saas

# Install dependencies
pnpm install

# Start development server
pnpm dev:api    # Start API on port 8787
pnpm dev:web    # Start web on port 5173
```

### Environment Variables

Create `apps/api/.dev.vars`:
```env
JWT_SECRET=your-secret-key
ADMIN_EMAIL=admin@hms.com
ADMIN_PASSWORD=your-password
```

---

## Running Tests

### API Tests (Unit Tests)
```bash
cd hms-saas/apps/api
pnpm test
```

### E2E Tests (Playwright)
```bash
cd hms-saas/apps/web
pnpm install
pnpm test:e2e
```

---

## Deployment

### Deploy to Cloudflare

```bash
# Deploy API
cd hms-saas/apps/api
pnpm deploy

# Deploy Web (automatic via CI/CD)
```

### CI/CD
The project includes GitHub Actions for:
- Linting & Type checking
- Unit tests
- Security scanning
- Auto-deploy to staging (develop branch)
- Auto-deploy to production (main branch)

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Get current user |

### Patients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patients` | List patients |
| POST | `/api/patients` | Create patient |
| GET | `/api/patients/:id` | Get patient |
| PUT | `/api/patients/:id` | Update patient |
| DELETE | `/api/patients/:id` | Delete patient |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bills` | List bills |
| POST | `/api/bills` | Create bill |
| GET | `/api/bills/:id` | Get bill |
| POST | `/api/bills/:id/pay` | Process payment |

### Staff
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/staff` | List staff |
| POST | `/api/staff` | Create staff |
| PUT | `/api/staff/:id` | Update staff |
| POST | `/api/staff/:id/salary` | Pay salary |

### Accounting
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/income` | List income |
| POST | `/api/income` | Create income |
| GET | `/api/expenses` | List expenses |
| POST | `/api/expenses` | Create expense |
| GET | `/api/journal` | Journal entries |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/daily` | Daily report |
| GET | `/api/reports/monthly` | Monthly report |
| GET | `/api/reports/profit` | Profit report |

---

## Database Schema

### Core Tables
- `patients` - Patient records
- `visits` - Patient visits
- `bills` - Billing records
- `payments` - Payment records
- `income` - Income tracking
- `expenses` - Expense tracking
- `staff` - Staff records
- `salary_payments` - Salary payments
- `medicines` - Pharmacy inventory
- `shareholders` - Shareholder records
- `profit_distributions` - Profit distributions
- `chart_of_accounts` - Accounting accounts
- `journal_entries` - Journal entries

---

## Security

### Implemented Security Features
- ✅ JWT authentication
- ✅ Rate limiting (100 req/min, 5 for login)
- ✅ MFA support
- ✅ Input sanitization
- ✅ Password hashing (bcrypt)
- ✅ Role-based access control
- ✅ Audit logging
- ✅ Security headers

---

## Performance

### Implemented Optimizations
- ✅ Database indexes (30+ indexes)
- ✅ Response caching
- ✅ Optimized D1 queries
- ✅ Pagination support

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

---

## License

MIT License

---

## Support

For support, please contact: support@hms.com
