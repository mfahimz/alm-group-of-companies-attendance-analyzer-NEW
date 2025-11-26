import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, AlertTriangle, FileText, Settings, Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

export default function AIAnalysisTab({ project }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiInsights, setAiInsights] = useState(null);
    const [activeAnalysis, setActiveAnalysis] = useState(null);
    const queryClient = useQueryClient();

    const { data: results = [] } = useQuery({
        queryKey: ['results', project.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ project_id: project.id })
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });

    const { data: rules } = useQuery({
        queryKey: ['rules'],
        queryFn: async () => {
            const rulesList = await base44.entities.AttendanceRules.list();
            if (rulesList.length > 0) {
                return JSON.parse(rulesList[0].rules_json);
            }
            return null;
        }
    });

    const prepareAnalysisData = () => {
        const enrichedResults = results.map(r => {
            const emp = employees.find(e => e.attendance_id === r.attendance_id);
            return {
                attendance_id: r.attendance_id,
                name: emp?.name || 'Unknown',
                working_days: r.working_days,
                present_days: r.present_days,
                full_absences: r.full_absence_count,
                half_absences: r.half_absence_count,
                late_minutes: r.late_minutes,
                early_checkout_minutes: r.early_checkout_minutes,
                abnormal_dates: r.abnormal_dates
            };
        });

        const punchStats = {
            total_punches: punches.length,
            unique_employees: [...new Set(punches.map(p => p.attendance_id))].length,
            date_range: { from: project.date_from, to: project.date_to }
        };

        const shiftStats = {
            total_shifts: shifts.length,
            single_shift_count: shifts.filter(s => s.is_single_shift).length,
            friday_shift_count: shifts.filter(s => s.is_friday_shift).length
        };

        const exceptionStats = {
            total_exceptions: exceptions.length,
            by_type: exceptions.reduce((acc, e) => {
                acc[e.type] = (acc[e.type] || 0) + 1;
                return acc;
            }, {})
        };

        return { enrichedResults, punchStats, shiftStats, exceptionStats, currentRules: rules };
    };

    const runAnomalyDetection = async () => {
        setIsAnalyzing(true);
        setActiveAnalysis('anomaly');
        
        try {
            const data = prepareAnalysisData();
            
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `You are an attendance analysis expert. Analyze the following attendance data and identify potential anomalies or discrepancies that might be missed by standard rules.

PROJECT: ${project.name}
DATE RANGE: ${project.date_from} to ${project.date_to}

EMPLOYEE RESULTS (${data.enrichedResults.length} employees):
${JSON.stringify(data.enrichedResults.slice(0, 50), null, 2)}

PUNCH STATISTICS:
${JSON.stringify(data.punchStats, null, 2)}

SHIFT STATISTICS:
${JSON.stringify(data.shiftStats, null, 2)}

EXCEPTION STATISTICS:
${JSON.stringify(data.exceptionStats, null, 2)}

Please identify:
1. Unusual patterns (employees with significantly different attendance than peers)
2. Potential data entry errors (impossible punch times, duplicate patterns)
3. Employees who may need attention (high absences, consistent lateness)
4. Any statistical outliers that warrant manual review
5. Patterns that suggest systematic issues (e.g., many employees late on specific days)

Be specific with employee IDs and dates where possible.`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        anomalies: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    severity: { type: "string", enum: ["high", "medium", "low"] },
                                    type: { type: "string" },
                                    description: { type: "string" },
                                    affected_employees: { type: "array", items: { type: "string" } },
                                    recommendation: { type: "string" }
                                }
                            }
                        },
                        summary: { type: "string" },
                        data_quality_score: { type: "number" }
                    }
                }
            });

            setAiInsights(prev => ({ ...prev, anomalies: response }));
            toast.success('Anomaly detection completed');
        } catch (error) {
            toast.error('Failed to run anomaly detection: ' + error.message);
        } finally {
            setIsAnalyzing(false);
            setActiveAnalysis(null);
        }
    };

    const generateReportSummary = async () => {
        setIsAnalyzing(true);
        setActiveAnalysis('summary');
        
        try {
            const data = prepareAnalysisData();
            
            // Calculate aggregate stats
            const totalEmployees = data.enrichedResults.length;
            const avgPresent = totalEmployees > 0 
                ? (data.enrichedResults.reduce((sum, r) => sum + r.present_days, 0) / totalEmployees).toFixed(1)
                : 0;
            const avgLate = totalEmployees > 0
                ? (data.enrichedResults.reduce((sum, r) => sum + r.late_minutes, 0) / totalEmployees).toFixed(1)
                : 0;
            const totalAbsences = data.enrichedResults.reduce((sum, r) => sum + r.full_absences, 0);
            
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `You are an HR analyst. Generate a comprehensive natural language summary of this attendance report.

PROJECT: ${project.name}
DATE RANGE: ${project.date_from} to ${project.date_to}
DEPARTMENT: ${project.department || 'All'}

KEY METRICS:
- Total Employees Analyzed: ${totalEmployees}
- Average Present Days: ${avgPresent}
- Average Late Minutes per Employee: ${avgLate}
- Total Full Day Absences: ${totalAbsences}
- Total Exceptions Recorded: ${data.exceptionStats.total_exceptions}

EXCEPTION BREAKDOWN:
${JSON.stringify(data.exceptionStats.by_type, null, 2)}

TOP 10 EMPLOYEES BY ABSENCES:
${JSON.stringify(data.enrichedResults.sort((a, b) => b.full_absences - a.full_absences).slice(0, 10), null, 2)}

TOP 10 EMPLOYEES BY LATE MINUTES:
${JSON.stringify(data.enrichedResults.sort((a, b) => b.late_minutes - a.late_minutes).slice(0, 10), null, 2)}

Write a professional executive summary that:
1. Highlights overall attendance performance
2. Identifies concerning trends
3. Recognizes positive patterns
4. Provides actionable insights for management
5. Compares metrics (if context allows)

Use clear, non-technical language suitable for management review.`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        executive_summary: { type: "string" },
                        key_highlights: { type: "array", items: { type: "string" } },
                        concerns: { type: "array", items: { type: "string" } },
                        recommendations: { type: "array", items: { type: "string" } },
                        overall_score: { type: "string" }
                    }
                }
            });

            setAiInsights(prev => ({ ...prev, summary: response }));
            toast.success('Report summary generated');
        } catch (error) {
            toast.error('Failed to generate summary: ' + error.message);
        } finally {
            setIsAnalyzing(false);
            setActiveAnalysis(null);
        }
    };

    const suggestRuleOptimizations = async () => {
        setIsAnalyzing(true);
        setActiveAnalysis('rules');
        
        try {
            const data = prepareAnalysisData();
            
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `You are an attendance system configuration expert. Analyze the current rules and data patterns to suggest optimal configurations.

PROJECT: ${project.name}
DATE RANGE: ${project.date_from} to ${project.date_to}

CURRENT RULES CONFIGURATION:
${JSON.stringify(data.currentRules, null, 2)}

DATA PATTERNS:
- Total Employees: ${data.enrichedResults.length}
- Employees with Single Shift: ${data.shiftStats.single_shift_count}
- Employees with Friday Shift: ${data.shiftStats.friday_shift_count}
- Average Punches per Employee: ${data.punchStats.total_punches / Math.max(1, data.punchStats.unique_employees)}

ATTENDANCE STATISTICS:
- Employees with >3 absences: ${data.enrichedResults.filter(r => r.full_absences > 3).length}
- Employees with >60 late minutes: ${data.enrichedResults.filter(r => r.late_minutes > 60).length}
- Employees with abnormal dates flagged: ${data.enrichedResults.filter(r => r.abnormal_dates).length}

EXCEPTION PATTERNS:
${JSON.stringify(data.exceptionStats.by_type, null, 2)}

Based on this data, suggest:
1. Whether current rules are appropriate for this workforce
2. Specific parameter adjustments (e.g., cluster window, late thresholds)
3. New rules that might be beneficial
4. Rules that might be too strict or too lenient
5. Best practices for this type of project`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        current_assessment: { type: "string" },
                        suggestions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    rule_area: { type: "string" },
                                    current_value: { type: "string" },
                                    suggested_value: { type: "string" },
                                    rationale: { type: "string" },
                                    impact: { type: "string" }
                                }
                            }
                        },
                        best_practices: { type: "array", items: { type: "string" } },
                        warnings: { type: "array", items: { type: "string" } }
                    }
                }
            });

            setAiInsights(prev => ({ ...prev, rules: response }));
            toast.success('Rule suggestions generated');
        } catch (error) {
            toast.error('Failed to generate suggestions: ' + error.message);
        } finally {
            setIsAnalyzing(false);
            setActiveAnalysis(null);
        }
    };

    const runFullAnalysis = async () => {
        await runAnomalyDetection();
        await generateReportSummary();
        await suggestRuleOptimizations();
    };

    return (
        <div className="space-y-6">
            {/* AI Analysis Actions */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                        AI-Powered Analysis
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-slate-600 mb-4">
                        Use AI to gain deeper insights into your attendance data, detect hidden patterns, and optimize your configuration.
                    </p>
                    
                    {results.length === 0 ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
                            <AlertTriangle className="w-5 h-5 inline mr-2" />
                            Please run the standard analysis first before using AI features.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Button
                                onClick={runAnomalyDetection}
                                disabled={isAnalyzing}
                                variant="outline"
                                className="h-auto py-4 flex flex-col items-center gap-2"
                            >
                                {activeAnalysis === 'anomaly' ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                                ) : (
                                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                                )}
                                <span className="font-medium">Detect Anomalies</span>
                                <span className="text-xs text-slate-500">Find hidden issues</span>
                            </Button>
                            
                            <Button
                                onClick={generateReportSummary}
                                disabled={isAnalyzing}
                                variant="outline"
                                className="h-auto py-4 flex flex-col items-center gap-2"
                            >
                                {activeAnalysis === 'summary' ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                                ) : (
                                    <FileText className="w-6 h-6 text-blue-600" />
                                )}
                                <span className="font-medium">Generate Summary</span>
                                <span className="text-xs text-slate-500">Natural language report</span>
                            </Button>
                            
                            <Button
                                onClick={suggestRuleOptimizations}
                                disabled={isAnalyzing}
                                variant="outline"
                                className="h-auto py-4 flex flex-col items-center gap-2"
                            >
                                {activeAnalysis === 'rules' ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                                ) : (
                                    <Settings className="w-6 h-6 text-green-600" />
                                )}
                                <span className="font-medium">Suggest Rules</span>
                                <span className="text-xs text-slate-500">Optimize configuration</span>
                            </Button>
                        </div>
                    )}
                    
                    {results.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                            <Button
                                onClick={runFullAnalysis}
                                disabled={isAnalyzing}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                <Sparkles className="w-4 h-4 mr-2" />
                                Run Full AI Analysis
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Anomaly Detection Results */}
            {aiInsights?.anomalies && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            Anomaly Detection Results
                        </CardTitle>
                        <Button size="sm" variant="ghost" onClick={runAnomalyDetection}>
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                            <span className="text-sm text-slate-600">Data Quality Score:</span>
                            <span className={`font-bold text-lg ${
                                aiInsights.anomalies.data_quality_score >= 80 ? 'text-green-600' :
                                aiInsights.anomalies.data_quality_score >= 60 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                                {aiInsights.anomalies.data_quality_score}/100
                            </span>
                        </div>
                        
                        <p className="text-slate-700">{aiInsights.anomalies.summary}</p>
                        
                        <div className="space-y-3">
                            {aiInsights.anomalies.anomalies?.map((anomaly, idx) => (
                                <div key={idx} className={`p-4 rounded-lg border ${
                                    anomaly.severity === 'high' ? 'bg-red-50 border-red-200' :
                                    anomaly.severity === 'medium' ? 'bg-amber-50 border-amber-200' :
                                    'bg-blue-50 border-blue-200'
                                }`}>
                                    <div className="flex items-start gap-3">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            anomaly.severity === 'high' ? 'bg-red-100 text-red-700' :
                                            anomaly.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                                            'bg-blue-100 text-blue-700'
                                        }`}>
                                            {anomaly.severity.toUpperCase()}
                                        </span>
                                        <div className="flex-1">
                                            <p className="font-medium text-slate-900">{anomaly.type}</p>
                                            <p className="text-sm text-slate-600 mt-1">{anomaly.description}</p>
                                            {anomaly.affected_employees?.length > 0 && (
                                                <p className="text-xs text-slate-500 mt-2">
                                                    Affected: {anomaly.affected_employees.join(', ')}
                                                </p>
                                            )}
                                            <p className="text-sm text-slate-700 mt-2 font-medium">
                                                → {anomaly.recommendation}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Report Summary */}
            {aiInsights?.summary && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Executive Summary
                        </CardTitle>
                        <Button size="sm" variant="ghost" onClick={generateReportSummary}>
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">Overall Assessment:</span>
                            <span className="font-bold text-indigo-600">{aiInsights.summary.overall_score}</span>
                        </div>
                        
                        <div className="prose prose-sm max-w-none">
                            <ReactMarkdown>{aiInsights.summary.executive_summary}</ReactMarkdown>
                        </div>
                        
                        {aiInsights.summary.key_highlights?.length > 0 && (
                            <div>
                                <h4 className="font-medium text-slate-900 mb-2">Key Highlights</h4>
                                <ul className="space-y-1">
                                    {aiInsights.summary.key_highlights.map((h, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm">
                                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                            <span>{h}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        {aiInsights.summary.concerns?.length > 0 && (
                            <div>
                                <h4 className="font-medium text-slate-900 mb-2">Concerns</h4>
                                <ul className="space-y-1">
                                    {aiInsights.summary.concerns.map((c, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm">
                                            <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                                            <span>{c}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        {aiInsights.summary.recommendations?.length > 0 && (
                            <div className="bg-indigo-50 p-4 rounded-lg">
                                <h4 className="font-medium text-indigo-900 mb-2">Recommendations</h4>
                                <ul className="space-y-1">
                                    {aiInsights.summary.recommendations.map((r, idx) => (
                                        <li key={idx} className="text-sm text-indigo-800">• {r}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Rule Suggestions */}
            {aiInsights?.rules && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="w-5 h-5 text-green-600" />
                            Rule Optimization Suggestions
                        </CardTitle>
                        <Button size="sm" variant="ghost" onClick={suggestRuleOptimizations}>
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-slate-700">{aiInsights.rules.current_assessment}</p>
                        
                        {aiInsights.rules.warnings?.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <h4 className="font-medium text-amber-900 mb-2">⚠️ Warnings</h4>
                                <ul className="space-y-1">
                                    {aiInsights.rules.warnings.map((w, idx) => (
                                        <li key={idx} className="text-sm text-amber-800">• {w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        {aiInsights.rules.suggestions?.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="font-medium text-slate-900">Suggested Changes</h4>
                                {aiInsights.rules.suggestions.map((s, idx) => (
                                    <div key={idx} className="p-4 bg-slate-50 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-slate-900">{s.rule_area}</span>
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                                {s.impact}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                                            <div>
                                                <span className="text-slate-500">Current:</span>
                                                <span className="ml-2 font-mono text-red-600">{s.current_value}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500">Suggested:</span>
                                                <span className="ml-2 font-mono text-green-600">{s.suggested_value}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-600">{s.rationale}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {aiInsights.rules.best_practices?.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <h4 className="font-medium text-green-900 mb-2">✓ Best Practices</h4>
                                <ul className="space-y-1">
                                    {aiInsights.rules.best_practices.map((bp, idx) => (
                                        <li key={idx} className="text-sm text-green-800">• {bp}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}