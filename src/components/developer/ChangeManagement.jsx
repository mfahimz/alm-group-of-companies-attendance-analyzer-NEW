/**
 * ChangeManagement.jsx — Developer Module: Change Management Section
 *
 * PURPOSE:
 * Provides a structured interface for tracking all development changes made
 * to this application. Every feature, bug fix, configuration change, data
 * fix, and rollback is recorded in the DeveloperChangeLog entity.
 *
 * THE DEVELOPERCHANGELOG ENTITY IS THE SOURCE OF TRUTH:
 * This entity is the single authoritative record of all development activity
 * in this application. Unlike commit messages or PR descriptions which may
 * be scattered across version control, this entity lives alongside the
 * production data and can be queried, filtered, and exported from within
 * the application itself. It provides a permanent, auditable trail of what
 * was changed, when, by whom, and why — accessible to any admin without
 * needing access to external tools.
 *
 * WHY AUDIT LOGGING IS REQUIRED ON EVERY CREATE, EDIT, AND DELETE:
 * Even though DeveloperChangeLog is itself a tracking entity, mutations to
 * it must still be logged via logAudit for two reasons:
 * 1. Accountability — who created/edited/deleted a change log entry
 * 2. Tamper detection — if a change log entry is modified or deleted,
 *    the audit log preserves the original state
 *
 * WHY CONFIRMATION STEPS ARE REQUIRED BEFORE DELETE:
 * Deleting a change log entry permanently removes a historical record.
 * The confirmation step ensures the admin explicitly acknowledges this
 * before the record is removed.
 *
 * This component is scoped exclusively to the Developer Module page.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
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
    GitCompareArrows,
    Plus,
    Eye,
    Pencil,
    Trash2,
    Loader2,
    AlertTriangle,
    Inbox,
    Search,
} from 'lucide-react';

/** Change type options — must match the DeveloperChangeLog entity schema. */
const CHANGE_TYPES = ['Feature', 'Bug Fix', 'Configuration', 'Data Fix', 'Rollback'];

/** Status options — must match the DeveloperChangeLog entity schema. */
const STATUSES = ['Planned', 'In Progress', 'Completed', 'Rolled Back'];

/** Badge color mapping for change types. */
const TYPE_COLORS = {
    'Feature': 'bg-blue-100 text-blue-800',
    'Bug Fix': 'bg-red-100 text-red-800',
    'Configuration': 'bg-purple-100 text-purple-800',
    'Data Fix': 'bg-amber-100 text-amber-800',
    'Rollback': 'bg-slate-100 text-slate-800',
};

/** Badge color mapping for statuses. */
const STATUS_COLORS = {
    'Planned': 'bg-slate-100 text-slate-700',
    'In Progress': 'bg-blue-100 text-blue-700',
    'Completed': 'bg-green-100 text-green-700',
    'Rolled Back': 'bg-red-100 text-red-700',
};

export default function ChangeManagement() {
    const { user } = usePermissions();

    // --- Data state ---
    const [records, setRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);

    // Filter state
    const [filterType, setFilterType] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterKeyword, setFilterKeyword] = useState('');

    // Create/Edit modal state
    const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | 'view'
    const [modalRecord, setModalRecord] = useState(null);
    const [formValues, setFormValues] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    // Delete modal state
    const [deleteRecord, setDeleteRecord] = useState(null);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);

    /** Fetch all DeveloperChangeLog records. */
    const fetchRecords = useCallback(async () => {
        setIsLoading(true);
        setFetchError(null);
        try {
            const data = await base44.entities.DeveloperChangeLog.list('-implemented_date', 5000);
            setRecords(data || []);
        } catch (err) {
            console.error('Failed to fetch change log:', err);
            setFetchError(err.message || 'Failed to fetch change log records.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRecords();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Summary counts ---
    const summaryCounts = useMemo(() => {
        const total = records.length;
        const byStatus = {};
        const byType = {};
        STATUSES.forEach((s) => { byStatus[s] = 0; });
        CHANGE_TYPES.forEach((t) => { byType[t] = 0; });
        records.forEach((r) => {
            if (r.status && byStatus[r.status] !== undefined) byStatus[r.status]++;
            if (r.change_type && byType[r.change_type] !== undefined) byType[r.change_type]++;
        });
        return { total, byStatus, byType };
    }, [records]);

    // --- Client-side filtering ---
    const filteredRecords = useMemo(() => {
        return records.filter((r) => {
            if (filterType && r.change_type !== filterType) return false;
            if (filterStatus && r.status !== filterStatus) return false;
            if (filterKeyword.trim()) {
                const lower = filterKeyword.toLowerCase();
                const titleMatch = r.title && String(r.title).toLowerCase().includes(lower);
                const descMatch = r.description && String(r.description).toLowerCase().includes(lower);
                if (!titleMatch && !descMatch) return false;
            }
            return true;
        });
    }, [records, filterType, filterStatus, filterKeyword]);

    // --- Modal helpers ---
    const getEmptyForm = useCallback(() => ({
        title: '',
        change_type: 'Feature',
        status: 'Planned',
        description: '',
        affected_areas: '',
        implemented_by: '',
        implemented_date: '',
        notes: '',
    }), []);

    const openCreateModal = useCallback(() => {
        setModalMode('create');
        setModalRecord(null);
        setFormValues(getEmptyForm());
        setSaveError(null);
    }, [getEmptyForm]);

    const openViewModal = useCallback((record) => {
        setModalMode('view');
        setModalRecord(record);
        setFormValues({});
        setSaveError(null);
    }, []);

    const openEditModal = useCallback((record) => {
        setModalMode('edit');
        setModalRecord(record);
        setFormValues({
            title: record.title || '',
            change_type: record.change_type || 'Feature',
            status: record.status || 'Planned',
            description: record.description || '',
            affected_areas: record.affected_areas || '',
            implemented_by: record.implemented_by || '',
            implemented_date: record.implemented_date || '',
            notes: record.notes || '',
        });
        setSaveError(null);
    }, []);

    const closeModal = useCallback(() => {
        setModalMode(null);
        setModalRecord(null);
        setFormValues({});
        setSaveError(null);
    }, []);

    /** Create or update a change log entry with audit logging. */
    const handleSave = useCallback(async () => {
        if (!formValues.title?.trim()) {
            setSaveError('Title is required.');
            return;
        }
        setIsSaving(true);
        setSaveError(null);

        try {
            if (modalMode === 'create') {
                // Auto-set created_by and created_at
                const payload = {
                    ...formValues,
                    created_by: user?.email || 'unknown',
                    created_at: new Date().toISOString(),
                };

                const created = await base44.entities.DeveloperChangeLog.create(payload);

                /**
                 * AUDIT LOG — Required for every create operation.
                 * Records the new entry so changes to the change log itself are traceable.
                 */
                try {
                    await base44.functions.invoke('logAudit', {
                        action_type: 'create',
                        entity_name: 'DeveloperChangeLog',
                        entity_id: String(created?.id || ''),
                        changes: JSON.stringify({ new: payload }),
                        context: `DevModule ChangeManagement: Created change log entry "${formValues.title}"`,
                    });
                } catch (auditErr) {
                    console.error('Audit log failed (create):', auditErr);
                }
            } else if (modalMode === 'edit' && modalRecord) {
                // Compute changes for audit
                const oldValues = {};
                const newValues = {};
                const updatePayload = {};

                Object.entries(formValues).forEach(([key, val]) => {
                    const original = modalRecord[key];
                    const origStr = original != null ? String(original) : '';
                    if (val !== origStr) {
                        updatePayload[key] = val || null;
                        oldValues[key] = original;
                        newValues[key] = val || null;
                    }
                });

                if (Object.keys(updatePayload).length > 0) {
                    await base44.entities.DeveloperChangeLog.update(modalRecord.id, updatePayload);

                    /**
                     * AUDIT LOG — Required for every edit operation.
                     * Records old and new values so edits to the change log are traceable.
                     */
                    try {
                        await base44.functions.invoke('logAudit', {
                            action_type: 'update',
                            entity_name: 'DeveloperChangeLog',
                            entity_id: String(modalRecord.id),
                            changes: JSON.stringify({ old: oldValues, new: newValues }),
                            context: `DevModule ChangeManagement: Edited change log entry "${formValues.title}"`,
                        });
                    } catch (auditErr) {
                        console.error('Audit log failed (edit):', auditErr);
                    }
                }
            }

            await fetchRecords();
            closeModal();
        } catch (err) {
            console.error('Save failed:', err);
            setSaveError(err.message || 'Failed to save.');
        } finally {
            setIsSaving(false);
        }
    }, [modalMode, modalRecord, formValues, user, fetchRecords, closeModal]);

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
     * Delete a change log entry with confirmation and audit logging.
     *
     * CONFIRMATION IS REQUIRED because deleting a change log entry
     * permanently removes a historical development record.
     *
     * AUDIT LOGGING records the deleted entry so it can be reconstructed
     * if the deletion was unintended.
     */
    const handleDelete = useCallback(async () => {
        if (!deleteRecord) return;
        setIsDeleting(true);
        setDeleteError(null);

        try {
            await base44.entities.DeveloperChangeLog.delete(deleteRecord.id);

            /**
             * AUDIT LOG — Required for every delete operation.
             * Records the full deleted record for accountability.
             */
            try {
                await base44.functions.invoke('logAudit', {
                    action_type: 'delete',
                    entity_name: 'DeveloperChangeLog',
                    entity_id: String(deleteRecord.id),
                    changes: JSON.stringify({ deleted_record: deleteRecord }),
                    context: `DevModule ChangeManagement: Deleted change log entry "${deleteRecord.title}"`,
                });
            } catch (auditErr) {
                console.error('Audit log failed (delete):', auditErr);
            }

            await fetchRecords();
            closeDeleteModal();
        } catch (err) {
            console.error('Delete failed:', err);
            setDeleteError(err.message || 'Failed to delete.');
        } finally {
            setIsDeleting(false);
        }
    }, [deleteRecord, fetchRecords, closeDeleteModal]);

    // --- Render ---
    return (
        <div className="space-y-6">
            {/* Summary counts — total and grouped by status and type */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Total</p>
                    <p className="text-xl font-bold text-slate-800">{summaryCounts.total}</p>
                </div>
                {STATUSES.map((s) => (
                    <div key={s} className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">{s}</p>
                        <p className="text-xl font-bold text-slate-800">{summaryCounts.byStatus[s]}</p>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {CHANGE_TYPES.map((t) => (
                    <div key={t} className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">{t}</p>
                        <p className="text-lg font-bold text-slate-800">{summaryCounts.byType[t]}</p>
                    </div>
                ))}
            </div>

            {/* Filter controls and New Entry button */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end justify-between">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="w-44">
                        <label className="block text-xs text-slate-500 mb-1">Change Type</label>
                        <Select value={filterType} onValueChange={(v) => setFilterType(v === '__all__' ? '' : v)}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All types</SelectItem>
                                {CHANGE_TYPES.map((t) => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="w-44">
                        <label className="block text-xs text-slate-500 mb-1">Status</label>
                        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === '__all__' ? '' : v)}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All statuses</SelectItem>
                                {STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="w-64">
                        <label className="block text-xs text-slate-500 mb-1">Keyword</label>
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <Input
                                placeholder="Search title or description..."
                                value={filterKeyword}
                                onChange={(e) => setFilterKeyword(e.target.value)}
                                className="h-8 text-xs pl-7"
                            />
                        </div>
                    </div>
                </div>
                <Button size="sm" onClick={openCreateModal}>
                    <Plus className="w-4 h-4 mr-1" />
                    New Entry
                </Button>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-slate-200">
                    <Loader2 className="w-8 h-8 text-slate-500 animate-spin mb-3" />
                    <p className="text-slate-500 text-sm">Loading change log...</p>
                </div>
            )}

            {/* Error state */}
            {fetchError && !isLoading && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-red-200">
                    <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                    <p className="text-red-600 font-medium mb-1">Failed to load change log</p>
                    <p className="text-red-500 text-sm">{fetchError}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={fetchRecords}>Retry</Button>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && !fetchError && records.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-slate-200">
                    <Inbox className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-slate-600 font-medium mb-1">No change log entries</p>
                    <p className="text-slate-500 text-sm">Click "New Entry" to create the first one.</p>
                </div>
            )}

            {/* Records table */}
            {!isLoading && !fetchError && filteredRecords.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Title</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Type</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Affected Areas</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Implemented By</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map((rec, idx) => (
                                    <tr
                                        key={rec.id || idx}
                                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                                    >
                                        <td className="px-3 py-2 text-slate-800 font-medium max-w-[250px] truncate">
                                            {rec.title || '—'}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', TYPE_COLORS[rec.change_type] || '')}>
                                                {rec.change_type || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLORS[rec.status] || '')}>
                                                {rec.status || '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 text-xs max-w-[200px] truncate">
                                            {rec.affected_areas || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 text-xs whitespace-nowrap">
                                            {rec.implemented_by || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 text-xs whitespace-nowrap">
                                            {rec.implemented_date || '—'}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => openViewModal(rec)}
                                                    className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="View details"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => openEditModal(rec)}
                                                    className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Edit entry"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => openDeleteModal(rec)}
                                                    className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    title="Delete entry"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* No results after filtering */}
            {!isLoading && !fetchError && records.length > 0 && filteredRecords.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[200px] bg-white rounded-xl border border-slate-200">
                    <Inbox className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-slate-500 text-sm">No entries match the current filters.</p>
                </div>
            )}

            {/*
              CREATE / EDIT / VIEW MODAL
              - Create: empty form, created_by and created_at auto-set on save
              - Edit: pre-filled form, changes computed for audit log
              - View: read-only display of all fields
            */}
            <Dialog open={modalMode !== null} onOpenChange={(open) => { if (!open) closeModal(); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {modalMode === 'create' && 'New Change Log Entry'}
                            {modalMode === 'edit' && 'Edit Change Log Entry'}
                            {modalMode === 'view' && 'Change Log Entry Details'}
                        </DialogTitle>
                        <DialogDescription>
                            {modalMode === 'view'
                                ? 'Read-only view of all fields.'
                                : 'All fields except Created By and Created At are editable.'}
                        </DialogDescription>
                    </DialogHeader>

                    {modalMode === 'view' ? (
                        /* Read-only view */
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                            {modalRecord && Object.entries(modalRecord).map(([key, val]) => (
                                <div key={key}>
                                    <p className="text-xs font-medium text-slate-500">{key}</p>
                                    <p className="text-sm text-slate-800 mt-0.5 break-all">
                                        {val != null ? String(val) : <span className="text-slate-300 italic">null</span>}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* Create/Edit form */
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Title *</label>
                                <Input
                                    value={formValues.title || ''}
                                    onChange={(e) => setFormValues((p) => ({ ...p, title: e.target.value }))}
                                    placeholder="Short title for the change"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Change Type *</label>
                                    <Select
                                        value={formValues.change_type || 'Feature'}
                                        onValueChange={(v) => setFormValues((p) => ({ ...p, change_type: v }))}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CHANGE_TYPES.map((t) => (
                                                <SelectItem key={t} value={t}>{t}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Status *</label>
                                    <Select
                                        value={formValues.status || 'Planned'}
                                        onValueChange={(v) => setFormValues((p) => ({ ...p, status: v }))}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {STATUSES.map((s) => (
                                                <SelectItem key={s} value={s}>{s}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                                <textarea
                                    value={formValues.description || ''}
                                    onChange={(e) => setFormValues((p) => ({ ...p, description: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-md p-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                                    placeholder="Describe the change in detail..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Affected Areas</label>
                                <Input
                                    value={formValues.affected_areas || ''}
                                    onChange={(e) => setFormValues((p) => ({ ...p, affected_areas: e.target.value }))}
                                    placeholder="e.g. Payroll, Employee Sync, Reports"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Implemented By</label>
                                    <Input
                                        value={formValues.implemented_by || ''}
                                        onChange={(e) => setFormValues((p) => ({ ...p, implemented_by: e.target.value }))}
                                        placeholder="Name or email"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Implemented Date</label>
                                    <Input
                                        type="date"
                                        value={formValues.implemented_date || ''}
                                        onChange={(e) => setFormValues((p) => ({ ...p, implemented_date: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                                <textarea
                                    value={formValues.notes || ''}
                                    onChange={(e) => setFormValues((p) => ({ ...p, notes: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-md p-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                                    placeholder="Additional notes..."
                                />
                            </div>
                            {/* Created By and Created At are auto-set — shown as info only */}
                            {modalMode === 'edit' && modalRecord && (
                                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
                                    <p>Created by: {modalRecord.created_by || '—'}</p>
                                    <p>Created at: {modalRecord.created_at ? new Date(modalRecord.created_at).toLocaleString() : '—'}</p>
                                </div>
                            )}
                            {saveError && (
                                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{saveError}</p>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} disabled={isSaving}>
                            {modalMode === 'view' ? 'Close' : 'Cancel'}
                        </Button>
                        {modalMode !== 'view' && (
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving ? (
                                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
                                ) : (
                                    modalMode === 'create' ? 'Create Entry' : 'Save Changes'
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/*
              DELETE MODAL
              Requires a confirmation step before permanently deleting a
              change log entry. Audit logging records the deleted entry.
            */}
            <Dialog open={!!deleteRecord} onOpenChange={(open) => { if (!open) closeDeleteModal(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Change Log Entry</DialogTitle>
                        <DialogDescription>This action is permanent and cannot be undone.</DialogDescription>
                    </DialogHeader>

                    {!deleteConfirmStep ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-red-800">
                                    <p className="font-semibold mb-1">You are about to permanently delete:</p>
                                    <p>Title: <strong>{deleteRecord?.title}</strong></p>
                                    <p>Type: <strong>{deleteRecord?.change_type}</strong></p>
                                    <p>ID: <strong>{deleteRecord?.id}</strong></p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="bg-red-100 border border-red-300 rounded-lg p-4 text-center">
                                <p className="text-red-800 font-semibold">Are you absolutely sure?</p>
                                <p className="text-sm text-red-700 mt-1">
                                    "{deleteRecord?.title}" will be permanently deleted.
                                </p>
                            </div>
                            {deleteError && (
                                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{deleteError}</p>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={closeDeleteModal} disabled={isDeleting}>Cancel</Button>
                        {!deleteConfirmStep ? (
                            <Button variant="destructive" onClick={() => setDeleteConfirmStep(true)}>
                                Proceed to Delete
                            </Button>
                        ) : (
                            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
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
