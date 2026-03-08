/**
 * ChangeHistory.jsx — Developer Module: Change History Section
 *
 * PURPOSE:
 * Allows admins to look up the complete audit trail for a specific record
 * in a specific entity. This is the primary tool for answering the question:
 * "What happened to record X in entity Y, and who did it?"
 *
 * FIELD-LEVEL DIFF LOGIC:
 * Each AuditLog entry stores a `changes` field as a JSON string. This
 * component parses that JSON and compares old vs new values field by field:
 *
 *   - If a field exists in `new` but not in `old`, it is marked as ADDED
 *     (shown in green) — this means a new field was set for the first time.
 *
 *   - If a field exists in `old` but not in `new`, it is marked as REMOVED
 *     (shown in red) — this means the field was cleared or deleted.
 *
 *   - If a field exists in both `old` and `new` with different values, the
 *     old value is shown in red (strikethrough) and the new value in green.
 *
 *   - If a field exists in both with the same value, it is not shown in the
 *     diff because it did not change.
 *
 * This field-level breakdown makes it easy to see exactly what changed in
 * each audit log entry rather than having to manually compare raw JSON.
 *
 * TIMELINE ORDERING:
 * Results are displayed chronologically from oldest to newest so the admin
 * can follow the full history of a record from creation to current state.
 *
 * This component is scoped exclusively to the Developer Module page.
 */

import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
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
    History,
    Search,
    Loader2,
    Inbox,
    AlertTriangle,
    Plus,
    Minus,
    ArrowRight,
    User,
    Clock,
} from 'lucide-react';

/**
 * Complete list of all entities in the application.
 * Used for the entity name dropdown.
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

export default function ChangeHistory() {
    // --- Search state ---
    const [selectedEntity, setSelectedEntity] = useState('');
    const [recordId, setRecordId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [searchPerformed, setSearchPerformed] = useState(false);

    // --- Timeline data ---
    const [timelineEntries, setTimelineEntries] = useState([]);

    /**
     * Fetch audit log entries for a specific entity and record ID.
     * Filters AuditLog records by entity_name and entity_id, then sorts
     * chronologically (oldest first) to create a timeline.
     */
    const loadHistory = useCallback(async () => {
        if (!selectedEntity || !recordId.trim()) return;
        setIsLoading(true);
        setFetchError(null);
        setSearchPerformed(true);
        setTimelineEntries([]);

        try {
            const allLogs = await base44.entities.AuditLog.filter(
                { entity_name: selectedEntity, entity_id: recordId.trim() },
                'created_date',
                5000
            );
            setTimelineEntries(allLogs || []);
        } catch (err) {
            console.error('Failed to fetch change history:', err);
            setFetchError(err.message || 'Failed to fetch change history.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedEntity, recordId]);

    // --- Render ---
    return (
        <div className="space-y-6">
            {/* Search controls — entity dropdown, record ID input, and load button */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="w-full sm:w-64">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Entity Name</label>
                    <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select entity..." />
                        </SelectTrigger>
                        <SelectContent>
                            {ALL_ENTITIES.map((name) => (
                                <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-full sm:w-64">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Record ID</label>
                    <Input
                        placeholder="Enter record ID..."
                        value={recordId}
                        onChange={(e) => setRecordId(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') loadHistory(); }}
                        className="font-mono"
                    />
                </div>
                <Button
                    onClick={loadHistory}
                    disabled={isLoading || !selectedEntity || !recordId.trim()}
                >
                    {isLoading ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</>
                    ) : (
                        <><Search className="w-4 h-4 mr-2" /> Load History</>
                    )}
                </Button>
            </div>

            {/* Initial state — no search performed */}
            {!searchPerformed && (
                <div className="flex flex-col items-center justify-center min-h-[350px] border-2 border-dashed border-slate-300 rounded-xl bg-white">
                    <History className="w-12 h-12 text-slate-400 mb-4" />
                    <p className="text-slate-500 text-sm">Select an entity and enter a record ID to view its change history.</p>
                </div>
            )}

            {/* Loading state */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-slate-200">
                    <Loader2 className="w-8 h-8 text-slate-500 animate-spin mb-3" />
                    <p className="text-slate-500 text-sm">Loading change history...</p>
                </div>
            )}

            {/* Error state */}
            {fetchError && !isLoading && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-red-200">
                    <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                    <p className="text-red-600 font-medium mb-1">Failed to load history</p>
                    <p className="text-red-500 text-sm max-w-md text-center">{fetchError}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={loadHistory}>
                        Retry
                    </Button>
                </div>
            )}

            {/* Empty state — search performed but no history found */}
            {searchPerformed && !isLoading && !fetchError && timelineEntries.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-slate-200">
                    <Inbox className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-slate-600 font-medium mb-1">No change history found</p>
                    <p className="text-slate-500 text-sm">
                        No audit log entries exist for <strong>{selectedEntity}</strong> record <strong>{recordId}</strong>.
                    </p>
                </div>
            )}

            {/* Timeline */}
            {searchPerformed && !isLoading && !fetchError && timelineEntries.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{selectedEntity}</Badge>
                        <span className="text-xs text-slate-400">Record: {recordId}</span>
                        <Badge variant="secondary" className="text-xs">{timelineEntries.length} entries</Badge>
                    </div>

                    {/*
                      CHRONOLOGICAL TIMELINE
                      Ordered from oldest to newest so the admin can follow
                      the complete history of changes to this record.
                    */}
                    <div className="relative">
                        {/* Vertical timeline line */}
                        <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200" />

                        <div className="space-y-4">
                            {timelineEntries.map((entry, idx) => (
                                <TimelineEntry key={entry.id || idx} entry={entry} index={idx} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * TimelineEntry — renders a single audit log entry in the timeline.
 *
 * Parses the `changes` JSON string and produces a field-by-field diff:
 *   - ADDED fields (in new but not old): shown with green "+" indicator
 *   - REMOVED fields (in old but not new): shown with red "-" indicator
 *   - CHANGED fields (different values): old in red, new in green
 *   - UNCHANGED fields: not shown (they didn't change)
 */
function TimelineEntry({ entry, index }) {
    const { action_type, user_email, created_date, changes, context } = entry;

    /**
     * FIELD-LEVEL DIFF LOGIC
     *
     * Parse the changes JSON to extract old and new value objects.
     * The logAudit function stores changes as:
     *   { old: { field1: val1, ... }, new: { field1: val2, ... } }
     * or for deletes:
     *   { deleted_record: { ... } }
     *
     * We compare each field between old and new to determine what
     * was added, removed, or modified.
     */
    const diffFields = (() => {
        if (!changes) return [];
        try {
            const parsed = JSON.parse(changes);

            // Handle delete case — show all fields as removed
            if (parsed.deleted_record) {
                return Object.entries(parsed.deleted_record).map(([key, val]) => ({
                    field: key,
                    type: 'removed',
                    oldVal: val,
                    newVal: null,
                }));
            }

            const oldObj = parsed.old || {};
            const newObj = parsed.new || {};
            const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
            const diffs = [];

            allKeys.forEach((key) => {
                const hasOld = key in oldObj;
                const hasNew = key in newObj;
                const oldVal = oldObj[key];
                const newVal = newObj[key];

                if (hasNew && !hasOld) {
                    // Field was ADDED — exists in new but not old
                    diffs.push({ field: key, type: 'added', oldVal: null, newVal });
                } else if (hasOld && !hasNew) {
                    // Field was REMOVED — exists in old but not new
                    diffs.push({ field: key, type: 'removed', oldVal, newVal: null });
                } else if (String(oldVal) !== String(newVal)) {
                    // Field was CHANGED — different values
                    diffs.push({ field: key, type: 'changed', oldVal, newVal });
                }
                // If values are the same, skip — it didn't change
            });

            return diffs;
        } catch {
            // If JSON parsing fails, show raw changes
            return [{ field: '(raw)', type: 'changed', oldVal: changes, newVal: '' }];
        }
    })();

    const timestamp = created_date ? new Date(created_date).toLocaleString() : '—';

    return (
        <div className="relative pl-12">
            {/* Timeline dot */}
            <div className={cn(
                'absolute left-3.5 w-3 h-3 rounded-full border-2 bg-white',
                action_type === 'delete' ? 'border-red-500' :
                action_type === 'create' ? 'border-green-500' :
                'border-blue-500'
            )} />

            <div className="bg-white border border-slate-200 rounded-lg p-4">
                {/* Entry header — timestamp, user, action */}
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        {timestamp}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                        <User className="w-3.5 h-3.5" />
                        {user_email || 'unknown'}
                    </div>
                    <Badge
                        variant={action_type === 'delete' ? 'destructive' : 'secondary'}
                        className="text-xs"
                    >
                        {action_type || 'unknown'}
                    </Badge>
                    {context && (
                        <span className="text-xs text-slate-400 truncate max-w-[200px]" title={context}>
                            {context}
                        </span>
                    )}
                </div>

                {/* Field-by-field diff */}
                {diffFields.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No field-level changes recorded.</p>
                ) : (
                    <div className="space-y-1.5">
                        {diffFields.map((diff, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                                {/* Diff type indicator */}
                                {diff.type === 'added' && (
                                    <Plus className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                                )}
                                {diff.type === 'removed' && (
                                    <Minus className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                                )}
                                {diff.type === 'changed' && (
                                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                                )}

                                {/* Field name */}
                                <span className="font-medium text-slate-600 min-w-[80px] shrink-0">
                                    {diff.field}
                                </span>

                                {/* Values */}
                                <div className="flex items-start gap-1 flex-wrap">
                                    {diff.type === 'added' && (
                                        /* Added: show new value in green */
                                        <span className="text-green-700 font-mono break-all">
                                            {diff.newVal != null ? String(diff.newVal) : 'null'}
                                        </span>
                                    )}
                                    {diff.type === 'removed' && (
                                        /* Removed: show old value in red with strikethrough */
                                        <span className="text-red-600 line-through font-mono break-all">
                                            {diff.oldVal != null ? String(diff.oldVal) : 'null'}
                                        </span>
                                    )}
                                    {diff.type === 'changed' && (
                                        <>
                                            {/* Changed: old in red, arrow, new in green */}
                                            <span className="text-red-600 line-through font-mono break-all">
                                                {diff.oldVal != null ? String(diff.oldVal) : 'null'}
                                            </span>
                                            <span className="text-slate-400 mx-1">&rarr;</span>
                                            <span className="text-green-700 font-mono break-all">
                                                {diff.newVal != null ? String(diff.newVal) : 'null'}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
