import ActivityLogs from './pages/ActivityLogs';
import AstraImport from './pages/AstraImport';
import Dashboard from './pages/Dashboard';
import Diagnostics from './pages/Diagnostics';
import Documentation from './pages/Documentation';
import Employees from './pages/Employees';
import Home from './pages/Home';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import RamadanSchedules from './pages/RamadanSchedules';
import ReportDetail from './pages/ReportDetail';
import RulesSettings from './pages/RulesSettings';
import UserProfile from './pages/UserProfile';
import Users from './pages/Users';
import AuditTrail from './pages/AuditTrail';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLogs": ActivityLogs,
    "AstraImport": AstraImport,
    "Dashboard": Dashboard,
    "Diagnostics": Diagnostics,
    "Documentation": Documentation,
    "Employees": Employees,
    "Home": Home,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "RamadanSchedules": RamadanSchedules,
    "ReportDetail": ReportDetail,
    "RulesSettings": RulesSettings,
    "UserProfile": UserProfile,
    "Users": Users,
    "AuditTrail": AuditTrail,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};