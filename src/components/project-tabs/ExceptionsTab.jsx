import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EXCEPTION_TYPES, formatExceptionTypeLabel, getFilteredExceptionTypes } from '@/lib/exception-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Search, Download, Edit, Eye, Filter, Sparkles, Calendar, Loader2 } from 'lucide-react';
import SortableTableHead from '../ui/SortableTableHead';
import TablePagination from '../ui/TablePagination';
import TimePicker from '../ui/QuickTimePicker';
import { toast } from 'sonner';
import BulkEditExceptionDialog from '../exceptions/BulkEditExceptionDialog';
import EditExceptionDialog from '../exceptions/EditExceptionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import ExcelPreviewDialog from '@/components/ui/ExcelPreviewDialog';
import ChecklistSection, { formatMergedWorksheet } from './ChecklistSection';
import ReportGeneratedExceptions from '../exceptions/ReportGeneratedExceptions';
...
            <ReportGeneratedExceptions
                project={project}
                reportExceptions={reportExceptions}
                employees={employees}
                canEditAllowedMinutes={canEditAllowedMinutes}
            />

            {/* Edit Exception Dialog */}
            <EditExceptionDialog
                open={!!editingException}
                onClose={() => setEditingException(null)}
                exception={editingException}
                projectId={project.id}
                canEditAllowedMinutes={canEditAllowedMinutes}
            />

            {/* Bulk Edit Dialog */}
            <BulkEditExceptionDialog
                open={showBulkEdit}
                onClose={() => {
                    setShowBulkEdit(false);
                    setSelectedExceptions([]);
                }}
                selectedExceptions={selectedExceptions}
                projectId={project.id}
                canEditAllowedMinutes={canEditAllowedMinutes}
            />

            {/* View Exception Dialog */}
            <Dialog open={!!viewingException} onOpenChange={() => setViewingException(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Exception Details</DialogTitle>
                    </DialogHeader>
                    {viewingException && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-slate-500 text-xs">Employee ID</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.attendance_id === 'ALL' ? 'All Employees' : viewingException.attendance_id}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Employee Name</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.attendance_id === 'ALL' 
                                            ? '—' 
                                            : employees.find(e => String(e.attendance_id) === String(viewingException.attendance_id) && e.company === project.company)?.name || '—'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Exception Type</Label>
                                    {viewingException.is_custom_type ? (
                                        <div>
                                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 inline-block">
                                                {viewingException.custom_type_name || 'Custom'}
                                            </span>
                                            <p className="text-xs text-amber-600 mt-1">Not used in analysis</p>
                                        </div>
                                    ) : (
                                        <p className="font-medium text-slate-900">{viewingException.type.replace(/_/g, ' ')}</p>
                                    )}
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Created From Report</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.created_from_report ? 'Yes' : 'No'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">From Date</Label>
                                    <p className="font-medium text-slate-900">
                                        {new Date(viewingException.date_from).toLocaleDateString()}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">To Date</Label>
                                    <p className="font-medium text-slate-900">
                                        {new Date(viewingException.date_to).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>

                            {viewingException.type === 'SHIFT_OVERRIDE' && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs mb-2 block">Shift Override Times</Label>
                                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg">
                                        <div>
                                            <span className="text-xs text-slate-600">AM Start:</span>
                                            <p className="font-medium">{viewingException.new_am_start || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">AM End:</span>
                                            <p className="font-medium">{viewingException.new_am_end || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">PM Start:</span>
                                            <p className="font-medium">{viewingException.new_pm_start || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">PM End:</span>
                                            <p className="font-medium">{viewingException.new_pm_end || '—'}</p>
                                        </div>
                                    </div>
                                    {viewingException.include_friday !== undefined && (
                                        <p className="text-sm text-slate-600 mt-2">
                                            {viewingException.include_friday 
                                                ? '✓ Includes Friday' 
                                                : '✗ Excludes Friday'}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Added display for other_minutes */}
                            {viewingException.other_minutes && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Other Minutes</Label>
                                    <p className="font-medium text-slate-900">{viewingException.other_minutes} minutes</p>
                                </div>
                            )}

                            {viewingException.allowed_minutes && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Allowed Minutes (Excused)</Label>
                                    <p className="font-medium text-slate-900">{viewingException.allowed_minutes} minutes</p>
                                </div>
                            )}

                            {viewingException.details && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Details / Reason</Label>
                                    <p className="text-slate-900 mt-1">{viewingException.details}</p>
                                </div>
                            )}

                            <div className="border-t pt-4">
                                <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
                                    <div>
                                        <span>Created:</span>
                                        <p className="text-slate-900">
                                            {new Date(viewingException.created_date).toLocaleString('en-US', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true,
                                                timeZone: 'Asia/Dubai'
                                            })}
                                        </p>
                                    </div>
                                    <div>
                                        <span>Created By:</span>
                                        <p className="text-slate-900">{viewingException.created_by || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end">
                        <Button onClick={() => setViewingException(null)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Import Preview Dialog */}
            <Dialog open={showImportPreview} onOpenChange={setShowImportPreview}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>Import Preview - Review Before Importing</DialogTitle>
                    </DialogHeader>
                    {importPreview && (
                        <div className="space-y-4 overflow-y-auto">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    Ready to import <strong>{importPreview.exceptions.length}</strong> exception{importPreview.exceptions.length > 1 ? 's' : ''}.
                                    {importPreview.warnings.length > 0 && (
                                        <span className="block mt-2 text-amber-700">
                                            ⚠️ {importPreview.warnings.length} warning{importPreview.warnings.length > 1 ? 's' : ''} found
                                        </span>
                                    )}
                                </p>
                            </div>

                            <div className="border rounded-lg overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Attendance ID</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>From</TableHead>
                                            <TableHead>To</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importPreview.exceptions.slice(0, 10).map((ex, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-sm">{ex.attendance_id}</TableCell>
                                                <TableCell className="text-sm">
                                                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getTypeColor(ex.type)}`}>
                                                        {ex.type.replace(/_/g, ' ')}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-sm">{new Date(ex.date_from).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm">{new Date(ex.date_to).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm">{ex.details || '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {importPreview.exceptions.length > 10 && (
                                    <div className="p-3 bg-slate-50 text-center text-sm text-slate-600 border-t">
                                        ... and {importPreview.exceptions.length - 10} more
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowImportPreview(false);
                                        setImportPreview(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={confirmImport}
                                >
                                    Confirm & Import {importPreview.exceptions.length} Exception{importPreview.exceptions.length > 1 ? 's' : ''}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <ExcelPreviewDialog
                isOpen={previewConfig.isOpen}
                onClose={() => setPreviewConfig(prev => ({ ...prev, isOpen: false }))}
                data={previewConfig.data}
                headers={previewConfig.headers}
                fileName={previewConfig.fileName}
                onConfirm={previewConfig.onConfirm}
                simulateMergeColumns={previewConfig.simulateMergeColumns}
            />
        </div>
    );
}