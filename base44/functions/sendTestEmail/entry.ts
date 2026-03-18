import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Send test email
        const result = await base44.integrations.Core.SendEmail({
            from_name: 'Attendance System',
            to: 'binfah222@gmail.com',
            subject: 'Test Email from Custom Domain',
            body: `
                <h2>Test Email</h2>
                <p>This is a test email sent from the custom domain: <strong>no-reply@attendance.misalm.com</strong></p>
                <p>Sent by: ${user.full_name} (${user.email})</p>
                <p>Date: ${new Date().toLocaleString()}</p>
            `
        });

        return Response.json({ 
            success: true, 
            message: 'Test email sent successfully to binfah222@gmail.com',
            result 
        });
    } catch (error) {
        return Response.json({ 
            error: error.message,
            details: 'Failed to send test email'
        }, { status: 500 });
    }
});