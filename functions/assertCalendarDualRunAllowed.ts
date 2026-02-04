import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 4 GUARD: Calendar Dual-Run Check
 * 
 * Ensures calendar payroll operations are only available when:
 * 1. Company has calendar_dual_run_enabled = true
 * 2. Company is Al Maraghi Motors (explicit scope)
 * 
 * Returns: { allowed: true } if enabled
 * Returns: { allowed: false, error, status } if blocked
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

        // SCOPE RESTRICTION: Al Maraghi Motors only
        if (company !== 'Al Maraghi Motors') {
            return Response.json({ 
                allowed: false,
                error: `Calendar payroll is only available for Al Maraghi Motors. Company "${company}" cannot use this feature.`,
                status: 403
            });
        }

        // Fetch company settings
        const companySettings = await base44.asServiceRole.entities.CompanySettings.filter({ 
            company: company 
        }, null, 1);
        
        if (companySettings.length === 0) {
            return Response.json({ 
                allowed: false,
                error: `Company settings not found for "${company}". Please configure company settings first.`,
                status: 404
            });
        }

        const settings = companySettings[0];

        // Check if dual-run is enabled
        if (!settings.calendar_dual_run_enabled) {
            return Response.json({ 
                allowed: false,
                error: `Calendar dual-run is not enabled for ${company}. Enable it in Company Settings first.`,
                status: 403
            });
        }

        // Allow calendar operations
        return Response.json({ 
            allowed: true,
            company: company,
            calendar_dual_run_enabled: true
        });

    } catch (error) {
        console.error('[assertCalendarDualRunAllowed] Error:', error);
        return Response.json({ 
            allowed: false,
            error: error.message,
            status: 500
        });
    }
});