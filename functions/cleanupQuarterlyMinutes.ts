import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Fetch ALL employees
        const employees = await base44.asServiceRole.entities.Employee.list();
        
        // Build a map: hrms_id -> actual company
        const employeeCompanyMap = {};
        employees.forEach(emp => {
            if (emp.hrms_id) {
                employeeCompanyMap[String(emp.hrms_id)] = {
                    company: emp.company,
                    name: emp.name,
                    active: emp.active
                };
            }
        });

        // Fetch ALL quarterly minutes
        const allMinutes = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.list();

        // Find mismatches
        const mismatches = [];
        const correctRecords = [];

        for (const record of allMinutes) {
            const employeeId = record.employee_id;
            const recordCompany = record.company;
            const employeeInfo = employeeCompanyMap[employeeId];

            if (!employeeInfo) {
                mismatches.push({
                    id: record.id,
                    employee_id: employeeId,
                    record_company: recordCompany,
                    actual_company: 'EMPLOYEE NOT FOUND',
                    reason: 'Employee does not exist',
                    year: record.year,
                    quarter: record.quarter,
                    allocation_type: record.allocation_type
                });
            } else if (employeeInfo.company !== recordCompany) {
                mismatches.push({
                    id: record.id,
                    employee_id: employeeId,
                    employee_name: employeeInfo.name,
                    record_company: recordCompany,
                    actual_company: employeeInfo.company,
                    reason: 'Company mismatch',
                    year: record.year,
                    quarter: record.quarter,
                    allocation_type: record.allocation_type
                });
            } else {
                correctRecords.push({
                    employee_id: employeeId,
                    company: recordCompany
                });
            }
        }

        // Group mismatches by reason
        const summary = {
            total_records: allMinutes.length,
            correct_records: correctRecords.length,
            mismatched_records: mismatches.length,
            mismatches_by_company: {},
            records_to_delete: mismatches.map(m => m.id)
        };

        // Group by actual company
        mismatches.forEach(m => {
            const key = `${m.actual_company} (stored as: ${m.record_company})`;
            if (!summary.mismatches_by_company[key]) {
                summary.mismatches_by_company[key] = [];
            }
            summary.mismatches_by_company[key].push({
                hrms_id: m.employee_id,
                name: m.employee_name,
                year: m.year,
                quarter: m.quarter
            });
        });

        // DELETE mismatched records
        if (mismatches.length > 0) {
            const deletePromises = mismatches.map(m => 
                base44.asServiceRole.entities.EmployeeQuarterlyMinutes.delete(m.id)
            );
            await Promise.all(deletePromises);
        }

        return Response.json({
            success: true,
            summary,
            deleted_count: mismatches.length,
            message: `Deleted ${mismatches.length} mismatched records. ${correctRecords.length} correct records remain.`
        });

    } catch (error) {
        console.error('Error cleaning quarterly minutes:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});