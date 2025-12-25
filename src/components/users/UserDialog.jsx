import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function UserDialog({ open, onClose, user }) {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        extended_role: 'user',
        company: ''
    });
    const queryClient = useQueryClient();

    const { data: systemSettings = [] } = useQuery({
        queryKey: ['systemSettings'],
        queryFn: () => base44.entities.SystemSettings.list(),
        enabled: open
    });

    useEffect(() => {
        if (user) {
            setFormData({
                full_name: user.full_name || '',
                email: user.email || '',
                extended_role: user.extended_role || user.role || 'user',
                company: user.company || ''
            });
        } else {
            setFormData({
                full_name: '',
                email: '',
                extended_role: 'user',
                company: ''
            });
        }
    }, [user]);

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['users']);
            queryClient.invalidateQueries(['currentUser']);
            toast.success('User updated successfully');
            onClose();
        },
        onError: (error) => {
            console.error('Update error:', error);
            toast.error('Failed to update user: ' + (error.message || 'Unknown error'));
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.full_name || !formData.email) {
            toast.error('Please fill in all required fields');
            return;
        }

        // Validate email domain
        const allowedDomainsSetting = systemSettings.find(s => s.setting_key === 'allowed_email_domains');
        if (allowedDomainsSetting && allowedDomainsSetting.setting_value) {
            const domains = allowedDomainsSetting.setting_value.split(',').map(d => d.trim().toLowerCase());
            const userDomain = '@' + formData.email.split('@')[1]?.toLowerCase();
            
            if (!domains.some(d => userDomain === d.toLowerCase())) {
                toast.error(`Email domain not allowed. Allowed domains: ${allowedDomainsSetting.setting_value}`);
                return;
            }
        }

        // Validate company assignment for user role only
        if (formData.extended_role === 'user' && !formData.company) {
            toast.error('Please assign a company to this user');
            return;
        }

        // Only submit fields that should be updated
        const dataToSubmit = {
            full_name: formData.full_name,
            extended_role: formData.extended_role
        };
        
        // Only include company field based on role
        if (formData.extended_role === 'user') {
            dataToSubmit.company = formData.company;
        } else if (formData.extended_role === 'admin' || formData.extended_role === 'supervisor') {
            dataToSubmit.company = null;
        }

        if (user) {
            console.log('Updating user with data:', dataToSubmit);
            updateMutation.mutate({ id: user.id, data: dataToSubmit });
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
                                value={formData.extended_role}
                                onValueChange={(value) => setFormData({ ...formData, extended_role: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="supervisor">Supervisor</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                {formData.extended_role === 'admin' && 'Full system access'}
                                {formData.extended_role === 'supervisor' && 'All projects & employees, no system settings'}
                                {formData.extended_role === 'user' && 'Company-specific access only'}
                            </p>
                        </div>

                        {formData.extended_role === 'user' && (
                            <div>
                                <Label htmlFor="company">Assigned Company *</Label>
                                <Select
                                    value={formData.company}
                                    onValueChange={(value) => setFormData({ ...formData, company: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Al Maraghi Auto Repairs">Al Maraghi Auto Repairs</SelectItem>
                                        <SelectItem value="Al Maraghi Automotive">Al Maraghi Automotive</SelectItem>
                                        <SelectItem value="Naser Mohsin Auto Parts">Naser Mohsin Auto Parts</SelectItem>
                                        <SelectItem value="Astra Auto Parts">Astra Auto Parts</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500 mt-1">
                                    User will only see data from this company
                                </p>
                            </div>
                        )}

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