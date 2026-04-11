import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ONE-TIME SYNC: Migrate existing companies to Company entity with stable IDs
 * Reads from Employee/Project entities to find all unique company names
 * Creates Company records with auto-assigned IDs (1, 2, 3, 4...)
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        // Get all unique companies from existing data
        const [employees, companySettings] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({}, null, 5000),
            base44.asServiceRole.entities.CompanySettings.filter({}, null, 100)
        ]);

        // Get unique company names
        const companyNames = new Set();
        employees.forEach(emp => {
            if (emp.company) companyNames.add(emp.company);
        });
        companySettings.forEach(cs => {
            if (cs.company) companyNames.add(cs.company);
        });

        // Check existing Company records
        const existingCompanies = await base44.asServiceRole.entities.Company.filter({}, null, 100);
        const existingNames = new Set(existingCompanies.map(c => c.name));

        // Create missing companies
        const toCreate = [];
        let nextId = existingCompanies.length > 0 
            ? Math.max(...existingCompanies.map(c => c.company_id || 0)) + 1 
            : 1;

        for (const name of companyNames) {
            if (!existingNames.has(name)) {
                // Get departments from CompanySettings if exists
                const settings = companySettings.find(cs => cs.company === name);
                toCreate.push({
                    company_id: nextId++,
                    name: name,
                    departments: settings?.departments || '',
                    active: true
                });
            }
        }

        if (toCreate.length > 0) {
            await base44.asServiceRole.entities.Company.bulkCreate(toCreate);
        }

        return Response.json({
            success: true,
            existing: existingCompanies.length,
            created: toCreate.length,
            companies: [...existingCompanies, ...toCreate]
        });

    } catch (error) {
        console.error('Sync error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});