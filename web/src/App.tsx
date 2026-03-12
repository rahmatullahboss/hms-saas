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
import PatientDetail from './pages/PatientDetail';
import ReportsDashboard from './pages/ReportsDashboard';
import BillPrint from './pages/BillPrint';
import AppointmentScheduler from './pages/AppointmentScheduler';
import DigitalPrescription from './pages/DigitalPrescription';
import DoctorDashboard from './pages/DoctorDashboard';
import LabTestOrderForm from './pages/LabTestOrderForm';
import MedicineDispensing from './pages/MedicineDispensing';
import AdmissionIPD from './pages/AdmissionIPD';
import BedManagement from './pages/BedManagement';
import NotificationsCenter from './pages/NotificationsCenter';
import NurseStation from './pages/NurseStation';
import DischargeSummary from './pages/DischargeSummary';
import PrescriptionPrint from './pages/PrescriptionPrint';
import DoctorSchedule from './pages/DoctorSchedule';
import SystemAuditLog from './pages/SystemAuditLog';
import LabReportPrint from './pages/LabReportPrint';
import PatientTimeline from './pages/PatientTimeline';
import InsuranceClaims from './pages/InsuranceClaims';
import MultiBranchDashboard from './pages/MultiBranchDashboard';
import PatientPortal from './pages/PatientPortal';
import TelemedicineDashboard from './pages/TelemedicineDashboard';
import TelemedicineRoom from './pages/TelemedicineRoom';

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
            <Route path="patients/:id" element={<PatientDetail role="hospital_admin" />} />
            <Route path="tests" element={<LaboratoryDashboard role="hospital_admin" />} />
            <Route path="billing" element={<ReceptionDashboard role="hospital_admin" />} />
            <Route path="billing/:billId/print" element={<BillPrint role="hospital_admin" />} />
            <Route path="pharmacy" element={<PharmacyDashboard role="hospital_admin" />} />
            <Route path="accounting" element={<AccountingDashboard role="hospital_admin" />} />
            <Route path="income" element={<IncomeList role="hospital_admin" />} />
            <Route path="expenses" element={<ExpenseList role="hospital_admin" />} />
            <Route path="recurring" element={<RecurringExpenses role="hospital_admin" />} />
            <Route path="accounts" element={<ChartOfAccounts role="hospital_admin" />} />
            <Route path="staff" element={<StaffPage role="hospital_admin" />} />
            <Route path="shareholders" element={<DirectorDashboard role="hospital_admin" />} />
            <Route path="reports" element={<ReportsDashboard role="hospital_admin" />} />
            <Route path="audit" element={<AuditLogs role="hospital_admin" />} />
            <Route path="settings" element={<SettingsPage role="hospital_admin" />} />
            <Route path="invitations" element={<InviteStaff />} />
            <Route path="appointments" element={<AppointmentScheduler role="hospital_admin" />} />
            <Route path="prescriptions/new" element={<DigitalPrescription />} />
            <Route path="prescriptions/:rxId" element={<DigitalPrescription />} />
            <Route path="doctor/dashboard" element={<DoctorDashboard />} />
            <Route path="lab/order/new" element={<LabTestOrderForm />} />
            <Route path="pharmacy/dispensing" element={<MedicineDispensing />} />
            <Route path="admissions" element={<AdmissionIPD role="hospital_admin" />} />
            <Route path="beds" element={<BedManagement role="hospital_admin" />} />
            <Route path="notifications" element={<NotificationsCenter role="hospital_admin" />} />
            <Route path="nurse-station" element={<NurseStation role="hospital_admin" />} />
            <Route path="admissions/:admissionId/discharge" element={<DischargeSummary role="hospital_admin" />} />
            <Route path="prescriptions/:prescriptionId/print" element={<PrescriptionPrint role="hospital_admin" />} />
            <Route path="doctor-schedule" element={<DoctorSchedule role="hospital_admin" />} />
            <Route path="system-audit" element={<SystemAuditLog role="hospital_admin" />} />
            <Route path="lab/:labId/report" element={<LabReportPrint role="hospital_admin" />} />
            <Route path="patients/:id/timeline" element={<PatientTimeline role="hospital_admin" />} />
            <Route path="insurance-claims" element={<InsuranceClaims role="hospital_admin" />} />
            <Route path="multi-branch" element={<MultiBranchDashboard role="hospital_admin" />} />
            <Route path="patient-portal" element={<PatientPortal role="hospital_admin" />} />
            <Route path="telemedicine" element={<TelemedicineDashboard role="hospital_admin" />} />
            <Route path="telemedicine/room/:roomId" element={<TelemedicineRoom role="hospital_admin" />} />
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
            <Route path="reception/patients/:id" element={<PatientDetail />} />
            <Route path="reception/billing" element={<ReceptionDashboard />} />
            <Route path="reception/billing/:billId/print" element={<BillPrint />} />
            <Route path="reception/appointments" element={<AppointmentScheduler role="reception" />} />
            <Route path="reception/prescriptions/new" element={<DigitalPrescription />} />
            <Route path="reception/prescriptions/:rxId" element={<DigitalPrescription />} />
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
