/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AIPayrollInsights from './pages/AIPayrollInsights';
import AnnualLeaveManagement from './pages/AnnualLeaveManagement';
import AuditLogs from './pages/AuditLogs';
import CompanyBranding from './pages/CompanyBranding';
import CompanyManagement from './pages/CompanyManagement';
import CompanySelection from './pages/CompanySelection';
import Dashboard from './pages/Dashboard';
import DepartmentHeadDashboard from './pages/DepartmentHeadDashboard';
import DepartmentHeadSettings from './pages/DepartmentHeadSettings';
import EmployeeProfile from './pages/EmployeeProfile';
import Employees from './pages/Employees';
import FeatureRequests from './pages/FeatureRequests';
import GraceMinutesManagement from './pages/GraceMinutesManagement';
import HalfYearlyMinutesManagement from './pages/HalfYearlyMinutesManagement';
import Home from './pages/Home';
import Maintenance from './pages/Maintenance';
import MaintenanceSettings from './pages/MaintenanceSettings';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import RamadanSchedules from './pages/RamadanSchedules';
import ReportDetail from './pages/ReportDetail';
import ResumeScanner from './pages/ResumeScanner';
import RulesSettings from './pages/RulesSettings';
import Salaries from './pages/Salaries';
import SalaryIncrements from './pages/SalaryIncrements';
import SalaryReportDetail from './pages/SalaryReportDetail';
import UserProfile from './pages/UserProfile';
import Users from './pages/Users';
import SoftwareDoc from './pages/SoftwareDoc';
import ChangeTracker from './pages/developer/ChangeTracker';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIPayrollInsights": AIPayrollInsights,
    "AnnualLeaveManagement": AnnualLeaveManagement,
    "AuditLogs": AuditLogs,
    "CompanyBranding": CompanyBranding,
    "CompanyManagement": CompanyManagement,
    "CompanySelection": CompanySelection,
    "Dashboard": Dashboard,
    "DepartmentHeadDashboard": DepartmentHeadDashboard,
    "DepartmentHeadSettings": DepartmentHeadSettings,
    "EmployeeProfile": EmployeeProfile,
    "Employees": Employees,
    "FeatureRequests": FeatureRequests,
    "GraceMinutesManagement": GraceMinutesManagement,
    "HalfYearlyMinutesManagement": HalfYearlyMinutesManagement,
    "Home": Home,
    "Maintenance": Maintenance,
    "MaintenanceSettings": MaintenanceSettings,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "RamadanSchedules": RamadanSchedules,
    "ReportDetail": ReportDetail,
    "ResumeScanner": ResumeScanner,
    "RulesSettings": RulesSettings,
    "Salaries": Salaries,
    "SalaryIncrements": SalaryIncrements,
    "SalaryReportDetail": SalaryReportDetail,
    "UserProfile": UserProfile,
    "Users": Users,
    "SoftwareDoc": SoftwareDoc,
    "ChangeTracker": ChangeTracker,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};