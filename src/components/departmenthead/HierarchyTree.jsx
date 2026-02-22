import { useState } from 'react';
import { ChevronRight, ChevronDown, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function HierarchyTree({ deptHeads, employees, filterCompany = 'all' }) {
    const [expandedHeads, setExpandedHeads] = useState({});

    const toggleExpand = (headId) => {
        setExpandedHeads(prev => ({
            ...prev,
            [headId]: !prev[headId]
        }));
    };

    const getEmployeeName = (empId) => {
        const emp = employees.find(e => e.id === empId);
        return emp ? `${emp.name} (${emp.attendance_id})` : 'Unknown';
    };

    const activeDeptHeads = deptHeads.filter(dh => 
        dh.active && (filterCompany === 'all' || dh.company === filterCompany)
    );

    if (activeDeptHeads.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                No department heads to display
            </div>
        );
    }

    return (
        <div className="space-y-2 p-4">
            {activeDeptHeads.map(dh => {
                const managedIds = dh.managed_employee_ids ? dh.managed_employee_ids.split(',').filter(Boolean) : [];
                const isExpanded = expandedHeads[dh.id];

                return (
                    <div key={dh.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                        {/* Department Head */}
                        <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => toggleExpand(dh.id)}
                                    className="p-1 hover:bg-indigo-100 rounded transition-colors"
                                >
                                    {managedIds.length > 0 ? (
                                        isExpanded ? (
                                            <ChevronDown className="w-5 h-5 text-indigo-600" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-indigo-600" />
                                        )
                                    ) : (
                                        <div className="w-5 h-5" />
                                    )}
                                </button>
                                
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-900">
                                            {getEmployeeName(dh.employee_id)}
                                        </span>
                                        <Badge className="bg-indigo-100 text-indigo-700 text-xs">
                                            {dh.department}
                                        </Badge>
                                        <Badge className="bg-blue-100 text-blue-700 text-xs">
                                            {dh.company}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <Users className="w-4 h-4" />
                                    <span className="font-medium">{managedIds.length} managed</span>
                                </div>
                            </div>
                        </div>

                        {/* Managed Employees */}
                        {isExpanded && managedIds.length > 0 && (
                            <div className="bg-slate-50">
                                {managedIds.map((empId, idx) => {
                                    const emp = employees.find(e => e.id === empId);
                                    const isLastChild = idx === managedIds.length - 1;

                                    return (
                                        <div
                                            key={empId}
                                            className={`p-3 px-4 flex items-center gap-3 ${
                                                !isLastChild ? 'border-b border-slate-200' : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 ml-8 flex-1">
                                                <div className="w-2 h-2 rounded-full bg-slate-400" />
                                                <span className="text-slate-700">
                                                    {emp?.name || 'Unknown'} 
                                                    <span className="text-slate-500 text-sm ml-1">
                                                        ({emp?.attendance_id})
                                                    </span>
                                                </span>
                                            </div>
                                            {emp?.department && (
                                                <Badge className="bg-slate-100 text-slate-700 text-xs">
                                                    {emp.department}
                                                </Badge>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* No managed employees message */}
                        {isExpanded && managedIds.length === 0 && (
                            <div className="p-4 text-center text-slate-500 text-sm">
                                No managed employees
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}