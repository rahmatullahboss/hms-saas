import { Routes, Route, Navigate } from 'react-router';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import HospitalSignup from './pages/HospitalSignup';
import AcceptInvite from './pages/AcceptInvite';
import InviteStaff from './pages/InviteStaff';
import PatientList from './pages/PatientList';
import PatientForm from './pages/PatientForm';
import LaboratoryDashboard from './pages/LaboratoryDashboard';
import ReceptionDashboard from './pages/ReceptionDashboard';
import MDDashboard from './pages/MDDashboard';
import DirectorDashboard from './pages/DirectorDashboard';
import SettingsPage from './pages/SettingsPage';
import HospitalAdminDashboard from './pages/HospitalAdminDashboard';
import AccountingDashboard from './pages/accounting/AccountingDashboard';
import IncomeList from './pages/accounting/IncomeList';
import ExpenseList from './pages/accounting/ExpenseList';
import Reports from './pages/accounting/Reports';
import AuditLogs from './pages/accounting/AuditLogs';
import RecurringExpenses from './pages/accounting/RecurringExpenses';
import ChartOfAccounts from './pages/accounting/ChartOfAccounts';
import PharmacyDashboard from './pages/PharmacyDashboard';
import StaffPage from './pages/StaffPage';

function Unauthorized() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>403 — Access Denied</h1>
      <p>You do not have permission to view this page.</p>
      <a href="javascript:history.back()">Go back</a>
    </div>
  );
}

function NotFound() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>404 — Page Not Found</h1>
      <a href="/">Home</a>
    </div>
  );
}

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <PWAUpdatePrompt />
      <Routes>
        {/* ─── Public: Landing / Marketing ─────────────────────────── */}
        <Route path="/" element={<Navigate to="/signup" replace />} />
        <Route path="/signup" element={<HospitalSignup />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* ─── Hospital slug-based routes: /h/:slug/* ───────────────── */}
        {/* All hospital access goes through /h/:slug so we can extract  */}
        {/* the tenant slug from the URL and inject it as X-Tenant-Subdomain */}
        <Route path="/h/:slug">
          {/* Public within slug context */}
          <Route path="login" element={<Login />} />
          <Route path="accept-invite" element={<AcceptInvite />} />

          {/* ─── Hospital Admin ─────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['hospital_admin']} />}>
            <Route path="dashboard" element={<HospitalAdminDashboard role="hospital_admin" />} />
            <Route path="patients" element={<PatientList role="hospital_admin" />} />
            <Route path="patients/new" element={<PatientForm role="hospital_admin" />} />
            <Route path="tests" element={<LaboratoryDashboard role="hospital_admin" />} />
            <Route path="billing" element={<ReceptionDashboard role="hospital_admin" />} />
            <Route path="pharmacy" element={<PharmacyDashboard role="hospital_admin" />} />
            <Route path="accounting" element={<AccountingDashboard role="hospital_admin" />} />
            <Route path="income" element={<IncomeList role="hospital_admin" />} />
            <Route path="expenses" element={<ExpenseList role="hospital_admin" />} />
            <Route path="recurring" element={<RecurringExpenses role="hospital_admin" />} />
            <Route path="accounts" element={<ChartOfAccounts role="hospital_admin" />} />
            <Route path="staff" element={<StaffPage role="hospital_admin" />} />
            <Route path="shareholders" element={<DirectorDashboard role="hospital_admin" />} />
            <Route path="reports" element={<Reports role="hospital_admin" />} />
            <Route path="audit" element={<AuditLogs role="hospital_admin" />} />
            <Route path="settings" element={<SettingsPage role="hospital_admin" />} />
            <Route path="invitations" element={<InviteStaff />} />
          </Route>

          {/* ─── Laboratory ──────────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['laboratory', 'hospital_admin']} />}>
            <Route path="lab/dashboard" element={<LaboratoryDashboard />} />
            <Route path="lab/tests" element={<LaboratoryDashboard />} />
          </Route>

          {/* ─── Reception ───────────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['reception', 'hospital_admin']} />}>
            <Route path="reception/dashboard" element={<ReceptionDashboard />} />
            <Route path="reception/patients" element={<PatientList />} />
            <Route path="reception/patients/new" element={<PatientForm />} />
            <Route path="reception/billing" element={<ReceptionDashboard />} />
          </Route>

          {/* ─── Managing Director ───────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['md', 'hospital_admin']} />}>
            <Route path="md/dashboard" element={<MDDashboard />} />
            <Route path="md/staff" element={<StaffPage role="md" />} />
            <Route path="md/profit" element={<MDDashboard />} />
            <Route path="md/accounting" element={<AccountingDashboard role="md" />} />
            <Route path="md/income" element={<IncomeList role="md" />} />
            <Route path="md/expenses" element={<ExpenseList role="md" />} />
            <Route path="md/recurring" element={<RecurringExpenses role="md" />} />
            <Route path="md/accounts" element={<ChartOfAccounts role="md" />} />
            <Route path="md/reports" element={<Reports role="md" />} />
            <Route path="md/audit" element={<AuditLogs role="md" />} />
          </Route>

          {/* ─── Director ────────────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['director', 'hospital_admin']} />}>
            <Route path="director/dashboard" element={<DirectorDashboard />} />
            <Route path="director/accounting" element={<AccountingDashboard role="director" />} />
            <Route path="director/income" element={<IncomeList role="director" />} />
            <Route path="director/expenses" element={<ExpenseList role="director" />} />
            <Route path="director/recurring" element={<RecurringExpenses role="director" />} />
            <Route path="director/accounts" element={<ChartOfAccounts role="director" />} />
            <Route path="director/reports" element={<Reports role="director" />} />
            <Route path="director/audit" element={<AuditLogs role="director" />} />
            <Route path="director/shareholders" element={<DirectorDashboard />} />
            <Route path="director/profit" element={<DirectorDashboard />} />
            <Route path="director/settings" element={<SettingsPage />} />
          </Route>

          {/* ─── Pharmacist ──────────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['pharmacist', 'hospital_admin']} />}>
            <Route path="pharmacy/dashboard" element={<PharmacyDashboard />} />
          </Route>

          {/* Default redirect within slug: go to dashboard */}
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
