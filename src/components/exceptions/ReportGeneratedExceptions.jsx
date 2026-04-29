import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Search, Edit, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { EXCEPTION_TYPES, formatExceptionTypeLabel, getFilteredExceptionTypes } from '@/lib/exception-types';
import EditExceptionDialog from './EditExceptionDialog';

const getTypeColor = (type) => {
    const colors = {
        'PUBLIC_HOLIDAY': 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
        'SICK_LEAVE': 'bg-red-50 text-red-700 ring-1 ring-red-200',
        'ANNUAL_LEAVE': 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
        'SHIFT_OVERRIDE': 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
        'MANUAL_PRESENT': 'bg-green-50 text-green-700 ring-1 ring-green-200',
        'MANUAL_ABSENT': 'bg-red-50 text-red-700 ring-1 ring-red-200',
        'ALLOWED_MINUTES': 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
        'SKIP_PUNCH': 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
        'DAY_SWAP': 'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
    };
    return colors[type] || 'bg-slate-50 text-slate-700 ring-1 ring-slate-200';
};

export default function ReportGeneratedExceptions({ project, reportExceptions, employees, canEditAllowedMinutes }) {
    const [reportFilter, setReportFilter] = useState({ search: '', type: 'all' });
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [editingException, setEditingException] = useState(null);
    const [collapsedGroups, setCollapsedGroups] = useState({});

    const queryClient = useQueryClient();

    const { data: reportRuns = [] } = useQuery({
        queryKey: ['reportRuns', project.id],
        queryFn: () => base44.entities.ReportRun.filter({ project_id: project.id }),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false
    });

    const reportRunMap = useMemo(() => {
        return reportRuns.reduce((acc, rr) => {
            acc[rr.id] = rr.report_name || `Report ${rr.id.substring(0, 8)}`;
            return acc;
        }, {});
    }, [reportRuns]);

    const deleteMutation = useMutation({
        mutationFn: async (id) => base44.entities.Exception.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
            toast.success('Exception deleted');
        },
        onError: (error) => toast.error('Failed to delete: ' + error.message)
    });

    const toggleUseInAnalysisMutation = useMutation({
        mutationFn: ({ id, use_in_analysis }) => base44.entities.Exception.update(id, { use_in_analysis }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
            toast.success('Exception updated');
        },
        onError: (error) => toast.error('Failed to update: ' + error.message)
    });

    const filteredExceptions = reportExceptions
        .filter(ex => {
            if (reportFilter.search) {
                const searchLower = reportFilter.search.toLowerCase();
                const matchesId = String(ex.attendance_id).toLowerCase().includes(searchLower);
                const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id));
                const matchesName = employee?.name?.toLowerCase().includes(searchLower);
                if (!matchesId && !matchesName) return false;
            }
            if (reportFilter.type && reportFilter.type !== 'all' && ex.type !== reportFilter.type) return false;
            return true;
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

    // Group by report_run_id
    const grouped = useMemo(() => {
        const groups = {};
        filteredExceptions.forEach(ex => {
            const key = ex.report_run_id || '__no_report__';
            if (!groups[key]) groups[key] = [];
            groups[key].push(ex);
        });
        return groups;
    }, [filteredExceptions]);

    const groupKeys = useMemo(() => {
        return Object.keys(grouped).sort((a, b) => {
            const nameA = reportRunMap[a] || (a === '__no_report__' ? 'zz' : a);
            const nameB = reportRunMap[b] || (b === '__no_report__' ? 'zz' : b);
            return nameA.localeCompare(nameB);
        });
    }, [grouped, reportRunMap]);

    const toggleGroup = (key) => {
        setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (reportExceptions.length === 0) return null;

    return (
        <>
            <Card className="border-0 shadow-sm bg-purple-50/30 ring-1 ring-purple-200">
                <CardHeader>
                    <CardTitle className="text-purple-900">Report-Generated Exceptions ({reportExceptions.length})</CardTitle>
                    <p className="text-sm text-purple-700 mt-1">
                        These exceptions were automatically created from saved reports — grouped by report
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-2">
                        <div className="relative flex-1 w-full sm:max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                className="border-slate-200 focus:ring-indigo-100 pl-9"
                                placeholder="Search by ID or name..."
                                value={reportFilter.search}
                                onChange={(e) => setReportFilter({ ...reportFilter, search: e.target.value })}
                            />
                        </div>
                        <Select
                            value={reportFilter.type}
                            onValueChange={(value) => setReportFilter({ ...reportFilter, type: value })}
                        >
                            <SelectTrigger className="border-slate-200 focus:ring-indigo-100 w-full sm:max-w-xs">
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                {getFilteredExceptionTypes('report_filter', true).map(type => (
                                    <SelectItem key={type.value} value={type.value}>
                                        {type.label || formatExceptionTypeLabel(type.value)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Grouped Tables */}
                    <div className="space-y-4">
                        {groupKeys.map(groupKey => {
                            const groupExceptions = grouped[groupKey];
                            const reportName = groupKey === '__no_report__'
                                ? 'Unknown Report'
                                : (reportRunMap[groupKey] || `Report ${groupKey.substring(0, 8)}`);
                            const isCollapsed = collapsedGroups[groupKey];

                            return (
                                <div key={groupKey} className="border border-purple-200 rounded-lg overflow-hidden">
                                    {/* Group Header */}
                                    <button
                                        className="w-full flex items-center justify-between px-4 py-3 bg-purple-100/70 hover:bg-purple-100 transition-colors text-left"
                                        onClick={() => toggleGroup(groupKey)}
                                    >
                                        <div className="flex items-center gap-2">
                                            {isCollapsed
                                                ? <ChevronRight className="w-4 h-4 text-purple-600" />
                                                : <ChevronDown className="w-4 h-4 text-purple-600" />
                                            }
                                            <FileText className="w-4 h-4 text-purple-600" />
                                            <span className="font-semibold text-purple-900 text-sm">{reportName}</span>
                                            <span className="ml-2 px-2 py-0.5 bg-purple-200 text-purple-800 text-xs rounded-full font-medium">
                                                {groupExceptions.length} exception{groupExceptions.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        {groupKey !== '__no_report__' && (
                                            <span className="text-xs text-purple-500 font-mono hidden sm:block">
                                                ID: {groupKey.substring(0, 8)}...
                                            </span>
                                        )}
                                    </button>

                                    {/* Group Table */}
                                    {!isCollapsed && (
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader className="bg-slate-50/80">
                                                    <TableRow className="hover:bg-transparent border-none">
                                                        <TableHead className="w-12">Use</TableHead>
                                                        <TableHead className="w-24">Att ID</TableHead>
                                                        <TableHead>Name</TableHead>
                                                        <TableHead>Type</TableHead>
                                                        <TableHead>From</TableHead>
                                                        <TableHead>To</TableHead>
                                                        <TableHead>Details</TableHead>
                                                        <TableHead className="text-right">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {groupExceptions.map((exception) => {
                                                        const empName = exception.attendance_id === 'ALL'
                                                            ? '—'
                                                            : (employees.find(e => String(e.attendance_id) === String(exception.attendance_id) && e.company === project.company)?.name || '—');
                                                        return (
                                                            <TableRow key={exception.id} className="hover:bg-slate-100/50 transition-colors duration-200">
                                                                <TableCell className="p-1">
                                                                    <Checkbox
                                                                        checked={exception.use_in_analysis !== false}
                                                                        onCheckedChange={(checked) => toggleUseInAnalysisMutation.mutate({ id: exception.id, use_in_analysis: checked })}
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="p-1 text-sm font-mono text-slate-900">
                                                                    {exception.attendance_id === 'ALL' ? 'ALL' : exception.attendance_id}
                                                                </TableCell>
                                                                <TableCell className="p-1 text-sm text-slate-900">{empName}</TableCell>
                                                                <TableCell className="p-1">
                                                                    <div className="flex flex-col gap-1">
                                                                        {exception.is_custom_type ? (
                                                                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 inline-block w-fit">
                                                                                {exception.custom_type_name || 'Custom'}
                                                                            </span>
                                                                        ) : (
                                                                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium border w-fit ${getTypeColor(exception.type)}`}>
                                                                                {exception.type.replace(/_/g, ' ')}
                                                                            </span>
                                                                        )}
                                                                        {exception.late_minutes > 0 && <span className="text-xs text-orange-600">Late: {exception.late_minutes}m</span>}
                                                                        {exception.early_checkout_minutes > 0 && <span className="text-xs text-blue-600">Early: {exception.early_checkout_minutes}m</span>}
                                                                        {exception.other_minutes > 0 && <span className="text-xs text-purple-600">Other: {exception.other_minutes}m</span>}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="p-1 text-sm">
                                                                    {exception.is_custom_type && (!exception.date_from || exception.date_from === project.date_from)
                                                                        ? '—'
                                                                        : new Date(exception.date_from).toLocaleDateString()}
                                                                </TableCell>
                                                                <TableCell className="p-1 text-sm">
                                                                    {exception.is_custom_type && (!exception.date_to || exception.date_to === project.date_to)
                                                                        ? '—'
                                                                        : new Date(exception.date_to).toLocaleDateString()}
                                                                </TableCell>
                                                                <TableCell className="p-1 text-xs text-slate-600 max-w-xs truncate">
                                                                    {exception.details || '-'}
                                                                </TableCell>
                                                                <TableCell className="text-right p-1">
                                                                    <div className="flex gap-1 justify-end">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => {
                                                                                if (exception.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes) {
                                                                                    toast.error("Only Admin and CEO can edit allowed minutes.");
                                                                                    return;
                                                                                }
                                                                                setEditingException(exception);
                                                                            }}
                                                                            disabled={exception.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes}
                                                                            title={exception.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes ? "Only Admin and CEO can edit allowed minutes." : "Edit exception"}
                                                                        >
                                                                            <Edit className={`w-4 h-4 ${exception.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes ? 'text-slate-400' : 'text-indigo-600'}`} />
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => deleteMutation.mutate(exception.id)}
                                                                        >
                                                                            <Trash2 className="w-4 h-4 text-red-600" />
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-xs text-purple-600 mt-2">
                        💡 Uncheck "Use" to exclude an exception from future analysis runs. You can also delete report-generated exceptions if needed.
                    </p>
                </CardContent>
            </Card>

            <EditExceptionDialog
                open={!!editingException}
                onClose={() => setEditingException(null)}
                exception={editingException}
                projectId={project.id}
                canEditAllowedMinutes={canEditAllowedMinutes}
            />
        </>
    );
}