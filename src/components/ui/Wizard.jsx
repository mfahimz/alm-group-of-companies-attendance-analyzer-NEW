import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Wizard({ steps, onComplete, onCancel }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState({});

    const currentStepData = steps[currentStep];
    const isLastStep = currentStep === steps.length - 1;
    const isFirstStep = currentStep === 0;

    const handleNext = (stepData) => {
        const newData = { ...formData, ...stepData };
        setFormData(newData);

        if (isLastStep) {
            onComplete(newData);
        } else {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        setCurrentStep(prev => prev - 1);
    };

    return (
        <div className="space-y-6">
            {/* Progress Steps */}
            <div className="flex items-center justify-between">
                {steps.map((step, idx) => (
                    <React.Fragment key={idx}>
                        <div className="flex items-center">
                            <div
                                className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all",
                                    idx < currentStep
                                        ? "bg-green-500 text-white"
                                        : idx === currentStep
                                        ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                                        : "bg-slate-200 text-slate-600"
                                )}
                            >
                                {idx < currentStep ? (
                                    <Check className="w-5 h-5" />
                                ) : (
                                    idx + 1
                                )}
                            </div>
                            <div className="ml-3">
                                <p className={cn(
                                    "text-sm font-semibold",
                                    idx === currentStep ? "text-indigo-600" : "text-slate-600"
                                )}>
                                    {step.title}
                                </p>
                                <p className="text-xs text-slate-500">{step.description}</p>
                            </div>
                        </div>
                        {idx < steps.length - 1 && (
                            <div className={cn(
                                "flex-1 h-1 mx-4 rounded transition-all",
                                idx < currentStep ? "bg-green-500" : "bg-slate-200"
                            )} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Step Content */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle>{currentStepData.title}</CardTitle>
                    {currentStepData.description && (
                        <p className="text-sm text-slate-600 mt-1">{currentStepData.description}</p>
                    )}
                </CardHeader>
                <CardContent>
                    {currentStepData.component({ 
                        onNext: handleNext, 
                        onBack: handleBack,
                        formData,
                        isFirstStep,
                        isLastStep
                    })}
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
                <Button
                    variant="outline"
                    onClick={isFirstStep ? onCancel : handleBack}
                    className="gap-2"
                >
                    {isFirstStep ? (
                        "Cancel"
                    ) : (
                        <>
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}