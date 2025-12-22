import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all existing employees to check for uniqueness
        const existingEmployees = await base44.asServiceRole.entities.Employee.list();
        const existingHrmsIds = new Set(existingEmployees.map(e => e.hrms_id));

        // Generate unique HRMS ID
        let hrmsId;
        let attempts = 0;
        const maxAttempts = 100;

        do {
            // Generate format: number between 1000-1999
            const randomNum = Math.floor(1000 + Math.random() * 1000);
            hrmsId = `${randomNum}`;
            attempts++;

            if (attempts >= maxAttempts) {
                return Response.json({ 
                    error: 'Failed to generate unique HRMS ID after multiple attempts' 
                }, { status: 500 });
            }
        } while (existingHrmsIds.has(hrmsId));

        return Response.json({ hrms_id: hrmsId });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});