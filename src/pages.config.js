import ActivityLogs from './pages/ActivityLogs';
import AstraImport from './pages/AstraImport';
import AuditTrail from './pages/AuditTrail';
import Dashboard from './pages/Dashboard';
import Diagnostics from './pages/Diagnostics';
import Documentation from './pages/Documentation';
import Employees from './pages/Employees';
import ExceptionApprovals from './pages/ExceptionApprovals';
import Home from './pages/Home';
import IPManagement from './pages/IPManagement';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import RamadanSchedules from './pages/RamadanSchedules';
import ReportDetail from './pages/ReportDetail';
import Reports from './pages/Reports';
import RulesSettings from './pages/RulesSettings';
import UserProfile from './pages/UserProfile';
import Users from './pages/Users';
import Training from './pages/Training';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLogs": ActivityLogs,
    "AstraImport": AstraImport,
    "AuditTrail": AuditTrail,
    "Dashboard": Dashboard,
    "Diagnostics": Diagnostics,
    "Documentation": Documentation,
    "Employees": Employees,
    "ExceptionApprovals": ExceptionApprovals,
    "Home": Home,
    "IPManagement": IPManagement,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "RamadanSchedules": RamadanSchedules,
    "ReportDetail": ReportDetail,
    "Reports": Reports,
    "RulesSettings": RulesSettings,
    "UserProfile": UserProfile,
    "Users": Users,
    "Training": Training,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};