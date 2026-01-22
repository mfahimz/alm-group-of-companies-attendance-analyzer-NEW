import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Trash2, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function HRManagerSettings() {
    const queryClient = useQueryClient();
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState('');

    // Fetch current user
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Fetch employees
    const { data: employees = [], isLoading: loadingEmployees } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list(),
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000
    });

    // Fetch company settings
    const { data: companySettings = [] } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list(),
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000
    });

    // Fetch HR managers
    const { data: hrManagers = [], isLoading: loadingHRManagers } = useQuery({
        queryKey: ['hrManagers'],
        queryFn: () => base44.entities.HRManager.list(),
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000
    });

    // Fetch users with hr_manager role
    const { data: hrManagerUsers = [] } = useQuery({
        queryKey: ['hrManagerUsers'],
        queryFn: async () => {
            const users = await base44.entities.User.list();
            return users.filter(u => u.extended_role === 'hr_manager');
        },
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000
    });

    // Create HR Manager
    const createMutation = useMutation({
        mutationFn: async (data) => {
            if (!data.company || !data.employee_id) {
                throw new Error('Company and Employee are required');
            }

            // Check if HR Manager already exists for this company
            const existing = hrManagers.find(h => h.company === data.company);
            if (existing) {
                throw new Error(`HR Manager already assigned to ${data.company}`);
            }

            const employee = employees.find(e => e.hrms_id === parseInt(data.employee_id));
            if (!employee) {
                throw new Error('Employee not found');
            }

            return base44.entities.HRManager.create({
                company: data.company,
                employee_id: data.employee_id,
                employee_name: employee.name,
                active: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['hrManagers'] });
            setSelectedCompany('');
            setSelectedEmployee('');
            toast.success('HR Manager assigned successfully');
        },
        onError: (error) => {
            toast.error(error.message);
        }
    });

    // Delete HR Manager
    const deleteMutation = useMutation({
        mutationFn: (hrManagerId) => base44.entities.HRManager.delete(hrManagerId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['hrManagers'] });
            toast.success('HR Manager assignment removed');
        },
        onError: (error) => {
            toast.error('Failed to remove HR Manager: ' + error.message);
        }
    });

    // Get available companies
    const companies = useMemo(() => {
        return companySettings.map(c => c.company).sort();
    }, [companySettings]);

    // Get available employees (not already assigned, filtered by company)
    const availableEmployees = useMemo(() => {
        const assignedIds = hrManagers.map(h => h.employee_id);
        return employees.filter(e => 
            !assignedIds.includes(e.hrms_id.toString()) &&
            (!selectedCompany || e.company === selectedCompany)
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [employees, hrManagers, selectedCompany]);

    const isAdmin = currentUser?.role === 'admin' || currentUser?.extended_role === 'admin';

    if (!isAdmin) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">Access restricted to Admin only</p>
                </CardContent>
            </Card>
        );
    }

    if (loadingEmployees || loadingHRManagers) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <p className="text-slate-600">Loading...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3 mb-2">
                    <Users className="w-8 h-8 text-indigo-600" />
                    HR Manager Settings
                </h1>
                <p className="text-slate-600">Assign HR Managers to companies. HR Managers must be linked to an employee.</p>
            </div>

            {/* Assignment Form */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg">Assign HR Manager</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Company *</label>
                                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {companies.map(company => {
                                            const assigned = hrManagers.find(h => h.company === company);
                                            return (
                                                <SelectItem key={company} value={company} disabled={!!assigned}>
                                                    {company} {assigned ? '(assigned)' : ''}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Employee *</label>
                                <Select value={selectedEmployee} onValueChange={setSelectedEmployee} disabled={!selectedCompany}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={selectedCompany ? "Select employee" : "Choose company first"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableEmployees.map(emp => (
                                            <SelectItem key={emp.hrms_id} value={emp.hrms_id.toString()}>
                                                {emp.name} (ID: {emp.hrms_id})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-end">
                                <Button
                                    onClick={() => createMutation.mutate({ 
                                        company: selectedCompany,
                                        employee_id: selectedEmployee
                                    })}
                                    disabled={!selectedCompany || !selectedEmployee || createMutation.isPending}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    {createMutation.isPending ? 'Assigning...' : 'Assign HR Manager'}
                                </Button>
                            </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                            <strong>Note:</strong> Each company can have only one HR Manager. The HR Manager must be linked to an active employee record.
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* HR Managers Table */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg">Current HR Managers</CardTitle>
                </CardHeader>
                <CardContent>
                    {hrManagers.length === 0 ? (
                        <div className="text-center py-12">
                            <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-600">No HR Managers assigned yet</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Company</TableHead>
                                        <TableHead>Employee Name</TableHead>
                                        <TableHead>Employee ID</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-20">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {hrManagers.map(hrManager => {
                                        const user = hrManagerUsers.find(u => u.hrms_id === hrManager.employee_id);
                                        return (
                                            <TableRow key={hrManager.id}>
                                                <TableCell className="font-medium">{hrManager.company}</TableCell>
                                                <TableCell>{hrManager.employee_name}</TableCell>
                                                <TableCell>{hrManager.employee_id}</TableCell>
                                                <TableCell>
                                                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                                                        hrManager.active 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-slate-100 text-slate-800'
                                                    }`}>
                                                        {hrManager.active ? 'Active' : 'Inactive'}
                                                        {user ? ' (User assigned)' : ' (No user assigned)'}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        onClick={() => deleteMutation.mutate(hrManager.id)}
                                                        variant="ghost"
                                                        size="icon"
                                                        disabled={deleteMutation.isPending}
                                                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Info Box */}
            <Card className="border-0 shadow-lg bg-amber-50 border border-amber-200">
                <CardContent className="p-6">
                    <h3 className="font-semibold text-amber-900 mb-2">Setup Instructions</h3>
                    <ul className="text-sm text-amber-800 space-y-2">
                        <li>1. <strong>Assign HR Manager here:</strong> Select company and employee, then click "Assign HR Manager"</li>
                        <li>2. <strong>Create user account:</strong> Go to Users & Permissions and create a new user with the hr_manager role</li>
                        <li>3. <strong>Link to employee:</strong> In Users & Permissions, link the user's HRMS ID to the assigned employee</li>
                        <li>4. <strong>Assign company:</strong> Ensure the user has the company assigned</li>
                        <li>5. <strong>Verify access:</strong> HR Manager can now access their dashboard</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}