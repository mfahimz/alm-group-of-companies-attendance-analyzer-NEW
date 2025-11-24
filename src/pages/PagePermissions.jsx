import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

const DEFAULT_PAGES = [
    { page_name: 'Dashboard', description: 'Main dashboard and overview', allowed_roles: 'admin,user' },
    { page_name: 'Projects', description: 'Manage attendance projects', allowed_roles: 'admin' },
    { page_name: 'Employees', description: 'Manage employee master list', allowed_roles: 'admin' },
    { page_name: 'Users', description: 'Manage system users and roles', allowed_roles: 'admin' },
    { page_name: 'RulesSettings', description: 'Configure attendance rules', allowed_roles: 'admin' },
    { page_name: 'UserProfile', description: 'View user profile', allowed_roles: 'user' },
    { page_name: 'PagePermissions', description: 'Manage page access permissions', allowed_roles: 'admin' }
];

export default function PagePermissions() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    useEffect(() => {
        if (currentUser && currentUser.role !== 'admin') {
            toast.error('Access denied. Admin only.');
            navigate(createPageUrl('Dashboard'));
        }
    }, [currentUser, navigate]);

    const { data: permissions = [], isLoading } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list()
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.PagePermission.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['pagePermissions']);
            toast.success('Permission updated successfully');
        },
        onError: () => {
            toast.error('Failed to update permission');
        }
    });

    const initializeMutation = useMutation({
        mutationFn: async () => {
            const results = [];
            for (const page of DEFAULT_PAGES) {
                const existing = permissions.find(p => p.page_name === page.page_name);
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

    const toggleRole = (permission, role) => {
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

        updateMutation.mutate({
            id: permission.id,
            data: { allowed_roles: newRoles.join(',') }
        });
    };

    const hasRole = (permission, role) => {
        return permission.allowed_roles.split(',').map(r => r.trim()).includes(role);
    };

    if (!currentUser || currentUser.role !== 'admin') {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Page Permissions</h1>
                    <p className="text-slate-600 mt-2">Control which roles can access each page</p>
                </div>
                <Button
                    onClick={() => initializeMutation.mutate()}
                    disabled={initializeMutation.isPending}
                    variant="outline"
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Initialize Defaults
                </Button>
            </div>

            {permissions.length === 0 && !isLoading && (
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
                    {isLoading ? (
                        <div className="text-center py-8 text-slate-500">Loading permissions...</div>
                    ) : permissions.length === 0 ? (
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
                                {permissions.map((permission) => (
                                    <TableRow key={permission.id}>
                                        <TableCell className="font-medium">{permission.page_name}</TableCell>
                                        <TableCell className="text-slate-600">{permission.description || '-'}</TableCell>
                                        <TableCell className="text-center">
                                            <Button
                                                size="sm"
                                                variant={hasRole(permission, 'admin') ? 'default' : 'outline'}
                                                onClick={() => toggleRole(permission, 'admin')}
                                                disabled={updateMutation.isPending}
                                                className={hasRole(permission, 'admin') ? 'bg-purple-600 hover:bg-purple-700' : ''}
                                            >
                                                {hasRole(permission, 'admin') ? (
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
                                                variant={hasRole(permission, 'user') ? 'default' : 'outline'}
                                                onClick={() => toggleRole(permission, 'user')}
                                                disabled={updateMutation.isPending}
                                                className={hasRole(permission, 'user') ? 'bg-green-600 hover:bg-green-700' : ''}
                                            >
                                                {hasRole(permission, 'user') ? (
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
        </div>
    );
}