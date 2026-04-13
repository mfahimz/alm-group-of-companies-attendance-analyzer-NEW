// Cache bust 2026-03-28T16:00 - force rebuild after cleanup
import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Layout from './Layout';
// REQUIRED platform imports
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

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
import SalaryAdjustments from './pages/SalaryAdjustments';
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

import ResumeScanner from './pages/ResumeScanner';
import AttendanceAnalytics from './pages/AttendanceAnalytics';
import SalaryAnalytics from './pages/SalaryAnalytics';

import WorkingDaysCalendar from './pages/WorkingDaysCalendar';

const W = ({ name, children }) => <Layout currentPageName={name}>{children}</Layout>;

function App() {
  return (
    <AuthProvider>
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
            <Route path="/salarymodifications" element={<W name="SalaryIncrements"><SalaryIncrements /></W>} />
            <Route path="/salaryreportdetail" element={<W name="SalaryReportDetail"><SalaryReportDetail /></W>} />
            <Route path="/reportdetail" element={<W name="ReportDetail"><ReportDetail /></W>} />
            <Route path="/salaryadjustments" element={<W name="SalaryAdjustments"><SalaryAdjustments /></W>} />
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

            <Route path="/resumescanner" element={<W name="ResumeScanner"><ResumeScanner /></W>} />
            <Route path="/attendanceanalytics" element={<W name="AttendanceAnalytics"><AttendanceAnalytics /></W>} />
            <Route path="/salaryanalytics" element={<W name="SalaryAnalytics"><SalaryAnalytics /></W>} />

            <Route path="/workingdayscalendar" element={<W name="WorkingDaysCalendar"><WorkingDaysCalendar /></W>} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
          <Toaster />
          <VisualEditAgent />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App