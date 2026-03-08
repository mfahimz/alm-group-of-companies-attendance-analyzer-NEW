/**
 * EmployeeInspector.jsx — Developer Module: Employee Inspector Section
 *
 * PURPOSE:
 * This component is a diagnostic tool that lets admin users look up a single
 * employee and immediately see all of their related data across every linked
 * entity in one place. Unlike the Entity Explorer, which browses one entity
 * at a time, the Employee Inspector cross-references multiple entities to
 * build a complete picture of a single employee's data footprint.
 *
 * WHY ALL PANELS ARE SHOWN EVEN WHEN EMPTY:
 * Every panel is always rendered, even when it contains no records, because
 * the absence of data is itself diagnostic information. For example, an
 * employee with no EmployeeSalary record may indicate a sync issue. Hiding
 * empty panels would mask these gaps and defeat the diagnostic purpose.
 *
 * WHY CONFIRMATION STEPS ARE REQUIRED BEFORE EVERY EDIT:
 * Edits made here bypass all normal application workflows and write directly
 * to live production data. The confirmation step forces the admin to see
 * exactly which entity, which record, and which fields will be changed.
 *
 * WHY AUDIT LOGGING IS CALLED ON EVERY EDIT:
 * Every mutation must be logged so that changes can be traced back to the
 * admin who made them. The logAudit function records the action type, entity,
 * record ID, old values, new values, and context for full traceability.
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Search,
    ChevronDown,
    ChevronRight,
    Pencil,
    Loader2,
    AlertTriangle,
    Inbox,
    UserSearch,
    User,
    DollarSign,
    TrendingUp,
    BarChart3,
    Camera,
    Clock,
    Users,
    AlertCircle,
    Timer,
} from 'lucide-react';

/**
 * Panel configuration — defines every related entity panel to display.
 * Each panel specifies how to fetch records for a given employee, the
 * entity name for audit logging, and display metadata.
 *
 * The fetch function receives the full employee record and must return
 * an array of records. Panels with limit specify how many records to
 * show (sorted by date descending).
 */
const PANEL_DEFINITIONS = [
    {
        key: 'employee',
        label: 'Employee Record',
        icon: User,
        entityName: 'Employee',
        /** Core employee record — the record itself is already fetched. */
        fetch: async (emp) => [emp],
        limit: null,
    },
    {
        key: 'salary',
        label: 'Employee Salary',
        icon: DollarSign,
        entityName: 'EmployeeSalary',
        /**
         * EmployeeSalary links via employee_id matching Employee.hrms_id,
         * or via attendance_id matching Employee.attendance_id.
         */
        fetch: async (emp) => {
            const results = [];
            if (emp.hrms_id) {
                const byHrms = await base44.entities.EmployeeSalary.filter(
                    { employee_id: String(emp.hrms_id) }, null, 100
                );
                results.push(...byHrms);
            }
            if (emp.attendance_id && results.length === 0) {
                const byAtt = await base44.entities.EmployeeSalary.filter(
                    { attendance_id: String(emp.attendance_id) }, null, 100
                );
                results.push(...byAtt);
            }
            return results;
        },
        limit: null,
    },
    {
        key: 'salary_increments',
        label: 'Salary Increments (last 5)',
        icon: TrendingUp,
        entityName: 'SalaryIncrement',
        /** SalaryIncrement links via employee_id matching Employee.hrms_id. */
        fetch: async (emp) => {
            if (!emp.hrms_id) return [];
            const all = await base44.entities.SalaryIncrement.filter(
                { employee_id: String(emp.hrms_id) }, '-created_date', 100
            );
            return all.slice(0, 5);
        },
        limit: 5,
    },
    {
        key: 'analysis_results',
        label: 'Analysis Results (last 5)',
        icon: BarChart3,
        entityName: 'AnalysisResult',
        /** AnalysisResult links via attendance_id matching Employee.attendance_id. */
        fetch: async (emp) => {
            if (!emp.attendance_id) return [];
            const all = await base44.entities.AnalysisResult.filter(
                { attendance_id: String(emp.attendance_id) }, '-created_date', 100
            );
            return all.slice(0, 5);
        },
        limit: 5,
    },
    {
        key: 'salary_snapshots',
        label: 'Salary Snapshots (last 5)',
        icon: Camera,
        entityName: 'SalarySnapshot',
        /** SalarySnapshot links via attendance_id matching Employee.attendance_id. */
        fetch: async (emp) => {
            if (!emp.attendance_id) return [];
            const all = await base44.entities.SalarySnapshot.filter(
                { attendance_id: String(emp.attendance_id) }, '-created_date', 100
            );
            return all.slice(0, 5);
        },
        limit: 5,
    },
    {
        key: 'overtime',
        label: 'Overtime Data (last 5)',
        icon: Clock,
        entityName: 'OvertimeData',
        /** OvertimeData links via attendance_id matching Employee.attendance_id. */
        fetch: async (emp) => {
            if (!emp.attendance_id) return [];
            const all = await base44.entities.OvertimeData.filter(
                { attendance_id: String(emp.attendance_id) }, '-created_date', 100
            );
            return all.slice(0, 5);
        },
        limit: 5,
    },
    {
        key: 'quarterly_minutes',
        label: 'Carried Grace Minutes (EmployeeQuarterlyMinutes)',
        icon: Timer,
        entityName: 'EmployeeQuarterlyMinutes',
        /** EmployeeQuarterlyMinutes links via employee_id matching Employee.id. */
        fetch: async (emp) => {
            const all = await base44.entities.EmployeeQuarterlyMinutes.filter(
                { employee_id: emp.id }, '-created_date', 100
            );
            return all;
        },
        limit: null,
    },
    {
        key: 'department_head',
        label: 'Department Head Linkage',
        icon: Users,
        entityName: 'DepartmentHead',
        /** DepartmentHead links via employee_id matching Employee.id or Employee.hrms_id. */
        fetch: async (emp) => {
            let results = await base44.entities.DepartmentHead.filter(
                { employee_id: emp.id }, null, 100
            );
            if (results.length === 0 && emp.hrms_id) {
                results = await base44.entities.DepartmentHead.filter(
                    { employee_id: String(emp.hrms_id) }, null, 100
                );
            }
            return results;
        },
        limit: null,
    },
    {
        key: 'exceptions',
        label: 'Exceptions (last 20)',
        icon: AlertCircle,
        entityName: 'Exception',
        /** Exception links via attendance_id matching Employee.attendance_id. */
        fetch: async (emp) => {
            if (!emp.attendance_id) return [];
            const all = await base44.entities.Exception.filter(
                { attendance_id: String(emp.attendance_id) }, '-created_date', 100
            );
            return all.slice(0, 20);
        },
        limit: 20,
    },
    {
        key: 'shift_timings',
        label: 'Shift Timings (last 5)',
        icon: Clock,
        entityName: 'ShiftTiming',
        /**
         * ShiftTiming links via attendance_id matching Employee.attendance_id.
         * ShiftTiming does not always have a direct employee field, so we
         * filter by attendance_id where available.
         */
        fetch: async (emp) => {
            if (!emp.attendance_id) return [];
            const all = await base44.entities.ShiftTiming.filter(
                { attendance_id: String(emp.attendance_id) }, '-created_date', 100
            );
            return all.slice(0, 5);
        },
        limit: 5,
    },
];

export default function EmployeeInspector() {
    // --- Search state ---
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [searchPerformed, setSearchPerformed] = useState(false);

    // --- Selected employee and panels state ---
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [panelData, setPanelData] = useState({});
    const [panelLoading, setPanelLoading] = useState({});
    const [panelErrors, setPanelErrors] = useState({});
    const [expandedPanels, setExpandedPanels] = useState({});

    // --- Edit modal state ---
    const [editRecord, setEditRecord] = useState(null);
    const [editEntityName, setEditEntityName] = useState('');
    const [editValues, setEditValues] = useState({});
    const [editConfirmStep, setEditConfirmStep] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    /**
     * Search for employees by name, attendance_id, or hrms_id.
     * Fetches all employees and filters client-side to match against
     * multiple fields simultaneously.
     */
    const handleSearch = useCallback(async () => {
        const q = searchQuery.trim();
        if (!q) return;
        setIsSearching(true);
        setSearchPerformed(true);
        setSearchResults([]);
        setSelectedEmployee(null);
        setPanelData({});
        try {
            // Fetch all employees and filter across multiple fields
            const allEmployees = await base44.entities.Employee.list('name', 5000);
            const lower = q.toLowerCase();
            const matched = allEmployees.filter((emp) => {
                const nameMatch = emp.name && String(emp.name).toLowerCase().includes(lower);
                const attMatch = emp.attendance_id && String(emp.attendance_id).toLowerCase().includes(lower);
                const hrmsMatch = emp.hrms_id && String(emp.hrms_id).toLowerCase().includes(lower);
                return nameMatch || attMatch || hrmsMatch;
            });
            setSearchResults(matched);
        } catch (err) {
            console.error('Employee search failed:', err);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery]);

    /**
     * Select an employee and fetch all related panel data.
     * Each panel fetches independently so one failure doesn't block others.
     */
    const selectEmployee = useCallback(async (emp) => {
        setSelectedEmployee(emp);
        // Expand all panels by default
        const expanded = {};
        PANEL_DEFINITIONS.forEach((p) => { expanded[p.key] = true; });
        setExpandedPanels(expanded);

        // Initialize loading states for all panels
        const loading = {};
        PANEL_DEFINITIONS.forEach((p) => { loading[p.key] = true; });
        setPanelLoading(loading);
        setPanelData({});
        setPanelErrors({});

        // Fetch each panel's data independently
        PANEL_DEFINITIONS.forEach(async (panel) => {
            try {
                const data = await panel.fetch(emp);
                setPanelData((prev) => ({ ...prev, [panel.key]: data || [] }));
                setPanelErrors((prev) => ({ ...prev, [panel.key]: null }));
            } catch (err) {
                console.error(`Panel ${panel.key} fetch failed:`, err);
                setPanelData((prev) => ({ ...prev, [panel.key]: [] }));
                setPanelErrors((prev) => ({ ...prev, [panel.key]: err.message || 'Fetch failed' }));
            } finally {
                setPanelLoading((prev) => ({ ...prev, [panel.key]: false }));
            }
        });
    }, []);

    /** Toggle a collapsible panel open/closed. */
    const togglePanel = useCallback((key) => {
        setExpandedPanels((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    // --- Edit handlers ---
    const openEditModal = useCallback((record, entityName) => {
        setEditRecord(record);
        setEditEntityName(entityName);
        const editable = {};
        Object.entries(record).forEach(([key, val]) => {
            if (key === 'id') return;
            editable[key] = val != null ? String(val) : '';
        });
        setEditValues(editable);
        setEditConfirmStep(false);
        setSaveError(null);
    }, []);

    const closeEditModal = useCallback(() => {
        setEditRecord(null);
        setEditEntityName('');
        setEditValues({});
        setEditConfirmStep(false);
        setSaveError(null);
    }, []);

    /**
     * Save edited record with full audit logging.
     *
     * CONFIRMATION IS REQUIRED because this writes directly to live production
     * data without any application-level validation or workflow.
     *
     * AUDIT LOGGING is called after every successful save so that the change
     * can be traced back to the admin who made it, with full old/new values.
     */
    const handleSave = useCallback(async () => {
        if (!editRecord || !editEntityName) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const changes = {};
            const oldValues = {};
            const newValues = {};
            Object.entries(editValues).forEach(([key, val]) => {
                const original = editRecord[key];
                const originalStr = original != null ? String(original) : '';
                if (val !== originalStr) {
                    let parsedVal = val;
                    if (val === '' || val === 'null') parsedVal = null;
                    else if (val === 'true') parsedVal = true;
                    else if (val === 'false') parsedVal = false;
                    else if (!isNaN(Number(val)) && val.trim() !== '' && typeof original === 'number') {
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

            await base44.entities[editEntityName].update(editRecord.id, changes);

            /**
             * AUDIT LOG — Required for every edit operation in the Employee Inspector.
             * Records the admin user, the entity, the record ID, and the exact
             * old and new values so the change is fully traceable.
             */
            try {
                await base44.functions.invoke('logAudit', {
                    action_type: 'update',
                    entity_name: editEntityName,
                    entity_id: String(editRecord.id),
                    changes: JSON.stringify({ old: oldValues, new: newValues }),
                    context: `DevModule EmployeeInspector: Edited ${editEntityName} record ${editRecord.id}`,
                });
            } catch (auditErr) {
                console.error('Audit log failed (edit):', auditErr);
            }

            // Refresh the selected employee's panels
            if (selectedEmployee) {
                selectEmployee(selectedEmployee);
            }
            closeEditModal();
        } catch (err) {
            console.error('Save failed:', err);
            setSaveError(err.message || 'Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    }, [editRecord, editValues, editEntityName, selectedEmployee, selectEmployee, closeEditModal]);

    // --- Render ---
    return (
        <div className="space-y-6">
            {/*
              SEARCH BAR
              Allows searching employees by name, attendance_id, or hrms_id.
              The search runs client-side after fetching all employees so that
              multiple fields can be matched in a single pass.
            */}
            <div className="flex gap-3">
                <div className="relative flex-1 max-w-lg">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search by name, attendance ID, or HRMS ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                        className="pl-9"
                    />
                </div>
                <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                    {isSearching ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching...</>
                    ) : (
                        'Search'
                    )}
                </Button>
            </div>

            {/* Initial state — no search performed yet */}
            {!searchPerformed && !selectedEmployee && (
                <div className="flex flex-col items-center justify-center min-h-[350px] border-2 border-dashed border-slate-300 rounded-xl bg-white">
                    <UserSearch className="w-12 h-12 text-slate-400 mb-4" />
                    <p className="text-slate-500 text-sm">Search for an employee to inspect their data across all entities.</p>
                </div>
            )}

            {/* Loading state during search */}
            {isSearching && (
                <div className="flex flex-col items-center justify-center min-h-[200px] bg-white rounded-xl border border-slate-200">
                    <Loader2 className="w-8 h-8 text-slate-500 animate-spin mb-3" />
                    <p className="text-slate-500 text-sm">Searching employees...</p>
                </div>
            )}

            {/* Search results — show clickable employee list */}
            {searchPerformed && !isSearching && !selectedEmployee && (
                <div>
                    {searchResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center min-h-[200px] bg-white rounded-xl border border-slate-200">
                            <Inbox className="w-10 h-10 text-slate-400 mb-3" />
                            <p className="text-slate-600 font-medium mb-1">No employees found</p>
                            <p className="text-slate-500 text-sm">Try a different name, attendance ID, or HRMS ID.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-sm text-slate-600">
                                <span className="font-semibold">{searchResults.length}</span> employee(s) found. Click to inspect.
                            </p>
                            <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                                {searchResults.map((emp) => (
                                    <button
                                        key={emp.id}
                                        onClick={() => selectEmployee(emp)}
                                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-4"
                                    >
                                        <User className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-800 truncate">{emp.name || '(no name)'}</p>
                                            <p className="text-xs text-slate-500">
                                                {emp.company && <span className="mr-3">Company: {emp.company}</span>}
                                                {emp.attendance_id && <span className="mr-3">Att ID: {emp.attendance_id}</span>}
                                                {emp.hrms_id && <span>HRMS: {emp.hrms_id}</span>}
                                            </p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-300" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Selected employee — show all panels */}
            {selectedEmployee && (
                <div className="space-y-4">
                    {/* Employee header with back button */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedEmployee(null); setPanelData({}); }}
                        >
                            Back to results
                        </Button>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800">
                                {selectedEmployee.name || '(no name)'}
                            </h3>
                            <p className="text-xs text-slate-500">
                                ID: {selectedEmployee.id}
                                {selectedEmployee.attendance_id && <span className="ml-3">Attendance: {selectedEmployee.attendance_id}</span>}
                                {selectedEmployee.hrms_id && <span className="ml-3">HRMS: {selectedEmployee.hrms_id}</span>}
                            </p>
                        </div>
                    </div>

                    {/*
                      COLLAPSIBLE PANELS
                      Each panel represents one related entity. Every panel is always
                      rendered (never hidden) because the absence of data is itself
                      diagnostic information — e.g. an employee missing a salary
                      record could indicate a sync failure.
                    */}
                    {PANEL_DEFINITIONS.map((panel) => (
                        <CollapsiblePanel
                            key={panel.key}
                            panel={panel}
                            isExpanded={!!expandedPanels[panel.key]}
                            onToggle={() => togglePanel(panel.key)}
                            data={panelData[panel.key] || []}
                            isLoading={!!panelLoading[panel.key]}
                            error={panelErrors[panel.key]}
                            onEdit={(record) => openEditModal(record, panel.entityName)}
                        />
                    ))}
                </div>
            )}

            {/*
              EDIT MODAL
              Reused across all panels. Opens when an admin clicks edit on any
              record in any panel. Two-step flow: edit fields, then confirm.
              Audit logging is called after every successful save.
            */}
            <Dialog open={!!editRecord} onOpenChange={(open) => { if (!open) closeEditModal(); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editConfirmStep ? 'Confirm Changes' : `Edit ${editEntityName} Record`}
                        </DialogTitle>
                        <DialogDescription>
                            {editConfirmStep
                                ? `You are about to modify record ${editRecord?.id} in the ${editEntityName} entity. This directly affects live production data.`
                                : `Editing record ID: ${editRecord?.id}`}
                        </DialogDescription>
                    </DialogHeader>

                    {!editConfirmStep ? (
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
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
                        <div className="space-y-3">
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-800">
                                        <p className="font-semibold mb-1">This action modifies live production data.</p>
                                        <p>Entity: <strong>{editEntityName}</strong></p>
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
        </div>
    );
}

/**
 * CollapsiblePanel — renders a single entity data panel with:
 * - Header showing entity name, icon, record count, and expand/collapse toggle
 * - Loading state while data is being fetched
 * - Error state if the fetch failed
 * - Empty state if no records exist (panel is NOT hidden — see top-level comment)
 * - Raw field name / value table for each record, with edit button per record
 */
function CollapsiblePanel({ panel, isExpanded, onToggle, data, isLoading, error, onEdit }) {
    const Icon = panel.icon;
    const recordCount = data.length;

    return (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {/* Panel header — always visible, clickable to expand/collapse */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
                <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-700 flex-1">{panel.label}</span>
                {isLoading ? (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                ) : error ? (
                    <Badge variant="destructive" className="text-xs">Error</Badge>
                ) : (
                    <Badge variant={recordCount === 0 ? 'secondary' : 'outline'} className="text-xs">
                        {recordCount} record{recordCount !== 1 ? 's' : ''}
                    </Badge>
                )}
            </button>

            {/* Panel body — only rendered when expanded */}
            {isExpanded && (
                <div className="border-t border-slate-100 px-4 py-3">
                    {/* Loading state */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 text-slate-400 animate-spin mr-2" />
                            <p className="text-sm text-slate-500">Loading {panel.label}...</p>
                        </div>
                    )}

                    {/* Error state */}
                    {!isLoading && error && (
                        <div className="flex items-center gap-2 py-4 px-3 bg-red-50 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {/*
                      Empty state — always shown when no records exist.
                      The panel is deliberately NOT hidden because missing data
                      is diagnostic information (see top-level component comment).
                    */}
                    {!isLoading && !error && data.length === 0 && (
                        <div className="flex items-center gap-2 py-6 justify-center">
                            <Inbox className="w-5 h-5 text-slate-300" />
                            <p className="text-sm text-slate-400">No {panel.label.toLowerCase()} records found for this employee.</p>
                        </div>
                    )}

                    {/* Records — one card per record showing all raw fields */}
                    {!isLoading && !error && data.length > 0 && (
                        <div className="space-y-3">
                            {data.map((record, idx) => (
                                <RecordCard
                                    key={record.id || idx}
                                    record={record}
                                    onEdit={() => onEdit(record)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * RecordCard — renders a single record as a bordered card showing every
 * field name and its raw value. Includes an edit button.
 */
function RecordCard({ record, onEdit }) {
    const entries = Object.entries(record);

    return (
        <div className="border border-slate-100 rounded-lg p-3 hover:border-slate-200 transition-colors">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-400">ID: {record.id}</span>
                <button
                    onClick={onEdit}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Edit this record"
                >
                    <Pencil className="w-3 h-3" />
                    Edit
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {entries.map(([key, val]) => (
                    <div key={key} className="flex items-start gap-2 py-0.5 text-xs">
                        <span className="font-medium text-slate-500 min-w-[100px] shrink-0 break-all">{key}</span>
                        <span className="text-slate-700 break-all">
                            {val != null ? String(val) : (
                                <span className="text-slate-300 italic">null</span>
                            )}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
