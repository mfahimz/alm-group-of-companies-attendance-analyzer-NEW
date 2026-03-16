import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Layout from './Layout';

// Pages
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Employees from './pages/Employees';
import EmployeeProfile from './pages/EmployeeProfile';
import Salaries from './pages/Salaries';
import SalaryIncrements from './pages/SalaryIncrements';
import SalaryReportDetail from './pages/SalaryReportDetail';
import ReportDetail from './pages/ReportDetail';
import Users from './pages/Users';
import UserProfile from './pages/UserProfile';
import RulesSettings from './pages/RulesSettings';
import RamadanSchedules from './pages/RamadanSchedules';
import AnnualLeaveManagement from './pages/AnnualLeaveManagement';
import GraceMinutesManagement from './pages/GraceMinutesManagement';
import HalfYearlyMinutesManagement from './pages/HalfYearlyMinutesManagement';
import CompanyManagement from './pages/CompanyManagement';
import CompanyBranding from './pages/CompanyBranding';
import CompanySelection from './pages/CompanySelection';
import DepartmentHeadDashboard from './pages/DepartmentHeadDashboard';
import DepartmentHeadSettings from './pages/DepartmentHeadSettings';
import MaintenanceSettings from './pages/MaintenanceSettings';
import Maintenance from './pages/Maintenance';
import AIPayrollInsights from './pages/AIPayrollInsights';
import ResumeScanner from './pages/ResumeScanner';
import AuditLogs from './pages/AuditLogs';
import SoftwareDoc from './pages/SoftwareDoc';
import TechnicalDocumentation from './pages/TechnicalDocumentation';
import AgentsDocumentation from './pages/AgentsDocumentation';
import BusinessDocumentation from './pages/BusinessDocumentation';
import AppDocumentation from './pages/AppDocumentation';
import REPORT_ARCHITECTURE from './pages/REPORT_ARCHITECTURE';
import FeatureRequests from './pages/FeatureRequests';
import DeveloperPortal from './pages/developer/DeveloperPortal';

const W = ({ name, children }) => <Layout currentPageName={name}>{children}</Layout>;

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <NavigationTracker />
        <Routes>
          <Route path="/" element={<Navigate to="/Dashboard" replace />} />
          <Route path="/dashboard" element={<W name="Dashboard"><Dashboard /></W>} />
          <Route path="/home" element={<W name="Home"><Home /></W>} />
          <Route path="/projects" element={<W name="Projects"><Projects /></W>} />
          <Route path="/projectdetail" element={<W name="ProjectDetail"><ProjectDetail /></W>} />
          <Route path="/employees" element={<W name="Employees"><Employees /></W>} />
          <Route path="/employeeprofile" element={<W name="EmployeeProfile"><EmployeeProfile /></W>} />
          <Route path="/salaries" element={<W name="Salaries"><Salaries /></W>} />
          <Route path="/salaryincrements" element={<W name="SalaryIncrements"><SalaryIncrements /></W>} />
          <Route path="/salaryreportdetail" element={<W name="SalaryReportDetail"><SalaryReportDetail /></W>} />
          <Route path="/reportdetail" element={<W name="ReportDetail"><ReportDetail /></W>} />
          <Route path="/users" element={<W name="Users"><Users /></W>} />
          <Route path="/userprofile" element={<W name="UserProfile"><UserProfile /></W>} />
          <Route path="/rulessettings" element={<W name="RulesSettings"><RulesSettings /></W>} />
          <Route path="/ramadanschedules" element={<W name="RamadanSchedules"><RamadanSchedules /></W>} />
          <Route path="/annualleavemanagement" element={<W name="AnnualLeaveManagement"><AnnualLeaveManagement /></W>} />
          <Route path="/graceminutesmanagement" element={<W name="GraceMinutesManagement"><GraceMinutesManagement /></W>} />
          <Route path="/halfyearlyminutesmanagement" element={<W name="HalfYearlyMinutesManagement"><HalfYearlyMinutesManagement /></W>} />
          <Route path="/companymanagement" element={<W name="CompanyManagement"><CompanyManagement /></W>} />
          <Route path="/companybranding" element={<W name="CompanyBranding"><CompanyBranding /></W>} />
          <Route path="/companyselection" element={<W name="CompanySelection"><CompanySelection /></W>} />
          <Route path="/departmentheaddashboard" element={<W name="DepartmentHeadDashboard"><DepartmentHeadDashboard /></W>} />
          <Route path="/departmentheadsettings" element={<W name="DepartmentHeadSettings"><DepartmentHeadSettings /></W>} />
          <Route path="/maintenancesettings" element={<W name="MaintenanceSettings"><MaintenanceSettings /></W>} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/aipayrollinsights" element={<W name="AIPayrollInsights"><AIPayrollInsights /></W>} />
          <Route path="/resumescanner" element={<W name="ResumeScanner"><ResumeScanner /></W>} />
          <Route path="/auditlogs" element={<W name="AuditLogs"><AuditLogs /></W>} />
          <Route path="/softwaredoc" element={<W name="SoftwareDoc"><SoftwareDoc /></W>} />
          <Route path="/technicaldocumentation" element={<W name="TechnicalDocumentation"><TechnicalDocumentation /></W>} />
          <Route path="/agentsdocumentation" element={<W name="AgentsDocumentation"><AgentsDocumentation /></W>} />
          <Route path="/businessdocumentation" element={<W name="BusinessDocumentation"><BusinessDocumentation /></W>} />
          <Route path="/appdocumentation" element={<W name="AppDocumentation"><AppDocumentation /></W>} />
          <Route path="/report_architecture" element={<W name="REPORT_ARCHITECTURE"><REPORT_ARCHITECTURE /></W>} />
          <Route path="/featurerequests" element={<W name="FeatureRequests"><FeatureRequests /></W>} />
          <Route path="/developerportal" element={<W name="DeveloperPortal"><DeveloperPortal /></W>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
        <Toaster />
        <VisualEditAgent />
      </Router>
    </QueryClientProvider>
  )
}

export default App