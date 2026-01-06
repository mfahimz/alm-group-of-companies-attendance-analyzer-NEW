import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function UserDashboard({ currentUser, projects }) {
    const { data: myExceptions = [] } = useQuery({
        queryKey: ['myExceptions', currentUser?.email],
        queryFn: async () => {
            const allExceptions = await base44.entities.Exception.list('-created_date');
            return allExceptions.filter(e => e.created_by === currentUser?.email);
        }
    });

    const userProjects = projects.filter(p => p.company === currentUser?.company);
    const pendingRequests = myExceptions.filter(e => e.approval_status === 'pending').length;
    const approvedRequests = myExceptions.filter(e => e.approval_status === 'approved').length;

    const myStats = [
        {
            label: 'Active Projects',
            value: userProjects.filter(p => p.status !== 'closed').length,
            icon: Calendar,
            color: 'bg-indigo-500'
        },
        {
            label: 'Pending Requests',
            value: pendingRequests,
            icon: Clock,
            color: 'bg-amber-500'
        },
        {
            label: 'Approved Requests',
            value: approvedRequests,
            icon: CheckCircle,
            color: 'bg-green-500'
        }
    ];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">My Attendance</h2>
                <p className="text-slate-600">View your attendance records and submit requests</p>
            </div>

            {/* User Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {myStats.map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <Card 
                            key={stat.label}
                            className="border-0 shadow-md hover:shadow-lg transition-all duration-300 animate-in fade-in zoom-in-95"
                            style={{ animationDelay: `${idx * 75}ms` }}
                        >
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className={`${stat.color} text-white p-3 rounded-xl shadow-lg`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                                        <p className="text-sm text-slate-600 font-medium">{stat.label}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Link to={createPageUrl('Projects')}>
                            <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                                <Calendar className="w-4 h-4 mr-2" />
                                View My Projects
                            </Button>
                        </Link>
                        <Button variant="outline" className="w-full" disabled>
                            <AlertCircle className="w-4 h-4 mr-2" />
                            Request Exception
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Recent Requests */}
            {myExceptions.length > 0 && (
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-lg">My Recent Requests</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {myExceptions.slice(0, 5).map((ex) => (
                                <div key={ex.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">{ex.type}</p>
                                        <p className="text-xs text-slate-500">
                                            {new Date(ex.date_from).toLocaleDateString()} - {new Date(ex.date_to).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                                        ex.approval_status === 'approved' 
                                            ? 'bg-green-100 text-green-700'
                                            : ex.approval_status === 'rejected'
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {ex.approval_status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}