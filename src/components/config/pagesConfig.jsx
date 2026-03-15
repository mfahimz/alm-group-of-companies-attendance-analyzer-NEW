import {
    LayoutDashboard,
    FolderKanban,
    Users,
    Settings,
    Calendar,
    Clock,
    Home,
    UserCog,
    DollarSign,
    AlertCircle,
    ClipboardCheck,
    Shield,
    BarChart3,
    Palette,
    Brain,
    Code,
    GitPullRequest,
    BookText,
    Lightbulb,
    FileText,
    ScanLine,
    Terminal,
    BookOpen,
    Cpu,
    Briefcase
} from 'lucide-react';

/**
 * PAGES_CONFIG - Single source of truth for all pages
 * 
 * Each page configuration includes:
 * - name: Unique page identifier (matches route)
 * - title: Display name in navigation
 * - icon: Lucide icon component
 * - category: Navigation grouping (Main/Leadership/Projects/Admin/Settings)
 * - showInNav: Whether to show in navigation menus
 * - requiresAuth: Whether authentication is required
 * - availableToAll: If true, all authenticated users can access
 * - defaultRoles: Array of roles that have access by default
 * - department: Optional department restriction
 * - isDefaultLandingPage: Whether this is the default home page
 */
export const PAGES_CONFIG = {
    // Main Navigation - Direct Links
    Home: {
        name: 'Home',
        title: 'Home',
        icon: Home,
        category: 'Main',
        showInNav: true,
        requiresAuth: true,
        availableToAll: true,
        defaultRoles: ['admin', 'supervisor', 'user', 'ceo', 'department_head', 'hr_manager'],
        isDefaultLandingPage: true,
        smartRoute: true  // Routes to Dashboard or DepartmentHeadDashboard based on role
    },
    Dashboard: {
        name: 'Dashboard',
        title: 'Dashboard',
        icon: LayoutDashboard,
        category: 'Main',
        showInNav: false,  // Hidden - accessible via Home button
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'supervisor', 'user', 'ceo', 'hr_manager']
    },
    // Leadership Dashboards (Hidden - accessed via Home smart routing)
    DepartmentHeadDashboard: {
        name: 'DepartmentHeadDashboard',
        title: 'Department Head Dashboard',
        icon: UserCog,
        category: 'Leadership',
        showInNav: false,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['department_head', 'ceo', 'hr_manager']
    },
    // Projects Menu
    Projects: {
        name: 'Projects',
        title: 'Projects',
        icon: FolderKanban,
        category: 'Projects',
        showInNav: true,
        requiresAuth: true,
        availableToAll: true,
        defaultRoles: ['admin', 'supervisor', 'user', 'ceo', 'department_head', 'hr_manager']
    },
    Employees: {
        name: 'Employees',
        title: 'Employees',
        icon: Users,
        category: 'HRManagement',
        showInNav: true,
        requiresAuth: true,
        availableToAll: true,
        defaultRoles: ['admin', 'supervisor', 'user', 'ceo', 'department_head', 'hr_manager']
    },
    Salaries: {
        name: 'Salaries',
        title: 'Salaries',
        icon: DollarSign,
        category: 'HRManagement',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'supervisor', 'ceo', 'hr_manager']
    },
    SalaryIncrements: {
        name: 'SalaryIncrements',
        title: 'Salary Increments',
        icon: DollarSign,
        category: 'HRManagement',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'supervisor', 'ceo', 'hr_manager']
    },
    HalfYearlyMinutesManagement: {
        name: 'HalfYearlyMinutesManagement',
        title: 'Half-Yearly Minutes',
        icon: Clock,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo']
    },
    GraceMinutesManagement: {
        name: 'GraceMinutesManagement',
        title: 'Grace Minutes',
        icon: Clock,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo']
    },
    AnnualLeaveManagement: {
        name: 'AnnualLeaveManagement',
        title: 'Annual Leave Calendar',
        icon: Calendar,
        category: 'HRManagement',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'supervisor', 'user', 'ceo', 'hr_manager']
    },
    CompanyManagement: {
        name: 'CompanyManagement',
        title: 'Companies',
        icon: Settings,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo', 'hr_manager']
    },

    // Admin Menu
    Users: {
        name: 'Users',
        title: 'Users & Permissions',
        icon: Shield,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo']
    },
    DepartmentHeadSettings: {
        name: 'DepartmentHeadSettings',
        title: 'Department Heads',
        icon: UserCog,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo']
    },
    RulesSettings: {
        name: 'RulesSettings',
        title: 'Attendance Rules',
        icon: Settings,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo']
    },

    RamadanSchedules: {
        name: 'RamadanSchedules',
        title: 'Ramadan Schedules',
        icon: Calendar,
        category: 'HRManagement',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'user', 'ceo', 'hr_manager']
    },
    MaintenanceSettings: {
        name: 'MaintenanceSettings',
        title: 'Maintenance Mode',
        icon: AlertCircle,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo']
    },
    CompanyBranding: {
        name: 'CompanyBranding',
        title: 'Company Branding',
        icon: Palette,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo']
    },
    AIPayrollInsights: {
        name: 'AIPayrollInsights',
        title: 'AI Payroll Insights',
        icon: Brain,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'ceo', 'supervisor', 'hr_manager']
    },
    ResumeScanner: {
        name: 'ResumeScanner',
        title: 'AI Resume Scanner',
        icon: ScanLine,
        category: 'HRManagement',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin', 'supervisor']
    },
    AuditLogs: {
        name: 'AuditLogs',
        title: 'Audit Logs',
        icon: FileText,
        category: 'Admin',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin']
    },

    // Documentation Section
    SoftwareDoc: {
        name: 'SoftwareDoc',
        title: 'Software Overview',
        icon: BookText,
        category: 'Documentation',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin']
    },
    TechnicalDocumentation: {
        name: 'TechnicalDocumentation',
        title: 'Technical Docs',
        icon: Code,
        category: 'Documentation',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin']
    },
    AgentsDocumentation: {
        name: 'AgentsDocumentation',
        title: 'Agents Guide',
        icon: Cpu,
        category: 'Documentation',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin']
    },
    BusinessDocumentation: {
        name: 'BusinessDocumentation',
        title: 'Business Logic',
        icon: Briefcase,
        category: 'Documentation',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin']
    },
    AppDocumentation: {
        name: 'AppDocumentation',
        title: 'App Manual',
        icon: BookOpen,
        category: 'Documentation',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin']
    },
    REPORT_ARCHITECTURE: {
        name: 'REPORT_ARCHITECTURE',
        title: 'Report Architecture',
        icon: BarChart3,
        category: 'Documentation',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin']
    },

    // Developer Portal
    DeveloperPortal: {
        name: 'DeveloperPortal',
        title: 'Developer Portal',
        icon: Terminal,
        category: 'Developer',
        showInNav: true,
        requiresAuth: true,
        availableToAll: false,
        defaultRoles: ['admin']
    },

    // Hidden Pages (No navigation)
    ProjectDetail: {
        name: 'ProjectDetail',
        title: 'Project Detail',
        icon: FolderKanban,
        category: 'Projects',
        showInNav: false,
        requiresAuth: true,
        availableToAll: true,
        defaultRoles: ['admin', 'supervisor', 'user', 'ceo', 'department_head', 'hr_manager']
    },
    ReportDetail: {
        name: 'ReportDetail',
        title: 'Report Detail',
        icon: BarChart3,
        category: 'Projects',
        showInNav: false,
        requiresAuth: true,
        availableToAll: true,
        defaultRoles: ['admin', 'supervisor', 'user', 'ceo', 'department_head', 'hr_manager']
    },
    EmployeeProfile: {
        name: 'EmployeeProfile',
        title: 'Employee Profile',
        icon: Users,
        category: 'Projects',
        showInNav: false,
        requiresAuth: true,
        availableToAll: true,
        defaultRoles: ['admin', 'supervisor', 'user', 'ceo', 'department_head', 'hr_manager']
    },
    Maintenance: {
        name: 'Maintenance',
        title: 'Maintenance',
        icon: AlertCircle,
        category: 'Admin',
        showInNav: false,
        requiresAuth: false,
        availableToAll: true,
        defaultRoles: []
    }
};

/**
 * Helper Functions
 */

// Get all pages for a specific category
export const getPagesByCategory = (category) => {
    return Object.values(PAGES_CONFIG).filter(page => page.category === category);
};

// Get single page configuration
export const getPageConfig = (pageName) => {
    return PAGES_CONFIG[pageName] || null;
};

// Get all page names
export const getAllPageNames = () => {
    return Object.keys(PAGES_CONFIG);
};

// Get pages that should show in navigation
export const getNavigationPages = () => {
    return Object.values(PAGES_CONFIG).filter(page => page.showInNav);
};

// Navigation categories metadata
export const NAV_CATEGORIES = {
    Main: {
        label: 'Main',
        order: 1,
        renderAs: 'direct' // Direct links, not dropdown
    },
    Leadership: {
        label: 'Leadership',
        icon: UserCog,
        order: 2,
        renderAs: 'dropdown'
    },
    Projects: {
        label: 'Projects',
        icon: FolderKanban,
        order: 3,
        renderAs: 'dropdown'
    },
    HRManagement: {
        label: 'HR Management',
        icon: Users,
        order: 4,
        renderAs: 'dropdown'
    },
    Admin: {
        label: 'Admin',
        icon: Settings,
        order: 5,
        renderAs: 'dropdown'
    },
    Developer: {
        label: 'Developer Portal',
        icon: Code,
        order: 100,
        renderAs: 'direct'
    },
    Documentation: {
        label: 'Knowledge Base',
        icon: BookText,
        order: 10,
        renderAs: 'dropdown'
    }
};