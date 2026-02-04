import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PAYROLL MODE GUARD
 * 
 * Centralized entry-point check for project-based payroll operations.
 * Prevents legacy payroll functions from running when company uses CALENDAR mode.
 * 
 * Usage: Call this at the START of any legacy payroll function.
 * 
 * Returns: { allowed: true } if PROJECT mode
 * Returns: { allowed: false, error, status } if CALENDAR mode (with 403 response ready)
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { company } = await req.json();

        if (!company) {
            return Response.json({ 
                allowed: false,
                error: 'company is required',
                status: 400
            });
        }

        // Fetch company settings
        const companySettings = await base44.asServiceRole.entities.CompanySettings.filter({ 
            company: company 
        }, null, 1);
        
        // Default to PROJECT mode if no settings found
        if (companySettings.length === 0 || !companySettings[0].payroll_mode) {
            return Response.json({ 
                allowed: true,
                payroll_mode: 'PROJECT'
            });
        }

        const settings = companySettings[0];
        const payrollMode = settings.payroll_mode || 'PROJECT';
        const calendarDualRunEnabled = settings.calendar_dual_run_enabled || false;

        // PHASE 4 FIX: If calendar_dual_run_enabled = true, ALLOW legacy payroll
        // Both systems run in parallel (legacy for payment, calendar for preview)
        if (calendarDualRunEnabled) {
            return Response.json({ 
                allowed: true,
                payroll_mode: payrollMode,
                calendar_dual_run_enabled: true,
                message: 'Dual-run mode: Both systems active (PROJECT for payment, CALENDAR for preview)'
            });
        }

        // Block if CALENDAR mode (and dual-run NOT enabled)
        if (payrollMode === 'CALENDAR') {
            return Response.json({ 
                allowed: false,
                payroll_mode: 'CALENDAR',
                error: `This company uses Calendar-based Payroll. Project-based payroll operations are disabled. Please use the Calendar module instead.`,
                status: 403
            });
        }

        // Allow if PROJECT mode
        return Response.json({ 
            allowed: true,
            payroll_mode: 'PROJECT'
        });

    } catch (error) {
        console.error('[assertProjectPayrollAllowed] Error:', error);
        return Response.json({ 
            allowed: false,
            error: error.message,
            status: 500
        });
    }
});