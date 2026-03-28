import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScanLine, Download, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { extractTime } from './useDetectionAnalysis';

export default function DetectionPanel({
    shiftMismatchDetections, noMatchDetections, exceptions, project, results,
    setSelectedEmployee, setEditingDay, handleExportMismatch,
    onRequestRawData, rawDataLoaded
}) {
    const [showPanel, setShowPanel] = useState(false);
    const [activeTab, setActiveTab] = useState('mismatch');
    const [dismissedMismatchKeys, setDismissedMismatchKeys] = useState(new Set());
    const [dismissedNoMatchKeys, setDismissedNoMatchKeys] = useState(new Set());
    const [showDismissed, setShowDismissed] = useState(false);
    const [expandedEmployees, setExpandedEmployees] = useState({});
    const queryClient = useQueryClient();

    React.useEffect(() => {
        const mKeys = new Set(); const nKeys = new Set();
        exceptions.forEach(ex => {
            if (ex.type === 'DISMISSED_MISMATCH' && String(ex.project_id) === String(project.id)) {
                const key = String(ex.attendance_id) + '-' + ex.date_from;
                if (ex.notes === 'mismatch') mKeys.add(key); else if (ex.notes === 'no_match') nKeys.add(key);
            }
        });
        setDismissedMismatchKeys(mKeys); setDismissedNoMatchKeys(nKeys);
    }, [exceptions, project.id]);

    const handleDismiss = async (d, type) => {
        const notes = type;
        if (d.isDismissed) {
            const ex = exceptions.find(e => e.type === 'DISMISSED_MISMATCH' && String(e.attendance_id) === String(d.attendance_id) && e.date_from === d.date && e.notes === notes);
            if (ex) { await base44.entities.Exception.delete(ex.id); toast.success("Restored"); }
        } else {
            await base44.entities.Exception.create({ type: 'DISMISSED_MISMATCH', attendance_id: d.attendance_id, project_id: project.id, date_from: d.date, date_to: d.date, notes });
            toast.success("Dismissed");
        }
        queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
        const setter = type === 'mismatch' ? setDismissedMismatchKeys : setDismissedNoMatchKeys;
        setter(prev => { const n = new Set([...prev]); d.isDismissed ? n.delete(d.key) : n.add(d.key); return n; });
    };

    const TopOffenders = ({ detections, dismissedKeys, color }) => {
        if (detections.length === 0) return null;
        const counts = {};
        detections.filter(d => !dismissedKeys.has(String(d.attendance_id) + '-' + d.date)).forEach(d => {
            const aid = String(d.attendance_id);
            if (!counts[aid]) counts[aid] = { name: d.name, count: 0 };
            counts[aid].count++;
        });
        const top = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
        return (
            <div className="flex flex-wrap gap-2 mb-2">
                <div className={`w-full text-[10px] font-bold text-${color}-600 uppercase tracking-wider mb-1`}>Top Offenders (Flagged Days)</div>
                {top.map((o, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-1 bg-${color}-50 border border-${color}-100 rounded-md shadow-sm`}>
                        <span className={`text-[11px] font-bold text-${color}-700`}>{o.name}</span>
                        <span className={`bg-${color}-200 text-${color}-800 text-[9px] font-bold px-1.5 py-0.5 rounded-full`}>{o.count}</span>
                    </div>
                ))}
            </div>
        );
    };

    const renderGroups = (detections, dismissedKeys, type) => {
        const groups = {};
        detections.forEach(d => {
            const key = String(d.attendance_id) + '-' + d.date;
            const isDismissed = dismissedKeys.has(key);
            if (isDismissed && !showDismissed) return;
            if (!groups[d.attendance_id]) groups[d.attendance_id] = { name: d.name, rows: [] };
            groups[d.attendance_id].rows.push({ ...d, key, isDismissed });
        });

        return Object.entries(groups).map(([attId, group]) => {
            const isExpanded = expandedEmployees[attId] !== false;
            return (
                <React.Fragment key={attId}>
                    <tr className="bg-slate-50/80 cursor-pointer hover:bg-slate-100" onClick={() => setExpandedEmployees(prev => ({ ...prev, [attId]: !isExpanded }))}>
                        <td colSpan={type === 'mismatch' ? 4 : 3} className="py-2 px-2 border-y border-slate-200">
                            <div className="flex items-center gap-2">
                                <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                <span className="font-bold text-slate-700">{group.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">({attId})</span>
                                <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] ml-auto mr-2">{group.rows.length} flagged</span>
                            </div>
                        </td>
                    </tr>
                    {isExpanded && group.rows.map(d => {
                        const isCritical = d.maxDeviation > 300;
                        const isWarning = d.maxDeviation >= 180 && d.maxDeviation <= 300;
                        const bg = d.isDismissed ? 'bg-slate-50' : (isCritical ? 'bg-red-50/50' : (isWarning ? 'bg-amber-50/50' : ''));
                        const border = d.isDismissed ? 'border-l-slate-300' : (isCritical ? 'border-l-red-500 border-l-4' : (isWarning ? 'border-l-amber-500 border-l-4' : ''));
                        const opacity = d.isDismissed ? 'opacity-40 grayscale' : '';
                        return (
                            <tr key={d.key} className={`${bg} ${border} ${opacity} hover:bg-slate-100/50 transition-all`}>
                                <td className="py-3 pl-2">
                                    <div className="font-medium text-slate-900">{d.displayDate}</div>
                                    <div className={`text-[10px] font-bold ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>{d.maxDeviation} min {type === 'mismatch' ? 'off' : 'deviation'}</div>
                                </td>
                                <td className="py-3">
                                    <div className="flex flex-wrap gap-1">
                                        {(type === 'mismatch' ? d.punches : d.noMatchPunches).map((p, idx) => (
                                            <span key={idx} className={`flex items-center gap-1 border px-1.5 py-0.5 rounded text-[10px] ${type === 'no_match' && !p.matched ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold' : 'bg-white text-slate-600'}`}>
                                                {extractTime(p.raw)}
                                                {type === 'no_match' && !p.matched && p.nearestShiftPoint && <span className="text-slate-400 font-normal border-l pl-1 ml-0.5 border-rose-200">{p.nearestShiftPoint} {p.minutesAway}m</span>}
                                                {p.isPrev && <span className="ml-1 text-[10px]" title="Previous Day">🌙</span>}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                {type === 'mismatch' && (
                                    <td className="py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.likelyWorkedShift === 'No alternate shift found' ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600'}`}>{d.likelyWorkedShift}</span>
                                    </td>
                                )}
                                <td className="py-3 text-right pr-2">
                                    <div className="flex gap-1 justify-end">
                                        <Button size="xs" variant="ghost" className="h-7 text-[10px] text-slate-400 hover:text-slate-600" onClick={() => handleDismiss(d, type === 'mismatch' ? 'mismatch' : 'no_match')}>
                                            {d.isDismissed ? 'Undo' : 'Dismiss'}
                                        </Button>
                                        <Button size="sm" variant="outline" className={`h-7 text-[10px] ${type === 'mismatch' ? 'text-indigo-600 border-indigo-200 hover:bg-indigo-50' : 'text-rose-600 border-rose-200 hover:bg-rose-50'}`}
                                            onClick={() => {
                                                const match = results.find(r => String(r.attendance_id) === String(d.attendance_id));
                                                setSelectedEmployee(match || d.rawResult);
                                                setEditingDay({ date: d.displayDate, dateStr: d.date, status: 'Present', abnormal: false, shift: type === 'mismatch' ? 'Mismatch Detected' : 'Binding Error' });
                                            }}>
                                            {type === 'mismatch' ? 'Edit' : 'Fix Entry'}
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </React.Fragment>
            );
        });
    };

    return (
        <>
            <div className="flex gap-4 items-center mb-6">
                <Button className={`w-fit font-bold border-2 transition-all ${showPanel ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`} onClick={() => { if (!showPanel && onRequestRawData) onRequestRawData(); setShowPanel(!showPanel); }}>
                    <ScanLine className="w-4 h-4 mr-2" />
                    {showPanel ? 'Hide Shift Mismatch Analysis' : 'Show Shift Mismatch Analysis'}
                    <div className="ml-3 flex gap-2">
                        {shiftMismatchDetections.length > 0 && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px]">{shiftMismatchDetections.length} Mismatches</span>}
                        {noMatchDetections.length > 0 && <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px]">{noMatchDetections.length} Unbound</span>}
                    </div>
                </Button>
                {showPanel && (
                    <Button onClick={handleExportMismatch} variant="outline" className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold">
                        <Download className="w-4 h-4 mr-2" />Export Mismatch
                    </Button>
                )}
            </div>
            {showPanel && !rawDataLoaded && (
                <Card className="border shadow-md overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Loading punch and shift data for analysis...</span>
                    </div>
                </Card>
            )}
            {showPanel && rawDataLoaded && (
                <Card className="border shadow-md overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex border-b bg-slate-50/50">
                        <button className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'mismatch' ? 'border-amber-500 text-amber-600 bg-amber-50/30' : 'border-transparent text-slate-500 hover:text-slate-700'}`} onClick={() => setActiveTab('mismatch')}>
                            Shift Mismatch ({shiftMismatchDetections.filter(d => !dismissedMismatchKeys.has(String(d.attendance_id) + '-' + d.date)).length})
                        </button>
                        <button className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'no-match' ? 'border-rose-500 text-rose-600 bg-rose-50/30' : 'border-transparent text-slate-500 hover:text-slate-700'}`} onClick={() => setActiveTab('no-match')}>
                            No Match ({noMatchDetections.filter(d => !dismissedNoMatchKeys.has(String(d.attendance_id) + '-' + d.date)).length})
                        </button>
                    </div>
                    <div className="p-4 max-h-[450px] overflow-y-auto bg-white">
                        <div className="flex justify-end mb-2">
                            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer hover:text-slate-700">
                                <input type="checkbox" className="w-3 h-3 accent-indigo-600" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
                                Show Dismissed
                            </label>
                        </div>
                        {activeTab === 'mismatch' ? (
                            <div className="space-y-4">
                                <TopOffenders detections={shiftMismatchDetections} dismissedKeys={dismissedMismatchKeys} color="rose" />
                                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                    <div className="mt-0.5 text-amber-600 font-bold">ⓘ</div>
                                    <p className="text-xs text-amber-800"><strong>Detection Rule:</strong> Flags days where ALL punches fall &gt;180 min outside shift times.</p>
                                </div>
                                <table className="w-full text-xs border-separate border-spacing-0">
                                    <thead><tr className="text-left text-slate-400 border-b uppercase tracking-wider font-bold"><th className="pb-2 pl-2">Date / Severity</th><th className="pb-2">Punch Details</th><th className="pb-2">Likely Shift</th><th className="pb-2 text-right pr-2">Actions</th></tr></thead>
                                    <tbody className="divide-y">
                                        {shiftMismatchDetections.length === 0 ? <tr><td colSpan="4" className="py-8 text-center text-slate-400 italic">None found.</td></tr> : renderGroups(shiftMismatchDetections, dismissedMismatchKeys, 'mismatch')}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <TopOffenders detections={noMatchDetections} dismissedKeys={dismissedNoMatchKeys} color="amber" />
                                <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-100 rounded-lg">
                                    <div className="mt-0.5 text-rose-600 font-bold">ⓘ</div>
                                    <p className="text-xs text-rose-800"><strong>Detection Rule:</strong> Flags days with punches that can't bind to any shift point within 180 min.</p>
                                </div>
                                <table className="w-full text-xs border-separate border-spacing-0">
                                    <thead><tr className="text-left text-slate-400 border-b uppercase tracking-wider font-bold"><th className="pb-2 pl-2">Date / Severity</th><th className="pb-2">Binding Status</th><th className="pb-2 text-right pr-2">Actions</th></tr></thead>
                                    <tbody className="divide-y">
                                        {noMatchDetections.length === 0 ? <tr><td colSpan="3" className="py-8 text-center text-slate-400 italic">None found.</td></tr> : renderGroups(noMatchDetections, dismissedNoMatchKeys, 'no_match')}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </Card>
            )}
        </>
    );
}