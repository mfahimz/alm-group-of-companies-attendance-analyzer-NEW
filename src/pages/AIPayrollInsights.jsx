import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, TrendingUp, FileText, Sparkles, Brain, RefreshCw, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/components/ui/PageTitle';
import Breadcrumb from '@/components/ui/Breadcrumb';
import { useCompanyFilter } from '../components/context/CompanyContext';

export default function AIPayrollInsights() {
    usePageTitle('AI Payroll Insights');
    const [selectedProject, setSelectedProject] = useState('all');
    const [activeTab, setActiveTab] = useState('anomaly');
    const { selectedCompany } = useCompanyFilter();

    // Fetch current user
    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Fetch projects
    const { data: projects = [] } = useQuery({
        queryKey: ['projects', selectedCompany],
        queryFn: async () => {
            if (selectedCompany) {
                return base44.entities.Project.filter({ company: selectedCompany });
            }
            return base44.entities.Project.list();
        },
        enabled: !!user
    });

    // AI Analysis Mutation
    const aiAnalysisMutation = useMutation({
        mutationFn: async ({ project_id, analysis_type }) => {
            const response = await base44.functions.invoke('analyzePayrollWithAI', {
                project_id: project_id === 'all' ? null : project_id,
                analysis_type
            });
            return response.data;
        },
        onError: (error) => {
            toast.error(`AI Analysis failed: ${error.message}`);
        }
    });

    const handleAnalyze = (type) => {
        aiAnalysisMutation.mutate({
            project_id: selectedProject,
            analysis_type: type
        });
    };

    const anomalyResult = activeTab === 'anomaly' && aiAnalysisMutation.data?.analysis_type === 'anomaly_detection' 
        ? aiAnalysisMutation.data.result : null;
    const predictionResult = activeTab === 'prediction' && aiAnalysisMutation.data?.analysis_type === 'cost_prediction'
        ? aiAnalysisMutation.data.result : null;
    const optimizationResult = activeTab === 'optimization' && aiAnalysisMutation.data?.analysis_type === 'optimization_report'
        ? aiAnalysisMutation.data.result : null;

    return (
        <div className="container mx-auto py-6 space-y-6">
            <Breadcrumb items={[{ label: 'AI Payroll Insights' }]} />

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-[#1F2937] flex items-center gap-2">
                        <Brain className="w-8 h-8 text-purple-600" />
                        AI Payroll Insights
                    </h1>
                    <p className="text-[#6B7280] mt-1">
                        Intelligent analysis powered by AI to detect anomalies, predict costs, and optimize payroll
                    </p>
                </div>
            </div>

            {/* Project Selection */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Analysis Settings</CardTitle>
                    <CardDescription>Select a project or analyze all recent data</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Select value={selectedProject} onValueChange={setSelectedProject}>
                            <SelectTrigger className="w-[300px]">
                                <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Recent Data</SelectItem>
                                {projects.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name} ({p.company})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Analysis Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="anomaly" className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Anomaly Detection
                    </TabsTrigger>
                    <TabsTrigger value="prediction" className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Cost Prediction
                    </TabsTrigger>
                    <TabsTrigger value="optimization" className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Optimization Report
                    </TabsTrigger>
                </TabsList>

                {/* Anomaly Detection Tab */}
                <TabsContent value="anomaly" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Anomaly Detection</span>
                                <Button 
                                    onClick={() => handleAnalyze('anomaly_detection')}
                                    disabled={aiAnalysisMutation.isPending}
                                    className="gap-2"
                                >
                                    {aiAnalysisMutation.isPending ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="w-4 h-4" />
                                    )}
                                    {aiAnalysisMutation.isPending ? 'Analyzing...' : 'Run Analysis'}
                                </Button>
                            </CardTitle>
                            <CardDescription>
                                AI-powered detection of payroll anomalies and discrepancies
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {anomalyResult ? (
                                <div className="space-y-4">
                                    {/* Health Score */}
                                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
                                        <div>
                                            <p className="text-sm text-[#6B7280]">Overall Health Score</p>
                                            <p className="text-2xl font-bold text-[#1F2937]">
                                                {anomalyResult.overall_health_score}/100
                                            </p>
                                        </div>
                                        <Badge variant={anomalyResult.overall_health_score > 80 ? 'success' : anomalyResult.overall_health_score > 60 ? 'warning' : 'destructive'}>
                                            {anomalyResult.overall_health_score > 80 ? 'Healthy' : anomalyResult.overall_health_score > 60 ? 'Fair' : 'Needs Attention'}
                                        </Badge>
                                    </div>

                                    {/* Summary */}
                                    <div className="p-4 bg-slate-50 rounded-lg">
                                        <p className="text-sm text-[#4B5563]">{anomalyResult.summary}</p>
                                    </div>

                                    {/* Anomalies List */}
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-[#1F2937]">Detected Anomalies ({anomalyResult.anomalies?.length || 0})</h3>
                                        {anomalyResult.anomalies?.map((anomaly, idx) => (
                                            <Card key={idx} className={`border-l-4 ${
                                                anomaly.severity === 'high' ? 'border-l-red-500' :
                                                anomaly.severity === 'medium' ? 'border-l-yellow-500' :
                                                'border-l-blue-500'
                                            }`}>
                                                <CardContent className="p-4">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <Badge variant={
                                                            anomaly.severity === 'high' ? 'destructive' :
                                                            anomaly.severity === 'medium' ? 'warning' : 'default'
                                                        }>
                                                            {anomaly.severity.toUpperCase()}
                                                        </Badge>
                                                        <span className="text-xs text-[#6B7280]">{anomaly.category}</span>
                                                    </div>
                                                    <p className="text-sm font-medium text-[#1F2937] mb-2">{anomaly.description}</p>
                                                    {anomaly.affected_employees && anomaly.affected_employees.length > 0 && (
                                                        <p className="text-xs text-[#6B7280] mb-2">
                                                            Affected: {anomaly.affected_employees.join(', ')}
                                                        </p>
                                                    )}
                                                    <div className="mt-3 p-3 bg-blue-50 rounded-md">
                                                        <p className="text-xs font-medium text-blue-900 flex items-center gap-1">
                                                            <ChevronRight className="w-3 h-3" />
                                                            Recommended Action
                                                        </p>
                                                        <p className="text-xs text-blue-700 mt-1">{anomaly.recommended_action}</p>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-[#6B7280]">
                                    <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-purple-400" />
                                    <p>Click "Run Analysis" to detect payroll anomalies</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Cost Prediction Tab */}
                <TabsContent value="prediction" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Cost Prediction</span>
                                <Button 
                                    onClick={() => handleAnalyze('cost_prediction')}
                                    disabled={aiAnalysisMutation.isPending}
                                    className="gap-2"
                                >
                                    {aiAnalysisMutation.isPending ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="w-4 h-4" />
                                    )}
                                    {aiAnalysisMutation.isPending ? 'Analyzing...' : 'Generate Forecast'}
                                </Button>
                            </CardTitle>
                            <CardDescription>
                                Predictive insights into future payroll costs and trends
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {predictionResult ? (
                                <div className="space-y-4">
                                    {/* Predictions */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {predictionResult.predictions?.map((pred, idx) => (
                                            <Card key={idx} className="bg-gradient-to-br from-green-50 to-emerald-50">
                                                <CardContent className="p-4">
                                                    <p className="text-sm text-[#6B7280] mb-1">{pred.month}</p>
                                                    <p className="text-2xl font-bold text-[#1F2937]">
                                                        AED {pred.predicted_cost?.toLocaleString()}
                                                    </p>
                                                    <Badge variant="outline" className="mt-2">
                                                        {pred.confidence_level} confidence
                                                    </Badge>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>

                                    {/* Growth Trend */}
                                    <Card className="bg-blue-50">
                                        <CardContent className="p-4">
                                            <p className="text-sm font-medium text-blue-900 mb-2">Growth Trend Analysis</p>
                                            <p className="text-sm text-blue-700">{predictionResult.growth_trend}</p>
                                        </CardContent>
                                    </Card>

                                    {/* Key Factors */}
                                    <div>
                                        <h3 className="font-semibold text-[#1F2937] mb-3">Key Influencing Factors</h3>
                                        <div className="space-y-2">
                                            {predictionResult.key_factors?.map((factor, idx) => (
                                                <div key={idx} className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                                                    <ChevronRight className="w-4 h-4 text-purple-600 mt-0.5" />
                                                    <p className="text-sm text-[#4B5563]">{factor}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Cost Savings */}
                                    <div>
                                        <h3 className="font-semibold text-[#1F2937] mb-3">Cost-Saving Opportunities</h3>
                                        <div className="space-y-2">
                                            {predictionResult.cost_saving_opportunities?.map((opp, idx) => (
                                                <div key={idx} className="flex items-start gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                                                    <ChevronRight className="w-4 h-4 text-green-600 mt-0.5" />
                                                    <p className="text-sm text-green-900">{opp}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Risk Factors */}
                                    <div>
                                        <h3 className="font-semibold text-[#1F2937] mb-3">Risk Factors</h3>
                                        <div className="space-y-2">
                                            {predictionResult.risk_factors?.map((risk, idx) => (
                                                <div key={idx} className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                                                    <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                                                    <p className="text-sm text-red-900">{risk}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-[#6B7280]">
                                    <TrendingUp className="w-12 h-12 mx-auto mb-3 text-green-400" />
                                    <p>Click "Generate Forecast" to predict future payroll costs</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Optimization Report Tab */}
                <TabsContent value="optimization" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Optimization Report</span>
                                <Button 
                                    onClick={() => handleAnalyze('optimization_report')}
                                    disabled={aiAnalysisMutation.isPending}
                                    className="gap-2"
                                >
                                    {aiAnalysisMutation.isPending ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="w-4 h-4" />
                                    )}
                                    {aiAnalysisMutation.isPending ? 'Analyzing...' : 'Generate Report'}
                                </Button>
                            </CardTitle>
                            <CardDescription>
                                Comprehensive analysis with actionable optimization recommendations
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {optimizationResult ? (
                                <div className="space-y-4">
                                    {/* Key Metrics */}
                                    <div>
                                        <h3 className="font-semibold text-[#1F2937] mb-3">Key Metrics</h3>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <Card className="bg-purple-50">
                                                <CardContent className="p-4">
                                                    <p className="text-xs text-[#6B7280] mb-1">Avg Salary</p>
                                                    <p className="text-xl font-bold text-[#1F2937]">
                                                        AED {optimizationResult.key_metrics?.average_salary?.toLocaleString()}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                            <Card className="bg-red-50">
                                                <CardContent className="p-4">
                                                    <p className="text-xs text-[#6B7280] mb-1">Total Deductions</p>
                                                    <p className="text-xl font-bold text-[#1F2937]">
                                                        AED {optimizationResult.key_metrics?.total_deductions?.toLocaleString()}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                            <Card className="bg-green-50">
                                                <CardContent className="p-4">
                                                    <p className="text-xs text-[#6B7280] mb-1">Attendance Rate</p>
                                                    <p className="text-xl font-bold text-[#1F2937]">
                                                        {optimizationResult.key_metrics?.average_attendance_rate?.toFixed(1)}%
                                                    </p>
                                                </CardContent>
                                            </Card>
                                            <Card className="bg-blue-50">
                                                <CardContent className="p-4">
                                                    <p className="text-xs text-[#6B7280] mb-1">Avg Late (min)</p>
                                                    <p className="text-xl font-bold text-[#1F2937]">
                                                        {optimizationResult.key_metrics?.average_late_minutes?.toFixed(0)}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </div>

                                    {/* Compliance Score */}
                                    <Card className="bg-gradient-to-r from-indigo-50 to-purple-50">
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-[#6B7280]">Compliance Score</p>
                                                    <p className="text-3xl font-bold text-[#1F2937]">
                                                        {optimizationResult.compliance_score}/100
                                                    </p>
                                                </div>
                                                <Badge variant={optimizationResult.compliance_score > 90 ? 'success' : 'warning'}>
                                                    {optimizationResult.compliance_score > 90 ? 'Excellent' : 'Good'}
                                                </Badge>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Attendance Insights */}
                                    <Card className="bg-blue-50">
                                        <CardContent className="p-4">
                                            <p className="text-sm font-medium text-blue-900 mb-2">Attendance Insights</p>
                                            <p className="text-sm text-blue-700">{optimizationResult.attendance_insights}</p>
                                        </CardContent>
                                    </Card>

                                    {/* Optimization Areas */}
                                    <div>
                                        <h3 className="font-semibold text-[#1F2937] mb-3">Optimization Opportunities</h3>
                                        <div className="space-y-3">
                                            {optimizationResult.optimization_areas?.map((area, idx) => (
                                                <Card key={idx} className={`border-l-4 ${
                                                    area.impact === 'high' ? 'border-l-red-500 bg-red-50' :
                                                    area.impact === 'medium' ? 'border-l-yellow-500 bg-yellow-50' :
                                                    'border-l-blue-500 bg-blue-50'
                                                }`}>
                                                    <CardContent className="p-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="font-medium text-[#1F2937]">{area.area}</p>
                                                            <Badge variant={area.impact === 'high' ? 'destructive' : area.impact === 'medium' ? 'warning' : 'default'}>
                                                                {area.impact} impact
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-[#4B5563] mb-2">{area.description}</p>
                                                        <div className="p-3 bg-white rounded-md">
                                                            <p className="text-xs font-medium text-[#1F2937] mb-1">Recommendation:</p>
                                                            <p className="text-xs text-[#6B7280]">{area.recommendation}</p>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Prioritized Recommendations */}
                                    <div>
                                        <h3 className="font-semibold text-[#1F2937] mb-3">Prioritized Action Items</h3>
                                        <div className="space-y-2">
                                            {optimizationResult.recommendations?.map((rec, idx) => (
                                                <Card key={idx} className={
                                                    rec.priority === 'high' ? 'bg-red-50 border-red-200' :
                                                    rec.priority === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                                                    'bg-blue-50 border-blue-200'
                                                }>
                                                    <CardContent className="p-4">
                                                        <div className="flex items-start gap-3">
                                                            <Badge variant={rec.priority === 'high' ? 'destructive' : rec.priority === 'medium' ? 'warning' : 'default'}>
                                                                {rec.priority}
                                                            </Badge>
                                                            <div className="flex-1">
                                                                <p className="font-medium text-[#1F2937] mb-1">{rec.title}</p>
                                                                <p className="text-sm text-[#4B5563] mb-2">{rec.description}</p>
                                                                <p className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded inline-block">
                                                                    Expected Benefit: {rec.expected_benefit}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-[#6B7280]">
                                    <FileText className="w-12 h-12 mx-auto mb-3 text-blue-400" />
                                    <p>Click "Generate Report" to get optimization insights</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}