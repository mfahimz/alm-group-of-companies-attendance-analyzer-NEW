import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Get or Create Quarterly Minutes Record (Calendar-Based)
 * 
 * This function retrieves or creates a quarterly minutes record for an employee
 * based on a specific DATE (not project). The quarter is determined from the date.
 * 
 * Pure calendar-based tracking:
 * - Q1: January 1 - March 31
 * - Q2: April 1 - June 30
 * - Q3: July 1 - September 30
 * - Q4: October 1 - December 31
 * 
 * Usage:
 * const record = await getOrCreateQuarterlyMinutes(employee_id, company, date_string);
 * 
 * Returns: { year, quarter, total_minutes, used_minutes, remaining_minutes, record_id }
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { employee_id, company, date } = await req.json();

        if (!employee_id || !company || !date) {
            return Response.json({
                error: 'Missing required fields: employee_id, company, date'
            }, { status: 400 });
        }

        // Check if company supports quarterly minutes
        if (company !== 'Al Maraghi Motors') {
            return Response.json({
                success: false,
                error: 'Quarterly minutes feature is only available for Al Maraghi Motors'
            }, { status: 400 });
        }

        // Parse date and determine quarter
        const targetDate = new Date(date);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1; // 1-12
        
        // Determine quarter from month
        let quarter;
        if (month >= 1 && month <= 3) {
            quarter = 1; // Q1: Jan-Mar
        } else if (month >= 4 && month <= 6) {
            quarter = 2; // Q2: Apr-Jun
        } else if (month >= 7 && month <= 9) {
            quarter = 3; // Q3: Jul-Sep
        } else {
            quarter = 4; // Q4: Oct-Dec
        }

        // Check if record exists
        const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            employee_id: employee_id,
            company: company,
            year: year,
            quarter: quarter
        });

        let record;
        if (existing.length > 0) {
            // Return existing record
            record = existing[0];
        } else {
            // Create new record with default 120 minutes
            record = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                employee_id: employee_id,
                company: company,
                year: year,
                quarter: quarter,
                total_minutes: 120,
                used_minutes: 0,
                remaining_minutes: 120
            });
        }

        return Response.json({
            success: true,
            year: record.year,
            quarter: record.quarter,
            quarter_name: `Q${record.quarter} ${record.year}`,
            quarter_period: getQuarterPeriod(record.quarter, record.year),
            total_minutes: record.total_minutes,
            used_minutes: record.used_minutes,
            remaining_minutes: record.remaining_minutes,
            record_id: record.id
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});

// Helper function to get quarter period string
function getQuarterPeriod(quarter, year) {
    const periods = {
        1: `Jan 1 - Mar 31, ${year}`,
        2: `Apr 1 - Jun 30, ${year}`,
        3: `Jul 1 - Sep 30, ${year}`,
        4: `Oct 1 - Dec 31, ${year}`
    };
    return periods[quarter];
}