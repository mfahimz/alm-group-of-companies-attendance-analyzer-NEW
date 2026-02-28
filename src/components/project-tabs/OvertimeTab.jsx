import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Clock, Search, Save, Upload, Download, FileSpreadsheet, Users, DollarSign, Lock } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import SortableTableHead from '../ui/SortableTableHead';


export default function OvertimeTab({ project }) {
    const queryClient = useQueryClient();

    // ============================================
    // STATE
    // ============================================
    const [searchQuery, setSearchQuery] = useState('');
    const [editableData, setEditableData] = useState({});
    const [editableAdjustments, setEditableAdjustments] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingAdjustments, setIsSavingAdjustments] = useState(false);
    const [sortColumn, setSortColumn] = useState({ key: 'name', direction: 'asc' });

    // ============================================
    // QUERIES
    // ============================================
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Fetch employees for this company
    const { data: employees = [], isLoading: loadingEmployees } = useQuery({
        queryKey: ['employees', project?.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company, active: true }),
        enabled: !!project?.company,
        staleTime: 5 * 60 * 1000
    });



    // Fetch existing overtime data for this project
    const { data: overtimeRecords = [], isLoading: loadingOT, refetch: refetchOT } = useQuery({
        queryKey: ['overtimeData', project?.id],
        queryFn: () => base44.entities.OvertimeData.filter({ project_id: project.id }),
        enabled: !!project?.id,
        staleTime: 0
    });

    // Fetch all report runs for this project to find the finalized one
    const { data: reportRuns = [], isLoading: loadingReports } = useQuery({
        queryKey: ['reportRuns', project?.id],
        queryFn: () => base44.entities.ReportRun.filter({ project_id: project.id }),
        enabled: !!project?.id,
        staleTime: 0
    });

    // Find the finalized report from the list (there should only be one with is_final=true)
    const finalizedReport = useMemo(() => {
        return reportRuns.find(r => r.is_final === true) || null;
    }, [reportRuns]);

    // Fetch salary snapshots for adjustments (only after finalization)
    const { data: salarySnapshots = [], isLoading: loadingSnapshots, refetch: refetchSnapshots } = useQuery({
        queryKey: ['salarySnapshots', project?.id, finalizedReport?.id],
        queryFn: () => base44.entities.SalarySnapshot.filter({
            project_id: project.id,
            report_run_id: finalizedReport.id
        }),
        enabled: !!project?.id && !!finalizedReport?.id,
        staleTime: 0
    });

    // ============================================
    // DERIVED VALUES
    // ============================================
    const hasFinalReport = !!finalizedReport;
    const isAlMaraghiMotors = project?.company === 'Al Maraghi Motors';
    const isProjectClosed = project?.status === 'closed';
    const canEditAdjustments = hasFinalReport && !isProjectClosed;

    // Build employee list with OT data
    const overtimeData = useMemo(() => {
        // Filter employees to only those with custom_employee_ids if specified
        let filteredEmployees = employees;
        
        if (project?.custom_employee_ids) {
            const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id);
            filteredEmployees = employees.filter(emp => 
                customIds.includes(String(emp.hrms_id)) || customIds.includes(String(emp.attendance_id))
            );
        }

        // For Al Maraghi Motors, exclude employees without attendance_id
        if (isAlMaraghiMotors) {
            filteredEmployees = filteredEmployees.filter(emp => emp.attendance_id && String(emp.attendance_id).trim() !== '');
        }

        return filteredEmployees.map(emp => {
            const otRecord = overtimeRecords.find(ot => 
                String(ot.attendance_id) === String(emp.attendance_id)
            );

            // Get salary snapshot for this employee (for adjustments)
            const snapshot = salarySnapshots.find(s => 
                String(s.attendance_id) === String(emp.attendance_id)
            );

            return {
                hrms_id: emp.hrms_id,
                attendance_id: emp.attendance_id,
                name: emp.name,
                department: emp.department,
                normalOtHours: editableData[emp.attendance_id]?.normalOtHours ?? otRecord?.normalOtHours ?? 0,
                specialOtHours: editableData[emp.attendance_id]?.specialOtHours ?? otRecord?.specialOtHours ?? 0,
                otRecordId: otRecord?.id,
                // Adjustment fields from OvertimeData (editable anytime) or SalarySnapshot (after finalization)
                snapshotId: snapshot?.id,
                attendanceSource: snapshot?.attendance_source || null,
                bonus: editableAdjustments[emp.attendance_id]?.bonus ?? otRecord?.bonus ?? snapshot?.bonus ?? 0,
                incentive: editableAdjustments[emp.attendance_id]?.incentive ?? otRecord?.incentive ?? snapshot?.incentive ?? 0,
                open_leave_salary: editableAdjustments[emp.attendance_id]?.open_leave_salary ?? otRecord?.open_leave_salary ?? snapshot?.open_leave_salary ?? 0,
                variable_salary: editableAdjustments[emp.attendance_id]?.variable_salary ?? otRecord?.variable_salary ?? snapshot?.variable_salary ?? 0,
                otherDeduction: editableAdjustments[emp.attendance_id]?.otherDeduction ?? otRecord?.otherDeduction ?? snapshot?.otherDeduction ?? 0,
                advanceSalaryDeduction: editableAdjustments[emp.attendance_id]?.advanceSalaryDeduction ?? otRecord?.advanceSalaryDeduction ?? snapshot?.advanceSalaryDeduction ?? 0
            };
        });
    }, [employees, overtimeRecords, editableData, editableAdjustments, salarySnapshots, project?.custom_employee_ids, isAlMaraghiMotors]);

    // Filter and sort
    const filteredData = useMemo(() => {
        let filtered = overtimeData;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item =>
                item.name?.toLowerCase().includes(query) ||
                item.attendance_id?.toString().includes(query) ||
                (item.department && item.department.toLowerCase().includes(query))
            );
        }

        return [...filtered].sort((a, b) => {
            const key = sortColumn.key;
            const aVal = a[key];
            const bVal = b[key];
            let compareResult = 0;

            if (typeof aVal === 'string') {
                compareResult = (aVal || '').localeCompare(bVal || '');
            } else if (typeof aVal === 'number') {
                compareResult = (aVal || 0) - (bVal || 0);
            }

            return sortColumn.direction === 'asc' ? compareResult : -compareResult;
        });
    }, [overtimeData, searchQuery, sortColumn]);

    // ============================================
    // HANDLERS
    // ============================================
    const handleChange = (attendanceId, field, value) => {
        setEditableData(prev => ({
            ...prev,
            [attendanceId]: {
                ...(prev[attendanceId] || {}),
                [field]: value === '' ? 0 : parseFloat(value) || 0
            }
        }));
    };

    const getValue = (row, field) => {
        if (editableData[row.attendance_id] !== undefined && editableData[row.attendance_id][field] !== undefined) {
            return editableData[row.attendance_id][field];
        }
        const persistedOtRecord = overtimeRecords.find(ot => String(ot.attendance_id) === String(row.attendance_id));
        return persistedOtRecord?.[field] ?? 0;
    };

    const handleAdjustmentChange = (attendanceId, field, value) => {
        const numValue = value === '' ? 0 : parseFloat(value) || 0;
        
        // Validation: bonus and incentive must be >= 0
        if ((field === 'bonus' || field === 'incentive' || field === 'open_leave_salary' || field === 'variable_salary') && numValue < 0) {
            const label = field === 'bonus'
                ? 'Bonus'
                : field === 'incentive'
                    ? 'Incentive'
                    : field === 'open_leave_salary'
                        ? 'Open Leave Salary'
                        : 'Variable Salary';
            toast.error(`${label} cannot be negative`);
            return;
        }

        setEditableAdjustments(prev => ({
            ...prev,
            [attendanceId]: {
                ...(prev[attendanceId] || {}),
                [field]: numValue
            }
        }));
    };

    const getAdjustmentValue = (row, field) => {
        return editableAdjustments[row.attendance_id]?.[field] ?? row[field] ?? 0;
    };

    const handleSave = async () => {
        if (Object.keys(editableData).length === 0) {
            toast.info('No changes to save');
            return;
        }

        setIsSaving(true);
        try {
            const updates = [];
            const creates = [];

            Object.entries(editableData).forEach(([attendanceId, edits]) => {
                const employee = overtimeData.find(e => String(e.attendance_id) === String(attendanceId));
                if (!employee) return;

                // Get the persisted OT record to preserve the field NOT being edited
                const persistedOtRecord = overtimeRecords.find(ot => String(ot.attendance_id) === String(attendanceId));

                const data = {
                    project_id: project.id,
                    attendance_id: String(attendanceId),
                    hrms_id: String(employee.hrms_id || ''),
                    name: employee.name,
                    department: employee.department || '',
                    // Use edited value if present, else fall back to persisted record, else 0
                    normalOtHours: edits.normalOtHours !== undefined ? edits.normalOtHours : (persistedOtRecord?.normalOtHours ?? 0),
                    specialOtHours: edits.specialOtHours !== undefined ? edits.specialOtHours : (persistedOtRecord?.specialOtHours ?? 0),
                    // Preserve existing adjustment values when saving OT
                    bonus: persistedOtRecord?.bonus ?? employee.bonus ?? 0,
                    incentive: persistedOtRecord?.incentive ?? employee.incentive ?? 0,
                    open_leave_salary: persistedOtRecord?.open_leave_salary ?? employee.open_leave_salary ?? 0,
                    variable_salary: persistedOtRecord?.variable_salary ?? employee.variable_salary ?? 0,
                    otherDeduction: persistedOtRecord?.otherDeduction ?? employee.otherDeduction ?? 0,
                    advanceSalaryDeduction: persistedOtRecord?.advanceSalaryDeduction ?? employee.advanceSalaryDeduction ?? 0
                };

                if (employee.otRecordId) {
                    updates.push({ id: employee.otRecordId, data });
                } else {
                    creates.push(data);
                }
            });

            // Execute updates
            for (const { id, data } of updates) {
                await base44.entities.OvertimeData.update(id, data);
            }

            // Execute creates
            if (creates.length > 0) {
                await base44.entities.OvertimeData.bulkCreate(creates);
            }

            toast.success(`Overtime data saved for ${Object.keys(editableData).length} employee(s)`);
            setEditableData({});
            refetchOT();
        } catch (error) {
            toast.error('Failed to save: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportTemplate = () => {
        const templateData = filteredData.map(row => ({
            'Attendance ID': row.attendance_id,
            'HRMS ID': row.hrms_id,
            'Name': row.name,
            'Department': row.department || '',
            'Attendance Source': row.attendanceSource || 'ANALYZED',
            'Normal OT Hours': row.normalOtHours || 0,
            'Special OT Hours': row.specialOtHours || 0
        }));

        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Overtime');
        XLSX.writeFile(wb, `OT_Template_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('Template downloaded');
    };

    const handleImportOT = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);

            const newEdits = {};
            let matched = 0;

            rows.forEach(row => {
                const attendanceId = String(row['Attendance ID'] || row['attendance_id'] || '');
                const normalOtHours = parseFloat(row['Normal OT Hours'] || row['normalOtHours'] || 0) || 0;
                const specialOtHours = parseFloat(row['Special OT Hours'] || row['specialOtHours'] || 0) || 0;

                // Find matching employee
                const employee = overtimeData.find(e => String(e.attendance_id) === attendanceId);

                if (employee) {
                    newEdits[attendanceId] = { normalOtHours, specialOtHours };
                    matched++;
                }
            });

            if (matched === 0) {
                toast.error('No matching employees found in the uploaded file');
                return;
            }

            setEditableData(prev => ({ ...prev, ...newEdits }));
            toast.success(`Loaded OT data for ${matched} employee(s). Click "Save Changes" to apply.`);
        } catch (error) {
            toast.error('Failed to import file: ' + error.message);
        }

        e.target.value = '';
    };

    // Save adjustments to OvertimeData (always editable)
    const handleSaveAdjustments = async () => {
        if (Object.keys(editableAdjustments).length === 0) {
            toast.info('No adjustment changes to save');
            return;
        }

        setIsSavingAdjustments(true);
        try {
            const otUpdates = [];
            const otCreates = [];
            const snapshotUpdates = [];

            Object.entries(editableAdjustments).forEach(([attendanceId, edits]) => {
                const employee = overtimeData.find(e => String(e.attendance_id) === String(attendanceId));
                if (!employee) return;

                const adjustmentData = {
                    bonus: edits.bonus ?? employee.bonus ?? 0,
                    incentive: edits.incentive ?? employee.incentive ?? 0,
                    open_leave_salary: edits.open_leave_salary ?? employee.open_leave_salary ?? 0,
                    variable_salary: edits.variable_salary ?? employee.variable_salary ?? 0,
                    otherDeduction: edits.otherDeduction ?? employee.otherDeduction ?? 0,
                    advanceSalaryDeduction: edits.advanceSalaryDeduction ?? employee.advanceSalaryDeduction ?? 0
                };

                // Save to OvertimeData (always)
                if (employee.otRecordId) {
                    otUpdates.push({
                        id: employee.otRecordId,
                        data: {
                            ...adjustmentData,
                            normalOtHours: employee.normalOtHours ?? 0,
                            specialOtHours: employee.specialOtHours ?? 0
                        }
                    });
                } else {
                    otCreates.push({
                        project_id: project.id,
                        attendance_id: String(attendanceId),
                        hrms_id: String(employee.hrms_id || ''),
                        name: employee.name,
                        department: employee.department || '',
                        normalOtHours: employee.normalOtHours ?? 0,
                        specialOtHours: employee.specialOtHours ?? 0,
                        ...adjustmentData
                    });
                }

                // Also save to SalarySnapshot if it exists (finalized report)
                if (employee.snapshotId) {
                    snapshotUpdates.push({
                        id: employee.snapshotId,
                        data: adjustmentData
                    });
                }
            });

            // Execute OT updates
            for (const { id, data } of otUpdates) {
                await base44.entities.OvertimeData.update(id, data);
            }

            // Execute OT creates
            if (otCreates.length > 0) {
                await base44.entities.OvertimeData.bulkCreate(otCreates);
            }

            // Execute snapshot updates if report is finalized
            if (snapshotUpdates.length > 0) {
                for (const { id, data } of snapshotUpdates) {
                    await base44.entities.SalarySnapshot.update(id, data);
                }
            }

            toast.success(`Adjustments saved for ${Object.keys(editableAdjustments).length} employee(s)`);
            setEditableAdjustments({});
            refetchOT();
            if (hasFinalReport) {
                refetchSnapshots();
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project?.id] });
            }
        } catch (error) {
            toast.error('Failed to save adjustments: ' + error.message);
        } finally {
            setIsSavingAdjustments(false);
        }
    };

    // ============================================
    // RENDER
    // ============================================
    if (loadingEmployees || loadingOT || loadingReports || loadingSnapshots) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <p className="text-slate-500">Loading data...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
        <Card className="border-0 shadow-lg">
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-6 h-6 text-orange-600" />
                            Overtime Management
                        </CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                            Enter overtime hours for employees
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            onClick={handleExportTemplate}
                            className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export Template
                        </Button>
                        <label className="cursor-pointer">
                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleImportOT}
                                className="hidden"
                            />
                            <Button
                                variant="outline"
                                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                                asChild
                            >
                                <span>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Import OT
                                </span>
                            </Button>
                        </label>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || Object.keys(editableData).length === 0}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {/* Info Banner */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-800">
                    <strong>Note:</strong> OT hours entered here will be included in generated salary reports.
                </div>

                {/* Search */}
                <div className="mb-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name, ID, or department..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                    </div>
                    <p className="text-sm text-slate-500 mt-2">
                        <Users className="w-4 h-4 inline mr-1" />
                        Showing {filteredData.length} of {overtimeData.length} employees
                        {Object.keys(editableData).length > 0 && (
                            <span className="ml-2 text-amber-600 font-medium">
                                • {Object.keys(editableData).length} unsaved change(s)
                            </span>
                        )}
                    </p>
                </div>

                {/* OT Table */}
                <div className="border rounded-lg overflow-auto max-h-[500px]">
                    <Table>
                        <TableHeader className="sticky top-0 bg-slate-50 z-10">
                            <TableRow>
                                <SortableTableHead sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn}>Att. ID</SortableTableHead>
                                <SortableTableHead sortKey="name" currentSort={sortColumn} onSort={setSortColumn}>Name</SortableTableHead>
                                <SortableTableHead sortKey="department" currentSort={sortColumn} onSort={setSortColumn}>Department</SortableTableHead>
                                <TableHead className="bg-blue-50">Normal OT Hours</TableHead>
                                <TableHead className="bg-cyan-50">Special OT Hours</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12">
                                        <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                                        <p className="text-slate-500">No employees found</p>
                                    </TableCell>
                                </TableRow>
                            ) : filteredData.map(row => {
                                const hasEdits = editableData[row.attendance_id];
                                return (
                                    <TableRow key={row.attendance_id} className={hasEdits ? 'bg-amber-50' : ''}>
                                        <TableCell className="font-medium">{row.attendance_id}</TableCell>
                                        <TableCell className="font-medium">{row.name?.split(' ').slice(0, 2).join(' ')}</TableCell>
                                        <TableCell className="text-slate-600">{row.department || '-'}</TableCell>
                                        <TableCell className="bg-blue-50 p-1">
                                            <Input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                value={getValue(row, 'normalOtHours')}
                                                onChange={(e) => handleChange(row.attendance_id, 'normalOtHours', e.target.value)}
                                                className="h-8 text-sm w-20"
                                            />
                                        </TableCell>
                                        <TableCell className="bg-cyan-50 p-1">
                                            <Input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                value={getValue(row, 'specialOtHours')}
                                                onChange={(e) => handleChange(row.attendance_id, 'specialOtHours', e.target.value)}
                                                className="h-8 text-sm w-20"
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>

        {/* ADJUSTMENTS SECTION - Always visible */}
        <div className="mt-6">
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="w-6 h-6 text-green-600" />
                                Salary Adjustments
                                {isProjectClosed && <Lock className="w-4 h-4 text-slate-400" />}
                            </CardTitle>
                            <p className="text-sm text-slate-500 mt-1">
                                Enter bonus, incentives, and deductions for finalized report
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                onClick={handleSaveAdjustments}
                                disabled={!canEditAdjustments || isSavingAdjustments || Object.keys(editableAdjustments).length === 0}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {isSavingAdjustments ? 'Saving...' : 'Save Adjustments'}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Info Banner */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-800">
                        <strong>Note:</strong> These adjustments will be included in generated salary reports. Bonus and Incentive add to salary; Other Deduction and Advance Salary Deduction subtract from salary.
                    </div>

                    {/* Search for Adjustments */}
                    <div className="mb-4">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by name, ID, or department..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>
                        <p className="text-sm text-slate-500 mt-2">
                            <Users className="w-4 h-4 inline mr-1" />
                            Showing {filteredData.length} of {overtimeData.length} employees
                            {Object.keys(editableAdjustments).length > 0 && (
                                <span className="ml-2 text-amber-600 font-medium">
                                    • {Object.keys(editableAdjustments).length} unsaved adjustment change(s)
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Adjustments Table */}
                    <div className="border rounded-lg overflow-auto max-h-[500px]">
                        <Table>
                            <TableHeader className="sticky top-0 bg-slate-50 z-10">
                                <TableRow>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn}>Att. ID</SortableTableHead>
                                    <SortableTableHead sortKey="name" currentSort={sortColumn} onSort={setSortColumn}>Name</SortableTableHead>
                                    <SortableTableHead sortKey="department" currentSort={sortColumn} onSort={setSortColumn}>Department</SortableTableHead>
                                    <TableHead className="bg-green-50 text-green-700">Bonus (+)</TableHead>
                                    <TableHead className="bg-green-50 text-green-700">Incentive (+)</TableHead>
                                    {isAlMaraghiMotors && <TableHead className="bg-green-50 text-green-700">Open Leave Salary (+)</TableHead>}
                                    {isAlMaraghiMotors && <TableHead className="bg-green-50 text-green-700">Variable Salary (+)</TableHead>}
                                    <TableHead className="bg-red-50 text-red-700">Other Deduction (-)</TableHead>
                                    <TableHead className="bg-red-50 text-red-700">Advance Salary Deduction (-)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={isAlMaraghiMotors ? 9 : 7} className="text-center py-12">
                                            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                                            <p className="text-slate-500">No employees found</p>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredData.map(row => {
                                   const hasAdjustmentEdits = editableAdjustments[row.attendance_id];
                                   return (
                                       <TableRow key={`adj-${row.attendance_id}`} className={hasAdjustmentEdits ? 'bg-amber-50' : ''}>
                                           <TableCell className="font-medium">{row.attendance_id}</TableCell>
                                           <TableCell className="font-medium">{row.name?.split(' ').slice(0, 2).join(' ')}</TableCell>
                                           <TableCell className="text-slate-600">{row.department || '-'}</TableCell>
                                            <TableCell className="bg-green-50 p-1">
                                               <Input
                                                   type="number"
                                                   step="0.01"
                                                   min="0"
                                                   value={getAdjustmentValue(row, 'bonus')}
                                                   onChange={(e) => handleAdjustmentChange(row.attendance_id, 'bonus', e.target.value)}
                                                   className="h-8 text-sm w-20"
                                                   disabled={!canEditAdjustments}
                                               />
                                            </TableCell>
                                            <TableCell className="bg-green-50 p-1">
                                               <Input
                                                   type="number"
                                                   step="0.01"
                                                   min="0"
                                                   value={getAdjustmentValue(row, 'incentive')}
                                                   onChange={(e) => handleAdjustmentChange(row.attendance_id, 'incentive', e.target.value)}
                                                   className="h-8 text-sm w-20"
                                                   disabled={!canEditAdjustments}
                                               />
                                            </TableCell>
                                            {isAlMaraghiMotors && (
                                                <TableCell className="bg-green-50 p-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={getAdjustmentValue(row, 'open_leave_salary')}
                                                        onChange={(e) => handleAdjustmentChange(row.attendance_id, 'open_leave_salary', e.target.value)}
                                                        className="h-8 text-sm w-24"
                                                        disabled={!canEditAdjustments}
                                                    />
                                                </TableCell>
                                            )}
                                            {isAlMaraghiMotors && (
                                                <TableCell className="bg-green-50 p-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={getAdjustmentValue(row, 'variable_salary')}
                                                        onChange={(e) => handleAdjustmentChange(row.attendance_id, 'variable_salary', e.target.value)}
                                                        className="h-8 text-sm w-24"
                                                        disabled={!canEditAdjustments}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className="bg-red-50 p-1">
                                               <Input
                                                   type="number"
                                                   step="0.01"
                                                   value={getAdjustmentValue(row, 'otherDeduction')}
                                                   onChange={(e) => handleAdjustmentChange(row.attendance_id, 'otherDeduction', e.target.value)}
                                                   className="h-8 text-sm w-20"
                                                   disabled={!canEditAdjustments}
                                               />
                                            </TableCell>
                                            <TableCell className="bg-red-50 p-1">
                                               <Input
                                                   type="number"
                                                   step="0.01"
                                                   value={getAdjustmentValue(row, 'advanceSalaryDeduction')}
                                                   onChange={(e) => handleAdjustmentChange(row.attendance_id, 'advanceSalaryDeduction', e.target.value)}
                                                   className="h-8 text-sm w-20"
                                                   disabled={!canEditAdjustments}
                                               />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>


                </CardContent>
            </Card>
            </div>
        </>
    );
}