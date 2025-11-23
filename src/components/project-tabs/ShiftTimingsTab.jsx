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
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            const data = [];
            const newWarnings = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 5) {
                    const attendance_id = values[0];
                    const date = values[1]; // Can be empty for general shift
                    const am_start = values[2];
                    const am_end = values[3];
                    const pm_start = values[4];
                    const pm_end = values[5];

                    // Check if employee exists
                    const employeeExists = employees.some(e => e.attendance_id === attendance_id);
                    if (!employeeExists) {
                        newWarnings.push(`Unknown employee: ${attendance_id}`);
                    }

                    // Detect Friday shift
                    let parsedDate = null;
                    let is_friday_shift = false;
                    if (date) {
                        const dateMatch = date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                        if (dateMatch) {
                            const [, day, month, year] = dateMatch;
                            parsedDate = `${year}-${month}-${day}`;
                            const dayOfWeek = new Date(parsedDate).getDay();
                            is_friday_shift = dayOfWeek === 5; // Friday = 5
                        }
                    }

                    data.push({
                        attendance_id,
                        date: parsedDate,
                        is_friday_shift,
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
                            CSV format: attendance_id, date (optional), am_start, am_end, pm_start, pm_end
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Leave date empty for general shifts. System auto-detects Friday shifts.
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
                                            <TableHead>Employee</TableHead>
                                            <TableHead>Date/Type</TableHead>
                                            <TableHead>AM Shift</TableHead>
                                            <TableHead>PM Shift</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {shifts.map((shift) => (
                                            <TableRow key={shift.id}>
                                                <TableCell className="font-medium">{shift.attendance_id}</TableCell>
                                                <TableCell>
                                                    {shift.date ? (
                                                        <span>
                                                            {new Date(shift.date).toLocaleDateString()}
                                                            {shift.is_friday_shift && (
                                                                <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded">
                                                                    Friday
                                                                </span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-500">General</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{shift.am_start} - {shift.am_end}</TableCell>
                                                <TableCell>{shift.pm_start} - {shift.pm_end}</TableCell>
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