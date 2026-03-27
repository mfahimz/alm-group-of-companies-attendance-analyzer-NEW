import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Brain, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function AnomalyDetectionCard({ project }) {
    const [anomalies, setAnomalies] = useState(null);
    const [expandedEmployee, setExpandedEmployee] = useState(null);

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });

    const analyzeAnomaliesMutation = useMutation({
        mutationFn: async () => {
            // Group punches by employee
            const employeePunches = {};
            punches.forEach(p => {
                if (!employeePunches[p.attendance_id]) {
                    employeePunches[p.attendance_id] = [];
                }
                employeePunches[p.attendance_id].push(p);
            });

            const uniqueEmployeeIds = Object.keys(employeePunches);
            
            // Prepare data summary for AI analysis
            const employeeSummaries = uniqueEmployeeIds.slice(0, 20).map(empId => {
                const empPunches = employeePunches[empId]
                    .filter(p => p.punch_date >= project.date_from && p.punch_date <= project.date_to)
                    .sort((a, b) => a.punch_date.localeCompare(b.punch_date) || a.timestamp_raw.localeCompare(b.timestamp_raw));
                
                const empShift = shifts.find(s => s.attendance_id === empId && !s.date && !s.is_friday_shift);
                const empExceptions = exceptions.filter(e => e.attendance_id === empId || e.attendance_id === 'ALL');
                const employee = employees.find(e => e.attendance_id === empId);

                // Group by date
                // Group by date with 180-minute (3:00 AM) universal rollback
                const byDate = {};
                empPunches.forEach(p => {
                    let effectiveDate = p.punch_date;
                    
                    // Parse hour from timestamp_raw (Format: "YYYY-MM-DD HH:mm:ss")
                    const timePart = p.timestamp_raw.split(' ')[1];
                    if (timePart) {
                        const [hourStr] = timePart.split(':');
                        const hour = parseInt(hourStr, 10);
                        
                        // Universal 3:00 AM Rollback: If between 00:00 and 02:59, roll back to previous date
                        if (hour >= 0 && hour < 3) {
                            const dateObj = new Date(p.punch_date);
                            dateObj.setDate(dateObj.getDate() - 1);
                            
                            // Safe date extraction (YYYY-MM-DD)
                            const y = dateObj.getFullYear();
                            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                            const d = String(dateObj.getDate()).padStart(2, '0');
                            effectiveDate = `${y}-${m}-${d}`;
                        }
                    }
                    
                    if (!byDate[effectiveDate]) byDate[effectiveDate] = [];
                    byDate[effectiveDate].push(p.timestamp_raw);
                });

                return {
                    attendance_id: empId,
                    name: employee?.name || 'Unknown',
                    shift: empShift ? {
                        am_start: empShift.am_start,
                        am_end: empShift.am_end,
                        pm_start: empShift.pm_start,
                        pm_end: empShift.pm_end,
                        is_single_shift: empShift.is_single_shift
                    } : null,
                    exceptions: empExceptions.map(e => ({
                        type: e.type,
                        date_from: e.date_from,
                        date_to: e.date_to
                    })),
                    punches_by_date: byDate,
                    total_punch_days: Object.keys(byDate).length
                };
            });

            const prompt = `You are an attendance anomaly detection system. Analyze the following employee punch data for a project period from ${project.date_from} to ${project.date_to}.

For each employee, identify potential anomalies such as:
1. Missing punches (days with odd number of punches, less than expected)
2. Unusual punch times (significantly before/after shift times)
3. Consecutive absences (multiple days without any punches)
4. Irregular patterns (sudden changes in punch behavior)
5. Potential time theft (very short work durations)
6. Double punches within seconds/minutes (possible system errors)

Employee Data:
${JSON.stringify(employeeSummaries, null, 2)}

For each anomaly found, provide:
- Employee ID and name
- Type of anomaly
- Specific dates affected
- Brief description
- Confidence score (0-100) based on how certain the anomaly is real vs noise

Focus on HIGH and MEDIUM confidence anomalies. Ignore minor variations.`;

            const result = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        anomalies: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    attendance_id: { type: "string" },
                                    employee_name: { type: "string" },
                                    anomaly_type: { type: "string" },
                                    dates_affected: { type: "array", items: { type: "string" } },
                                    description: { type: "string" },
                                    confidence_score: { type: "number" },
                                    severity: { type: "string", enum: ["high", "medium", "low"] }
                                }
                            }
                        },
                        summary: {
                            type: "object",
                            properties: {
                                total_employees_analyzed: { type: "number" },
                                employees_with_anomalies: { type: "number" },
                                high_severity_count: { type: "number" },
                                medium_severity_count: { type: "number" },
                                low_severity_count: { type: "number" }
                            }
                        }
                    }
                }
            });

            return result;
        },
        onSuccess: (data) => {
            setAnomalies(data);
            toast.success(`Analysis complete: ${data.anomalies?.length || 0} anomalies detected`);
        },
        onError: (error) => {
            toast.error('Failed to analyze anomalies: ' + error.message);
        }
    });

    const getConfidenceColor = (score) => {
        if (score >= 80) return 'bg-red-100 text-red-700 border-red-200';
        if (score >= 60) return 'bg-orange-100 text-orange-700 border-orange-200';
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    };

    const getSeverityBadge = (severity) => {
        const colors = {
            high: 'bg-red-500',
            medium: 'bg-orange-500',
            low: 'bg-yellow-500'
        };
        return <Badge className={`${colors[severity]} text-white`}>{severity}</Badge>;
    };

    // Group anomalies by employee
    const anomaliesByEmployee = anomalies?.anomalies?.reduce((acc, anomaly) => {
        if (!acc[anomaly.attendance_id]) {
            acc[anomaly.attendance_id] = {
                name: anomaly.employee_name,
                items: []
            };
        }
        acc[anomaly.attendance_id].items.push(anomaly);
        return acc;
    }, {}) || {};

    return (
        <Card className="border-0 shadow-sm bg-white rounded-xl ring-1 ring-slate-200/80">
            <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg ring-1 ring-indigo-200/50">
                        <Brain className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <CardTitle className="text-lg font-semibold text-slate-900">AI Anomaly Detection</CardTitle>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Proactively identify attendance discrepancies before report generation
                        </p>
                    </div>
                </div>
                <Button
                    onClick={() => analyzeAnomaliesMutation.mutate()}
                    disabled={analyzeAnomaliesMutation.isPending || punches.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 transition-all duration-200 shadow-sm"
                >
                    {analyzeAnomaliesMutation.isPending ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing...
                        </>
                    ) : (
                        <>
                            <Brain className="w-4 h-4 mr-2" />
                            Run AI Analysis
                        </>
                    )}
                </Button>
            </CardHeader>
            <CardContent>
                {punches.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                        <p>No punch data available. Upload punches first to run anomaly detection.</p>
                    </div>
                ) : !anomalies ? (
                    <div className="text-center py-8 text-slate-500">
                        <Brain className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                        <p>Click "Run AI Analysis" to detect potential anomalies in the punch data.</p>
                        <p className="text-xs mt-2">Analyzes up to 20 employees per run</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Summary */}
                        {anomalies.summary && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-50 rounded-lg">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-slate-900">{anomalies.summary.total_employees_analyzed}</p>
                                    <p className="text-xs text-slate-500">Analyzed</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-purple-600">{anomalies.summary.employees_with_anomalies}</p>
                                    <p className="text-xs text-slate-500">With Issues</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-red-600">{anomalies.summary.high_severity_count}</p>
                                    <p className="text-xs text-slate-500">High Severity</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-orange-600">{anomalies.summary.medium_severity_count}</p>
                                    <p className="text-xs text-slate-500">Medium</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-yellow-600">{anomalies.summary.low_severity_count}</p>
                                    <p className="text-xs text-slate-500">Low</p>
                                </div>
                            </div>
                        )}

                        {/* Anomalies List */}
                        {Object.keys(anomaliesByEmployee).length === 0 ? (
                            <div className="text-center py-8">
                                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                                <p className="text-lg font-medium text-slate-900">No Anomalies Detected</p>
                                <p className="text-sm text-slate-500">The punch data looks consistent</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <h4 className="font-medium text-slate-900">Detected Anomalies</h4>
                                {Object.entries(anomaliesByEmployee).map(([empId, data]) => (
                                    <div key={empId} className="border rounded-lg overflow-hidden">
                                        <button
                                            onClick={() => setExpandedEmployee(expandedEmployee === empId ? null : empId)}
                                            className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <User className="w-5 h-5 text-slate-400" />
                                                <div className="text-left">
                                                    <p className="font-medium text-slate-900">{data.name}</p>
                                                    <p className="text-sm text-slate-500">ID: {empId}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm text-slate-500">{data.items.length} issue(s)</span>
                                                {expandedEmployee === empId ? (
                                                    <ChevronUp className="w-5 h-5 text-slate-400" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5 text-slate-400" />
                                                )}
                                            </div>
                                        </button>
                                        
                                        {expandedEmployee === empId && (
                                            <div className="border-t bg-slate-50 p-4 space-y-3">
                                                {data.items.map((anomaly, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        className={`p-3 rounded-lg border ${getConfidenceColor(anomaly.confidence_score)}`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    {getSeverityBadge(anomaly.severity)}
                                                                    <span className="font-medium text-sm">{anomaly.anomaly_type}</span>
                                                                </div>
                                                                <p className="text-sm">{anomaly.description}</p>
                                                                {anomaly.dates_affected?.length > 0 && (
                                                                    <div className="flex items-center gap-1 mt-2 text-xs">
                                                                        <Calendar className="w-3 h-3" />
                                                                        <span>{anomaly.dates_affected.slice(0, 5).join(', ')}</span>
                                                                        {anomaly.dates_affected.length > 5 && (
                                                                            <span className="text-slate-500">+{anomaly.dates_affected.length - 5} more</span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="text-right flex-shrink-0">
                                                                <div className="text-lg font-bold">{anomaly.confidence_score}%</div>
                                                                <div className="text-xs">confidence</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}