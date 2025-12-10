import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function AstraImport() {
    const [file, setFile] = useState(null);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState(null);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
                toast.error('Please select an Excel file (.xlsx or .xls)');
                return;
            }
            setFile(selectedFile);
            setResult(null);
        }
    };

    const importMutation = useMutation({
        mutationFn: async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('fileName', file.name);

            const response = await base44.functions.invoke('astraImportAttendance', formData);
            return response.data;
        },
        onSuccess: (data) => {
            if (data.success) {
                setResult(data);
                setFile(null);
                toast.success(`Successfully imported ${data.total_punch_records_created} punch records`);
            } else {
                toast.error(data.error || 'Import failed');
            }
        },
        onError: (error) => {
            toast.error('Import failed: ' + error.message);
        }
    });

    const handleImport = () => {
        if (!file) {
            toast.error('Please select a file first');
            return;
        }
        setImporting(true);
        importMutation.mutate(file);
        setTimeout(() => setImporting(false), 1000);
    };

    return (
        <div className="space-y-6">
            <Breadcrumb
                items={[
                    { label: 'Astra Auto Parts Import' }
                ]}
            />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Astra Auto Parts - Matrix Import</h1>
                    <p className="text-slate-600 mt-2">Import matrix-style attendance sheets</p>
                </div>
            </div>

            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle>Upload Excel File</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                        <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                        {file ? (
                            <div className="space-y-2">
                                <p className="font-medium text-slate-900">{file.name}</p>
                                <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setFile(null)}
                                >
                                    Change File
                                </Button>
                            </div>
                        ) : (
                            <>
                                <p className="text-slate-600 mb-4">Select Excel file with matrix-style attendance data</p>
                                <label className="cursor-pointer">
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <Button asChild>
                                        <span>
                                            <Upload className="w-4 h-4 mr-2" />
                                            Choose File
                                        </span>
                                    </Button>
                                </label>
                            </>
                        )}
                    </div>

                    {file && (
                        <div className="flex justify-end">
                            <Button
                                onClick={handleImport}
                                disabled={importing || importMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                                size="lg"
                            >
                                {importing || importMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-4 h-4 mr-2" />
                                        Import Attendance Data
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {result && (
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {result.success ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-red-600" />
                            )}
                            Import Results
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 rounded-lg p-4">
                                <p className="text-sm text-slate-600">Batch ID</p>
                                <p className="text-lg font-semibold text-slate-900 font-mono text-xs">
                                    {result.import_batch_id}
                                </p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-sm text-blue-600">Employees Detected</p>
                                <p className="text-2xl font-bold text-blue-900">
                                    {result.total_employees_detected}
                                </p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-4">
                                <p className="text-sm text-green-600">Records Created</p>
                                <p className="text-2xl font-bold text-green-900">
                                    {result.total_punch_records_created}
                                </p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-4">
                                <p className="text-sm text-amber-600">Records Skipped</p>
                                <p className="text-2xl font-bold text-amber-900">
                                    {result.total_records_skipped}
                                </p>
                            </div>
                        </div>

                        {result.skipped_blocks && result.skipped_blocks.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="font-semibold text-red-900 mb-2">Skipped Employee Blocks:</p>
                                <div className="space-y-1">
                                    {result.skipped_blocks.map((block, idx) => (
                                        <div key={idx} className="text-sm text-red-700">
                                            <span className="font-medium">{block.employeeCode}</span>: {block.reason}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card className="border-0 shadow-md bg-slate-50">
                <CardHeader>
                    <CardTitle>Expected File Format</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div>
                        <p className="font-semibold text-slate-900 mb-1">Header Rows (rows 1-3):</p>
                        <ul className="list-disc list-inside text-slate-600 space-y-1">
                            <li>Row 1: Day labels (Day1, Day2, etc.)</li>
                            <li>Row 2: Actual dates (01-Nov, 02-Nov, etc.)</li>
                            <li>Row 3: Weekday names (Sun, Mon, etc.)</li>
                        </ul>
                    </div>
                    <div>
                        <p className="font-semibold text-slate-900 mb-1">Employee Blocks:</p>
                        <ul className="list-disc list-inside text-slate-600 space-y-1">
                            <li>Each employee appears as a vertical block of 8 rows</li>
                            <li>Rows in order: IN, OUT, Late By, Early By, Total OT, Duration, T Duration, Status</li>
                            <li>Employee code/name appears once at the start of the block</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}