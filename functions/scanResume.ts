import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { fileBase64, fileName, fileType, criteria, positionApplied, department } = body;

        if (!fileBase64 || !fileName) {
            return Response.json({ error: 'File data is required' }, { status: 400 });
        }

        if (!criteria || criteria.trim().length === 0) {
            return Response.json({ error: 'Screening criteria is required' }, { status: 400 });
        }

        // Convert base64 to blob for upload
        const binaryStr = atob(fileBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        const fileBlob = new Blob([bytes], { type: fileType || 'application/octet-stream' });

        // Step 1: Upload file
        const uploadResult = await base44.integrations.Core.UploadFile({ file: fileBlob });
        const fileUrl = uploadResult.file_url;

        // Step 2: Extract structured data from resume
        const extractionSchema = {
            type: "object",
            properties: {
                full_name: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                total_years_experience: { type: "number" },
                current_or_last_position: { type: "string" },
                current_or_last_company: { type: "string" },
                skills: { type: "array", items: { type: "string" } },
                education: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            degree: { type: "string" },
                            institution: { type: "string" },
                            year: { type: "string" }
                        }
                    }
                },
                experience: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            company: { type: "string" },
                            role: { type: "string" },
                            duration: { type: "string" },
                            responsibilities: { type: "string" }
                        }
                    }
                },
                certifications: { type: "array", items: { type: "string" } },
                languages: { type: "array", items: { type: "string" } }
            }
        };

        let extractedData = null;
        try {
            const extractionResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
                file_url: fileUrl,
                json_schema: extractionSchema
            });
            if (extractionResult.status === 'success') {
                extractedData = extractionResult.output;
            }
        } catch (extractErr) {
            console.error('Extraction failed:', extractErr.message);
            // Continue with just the file URL if extraction fails
        }

        // Step 3: AI Evaluation
        const resumeDataStr = extractedData
            ? JSON.stringify(extractedData, null, 2)
            : `File uploaded but could not be parsed. File: ${fileName}`;

        const prompt = `You are an expert HR recruiter and ATS (Applicant Tracking System) evaluator for Al Maraghi Auto Repairs, Abu Dhabi, UAE.

Evaluate the following resume against the provided screening criteria.

${positionApplied ? `Position Applied For: ${positionApplied}` : ''}
${department ? `Department: ${department}` : ''}

SCREENING CRITERIA:
${criteria}

EXTRACTED RESUME DATA:
${resumeDataStr}

Provide a thorough evaluation. Be objective and fair. Consider UAE work environment and automotive industry context where relevant.

Output a JSON with these exact fields:
- score: number from 0-100 representing overall suitability
- recommendation: exactly one of ["Highly Recommended", "Recommended", "Consider", "Not Recommended"]
- summary: 2-3 sentence narrative explaining the overall assessment
- matched_skills: array of strings - skills/criteria the candidate meets
- missing_skills: array of strings - important skills/criteria the candidate lacks
- strengths: array of strings - top 3 candidate strengths
- concerns: array of strings - top concerns or red flags (empty array if none)
- experience_years: number - estimated total years of relevant experience`;

        const aiResponse = await base44.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: {
                type: "object",
                properties: {
                    score: { type: "number" },
                    recommendation: { type: "string" },
                    summary: { type: "string" },
                    matched_skills: { type: "array", items: { type: "string" } },
                    missing_skills: { type: "array", items: { type: "string" } },
                    strengths: { type: "array", items: { type: "string" } },
                    concerns: { type: "array", items: { type: "string" } },
                    experience_years: { type: "number" }
                }
            }
        });

        // Step 4: Save result to entity
        const scanRecord = await base44.entities.ResumeScanResult.create({
            applicant_name: extractedData?.full_name || aiResponse?.applicant_name || 'Unknown',
            applicant_email: extractedData?.email || '',
            applicant_phone: extractedData?.phone || '',
            position_applied: positionApplied || '',
            department: department || '',
            file_url: fileUrl,
            file_name: fileName,
            extracted_data: JSON.stringify(extractedData),
            criteria_used: criteria,
            ai_score: aiResponse?.score || 0,
            ai_recommendation: aiResponse?.recommendation || 'Consider',
            ai_summary: aiResponse?.summary || '',
            matched_skills: (aiResponse?.matched_skills || []).join(', '),
            missing_skills: (aiResponse?.missing_skills || []).join(', '),
            years_experience: aiResponse?.experience_years || extractedData?.total_years_experience || 0,
            scanned_by: user.email,
            status: 'completed'
        });

        return Response.json({
            success: true,
            scanId: scanRecord.id,
            result: {
                score: aiResponse?.score || 0,
                recommendation: aiResponse?.recommendation || 'Consider',
                summary: aiResponse?.summary || '',
                matched_skills: aiResponse?.matched_skills || [],
                missing_skills: aiResponse?.missing_skills || [],
                strengths: aiResponse?.strengths || [],
                concerns: aiResponse?.concerns || [],
                experience_years: aiResponse?.experience_years || 0,
                applicant_name: extractedData?.full_name || 'Unknown',
                applicant_email: extractedData?.email || '',
                file_url: fileUrl
            }
        });

    } catch (error) {
        console.error('scanResume error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});