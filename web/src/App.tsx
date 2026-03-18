import { Routes, Route, Navigate } from 'react-router';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { useAnalytics } from './hooks/useAnalytics';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useTranslation } from 'react-i18next';
import ImpersonationBanner from './components/ImpersonationBanner';
import DashboardLayout from './components/DashboardLayout';
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
import WebsiteSettings from './pages/WebsiteSettings';
import HospitalAdminDashboard from './pages/HospitalAdminDashboard';
import AccountingDashboard from './pages/accounting/AccountingDashboard';
import IncomeList from './pages/accounting/IncomeList';
import ExpenseList from './pages/accounting/ExpenseList';
import Reports from './pages/accounting/Reports';
import AuditLogs from './pages/accounting/AuditLogs';
import RecurringExpenses from './pages/accounting/RecurringExpenses';
import ChartOfAccounts from './pages/accounting/ChartOfAccounts';
import PharmacyDashboard from './pages/PharmacyDashboard';
import PharmacyOverview from './pages/pharmacy/PharmacyOverview';
import PharmItemList from './pages/pharmacy/ItemList';
import PharmCategoryList from './pages/pharmacy/CategoryList';
import PharmGenericList from './pages/pharmacy/GenericList';
import PharmSupplierList from './pages/pharmacy/SupplierList';
import PharmPurchaseOrderList from './pages/pharmacy/PurchaseOrderList';
import PharmPurchaseOrderForm from './pages/pharmacy/PurchaseOrderForm';
import PharmGoodsReceiptList from './pages/pharmacy/GoodsReceiptList';
import PharmGoodsReceiptForm from './pages/pharmacy/GoodsReceiptForm';
import PharmStockList from './pages/pharmacy/StockList';
import PharmInvoiceList from './pages/pharmacy/InvoiceList';
import PharmInvoiceForm from './pages/pharmacy/InvoiceForm';
import PharmDepositList from './pages/pharmacy/DepositList';
import PharmSettlementList from './pages/pharmacy/SettlementList';
import PharmPrescriptionList from './pages/pharmacy/PrescriptionList';
import PharmNarcoticRegister from './pages/pharmacy/NarcoticRegister';
import PharmWriteOffList from './pages/pharmacy/WriteOffList';
import PharmDispatchList from './pages/pharmacy/DispatchList';
import BillingDashboard from './pages/BillingDashboard';
import ShareholderManagement from './pages/accounting/ShareholderManagement';
import JournalEntries from './pages/accounting/JournalEntries';
import ConsultationNotes from './pages/ConsultationNotes';
import CommissionManagement from './pages/CommissionManagement';
import IPDCharges from './pages/IPDCharges';
import TestCatalog from './pages/TestCatalog';
import ProfitLoss from './pages/accounting/ProfitLoss';
import AIAssistant from './pages/AIAssistant';
import StaffPage from './pages/StaffPage';
import HRDashboard from './pages/HRDashboard';
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
import InsuranceBillingPage from './pages/InsuranceBillingPage';
import MultiBranchDashboard from './pages/MultiBranchDashboard';
import PatientPortal from './pages/PatientPortal';
import TelemedicineDashboard from './pages/TelemedicineDashboard';
import TelemedicineRoom from './pages/TelemedicineRoom';
import TriageChatbot from './pages/TriageChatbot';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminHospitalList from './pages/SuperAdminHospitalList';
import SuperAdminHospitalDetail from './pages/SuperAdminHospitalDetail';
import SuperAdminOnboardingQueue from './pages/SuperAdminOnboardingQueue';
import SuperAdminSettings from './pages/SuperAdminSettings';
import SuperAdminAuditLog from './pages/SuperAdminAuditLog';
import SuperAdminHealth from './pages/SuperAdminHealth';
import EmergencyDashboard from './pages/EmergencyDashboard';
import OTDashboard from './pages/OTDashboard';
import DepositsPage from './pages/DepositsPage';
import CreditNotesPage from './pages/CreditNotesPage';
import SettlementsPage from './pages/SettlementsPage';
import BillingHandoverPage from './pages/BillingHandoverPage';
import BillCancellationPage from './pages/BillCancellationPage';
import VitalsPage from './pages/VitalsPage';
import AllergiesPage from './pages/AllergiesPage';
import ClinicalAssessments from './pages/ClinicalAssessments';
import InventoryDashboard from './pages/inventory/InventoryDashboard';
import StockList from './pages/inventory/StockList';
import PurchaseOrderList from './pages/inventory/PurchaseOrderList';
import PurchaseOrderForm from './pages/inventory/PurchaseOrderForm';
import GoodsReceiptList from './pages/inventory/GoodsReceiptList';
import GoodsReceiptForm from './pages/inventory/GoodsReceiptForm';
import RequisitionList from './pages/inventory/RequisitionList';
import RequisitionForm from './pages/inventory/RequisitionForm';
import DispatchList from './pages/inventory/DispatchList';
import DispatchForm from './pages/inventory/DispatchForm';
import StockAdjustment from './pages/inventory/StockAdjustment';
import InventoryLedger from './pages/inventory/InventoryLedger';
import BillingMasterPage from './pages/BillingMasterPage';
import ProvisionalBillingPage from './pages/ProvisionalBillingPage';
import LabSettingsPage from './pages/LabSettingsPage';
import ReportLabPage from './pages/ReportLabPage';
import ReportPharmacyPage from './pages/ReportPharmacyPage';
import ReportAppointmentPage from './pages/ReportAppointmentPage';
import IPBillingPage from './pages/IPBillingPage';
import PaymentsPage from './pages/PaymentsPage';
import InboxPage from './pages/InboxPage';
import NursingDashboard from './pages/NursingDashboard';
import EPrescribingDashboard from './pages/EPrescribingDashboard';
import MedicalRecordsDashboard from './pages/MedicalRecordsDashboard';
import RadiologyDashboard from './pages/RadiologyDashboard';
import HelpCenterPage from './pages/HelpCenterPage';

function Unauthorized() {
  const { t } = useTranslation('common');
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>{t('accessDenied')}</h1>
      <p>{t('noPermission')}</p>
      <a href="javascript:history.back()">{t('goBack')}</a>
    </div>
  );
}

function NotFound() {
  const { t } = useTranslation('common');
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>{t('pageNotFound')}</h1>
      <a href="/">{t('home')}</a>
    </div>
  );
}

function App() {
  // Track SPA page views in Google Analytics 4
  useAnalytics();

  return (
    <>
      <Toaster position="top-right" />
      <PWAUpdatePrompt />
      <ImpersonationBanner />
      <Routes>
        {/* ─── Public: Landing / Marketing ─────────────────────────── */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<HospitalSignup />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* ─── Super Admin Dashboard ───────────────────────────── */}
        <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
          <Route path="/super-admin/dashboard" element={<DashboardLayout role="super_admin"><SuperAdminDashboard /></DashboardLayout>} />
          <Route path="/super-admin/hospitals" element={<DashboardLayout role="super_admin"><SuperAdminHospitalList /></DashboardLayout>} />
          <Route path="/super-admin/hospitals/:id" element={<DashboardLayout role="super_admin"><SuperAdminHospitalDetail /></DashboardLayout>} />
          <Route path="/super-admin/onboarding" element={<DashboardLayout role="super_admin"><SuperAdminOnboardingQueue /></DashboardLayout>} />
          <Route path="/super-admin/settings" element={<DashboardLayout role="super_admin"><SuperAdminSettings /></DashboardLayout>} />
          <Route path="/super-admin/audit-log" element={<DashboardLayout role="super_admin"><SuperAdminAuditLog /></DashboardLayout>} />
          <Route path="/super-admin/health" element={<DashboardLayout role="super_admin"><SuperAdminHealth /></DashboardLayout>} />
        </Route>

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
            <Route path="billing" element={<BillingDashboard role="hospital_admin" />} />
            <Route path="billing/:billId/print" element={<BillPrint role="hospital_admin" />} />
            {/* ─── Pharmacy (full module) ──────────────────────────── */}
            <Route path="pharmacy" element={<PharmacyOverview role="hospital_admin" />} />
            <Route path="pharmacy/items" element={<PharmItemList role="hospital_admin" />} />
            <Route path="pharmacy/categories" element={<PharmCategoryList role="hospital_admin" />} />
            <Route path="pharmacy/generics" element={<PharmGenericList role="hospital_admin" />} />
            <Route path="pharmacy/suppliers" element={<PharmSupplierList role="hospital_admin" />} />
            <Route path="pharmacy/stock" element={<PharmStockList role="hospital_admin" />} />
            <Route path="pharmacy/po" element={<PharmPurchaseOrderList role="hospital_admin" />} />
            <Route path="pharmacy/po/new" element={<PharmPurchaseOrderForm role="hospital_admin" />} />
            <Route path="pharmacy/grn" element={<PharmGoodsReceiptList role="hospital_admin" />} />
            <Route path="pharmacy/grn/new" element={<PharmGoodsReceiptForm role="hospital_admin" />} />
            <Route path="pharmacy/invoices" element={<PharmInvoiceList role="hospital_admin" />} />
            <Route path="pharmacy/invoices/new" element={<PharmInvoiceForm role="hospital_admin" />} />
            <Route path="pharmacy/deposits" element={<PharmDepositList role="hospital_admin" />} />
            <Route path="pharmacy/settlements" element={<PharmSettlementList role="hospital_admin" />} />
            <Route path="pharmacy/prescriptions" element={<PharmPrescriptionList role="hospital_admin" />} />
            <Route path="pharmacy/narcotics" element={<PharmNarcoticRegister role="hospital_admin" />} />
            <Route path="pharmacy/write-offs" element={<PharmWriteOffList role="hospital_admin" />} />
            <Route path="pharmacy/dispatches" element={<PharmDispatchList role="hospital_admin" />} />
            <Route path="accounting" element={<AccountingDashboard role="hospital_admin" />} />
            <Route path="income" element={<IncomeList role="hospital_admin" />} />
            <Route path="expenses" element={<ExpenseList role="hospital_admin" />} />
            <Route path="recurring" element={<RecurringExpenses role="hospital_admin" />} />
            <Route path="accounts" element={<ChartOfAccounts role="hospital_admin" />} />
            <Route path="staff" element={<StaffPage role="hospital_admin" />} />
            <Route path="hr" element={<HRDashboard role="hospital_admin" />} />
            <Route path="shareholders" element={<ShareholderManagement role="hospital_admin" />} />
            <Route path="journal" element={<JournalEntries role="hospital_admin" />} />
            <Route path="consultation-notes" element={<ConsultationNotes role="hospital_admin" />} />
            <Route path="commissions" element={<CommissionManagement role="hospital_admin" />} />
            <Route path="ipd-charges" element={<IPDCharges role="hospital_admin" />} />
            <Route path="test-catalog" element={<TestCatalog role="hospital_admin" />} />
            <Route path="profit-loss" element={<ProfitLoss role="hospital_admin" />} />
            <Route path="ai-assistant" element={<AIAssistant role="hospital_admin" />} />
            <Route path="reports" element={<ReportsDashboard role="hospital_admin" />} />
            <Route path="audit" element={<AuditLogs role="hospital_admin" />} />
            <Route path="settings" element={<SettingsPage role="hospital_admin" />} />
            <Route path="website" element={<WebsiteSettings role="hospital_admin" />} />
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
            <Route path="nursing" element={<NursingDashboard role="hospital_admin" />} />
            <Route path="e-prescribing" element={<EPrescribingDashboard role="hospital_admin" />} />
            <Route path="medical-records" element={<MedicalRecordsDashboard role="hospital_admin" />} />
            <Route path="admissions/:admissionId/discharge" element={<DischargeSummary role="hospital_admin" />} />
            <Route path="prescriptions/:prescriptionId/print" element={<PrescriptionPrint role="hospital_admin" />} />
            <Route path="doctor-schedule" element={<DoctorSchedule role="hospital_admin" />} />
            <Route path="system-audit" element={<SystemAuditLog role="hospital_admin" />} />
            <Route path="lab/:labId/report" element={<LabReportPrint role="hospital_admin" />} />
            <Route path="patients/:id/timeline" element={<PatientTimeline role="hospital_admin" />} />
            <Route path="insurance-claims" element={<InsuranceClaims role="hospital_admin" />} />
            <Route path="insurance-billing" element={<InsuranceBillingPage role="hospital_admin" />} />
            <Route path="multi-branch" element={<MultiBranchDashboard role="hospital_admin" />} />
            <Route path="patient-portal" element={<PatientPortal />} />
            <Route path="telemedicine" element={<TelemedicineDashboard role="hospital_admin" />} />
            <Route path="telemedicine/room/:roomId" element={<TelemedicineRoom role="hospital_admin" />} />
            <Route path="triage" element={<TriageChatbot />} />
            <Route path="emergency" element={<EmergencyDashboard role="hospital_admin" />} />
            <Route path="ot" element={<OTDashboard role="hospital_admin" />} />
            <Route path="deposits" element={<DepositsPage role="hospital_admin" />} />
            <Route path="credit-notes" element={<CreditNotesPage role="hospital_admin" />} />
            <Route path="settlements" element={<SettlementsPage role="hospital_admin" />} />
            <Route path="billing-handover" element={<BillingHandoverPage role="hospital_admin" />} />
            <Route path="billing-cancellation" element={<BillCancellationPage role="hospital_admin" />} />
            <Route path="ip-billing" element={<IPBillingPage role="hospital_admin" />} />
            <Route path="payments" element={<PaymentsPage role="hospital_admin" />} />
            <Route path="inbox" element={<InboxPage role="hospital_admin" />} />
            <Route path="vitals" element={<VitalsPage role="hospital_admin" />} />
            <Route path="allergies" element={<AllergiesPage role="hospital_admin" />} />
            <Route path="clinical" element={<ClinicalAssessments role="hospital_admin" />} />
            <Route path="radiology" element={<RadiologyDashboard />} />
            {/* ─── Inventory ─────────────────────────────── */}
            <Route path="inventory" element={<InventoryDashboard role="hospital_admin" />} />
            <Route path="inventory/stock" element={<StockList role="hospital_admin" />} />
            <Route path="inventory/stock/adjust" element={<StockAdjustment role="hospital_admin" />} />
            <Route path="inventory/po" element={<PurchaseOrderList role="hospital_admin" />} />
            <Route path="inventory/po/new" element={<PurchaseOrderForm role="hospital_admin" />} />
            <Route path="inventory/gr" element={<GoodsReceiptList role="hospital_admin" />} />
            <Route path="inventory/gr/new" element={<GoodsReceiptForm role="hospital_admin" />} />
            <Route path="inventory/requisitions" element={<RequisitionList role="hospital_admin" />} />
            <Route path="inventory/requisitions/new" element={<RequisitionForm role="hospital_admin" />} />
            <Route path="inventory/dispatches" element={<DispatchList role="hospital_admin" />} />
            <Route path="inventory/dispatches/new" element={<DispatchForm role="hospital_admin" />} />
            <Route path="inventory/ledger" element={<InventoryLedger role="hospital_admin" />} />
            {/* ─── Billing Master & Provisional ─────────────────── */}
            <Route path="billing-master" element={<BillingMasterPage role="hospital_admin" />} />
            <Route path="billing-provisional" element={<ProvisionalBillingPage role="hospital_admin" />} />
            {/* ─── Lab Settings ─────────────────────────────────── */}
            <Route path="lab-settings" element={<LabSettingsPage role="hospital_admin" />} />
            {/* ─── Reports ──────────────────────────────────────── */}
            <Route path="reports/lab" element={<ReportLabPage role="hospital_admin" />} />
            <Route path="reports/pharmacy" element={<ReportPharmacyPage role="hospital_admin" />} />
            <Route path="reports/appointments" element={<ReportAppointmentPage role="hospital_admin" />} />
            {/* ─── Help Center ─────────────────────────────────────── */}
            <Route path="help" element={<HelpCenterPage />} />
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
            <Route path="reception/help" element={<HelpCenterPage />} />
          </Route>

          {/* ─── Managing Director ───────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['md', 'hospital_admin']} />}>
            <Route path="md/dashboard" element={<MDDashboard />} />
            <Route path="md/staff" element={<StaffPage role="md" />} />
            <Route path="md/hr" element={<HRDashboard role="md" />} />
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
            <Route path="director/help" element={<HelpCenterPage />} />
          </Route>

          {/* ─── Pharmacist ──────────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['pharmacist', 'hospital_admin']} />}>
            <Route path="pharmacy/dashboard" element={<PharmacyOverview />} />
            <Route path="pharmacy/items" element={<PharmItemList />} />
            <Route path="pharmacy/categories" element={<PharmCategoryList />} />
            <Route path="pharmacy/generics" element={<PharmGenericList />} />
            <Route path="pharmacy/suppliers" element={<PharmSupplierList />} />
            <Route path="pharmacy/stock" element={<PharmStockList />} />
            <Route path="pharmacy/po" element={<PharmPurchaseOrderList />} />
            <Route path="pharmacy/po/new" element={<PharmPurchaseOrderForm />} />
            <Route path="pharmacy/grn" element={<PharmGoodsReceiptList />} />
            <Route path="pharmacy/grn/new" element={<PharmGoodsReceiptForm />} />
            <Route path="pharmacy/invoices" element={<PharmInvoiceList />} />
            <Route path="pharmacy/invoices/new" element={<PharmInvoiceForm />} />
            <Route path="pharmacy/deposits" element={<PharmDepositList />} />
            <Route path="pharmacy/settlements" element={<PharmSettlementList />} />
            <Route path="pharmacy/prescriptions" element={<PharmPrescriptionList />} />
            <Route path="pharmacy/narcotics" element={<PharmNarcoticRegister />} />
            <Route path="pharmacy/write-offs" element={<PharmWriteOffList />} />
            <Route path="pharmacy/dispatches" element={<PharmDispatchList />} />
            <Route path="pharmacy/help" element={<HelpCenterPage />} />
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
