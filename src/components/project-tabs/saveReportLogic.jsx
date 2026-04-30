import { base44 } from '@/api/base44Client';

/**
 * Save Report Logic — extracted from ReportDetailView's saveReportMutation.
 * Persists in-report edits (day_overrides) as Exception records and marks the report as saved.
 *
 * Returns: number of exceptions created
 * Throws: Error with descriptive message on failure (overlap detection, etc.)
 */
export async function executeSaveReport({
    reportRun,
    project,
    allReportRuns,
    exceptions,
    results,
    setSaveProgress,
}) {
    setSaveProgress({ current: 0, total: 100, status: 'Validating date range...' });

    // BUSINESS LOGIC: Date-Range Protection & Conflict Prevention
    const newFrom = new Date(reportRun.date_from);
    const newTo = new Date(reportRun.date_to);
    const projectFrom = new Date(project.date_from);
    const projectTo = new Date(project.date_to);

    const isFullProjectRange =
        newFrom.toLocaleDateString() === projectFrom.toLocaleDateString() &&
        newTo.toLocaleDateString() === projectTo.toLocaleDateString();

    if (!isFullProjectRange) {
        const overlappingReport = allReportRuns.find(run => {
            if (!run.is_saved || run.id === reportRun.id) return false;
            const savedFrom = new Date(run.date_from);
            const savedTo = new Date(run.date_to);
            return (newFrom <= savedTo) && (newTo >= savedFrom);
        });

        if (overlappingReport) {
            const rangeText = `${new Date(overlappingReport.date_from).toLocaleDateString()} - ${new Date(overlappingReport.date_to).toLocaleDateString()}`;
            throw new Error(`Overlap Detected: A saved report already exists for part of this period (${rangeText}). Save blocked to prevent data conflicts.`);
        }
    }

    setSaveProgress({ current: 0, total: 100, status: 'Preparing exceptions...' });

    await Promise.all([
        base44.entities.ReportRun.update(reportRun.id, { is_saved: true }),
        base44.entities.Project.update(project.id, { last_saved_report_id: reportRun.id })
    ]);

    // Delete existing report-generated exceptions for this report to prevent duplicates
    const existingReportExceptions = exceptions.filter(e =>
        (e.created_from_report && e.report_run_id === reportRun.id) ||
        (e.type === 'SHIFT_OVERRIDE' && e.report_run_id === reportRun.id)
    );

    if (existingReportExceptions.length > 0) {
        setSaveProgress({ current: 0, total: 100, status: 'Removing old exceptions...' });
        for (const ex of existingReportExceptions) {
            await base44.entities.Exception.delete(ex.id);
        }
    }

    const exceptionsToCreate = [];

    for (const result of results) {
        if (!result.day_overrides) continue;

        let dayOverrides = {};
        try {
            dayOverrides = JSON.parse(result.day_overrides);
        } catch (e) {
            continue;
        }

        const datesByType = {};
        Object.entries(dayOverrides).forEach(([dateStr, override]) => {
            const key = `${result.attendance_id}_${override.type}_${override.lateMinutes || 0}_${override.earlyCheckoutMinutes || 0}_${override.otherMinutes || 0}_${JSON.stringify(override.shiftOverride || {})}`;
            if (!datesByType[key]) {
                datesByType[key] = { dates: [], data: override, attendance_id: result.attendance_id };
            }
            datesByType[key].dates.push(dateStr);
        });

        for (const group of Object.values(datesByType)) {
            const sortedDates = group.dates.sort();
            const hasTimeMins = (group.data.lateMinutes > 0) || (group.data.earlyCheckoutMinutes > 0) || (group.data.otherMinutes > 0);
            const ranges = [];

            if (hasTimeMins) {
                sortedDates.forEach(d => ranges.push({ start: d, end: d }));
            } else {
                let currentRange = { start: sortedDates[0], end: sortedDates[0] };
                for (let i = 1; i < sortedDates.length; i++) {
                    const dayDiff = (new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / (1000 * 60 * 60 * 24);
                    if (dayDiff === 1) { currentRange.end = sortedDates[i]; }
                    else { ranges.push({ ...currentRange }); currentRange = { start: sortedDates[i], end: sortedDates[i] }; }
                }
                ranges.push(currentRange);
            }

            for (const range of ranges) {
                const detailsParts = [];
                if (group.data.lateMinutes > 0) detailsParts.push(`+${group.data.lateMinutes} late min`);
                if (group.data.earlyCheckoutMinutes > 0) detailsParts.push(`+${group.data.earlyCheckoutMinutes} early min`);
                if (group.data.otherMinutes > 0) detailsParts.push(`+${group.data.otherMinutes} other min`);
                if (group.data.shiftOverride) detailsParts.push('shift override');
                if (group.data.details) detailsParts.push(group.data.details);

                const detailsText = detailsParts.length > 0
                    ? `Report edit: ${detailsParts.join(' | ')}`
                    : 'Report edit: Manual adjustment from report';

                const exceptionData = {
                    project_id: project.id,
                    attendance_id: String(group.attendance_id),
                    date_from: range.start,
                    date_to: range.end,
                    type: group.data.type,
                    details: detailsText,
                    created_from_report: true,
                    report_run_id: reportRun.id,
                    use_in_analysis: true,
                    approval_status: 'pending_dept_head'
                };

                if (group.data.lateMinutes && group.data.lateMinutes > 0) exceptionData.late_minutes = group.data.lateMinutes;
                if (group.data.earlyCheckoutMinutes && group.data.earlyCheckoutMinutes > 0) exceptionData.early_checkout_minutes = group.data.earlyCheckoutMinutes;
                if (group.data.otherMinutes && group.data.otherMinutes > 0) exceptionData.other_minutes = group.data.otherMinutes;

                if (group.data.shiftOverride) {
                    exceptionData.type = 'SHIFT_OVERRIDE';
                    exceptionData.new_am_start = group.data.shiftOverride.am_start;
                    exceptionData.new_am_end = group.data.shiftOverride.am_end;
                    exceptionData.new_pm_start = group.data.shiftOverride.pm_start;
                    exceptionData.new_pm_end = group.data.shiftOverride.pm_end;
                } else if (exceptionData.late_minutes > 0 && exceptionData.early_checkout_minutes > 0) {
                    exceptionData.type = 'MANUAL_LATE';
                } else if (exceptionData.late_minutes > 0 && exceptionData.early_checkout_minutes === 0) {
                    exceptionData.type = 'MANUAL_LATE';
                } else if (exceptionData.early_checkout_minutes > 0 && exceptionData.late_minutes === 0) {
                    exceptionData.type = 'MANUAL_EARLY_CHECKOUT';
                } else if (exceptionData.other_minutes > 0) {
                    exceptionData.type = 'MANUAL_OTHER_MINUTES';
                }

                exceptionsToCreate.push(exceptionData);
            }
        }

        // MANUAL_OTHER_MINUTES: For each day override with otherMinutes > 0 that was NOT already
        // saved as a MANUAL_OTHER_MINUTES exception above, create a dedicated MANUAL_OTHER_MINUTES
        // exception so runAnalysis on future reports picks up other_minutes from the exceptions table.
        Object.entries(dayOverrides).forEach(([dateStr, override]) => {
            if ((override.otherMinutes || 0) > 0) {
                // Check if this date/employee combo already got a MANUAL_OTHER_MINUTES exception
                const alreadyCovered = exceptionsToCreate.some(ex =>
                    ex.attendance_id === String(result.attendance_id) &&
                    ex.date_from === dateStr &&
                    ex.date_to === dateStr &&
                    ex.type === 'MANUAL_OTHER_MINUTES'
                );
                if (!alreadyCovered) {
                    exceptionsToCreate.push({
                        project_id: project.id,
                        attendance_id: String(result.attendance_id),
                        date_from: dateStr,
                        date_to: dateStr,
                        type: 'MANUAL_OTHER_MINUTES',
                        other_minutes: override.otherMinutes,
                        allowed_minutes: override.otherMinutes,
                        details: `Report edit: +${override.otherMinutes} other min`,
                        created_from_report: true,
                        report_run_id: reportRun.id,
                        use_in_analysis: true,
                        approval_status: 'pending_dept_head'
                    });
                }
            }
        });
    }

    if (exceptionsToCreate.length > 0) {
        const batchSize = 10;
        const totalBatches = Math.ceil(exceptionsToCreate.length / batchSize);
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const retryWithBackoff = async (fn, maxRetries = 3) => {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await fn();
                } catch (error) {
                    const isRateLimit = error.message?.includes('rate limit') || error.status === 429;
                    if (isRateLimit && i < maxRetries - 1) {
                        const backoffTime = Math.min(2000 * Math.pow(2, i), 10000);
                        await delay(backoffTime);
                        continue;
                    }
                    throw error;
                }
            }
        };

        for (let i = 0; i < exceptionsToCreate.length; i += batchSize) {
            const batch = exceptionsToCreate.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;

            setSaveProgress({
                current: batchNumber,
                total: totalBatches,
                status: `Saving exceptions ${batchNumber}/${totalBatches}...`
            });

            try {
                await retryWithBackoff(() => base44.entities.Exception.bulkCreate(batch));
                await delay(1500);
            } catch (error) {
                console.error(`Batch ${batchNumber} failed, trying individual saves:`, error);
                for (const ex of batch) {
                    try {
                        await retryWithBackoff(() => base44.entities.Exception.create(ex));
                        await delay(500);
                    } catch (exError) {
                        console.error('Failed to save exception:', ex, exError);
                    }
                }
            }
        }
    }

    return exceptionsToCreate.length;
}