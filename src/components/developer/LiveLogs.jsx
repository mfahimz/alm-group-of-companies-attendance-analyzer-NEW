/**
 * LiveLogs.jsx — Developer Module: Live Logs Section
 *
 * PURPOSE:
 * Displays a live, filterable, and exportable view of all AuditLog records.
 * This is the primary tool for admins to monitor what changes are happening
 * in the system in near-real-time.
 *
 * AUTO-REFRESH:
 * The component sets up a setInterval timer on mount that re-fetches audit
 * log records every 10 seconds. This timer MUST be cleaned up on unmount
 * via the useEffect cleanup return function to prevent:
 *   - Memory leaks from orphaned intervals
 *   - Stale state updates on unmounted components
 *   - Unnecessary network requests when the user navigates away
 *
 * FILTERING:
 * All filtering is applied client-side after fetching the full dataset.
 * Filters include: user email, action type, entity name, date range
 * (from/to), and a keyword search across record ID, old values, and
 * new values simultaneously.
 *
 * EXPORT:
 * The export button generates a CSV spreadsheet file containing ONLY the
 * currently filtered and displayed records with all columns. This ensures
 * admins can extract exactly the subset of logs they need.
 *
 * This component is scoped exclusively to the Developer Module page.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    ScrollText,
    Search,
    Download,
    RefreshCw,
    Loader2,
    AlertTriangle,
    Inbox,
} from 'lucide-react';

/** Auto-refresh interval in milliseconds. */
const REFRESH_INTERVAL_MS = 10000;

export default function LiveLogs() {
    const [records, setRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Filter state
    const [filterUser, setFilterUser] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterEntity, setFilterEntity] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterKeyword, setFilterKeyword] = useState('');

    /** Ref to track whether this is the initial load vs an auto-refresh cycle. */
    const isInitialLoad = useRef(true);

    /**
     * Fetch all audit log records sorted by timestamp descending.
     * Called on mount and by the auto-refresh timer.
     */
    const fetchLogs = useCallback(async (isAutoRefresh = false) => {
        if (isAutoRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setFetchError(null);
        try {
            const data = await base44.entities.AuditLog.list('-created_date', 5000);
            setRecords(data || []);
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
            setFetchError(err.message || 'Failed to fetch audit logs.');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
            isInitialLoad.current = false;
        }
    }, []);

    /**
     * AUTO-REFRESH TIMER SETUP AND CLEANUP
     *
     * useEffect sets up a setInterval that re-fetches audit logs every
     * REFRESH_INTERVAL_MS milliseconds. The cleanup function returned by
     * useEffect clears this interval when the component unmounts.
     *
     * WHY CLEANUP IS REQUIRED:
     * Without clearing the interval, it would continue firing after the
     * component is removed from the DOM, causing:
     * 1. Memory leaks — the closure retains references to state setters
     * 2. React warnings — setState on an unmounted component
     * 3. Wasted network requests — fetching data nobody will see
     */
    useEffect(() => {
        // Initial fetch
        fetchLogs(false);

        // Set up auto-refresh interval
        const intervalId = setInterval(() => {
            fetchLogs(true);
        }, REFRESH_INTERVAL_MS);

        // CLEANUP: Clear the interval when the component unmounts.
        // This prevents memory leaks and stale network requests.
        return () => {
            clearInterval(intervalId);
        };
    }, [fetchLogs]);

    // --- Derive unique filter option values from records ---
    const uniqueUsers = useMemo(() => {
        const set = new Set();
        records.forEach((r) => { if (r.user_email) set.add(r.user_email); });
        return Array.from(set).sort();
    }, [records]);

    const uniqueActions = useMemo(() => {
        const set = new Set();
        records.forEach((r) => { if (r.action_type) set.add(r.action_type); });
        return Array.from(set).sort();
    }, [records]);

    const uniqueEntities = useMemo(() => {
        const set = new Set();
        records.forEach((r) => { if (r.entity_name) set.add(r.entity_name); });
        return Array.from(set).sort();
    }, [records]);

    // --- Client-side filtering ---
    const filteredRecords = useMemo(() => {
        return records.filter((r) => {
            // Filter by user email
            if (filterUser && r.user_email !== filterUser) return false;

            // Filter by action type
            if (filterAction && r.action_type !== filterAction) return false;

            // Filter by entity name
            if (filterEntity && r.entity_name !== filterEntity) return false;

            // Filter by date range (using created_date)
            if (filterDateFrom) {
                const recDate = r.created_date ? String(r.created_date).slice(0, 10) : '';
                if (recDate < filterDateFrom) return false;
            }
            if (filterDateTo) {
                const recDate = r.created_date ? String(r.created_date).slice(0, 10) : '';
                if (recDate > filterDateTo) return false;
            }

            // Keyword search across entity_id, changes (old/new values)
            if (filterKeyword.trim()) {
                const lower = filterKeyword.toLowerCase();
                const idMatch = r.entity_id && String(r.entity_id).toLowerCase().includes(lower);
                const changesMatch = r.changes && String(r.changes).toLowerCase().includes(lower);
                const contextMatch = r.context && String(r.context).toLowerCase().includes(lower);
                if (!idMatch && !changesMatch && !contextMatch) return false;
            }

            return true;
        });
    }, [records, filterUser, filterAction, filterEntity, filterDateFrom, filterDateTo, filterKeyword]);

    /**
     * Export currently filtered records to a CSV spreadsheet file.
     * Only exports the records visible after all filters are applied.
     */
    const handleExport = useCallback(() => {
        if (filteredRecords.length === 0) return;

        const columns = ['created_date', 'action_type', 'entity_name', 'entity_id', 'user_email', 'user_role', 'changes', 'context', 'project_id', 'company'];

        // Build CSV content
        const header = columns.join(',');
        const rows = filteredRecords.map((r) =>
            columns.map((col) => {
                const val = r[col];
                if (val == null) return '';
                // Escape double quotes and wrap in quotes
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(',')
        );

        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }, [filteredRecords]);

    /** Clear all filters. */
    const clearFilters = useCallback(() => {
        setFilterUser('');
        setFilterAction('');
        setFilterEntity('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterKeyword('');
    }, []);

    /** Parse changes JSON to extract old and new values for display. */
    const parseChanges = useCallback((changesStr) => {
        if (!changesStr) return { oldVal: '', newVal: '' };
        try {
            const parsed = JSON.parse(changesStr);
            if (parsed.old && parsed.new) {
                return {
                    oldVal: JSON.stringify(parsed.old),
                    newVal: JSON.stringify(parsed.new),
                };
            }
            if (parsed.deleted_record) {
                return { oldVal: JSON.stringify(parsed.deleted_record), newVal: '(deleted)' };
            }
            return { oldVal: changesStr, newVal: '' };
        } catch {
            return { oldVal: changesStr, newVal: '' };
        }
    }, []);

    // --- Render ---
    return (
        <div className="space-y-4">
            {/* Header with record count and refresh indicator */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ScrollText className="w-4 h-4 text-slate-500" />
                    <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                        Audit Logs
                    </h2>
                    {!isLoading && (
                        <Badge variant="outline" className="text-xs">
                            {filteredRecords.length} displayed
                        </Badge>
                    )}
                    {/* Auto-refresh indicator */}
                    {isRefreshing && (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            refreshing...
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={filteredRecords.length === 0}
                    >
                        <Download className="w-4 h-4 mr-1" />
                        Export CSV
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchLogs(false)}
                        disabled={isLoading}
                    >
                        <RefreshCw className={cn("w-4 h-4 mr-1", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filter controls */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Filters</p>
                    <button
                        onClick={clearFilters}
                        className="text-xs text-slate-500 hover:text-slate-700 underline"
                    >
                        Clear all
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* User filter */}
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">User</label>
                        <Select value={filterUser} onValueChange={setFilterUser}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="All users" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All users</SelectItem>
                                {uniqueUsers.map((u) => (
                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Action type filter */}
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Action Type</label>
                        <Select value={filterAction} onValueChange={setFilterAction}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="All actions" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All actions</SelectItem>
                                {uniqueActions.map((a) => (
                                    <SelectItem key={a} value={a}>{a}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Entity name filter */}
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Entity Name</label>
                        <Select value={filterEntity} onValueChange={setFilterEntity}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="All entities" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All entities</SelectItem>
                                {uniqueEntities.map((e) => (
                                    <SelectItem key={e} value={e}>{e}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date from */}
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Date From</label>
                        <Input
                            type="date"
                            value={filterDateFrom}
                            onChange={(e) => setFilterDateFrom(e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>

                    {/* Date to */}
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Date To</label>
                        <Input
                            type="date"
                            value={filterDateTo}
                            onChange={(e) => setFilterDateTo(e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>

                    {/* Keyword search */}
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Keyword (ID / values)</label>
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <Input
                                placeholder="Search ID, old/new values..."
                                value={filterKeyword}
                                onChange={(e) => setFilterKeyword(e.target.value)}
                                className="h-8 text-xs pl-7"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Initial loading state */}
            {isLoading && isInitialLoad.current && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-slate-200">
                    <Loader2 className="w-8 h-8 text-slate-500 animate-spin mb-3" />
                    <p className="text-slate-500 text-sm">Loading audit logs...</p>
                </div>
            )}

            {/* Error state */}
            {fetchError && !isLoading && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-red-200">
                    <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                    <p className="text-red-600 font-medium mb-1">Failed to load audit logs</p>
                    <p className="text-red-500 text-sm max-w-md text-center">{fetchError}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchLogs(false)}>
                        Retry
                    </Button>
                </div>
            )}

            {/* Empty state — no records match filters */}
            {!isLoading && !fetchError && filteredRecords.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-white rounded-xl border border-slate-200">
                    <Inbox className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-slate-600 font-medium mb-1">No audit log entries found</p>
                    <p className="text-slate-500 text-sm">
                        {records.length > 0
                            ? 'No records match the current filters. Try adjusting your filters.'
                            : 'No audit log entries exist yet.'}
                    </p>
                </div>
            )}

            {/* Logs table */}
            {!isLoading && !fetchError && filteredRecords.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Timestamp</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Entity</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Record ID</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">User</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Old Value</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">New Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map((rec, idx) => {
                                    const { oldVal, newVal } = parseChanges(rec.changes);
                                    return (
                                        <tr
                                            key={rec.id || idx}
                                            className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                                        >
                                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap text-xs">
                                                {rec.created_date
                                                    ? new Date(rec.created_date).toLocaleString()
                                                    : '—'}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <Badge
                                                    variant={rec.action_type === 'delete' ? 'destructive' : 'secondary'}
                                                    className="text-xs"
                                                >
                                                    {rec.action_type || '—'}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap text-xs font-medium">
                                                {rec.entity_name || '—'}
                                            </td>
                                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap text-xs font-mono">
                                                {rec.entity_id || '—'}
                                            </td>
                                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap text-xs">
                                                {rec.user_email || '—'}
                                            </td>
                                            <td className="px-3 py-2 text-red-600 text-xs max-w-[200px] truncate font-mono" title={oldVal}>
                                                {oldVal || '—'}
                                            </td>
                                            <td className="px-3 py-2 text-green-700 text-xs max-w-[200px] truncate font-mono" title={newVal}>
                                                {newVal || '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
