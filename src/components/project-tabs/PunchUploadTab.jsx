import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, AlertTriangle, Check, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function PunchUploadTab({ project }) {
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const queryClient = useQueryClient();

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
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
            const headers = lines[0].split(',').map(h => h.trim());
            
            const data = [];
            const newWarnings = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 2) {
                    const attendance_id = values[0];
                    const timestamp_raw = values[1];

                    // Extract date from timestamp (DD/MM/YYYY HH:MM AM/PM)
                    const dateMatch = timestamp_raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                    let punch_date = '';
                    if (dateMatch) {
                        const [, day, month, year] = dateMatch;
                        punch_date = `${year}-${month}-${day}`;
                    }

                    // Check if employee exists
                    const employeeExists = employees.some(e => e.attendance_id === attendance_id);
                    if (!employeeExists) {
                        newWarnings.push(`Unknown employee: ${attendance_id}`);
                    }

                    data.push({
                        attendance_id,
                        timestamp_raw,
                        punch_date,
                        employeeExists
                    });
                }
            }

            setParsedData(data);
            setWarnings([...new Set(newWarnings)]);
            toast.success(`Parsed ${data.length} punch records`);
        };
        reader.readAsText(file);
    };

    const uploadMutation = useMutation({
        mutationFn: async () => {
            // Delete existing punches for this project
            const existingPunches = await base44.entities.Punch.filter({ project_id: project.id });
            await Promise.all(existingPunches.map(p => base44.entities.Punch.delete(p.id)));

            // Insert new punches
            const punchRecords = parsedData.map(p => ({
                project_id: project.id,
                attendance_id: p.attendance_id,
                timestamp_raw: p.timestamp_raw,
                punch_date: p.punch_date
            }));

            await base44.entities.Punch.bulkCreate(punchRecords);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            toast.success('Punches uploaded successfully');
            setParsedData([]);
            setFile(null);
        },
        onError: () => {
            toast.error('Failed to upload punches');
        }
    });

    // Group punches by employee and date for preview
    const punchSummary = punches.reduce((acc, punch) => {
        const key = `${punch.attendance_id}_${punch.punch_date}`;
        if (!acc[key]) {
            acc[key] = {
                attendance_id: punch.attendance_id,
                date: punch.punch_date,
                count: 0
            };
        }
        acc[key].count++;
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {/* Upload Section */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Upload Punch Data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                        />
                        <p className="text-sm text-slate-500 mt-2">
                            CSV format: attendance_id, timestamp (DD/MM/YYYY HH:MM AM/PM)
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
                                {uploadMutation.isPending ? 'Uploading...' : 'Upload Punches'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Current Punches */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Current Punch Data</CardTitle>
                </CardHeader>
                <CardContent>
                    {punches.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No punches uploaded yet</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-slate-600">
                                    Total: {punches.length} punch records from {new Set(punches.map(p => p.attendance_id)).size} employees
                                </p>
                                <div className="relative w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="Filter by attendance ID..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                            <div className="max-h-96 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Employee</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Punches</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Object.values(punchSummary)
                                            .filter(item => 
                                                !searchTerm || 
                                                item.attendance_id.toLowerCase().includes(searchTerm.toLowerCase())
                                            )
                                            .map((item, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-medium">{item.attendance_id}</TableCell>
                                                    <TableCell>{new Date(item.date).toLocaleDateString()}</TableCell>
                                                    <TableCell>{item.count}</TableCell>
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