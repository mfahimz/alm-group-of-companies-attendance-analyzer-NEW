import React, { useState } from 'react';
import { formatInUAE } from '@/components/ui/timezone';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AL_MARAGHI_MOTORS_COMPANY_ID } from '@/constants/companyIds';
import CommandCenter from '../project-detail/CommandCenter';

export default function OverviewTab({ project, salaryDivisor, prevMonthDays }) {
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });

    const { data: results = [] } = useQuery({
        queryKey: ['results', project.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ project_id: project.id })
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    const { data: projectEmployees = [] } = useQuery({
        queryKey: ['projectEmployees', project.id],
        queryFn: () => base44.entities.ProjectEmployee.filter({ project_id: project.id })
    });

    const uniqueEmployees = new Set(punches.map(p => String(p.attendance_id))).size;

    const unmatchedCount = React.useMemo(() => {
        if (!punches.length) return 0;
        const masterIds = new Set(employees.map(e => String(e.attendance_id)));
        const projectIds = new Set(projectEmployees.map(e => String(e.attendance_id)));
        const punchIds = new Set(punches.map(p => String(p.attendance_id)));
        return Array.from(punchIds).filter(id => !masterIds.has(id) && !projectIds.has(id)).length;
    }, [punches, employees, projectEmployees]);

    const calculateWorkingDays = () => {
        const startDate = new Date(project.date_from);
        const endDate = new Date(project.date_to);
        let days = 0;
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            if (d.getDay() !== 0) days++;
        }
        return days;
    };

    const dashboardStats = {
        punchCount: punches.length,
        shiftCount: project.shift_blocks_count || 0,
        exceptionCount: exceptions.length,
        unmatchedCount: unmatchedCount,
        employeeCount: uniqueEmployees,
        hasReport: !!project.last_saved_report_id || results.length > 0,
        isFinalized: project.status === 'closed',
        lastAnalysisDate: project.updated_date,
        workingDays: calculateWorkingDays()
    };

    return (
        <div className="space-y-6">
            <CommandCenter 
                project={project}
                stats={dashboardStats}
                salaryDivisor={salaryDivisor}
                prevMonthDays={prevMonthDays}
                onNavigate={(tab) => {
                    window.dispatchEvent(new CustomEvent('changeTab', { detail: tab }));
                }}
            />
        </div>
    );
}