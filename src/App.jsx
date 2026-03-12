import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Layout from '../layout';

// Import all pages
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ReportDetail from './pages/ReportDetail';
import SalaryReportDetail from './pages/SalaryReportDetail';
import Employees from './pages/Employees';
import EmployeeProfile from './pages/EmployeeProfile';
import Salaries from './pages/Salaries';
import SalaryIncrements from './pages/SalaryIncrements';
import AnnualLeaveManagement from './pages/AnnualLeaveManagement';
import RamadanSchedules from './pages/RamadanSchedules';
import GraceMinutesManagement from './pages/GraceMinutesManagement';
import CompanyManagement from './pages/CompanyManagement';
import CompanyBranding from './pages/CompanyBranding';
import CompanySelection from './pages/CompanySelection';
import Users from './pages/Users';
import UserProfile from './pages/UserProfile';
import DepartmentHeadSettings from './pages/DepartmentHeadSettings';
import DepartmentHeadDashboard from './pages/DepartmentHeadDashboard';
import RulesSettings from './pages/RulesSettings';
import MaintenanceSettings from './pages/MaintenanceSettings';
import Maintenance from './pages/Maintenance';
import DeveloperModule from './pages/DeveloperModule';
import AuditLogs from './pages/AuditLogs';
import ResumeScanner from './pages/ResumeScanner';
import AppDocumentation from './pages/AppDocumentation';
import BusinessDocumentation from './pages/BusinessDocumentation';
import TechnicalDocumentation from './pages/TechnicalDocumentation';
import AgentsDocumentation from './pages/AgentsDocumentation';
import DevelopmentLog from './pages/DevelopmentLog';
import FeatureRequests from './pages/FeatureRequests';

const LayoutWrapper = ({ children, currentPageName }) => (
  <Layout currentPageName={currentPageName}>{children}</Layout>
);

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <NavigationTracker />
        <Routes>
          <Route path="/" element={<Navigate to="/Home" replace />} />
          <Route path="/Dashboard" element={<LayoutWrapper currentPageName="Dashboard"><Dashboard /></LayoutWrapper>} />
          <Route path="/Home" element={<LayoutWrapper currentPageName="Home"><Home /></LayoutWrapper>} />
          <Route path="/Projects" element={<LayoutWrapper currentPageName="Projects"><Projects /></LayoutWrapper>} />
          <Route path="/ProjectDetail" element={<LayoutWrapper currentPageName="ProjectDetail"><ProjectDetail /></LayoutWrapper>} />
          <Route path="/ReportDetail" element={<LayoutWrapper currentPageName="ReportDetail"><ReportDetail /></LayoutWrapper>} />
          <Route path="/SalaryReportDetail" element={<LayoutWrapper currentPageName="SalaryReportDetail"><SalaryReportDetail /></LayoutWrapper>} />
          <Route path="/Employees" element={<LayoutWrapper currentPageName="Employees"><Employees /></LayoutWrapper>} />
          <Route path="/EmployeeProfile" element={<LayoutWrapper currentPageName="EmployeeProfile"><EmployeeProfile /></LayoutWrapper>} />
          <Route path="/Salaries" element={<LayoutWrapper currentPageName="Salaries"><Salaries /></LayoutWrapper>} />
          <Route path="/SalaryIncrements" element={<LayoutWrapper currentPageName="SalaryIncrements"><SalaryIncrements /></LayoutWrapper>} />
          <Route path="/AnnualLeaveManagement" element={<LayoutWrapper currentPageName="AnnualLeaveManagement"><AnnualLeaveManagement /></LayoutWrapper>} />
          <Route path="/RamadanSchedules" element={<LayoutWrapper currentPageName="RamadanSchedules"><RamadanSchedules /></LayoutWrapper>} />
          <Route path="/GraceMinutesManagement" element={<LayoutWrapper currentPageName="GraceMinutesManagement"><GraceMinutesManagement /></LayoutWrapper>} />
          <Route path="/CompanyManagement" element={<LayoutWrapper currentPageName="CompanyManagement"><CompanyManagement /></LayoutWrapper>} />
          <Route path="/CompanyBranding" element={<LayoutWrapper currentPageName="CompanyBranding"><CompanyBranding /></LayoutWrapper>} />
          <Route path="/CompanySelection" element={<LayoutWrapper currentPageName="CompanySelection"><CompanySelection /></LayoutWrapper>} />
          <Route path="/Users" element={<LayoutWrapper currentPageName="Users"><Users /></LayoutWrapper>} />
          <Route path="/UserProfile" element={<LayoutWrapper currentPageName="UserProfile"><UserProfile /></LayoutWrapper>} />
          <Route path="/DepartmentHeadSettings" element={<LayoutWrapper currentPageName="DepartmentHeadSettings"><DepartmentHeadSettings /></LayoutWrapper>} />
          <Route path="/DepartmentHeadDashboard" element={<LayoutWrapper currentPageName="DepartmentHeadDashboard"><DepartmentHeadDashboard /></LayoutWrapper>} />
          <Route path="/RulesSettings" element={<LayoutWrapper currentPageName="RulesSettings"><RulesSettings /></LayoutWrapper>} />
          <Route path="/MaintenanceSettings" element={<LayoutWrapper currentPageName="MaintenanceSettings"><MaintenanceSettings /></LayoutWrapper>} />
          <Route path="/Maintenance" element={<LayoutWrapper currentPageName="Maintenance"><Maintenance /></LayoutWrapper>} />
          <Route path="/DeveloperModule" element={<LayoutWrapper currentPageName="DeveloperModule"><DeveloperModule /></LayoutWrapper>} />
          <Route path="/AuditLogs" element={<LayoutWrapper currentPageName="AuditLogs"><AuditLogs /></LayoutWrapper>} />
          <Route path="/ResumeScanner" element={<LayoutWrapper currentPageName="ResumeScanner"><ResumeScanner /></LayoutWrapper>} />
          <Route path="/AppDocumentation" element={<LayoutWrapper currentPageName="AppDocumentation"><AppDocumentation /></LayoutWrapper>} />
          <Route path="/BusinessDocumentation" element={<LayoutWrapper currentPageName="BusinessDocumentation"><BusinessDocumentation /></LayoutWrapper>} />
          <Route path="/TechnicalDocumentation" element={<LayoutWrapper currentPageName="TechnicalDocumentation"><TechnicalDocumentation /></LayoutWrapper>} />
          <Route path="/AgentsDocumentation" element={<LayoutWrapper currentPageName="AgentsDocumentation"><AgentsDocumentation /></LayoutWrapper>} />
          <Route path="/DevelopmentLog" element={<LayoutWrapper currentPageName="DevelopmentLog"><DevelopmentLog /></LayoutWrapper>} />
          <Route path="/FeatureRequests" element={<LayoutWrapper currentPageName="FeatureRequests"><FeatureRequests /></LayoutWrapper>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
      <VisualEditAgent />
    </QueryClientProvider>
  )
}

export default App