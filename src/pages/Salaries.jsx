import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, Trash2, DollarSign, Upload, Download, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import SortableTableHead from '../components/ui/SortableTableHead';
import PINLock from '../components/ui/PINLock';

export default function Salaries() {
    const [searchTerm, setSearchTerm] = useState('');
    const [companyFilter, setCompanyFilter] = useState('all');
    const [showDialog, setShowDialog] = useState(false);
    const [editingSalary, setEditingSalary] = useState(null);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
    const [uploadProgress, setUploadProgress] = useState(null);
    const fileInputRef = React.useRef(null);
    const [previewData, setPreviewData] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [salaryUnlocked, setSalaryUnlocked] = useState(false);
    const [unmatchedRecords, setUnmatchedRecords] = useState([]);
    const [showUnmatchedDialog, setShowUnmatchedDialog] = useState(false);
    const [pendingValidRecords, setPendingValidRecords] = useState([]);
    
    const [formData, setFormData] = useState({
        employee_id: '',
        attendance_id: '',
        name: '',
        company: '',
        working_hours: 9,
        basic_salary: 0,
        allowances: 0,
        allowances_with_bonus: 0,
        wps_cap_enabled: false,
        wps_cap_amount: 4800
    });

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const canAccessAllCompanies = isAdmin || isSupervisor;

    const { data: salaries = [] } = useQuery({
        queryKey: ['salaries'],
        queryFn: () => base44.entities.EmployeeSalary.list('-created_date')
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: async () => {
            const settings = await base44.entities.CompanySettings.list();
            return settings.map(s => s.company);
        }
    });

    const createSalaryMutation = useMutation({
        mutationFn: async (data) => {
            // Check for existing active salary record
            const existingActive = salaries.find(s => 
                String(s.employee_id) === String(data.employee_id) && 
                s.active === true
            );
            
            if (existingActive) {
                throw new Error(`Employee already has an active salary record (ID: ${existingActive.attendance_id})`);
            }

            const allowancesAmount = Number(data.allowances) || 0;
            const allowancesWithBonus = Number(data.allowances_with_bonus) || 0;
            const total = Number((data.basic_salary + allowancesAmount + allowancesWithBonus).toFixed(2));
            
            return base44.entities.EmployeeSalary.create({
                employee_id: data.employee_id,
                attendance_id: data.attendance_id,
                name: data.name,
                company: data.company,
                working_hours: data.working_hours || 9,
                basic_salary: data.basic_salary,
                allowances: allowancesAmount,
                allowances_with_bonus: allowancesWithBonus,
                total_salary: total,
                deduction_per_minute: total / (30 * (data.working_hours || 9) * 60),
                active: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['salaries']);
            toast.success('Salary record created');
            setShowDialog(false);
            resetForm();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create salary record');
        }
    });

    const updateSalaryMutation = useMutation({
        mutationFn: ({ id, data }) => {
            const allowancesAmount = Number(data.allowances) || 0;
            const allowancesWithBonus = Number(data.allowances_with_bonus) || 0;
            const total = Number((data.basic_salary + allowancesAmount + allowancesWithBonus).toFixed(2));
            
            const updatePayload = {
                working_hours: data.working_hours || 9,
                basic_salary: data.basic_salary,
                allowances: allowancesAmount,
                allowances_with_bonus: allowancesWithBonus,
                total_salary: total,
                deduction_per_minute: total / (30 * (data.working_hours || 9) * 60)
            };
            
            // Add WPS cap fields only for Al Maraghi Auto Repairs
            if (data.company === 'Al Maraghi Auto Repairs') {
                updatePayload.wps_cap_enabled = data.wps_cap_enabled || false;
                updatePayload.wps_cap_amount = data.wps_cap_amount ?? 4800;
            }
            
            return base44.entities.EmployeeSalary.update(id, updatePayload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['salaries']);
            toast.success('Salary record updated');
            setShowDialog(false);
            resetForm();
        },
        onError: () => {
            toast.error('Failed to update salary record');
        }
    });

    const deleteSalaryMutation = useMutation({
        mutationFn: (id) => base44.entities.EmployeeSalary.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['salaries']);
            toast.success('Salary record deleted');
        },
        onError: () => {
            toast.error('Failed to delete salary record');
        }
    });

    const resetForm = () => {
        setFormData({
            employee_id: '',
            attendance_id: '',
            name: '',
            company: '',
            working_hours: 9,
            basic_salary: 0,
            allowances: 0,
            allowances_with_bonus: 0,
            wps_cap_enabled: false,
            wps_cap_amount: 4800
        });
        setEditingSalary(null);
        setSelectedCompany('');
        setSelectedEmployeeId('');
    };

    const handleEmployeeSelect = (employeeId) => {
        setSelectedEmployeeId(employeeId);
        const employee = employees.find(e => e.id === employeeId);
        if (employee) {
            setFormData(prev => ({
                ...prev,
                employee_id: String(employee.hrms_id),
                attendance_id: String(employee.attendance_id),
                name: employee.name,
                company: employee.company
            }));
        }
    };

    const handleEdit = (salary) => {
        setFormData({
            employee_id: salary.employee_id,
            attendance_id: salary.attendance_id,
            name: salary.name,
            company: salary.company,
            working_hours: salary.working_hours || 9,
            basic_salary: salary.basic_salary,
            allowances: Number(salary.allowances) || 0,
            allowances_with_bonus: salary.allowances_with_bonus || 0,
            wps_cap_enabled: salary.wps_cap_enabled || false,
            wps_cap_amount: salary.wps_cap_amount ?? 4800
        });
        setEditingSalary(salary);
        setShowDialog(true);
    };

    const handleSubmit = () => {
        if (editingSalary) {
            updateSalaryMutation.mutate({ id: editingSalary.id, data: formData });
        } else {
            createSalaryMutation.mutate(formData);
        }
    };

    const handleDelete = (id) => {
        if (window.confirm('Delete this salary record?')) {
            deleteSalaryMutation.mutate(id);
        }
    };

    const filteredSalaries = salaries
        .filter(s => {
            if (!canAccessAllCompanies && currentUser && s.company !== currentUser.company) return false;
            if (companyFilter !== 'all' && s.company !== companyFilter) return false;
            const searchLower = searchTerm.toLowerCase();
            return s.name.toLowerCase().includes(searchLower) || 
                   s.attendance_id.toLowerCase().includes(searchLower) ||
                   s.employee_id.toLowerCase().includes(searchLower);
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

    const availableEmployees = employees.filter(emp => {
        if (selectedCompany && emp.company !== selectedCompany) return false;
        const hasExistingSalary = salaries.some(s => String(s.employee_id) === String(emp.hrms_id) && s.active);
        return !hasExistingSalary;
    });

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setUploadProgress({ status: 'Reading file...', current: 0, total: 100 });

            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                toast.error('No data found in file');
                setUploadProgress(null);
                return;
            }

            setUploadProgress({ status: 'Validating records...', current: 0, total: jsonData.length });

            const validRecords = [];
            const errorRecords = [];

            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                
                // Map Excel columns to fields
                const hrmsId = String(row['EMPLOYEE ID'] || row['employee_id'] || '').trim();
                const name = String(row['EMPLOYEE NAME'] || row['name'] || '').trim();
                const workingHoursRaw = row['ACTUAL WORKING HOURS'] || row['working_hours'];
                const workingHours = workingHoursRaw !== undefined && workingHoursRaw !== null && workingHoursRaw !== '' 
                    ? parseFloat(workingHoursRaw) 
                    : 9;
                const basicSalary = parseFloat(row['BASIC'] || row['basic_salary']) || 0;
                const allowances = parseFloat(row['ALLOWANCES'] || row['allowance']) || 0;
                const bonus = parseFloat(row['BONUS'] || row['bonus']) || 0;
                const total = parseFloat(row['TOTAL'] || row['total']) || (basicSalary + allowances + bonus);

                let error = null;
                let employee = null;
                let existingSalary = null;

                if (!hrmsId || !name) {
                    error = 'Missing EMPLOYEE ID or EMPLOYEE NAME';
                } else {
                    // Find employee by hrms_id
                    employee = employees.find(e => String(e.hrms_id) === hrmsId);

                    if (!employee) {
                        error = 'Employee not found in master data (check HRMS ID)';
                    } else {
                        existingSalary = salaries.find(s => 
                            s.employee_id === employee.hrms_id && s.active
                        );
                    }
                }

                const record = {
                    rowNumber: i + 2,
                    hrmsId,
                    attendanceId: employee?.attendance_id || '',
                    name,
                    company: employee?.company || '',
                    workingHours,
                    basicSalary,
                    allowances,
                    bonus,
                    totalSalary: total,
                    employee,
                    existingSalary,
                    action: existingSalary ? 'Update' : 'Create',
                    error
                };

                if (error) {
                    errorRecords.push(record);
                } else {
                    validRecords.push(record);
                }

                setUploadProgress({ 
                    status: 'Validating records...', 
                    current: i + 1, 
                    total: jsonData.length 
                });
            }

            setUploadProgress(null);
            
            // Separate unmatched HRMS IDs from other errors
            const unmatchedHrmsRecords = errorRecords.filter(r => r.error === 'Employee not found in master data (check HRMS ID)');
            const otherErrors = errorRecords.filter(r => r.error !== 'Employee not found in master data (check HRMS ID)');
            
            if (unmatchedHrmsRecords.length > 0) {
                // Show unmatched dialog for manual correction
                setUnmatchedRecords(unmatchedHrmsRecords.map(r => ({ ...r, correctedHrmsId: r.hrmsId })));
                setPendingValidRecords(validRecords);
                setPreviewData({ valid: validRecords, errors: otherErrors });
                setShowUnmatchedDialog(true);
            } else {
                // No unmatched records, go directly to preview
                setPreviewData({ valid: validRecords, errors: otherErrors });
                setShowPreview(true);
            }

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            toast.error('Failed to process file: ' + error.message);
            setUploadProgress(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const confirmImport = async () => {
        if (!previewData || previewData.valid.length === 0) return;

        try {
            setUploadProgress({ status: 'Importing records...', current: 0, total: previewData.valid.length });

            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < previewData.valid.length; i++) {
                const record = previewData.valid[i];
                
                try {
                    const deductionPerMinute = Number((record.totalSalary / (30 * record.workingHours * 60)).toFixed(2));

                    const salaryData = {
                        employee_id: String(record.employee.hrms_id),
                        attendance_id: String(record.employee.attendance_id),
                        name: record.name,
                        company: record.company,
                        working_hours: record.workingHours,
                        basic_salary: Number(record.basicSalary.toFixed(2)),
                        allowances: Number(record.allowances.toFixed(2)),
                        allowances_with_bonus: Number(record.bonus.toFixed(2)),
                        total_salary: Number(record.totalSalary.toFixed(2)),
                        deduction_per_minute: deductionPerMinute
                    };

                    if (record.existingSalary) {
                        await base44.entities.EmployeeSalary.update(record.existingSalary.id, salaryData);
                    } else {
                        await base44.entities.EmployeeSalary.create(salaryData);
                    }

                    successCount++;
                } catch (error) {
                    errorCount++;
                }

                setUploadProgress({ 
                    status: 'Importing records...', 
                    current: i + 1, 
                    total: previewData.valid.length 
                });
            }

            queryClient.invalidateQueries(['salaries']);
            setUploadProgress(null);
            setShowPreview(false);
            setPreviewData(null);
            
            if (errorCount > 0) {
                toast.warning(`Imported ${successCount} records. ${errorCount} failed.`);
            } else {
                toast.success(`Successfully imported ${successCount} salary records`);
            }
        } catch (error) {
            toast.error('Failed to import: ' + error.message);
            setUploadProgress(null);
        }
    };

    const handleUnmatchedCorrection = () => {
        const correctedRecords = [];
        const stillUnmatched = [];

        unmatchedRecords.forEach(record => {
            const correctedHrmsId = String(record.correctedHrmsId || '').trim();
            
            if (!correctedHrmsId) {
                stillUnmatched.push({ ...record, error: 'HRMS ID is required' });
                return;
            }

            // Find employee by corrected HRMS ID
            const employee = employees.find(e => String(e.hrms_id) === correctedHrmsId);

            if (!employee) {
                stillUnmatched.push({ ...record, error: `HRMS ID ${correctedHrmsId} not found` });
            } else {
                // Check if there's already an active salary for this employee
                const existingSalary = salaries.find(s => s.employee_id === employee.hrms_id && s.active);
                
                correctedRecords.push({
                    ...record,
                    hrmsId: correctedHrmsId,
                    attendanceId: employee.attendance_id,
                    company: employee.company,
                    employee,
                    existingSalary,
                    action: existingSalary ? 'Update' : 'Create',
                    error: null
                });
            }
        });

        if (stillUnmatched.length > 0) {
            toast.error(`${stillUnmatched.length} records still have invalid HRMS IDs`);
            setUnmatchedRecords(stillUnmatched.map(r => ({ ...r, correctedHrmsId: r.hrmsId })));
        } else {
            // All corrected successfully
            const allValidRecords = [...pendingValidRecords, ...correctedRecords];
            setPreviewData(prev => ({ 
                valid: allValidRecords, 
                errors: prev?.errors || [] 
            }));
            setShowUnmatchedDialog(false);
            setShowPreview(true);
            setUnmatchedRecords([]);
            setPendingValidRecords([]);
            toast.success(`${correctedRecords.length} records corrected and ready to import`);
        }
    };

    const handleSyncAll = async () => {
        if (!window.confirm('Sync all salary records with latest employee data (attendance IDs, names, companies)?')) {
            return;
        }

        try {
            let syncedCount = 0;
            const errors = [];

            for (const employee of employees) {
                try {
                    const response = await base44.functions.invoke('syncEmployeeToSalary', {
                        hrms_id: String(employee.hrms_id),
                        attendance_id: String(employee.attendance_id),
                        name: employee.name,
                        company: employee.company
                    });

                    if (response.data.updated_count > 0) {
                        syncedCount += response.data.updated_count;
                    }
                } catch (error) {
                    errors.push({ employee: employee.name, error: error.message });
                }
            }

            queryClient.invalidateQueries(['salaries']);
            
            if (errors.length > 0) {
                toast.warning(`Synced ${syncedCount} records. ${errors.length} had errors.`);
            } else {
                toast.success(`Successfully synced ${syncedCount} salary records with employee data`);
            }
        } catch (error) {
            toast.error('Sync failed: ' + error.message);
        }
    };

    const downloadTemplate = () => {
        const template = [
            {
                'EMPLOYEE ID': '10001',
                'EMPLOYEE NAME': 'John Doe',
                'ACTUAL WORKING HOURS': 9,
                'BASIC': 5000,
                'ALLOWANCES': 2000,
                'BONUS': 500,
                'TOTAL': 7500
            }
        ];

        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Salary Template');
        XLSX.writeFile(wb, 'salary_upload_template.xlsx');
        toast.success('Template downloaded');
    };

    return (
        <div className="space-y-6">
            <PINLock onUnlock={(unlocked) => setSalaryUnlocked(unlocked)} storageKey="salary_page_pin" />
            {!salaryUnlocked && (
                <div className="flex items-center justify-center py-12 text-slate-500">
                    <p>Please unlock the salary section to continue.</p>
                </div>
            )}
            {salaryUnlocked && (
                <>
                <Breadcrumb items={[{ label: 'Salaries' }]} />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Employee Salaries</h1>
                    <p className="text-slate-600 mt-1">Manage employee salary and allowances</p>
                </div>
                {(isAdmin || isSupervisor) && (
                    <div className="flex gap-2">
                        <Button onClick={downloadTemplate} variant="outline">
                            <Download className="w-4 h-4 mr-2" />
                            Download Template
                        </Button>
                        <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Excel
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <Button onClick={handleSyncAll} variant="outline" title="Sync employee data to salary records">
                            <Search className="w-4 h-4 mr-2" />
                            Sync Employee Data
                        </Button>
                        <Button onClick={() => setShowDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Salary Record
                        </Button>
                    </div>
                )}
            </div>

            {uploadProgress && (
                <Card className="border-0 shadow-sm bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-medium text-blue-900">{uploadProgress.status}</p>
                                <p className="text-sm text-blue-700 mt-1">
                                    {uploadProgress.current} / {uploadProgress.total} completed
                                </p>
                            </div>
                        </div>
                        <div className="w-full bg-blue-200 rounded-full h-2">
                            <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by name, ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        {canAccessAllCompanies && (
                            <Select value={companyFilter} onValueChange={setCompanyFilter}>
                                <SelectTrigger className="w-64">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Companies</SelectItem>
                                    {companies.map(company => (
                                        <SelectItem key={company} value={company}>{company}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Salary Records ({filteredSalaries.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                        Attendance ID
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort}>
                                        Name
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="company" currentSort={sort} onSort={setSort}>
                                        Company
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="working_hours" currentSort={sort} onSort={setSort}>
                                        Working Hours
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="basic_salary" currentSort={sort} onSort={setSort}>
                                        Basic
                                    </SortableTableHead>
                                    <TableHead>Allowances</TableHead>
                                    <TableHead>Allowances + Bonus</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>WPS Cap</TableHead>
                                    {(isAdmin || isSupervisor) && <TableHead className="text-right">Actions</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSalaries.map((salary) => {
                                    return (
                                        <TableRow key={salary.id}>
                                            <TableCell className="font-medium">{salary.attendance_id}</TableCell>
                                            <TableCell>{salary.name}</TableCell>
                                            <TableCell>{salary.company}</TableCell>
                                            <TableCell>
                                                {salary.working_hours || 9} hrs/day
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                AED {Number(salary.basic_salary || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                AED {Number(salary.allowances || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                AED {Number(salary.allowances_with_bonus || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="font-bold text-green-700">
                                                AED {Number(salary.total_salary || 0).toFixed(2)}
                                            </TableCell>
                                            {(isAdmin || isSupervisor) && (
                                                <TableCell className="text-right">
                                                    <div className="flex gap-1 justify-end">
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost"
                                                            onClick={() => handleEdit(salary)}
                                                        >
                                                            <Edit className="w-4 h-4 text-indigo-600" />
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost"
                                                            onClick={() => handleDelete(salary.id)}
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-600" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={showDialog} onOpenChange={(open) => {
                if (!open) {
                    setShowDialog(false);
                    resetForm();
                }
            }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingSalary ? 'Edit Salary Record' : 'Add Salary Record'}</DialogTitle>
                    </DialogHeader>
                    
                    <div className="grid grid-cols-2 gap-4 py-4">
                        {!editingSalary && (
                            <>
                                <div className="col-span-2">
                                    <Label>Company</Label>
                                    <Select 
                                        value={selectedCompany} 
                                        onValueChange={setSelectedCompany}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select company first" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {companies.map(company => (
                                                <SelectItem key={company} value={company}>
                                                    {company}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div className="col-span-2">
                                    <Label>Employee</Label>
                                    <Select 
                                        value={selectedEmployeeId} 
                                        onValueChange={handleEmployeeSelect}
                                        disabled={!selectedCompany || availableEmployees.length === 0}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={selectedCompany ? (availableEmployees.length === 0 ? "All employees have salary records" : "Select employee") : "Select company first"} />
                                        </SelectTrigger>
                                        <SelectContent filter={true}>
                                            {availableEmployees.map(emp => (
                                                <SelectItem key={emp.id} value={emp.id}>
                                                    {emp.name} ({emp.attendance_id}) - HRMS: {emp.hrms_id}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedCompany && availableEmployees.length === 0 && (
                                        <p className="text-xs text-amber-600 mt-1">
                                            All employees in {selectedCompany} already have salary records
                                        </p>
                                    )}
                                </div>
                            </>
                        )}

                        {editingSalary && (
                            <>
                                <div className="col-span-2">
                                    <Label>Employee</Label>
                                    <Input value={`${formData.name} (${formData.attendance_id})`} disabled />
                                </div>
                            </>
                        )}

                        <div>
                            <Label>Working Hours per Day</Label>
                            <Input
                                type="number"
                                value={formData.working_hours}
                                onChange={(e) => setFormData({...formData, working_hours: parseFloat(e.target.value) || 9})}
                            />
                        </div>

                        <div>
                            <Label>Basic Salary (AED)</Label>
                            <Input
                                type="number"
                                value={formData.basic_salary}
                                onChange={(e) => setFormData({...formData, basic_salary: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div>
                            <Label>Allowances (AED)</Label>
                            <Input
                                type="number"
                                value={formData.allowances}
                                onChange={(e) => setFormData({...formData, allowances: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div className="col-span-2">
                            <Label>Allowances with Bonus (AED)</Label>
                            <Input
                                type="number"
                                value={formData.allowances_with_bonus}
                                onChange={(e) => setFormData({...formData, allowances_with_bonus: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        {/* WPS Cap Settings - Only for Al Maraghi Auto Repairs */}
                        {formData.company === 'Al Maraghi Auto Repairs' && (
                            <div className="col-span-2 border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center gap-2 text-amber-800 font-medium">
                                    <AlertTriangle className="w-4 h-4" />
                                    WPS Cap Settings
                                </div>
                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="wps_cap_enabled"
                                        checked={formData.wps_cap_enabled}
                                        onCheckedChange={(checked) => setFormData({...formData, wps_cap_enabled: checked})}
                                    />
                                    <Label htmlFor="wps_cap_enabled" className="text-sm">
                                        Enable WPS Cap (limit WPS pay, excess goes to Balance)
                                    </Label>
                                </div>
                                {formData.wps_cap_enabled && (
                                    <div className="ml-6">
                                        <Label className="text-sm">WPS Cap Amount (AED)</Label>
                                        <Input
                                            type="number"
                                            value={formData.wps_cap_amount}
                                            onChange={(e) => setFormData({...formData, wps_cap_amount: parseFloat(e.target.value) || 4800})}
                                            className="w-32 mt-1"
                                            min={0}
                                        />
                                        <p className="text-xs text-amber-700 mt-1">
                                            Default: 4800. WPS Pay will be capped at this amount.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="col-span-2 bg-slate-50 rounded-lg p-4">
                            <div className="text-sm text-slate-600">Total Salary</div>
                            <div className="text-2xl font-bold text-green-600">
                                AED {Number(
                                    formData.basic_salary + 
                                    formData.allowances +
                                    formData.allowances_with_bonus
                                ).toFixed(2)}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowDialog(false);
                            resetForm();
                        }}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSubmit}
                            disabled={!formData.employee_id || formData.basic_salary <= 0}
                        >
                            {editingSalary ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Import Preview</DialogTitle>
                    </DialogHeader>
                    
                    {previewData && (
                        <div className="space-y-4">
                            <div className="flex gap-4 text-sm">
                                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                                    <span className="font-semibold text-green-900">Valid: {previewData.valid.length}</span>
                                </div>
                                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                                    <span className="font-semibold text-red-900">Errors: {previewData.errors.length}</span>
                                </div>
                            </div>

                            {previewData.valid.length > 0 && (
                                <div>
                                    <h3 className="font-semibold mb-2 text-green-900">Valid Records ({previewData.valid.length})</h3>
                                    <div className="border rounded-lg overflow-hidden">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Row</TableHead>
                                                    <TableHead>HRMS ID</TableHead>
                                                    <TableHead>Attendance ID</TableHead>
                                                    <TableHead>Name</TableHead>
                                                    <TableHead>Company</TableHead>
                                                    <TableHead>Hours</TableHead>
                                                    <TableHead>Basic</TableHead>
                                                    <TableHead>Allowances</TableHead>
                                                    <TableHead>Bonus</TableHead>
                                                    <TableHead>Total</TableHead>
                                                    <TableHead>Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {previewData.valid.map((record, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell>{record.rowNumber}</TableCell>
                                                        <TableCell className="font-medium">{record.hrmsId}</TableCell>
                                                        <TableCell>{record.attendanceId}</TableCell>
                                                        <TableCell>{record.name}</TableCell>
                                                        <TableCell>{record.company}</TableCell>
                                                        <TableCell>{record.workingHours}</TableCell>
                                                        <TableCell>AED {record.basicSalary}</TableCell>
                                                        <TableCell>AED {record.allowances}</TableCell>
                                                        <TableCell>AED {record.bonus}</TableCell>
                                                        <TableCell className="font-semibold">AED {record.totalSalary}</TableCell>
                                                        <TableCell>
                                                            <span className={`px-2 py-1 rounded text-xs ${
                                                                record.action === 'Create' 
                                                                    ? 'bg-blue-100 text-blue-700' 
                                                                    : 'bg-amber-100 text-amber-700'
                                                            }`}>
                                                                {record.action}
                                                            </span>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}

                            {previewData.errors.length > 0 && (
                                <div>
                                    <h3 className="font-semibold mb-2 text-red-900">Error Records ({previewData.errors.length})</h3>
                                    <div className="border border-red-200 rounded-lg overflow-hidden">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Row</TableHead>
                                                    <TableHead>HRMS ID</TableHead>
                                                    <TableHead>Name</TableHead>
                                                    <TableHead>Error</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {previewData.errors.map((record, idx) => (
                                                    <TableRow key={idx} className="bg-red-50">
                                                        <TableCell>{record.rowNumber}</TableCell>
                                                        <TableCell>{record.hrmsId || '-'}</TableCell>
                                                        <TableCell>{record.name || '-'}</TableCell>
                                                        <TableCell className="text-red-600">{record.error}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowPreview(false);
                            setPreviewData(null);
                        }}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={confirmImport}
                            disabled={!previewData || previewData.valid.length === 0 || uploadProgress}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {uploadProgress ? 'Importing...' : `Import ${previewData?.valid.length || 0} Records`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showUnmatchedDialog} onOpenChange={setShowUnmatchedDialog}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Correct Unmatched HRMS IDs</DialogTitle>
                        <p className="text-sm text-slate-600 mt-2">
                            The following records have HRMS IDs that don't match any employee in the system. 
                            Please enter the correct HRMS ID for each record.
                        </p>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Row</TableHead>
                                        <TableHead>Original HRMS ID</TableHead>
                                        <TableHead>Employee Name</TableHead>
                                        <TableHead>Correct HRMS ID</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {unmatchedRecords.map((record, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{record.rowNumber}</TableCell>
                                            <TableCell className="font-medium text-red-600">{record.hrmsId}</TableCell>
                                            <TableCell>{record.name}</TableCell>
                                            <TableCell>
                                                <Input
                                                    value={record.correctedHrmsId}
                                                    onChange={(e) => {
                                                        const updated = [...unmatchedRecords];
                                                        updated[idx].correctedHrmsId = e.target.value;
                                                        setUnmatchedRecords(updated);
                                                    }}
                                                    placeholder="Enter correct HRMS ID"
                                                    className="w-40"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {record.error && (
                                                    <span className="text-xs text-red-600">{record.error}</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-900">
                                <strong>Tip:</strong> You can find the correct HRMS ID in the Employees page. 
                                Make sure the HRMS ID exists in the system before importing.
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowUnmatchedDialog(false);
                            setUnmatchedRecords([]);
                            setPendingValidRecords([]);
                            setPreviewData(null);
                        }}>
                            Cancel Import
                        </Button>
                        <Button 
                            onClick={handleUnmatchedCorrection}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            Validate & Continue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
                </>
            )}
        </div>
    );
}