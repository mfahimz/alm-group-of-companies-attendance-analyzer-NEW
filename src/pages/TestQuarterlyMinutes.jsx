import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function TestQuarterlyMinutes() {
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: testRecords = [], isLoading } = useQuery({
        queryKey: ['testQuarterlyMinutes'],
        queryFn: async () => {
            return await base44.entities.EmployeeQuarterlyMinutes.filter({
                company: 'Al Maraghi Auto Repairs',
                year: 2025,
                quarter: 4,
                allocation_type: 'calendar_quarter'
            });
        }
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: async () => {
            return await base44.entities.Employee.filter({ 
                company: 'Al Maraghi Auto Repairs' 
            });
        }
    });

    const deleteAllMutation = useMutation({
        mutationFn: async () => {
            const deletePromises = testRecords.map(record => 
                base44.entities.EmployeeQuarterlyMinutes.delete(record.id)
            );
            await Promise.all(deletePromises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['testQuarterlyMinutes'] });
            toast.success('All test Q4 2025 records deleted successfully');
        },
        onError: (error) => {
            toast.error('Failed to delete records: ' + error.message);
        }
    });

    const getEmployeeName = (employeeId) => {
        const employee = employees.find(e => 
            String(e.hrms_id) === String(employeeId) || String(e.id) === String(employeeId)
        );
        return employee ? employee.name : 'Unknown';
    };

    const getEmployeeAttendanceId = (employeeId) => {
        const employee = employees.find(e => 
            String(e.hrms_id) === String(employeeId) || String(e.id) === String(employeeId)
        );
        return employee ? employee.attendance_id : '-';
    };

    if (currentUser?.role !== 'admin') {
        return (
            <div className="p-6">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        Access denied. Admin only.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Test Q4 2025 Quarterly Minutes - Al Maraghi Auto Repairs</span>
                        {testRecords.length > 0 && (
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    if (confirm(`Delete all ${testRecords.length} test records?`)) {
                                        deleteAllMutation.mutate();
                                    }
                                }}
                                disabled={deleteAllMutation.isPending}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete All Test Records
                            </Button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-slate-500">Loading...</div>
                    ) : testRecords.length === 0 ? (
                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                No test Q4 2025 records found for Al Maraghi Auto Repairs.
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="space-y-4">
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                    These are TEST records created for Q4 2025 (Oct-Dec). 
                                    Found {testRecords.length} employee records with 120 minutes allocated.
                                </AlertDescription>
                            </Alert>

                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                             <TableHead>Employee ID</TableHead>
                                             <TableHead>Attendance ID</TableHead>
                                             <TableHead>Employee Name</TableHead>
                                             <TableHead>Year</TableHead>
                                             <TableHead>Quarter</TableHead>
                                             <TableHead>Total Minutes</TableHead>
                                             <TableHead>Used Minutes</TableHead>
                                             <TableHead>Remaining Minutes</TableHead>
                                             <TableHead>Type</TableHead>
                                         </TableRow>
                                     </TableHeader>
                                    <TableBody>
                                        {testRecords.map((record) => (
                                             <TableRow key={record.id}>
                                                 <TableCell className="font-medium">{record.employee_id}</TableCell>
                                                 <TableCell className="font-medium">{getEmployeeAttendanceId(record.employee_id)}</TableCell>
                                                 <TableCell>{getEmployeeName(record.employee_id)}</TableCell>
                                                 <TableCell>{record.year}</TableCell>
                                                 <TableCell>Q{record.quarter}</TableCell>
                                                 <TableCell>{record.total_minutes}</TableCell>
                                                 <TableCell className="font-semibold text-blue-600">{record.used_minutes}</TableCell>
                                                 <TableCell className={record.remaining_minutes <= 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{record.remaining_minutes}</TableCell>
                                                 <TableCell className="text-xs text-slate-500">
                                                     {record.allocation_type}
                                                 </TableCell>
                                             </TableRow>
                                         ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}