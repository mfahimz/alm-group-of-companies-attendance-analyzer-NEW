import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import jsPDF from 'npm:jspdf@2.5.2';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { type, fileName, projectId, reportRunId, data } = await req.json();

        if (!type || !fileName || !data) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        let fileContent;
        let mimeType = 'application/pdf';

        // Generate PDF from data
        if (type === 'pdf') {
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text(fileName, 20, 20);
            doc.setFontSize(10);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
            doc.text(`By: ${user.full_name} (${user.email})`, 20, 40);

            // Add table header
            doc.setFontSize(11);
            let yPos = 55;
            const pageHeight = doc.internal.pageSize.height;

            // Add data
            if (Array.isArray(data)) {
                data.forEach((row, idx) => {
                    if (yPos > pageHeight - 20) {
                        doc.addPage();
                        yPos = 20;
                    }
                    doc.setFontSize(10);
                    const rowText = Object.values(row).join(' | ');
                    doc.text(rowText, 20, yPos, { maxWidth: 170 });
                    yPos += 8;
                });
            }

            fileContent = doc.output('arraybuffer');
        } else {
            return Response.json({ error: 'Unsupported file type' }, { status: 400 });
        }

        // Upload to private storage
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({
            file: fileContent
        });

        // Store metadata in database
        await base44.entities.PrivateFile.create({
            file_uri,
            file_name: fileName,
            file_type: type,
            uploaded_by: user.email,
            uploaded_by_name: user.full_name,
            company: user.company,
            project_id: projectId || null,
            report_run_id: reportRunId || null,
            file_size: fileContent.byteLength,
            mime_type: mimeType
        });

        return Response.json({ file_uri, fileName });
    } catch (error) {
        console.error('Export error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});