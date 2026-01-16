import Dashboard from './pages/Dashboard';
import DepartmentHeadSettings from './pages/DepartmentHeadSettings';
import DeptHeadApproval from './pages/DeptHeadApproval';
import Documentation from './pages/Documentation';
import EmployeeProfile from './pages/EmployeeProfile';
import Employees from './pages/Employees';
import Home from './pages/Home';
import Maintenance from './pages/Maintenance';
import MaintenanceSettings from './pages/MaintenanceSettings';
import PrivateFiles from './pages/PrivateFiles';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import RamadanSchedules from './pages/RamadanSchedules';
import ReportDetail from './pages/ReportDetail';
import Reports from './pages/Reports';
import RulesSettings from './pages/RulesSettings';
import Salaries from './pages/Salaries';
import TestQuarterlyMinutes from './pages/TestQuarterlyMinutes';
import Training from './pages/Training';
import UserProfile from './pages/UserProfile';
import Users from './pages/Users';
import Recruitment from './pages/Recruitment';
import JobPositions from './pages/JobPositions';
import CandidateScreening from './pages/CandidateScreening';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "DepartmentHeadSettings": DepartmentHeadSettings,
    "DeptHeadApproval": DeptHeadApproval,
    "Documentation": Documentation,
    "EmployeeProfile": EmployeeProfile,
    "Employees": Employees,
    "Home": Home,
    "Maintenance": Maintenance,
    "MaintenanceSettings": MaintenanceSettings,
    "PrivateFiles": PrivateFiles,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "RamadanSchedules": RamadanSchedules,
    "ReportDetail": ReportDetail,
    "Reports": Reports,
    "RulesSettings": RulesSettings,
    "Salaries": Salaries,
    "TestQuarterlyMinutes": TestQuarterlyMinutes,
    "Training": Training,
    "UserProfile": UserProfile,
    "Users": Users,
    "Recruitment": Recruitment,
    "JobPositions": JobPositions,
    "CandidateScreening": CandidateScreening,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};