import { Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
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
import PatientLogin from './pages/patient/PatientLogin';
import PatientPortalDashboard from './pages/patient/PatientPortalDashboard';
import PatientAppointments from './pages/patient/PatientAppointments';
import PatientLabResults from './pages/patient/PatientLabResults';
import PatientPrescriptions from './pages/patient/PatientPrescriptions';
import PatientBills from './pages/patient/PatientBills';
import PatientProfilePage from './pages/patient/PatientProfile';
import BookAppointment from './pages/patient/BookAppointment';
import PatientMessages from './pages/patient/PatientMessages';
import PatientTimeline from './pages/patient/PatientTimeline';
import PatientFamily from './pages/patient/PatientFamily';
import PatientPortalLayout from './components/PatientPortalLayout';
// ─── Advanced Billing & Clinical Pages ───────────────────────────────────────
import IPBillingPage from './pages/billing/IPBillingPage';
import SettlementsPage from './pages/billing/SettlementsPage';
import CreditNotesPage from './pages/billing/CreditNotesPage';
import InsurancePage from './pages/billing/InsurancePage';
import HandoverPage from './pages/billing/HandoverPage';
import BillCancellationPage from './pages/billing/BillCancellationPage';
import DepositsPage from './pages/billing/DepositsPage';
import VitalsPage from './pages/clinical/VitalsPage';
import AllergiesPage from './pages/clinical/AllergiesPage';

function Unauthorized() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>403 — Access Denied</h1>
      <p>You do not have permission to view this page.</p>
      <a href="/login">Back to Login</a>
    </div>
  );
}

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        {/* ─── Public Routes ──────────────────────────────── */}
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* ─── Hospital Admin Routes ──────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['hospital_admin']} />}>
          <Route path="/hospital_admin/dashboard" element={<HospitalAdminDashboard role="hospital_admin" />} />
          <Route path="/hospital_admin/patients" element={<PatientList role="hospital_admin" />} />
          <Route path="/hospital_admin/patients/new" element={<PatientForm role="hospital_admin" />} />
          <Route path="/hospital_admin/tests" element={<LaboratoryDashboard role="hospital_admin" />} />
          <Route path="/hospital_admin/billing" element={<ReceptionDashboard role="hospital_admin" />} />
          <Route path="/hospital_admin/pharmacy" element={<PharmacyDashboard role="hospital_admin" />} />
          <Route path="/hospital_admin/accounting" element={<AccountingDashboard role="hospital_admin" />} />
          <Route path="/hospital_admin/income" element={<IncomeList role="hospital_admin" />} />
          <Route path="/hospital_admin/expenses" element={<ExpenseList role="hospital_admin" />} />
          <Route path="/hospital_admin/recurring" element={<RecurringExpenses role="hospital_admin" />} />
          <Route path="/hospital_admin/accounts" element={<ChartOfAccounts role="hospital_admin" />} />
          <Route path="/hospital_admin/staff" element={<StaffPage role="hospital_admin" />} />
          <Route path="/hospital_admin/shareholders" element={<DirectorDashboard role="hospital_admin" />} />
          <Route path="/hospital_admin/reports" element={<Reports role="hospital_admin" />} />
          <Route path="/hospital_admin/audit" element={<AuditLogs role="hospital_admin" />} />
          <Route path="/hospital_admin/settings" element={<SettingsPage role="hospital_admin" />} />
          {/* Advanced Billing */}
          <Route path="/hospital_admin/billing/ip" element={<IPBillingPage role="hospital_admin" />} />
          <Route path="/hospital_admin/billing/settlements" element={<SettlementsPage role="hospital_admin" />} />
          <Route path="/hospital_admin/billing/credit-notes" element={<CreditNotesPage role="hospital_admin" />} />
          <Route path="/hospital_admin/billing/insurance" element={<InsurancePage role="hospital_admin" />} />
          <Route path="/hospital_admin/billing/handover" element={<HandoverPage role="hospital_admin" />} />
          <Route path="/hospital_admin/billing/cancellation" element={<BillCancellationPage role="hospital_admin" />} />
          <Route path="/hospital_admin/billing/deposits" element={<DepositsPage role="hospital_admin" />} />
          {/* Clinical */}
          <Route path="/hospital_admin/clinical/vitals" element={<VitalsPage role="hospital_admin" />} />
          <Route path="/hospital_admin/clinical/allergies" element={<AllergiesPage role="hospital_admin" />} />
        </Route>

        {/* ─── Laboratory Routes ──────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['laboratory', 'hospital_admin']} />}>
          <Route path="/laboratory/dashboard" element={<LaboratoryDashboard />} />
          <Route path="/laboratory/tests" element={<LaboratoryDashboard />} />
        </Route>

        {/* ─── Reception Routes ───────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['reception', 'hospital_admin']} />}>
          <Route path="/reception/dashboard" element={<ReceptionDashboard />} />
          <Route path="/reception/patients" element={<PatientList />} />
          <Route path="/reception/patients/new" element={<PatientForm />} />
          <Route path="/reception/billing" element={<ReceptionDashboard />} />
          {/* Advanced Billing */}
          <Route path="/reception/billing/ip" element={<IPBillingPage role="reception" />} />
          <Route path="/reception/billing/settlements" element={<SettlementsPage role="reception" />} />
          <Route path="/reception/billing/credit-notes" element={<CreditNotesPage role="reception" />} />
          <Route path="/reception/billing/insurance" element={<InsurancePage role="reception" />} />
          <Route path="/reception/billing/handover" element={<HandoverPage role="reception" />} />
          <Route path="/reception/billing/cancellation" element={<BillCancellationPage role="reception" />} />
          <Route path="/reception/billing/deposits" element={<DepositsPage role="reception" />} />
          {/* Clinical */}
          <Route path="/reception/clinical/vitals" element={<VitalsPage role="reception" />} />
          <Route path="/reception/clinical/allergies" element={<AllergiesPage role="reception" />} />
        </Route>

        {/* ─── Managing Director Routes ───────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['md', 'hospital_admin']} />}>
          <Route path="/md/dashboard" element={<MDDashboard />} />
          <Route path="/md/staff" element={<StaffPage role="md" />} />
          <Route path="/md/profit" element={<MDDashboard />} />
          <Route path="/md/accounting" element={<AccountingDashboard role="md" />} />
          <Route path="/md/income" element={<IncomeList role="md" />} />
          <Route path="/md/expenses" element={<ExpenseList role="md" />} />
          <Route path="/md/recurring" element={<RecurringExpenses role="md" />} />
          <Route path="/md/accounts" element={<ChartOfAccounts role="md" />} />
          <Route path="/md/reports" element={<Reports role="md" />} />
          <Route path="/md/audit" element={<AuditLogs role="md" />} />
          {/* Advanced Billing (view-only intent) */}
          <Route path="/md/billing/ip" element={<IPBillingPage role="md" />} />
          <Route path="/md/billing/settlements" element={<SettlementsPage role="md" />} />
          <Route path="/md/billing/insurance" element={<InsurancePage role="md" />} />
          <Route path="/md/billing/handover" element={<HandoverPage role="md" />} />
        </Route>

        {/* ─── Director Routes ────────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['director', 'hospital_admin']} />}>
          <Route path="/director/dashboard" element={<DirectorDashboard />} />
          <Route path="/director/accounting" element={<AccountingDashboard role="director" />} />
          <Route path="/director/income" element={<IncomeList role="director" />} />
          <Route path="/director/expenses" element={<ExpenseList role="director" />} />
          <Route path="/director/recurring" element={<RecurringExpenses role="director" />} />
          <Route path="/director/accounts" element={<ChartOfAccounts role="director" />} />
          <Route path="/director/reports" element={<Reports role="director" />} />
          <Route path="/director/audit" element={<AuditLogs role="director" />} />
          <Route path="/director/shareholders" element={<DirectorDashboard />} />
          <Route path="/director/profit" element={<DirectorDashboard />} />
          <Route path="/director/settings" element={<SettingsPage />} />
        </Route>

        {/* ─── Patient Portal Routes ────────────────────────── */}
        <Route path="/patient/login" element={<PatientLogin />} />
        <Route element={<ProtectedRoute allowedRoles={['patient']} redirectTo="/patient/login" />}>
          <Route element={<PatientPortalLayout />}>
            <Route path="/patient/dashboard" element={<PatientPortalDashboard />} />
            <Route path="/patient/appointments" element={<PatientAppointments />} />
            <Route path="/patient/book-appointment" element={<BookAppointment />} />
            <Route path="/patient/lab-results" element={<PatientLabResults />} />
            <Route path="/patient/prescriptions" element={<PatientPrescriptions />} />
            <Route path="/patient/bills" element={<PatientBills />} />
            <Route path="/patient/messages" element={<PatientMessages />} />
            <Route path="/patient/timeline" element={<PatientTimeline />} />
            <Route path="/patient/family" element={<PatientFamily />} />
            <Route path="/patient/profile" element={<PatientProfilePage />} />
          </Route>
        </Route>

        {/* ─── Default redirect ───────────────────────────── */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}

export default App;
