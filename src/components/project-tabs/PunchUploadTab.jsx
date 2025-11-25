import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, AlertTriangle, Search, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';

export default function PunchUploadTab({ project }) {
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedPunches, setSelectedPunches] = useState([]);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [uploadProgress, setUploadProgress] = useState(null);
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
                    
                    // Detect which column is the timestamp by checking for date pattern (supports D/M/YYYY or DD/MM/YYYY)
                    let timestamp_raw = '';
                    if (values[1].match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                        // Format: ID, timestamp
                        timestamp_raw = values[1];
                    } else if (values.length >= 3 && values[2].match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                        // Format: ID, name, timestamp
                        timestamp_raw = values[2];
                    } else {
                        // Fallback to second column
                        timestamp_raw = values[1];
                    }

                    // Extract date from timestamp (D/M/YYYY or DD/MM/YYYY HH:MM AM/PM)
                    const dateMatch = timestamp_raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                    let punch_date = '';
                    if (dateMatch) {
                        const [, day, month, year] = dateMatch;
                        punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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
            // Helper to add delay between API calls
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            // Delete existing punches for this project
            const existingPunches = await base44.entities.Punch.filter({ project_id: project.id });
            
            // Delete in small batches with delays to avoid rate limiting
            const deleteBatchSize = 10;
            for (let i = 0; i < existingPunches.length; i += deleteBatchSize) {
                const batch = existingPunches.slice(i, i + deleteBatchSize);
                await Promise.all(batch.map(p => base44.entities.Punch.delete(p.id)));
                await delay(1000); // Wait 1s between delete batches
            }

            // Insert new punches in batches with delays
            const punchRecords = parsedData.map(p => ({
                project_id: project.id,
                attendance_id: p.attendance_id,
                timestamp_raw: p.timestamp_raw,
                punch_date: p.punch_date
            }));

            // Upload in batches of 25 with longer delays to avoid rate limiting
            const batchSize = 25;
            for (let i = 0; i < punchRecords.length; i += batchSize) {
                const batch = punchRecords.slice(i, i + batchSize);
                await base44.entities.Punch.bulkCreate(batch);
                await delay(1500); // Wait 1.5s between upload batches
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            toast.success('Punches uploaded successfully');
            setParsedData([]);
            setFile(null);
        },
        onError: (error) => {
            toast.error('Failed to upload punches: ' + (error.message || 'Unknown error'));
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Punch.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            toast.success('Punch deleted');
        },
        onError: () => {
            toast.error('Failed to delete punch');
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const batchSize = 20;
            for (let i = 0; i < ids.length; i += batchSize) {
                const batch = ids.slice(i, i + batchSize);
                await Promise.all(batch.map(id => base44.entities.Punch.delete(id)));
                if (i + batchSize < ids.length) {
                    await delay(500);
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            setSelectedPunches([]);
            toast.success('Punches deleted successfully');
        },
        onError: () => {
            toast.error('Failed to delete punches');
        }
    });

    // Filter punches based on search and date range
    const filteredPunches = punches.filter(punch => {
        const matchesSearch = !searchTerm || punch.attendance_id.toLowerCase().includes(searchTerm.toLowerCase());
        
        let matchesDateRange = true;
        if (dateFrom && dateTo) {
            matchesDateRange = punch.punch_date >= dateFrom && punch.punch_date <= dateTo;
        } else if (dateFrom) {
            matchesDateRange = punch.punch_date >= dateFrom;
        } else if (dateTo) {
            matchesDateRange = punch.punch_date <= dateTo;
        }
        
        return matchesSearch && matchesDateRange;
    });

    // Enrich punches with employee names
    const enrichedPunches = filteredPunches
        .map(punch => ({
            ...punch,
            employee_name: employees.find(e => e.attendance_id === punch.attendance_id)?.name || '-'
        }))
        .sort((a, b) => {
            let aVal = a[sort.key];
            let bVal = b[sort.key];
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const toggleSelectAll = () => {
        if (selectedPunches.length === enrichedPunches.length) {
            setSelectedPunches([]);
        } else {
            setSelectedPunches(enrichedPunches.map(p => p.id));
        }
    };

    const toggleSelectPunch = (id) => {
        setSelectedPunches(prev => 
            prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = () => {
        if (window.confirm(`Delete ${selectedPunches.length} selected punch records?`)) {
            bulkDeleteMutation.mutate(selectedPunches);
        }
    };

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
                            CSV format: attendance_id, name (optional), timestamp
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Timestamp format: DD/MM/YYYY HH:MM AM/PM (e.g., 02/10/2025 8:54 AM)
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
                                    {enrichedPunches.length !== punches.length && ` (${enrichedPunches.length} shown)`}
                                </p>
                                <div className="flex gap-3">
                                    {selectedPunches.length > 0 && (
                                        <Button 
                                            onClick={handleBulkDelete}
                                            variant="destructive"
                                            size="sm"
                                            disabled={bulkDeleteMutation.isPending}
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete {selectedPunches.length} Selected
                                        </Button>
                                    )}
                                    <Input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="w-40"
                                        placeholder="From date"
                                    />
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="w-40"
                                        placeholder="To date"
                                    />
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
                            </div>
                            <div className="max-h-96 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={selectedPunches.length === enrichedPunches.length && enrichedPunches.length > 0}
                                                    onCheckedChange={toggleSelectAll}
                                                />
                                            </TableHead>
                                            <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                                Employee ID
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="employee_name" currentSort={sort} onSort={setSort}>
                                                Employee Name
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="timestamp_raw" currentSort={sort} onSort={setSort}>
                                                Time
                                            </SortableTableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {enrichedPunches.map((punch) => (
                                            <TableRow key={punch.id}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedPunches.includes(punch.id)}
                                                        onCheckedChange={() => toggleSelectPunch(punch.id)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">{punch.attendance_id}</TableCell>
                                                <TableCell>{punch.employee_name}</TableCell>
                                                <TableCell>{punch.timestamp_raw}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            if (window.confirm('Delete this punch record?')) {
                                                                deleteMutation.mutate(punch.id);
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
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