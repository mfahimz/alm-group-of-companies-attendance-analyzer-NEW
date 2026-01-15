import ActivityLogs from './pages/ActivityLogs';
import AuditTrail from './pages/AuditTrail';
import Dashboard from './pages/Dashboard';
import DepartmentHeadSettings from './pages/DepartmentHeadSettings';
import DeptHeadApproval from './pages/DeptHeadApproval';
import Documentation from './pages/Documentation';
import EmployeeProfile from './pages/EmployeeProfile';
import Employees from './pages/Employees';
import HRManagerApproval from './pages/HRManagerApproval';
import Home from './pages/Home';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import RamadanSchedules from './pages/RamadanSchedules';
import ReportDetail from './pages/ReportDetail';
import Reports from './pages/Reports';
import RulesSettings from './pages/RulesSettings';
import Training from './pages/Training';
import UserProfile from './pages/UserProfile';
import Users from './pages/Users';
import Salaries from './pages/Salaries';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLogs": ActivityLogs,
    "AuditTrail": AuditTrail,
    "Dashboard": Dashboard,
    "DepartmentHeadSettings": DepartmentHeadSettings,
    "DeptHeadApproval": DeptHeadApproval,
    "Documentation": Documentation,
    "EmployeeProfile": EmployeeProfile,
    "Employees": Employees,
    "HRManagerApproval": HRManagerApproval,
    "Home": Home,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "RamadanSchedules": RamadanSchedules,
    "ReportDetail": ReportDetail,
    "Reports": Reports,
    "RulesSettings": RulesSettings,
    "Training": Training,
    "UserProfile": UserProfile,
    "Users": Users,
    "Salaries": Salaries,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};