import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Pencil, Shield, User as UserIcon, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import UserDialog from '../components/users/UserDialog';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

const DEFAULT_PAGES = [
    { page_name: 'Dashboard', description: 'Main dashboard and overview', allowed_roles: 'admin,user' },
    { page_name: 'Projects', description: 'Manage attendance projects', allowed_roles: 'admin' },
    { page_name: 'Employees', description: 'Manage employee master list', allowed_roles: 'admin' },
    { page_name: 'Users', description: 'Manage system users and roles', allowed_roles: 'admin' },
    { page_name: 'RulesSettings', description: 'Configure attendance rules', allowed_roles: 'admin' },
    { page_name: 'UserProfile', description: 'View user profile', allowed_roles: 'user' }
];

export default function Users() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
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
            const permission = permissions.find(p => p.page_name === 'Users');
            if (permission) {
                const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
                if (!allowedRoles.includes(currentUser.role)) {
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
        const newRole = user.role === 'admin' ? 'user' : 'admin';
        if (window.confirm(`Change ${user.full_name}'s role to ${newRole}?`)) {
            updateUserMutation.mutate({
                id: user.id,
                data: { role: newRole }
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

    const initializePermissionsMutation = useMutation({
        mutationFn: async () => {
            const results = [];
            for (const page of DEFAULT_PAGES) {
                const existing = pagePermissions.find(p => p.page_name === page.page_name);
                if (!existing) {
                    const result = await base44.entities.PagePermission.create(page);
                    results.push(result);
                }
            }
            return results;
        },
        onSuccess: (results) => {
            queryClient.invalidateQueries(['pagePermissions']);
            if (results.length > 0) {
                toast.success(`Initialized ${results.length} page permissions`);
            } else {
                toast.info('All pages already configured');
            }
        },
        onError: () => {
            toast.error('Failed to initialize permissions');
        }
    });

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

    const filteredUsers = users.filter(user =>
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!currentUser) {
        return <div className="text-center py-12 text-slate-500">Loading...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
                <p className="text-slate-600 mt-2">Manage system users, roles, and page permissions</p>
            </div>

            <Tabs defaultValue="users" className="space-y-6">
                <TabsList className="bg-white border border-slate-200 p-1">
                    <TabsTrigger value="users">Users & Roles</TabsTrigger>
                    <TabsTrigger value="permissions">Page Permissions</TabsTrigger>
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
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.full_name}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <span className={`
                                                px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1
                                                ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}
                                            `}>
                                                {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                                                {user.role === 'admin' ? 'Admin' : 'User'}
                                            </span>
                                        </TableCell>
                                        <TableCell>{new Date(user.created_date).toLocaleDateString()}</TableCell>
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
                                                    title={`Change role to ${user.role === 'admin' ? 'user' : 'admin'}`}
                                                >
                                                    {user.role === 'admin' ? <UserIcon className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
                </TabsContent>

                {/* Page Permissions Tab */}
                <TabsContent value="permissions" className="space-y-6">
                    <div className="flex items-center justify-between">
                        <p className="text-slate-600">Control which roles can access each page</p>
                        <Button
                            onClick={() => initializePermissionsMutation.mutate()}
                            disabled={initializePermissionsMutation.isPending}
                            variant="outline"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Initialize Defaults
                        </Button>
                    </div>

                    {pagePermissions.length === 0 && (
                        <Card className="border-0 shadow-sm bg-amber-50 border-amber-200">
                            <CardContent className="p-6">
                                <p className="text-amber-900">
                                    No page permissions configured yet. Click "Initialize Defaults" to set up default permissions for all pages.
                                </p>
                            </CardContent>
                        </Card>
                    )}

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
                                            <TableHead className="text-center">Admin Access</TableHead>
                                            <TableHead className="text-center">User Access</TableHead>
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
                                                        variant={hasPageRole(permission, 'user') ? 'default' : 'outline'}
                                                        onClick={() => togglePageRole(permission, 'user')}
                                                        disabled={updatePermissionMutation.isPending}
                                                        className={hasPageRole(permission, 'user') ? 'bg-green-600 hover:bg-green-700' : ''}
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
                                <li>Green = User role can access, Purple = Admin role can access</li>
                                <li>Each page must have at least one role with access</li>
                                <li>Changes take effect immediately</li>
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