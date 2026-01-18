import BusinessDocumentation from './pages/BusinessDocumentation';
import CandidateScreening from './pages/CandidateScreening';
import Dashboard from './pages/Dashboard';
import DepartmentHeadDashboard from './pages/DepartmentHeadDashboard';
import DepartmentHeadSettings from './pages/DepartmentHeadSettings';
import Documentation from './pages/Documentation';
import EmployeeProfile from './pages/EmployeeProfile';
import Employees from './pages/Employees';
import Home from './pages/Home';
import JobPositions from './pages/JobPositions';
import Maintenance from './pages/Maintenance';
import MaintenanceSettings from './pages/MaintenanceSettings';
import PrivateFiles from './pages/PrivateFiles';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import QuarterlyMinutesManagement from './pages/QuarterlyMinutesManagement';
import RamadanSchedules from './pages/RamadanSchedules';
import Recruitment from './pages/Recruitment';
import ReportDetail from './pages/ReportDetail';
import Reports from './pages/Reports';
import RulesSettings from './pages/RulesSettings';
import Salaries from './pages/Salaries';
import TechnicalDocumentation from './pages/TechnicalDocumentation';
import TestQuarterlyMinutes from './pages/TestQuarterlyMinutes';
import Training from './pages/Training';
import UserProfile from './pages/UserProfile';
import Users from './pages/Users';
import __Layout from './Layout.jsx';


export const PAGES = {
    "BusinessDocumentation": BusinessDocumentation,
    "CandidateScreening": CandidateScreening,
    "Dashboard": Dashboard,
    "DepartmentHeadDashboard": DepartmentHeadDashboard,
    "DepartmentHeadSettings": DepartmentHeadSettings,
    "Documentation": Documentation,
    "EmployeeProfile": EmployeeProfile,
    "Employees": Employees,
    "Home": Home,
    "JobPositions": JobPositions,
    "Maintenance": Maintenance,
    "MaintenanceSettings": MaintenanceSettings,
    "PrivateFiles": PrivateFiles,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "QuarterlyMinutesManagement": QuarterlyMinutesManagement,
    "RamadanSchedules": RamadanSchedules,
    "Recruitment": Recruitment,
    "ReportDetail": ReportDetail,
    "Reports": Reports,
    "RulesSettings": RulesSettings,
    "Salaries": Salaries,
    "TechnicalDocumentation": TechnicalDocumentation,
    "TestQuarterlyMinutes": TestQuarterlyMinutes,
    "Training": Training,
    "UserProfile": UserProfile,
    "Users": Users,
}

export const pagesConfig = {
    mainPage: "DepartmentHeadDashboard",
    Pages: PAGES,
    Layout: __Layout,
};