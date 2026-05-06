import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, CheckCircle2, AlertTriangle, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NextActionPanel({ 
    project, 
    stats = {}, 
    onNavigate 
}) {
    const { 
        punchCount = 0, 
        shiftCount = 0, 
        exceptionCount = 0, 
        unmatchedCount = 0,
        hasReport = false,
        isFinalized = false
    } = stats;

    const getRecommendation = () => {
        if (isFinalized) {
            return {
                title: "Project Completed",
                description: "This project has been finalized and locked. You can view the salary reports or historical data.",
                action: "View Salary Reports",
                tab: "salary",
                icon: CheckCircle2,
                variant: "success"
            };
        }

        if (punchCount === 0) {
            return {
                title: "Step 1: Upload Attendance",
                description: "Start by uploading the punch logs for this period. We support Astra and Naser Mohsin formats.",
                action: "Go to Punches",
                tab: "punches",
                icon: Play,
                variant: "indigo"
            };
        }

        if (shiftCount === 0) {
            return {
                title: "Step 2: Configure Shifts",
                description: "You have punches but no shifts defined. Add shift timings to calculate lateness correctly.",
                action: "Configure Shifts",
                tab: "shifts",
                icon: Play,
                variant: "indigo"
            };
        }

        if (unmatchedCount > 0) {
            return {
                title: "Data Quality Alert",
                description: `There are ${unmatchedCount} employees in the punch logs who are not in the master list.`,
                action: "Fix Overrides",
                tab: "overview", // This actually stays in overview or triggers the override dialog
                icon: AlertTriangle,
                variant: "warning"
            };
        }

        if (!hasReport) {
            return {
                title: "Ready for Analysis",
                description: "All data prerequisites are met. You can now run the attendance analysis report.",
                action: "Run Analysis",
                tab: "report",
                icon: Sparkles,
                variant: "indigo"
            };
        }

        return {
            title: "Review & Finalize",
            description: "Analysis is complete. Review the exceptions and finalize the project for payroll.",
            action: "Finalize Project",
            tab: "report",
            icon: CheckCircle2,
            variant: "indigo"
        };
    };

    const recommendation = getRecommendation();
    const Icon = recommendation.icon;

    return (
        <Card className={cn(
            "border-0 shadow-lg ring-1 transition-all duration-500",
            recommendation.variant === 'success' ? "bg-green-50 ring-green-200" :
            recommendation.variant === 'warning' ? "bg-amber-50 ring-amber-200" :
            "bg-indigo-50 ring-indigo-200"
        )}>
            <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                        <div className={cn(
                            "p-3 rounded-2xl shadow-sm",
                            recommendation.variant === 'success' ? "bg-green-600 text-white" :
                            recommendation.variant === 'warning' ? "bg-amber-600 text-white" :
                            "bg-indigo-600 text-white"
                        )}>
                            <Icon className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                            <h3 className={cn(
                                "text-lg font-bold",
                                recommendation.variant === 'success' ? "text-green-900" :
                                recommendation.variant === 'warning' ? "text-amber-900" :
                                "text-indigo-900"
                            )}>
                                {recommendation.title}
                            </h3>
                            <p className={cn(
                                "text-sm",
                                recommendation.variant === 'success' ? "text-green-700" :
                                recommendation.variant === 'warning' ? "text-amber-700" :
                                "text-indigo-700"
                            )}>
                                {recommendation.description}
                            </p>
                        </div>
                    </div>

                    <Button 
                        onClick={() => onNavigate(recommendation.tab)}
                        className={cn(
                            "group font-bold px-6",
                            recommendation.variant === 'success' ? "bg-green-600 hover:bg-green-700" :
                            recommendation.variant === 'warning' ? "bg-amber-600 hover:bg-amber-700" :
                            "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100"
                        )}
                    >
                        {recommendation.action}
                        <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-300 group-hover:translate-x-1" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
