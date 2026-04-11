import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * backfillResumeScanResults
 * 
 * One-time backfill function to populate missing fields in ResumeScanResult records.
 * 1. Populates 'company' based on matching JobTemplate position names.
 * 2. Populates 'nationality' from extracted_data if missing/Not Specified.
 * 3. Populates 'location' from extracted_data current_location if missing/Unknown.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const scans = await base44.entities.ResumeScanResult.list('-created_date', 5000);
        const templates = await base44.entities.JobTemplate.list();
        
        let companyUpdates = 0;
        let nationalityUpdates = 0;
        let locationUpdates = 0;
        
        // Process in batches of 10
        for (let i = 0; i < scans.length; i += 10) {
            const batch = scans.slice(i, i + 10);
            
            await Promise.all(batch.map(async (scan) => {
                let needsUpdate = false;
                const updateData: any = {};
                
                // 1. Company Backfill
                if (!scan.company) {
                    const matchedTemplate = templates.find(t => 
                        (t.position_name || '').trim().toLowerCase() === (scan.position_applied || '').trim().toLowerCase()
                    );
                    if (matchedTemplate && matchedTemplate.company) {
                        updateData.company = matchedTemplate.company;
                        companyUpdates++;
                        needsUpdate = true;
                    }
                }
                
                // Parse extracted data for nationality and location
                let extra = {};
                try {
                    extra = scan.extracted_data ? JSON.parse(scan.extracted_data) : {};
                } catch (e) {
                    console.error(`Failed to parse extracted_data for scan ${scan.id}`);
                }
                
                // 2. Nationality Backfill
                const currentNat = scan.nationality;
                const isNatMissing = !currentNat || currentNat === 'Not Specified' || currentNat === 'Unknown';
                if (isNatMissing) {
                    const extraNat = (extra as any).nationality;
                    if (extraNat && extraNat !== 'Not Specified' && extraNat !== 'Unknown') {
                        updateData.nationality = extraNat;
                        nationalityUpdates++;
                        needsUpdate = true;
                    }
                }
                
                // 3. Location Backfill
                const currentLoc = scan.location;
                const isLocMissing = !currentLoc || currentLoc === 'Unknown' || currentLoc === 'Not Specified';
                if (isLocMissing) {
                    const extraLoc = (extra as any).current_location;
                    if (extraLoc && extraLoc !== 'Not Specified' && extraLoc !== 'Unknown') {
                        updateData.location = extraLoc;
                        locationUpdates++;
                        needsUpdate = true;
                    }
                }
                
                if (needsUpdate) {
                    await base44.entities.ResumeScanResult.update(scan.id, updateData);
                }
            }));
            
            // 300ms delay between batches
            if (i + 10 < scans.length) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        return Response.json({
            success: true,
            summary: {
                total_processed: scans.length,
                company_updated: companyUpdates,
                nationality_updated: nationalityUpdates,
                location_updated: locationUpdates
            }
        });
        
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
