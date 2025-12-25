import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, AlertCircle, CheckCircle, FileText, Trash2, Edit, Eye, Upload, Download, LogIn } from 'lucide-react';
import Breadcrumb from '../components/ui/Breadcrumb';
import SortableTableHead from '../components/ui/SortableTableHead';
import TablePagination from '../components/ui/TablePagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function AuditTrail() {
    const [searchTerm, setSearchTerm] = useState('');
    const [actionFilter, setActionFilter] = useState('all');
    const [entityFilter, setEntityFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [sortKey, setSortKey] = useState('created_date');
    const [sortDirection, setSortDirection] = useState('desc');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [selectedLog, setSelectedLog] = useState(null);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
        queryKey: ['auditLogs'],
        queryFn: () => base44.entities.AuditLog.list('-created_date', 1000),
        refetchInterval: 30000
    });

    const { data: activityLogs = [], isLoading: activityLoading } = useQuery({
        queryKey: ['activityLogs'],
        queryFn: () => base44.entities.ActivityLog.list('-created_date', 1000),
        refetchInterval: 30000
    });

    // Merge both log types into unified format
    const allLogs = useMemo(() => {
        const unified = [
            ...auditLogs,
            ...activityLogs.map(log => ({
                id: log.id,
                created_date: log.created_date,
                action: 'LOGIN',
                entity_type: 'System',
                entity_name: 'User Login',
                user_email: log.user_email,
                user_name: log.user_name,
                user_role: log.user_role,
                ip_address: log.ip_address,
                details: `Login from ${log.location || 'Unknown location'}`,
                success: true,
                user_agent: log.user_agent,
                location: log.location
            }))
        ];
        return unified.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    }, [auditLogs, activityLogs]);

    const isLoading = auditLoading || activityLoading;

    const actionIcons = {
        'CREATE': <CheckCircle className="w-4 h-4 text-green-600" />,
        'UPDATE': <Edit className="w-4 h-4 text-blue-600" />,
        'DELETE': <Trash2 className="w-4 h-4 text-red-600" />,
        'ACCESS': <Eye className="w-4 h-4 text-slate-600" />,
        'EXPORT': <Download className="w-4 h-4 text-purple-600" />,
        'IMPORT': <Upload className="w-4 h-4 text-indigo-600" />,
        'ANALYZE': <FileText className="w-4 h-4 text-amber-600" />,
        'LOGIN': <LogIn className="w-4 h-4 text-cyan-600" />
    };

    const actionColors = {
        'CREATE': 'bg-green-100 text-green-800',
        'UPDATE': 'bg-blue-100 text-blue-800',
        'DELETE': 'bg-red-100 text-red-800',
        'ACCESS': 'bg-slate-100 text-slate-800',
        'EXPORT': 'bg-purple-100 text-purple-800',
        'IMPORT': 'bg-indigo-100 text-indigo-800',
        'ANALYZE': 'bg-amber-100 text-amber-800',
        'LOGIN': 'bg-cyan-100 text-cyan-800'
    };

    // Extract unique values for filters
    const uniqueActions = useMemo(() => {
        const actions = new Set(allLogs.map(log => log.action));
        return Array.from(actions).sort();
    }, [allLogs]);

    const uniqueEntities = useMemo(() => {
        const entities = new Set(allLogs.map(log => log.entity_type));
        return Array.from(entities).sort();
    }, [allLogs]);

    const uniqueUsers = useMemo(() => {
        const users = new Set(allLogs.map(log => log.user_email));
        return Array.from(users).sort();
    }, [allLogs]);

    // Filter and sort logs
    const filteredLogs = useMemo(() => {
        let filtered = allLogs.filter(log => {
            const matchesSearch = 
                log.entity_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.details?.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesAction = actionFilter === 'all' || log.action === actionFilter;
            const matchesEntity = entityFilter === 'all' || log.entity_type === entityFilter;
            const matchesUser = userFilter === 'all' || log.user_email === userFilter;

            return matchesSearch && matchesAction && matchesEntity && matchesUser;
        });

        // Sort
        filtered.sort((a, b) => {
            let aVal = a[sortKey];
            let bVal = b[sortKey];

            if (sortKey === 'created_date') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }

            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [auditLogs, searchTerm, actionFilter, entityFilter, userFilter, sortKey, sortDirection]);

    // Paginate
    const paginatedLogs = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredLogs.slice(start, start + rowsPerPage);
    }, [filteredLogs, page, rowsPerPage]);

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('desc');
        }
    };

    if (!currentUser || currentUser.role !== 'admin') {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-900">Access Denied</h2>
                    <p className="text-slate-600 mt-2">This page is only accessible to System Administrators</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Audit Trail' }]} />
            
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Audit Trail</h1>
                <p className="text-slate-600 mt-2">Comprehensive log of all system actions for security and accountability</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-0 shadow-md">
                    <CardContent className="p-4">
                        <p className="text-sm text-slate-600">Total Events</p>
                        <p className="text-2xl font-bold text-slate-900">{auditLogs.length}</p>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                    <CardContent className="p-4">
                        <p className="text-sm text-slate-600">Filtered Results</p>
                        <p className="text-2xl font-bold text-slate-900">{filteredLogs.length}</p>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                    <CardContent className="p-4">
                        <p className="text-sm text-green-600">Successful</p>
                        <p className="text-2xl font-bold text-green-900">
                            {auditLogs.filter(log => log.success !== false).length}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                    <CardContent className="p-4">
                        <p className="text-sm text-red-600">Failed</p>
                        <p className="text-2xl font-bold text-red-900">
                            {auditLogs.filter(log => log.success === false).length}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card className="border-0 shadow-md">
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="md:col-span-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <Input
                                    placeholder="Search by entity, user, or details..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setPage(0);
                                    }}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        <Select value={actionFilter} onValueChange={(value) => { setActionFilter(value); setPage(0); }}>
                            <SelectTrigger>
                                <SelectValue placeholder="Action" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Actions</SelectItem>
                                {uniqueActions.map(action => (
                                    <SelectItem key={action} value={action}>{action}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={entityFilter} onValueChange={(value) => { setEntityFilter(value); setPage(0); }}>
                            <SelectTrigger>
                                <SelectValue placeholder="Entity Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Entities</SelectItem>
                                {uniqueEntities.map(entity => (
                                    <SelectItem key={entity} value={entity}>{entity}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={userFilter} onValueChange={(value) => { setUserFilter(value); setPage(0); }}>
                            <SelectTrigger>
                                <SelectValue placeholder="User" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Users</SelectItem>
                                {uniqueUsers.map(user => (
                                    <SelectItem key={user} value={user}>{user}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Audit Log Table */}
            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle>Audit Events</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-slate-500">Loading audit logs...</div>
                    ) : paginatedLogs.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">No audit events found</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <SortableTableHead
                                                label="Timestamp"
                                                sortKey="created_date"
                                                currentSortKey={sortKey}
                                                sortDirection={sortDirection}
                                                onSort={handleSort}
                                            />
                                            <SortableTableHead
                                                label="Action"
                                                sortKey="action"
                                                currentSortKey={sortKey}
                                                sortDirection={sortDirection}
                                                onSort={handleSort}
                                            />
                                            <SortableTableHead
                                                label="Entity"
                                                sortKey="entity_type"
                                                currentSortKey={sortKey}
                                                sortDirection={sortDirection}
                                                onSort={handleSort}
                                            />
                                            <SortableTableHead
                                                label="Entity Name"
                                                sortKey="entity_name"
                                                currentSortKey={sortKey}
                                                sortDirection={sortDirection}
                                                onSort={handleSort}
                                            />
                                            <SortableTableHead
                                                label="User"
                                                sortKey="user_email"
                                                currentSortKey={sortKey}
                                                sortDirection={sortDirection}
                                                onSort={handleSort}
                                            />
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Details</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {paginatedLogs.map((log) => (
                                            <tr 
                                                key={log.id} 
                                                className="hover:bg-slate-50 cursor-pointer"
                                                onClick={() => setSelectedLog(log)}
                                            >
                                                <td className="px-4 py-3 text-sm text-slate-900">
                                                    {new Date(log.created_date).toLocaleString('en-GB', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        second: '2-digit'
                                                    })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Badge className={`${actionColors[log.action] || 'bg-slate-100 text-slate-800'} flex items-center gap-1 w-fit`}>
                                                        {actionIcons[log.action]}
                                                        {log.action}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-700">{log.entity_type}</td>
                                                <td className="px-4 py-3 text-sm text-slate-900 font-medium">{log.entity_name || '-'}</td>
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-900">{log.user_name}</p>
                                                        <p className="text-xs text-slate-500">{log.user_email}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                                                    {log.details || '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {log.success === false ? (
                                                        <Badge className="bg-red-100 text-red-800">Failed</Badge>
                                                    ) : (
                                                        <Badge className="bg-green-100 text-green-800">Success</Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <TablePagination
                                totalItems={filteredLogs.length}
                                rowsPerPage={rowsPerPage}
                                page={page}
                                onPageChange={setPage}
                                onRowsPerPageChange={(newRowsPerPage) => {
                                    setRowsPerPage(newRowsPerPage);
                                    setPage(0);
                                }}
                            />
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Detail Dialog */}
            <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Audit Event Details</DialogTitle>
                    </DialogHeader>
                    {selectedLog && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-slate-500">Timestamp</p>
                                    <p className="text-sm font-medium">
                                        {new Date(selectedLog.created_date).toLocaleString('en-GB')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Action</p>
                                    <Badge className={`${actionColors[selectedLog.action]} mt-1`}>
                                        {selectedLog.action}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Entity Type</p>
                                    <p className="text-sm font-medium">{selectedLog.entity_type}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Entity Name</p>
                                    <p className="text-sm font-medium">{selectedLog.entity_name || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">User</p>
                                    <p className="text-sm font-medium">{selectedLog.user_name}</p>
                                    <p className="text-xs text-slate-500">{selectedLog.user_email}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Role</p>
                                    <p className="text-sm font-medium">{selectedLog.user_role}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">IP Address</p>
                                    <p className="text-sm font-medium">{selectedLog.ip_address || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Company</p>
                                    <p className="text-sm font-medium">{selectedLog.company || '-'}</p>
                                </div>
                            </div>

                            {selectedLog.details && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Details</p>
                                    <div className="bg-slate-50 rounded-lg p-3 text-sm">{selectedLog.details}</div>
                                </div>
                            )}

                            {selectedLog.old_data && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Previous Data</p>
                                    <pre className="bg-slate-50 rounded-lg p-3 text-xs overflow-x-auto">
                                        {JSON.stringify(JSON.parse(selectedLog.old_data), null, 2)}
                                    </pre>
                                </div>
                            )}

                            {selectedLog.new_data && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">New Data</p>
                                    <pre className="bg-slate-50 rounded-lg p-3 text-xs overflow-x-auto">
                                        {JSON.stringify(JSON.parse(selectedLog.new_data), null, 2)}
                                    </pre>
                                </div>
                            )}

                            {selectedLog.success === false && selectedLog.error_message && (
                                <div>
                                    <p className="text-xs text-red-600 mb-1">Error Message</p>
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
                                        {selectedLog.error_message}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}