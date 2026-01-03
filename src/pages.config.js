import ActivityLogs from './pages/ActivityLogs';
import AstraImport from './pages/AstraImport';
import AuditTrail from './pages/AuditTrail';
import Dashboard from './pages/Dashboard';
import Diagnostics from './pages/Diagnostics';
import Documentation from './pages/Documentation';
import EmployeeProfile from './pages/EmployeeProfile';
import Employees from './pages/Employees';
import ExceptionApprovals from './pages/ExceptionApprovals';
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
import DeptHeadApproval from './pages/DeptHeadApproval';
import HRManagerApproval from './pages/HRManagerApproval';
import DepartmentHeadSettings from './pages/DepartmentHeadSettings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLogs": ActivityLogs,
    "AstraImport": AstraImport,
    "AuditTrail": AuditTrail,
    "Dashboard": Dashboard,
    "Diagnostics": Diagnostics,
    "Documentation": Documentation,
    "EmployeeProfile": EmployeeProfile,
    "Employees": Employees,
    "ExceptionApprovals": ExceptionApprovals,
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
    "DeptHeadApproval": DeptHeadApproval,
    "HRManagerApproval": HRManagerApproval,
    "DepartmentHeadSettings": DepartmentHeadSettings,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};