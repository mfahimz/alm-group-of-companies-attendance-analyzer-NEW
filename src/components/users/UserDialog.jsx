import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function UserDialog({ open, onClose, user }) {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        role: 'user'
    });
    const queryClient = useQueryClient();

    useEffect(() => {
        if (user) {
            setFormData({
                full_name: user.full_name || '',
                email: user.email || '',
                role: user.role || 'user'
            });
        } else {
            setFormData({
                full_name: '',
                email: '',
                role: 'user'
            });
        }
    }, [user]);

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['users']);
            toast.success('User updated successfully');
            onClose();
        },
        onError: () => {
            toast.error('Failed to update user');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.full_name || !formData.email) {
            toast.error('Please fill in all required fields');
            return;
        }

        if (user) {
            updateMutation.mutate({ id: user.id, data: formData });
        } else {
            toast.info('To add new users, please use the invite feature in your admin dashboard');
            onClose();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{user ? 'Edit User' : 'User Information'}</DialogTitle>
                </DialogHeader>
                {user ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <Label htmlFor="full_name">Full Name *</Label>
                            <Input
                                id="full_name"
                                value={formData.full_name}
                                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                placeholder="John Doe"
                            />
                        </div>

                        <div>
                            <Label htmlFor="email">Email *</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                disabled
                                className="bg-slate-50"
                            />
                            <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
                        </div>

                        <div>
                            <Label htmlFor="role">Role *</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className="bg-indigo-600 hover:bg-indigo-700"
                                disabled={updateMutation.isPending}
                            >
                                {updateMutation.isPending ? 'Saving...' : 'Update User'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <p className="text-slate-600">
                            New users must be invited through the Base44 platform. Please use the invite functionality in your admin dashboard to add new users to the system.
                        </p>
                        <div className="flex justify-end pt-4">
                            <Button onClick={onClose}>
                                Close
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}