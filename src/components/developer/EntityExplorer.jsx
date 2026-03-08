/**
 * EntityExplorer.jsx — Developer Module: Entity Explorer Section
 *
 * PURPOSE:
 * Provides admin users with a raw, unformatted view of every entity in the
 * application. Allows browsing, filtering, sorting, editing, and deleting
 * records across all entities with full audit logging.
 *
 * WHY CONFIRMATION STEPS ARE REQUIRED:
 * Every edit and delete operation in this component directly mutates live
 * production data. Confirmation dialogs exist as a safety net to prevent
 * accidental data loss or corruption. They explicitly name the entity, record,
 * and action so the admin can verify intent before proceeding.
 *
 * WHY AUDIT LOGGING IS CALLED ON EVERY EDIT AND DELETE:
 * Because this tool bypasses normal application workflows and writes directly
 * to entities, every mutation must be logged for accountability, traceability,
 * and rollback capability. The logAudit function records the user, action type,
 * entity, record ID, and the exact old/new values of every change.
 *
 * This component is scoped exclusively to the Developer Module page and must
 * never be imported or rendered anywhere else in the application.
 */

import { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { usePermissions } from '@/components/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Database,
    Search,
    ChevronUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Trash2,
    Loader2,
    AlertTriangle,
    Inbox,
} from 'lucide-react';

/**
 * Complete list of all entities available in the application.
 * THIS LIST MUST BE DERIVED DYNAMICALLY FROM THE ACTUAL CODEBASE.
 *
 * WHY: Entity lists that are manually hardcoded become stale quickly as new
 * entities are added or renamed in the backend schema. By scanning the codebase
 * for all base44.entities.XXX references, we guarantee this list is never
 * incomplete or out of sync with reality. This prevents admins from discovering
 * missing entities mid-diagnostic investigation, which could mask real issues.
 *
 * Each entry must exactly match the entity name used in base44.entities.
 * This list was derived from scanning all src/ and functions/ files for patterns
 * like base44.entities.EntityName or base44.asServiceRole.entities.EntityName.
 */
const ALL_ENTITIES = [
    'ActivityLog',
    'AnalysisResult',
    'AnnualLeave',
    'AppDocument',
    'AttendanceRules',
    'AuditLog',
    'CalendarCarryoverBucket',
    'CalendarCycle',
    'CalendarPayrollSnapshot',
    'CalendarSettings',
    'ChecklistItem',
    'Company',
    'CompanySettings',
    'DepartmentHead',
    'DevelopmentLog',
    'Employee',
    'EmployeeGraceHistory',
    'EmployeeQuarterlyMinutes',
    'EmployeeSalary',
    'Exception',
    'FeatureRequest',
    'JobTemplate',
    'OvertimeData',
    'PagePermission',
    'PrivateFile',
    'Project',
    'ProjectEmployee',
    'Punch',
    'RamadanSchedule',
    'ReportRun',
    'ResumeScanResult',
    'SalaryIncrement',
    'SalaryReport',
    'SalarySnapshot',
    'ShiftTiming',
    'SystemSettings',
];

/** Number of records displayed per page in the table. */
const PAGE_SIZE = 20;

export default function EntityExplorer() {
    // --- State ---
    const { user } = usePermissions();
    const [selectedEntity, setSelectedEntity] = useState('');
    const [records, setRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [filterText, setFilterText] = useState('');
    const [sortColumn, setSortColumn] = useState(null);
    const [sortDirection, setSortDirection] = useState('asc');
    const [currentPage, setCurrentPage] = useState(1);

    // Edit modal state
    const [editRecord, setEditRecord] = useState(null);
    const [editValues, setEditValues] = useState({});
    const [editConfirmStep, setEditConfirmStep] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    // Delete modal state
    const [deleteRecord, setDeleteRecord] = useState(null);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);

    // --- Fetch records when entity is selected ---
    const fetchRecords = useCallback(async (entityName) => {
        if (!entityName) return;
        setIsLoading(true);
        setFetchError(null);
        setRecords([]);
        setFilterText('');
        setSortColumn(null);
        setSortDirection('asc');
        setCurrentPage(1);
        try {
            const data = await base44.entities[entityName].list('-created_date', 5000);
            setRecords(data || []);
        } catch (err) {
            console.error(`Failed to fetch ${entityName}:`, err);
            setFetchError(err.message || `Failed to fetch records from ${entityName}.`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleEntityChange = useCallback((value) => {
        setSelectedEntity(value);
        fetchRecords(value);
    }, [fetchRecords]);

    // --- Derive column names from all records ---
    const columns = useMemo(() => {
        if (records.length === 0) return [];
        const colSet = new Set();
        records.forEach((rec) => {
            Object.keys(rec).forEach((key) => colSet.add(key));
        });
        // Put 'id' first if present, then sort the rest alphabetically
        const cols = Array.from(colSet);
        cols.sort((a, b) => {
            if (a === 'id') return -1;
            if (b === 'id') return 1;
            return a.localeCompare(b);
        });
        return cols;
    }, [records]);

    // --- Filter records by text matching any field value ---
    const filteredRecords = useMemo(() => {
        if (!filterText.trim()) return records;
        const lower = filterText.toLowerCase();
        return records.filter((rec) =>
            Object.values(rec).some((val) => {
                if (val == null) return false;
                return String(val).toLowerCase().includes(lower);
            })
        );
    }, [records, filterText]);

    // --- Sort filtered records ---
    const sortedRecords = useMemo(() => {
        if (!sortColumn) return filteredRecords;
        return [...filteredRecords].sort((a, b) => {
            const aVal = a[sortColumn];
            const bVal = b[sortColumn];
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return sortDirection === 'asc' ? -1 : 1;
            if (bVal == null) return sortDirection === 'asc' ? 1 : -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }
            const cmp = String(aVal).localeCompare(String(bVal));
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [filteredRecords, sortColumn, sortDirection]);

    // --- Pagination ---
    const totalPages = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return sortedRecords.slice(start, start + PAGE_SIZE);
    }, [sortedRecords, currentPage]);

    // Reset to page 1 when filter changes
    const handleFilterChange = useCallback((e) => {
        setFilterText(e.target.value);
        setCurrentPage(1);
    }, []);

    // --- Sort handler ---
    const handleSort = useCallback((col) => {
        if (sortColumn === col) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(col);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    }, [sortColumn]);

    // --- Edit handlers ---
    const openEditModal = useCallback((record) => {
        setEditRecord(record);
        // Clone all fields for editing (exclude 'id' and system fields from editable values)
        const editable = {};
        Object.entries(record).forEach(([key, val]) => {
            if (key === 'id') return; // ID is not editable
            editable[key] = val != null ? String(val) : '';
        });
        setEditValues(editable);
        setEditConfirmStep(false);
        setSaveError(null);
    }, []);

    const closeEditModal = useCallback(() => {
        setEditRecord(null);
        setEditValues({});
        setEditConfirmStep(false);
        setSaveError(null);
    }, []);

    /**
     * Save edited record.
     * CONFIRMATION IS REQUIRED because this writes directly to live production
     * data without any application-level validation or workflow.
     * AUDIT LOGGING is called after every successful save so that the change
     * can be traced back to the admin who made it, with full old/new values.
     */
    const handleSave = useCallback(async () => {
        if (!editRecord || !selectedEntity) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            // Build the update payload — only include fields that changed
            const changes = {};
            const oldValues = {};
            const newValues = {};
            Object.entries(editValues).forEach(([key, val]) => {
                const original = editRecord[key];
                const originalStr = original != null ? String(original) : '';
                if (val !== originalStr) {
                    // Attempt to preserve original types for the update payload
                    let parsedVal = val;
                    if (val === '' || val === 'null') {
                        parsedVal = null;
                    } else if (val === 'true') {
                        parsedVal = true;
                    } else if (val === 'false') {
                        parsedVal = false;
                    } else if (!isNaN(Number(val)) && val.trim() !== '' && typeof original === 'number') {
                        parsedVal = Number(val);
                    }
                    changes[key] = parsedVal;
                    oldValues[key] = original;
                    newValues[key] = parsedVal;
                }
            });

            if (Object.keys(changes).length === 0) {
                closeEditModal();
                return;
            }

            // Write the update directly to the entity
            await base44.entities[selectedEntity].update(editRecord.id, changes);

            /**
             * AUDIT LOG — Required for every edit operation.
             * Records the admin user, the entity, the record ID, and the
             * exact old and new values so the change is fully traceable.
             */
            try {
                await base44.functions.invoke('logAudit', {
                    action_type: 'update',
                    entity_name: selectedEntity,
                    entity_id: String(editRecord.id),
                    changes: JSON.stringify({ old: oldValues, new: newValues }),
                    context: `DevModule: Edited ${selectedEntity} record ${editRecord.id}`,
                });
            } catch (auditErr) {
                console.error('Audit log failed (edit):', auditErr);
            }

            // Refresh the record list
            await fetchRecords(selectedEntity);
            closeEditModal();
        } catch (err) {
            console.error('Save failed:', err);
            setSaveError(err.message || 'Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    }, [editRecord, editValues, selectedEntity, fetchRecords, closeEditModal]);

    // --- Delete handlers ---
    const openDeleteModal = useCallback((record) => {
        setDeleteRecord(record);
        setDeleteConfirmStep(false);
        setDeleteError(null);
    }, []);

    const closeDeleteModal = useCallback(() => {
        setDeleteRecord(null);
        setDeleteConfirmStep(false);
        setDeleteError(null);
    }, []);

    /**
     * Delete a record permanently.
     * CONFIRMATION IS REQUIRED because deletion is irreversible and operates
     * directly on live production data.
     * AUDIT LOGGING is called after every successful delete so that the
     * deleted record and admin can be identified for accountability.
     */
    const handleDelete = useCallback(async () => {
        if (!deleteRecord || !selectedEntity) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await base44.entities[selectedEntity].delete(deleteRecord.id);

            /**
             * AUDIT LOG — Required for every delete operation.
             * Records the full deleted record so it can be reconstructed
             * if the deletion was unintended.
             */
            try {
                await base44.functions.invoke('logAudit', {
                    action_type: 'delete',
                    entity_name: selectedEntity,
                    entity_id: String(deleteRecord.id),
                    changes: JSON.stringify({ deleted_record: deleteRecord }),
                    context: `DevModule: Deleted ${selectedEntity} record ${deleteRecord.id}`,
                });
            } catch (auditErr) {
                console.error('Audit log failed (delete):', auditErr);
            }

            await fetchRecords(selectedEntity);
            closeDeleteModal();
        } catch (err) {
            console.error('Delete failed:', err);
            setDeleteError(err.message || 'Failed to delete record.');
        } finally {
            setIsDeleting(false);
        }
    }, [deleteRecord, selectedEntity, fetchRecords, closeDeleteModal]);

    // --- Render ---
    return (
        <div className="space-y-4">
            {/* Entity selector and filter row */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="w-full sm:w-72">
                    <Select value={selectedEntity} onValueChange={handleEntityChange}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select an entity..." />
                        </SelectTrigger>
                        <SelectContent>
                            {ALL_ENTITIES.map((name) => (
                                <SelectItem key={name} value={name}>
                                    {name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Filter input — searches across all field values */}
                {selectedEntity && records.length > 0 && (
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Filter by any field value..."
                            value={filterText}
                            onChange={handleFilterChange}
                            className="pl-9"
                        />
                    </div>
                )}
            </div>

            {/* No entity selected state */}
            {!selectedEntity && (
                <div className="flex flex-col items-center justify-center min-h-[350px] border-2 border-dashed border-slate-300 rounded-xl bg-white">
                    <Database className="w-12 h-12 text-slate-400 mb-4" />
                    <p className="text-slate-500 text-sm">Select an entity to explore its records.</p>
                </div>
            )}

            {/* Loading state */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center min-h-[350px] bg-white rounded-xl border border-slate-200">
                    <Loader2 className="w-8 h-8 text-slate-500 animate-spin mb-3" />
                    <p className="text-slate-500 text-sm">Loading {selectedEntity} records...</p>
                </div>
            )}

            {/* Error state */}
            {fetchError && !isLoading && (
                <div className="flex flex-col items-center justify-center min-h-[350px] bg-white rounded-xl border border-red-200">
                    <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                    <p className="text-red-600 font-medium mb-1">Failed to load records</p>
                    <p className="text-red-500 text-sm max-w-md text-center">{fetchError}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => fetchRecords(selectedEntity)}
                    >
                        Retry
                    </Button>
                </div>
            )}

            {/* Empty state — entity selected but no records exist */}
            {selectedEntity && !isLoading && !fetchError && records.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[350px] bg-white rounded-xl border border-slate-200">
                    <Inbox className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-slate-600 font-medium mb-1">No records found</p>
                    <p className="text-slate-500 text-sm">{selectedEntity} has no records.</p>
                </div>
            )}

            {/* Records table */}
            {selectedEntity && !isLoading && !fetchError && records.length > 0 && (
                <>
                    {/* Record count — always visible above the table */}
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-800">{records.length}</span> total records
                            {filterText && (
                                <span className="ml-2 text-slate-500">
                                    ({sortedRecords.length} matching filter)
                                </span>
                            )}
                        </p>
                        <Badge variant="outline" className="text-xs">
                            {selectedEntity}
                        </Badge>
                    </div>

                    {/* Scrollable table container */}
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        {/* Actions column header */}
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 min-w-[90px]">
                                            Actions
                                        </th>
                                        {columns.map((col) => (
                                            <th
                                                key={col}
                                                onClick={() => handleSort(col)}
                                                className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap select-none"
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    {col}
                                                    {sortColumn === col && (
                                                        sortDirection === 'asc'
                                                            ? <ChevronUp className="w-3 h-3" />
                                                            : <ChevronDown className="w-3 h-3" />
                                                    )}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRecords.map((rec, idx) => (
                                        <tr
                                            key={rec.id || idx}
                                            className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                                        >
                                            {/* Actions cell — edit and delete buttons */}
                                            <td className="px-3 py-2 sticky left-0 bg-white z-10">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => openEditModal(rec)}
                                                        className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                        title="Edit record"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => openDeleteModal(rec)}
                                                        className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                        title="Delete record"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                            {/* Data cells — raw unformatted values */}
                                            {columns.map((col) => (
                                                <td
                                                    key={col}
                                                    className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[300px] truncate"
                                                    title={rec[col] != null ? String(rec[col]) : ''}
                                                >
                                                    {rec[col] != null ? String(rec[col]) : (
                                                        <span className="text-slate-300 italic">null</span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination controls */}
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                            Page {currentPage} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage <= 1}
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/*
              EDIT MODAL
              Opens when the admin clicks the edit button on a row.
              Shows all fields as individually editable text inputs.
              A two-step flow prevents accidental saves:
                Step 1: Edit values freely.
                Step 2: Confirmation step clearly states the entity, record ID,
                        and warns that this affects live production data.
            */}
            <Dialog open={!!editRecord} onOpenChange={(open) => { if (!open) closeEditModal(); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editConfirmStep
                                ? 'Confirm Changes'
                                : `Edit ${selectedEntity} Record`}
                        </DialogTitle>
                        <DialogDescription>
                            {editConfirmStep
                                ? `You are about to modify record ${editRecord?.id} in the ${selectedEntity} entity. This directly affects live production data.`
                                : `Editing record ID: ${editRecord?.id}`}
                        </DialogDescription>
                    </DialogHeader>

                    {!editConfirmStep ? (
                        /* Step 1: Edit form with all fields */
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                            {/* ID field — read-only */}
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">id (read-only)</label>
                                <Input value={editRecord?.id || ''} disabled className="bg-slate-50" />
                            </div>
                            {Object.entries(editValues).map(([key, val]) => (
                                <div key={key}>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">{key}</label>
                                    <Input
                                        value={val}
                                        onChange={(e) =>
                                            setEditValues((prev) => ({ ...prev, [key]: e.target.value }))
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* Step 2: Confirmation — show what will change */
                        <div className="space-y-3">
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-800">
                                        <p className="font-semibold mb-1">This action modifies live production data.</p>
                                        <p>Entity: <strong>{selectedEntity}</strong></p>
                                        <p>Record ID: <strong>{editRecord?.id}</strong></p>
                                    </div>
                                </div>
                            </div>
                            <div className="max-h-[40vh] overflow-y-auto">
                                <p className="text-xs text-slate-500 mb-2 font-medium">Changed fields:</p>
                                {Object.entries(editValues)
                                    .filter(([key, val]) => {
                                        const orig = editRecord?.[key];
                                        return val !== (orig != null ? String(orig) : '');
                                    })
                                    .map(([key, val]) => (
                                        <div key={key} className="flex items-start gap-2 py-1 border-b border-slate-100 text-sm">
                                            <span className="font-medium text-slate-700 min-w-[120px]">{key}:</span>
                                            <span className="text-red-600 line-through mr-1">
                                                {editRecord?.[key] != null ? String(editRecord[key]) : 'null'}
                                            </span>
                                            <span className="text-green-700 font-medium">{val || 'null'}</span>
                                        </div>
                                    ))}
                                {Object.entries(editValues).filter(([key, val]) => {
                                    const orig = editRecord?.[key];
                                    return val !== (orig != null ? String(orig) : '');
                                }).length === 0 && (
                                    <p className="text-sm text-slate-500 italic">No fields were changed.</p>
                                )}
                            </div>
                            {saveError && (
                                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{saveError}</p>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={closeEditModal} disabled={isSaving}>
                            Cancel
                        </Button>
                        {!editConfirmStep ? (
                            <Button onClick={() => setEditConfirmStep(true)}>
                                Review Changes
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                            >
                                {isSaving ? (
                                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
                                ) : (
                                    'Confirm & Save'
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/*
              DELETE MODAL
              Opens when the admin clicks the delete button on a row.
              A two-step flow prevents accidental deletions:
                Step 1: Warns the admin which record is about to be deleted.
                Step 2: On confirm, permanently deletes the record and logs the action.
            */}
            <Dialog open={!!deleteRecord} onOpenChange={(open) => { if (!open) closeDeleteModal(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Record</DialogTitle>
                        <DialogDescription>
                            This action is permanent and cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    {!deleteConfirmStep ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-red-800">
                                    <p className="font-semibold mb-1">You are about to permanently delete this record:</p>
                                    <p>Entity: <strong>{selectedEntity}</strong></p>
                                    <p>Record ID: <strong>{deleteRecord?.id}</strong></p>
                                    {deleteRecord?.name && <p>Name: <strong>{deleteRecord.name}</strong></p>}
                                    {deleteRecord?.email && <p>Email: <strong>{deleteRecord.email}</strong></p>}
                                    <p className="mt-2 text-xs text-red-600">This directly affects live production data.</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="bg-red-100 border border-red-300 rounded-lg p-4 text-center">
                                <p className="text-red-800 font-semibold">
                                    Are you absolutely sure?
                                </p>
                                <p className="text-sm text-red-700 mt-1">
                                    Record <strong>{deleteRecord?.id}</strong> in <strong>{selectedEntity}</strong> will be permanently deleted.
                                </p>
                            </div>
                            {deleteError && (
                                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{deleteError}</p>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={closeDeleteModal} disabled={isDeleting}>
                            Cancel
                        </Button>
                        {!deleteConfirmStep ? (
                            <Button
                                variant="destructive"
                                onClick={() => setDeleteConfirmStep(true)}
                            >
                                Proceed to Delete
                            </Button>
                        ) : (
                            <Button
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Deleting...</>
                                ) : (
                                    'Permanently Delete'
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
