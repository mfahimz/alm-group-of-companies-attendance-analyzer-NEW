import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Save, Upload, Download, FileSpreadsheet, Users, DollarSign, Lock, Trash2, X, Clock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import SortableTableHead from '../ui/SortableTableHead';


/**
 * Multi-Entry Cell Component
 * Handles the display of total and the popover for multiple entries
 */
function EntryCell({ value, onSave, title, disabled }) {
    const entries = Array.isArray(value) ? value : (value ? [{ amount: parseFloat(value), desc: 'Initial' }] : []);
    const total = entries.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    
    const [localEntries, setLocalEntries] = useState(entries);
    const [isOpen, setIsOpen] = useState(false);

    const handleAdd = () => {
        setLocalEntries([...localEntries, { amount: 0, desc: '' }]);
    };

    const handleRemove = (index) => {
        setLocalEntries(localEntries.filter((_, i) => i !== index));
    };

    const handleEntryChange = (index, field, val) => {
        const newEntries = [...localEntries];
        newEntries[index] = { ...newEntries[index], [field]: field === 'amount' ? (val === '' ? '' : parseFloat(val) || 0) : val };
        setLocalEntries(newEntries);
    };

    const handleConfirm = () => {
        onSave(localEntries);
        setIsOpen(false);
    };

    const handleCancel = () => {
        setLocalEntries(entries);
        setIsOpen(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={(open) => {
            if (open) setLocalEntries(entries);
            setIsOpen(open);
        }}>
            <PopoverTrigger asChild>
                <div 
                    className={`h-9 min-w-[5rem] px-3 py-1 rounded-md border border-dashed flex items-center justify-center cursor-pointer transition-all
                        ${total > 0 ? 'bg-white border-indigo-200 text-indigo-700 font-medium' : 'bg-slate-50 border-slate-300 text-slate-400 hover:bg-slate-100'}
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-400 hover:shadow-sm'}
                    `}
                    onClick={(e) => {
                        if (disabled) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}
                >
                    {total > 0 ? (
                        <span className="text-sm">{total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    ) : (
                        <Plus className="w-4 h-4" />
                    )}
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4 shadow-xl z-50" align="center">
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-indigo-600" />
                            {title}
                        </h4>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Multi-Entry</span>
                    </div>
                    
                    <div className="max-h-[250px] overflow-y-auto space-y-3 pr-1">
                        {localEntries.length === 0 ? (
                            <p className="text-center py-4 text-xs text-slate-500 italic">No entries yet. Click "+" to add.</p>
                        ) : (
                            localEntries.map((entry, idx) => (
                                <div key={idx} className="flex flex-col gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100 relative group">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <Label className="text-[10px] text-slate-500 uppercase mb-1 block">Amount</Label>
                                            <Input 
                                                type="number" 
                                                value={entry.amount} 
                                                onChange={(e) => handleEntryChange(idx, 'amount', e.target.value)}
                                                className="h-8 text-xs font-semibold"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => handleRemove(idx)}
                                            className="mt-5 h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500 uppercase mb-1 block">Description</Label>
                                        <Input 
                                            value={entry.desc} 
                                            onChange={(e) => handleEntryChange(idx, 'desc', e.target.value)}
                                            className="h-8 text-xs"
                                            placeholder="Reason..."
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleAdd}
                        className="w-full border-dashed border-slate-300 text-slate-500 hover:text-indigo-600 hover:border-indigo-300"
                    >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Entry
                    </Button>

                    <div className="pt-2 border-t flex items-center justify-between gap-2">
                        <div className="text-xs">
                            <span className="text-slate-500">Total: </span>
                            <span className="font-bold text-indigo-600">{localEntries.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0).toFixed(2)}</span>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
                            <Button size="sm" onClick={handleConfirm} className="bg-indigo-600 hover:bg-indigo-700">Save</Button>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}


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

    // Fetch companies to scope special behavior by stable company_id
    const { data: companies = [], isLoading: loadingCompanies } = useQuery({
        queryKey: ['companies'],
        queryFn: () => base44.entities.Company.list('-company_id'),
        staleTime: 5 * 60 * 1000
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
    const alMaraghiMotorsCompanyId = useMemo(() => {
        return companies.find(company => company.name === 'Al Maraghi Motors')?.company_id ?? null;
    }, [companies]);
    const currentProjectCompanyId = useMemo(() => {
        return companies.find(company => company.name === project?.company)?.company_id ?? null;
    }, [companies, project?.company]);
    const isAlMaraghiMotors =
        alMaraghiMotorsCompanyId !== null &&
        currentProjectCompanyId !== null &&
        currentProjectCompanyId === alMaraghiMotorsCompanyId;
    const isProjectClosed = project?.status === 'closed';
    const canEditAdjustments = (isAlMaraghiMotors || hasFinalReport) && !isProjectClosed;

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
                bonus: editableAdjustments[emp.attendance_id]?.bonus ?? (Array.isArray(snapshot?.bonus) ? snapshot.bonus : (snapshot?.bonus ? [{amount: snapshot.bonus, desc: 'Imported'}] : (Array.isArray(otRecord?.bonus) ? otRecord.bonus : (otRecord?.bonus ? [{amount: otRecord.bonus, desc: 'Imported'}] : [])))),
                incentive: editableAdjustments[emp.attendance_id]?.incentive ?? (Array.isArray(snapshot?.incentive) ? snapshot.incentive : (snapshot?.incentive ? [{amount: snapshot.incentive, desc: 'Imported'}] : (Array.isArray(otRecord?.incentive) ? otRecord.incentive : (otRecord?.incentive ? [{amount: otRecord.incentive, desc: 'Imported'}] : [])))),
                open_leave_salary: editableAdjustments[emp.attendance_id]?.open_leave_salary ?? (Array.isArray(snapshot?.open_leave_salary) ? snapshot.open_leave_salary : (snapshot?.open_leave_salary ? [{amount: snapshot.open_leave_salary, desc: 'Imported'}] : (Array.isArray(otRecord?.open_leave_salary) ? otRecord.open_leave_salary : (otRecord?.open_leave_salary ? [{amount: otRecord.open_leave_salary, desc: 'Imported'}] : [])))),
                variable_salary: editableAdjustments[emp.attendance_id]?.variable_salary ?? (Array.isArray(snapshot?.variable_salary) ? snapshot.variable_salary : (snapshot?.variable_salary ? [{amount: snapshot.variable_salary, desc: 'Imported'}] : (Array.isArray(otRecord?.variable_salary) ? otRecord.variable_salary : (otRecord?.variable_salary ? [{amount: otRecord.variable_salary, desc: 'Imported'}] : [])))),
                otherDeduction: editableAdjustments[emp.attendance_id]?.otherDeduction ?? (Array.isArray(snapshot?.otherDeduction) ? snapshot.otherDeduction : (snapshot?.otherDeduction ? [{amount: snapshot.otherDeduction, desc: 'Imported'}] : (Array.isArray(otRecord?.otherDeduction) ? otRecord.otherDeduction : (otRecord?.otherDeduction ? [{amount: otRecord.otherDeduction, desc: 'Imported'}] : [])))),
                advanceSalaryDeduction: editableAdjustments[emp.attendance_id]?.advanceSalaryDeduction ?? (Array.isArray(snapshot?.advanceSalaryDeduction) ? snapshot.advanceSalaryDeduction : (snapshot?.advanceSalaryDeduction ? [{amount: snapshot.advanceSalaryDeduction, desc: 'Imported'}] : (Array.isArray(otRecord?.advanceSalaryDeduction) ? otRecord.advanceSalaryDeduction : (otRecord?.advanceSalaryDeduction ? [{amount: otRecord.advanceSalaryDeduction, desc: 'Imported'}] : []))))
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
                [field]: value // accepts array or number now
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

    const handleAdjustmentChange = (attendanceId, field, entries) => {
        setEditableAdjustments(prev => ({
            ...prev,
            [attendanceId]: {
                ...(prev[attendanceId] || {}),
                [field]: entries
            }
        }));
    };

    const getAdjustmentValue = (row, field) => {
        return editableAdjustments[row.attendance_id]?.[field] ?? row[field] ?? 0;
    };

    /**
     * Flatten entries array to a single numeric sum for backend compatibility.
     * The frontend uses arrays for multi-entry UI, but flattens them to a single sum for backend.
     * Logs metadata for record-keeping until separate metadata entity is available.
     */
    const flattenToSum = (val, fieldName, empName) => {
        if (Array.isArray(val)) {
            val.forEach(entry => {
                if (entry.desc) {
                    console.log(`[Adjustment Metadata] Employee: ${empName}, Field: ${fieldName}, Amount: ${entry.amount}, Desc: ${entry.desc}`);
                }
            });
            return val.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        }
        return parseFloat(val) || 0;
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
                    // Flatten arrays to single numeric sums for backend compatibility
                    normalOtHours: flattenToSum(edits.normalOtHours ?? persistedOtRecord?.normalOtHours ?? 0, 'Normal OT', employee.name),
                    specialOtHours: flattenToSum(edits.specialOtHours ?? persistedOtRecord?.specialOtHours ?? 0, 'Special OT', employee.name),
                    // Preserve and flatten existing adjustment values when saving OT
                    bonus: flattenToSum(employee.bonus, 'Bonus', employee.name),
                    incentive: flattenToSum(employee.incentive, 'Incentive', employee.name),
                    open_leave_salary: flattenToSum(employee.open_leave_salary, 'Open Leave Salary', employee.name),
                    variable_salary: flattenToSum(employee.variable_salary, 'Variable Salary', employee.name),
                    otherDeduction: flattenToSum(employee.otherDeduction, 'Other Deduction', employee.name),
                    advanceSalaryDeduction: flattenToSum(employee.advanceSalaryDeduction, 'Advance Salary Deduction', employee.name)
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
                    // Flatten arrays to single numeric sums for backend compatibility
                    bonus: flattenToSum(edits.bonus ?? employee.bonus, 'Bonus', employee.name),
                    incentive: flattenToSum(edits.incentive ?? employee.incentive, 'Incentive', employee.name),
                    open_leave_salary: flattenToSum(edits.open_leave_salary ?? employee.open_leave_salary, 'Open Leave Salary', employee.name),
                    variable_salary: flattenToSum(edits.variable_salary ?? employee.variable_salary, 'Variable Salary', employee.name),
                    otherDeduction: flattenToSum(edits.otherDeduction ?? employee.otherDeduction, 'Other Deduction', employee.name),
                    advanceSalaryDeduction: flattenToSum(edits.advanceSalaryDeduction ?? employee.advanceSalaryDeduction, 'Advance Salary Deduction', employee.name)
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
    if (loadingCompanies || loadingEmployees || loadingOT || loadingReports || loadingSnapshots) {
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
                                <SortableTableHead label="Att. ID" sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn}>Att. ID</SortableTableHead>
                                <SortableTableHead label="Name" sortKey="name" currentSort={sortColumn} onSort={setSortColumn}>Name</SortableTableHead>
                                <SortableTableHead label="Department" sortKey="department" currentSort={sortColumn} onSort={setSortColumn}>Department</SortableTableHead>
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
                                            <EntryCell 
                                                title="Normal OT Hours"
                                                value={getValue(row, 'normalOtHours')}
                                                onSave={(entries) => handleChange(row.attendance_id, 'normalOtHours', entries)}
                                                disabled={false}
                                            />
                                        </TableCell>
                                        <TableCell className="bg-cyan-50 p-1">
                                            <EntryCell 
                                                title="Special OT Hours"
                                                value={getValue(row, 'specialOtHours')}
                                                onSave={(entries) => handleChange(row.attendance_id, 'specialOtHours', entries)}
                                                disabled={false}
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
                                {isAlMaraghiMotors
                                    ? 'Enter bonus, incentives, and deductions at any report status'
                                    : 'Enter bonus, incentives, and deductions for finalized report'}
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
                                    <SortableTableHead label="Att. ID" sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn}>Att. ID</SortableTableHead>
                                    <SortableTableHead label="Name" sortKey="name" currentSort={sortColumn} onSort={setSortColumn}>Name</SortableTableHead>
                                    <SortableTableHead label="Department" sortKey="department" currentSort={sortColumn} onSort={setSortColumn}>Department</SortableTableHead>
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
                                                <EntryCell 
                                                    title="Bonus"
                                                    value={getAdjustmentValue(row, 'bonus')}
                                                    onSave={(entries) => handleAdjustmentChange(row.attendance_id, 'bonus', entries)}
                                                    disabled={!canEditAdjustments}
                                                />
                                            </TableCell>
                                            <TableCell className="bg-green-50 p-1">
                                                <EntryCell 
                                                    title="Incentive"
                                                    value={getAdjustmentValue(row, 'incentive')}
                                                    onSave={(entries) => handleAdjustmentChange(row.attendance_id, 'incentive', entries)}
                                                    disabled={!canEditAdjustments}
                                                />
                                            </TableCell>
                                            {isAlMaraghiMotors && (
                                                <TableCell className="bg-green-50 p-1">
                                                    <EntryCell 
                                                        title="Open Leave Salary"
                                                        value={getAdjustmentValue(row, 'open_leave_salary')}
                                                        onSave={(entries) => handleAdjustmentChange(row.attendance_id, 'open_leave_salary', entries)}
                                                        disabled={!canEditAdjustments}
                                                    />
                                                </TableCell>
                                            )}
                                            {isAlMaraghiMotors && (
                                                <TableCell className="bg-green-50 p-1">
                                                    <EntryCell 
                                                        title="Variable Salary"
                                                        value={getAdjustmentValue(row, 'variable_salary')}
                                                        onSave={(entries) => handleAdjustmentChange(row.attendance_id, 'variable_salary', entries)}
                                                        disabled={!canEditAdjustments}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className="bg-red-50 p-1">
                                                <EntryCell 
                                                    title="Other Deduction"
                                                    value={getAdjustmentValue(row, 'otherDeduction')}
                                                    onSave={(entries) => handleAdjustmentChange(row.attendance_id, 'otherDeduction', entries)}
                                                    disabled={!canEditAdjustments}
                                                />
                                            </TableCell>
                                            <TableCell className="bg-red-50 p-1">
                                                <EntryCell 
                                                    title="Advance Salary Deduction"
                                                    value={getAdjustmentValue(row, 'advanceSalaryDeduction')}
                                                    onSave={(entries) => handleAdjustmentChange(row.attendance_id, 'advanceSalaryDeduction', entries)}
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
