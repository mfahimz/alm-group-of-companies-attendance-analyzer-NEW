import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { AlertCircle } from 'lucide-react';

export default function AllowedMinutesHistory({ projectId, deptHeadVerification }) {
    const { data: allowedExceptions = [], isLoading } = useQuery({
        queryKey: ['allowedMinutesHistory', projectId, deptHeadVerification?.assignment?.employee_id],
        queryFn: async () => {
            if (!projectId || !deptHeadVerification?.verified) return [];

            const exceptions = await base44.entities.Exception.filter({
                project_id: projectId,
                type: 'ALLOWED_MINUTES',
                approved_by_dept_head: deptHeadVerification.assignment.employee_id
            });

            return exceptions.sort((a, b) => 
                new Date(b.created_date) - new Date(a.created_date)
            );
        },
        enabled: !!projectId && !!deptHeadVerification?.verified
    });

    const getEmployeeName = async (attendanceId) => {
        try {
            const employees = await base44.entities.Employee.filter({
                attendance_id: parseInt(attendanceId)
            });
            return employees[0]?.name || `ID: ${attendanceId}`;
        } catch {
            return `ID: ${attendanceId}`;
        }
    };

    if (isLoading) {
        return (
            <Card>
                <CardContent className="p-6 text-center text-slate-500">
                    Loading history...
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pre-Approved Minutes History</CardTitle>
            </CardHeader>
            <CardContent>
                {allowedExceptions.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        No pre-approvals created yet
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Attendance ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Minutes</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Created</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allowedExceptions.map(exc => (
                                <TableRow key={exc.id}>
                                    <TableCell className="font-medium">{exc.attendance_id}</TableCell>
                                    <TableCell>{format(parseISO(exc.date_from), 'dd MMM yyyy')}</TableCell>
                                    <TableCell>
                                        <span className="font-semibold text-green-600">{exc.allowed_minutes} min</span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-xs">
                                            {exc.allowed_minutes_type === 'both' 
                                                ? 'Late & Early' 
                                                : exc.allowed_minutes_type === 'late' 
                                                ? 'Late Only' 
                                                : 'Early Only'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-600">
                                        {exc.details || '-'}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-500">
                                        {format(parseISO(exc.created_date), 'dd MMM HH:mm')}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}