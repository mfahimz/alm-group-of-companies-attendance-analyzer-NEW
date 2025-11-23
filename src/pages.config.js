import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Employees from './pages/Employees';
import RulesSettings from './pages/RulesSettings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Projects": Projects,
    "ProjectDetail": ProjectDetail,
    "Employees": Employees,
    "RulesSettings": RulesSettings,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};