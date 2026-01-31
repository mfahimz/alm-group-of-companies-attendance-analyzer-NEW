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
import BusinessDocumentation from './pages/BusinessDocumentation';
import Dashboard from './pages/Dashboard';
import DepartmentHeadDashboard from './pages/DepartmentHeadDashboard';
import DepartmentHeadSettings from './pages/DepartmentHeadSettings';
import Documentation from './pages/Documentation';
import EmployeeProfile from './pages/EmployeeProfile';
import Employees from './pages/Employees';
import Home from './pages/Home';
import Maintenance from './pages/Maintenance';
import MaintenanceSettings from './pages/MaintenanceSettings';
import MigrationTools from './pages/MigrationTools';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import QuarterlyMinutesDocumentation from './pages/QuarterlyMinutesDocumentation';
import QuarterlyMinutesManagement from './pages/QuarterlyMinutesManagement';
import reportArchitecture from './pages/REPORT_ARCHITECTURE';
import RamadanSchedules from './pages/RamadanSchedules';
import ReportDetail from './pages/ReportDetail';
import Reports from './pages/Reports';
import RulesSettings from './pages/RulesSettings';
import Salaries from './pages/Salaries';
import SalaryIncrements from './pages/SalaryIncrements';
import SalaryReportDetail from './pages/SalaryReportDetail';
import SecurityAudit from './pages/SecurityAudit';
import SystemHealth from './pages/SystemHealth';
import TechnicalDocumentation from './pages/TechnicalDocumentation';
import TestQuarterlyMinutes from './pages/TestQuarterlyMinutes';
import Training from './pages/Training';
import UserProfile from './pages/UserProfile';
import Users from './pages/Users';
import __Layout from './Layout.jsx';


export const PAGES = {
    "BusinessDocumentation": BusinessDocumentation,
    "Dashboard": Dashboard,
    "DepartmentHeadDashboard": DepartmentHeadDashboard,
    "DepartmentHeadSettings": DepartmentHeadSettings,
    "Documentation": Documentation,
    "EmployeeProfile": EmployeeProfile,
    "Employees": Employees,
    "Home": Home,
    "Maintenance": Maintenance,
    "MaintenanceSettings": MaintenanceSettings,
    "MigrationTools": MigrationTools,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "QuarterlyMinutesDocumentation": QuarterlyMinutesDocumentation,
    "QuarterlyMinutesManagement": QuarterlyMinutesManagement,
    "REPORT_ARCHITECTURE": reportArchitecture,
    "RamadanSchedules": RamadanSchedules,
    "ReportDetail": ReportDetail,
    "Reports": Reports,
    "RulesSettings": RulesSettings,
    "Salaries": Salaries,
    "SalaryIncrements": SalaryIncrements,
    "SalaryReportDetail": SalaryReportDetail,
    "SecurityAudit": SecurityAudit,
    "SystemHealth": SystemHealth,
    "TechnicalDocumentation": TechnicalDocumentation,
    "TestQuarterlyMinutes": TestQuarterlyMinutes,
    "Training": Training,
    "UserProfile": UserProfile,
    "Users": Users,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};