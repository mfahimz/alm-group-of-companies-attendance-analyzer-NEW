import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Build a structured criteria text for the AI prompt
function buildCriteriaText(criteria) {
    const lines = [];
    if (criteria.position_name) lines.push(`Position: ${criteria.position_name}`);
    if (criteria.department) lines.push(`Department: ${criteria.department}`);
    if (criteria.min_experience_years) lines.push(`Minimum Experience: ${criteria.min_experience_years} years`);
    if (criteria.required_education) lines.push(`Required Education: ${criteria.required_education}`);
    if (criteria.required_skills) lines.push(`Required Skills: ${criteria.required_skills}`);
    if (criteria.preferred_skills) lines.push(`Preferred Skills: ${criteria.preferred_skills}`);
    if (criteria.required_certifications) lines.push(`Required Certifications: ${criteria.required_certifications}`);
    if (criteria.required_languages) lines.push(`Required Languages: ${criteria.required_languages}`);
    if (criteria.industry_experience) lines.push(`Industry Experience: ${criteria.industry_experience}`);
    if (criteria.notes) lines.push(`\nAdditional Notes: ${criteria.notes}`);
    return lines.join('\n');
}

// Code-based comparison: deterministic checks against extracted data
function buildCodeComparison(extracted, criteria) {
    const result = {};

    // Experience — use relevant (role-specific) years, fall back to total only if relevant not extracted
    const minExp = parseFloat(criteria.min_experience_years);
    const relevantExp = extracted?.relevant_years_experience ?? null;
    const totalExp = extracted?.total_years_experience ?? null;
    const candExp = relevantExp ?? totalExp; // prefer relevant
    result.required_experience = criteria.min_experience_years ? `${criteria.min_experience_years}+ years in relevant role` : null;
    result.candidate_experience = candExp != null
        ? `${candExp} years${relevantExp != null ? ' (relevant role)' : ' (total — relevant not extracted)'}`
        : null;
    result.experience_met = (!isNaN(minExp) && candExp != null) ? candExp >= minExp : null;

    // Education
    result.required_education = criteria.required_education || null;
    const candEduText = (extracted?.education || []).map(e => [e.degree, e.institution].filter(Boolean).join(' ')).join('; ');
    result.candidate_education = candEduText || null;
    result.education_met = criteria.required_education
        ? (candEduText.toLowerCase().includes(criteria.required_education.toLowerCase().split(' ')[0]) ||
           (extracted?.education?.length > 0))
        : null;

    // Required Skills
    const reqSkillsList = (criteria.required_skills || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const candSkillsLower = (extracted?.skills || []).map(s => s.toLowerCase());
    const candExpText = (extracted?.experience || []).map(e => (e.role + ' ' + (e.responsibilities || '')).toLowerCase()).join(' ');
    const allCandText = candSkillsLower.join(' ') + ' ' + candExpText;

    const matchedReqSkills = reqSkillsList.filter(skill => allCandText.includes(skill));
    const unmatchedReqSkills = reqSkillsList.filter(skill => !allCandText.includes(skill));
    result.required_skills_list = (criteria.required_skills || '').split(',').map(s => s.trim()).filter(Boolean);
    result.candidate_skills_matched = matchedReqSkills;
    result.required_skills_met = reqSkillsList.length > 0 ? unmatchedReqSkills.length === 0 : null;

    // Preferred Skills
    const prefSkillsList = (criteria.preferred_skills || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const matchedPrefSkills = prefSkillsList.filter(skill => allCandText.includes(skill));
    result.preferred_skills_list = (criteria.preferred_skills || '').split(',').map(s => s.trim()).filter(Boolean);
    result.candidate_preferred_matched = matchedPrefSkills;

    // Certifications
    const reqCerts = (criteria.required_certifications || '').toLowerCase();
    const candCerts = extracted?.certifications || [];
    const candCertText = candCerts.join(' ').toLowerCase() + ' ' + allCandText;
    result.required_certifications = criteria.required_certifications || null;
    result.candidate_certifications = candCerts;
    result.certifications_met = reqCerts ? candCertText.includes(reqCerts.split(',')[0].trim()) : null;

    // Languages
    const reqLangs = (criteria.required_languages || '').toLowerCase();
    const candLangs = extracted?.languages || [];
    const candLangText = candLangs.join(' ').toLowerCase();
    result.required_languages = criteria.required_languages || null;
    result.candidate_languages = candLangs;
    result.languages_met = reqLangs ? (candLangText.includes('english') || candLangText.length > 0) : null;

    // Industry
    result.required_industry = criteria.industry_experience || null;
    const industryText = (criteria.industry_experience || '').toLowerCase();
    result.candidate_industry = (extracted?.experience || []).map(e => e.company).filter(Boolean).join(', ') || null;
    result.industry_met = industryText ? allCandText.includes(industryText.split(',')[0].trim()) : null;

    return result;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { fileBase64, fileName, fileType, criteria } = body;

        if (!fileBase64 || !fileName) {
            return Response.json({ error: 'File data is required' }, { status: 400 });
        }

        if (!criteria || !criteria.position_name) {
            return Response.json({ error: 'Position criteria is required' }, { status: 400 });
        }

        // Convert base64 to binary
        const binaryStr = atob(fileBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        // Create a proper File object (available in Deno as a Web API)
        const mimeType = fileType || 'application/octet-stream';
        const fileObj = new File([bytes], fileName, { type: mimeType });

        // Step 1: Upload file via SDK (File object works in Deno's Web API environment)
        const uploadResult = await base44.integrations.Core.UploadFile({ file: fileObj });
        const fileUrl = uploadResult.file_url;

        // Step 2: Extract structured data from resume
        const extractionSchema = {
            type: "object",
            properties: {
                full_name: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                total_years_experience: { type: "number" },
                relevant_years_experience: { type: "number", description: "Years of experience specifically in roles similar or directly related to the job being applied for, NOT total career years" },
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
        }

        // Step 3: Code-based comparison
        const codeComparison = buildCodeComparison(extractedData || {}, criteria);

        // Step 4: AI Evaluation with structured criteria
        const criteriaText = buildCriteriaText(criteria);
        const resumeDataStr = extractedData
            ? JSON.stringify(extractedData, null, 2)
            : `File uploaded but could not be parsed. File: ${fileName}`;

        const prompt = `You are an expert HR recruiter and ATS (Applicant Tracking System) evaluator for Al Maraghi Auto Repairs, Abu Dhabi, UAE.

Evaluate the following resume against the structured screening criteria for this role.

SCREENING CRITERIA:
${criteriaText}

EXTRACTED RESUME DATA:
${resumeDataStr}

CODE-BASED REQUIREMENTS MATCH SUMMARY:
- Experience met: ${codeComparison.experience_met}
- Required skills matched: ${codeComparison.candidate_skills_matched?.join(', ') || 'none'}
- Certifications found: ${codeComparison.candidate_certifications?.join(', ') || 'none'}

Provide a thorough, objective evaluation. Consider UAE work environment and automotive industry context.
Be specific and cite actual data from the resume.

Output a JSON with these exact fields:
- score: number 0-100 overall suitability (factor in both required AND preferred criteria)
- recommendation: exactly one of ["Highly Recommended", "Recommended", "Consider", "Not Recommended"]
- summary: 2-3 sentences explaining overall assessment
- matched_skills: array of strings - specific criteria the candidate meets (from the requirements list)
- missing_skills: array of strings - important requirements the candidate lacks
- strengths: array of 3 specific strings from the resume data
- concerns: array of strings - specific red flags (empty if none)
- experience_years: number - estimated years of experience specifically in roles RELEVANT to the position being applied for (NOT total career years). For example, if a candidate has 10 years total but only 3 years in automotive/similar roles, return 3.`;

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

        // Step 5: Save result
        const scanRecord = await base44.entities.ResumeScanResult.create({
            applicant_name: extractedData?.full_name || 'Unknown',
            applicant_email: extractedData?.email || '',
            applicant_phone: extractedData?.phone || '',
            position_applied: criteria.position_name || '',
            department: criteria.department || '',
            file_url: fileUrl,
            file_name: fileName,
            extracted_data: JSON.stringify(extractedData),
            code_comparison: JSON.stringify(codeComparison),
            criteria_used: criteriaText,
            ai_score: aiResponse?.score || 0,
            ai_recommendation: aiResponse?.recommendation || 'Consider',
            ai_summary: aiResponse?.summary || '',
            matched_skills: (aiResponse?.matched_skills || []).join(', '),
            missing_skills: (aiResponse?.missing_skills || []).join(', '),
            strengths: JSON.stringify(aiResponse?.strengths || []),
            concerns: JSON.stringify(aiResponse?.concerns || []),
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
                file_url: fileUrl,
                file_name: fileName,
                extracted_data: JSON.stringify(extractedData),
                code_comparison: codeComparison
            }
        });

    } catch (error) {
        console.error('scanResume error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});