import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User as UserIcon, Mail, Shield, Calendar } from 'lucide-react';
import { formatInUAE } from '@/components/ui/timezone';

import Breadcrumb from '../components/ui/Breadcrumb';

export default function UserProfile() {
    const { data: user, isLoading } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-slate-500">Loading profile...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'My Profile' }]} />
            <div>
                <h1 className="text-3xl font-bold text-slate-900">My Profile</h1>
                <p className="text-slate-600 mt-2">View your account information</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">Personal Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                            <UserIcon className="w-5 h-5 text-slate-400" />
                            <div>
                                <p className="text-sm text-slate-600">Full Name</p>
                                <p className="font-medium text-slate-900">{user?.full_name || '-'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-slate-400" />
                            <div>
                                <p className="text-sm text-slate-600">Email</p>
                                <p className="font-medium text-slate-900">{user?.email || '-'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">Account Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Shield className="w-5 h-5 text-slate-400" />
                            <div>
                                <p className="text-sm text-slate-600">Role</p>
                                {(() => {
                                    const displayRole = user?.extended_role || user?.role || 'user';
                                    const roleStyles = {
                                        admin: 'bg-purple-100 text-purple-700',
                                        ceo: 'bg-indigo-100 text-indigo-700',
                                        hr_manager: 'bg-teal-100 text-teal-700',
                                        supervisor: 'bg-blue-100 text-blue-700',
                                        department_head: 'bg-green-100 text-green-700',
                                        user: 'bg-slate-100 text-slate-700'
                                    };
                                    const roleLabels = {
                                        admin: 'Admin', ceo: 'CEO', hr_manager: 'HR Manager',
                                        supervisor: 'Supervisor', department_head: 'Dept Head', user: 'User'
                                    };
                                    return (
                                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${roleStyles[displayRole] || roleStyles.user}`}>
                                            {roleLabels[displayRole] || 'User'}
                                        </span>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-slate-400" />
                            <div>
                                <p className="text-sm text-slate-600">Member Since</p>
                                <p className="font-medium text-slate-900">
                                    {user?.created_date ? formatInUAE(user.created_date?.endsWith('Z') ? user.created_date : (user.created_date + 'Z'), 'dd/MM/yyyy') : '-'}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-0 shadow-sm bg-blue-50 border-blue-200">
                <CardContent className="p-6">
                    <p className="text-sm text-blue-900">
                        <strong>Note:</strong> To update your profile information or request additional permissions, please contact your system administrator.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}