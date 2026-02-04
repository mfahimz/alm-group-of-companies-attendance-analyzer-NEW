import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';

/**
 * PayrollModeAlert Component
 * 
 * Displays a banner when a company uses CALENDAR payroll mode,
 * blocking access to legacy PROJECT-based payroll features.
 */
export default function PayrollModeAlert({ company }) {
    return (
        <Alert className="border-amber-300 bg-amber-50 mb-6">
            <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                    <h3 className="font-semibold text-amber-900 mb-1">
                        Calendar-Based Payroll Active
                    </h3>
                    <p className="text-sm text-amber-800">
                        <strong>{company}</strong> uses Calendar-based Payroll. 
                        Project-based payroll features (Run Analysis, Finalize Reports, Salary Snapshots) are disabled.
                    </p>
                    <p className="text-sm text-amber-700 mt-2">
                        Please use the <strong>Calendar</strong> module for payroll operations.
                    </p>
                </div>
            </div>
        </Alert>
    );
}