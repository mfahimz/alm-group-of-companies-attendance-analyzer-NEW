import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createReportChecklistTasks
 *
 * Entity automation function triggered on SalaryReport create and update events.
 * Automatically creates "LOP Days" and "Other Minutes" checklist tasks for 
 * each employee in the report whose values exceed zero.
 *
 * ============================================================================
 * EXHAUSTIVE BUSINESS LOGIC AUDIT & USE CASES (2026-03-13)
 * ============================================================================
 * 
 * 1. SCOPE:
 *    Generalized for all companies. Any saved SalaryReport triggers checklist 
 *    generation for LOP Days and Other Minutes.
 *
 * 2. TASK TYPES:
 *    - "LOP Days": Created if `full_absence_count > 0`.
 *    - "Other Minutes": Created if `other_minutes > 0`.
 *
 * 3. DUPLICATE PREVENTION (UNIQUE FINGERPRINTS):
 *    - Format: `{Type}_{ProjectId}_{AttendanceId}_{Value}_{NormalizedName}`
 *    - Logic: On save, the system calculates all "Expected Fingerprints". 
 *      It deletes existing auto-created tasks for the project that are NOT 
 *      in the expected set, and creates only the missing ones.
 *    - Benefit: If a report is saved multiple times with IDENTICAL data, 
 *      the fingerprints match existing tasks, so NO deletions or creations 
 *      occur. This is the "Unique Fingerprint" check.
 *
 * 4. DATA MAPPING:
 *    - Description: `Employee Name | Metric: Value | Report Context`
 *    - Notes: Includes Department, Present Days, and Action Required guidance.
 *
 * 5. REVISIONS:
 *    If a value or name changes, the fingerprint changes, the old task is 
 *    removed as "stale" and a new one is created.
 *
 * ============================================================================
 */

const BATCH_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const event = body?.event;

        if (!event || !event.entity_id) return Response.json({ error: 'Missing event' }, { status: 400 });

        const salaryReportId = event.entity_id;
        let reportData = event.data;

        if (!reportData?.snapshot_data || !reportData?.project_id) {
            const reports = await base44.asServiceRole.entities.SalaryReport.filter({ id: salaryReportId });
            if (reports.length === 0) return Response.json({ message: 'Not found' });
            reportData = reports[0];
        }

        const projectId = reportData.project_id;
        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (!project) return Response.json({ message: 'Project not found' });

        let snapshotRows: any[] = [];
        try { snapshotRows = JSON.parse(reportData.snapshot_data || '[]'); } catch (e) { return Response.json({ error: 'JSON error' }, { status: 500 }); }
        if (!Array.isArray(snapshotRows) || snapshotRows.length === 0) return Response.json({ success: true, message: 'No rows' });

        const reportName = reportData.report_name || 'Salary Report';
        const reportPeriod = reportData.date_from && reportData.date_to ? `${reportData.date_from} to ${reportData.date_to}` : 'N/A';
        
        const expectedTasks: Array<{ fingerprint: string, type: string, description: string, notes: string }> = [];

        for (const emp of snapshotRows) {
            const name = emp.name || emp.attendance_id || 'Unknown';
            const attId = emp.attendance_id || '';
            const lop = Number(emp.full_absence_count) || 0;
            const other = Number(emp.other_minutes) || 0;
            const nameKey = name.replace(/\s+/g, '');

            if (lop > 0) {
                const fp = `LopDays_${projectId}_${attId}_${lop}_${nameKey}`;
                expectedTasks.push({
                    fingerprint: fp,
                    type: 'LOP Days',
                    description: `${name} | LOP Days: ${lop} | Report: ${reportName}`,
                    notes: `Employee: ${name}\nID: ${attId}\nLOP: ${lop}\nPeriod: ${reportPeriod}\n[Auto-created]`
                });
            }

            if (other > 0) {
                const fp = `OtherMinutes_${projectId}_${attId}_${other}_${nameKey}`;
                expectedTasks.push({
                    fingerprint: fp,
                    type: 'Other Minutes',
                    description: `${name} | Other Minutes: ${other} min | Report: ${reportName}`,
                    notes: `Employee: ${name}\nID: ${attId}\nOther: ${other} min\nPeriod: ${reportPeriod}\n[Auto-created]`
                });
            }
        }

        const expectedFingerprints = new Set(expectedTasks.map(t => t.fingerprint));
        const existingProjectTasks = await base44.asServiceRole.entities.ChecklistItem.filter({ project_id: projectId, is_auto_created: true });
        const relevantExisting = existingProjectTasks.filter((t: any) => t.task_type === 'LOP Days' || t.task_type === 'Other Minutes');

        let deleted = 0;
        for (const task of relevantExisting) {
            if (!expectedFingerprints.has(task.fingerprint)) {
                await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
                deleted++;
                await sleep(BATCH_DELAY_MS);
            }
        }

        let created = 0;
        const currentFingerprints = new Set(relevantExisting.map((t: any) => t.fingerprint));
        for (const task of expectedTasks) {
            if (!currentFingerprints.has(task.fingerprint)) {
                await base44.asServiceRole.entities.ChecklistItem.create({
                    project_id: projectId,
                    task_type: task.type,
                    task_description: task.description,
                    status: 'pending',
                    is_predefined: false,
                    is_auto_created: true,
                    fingerprint: task.fingerprint,
                    notes: task.notes
                });
                created++;
                await sleep(BATCH_DELAY_MS);
            }
        }

        return Response.json({ success: true, deleted, created });

    } catch (error: any) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
