import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { report_run_id, dry_run = true } = await req.json();

    if (!report_run_id) {
        return Response.json({ error: 'report_run_id required' }, { status: 400 });
    }

    // Fetch all results for this report
    let results = await base44.asServiceRole.entities.AnalysisResult.filter(
        { report_run_id },
        null,
        500
    );

    const mismatches = [];
    const fixes = [];

    for (const r of results) {
        const late = r.late_minutes || 0;
        const early = r.early_checkout_minutes || 0;
        const grace = r.grace_minutes ?? 15;
        const approved = r.approved_minutes || 0;
        const stored = r.manual_deductible_minutes !== null && r.manual_deductible_minutes !== undefined
            ? r.manual_deductible_minutes
            : r.deductible_minutes || 0;

        const expected = Math.max(0, late + early - grace - approved);

        if (Math.abs(stored - expected) > 0.01) {
            mismatches.push({
                id: r.id,
                attendance_id: r.attendance_id,
                late_minutes: late,
                early_checkout_minutes: early,
                grace_minutes: grace,
                approved_minutes: approved,
                stored_deductible: stored,
                expected_deductible: expected,
                delta: stored - expected
            });

            if (!dry_run) {
                // Fix: update deductible_minutes and clear manual_deductible_minutes if it's wrong
                const updatePayload = { deductible_minutes: expected };
                if (r.manual_deductible_minutes !== null && r.manual_deductible_minutes !== undefined) {
                    updatePayload.manual_deductible_minutes = null;
                }
                await base44.asServiceRole.entities.AnalysisResult.update(r.id, updatePayload);
                fixes.push(r.attendance_id);
            }
        }
    }

    return Response.json({
        success: true,
        dry_run,
        total_employees: results.length,
        mismatch_count: mismatches.length,
        mismatches,
        fixed: fixes
    });
});