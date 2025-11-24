import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function ShiftTimingsTab({ project }) {
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const queryClient = useQueryClient();

    const formatTime = (timeStr) => {
        if (!timeStr || timeStr === '—') return '—';
        
        // If already in AM/PM format, return as is
        if (/AM|PM/i.test(timeStr)) return timeStr;
        
        // Parse 24-hour format (HH:MM or HH:MM:SS)
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return timeStr;
        
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = hours >= 12 ? 'PM' : 'AM';
        
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        
        return `${hours}:${minutes} ${period}`;
    };

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            parseCSV(selectedFile);
        }
    };

    const parseCSV = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter(line => line.trim());
            
            const data = [];
            const newWarnings = [];

            // Skip header row
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 7) {
                    const attendance_id = values[0];
                    // values[1] = name (not needed for shift timing)
                    // values[2] = department (not needed)
                    const am_start = values[3]; // morning start
                    const am_end = values[4];   // morning end
                    const pm_start = values[5]; // evening start
                    const pm_end = values[6];   // evening end
                    // values[7] = total hours (optional)
                    const applicableDays = values[8] || ''; // applicable days

                    // Check if employee exists
                    const employeeExists = employees.some(e => e.attendance_id === attendance_id);
                    if (!employeeExists) {
                        newWarnings.push(`Unknown employee: ${attendance_id}`);
                    }

                    // Parse applicable days to detect Friday shifts
                    const is_friday_shift = applicableDays.toLowerCase().includes('friday');

                    data.push({
                        attendance_id,
                        date: null, // General shift, no specific date
                        is_friday_shift,
                        applicable_days: applicableDays,
                        am_start,
                        am_end,
                        pm_start,
                        pm_end,
                        employeeExists
                    });
                }
            }

            setParsedData(data);
            setWarnings([...new Set(newWarnings)]);
            toast.success(`Parsed ${data.length} shift records`);
        };
        reader.readAsText(file);
    };

    const uploadMutation = useMutation({
        mutationFn: async () => {
            // Delete existing shifts for this project
            const existingShifts = await base44.entities.ShiftTiming.filter({ project_id: project.id });
            await Promise.all(existingShifts.map(s => base44.entities.ShiftTiming.delete(s.id)));

            // Insert new shifts
            const shiftRecords = parsedData.map(s => ({
                project_id: project.id,
                attendance_id: s.attendance_id,
                date: s.date,
                is_friday_shift: s.is_friday_shift,
                applicable_days: s.applicable_days,
                am_start: s.am_start,
                am_end: s.am_end,
                pm_start: s.pm_start,
                pm_end: s.pm_end
            }));

            await base44.entities.ShiftTiming.bulkCreate(shiftRecords);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Shift timings uploaded successfully');
            setParsedData([]);
            setFile(null);
        },
        onError: () => {
            toast.error('Failed to upload shift timings');
        }
    });

    return (
        <div className="space-y-6">
            {/* Upload Section */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Upload Shift Timings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                        />
                        <p className="text-sm text-slate-500 mt-2">
                            CSV format: attendance_id, name, department, morning_start, morning_end, evening_start, evening_end, total_hours, applicable_days
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            System auto-detects Friday shifts from applicable_days column.
                        </p>
                    </div>

                    {warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-900">Warnings</p>
                                    <ul className="text-sm text-amber-700 mt-1 space-y-1">
                                        {warnings.map((warning, idx) => (
                                            <li key={idx}>• {warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {parsedData.length > 0 && (
                        <div>
                            <p className="text-sm text-slate-600 mb-2">
                                Preview: {parsedData.length} records ready to upload
                            </p>
                            <Button 
                                onClick={() => uploadMutation.mutate()}
                                disabled={uploadMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {uploadMutation.isPending ? 'Uploading...' : 'Upload Shifts'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Current Shifts */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Current Shift Timings</CardTitle>
                </CardHeader>
                <CardContent>
                    {shifts.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No shifts uploaded yet</p>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">
                                Total: {shifts.length} shift records
                            </p>
                            <div className="max-h-96 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Attendance ID</TableHead>
                                            <TableHead>Employee Name</TableHead>
                                            <TableHead>AM Shift</TableHead>
                                            <TableHead>PM Shift</TableHead>
                                            <TableHead>Applicable Days</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {shifts.map((shift) => {
                                            const employee = employees.find(e => e.attendance_id === shift.attendance_id);
                                            return (
                                                <TableRow key={shift.id}>
                                                    <TableCell className="font-medium">{shift.attendance_id}</TableCell>
                                                    <TableCell>{employee?.name || '-'}</TableCell>
                                                    <TableCell>{formatTime(shift.am_start)} - {formatTime(shift.am_end)}</TableCell>
                                                    <TableCell>{formatTime(shift.pm_start)} - {formatTime(shift.pm_end)}</TableCell>
                                                    <TableCell>
                                                        {shift.applicable_days || (shift.date ? new Date(shift.date).toLocaleDateString() : 'All days')}
                                                        {shift.is_friday_shift && (
                                                            <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded">
                                                                Friday
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
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