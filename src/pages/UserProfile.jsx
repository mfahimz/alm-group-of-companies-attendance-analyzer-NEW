import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User as UserIcon, Mail, Shield, Calendar } from 'lucide-react';

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
                                <span className={`
                                    inline-block px-2 py-1 rounded-full text-xs font-medium mt-1
                                    ${user?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}
                                `}>
                                    {user?.role === 'admin' ? 'Admin' : 'User'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-slate-400" />
                            <div>
                                <p className="text-sm text-slate-600">Member Since</p>
                                <p className="font-medium text-slate-900">
                                    {user?.created_date ? new Date(user.created_date).toLocaleDateString() : '-'}
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