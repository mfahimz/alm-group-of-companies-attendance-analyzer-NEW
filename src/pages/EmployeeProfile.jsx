import { useState } from 'react';
import { formatInUAE } from '@/components/ui/timezone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, User, Building2, Briefcase, Calendar, Award, Clock, Edit2, Save, X } from 'lucide-react';
import { createPageUrl } from '../utils';
import Breadcrumb from '../components/ui/Breadcrumb';
import { toast } from 'sonner';

// Half-year name helper: H1 = Jan-Jun, H2 = Jul-Dec
function getHalfName(half) {
    const names = {
        1: 'H1 (Jan-Jun)',
        2: 'H2 (Jul-Dec)'
    };
    return names[half] || `H${half}`;
}

// Current half: months 1-6 → 1, months 7-12 → 2
function getCurrentHalf() {
    const month = new Date().getMonth() + 1;
    return month <= 6 ? 1 : 2;
}

export default function EmployeeProfile() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const urlParams = new URLSearchParams(window.location.search);
    const employeeId = urlParams.get('id');
    const [editingRecord, setEditingRecord] = useState(null);
    const [editValue, setEditValue] = useState('');

    const { data: employee, isLoading } = useQuery({
        queryKey: ['employee', employeeId],
        queryFn: async () => {
            const employees = await base44.entities.Employee.list();
            return employees.find(e => e.id === employeeId);
        },
        enabled: !!employeeId
    });

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list()
    });

    // Fetch half-yearly minutes for this employee (Al Maraghi Auto Repairs only)
    const { data: halfYearlyMinutes = [] } = useQuery({
        queryKey: ['halfYearlyMinutes', employee?.hrms_id],
        queryFn: async () => {
            if (!employee) return [];

            if (employee.company !== 'Al Maraghi Auto Repairs') return [];

            const allMinutes = await base44.entities.EmployeeQuarterlyMinutes.filter({
                employee_id: String(employee.hrms_id),
                company: employee.company
            });

            // Ensure H1 and H2 for the current year exist; create via backend if missing
            const year = new Date().getFullYear();
            const halves = [1, 2];

            for (const half of halves) {
                const exists = allMinutes.some(
                    m => m.year === year && m.half === half
                );
                if (!exists) {
                    // Use the month that falls in the correct half: H1 → Jan (01), H2 → Jul (07)
                    const monthStr = half === 1 ? '01' : '07';
                    const response = await base44.functions.invoke('getOrCreateQuarterlyMinutes', {
                        employee_id: String(employee.hrms_id),
                        company: employee.company,
                        date: `${year}-${monthStr}-01`
                    });
                    if (response.data?.success && response.data?.record_id) {
                        allMinutes.push({
                            id: response.data.record_id,
                            year,
                            half,
                            total_minutes: response.data.total_minutes,
                            used_minutes: response.data.used_minutes,
                            remaining_minutes: response.data.remaining_minutes
                        });
                    }
                }
            }

            return allMinutes;
        },
        enabled: !!employee && employee?.company === 'Al Maraghi Auto Repairs'
    });

    const updateHalfYearlyMutation = useMutation({
        mutationFn: async ({ id, hrms_id, total_minutes }) => {
            const record = halfYearlyMinutes.find(q => q.id === id);
            const newRemaining = Math.max(0, total_minutes - record.used_minutes);

            await base44.entities.EmployeeQuarterlyMinutes.update(id, {
                total_minutes,
                remaining_minutes: newRemaining
            });

            // Sync back to Employee profile using hrms_id directly
            await base44.functions.invoke('syncQuarterlyMinutesToEmployee', {
                quarterly_minutes_id: id,
                employee_hrms_id: hrms_id,
                total_minutes
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['halfYearlyMinutes']);
            queryClient.invalidateQueries(['employee']);
            toast.success('Half-yearly minutes updated and synced');
            setEditingRecord(null);
        },
        onError: (error) => {
            toast.error('Failed to update: ' + error.message);
        }
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-500">Loading employee profile...</div>
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-500">Employee not found</div>
            </div>
        );
    }

    const closedProjects = projects.filter(p => p.status === 'closed' && p.company === employee.company);
    const canEdit = currentUser?.role === 'admin' || currentUser?.extended_role === 'supervisor';
    const isAlMaraghi = employee.company === 'Al Maraghi Auto Repairs';
    const currentHalf = getCurrentHalf();

    const handleEditRecord = (record) => {
        setEditingRecord(record.id);
        setEditValue(record.total_minutes.toString());
    };

    const handleSaveRecord = (recordId) => {
        const value = parseInt(editValue);
        if (isNaN(value) || value < 0) {
            toast.error('Please enter a valid number');
            return;
        }
        updateHalfYearlyMutation.mutate({ id: recordId, hrms_id: employee.hrms_id, total_minutes: value });
    };

    const handleCancelEdit = () => {
        setEditingRecord(null);
        setEditValue('');
    };

    // Calendar-based half-year records (H1/H2)
    const calendarHalfRecords = halfYearlyMinutes
        .filter(q => !q.allocation_type || q.allocation_type === 'calendar_quarter')
        .sort((a, b) => (a.half || 0) - (b.half || 0));

    // Project-period allocations (legacy)
    const projectPeriodRecords = halfYearlyMinutes.filter(q => q.allocation_type === 'project_period');

    return (
        <div className="space-y-6">
            <Breadcrumb
                items={[
                    { label: 'Employees', path: 'Employees' },
                    { label: employee.name }
                ]}
            />

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(createPageUrl('Employees'))}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Employees
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">{employee.name}</h1>
                        <p className="text-slate-500 mt-1">{employee.hrms_id}</p>
                    </div>
                </div>
                <div className={`px-4 py-2 rounded-lg font-medium ${
                    employee.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                    {employee.active ? 'Active' : 'Inactive'}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="w-5 h-5 text-indigo-600" />
                            Personal Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm text-slate-500">Full Name</label>
                            <p className="font-medium text-slate-900">{employee.name}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">HRMS ID</label>
                            <p className="font-medium text-slate-900">{employee.hrms_id}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Attendance ID</label>
                            <p className="font-medium text-slate-900">{employee.attendance_id}</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Work Information */}
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-indigo-600" />
                            Work Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm text-slate-500">Company</label>
                            <p className="font-medium text-slate-900">{employee.company}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Department</label>
                            <p className="font-medium text-slate-900">{employee.department || '—'}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Weekly Off</label>
                            <p className="font-medium text-slate-900">{employee.weekly_off || 'Sunday'}</p>
                        </div>
                        {employee.joining_date && (
                            <div>
                                <label className="text-sm text-slate-500">Joining Date</label>
                                <p className="font-medium text-slate-900">
                                    {formatInUAE(new Date(employee.joining_date), 'dd/MM/yyyy')}
                                </p>
                            </div>
                        )}
                        <div>
                            <label className="text-sm text-slate-500">Employment Status</label>
                            <p className="font-medium text-slate-900">{employee.active ? 'Active' : 'Inactive'}</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Grace Minutes */}
                <Card className="border-0 shadow-md bg-gradient-to-br from-indigo-50 to-purple-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-indigo-600" />
                            Carried Grace Minutes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-center py-6">
                            <div className="text-5xl font-bold text-indigo-600 mb-2">
                                {employee.carried_grace_minutes || 0}
                            </div>
                            <p className="text-sm text-slate-600">minutes available from previous projects</p>
                        </div>
                        <div className="mt-4 p-3 bg-white/60 rounded-lg">
                            <p className="text-xs text-slate-600">
                                <strong>Note:</strong> Grace minutes are carried forward from closed projects and can be used in future analysis runs.
                                Managed via <a href={createPageUrl('GraceMinutesManagement')} className="text-indigo-600 underline">Grace Minutes Management</a>.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Half-Yearly Other Minutes - Al Maraghi Auto Repairs Only */}
                {isAlMaraghi && (
                    <Card className="border-0 shadow-md col-span-1 md:col-span-2 bg-gradient-to-br from-amber-50 to-orange-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Award className="w-5 h-5 text-amber-600" />
                                Other Minutes Allowances
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-4 p-3 bg-white/60 rounded-lg">
                                <p className="text-xs text-slate-600">
                                    <strong>Policy:</strong> Employees receive 120 other minutes per half-year (H1: Jan–Jun, H2: Jul–Dec).
                                    Department heads can approve usage to reduce salary deductions.
                                </p>
                            </div>

                            {/* Calendar Half-Year Records (H1 / H2) */}
                            {calendarHalfRecords.length > 0 && (
                                <>
                                    <h3 className="text-sm font-semibold text-slate-700 mb-3">
                                        Half-Year Allowances ({new Date().getFullYear()})
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                        {calendarHalfRecords.map((record) => {
                                            const isCurrentPeriod = record.half === currentHalf;
                                            const isEditing = editingRecord === record.id;

                                            return (
                                                <div
                                                    key={record.id}
                                                    className={`p-4 rounded-lg border-2 ${
                                                        isCurrentPeriod
                                                            ? 'border-amber-500 bg-white shadow-md'
                                                            : 'border-slate-200 bg-white/80'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="font-semibold text-slate-700">
                                                            {getHalfName(record.half)}
                                                        </h4>
                                                        {isCurrentPeriod && (
                                                            <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded">
                                                                Current
                                                            </span>
                                                        )}
                                                    </div>

                                                    {isEditing ? (
                                                        <div className="space-y-2">
                                                            <Input
                                                                type="number"
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                className="h-8"
                                                                min="0"
                                                            />
                                                            <div className="flex gap-1">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleSaveRecord(record.id)}
                                                                    className="flex-1 h-7"
                                                                    disabled={updateHalfYearlyMutation.isPending}
                                                                >
                                                                    <Save className="w-3 h-3 mr-1" />
                                                                    Save
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={handleCancelEdit}
                                                                    className="h-7"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-baseline justify-between mb-1">
                                                                <span className="text-xs text-slate-500">Total:</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-lg font-bold text-slate-900">
                                                                        {record.total_minutes}
                                                                    </span>
                                                                    {canEdit && (
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => handleEditRecord(record)}
                                                                            className="h-6 w-6 p-0"
                                                                        >
                                                                            <Edit2 className="w-3 h-3" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-baseline justify-between mb-1">
                                                                <span className="text-xs text-slate-500">Used:</span>
                                                                <span className="text-sm font-medium text-red-600">
                                                                    {record.used_minutes}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-baseline justify-between">
                                                                <span className="text-xs text-slate-500">Remaining:</span>
                                                                <span className="text-sm font-bold text-green-600">
                                                                    {record.remaining_minutes}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* Project-Period Allocations (legacy) */}
                            {projectPeriodRecords.length > 0 && (
                                <>
                                    <h3 className="text-sm font-semibold text-slate-700 mb-3 mt-6">
                                        Project-Based Allocations
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {projectPeriodRecords.map((allocation) => {
                                            const isEditing = editingRecord === allocation.id;
                                            const project = projects.find(p => p.id === allocation.project_id);

                                            return (
                                                <div
                                                    key={allocation.id}
                                                    className="p-4 rounded-lg border-2 border-purple-300 bg-white shadow-sm"
                                                >
                                                    <div className="mb-2">
                                                        <h4 className="font-semibold text-slate-700 text-sm">
                                                            {project?.name || 'Unknown Project'}
                                                        </h4>
                                                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded mt-1 inline-block">
                                                            Project Period
                                                        </span>
                                                    </div>

                                                    {isEditing ? (
                                                        <div className="space-y-2">
                                                            <Input
                                                                type="number"
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                className="h-8"
                                                                min="0"
                                                            />
                                                            <div className="flex gap-1">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleSaveRecord(allocation.id)}
                                                                    className="flex-1 h-7"
                                                                    disabled={updateHalfYearlyMutation.isPending}
                                                                >
                                                                    <Save className="w-3 h-3 mr-1" />
                                                                    Save
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={handleCancelEdit}
                                                                    className="h-7"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-baseline justify-between mb-1">
                                                                <span className="text-xs text-slate-500">Total:</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-lg font-bold text-slate-900">
                                                                        {allocation.total_minutes}
                                                                    </span>
                                                                    {canEdit && (
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => handleEditRecord(allocation)}
                                                                            className="h-6 w-6 p-0"
                                                                        >
                                                                            <Edit2 className="w-3 h-3" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-baseline justify-between mb-1">
                                                                <span className="text-xs text-slate-500">Used:</span>
                                                                <span className="text-sm font-medium text-red-600">
                                                                    {allocation.used_minutes}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-baseline justify-between">
                                                                <span className="text-xs text-slate-500">Remaining:</span>
                                                                <span className="text-sm font-bold text-green-600">
                                                                    {allocation.remaining_minutes}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Project History */}
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-indigo-600" />
                            Project History
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <span className="text-sm text-slate-600">Total Closed Projects</span>
                                <span className="font-bold text-slate-900">{closedProjects.length}</span>
                            </div>
                            {closedProjects.length > 0 && (
                                <div className="text-xs text-slate-500">
                                    Most recent: {closedProjects
                                        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]?.name}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Account Details */}
                <Card className="border-0 shadow-md col-span-1 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-indigo-600" />
                            Account Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-sm text-slate-500">Created On</label>
                                <p className="font-medium text-slate-900">
                                    {formatInUAE(employee.created_date?.endsWith('Z') ? employee.created_date : (employee.created_date + 'Z'), 'dd/MM/yyyy hh:mm a')}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Last Updated</label>
                                <p className="font-medium text-slate-900">
                                    {formatInUAE(employee.updated_date?.endsWith('Z') ? employee.updated_date : (employee.updated_date + 'Z'), 'dd/MM/yyyy hh:mm a')}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}