import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to get quarter from date
function getQuarter(date) {
    const month = date.getMonth() + 1;
    if (month <= 3) return 1;
    if (month <= 6) return 2;
    if (month <= 9) return 3;
    return 4;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // This is a system automation, no user auth required
        const targetCompany = "Al Maraghi Auto Repairs";
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-12
        const currentDay = now.getDate();
        const currentQuarter = getQuarter(now);

        // Only run on quarter start dates (1st of Jan/Apr/Jul/Oct)
        const isQuarterStart = currentDay === 1 && [1, 4, 7, 10].includes(currentMonth);
        
        if (!isQuarterStart) {
            console.log(`Not a quarter start date. Current: ${now.toISOString()}`);
            return Response.json({
                success: true,
                message: 'Not a quarter start date, skipping reset',
                current_date: now.toISOString()
            });
        }

        console.log(`Starting quarterly reset for ${targetCompany} - Q${currentQuarter} ${currentYear}`);

        // Get all active employees from Al Maraghi Auto Repairs
        const allEmployees = await base44.asServiceRole.entities.Employee.filter({
            company: targetCompany,
            active: true
        });

        console.log(`Found ${allEmployees.length} active employees`);

        let created = 0;
        let updated = 0;
        let errors = 0;

        for (const employee of allEmployees) {
            try {
                // Check if record exists for current quarter
                const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                    employee_id: employee.hrms_id,
                    company: targetCompany,
                    year: currentYear,
                    quarter: currentQuarter
                });

                // Get previous quarter to check for custom total_minutes
                let customTotalMinutes = 120; // default
                const prevQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
                const prevYear = currentQuarter === 1 ? currentYear - 1 : currentYear;
                
                const prevRecord = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                    employee_id: employee.hrms_id,
                    company: targetCompany,
                    year: prevYear,
                    quarter: prevQuarter
                });

                // Use previous quarter's total_minutes if it was customized
                if (prevRecord.length > 0 && prevRecord[0].total_minutes !== 120) {
                    customTotalMinutes = prevRecord[0].total_minutes;
                }

                if (existing.length === 0) {
                    // Create new record with reset values
                    await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                        employee_id: employee.hrms_id,
                        company: targetCompany,
                        year: currentYear,
                        quarter: currentQuarter,
                        total_minutes: customTotalMinutes,
                        used_minutes: 0,
                        remaining_minutes: customTotalMinutes
                    });
                    created++;
                } else {
                    // Update existing record (in case it was created manually)
                    await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.update(existing[0].id, {
                        used_minutes: 0,
                        remaining_minutes: existing[0].total_minutes
                    });
                    updated++;
                }
            } catch (err) {
                console.error(`Error processing employee ${employee.hrms_id}:`, err);
                errors++;
            }
        }

        // Log the reset operation
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'QUARTERLY_RESET',
            entity_type: 'EmployeeQuarterlyMinutes',
            details: `Automated quarterly reset for ${targetCompany} - Q${currentQuarter} ${currentYear}`,
            user_email: 'system@automation',
            user_name: 'System Automation',
            user_role: 'system',
            company: targetCompany,
            success: true
        });

        console.log(`Reset complete: ${created} created, ${updated} updated, ${errors} errors`);

        return Response.json({
            success: true,
            message: `Quarterly reset completed for ${targetCompany}`,
            stats: {
                company: targetCompany,
                year: currentYear,
                quarter: currentQuarter,
                employees_processed: allEmployees.length,
                records_created: created,
                records_updated: updated,
                errors: errors
            }
        });

    } catch (error) {
        console.error('Quarterly reset error:', error);
        
        // Log the failure
        try {
            const base44 = createClientFromRequest(req);
            await base44.asServiceRole.functions.invoke('logAudit', {
                action: 'QUARTERLY_RESET',
                entity_type: 'EmployeeQuarterlyMinutes',
                details: 'Automated quarterly reset failed',
                user_email: 'system@automation',
                user_name: 'System Automation',
                user_role: 'system',
                success: false,
                error_message: error.message
            });
        } catch {}

        return Response.json({ 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});