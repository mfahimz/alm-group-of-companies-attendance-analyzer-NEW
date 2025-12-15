import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Search, User, Clock, MapPin, Monitor } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import SortableTableHead from '../components/ui/SortableTableHead';
import TablePagination from '../components/ui/TablePagination';

export default function ActivityLogs() {
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState({ key: 'created_date', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const navigate = useNavigate();

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
            const permission = permissions.find(p => p.page_name === 'ActivityLogs');
            if (permission) {
                const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
                if (!allowedRoles.includes(currentUser.role)) {
                    toast.error('Access denied.');
                    navigate(createPageUrl('Dashboard'));
                }
            }
        }
    }, [currentUser, permissions, navigate]);

    const { data: logs = [], isLoading } = useQuery({
        queryKey: ['activityLogs'],
        queryFn: () => base44.entities.ActivityLog.list('-created_date')
    });

    const filteredLogs = logs
        .filter(log => {
            if (!searchTerm) return true;
            const search = searchTerm.toLowerCase();
            return (
                log.user_email?.toLowerCase().includes(search) ||
                log.user_name?.toLowerCase().includes(search) ||
                log.ip_address?.toLowerCase().includes(search) ||
                log.location?.toLowerCase().includes(search)
            );
        })
        .sort((a, b) => {
            let aVal = a[sort.key];
            let bVal = b[sort.key];
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    if (!currentUser) {
        return <div className="text-center py-12 text-slate-500">Loading...</div>;
    }

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Activity Logs' }]} />
            
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Activity Logs</h1>
                    <p className="text-slate-600 mt-1 sm:mt-2 text-sm sm:text-base">
                        Track user login activity and sessions
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="border-0 bg-white shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Total Logins</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{logs.length}</p>
                            </div>
                            <div className="bg-indigo-50 p-3 rounded-lg">
                                <User className="w-5 h-5 text-indigo-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                
                <Card className="border-0 bg-white shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Unique Users</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">
                                    {new Set(logs.map(l => l.user_email)).size}
                                </p>
                            </div>
                            <div className="bg-blue-50 p-3 rounded-lg">
                                <User className="w-5 h-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 bg-white shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Today's Logins</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">
                                    {logs.filter(l => {
                                        const today = new Date().toDateString();
                                        const logDate = new Date(l.created_date).toDateString();
                                        return today === logDate;
                                    }).length}
                                </p>
                            </div>
                            <div className="bg-green-50 p-3 rounded-lg">
                                <Clock className="w-5 h-5 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 bg-white shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">This Week</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">
                                    {logs.filter(l => {
                                        const weekAgo = new Date();
                                        weekAgo.setDate(weekAgo.getDate() - 7);
                                        return new Date(l.created_date) >= weekAgo;
                                    }).length}
                                </p>
                            </div>
                            <div className="bg-amber-50 p-3 rounded-lg">
                                <Clock className="w-5 h-5 text-amber-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Logs Table */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Login History</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search logs..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-12 text-slate-500">Loading logs...</div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">No activity logs yet</div>
                    ) : (
                        <div className="space-y-4">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <SortableTableHead sortKey="user_name" currentSort={sort} onSort={setSort}>
                                                User
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="user_email" currentSort={sort} onSort={setSort}>
                                                Email
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="user_role" currentSort={sort} onSort={setSort}>
                                                Role
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="created_date" currentSort={sort} onSort={setSort}>
                                                Login Time
                                            </SortableTableHead>
                                            <TableHead>IP Address</TableHead>
                                            <TableHead>Location</TableHead>
                                            <TableHead>Device</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedLogs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <User className="w-4 h-4 text-slate-400" />
                                                        {log.user_name || '-'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{log.user_email}</TableCell>
                                                <TableCell>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                        log.user_role === 'admin' 
                                                            ? 'bg-purple-100 text-purple-700' 
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {log.user_role}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Clock className="w-4 h-4 text-slate-400" />
                                                        {new Date(log.created_date).toLocaleString('en-US', {
                                                            day: '2-digit',
                                                            month: '2-digit',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                            hour12: true,
                                                            timeZone: 'Asia/Dubai'
                                                        })}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-600">
                                                    {log.ip_address || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                                        <MapPin className="w-4 h-4 text-slate-400" />
                                                        {log.location || '-'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                                        <Monitor className="w-4 h-4 text-slate-400" />
                                                        <div className="max-w-xs truncate" title={log.user_agent}>
                                                            {log.user_agent ? (
                                                                log.user_agent.includes('Mobile') ? 'Mobile' :
                                                                log.user_agent.includes('Chrome') ? 'Chrome' :
                                                                log.user_agent.includes('Firefox') ? 'Firefox' :
                                                                log.user_agent.includes('Safari') ? 'Safari' :
                                                                'Desktop'
                                                            ) : '-'}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            
                            <TablePagination
                                totalItems={filteredLogs.length}
                                currentPage={currentPage}
                                rowsPerPage={rowsPerPage}
                                onPageChange={setCurrentPage}
                                onRowsPerPageChange={(value) => {
                                    setRowsPerPage(value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}