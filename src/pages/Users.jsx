import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Pencil, Shield, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import UserDialog from '../components/users/UserDialog';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function Users() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Check if current user is admin
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

    const { data: users = [], isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: () => base44.entities.User.list('-created_date')
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

    const filteredUsers = users.filter(user =>
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!currentUser || currentUser.role !== 'admin') {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Users</h1>
                    <p className="text-slate-600 mt-2">Manage system users and permissions</p>
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

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Users Table */}
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