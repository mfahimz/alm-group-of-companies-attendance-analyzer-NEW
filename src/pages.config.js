import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Employees from './pages/Employees';
import RulesSettings from './pages/RulesSettings';
import Users from './pages/Users';
import UserProfile from './pages/UserProfile';
import Documentation from './pages/Documentation';
import Diagnostics from './pages/Diagnostics';
import EmployeePortal from './pages/EmployeePortal';
import LeaveApprovals from './pages/LeaveApprovals';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Projects": Projects,
    "ProjectDetail": ProjectDetail,
    "Employees": Employees,
    "RulesSettings": RulesSettings,
    "Users": Users,
    "UserProfile": UserProfile,
    "Documentation": Documentation,
    "Diagnostics": Diagnostics,
    "EmployeePortal": EmployeePortal,
    "LeaveApprovals": LeaveApprovals,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};