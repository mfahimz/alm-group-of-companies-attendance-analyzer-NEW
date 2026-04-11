import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify admin access
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const company = "Al Maraghi Auto Repairs";
        const department = "Al Maraghi Abu Dhabi";
        
        // Find all projects for this company and department
        const allProjects = await base44.asServiceRole.entities.Project.list();
        const targetProjects = allProjects.filter(p => 
            p.company === company && (p.department === department || p.name.includes("Al Maraghi Abu Dhabi"))
        );
        
        const projectIds = targetProjects.map(p => p.id);
        
        if (projectIds.length === 0) {
            return Response.json({
                success: true,
                message: 'No projects found for Al Maraghi Abu Dhabi',
                deleted: { reports: 0, analysisResults: 0, exceptions: 0 }
            });
        }

        // Find ReportRun records from November 2025
        const allReportRuns = await base44.asServiceRole.entities.ReportRun.list();
        const novemberReports = allReportRuns.filter(report => {
            if (!projectIds.includes(report.project_id)) return false;
            
            // Check if report dates overlap with November 2025
            const dateFrom = new Date(report.date_from);
            const dateTo = new Date(report.date_to);
            const novStart = new Date('2025-11-01');
            const novEnd = new Date('2025-11-30');
            
            return (dateFrom >= novStart && dateFrom <= novEnd) || 
                   (dateTo >= novStart && dateTo <= novEnd) ||
                   (dateFrom <= novStart && dateTo >= novEnd);
        });

        const reportRunIds = novemberReports.map(r => r.id);
        
        let deletedReports = 0;
        let deletedAnalysis = 0;
        let deletedExceptions = 0;

        // Delete using bulk operations to avoid rate limits
        for (const reportRunId of reportRunIds) {
            // Use deleteMany instead of looping
            await base44.asServiceRole.entities.AnalysisResult.deleteMany({
                report_run_id: reportRunId
            });
            
            const count = await base44.asServiceRole.entities.AnalysisResult.filter({
                report_run_id: reportRunId
            });
            deletedAnalysis += count.length || 0;
        }

        // Delete Exceptions using bulk delete
        for (const reportRunId of reportRunIds) {
            const exceptions = await base44.asServiceRole.entities.Exception.filter({
                created_from_report: true,
                report_run_id: reportRunId
            });
            
            for (const exc of exceptions) {
                await base44.asServiceRole.entities.Exception.delete(exc.id);
                deletedExceptions++;
            }
        }

        // Delete ReportRun records
        for (const reportId of reportRunIds) {
            await base44.asServiceRole.entities.ReportRun.delete(reportId);
            deletedReports++;
        }

        return Response.json({
            success: true,
            message: `Deleted ${deletedReports} November reports and associated data`,
            deleted: {
                reports: deletedReports,
                analysisResults: deletedAnalysis,
                exceptions: deletedExceptions
            },
            details: {
                company,
                department,
                projectsChecked: targetProjects.length,
                reportRunIds
            }
        });

    } catch (error) {
        console.error('Delete November reports error:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});