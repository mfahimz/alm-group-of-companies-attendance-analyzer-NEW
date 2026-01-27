// DEPRECATED: This file is deprecated in favor of SalarySnapshot entity
// Kept for backward compatibility only.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    return Response.json({ 
        error: 'This endpoint is deprecated. Use SalarySnapshot entity directly.',
        success: false
    }, { status: 410 });
});