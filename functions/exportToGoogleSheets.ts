import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const { reportRunId, projectId } = payload;

        if (!reportRunId || !projectId) {
            return Response.json({ error: 'Missing reportRunId or projectId' }, { status: 400 });
        }

        // Fetch data
        const [reportRun, project, results, employees] = await Promise.all([
            base44.entities.ReportRun.get(reportRunId),
            base44.entities.Project.get(projectId),
            base44.entities.AnalysisResult.filter({ report_run_id: reportRunId }),
            base44.entities.Employee.list()
        ]);

        // Get access token for Google Sheets
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');

        // Prepare spreadsheet data
        const headers = [
            'Attendance ID',
            'Employee Name',
            'HRMS ID',
            'Department',
            'Working Days',
            'Present Days',
            'Full Absence',
            'Half Absence',
            'Sick Leave',
            'Annual Leave',
            'Late Minutes',
            'Early Checkout',
            'Other Minutes',
            'Grace Minutes',
            'Notes'
        ];

        const rows = results.map(result => {
            const employee = employees.find(e => e.attendance_id === result.attendance_id);
            return [
                result.attendance_id,
                employee?.name || '—',
                employee?.hrms_id || '—',
                employee?.department || '—',
                result.working_days || 0,
                result.present_days || 0,
                result.full_absence_count || 0,
                result.half_absence_count || 0,
                result.sick_leave_count || 0,
                result.annual_leave_count || 0,
                result.late_minutes || 0,
                result.early_checkout_minutes || 0,
                result.other_minutes || 0,
                result.grace_minutes || 0,
                result.notes || ''
            ];
        });

        // Create spreadsheet
        const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: {
                    title: `${project.name} - ${reportRun.report_name || 'Report'} - ${new Date().toLocaleDateString()}`
                },
                sheets: [{
                    properties: {
                        title: 'Attendance Report',
                        gridProperties: {
                            frozenRowCount: 1
                        }
                    }
                }]
            })
        });

        if (!createResponse.ok) {
            const error = await createResponse.text();
            throw new Error(`Failed to create spreadsheet: ${error}`);
        }

        const spreadsheet = await createResponse.json();
        const spreadsheetId = spreadsheet.spreadsheetId;

        // Write data to spreadsheet
        const updateResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=RAW`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    values: [headers, ...rows]
                })
            }
        );

        if (!updateResponse.ok) {
            const error = await updateResponse.text();
            throw new Error(`Failed to write data: ${error}`);
        }

        // Format header row
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    requests: [{
                        repeatCell: {
                            range: {
                                sheetId: 0,
                                startRowIndex: 0,
                                endRowIndex: 1
                            },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.26, green: 0.26, blue: 0.55 },
                                    textFormat: {
                                        foregroundColor: { red: 1, green: 1, blue: 1 },
                                        bold: true
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat)'
                        }
                    }]
                })
            }
        );

        return Response.json({
            success: true,
            spreadsheetUrl: spreadsheet.spreadsheetUrl,
            spreadsheetId
        });

    } catch (error) {
        console.error('Export to Google Sheets error:', error);
        return Response.json({ 
            error: error.message || 'Failed to export to Google Sheets' 
        }, { status: 500 });
    }
});