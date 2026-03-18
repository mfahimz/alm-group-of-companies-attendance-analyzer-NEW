import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Get all employees
        const allEmployees = await base44.asServiceRole.entities.Employee.list();
        
        // Find employees without HRMS ID
        const employeesWithoutHrms = allEmployees.filter(e => !e.hrms_id || e.hrms_id.trim() === '');
        
        if (employeesWithoutHrms.length === 0) {
            return Response.json({
                success: true,
                message: 'All employees already have HRMS IDs',
                updated: 0
            });
        }

        // Get all existing HRMS IDs to avoid duplicates
        const existingHrmsIds = new Set(
            allEmployees
                .filter(e => e.hrms_id && e.hrms_id.trim() !== '')
                .map(e => e.hrms_id.toLowerCase())
        );

        const generateUniqueHrmsId = () => {
            let hrmsId;
            let attempts = 0;
            do {
                // Generate format: HRM-XXXXXX (6 digits)
                const randomNum = Math.floor(100000 + Math.random() * 900000);
                hrmsId = `HRM-${randomNum}`;
                attempts++;
                if (attempts > 100) {
                    throw new Error('Failed to generate unique HRMS ID after 100 attempts');
                }
            } while (existingHrmsIds.has(hrmsId.toLowerCase()));
            
            existingHrmsIds.add(hrmsId.toLowerCase());
            return hrmsId;
        };

        let updated = 0;
        const errors = [];

        // Update in batches
        const batchSize = 10;
        for (let i = 0; i < employeesWithoutHrms.length; i += batchSize) {
            const batch = employeesWithoutHrms.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (employee) => {
                try {
                    const newHrmsId = generateUniqueHrmsId();
                    await base44.asServiceRole.entities.Employee.update(employee.id, {
                        hrms_id: newHrmsId
                    });
                    updated++;
                } catch (error) {
                    errors.push(`Employee ${employee.attendance_id}: ${error.message}`);
                }
            }));
            
            // Small delay between batches
            if (i + batchSize < employeesWithoutHrms.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        return Response.json({
            success: true,
            message: `Generated HRMS IDs for ${updated} employees`,
            updated,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        console.error('Generate HRMS IDs error:', error);
        return Response.json({ 
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});