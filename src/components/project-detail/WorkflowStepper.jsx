import React from 'react';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const steps = [
    { id: 'setup', label: 'Data Setup', description: 'Punches & Shifts' },
    { id: 'review', label: 'Review', description: 'Exceptions & OT' },
    { id: 'analysis', label: 'Analysis', description: 'Run Report' },
    { id: 'finalized', label: 'Finalized', description: 'Payroll Ready' }
];

export default function WorkflowStepper({ currentStatus, currentTab }) {
    // Map project status and active tab to stepper progress
    const getStepStatus = (stepId, index) => {
        const statusMap = {
            'draft': 0,
            'analyzed': 2,
            'locked': 3,
            'closed': 4
        };
        
        const currentProgress = statusMap[currentStatus] || 0;
        
        if (currentStatus === 'closed') return 'completed';
        if (index < currentProgress) return 'completed';
        if (index === currentProgress) return 'active';
        return 'pending';
    };

    return (
        <div className="w-full py-4 px-2">
            <div className="relative flex justify-between">
                {/* Connection Lines */}
                <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-200 -z-0" />
                
                {steps.map((step, index) => {
                    const status = getStepStatus(step.id, index);
                    const isLast = index === steps.length - 1;
                    
                    return (
                        <div key={step.id} className="relative flex flex-col items-center flex-1 group">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10",
                                status === 'completed' ? "bg-green-600 border-green-600 text-white shadow-lg shadow-green-100" :
                                status === 'active' ? "bg-white border-indigo-600 text-indigo-600 ring-4 ring-indigo-50" :
                                "bg-white border-slate-300 text-slate-400"
                            )}>
                                {status === 'completed' ? (
                                    <CheckCircle2 className="w-6 h-6" />
                                ) : (
                                    <span className="text-sm font-bold">{index + 1}</span>
                                )}
                            </div>
                            
                            <div className="mt-3 text-center">
                                <p className={cn(
                                    "text-xs font-bold uppercase tracking-wider",
                                    status === 'completed' ? "text-green-700" :
                                    status === 'active' ? "text-indigo-700" :
                                    "text-slate-500"
                                )}>
                                    {step.label}
                                </p>
                                <p className="text-[10px] text-slate-400 font-medium hidden sm:block">
                                    {step.description}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
