import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Pencil, Shield, User as UserIcon, Lock, RefreshCw } from 'lucide-react';
import SortableTableHead from '../components/ui/SortableTableHead';
import { toast } from 'sonner';
import UserDialog from '../components/users/UserDialog';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Breadcrumb from '../components/ui/Breadcrumb';
import TablePagination from '../components/ui/TablePagination';

const DEFAULT_PAGES = [
    { page_name: 'Dashboard', description: 'Main dashboard with project overview', allowed_roles: 'admin,supervisor,user' },
    { page_name: 'Projects', description: 'Project management and listing', allowed_roles: 'admin,supervisor' },
    { page_name: 'ProjectDetail', description: 'Individual project details and management', allowed_roles: 'admin,supervisor' },
    { page_name: 'Employees', description: 'Employee master data management', allowed_roles: 'admin,supervisor' },
    { page_name: 'Salaries', description: 'Employee salary management', allowed_roles: 'admin,supervisor' },
    { page_name: 'Users', description: 'User management and permissions', allowed_roles: 'admin' },
    { page_name: 'RulesSettings', description: 'Attendance rules configuration', allowed_roles: 'admin' },
    { page_name: 'RamadanSchedules', description: 'Ramadan shift schedule management', allowed_roles: 'admin' },
    { page_name: 'Documentation', description: 'User guides and documentation', allowed_roles: 'admin,supervisor,user' },
    { page_name: 'Training', description: 'Training guides and videos', allowed_roles: 'admin,supervisor,user' },
    { page_name: 'UserProfile', description: 'User profile settings', allowed_roles: 'admin,supervisor,user' },
    { page_name: 'EmployeeProfile', description: 'Employee profile details', allowed_roles: 'admin,supervisor' },
    { page_name: 'ReportDetail', description: 'Detailed attendance report view', allowed_roles: 'admin,supervisor,department_head' },
    { page_name: 'Reports', description: 'Reports and analytics', allowed_roles: 'admin,supervisor' },
    { page_name: 'DepartmentHeadSettings', description: 'Department head configuration', allowed_roles: 'admin' },
    { page_name: 'DepartmentHeadDashboard', description: 'Department head approvals and reports', allowed_roles: 'department_head' }
];

export default function Users() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
    const [sort, setSort] = useState({ key: 'full_name', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [emailDomains, setEmailDomains] = useState('');
    const [syncing, setSyncing] = useState(false);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: permissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list(),
        enabled: !!currentUser
    });

    useEffect(() => {
        if (currentUser && permissions.length > 0) {
            const userRole = currentUser.extended_role || currentUser.role || 'user';
            const permission = permissions.find(p => p.page_name === 'Users');
            if (permission) {
                const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
                if (!allowedRoles.includes(userRole)) {
                    toast.error('Access denied.');
                    navigate(createPageUrl('Dashboard'));
                }
            }
        }
    }, [currentUser, permissions, navigate]);

    const { data: users = [], isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: () => base44.entities.User.list('-created_date')
    });

    const { data: pagePermissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list()
    });

    const { data: systemSettings = [] } = useQuery({
        queryKey: ['systemSettings'],
        queryFn: () => base44.entities.SystemSettings.list()
    });

    useEffect(() => {
        const setting = systemSettings.find(s => s.setting_key === 'allowed_email_domains');
        if (setting) {
            setEmailDomains(setting.setting_value || '');
        }
    }, [systemSettings]);

    const updateUserMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['users']);
            toast.success('User updated successfully');
        },
        onError: () => {
            toast.error('Failed to update user');
        }
    });

    const handleEdit = (user) => {
        setSelectedUser(user);
        setShowDialog(true);
    };

    const handleToggleRole = (user) => {
        const currentRole = user.extended_role || user.role || 'user';
        let newRole;
        if (currentRole === 'admin') {
            newRole = 'supervisor';
        } else if (currentRole === 'supervisor') {
            newRole = 'department_head';
        } else if (currentRole === 'department_head') {
            newRole = 'user';
        } else {
            newRole = 'admin';
        }
        
        if (window.confirm(`Change ${user.full_name}'s role to ${newRole}?`)) {
            updateUserMutation.mutate({
                id: user.id,
                data: { extended_role: newRole }
            });
        }
    };

    const updatePermissionMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.PagePermission.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['pagePermissions']);
            toast.success('Permission updated successfully');
        },
        onError: () => {
            toast.error('Failed to update permission');
        }
    });

    const syncPagesMutation = useMutation({
        mutationFn: async () => {
            setSyncing(true);
            const { data } = await base44.functions.invoke('syncPagePermissions', {});
            return data;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries(['pagePermissions']);
            setSyncing(false);
            if (result.created > 0) {
                toast.success(`Synced ${result.total} pages (${result.created} new)`);
            } else {
                toast.success('All pages are up to date');
            }
        },
        onError: (error) => {
            setSyncing(false);
            toast.error('Failed to sync pages: ' + error.message);
        }
    });

    const saveEmailDomainsMutation = useMutation({
        mutationFn: async (domains) => {
            const setting = systemSettings.find(s => s.setting_key === 'allowed_email_domains');
            if (setting) {
                return base44.entities.SystemSettings.update(setting.id, { setting_value: domains });
            } else {
                return base44.entities.SystemSettings.create({
                    setting_key: 'allowed_email_domains',
                    setting_value: domains,
                    description: 'Comma-separated list of allowed email domains for user registration'
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['systemSettings']);
            toast.success('Email domain settings saved');
        },
        onError: () => {
            toast.error('Failed to save settings');
        }
    });

    const handleSaveEmailDomains = () => {
        saveEmailDomainsMutation.mutate(emailDomains);
    };

    const togglePageRole = (permission, role) => {
        const roles = permission.allowed_roles.split(',').map(r => r.trim());
        let newRoles;
        
        if (roles.includes(role)) {
            newRoles = roles.filter(r => r !== role);
        } else {
            newRoles = [...roles, role];
        }

        if (newRoles.length === 0) {
            toast.error('At least one role must have access');
            return;
        }

        updatePermissionMutation.mutate({
            id: permission.id,
            data: { allowed_roles: newRoles.join(',') }
        });
    };

    const hasPageRole = (permission, role) => {
        return permission.allowed_roles.split(',').map(r => r.trim()).includes(role);
    };

    const filteredUsers = users
        .filter(user =>
            user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => {
            let aVal = a[sort.key];
            let bVal = b[sort.key];
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    if (!currentUser) {
        return <div className="text-center py-12 text-slate-500">Loading...</div>;
    }

    return (
        <div className="space-y-6">
            <Breadcrumb items={[
                { label: 'Settings', href: 'RulesSettings' },
                { label: 'Users & Permissions' }
            ]} />
            <div>
                <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
                <p className="text-slate-600 mt-2">Manage system users, roles, and page permissions</p>
            </div>

            <Tabs defaultValue="users" className="space-y-6">
                <TabsList className="bg-white border border-slate-200 p-1">
                    <TabsTrigger value="users">Users & Roles</TabsTrigger>
                    <TabsTrigger value="permissions">Page Permissions</TabsTrigger>
                    <TabsTrigger value="settings">Email Settings</TabsTrigger>
                </TabsList>

                {/* Users Tab */}
                <TabsContent value="users" className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <Input
                                placeholder="Search by name or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Button 
                            onClick={() => {
                                setSelectedUser(null);
                                setShowDialog(true);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Invite User
                        </Button>
                    </div>

                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-8 text-center text-slate-500">Loading users...</div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            {searchTerm ? 'No users found matching your search.' : 'No users yet.'}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableTableHead sortKey="full_name" currentSort={sort} onSort={setSort}>
                                        Name
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="email" currentSort={sort} onSort={setSort}>
                                        Email
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="role" currentSort={sort} onSort={setSort}>
                                        Role
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="created_date" currentSort={sort} onSort={setSort}>
                                        Created
                                    </SortableTableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium">{user.full_name}</p>
                                                <p className="text-xs text-slate-500">{user.display_name}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            {(() => {
                                                const displayRole = user.extended_role || user.role || 'user';
                                                return (
                                                    <span className={`
                                                        px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1
                                                        ${displayRole === 'admin' ? 'bg-purple-100 text-purple-700' : 
                                                          displayRole === 'supervisor' ? 'bg-blue-100 text-blue-700' : 
                                                          displayRole === 'department_head' ? 'bg-green-100 text-green-700' :
                                                          'bg-slate-100 text-slate-700'}
                                                    `}>
                                                        {displayRole === 'admin' ? <Shield className="w-3 h-3" /> : 
                                                         displayRole === 'department_head' ? <Shield className="w-3 h-3" /> :
                                                         <UserIcon className="w-3 h-3" />}
                                                        {displayRole === 'admin' ? 'Admin' : 
                                                         displayRole === 'supervisor' ? 'Supervisor' : 
                                                         displayRole === 'department_head' ? 'Dept Head' :
                                                         'User'}
                                                    </span>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell>{new Date(user.created_date).toLocaleDateString('en-GB')}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleEdit(user)}
                                                    title="Edit user"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleToggleRole(user)}
                                                    disabled={updateUserMutation.isPending}
                                                    title="Toggle role (Admin → Supervisor → Dept Head → User → Admin)"
                                                >
                                                    <Shield className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {filteredUsers.length > 0 && (
                        <TablePagination
                            totalItems={filteredUsers.length}
                            currentPage={currentPage}
                            rowsPerPage={rowsPerPage}
                            onPageChange={setCurrentPage}
                            onRowsPerPageChange={(value) => {
                                setRowsPerPage(value);
                                setCurrentPage(1);
                            }}
                        />
                    )}
                </CardContent>
            </Card>
                </TabsContent>

                {/* Page Permissions Tab */}
                <TabsContent value="permissions" className="space-y-6">
                    <div className="flex items-center justify-between">
                        <p className="text-slate-600">Control which roles can access each page</p>
                        <Button
                            onClick={() => syncPagesMutation.mutate()}
                            disabled={syncing}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                            {syncing ? 'Syncing...' : 'Sync All Pages'}
                        </Button>
                    </div>

                    {pagePermissions.length === 0 && (
                        <Card className="border-0 shadow-sm bg-amber-50 border-amber-200">
                            <CardContent className="p-6">
                                <p className="text-amber-900">
                                    No page permissions configured yet. Click "Sync All Pages" to automatically detect and configure all pages in the application.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border-0 shadow-sm bg-indigo-50 border-indigo-200">
                        <CardContent className="p-6 space-y-3">
                            <p className="text-sm text-indigo-900">
                                <strong>🔄 Automatic Page Detection:</strong>
                            </p>
                            <ul className="text-sm text-indigo-900 space-y-1 list-disc list-inside">
                                <li>Click "Sync All Pages" to automatically detect all pages in the system</li>
                                <li>New pages are automatically added with admin-only access by default</li>
                                <li>Existing page permissions are preserved during sync</li>
                                <li>Run this sync whenever you create new pages to ensure proper access control</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                        <CardHeader>
                            <CardTitle>Page Access Control</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {pagePermissions.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">No permissions configured</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Page Name</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead className="text-center">Admin</TableHead>
                                            <TableHead className="text-center">Supervisor</TableHead>
                                            <TableHead className="text-center">Dept Head</TableHead>
                                            <TableHead className="text-center">User</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pagePermissions.map((permission) => (
                                            <TableRow key={permission.id}>
                                                <TableCell className="font-medium">{permission.page_name}</TableCell>
                                                <TableCell className="text-slate-600">{permission.description || '-'}</TableCell>
                                                <TableCell className="text-center">
                                                    <Button
                                                        size="sm"
                                                        variant={hasPageRole(permission, 'admin') ? 'default' : 'outline'}
                                                        onClick={() => togglePageRole(permission, 'admin')}
                                                        disabled={updatePermissionMutation.isPending}
                                                        className={hasPageRole(permission, 'admin') ? 'bg-purple-600 hover:bg-purple-700' : ''}
                                                    >
                                                        {hasPageRole(permission, 'admin') ? (
                                                            <>
                                                                <Shield className="w-4 h-4 mr-2" />
                                                                Allowed
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Lock className="w-4 h-4 mr-2" />
                                                                Denied
                                                            </>
                                                        )}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Button
                                                        size="sm"
                                                        variant={hasPageRole(permission, 'supervisor') ? 'default' : 'outline'}
                                                        onClick={() => togglePageRole(permission, 'supervisor')}
                                                        disabled={updatePermissionMutation.isPending}
                                                        className={hasPageRole(permission, 'supervisor') ? 'bg-blue-600 hover:bg-blue-700' : ''}
                                                    >
                                                        {hasPageRole(permission, 'supervisor') ? (
                                                            <>
                                                                <Shield className="w-4 h-4 mr-2" />
                                                                Allowed
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Lock className="w-4 h-4 mr-2" />
                                                                Denied
                                                            </>
                                                        )}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Button
                                                        size="sm"
                                                        variant={hasPageRole(permission, 'department_head') ? 'default' : 'outline'}
                                                        onClick={() => togglePageRole(permission, 'department_head')}
                                                        disabled={updatePermissionMutation.isPending}
                                                        className={hasPageRole(permission, 'department_head') ? 'bg-green-600 hover:bg-green-700' : ''}
                                                    >
                                                        {hasPageRole(permission, 'department_head') ? (
                                                            <>
                                                                <Shield className="w-4 h-4 mr-2" />
                                                                Allowed
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Lock className="w-4 h-4 mr-2" />
                                                                Denied
                                                            </>
                                                        )}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Button
                                                        size="sm"
                                                        variant={hasPageRole(permission, 'user') ? 'default' : 'outline'}
                                                        onClick={() => togglePageRole(permission, 'user')}
                                                        disabled={updatePermissionMutation.isPending}
                                                        className={hasPageRole(permission, 'user') ? 'bg-slate-600 hover:bg-slate-700' : ''}
                                                    >
                                                        {hasPageRole(permission, 'user') ? (
                                                            <>
                                                                <Shield className="w-4 h-4 mr-2" />
                                                                Allowed
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Lock className="w-4 h-4 mr-2" />
                                                                Denied
                                                            </>
                                                        )}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm bg-blue-50 border-blue-200">
                        <CardContent className="p-6 space-y-3">
                            <p className="text-sm text-blue-900">
                                <strong>How it works:</strong>
                            </p>
                            <ul className="text-sm text-blue-900 space-y-1 list-disc list-inside">
                                <li>Click a button to toggle access for that role</li>
                                <li>Purple = Admin, Blue = Supervisor, Green = User access</li>
                                <li>Each page must have at least one role with access</li>
                                <li>Changes take effect immediately</li>
                            </ul>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Email Settings Tab */}
                <TabsContent value="settings" className="space-y-6">
                    <Card className="border-0 shadow-sm">
                        <CardHeader>
                            <CardTitle>Email Domain Restrictions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Allowed Email Domains
                                </label>
                                <Input
                                    placeholder="e.g., @company.com, @almaraghiautomotive.com"
                                    value={emailDomains}
                                    onChange={(e) => setEmailDomains(e.target.value)}
                                    className="mb-2"
                                />
                                <p className="text-xs text-slate-500">
                                    Enter comma-separated email domains (including @). Leave empty to allow all domains.
                                </p>
                            </div>

                            <Button 
                                onClick={handleSaveEmailDomains}
                                disabled={saveEmailDomainsMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                {saveEmailDomainsMutation.isPending ? 'Saving...' : 'Save Settings'}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm bg-blue-50 border-blue-200">
                        <CardContent className="p-6 space-y-3">
                            <p className="text-sm text-blue-900">
                                <strong>How it works:</strong>
                            </p>
                            <ul className="text-sm text-blue-900 space-y-1 list-disc list-inside">
                                <li>Only users with emails from these domains can be invited to the system</li>
                                <li>Enter domains with @ symbol (e.g., @company.com)</li>
                                <li>Separate multiple domains with commas</li>
                                <li>Leave empty to allow any email domain</li>
                                <li>This setting applies to all new user invitations</li>
                            </ul>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <UserDialog
                open={showDialog}
                onClose={() => {
                    setShowDialog(false);
                    setSelectedUser(null);
                }}
                user={selectedUser}
            />
        </div>
    );
}