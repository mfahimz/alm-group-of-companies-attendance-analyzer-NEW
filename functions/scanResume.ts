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

// Degree equivalence map — normalized key -> list of matching substrings
const DEGREE_EQUIVALENTS = {
    bachelor: ['bachelor', 'bsc', 'b.sc', 'b.s.', 'b.s ', 'ba ', 'b.a.', 'b.a ', 'be ', 'b.e.', 'b.tech', 'btech', 'b.eng', 'beng', 'bachelor of science', 'bachelor of arts', 'bachelor of engineering', 'bachelor of technology', 'undergraduate degree'],
    master: ['master', 'msc', 'm.sc', 'm.s.', 'm.s ', 'ma ', 'm.a.', 'mba', 'm.b.a', 'm.tech', 'mtech', 'm.eng', 'meng', 'master of science', 'master of arts', 'master of business', 'postgraduate'],
    phd: ['phd', 'ph.d', 'doctorate', 'doctor of philosophy'],
    diploma: ['diploma', 'dip.', 'advanced diploma', 'higher diploma'],
    iti: ['iti', 'industrial training', 'vocational'],
    associate: ['associate', 'aas', 'a.a.s', 'a.s.'],
    highschool: ['high school', 'secondary', 'hsc', 'ssc', 'o-level', 'a-level', 'gcse'],
};

function educationMatches(requiredEdu, candidateEduText) {
    if (!requiredEdu) return null;
    const reqLower = requiredEdu.toLowerCase();
    const candLower = candidateEduText.toLowerCase();

    // Check for direct substring match first
    if (candLower.includes(reqLower)) return true;

    // Find which degree bucket(s) the requirement falls into
    for (const [, synonyms] of Object.entries(DEGREE_EQUIVALENTS)) {
        const reqMatchesBucket = synonyms.some(s => reqLower.includes(s));
        if (reqMatchesBucket) {
            // Check if candidate has any synonym from the same bucket
            if (synonyms.some(s => candLower.includes(s))) return true;
        }
    }

    // Also check specific field keywords (e.g. "automobiles", "mechanical")
    const fieldWords = reqLower.split(/[\s,/]+/).filter(w => w.length > 4);
    if (fieldWords.some(w => candLower.includes(w))) return true;

    return false;
}

// Code-based comparison: deterministic checks against extracted data
function buildCodeComparison(extracted, criteria) {
    const result = {};

    // Experience — use relevant (role-specific) years, fall back to total
    const minExp = parseFloat(criteria.min_experience_years);
    const relevantExp = extracted?.relevant_years_experience ?? null;
    const totalExp = extracted?.total_years_experience ?? null;
    const candExp = relevantExp ?? totalExp;
    result.required_experience = criteria.min_experience_years ? `${criteria.min_experience_years}+ years in relevant role` : null;
    result.candidate_experience = candExp != null
        ? `${candExp} years${relevantExp != null ? ' (relevant role)' : ' (total — relevant not extracted)'}`
        : null;
    result.experience_met = (!isNaN(minExp) && candExp != null) ? candExp >= minExp : null;

    // Education — proper degree equivalence matching
    result.required_education = criteria.required_education || null;
    const candEduText = (extracted?.education || []).map(e => [e.degree, e.field, e.institution].filter(Boolean).join(' ')).join('; ');
    result.candidate_education = candEduText || null;
    result.education_met = educationMatches(criteria.required_education, candEduText);

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

    // Certifications — ALL items must be matched, not just the first
    const reqCertsList = (criteria.required_certifications || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const candCerts = extracted?.certifications || [];
    const candCertText = candCerts.join(' ').toLowerCase() + ' ' + allCandText;
    const matchedCerts = reqCertsList.filter(cert => candCertText.includes(cert));
    const unmatchedCerts = reqCertsList.filter(cert => !candCertText.includes(cert));
    result.required_certifications = criteria.required_certifications || null;
    result.candidate_certifications = candCerts;
    result.certifications_met = reqCertsList.length > 0 ? unmatchedCerts.length === 0 : null;
    result.missing_certifications = unmatchedCerts;

    // Languages — ALL mandatory languages must be present
    const reqLangsRaw = criteria.required_languages || '';
    const candLangs = extracted?.languages || [];
    const candLangText = candLangs.join(' ').toLowerCase();
    result.required_languages = reqLangsRaw || null;
    result.candidate_languages = candLangs;

    if (reqLangsRaw) {
        const mandatoryLangs = reqLangsRaw
            .split(/[,;]/)
            .map(part => part.replace(/\(.*?\)/g, '').trim().toLowerCase())
            .filter(Boolean);
        const missingLangs = mandatoryLangs.filter(lang => !candLangText.includes(lang));
        result.languages_met = missingLangs.length === 0;
        result.missing_languages = missingLangs;
    } else {
        result.languages_met = null;
        result.missing_languages = [];
    }

    // Industry — ALL items must be matched, not just the first
    const reqIndustryList = (criteria.industry_experience || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    result.required_industry = criteria.industry_experience || null;
    result.candidate_industry = (extracted?.experience || []).map(e => e.company).filter(Boolean).join(', ') || null;
    if (reqIndustryList.length > 0) {
        const matchedIndustry = reqIndustryList.filter(ind => allCandText.includes(ind));
        result.industry_met = matchedIndustry.length === reqIndustryList.length;
        result.missing_industry = reqIndustryList.filter(ind => !allCandText.includes(ind));
    } else {
        result.industry_met = null;
        result.missing_industry = [];
    }

    return result;
}

const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
];
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc'];

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

        // File type validation
        const ext = ('.' + fileName.split('.').pop()).toLowerCase();
        const mimeOk = ALLOWED_MIME_TYPES.includes(fileType);
        const extOk = ALLOWED_EXTENSIONS.includes(ext);
        if (!mimeOk && !extOk) {
            return Response.json({ error: 'Invalid file type. Only PDF and DOCX resumes are accepted.' }, { status: 400 });
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
        const mimeType = fileType || 'application/octet-stream';
        const fileObj = new File([bytes], fileName, { type: mimeType });

        // Step 1: Upload file
        const uploadResult = await base44.integrations.Core.UploadFile({ file: fileObj });
        const fileUrl = uploadResult.file_url;

        // Step 2: Extract structured data from resume
        const extractionSchema = {
            type: "object",
            properties: {
                full_name: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                total_years_experience: { type: "number", description: "Total years across all jobs" },
                relevant_years_experience: {
                    type: "number",
                    description: `Years of experience in roles directly similar to "${criteria.position_name}" in the ${criteria.department || 'relevant'} field. Count only roles where the job title, responsibilities, or industry closely match this position. Do NOT count unrelated roles.`
                },
                current_or_last_position: { type: "string" },
                current_or_last_company: { type: "string" },
                skills: { type: "array", items: { type: "string" } },
                education: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            degree: { type: "string" },
                            field: { type: "string", description: "Field of study, e.g. Mechanical Engineering, Computer Science" },
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
                languages: { type: "array", items: { type: "string" } },
                // Business logic: Extract nationality to display prominently at the top of the scan results
                nationality: { type: "string", description: "The candidate's nationality, e.g., Syrian, Egyptian, Indian, etc. If not explicitly found, return null or an empty string." }
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

        // Step 4: AI Evaluation
        const criteriaText = buildCriteriaText(criteria);
        const resumeDataStr = extractedData
            ? JSON.stringify(extractedData, null, 2)
            : `File uploaded but could not be parsed. File: ${fileName}`;

        const prompt = `You are an expert HR recruiter and ATS evaluator for Al Maraghi Auto Repairs, Abu Dhabi, UAE.

You are evaluating this candidate specifically for the role of: ${criteria.position_name}. All scoring, skill matching, and recommendations must be made relative to the requirements of this position only.

Evaluate the following resume against the structured screening criteria for this role.

SCREENING CRITERIA:
${criteriaText}

EXTRACTED RESUME DATA:
${resumeDataStr}

CODE-BASED REQUIREMENTS MATCH SUMMARY:
- Experience met: ${codeComparison.experience_met}
- Required skills matched: ${codeComparison.candidate_skills_matched?.join(', ') || 'none'}
- Certifications found: ${codeComparison.candidate_certifications?.join(', ') || 'none'}
- Languages present: ${(extractedData?.languages || []).join(', ') || 'none'}
- Missing languages: ${codeComparison.missing_languages?.join(', ') || 'none'}

Provide a thorough, objective evaluation. Consider UAE work environment and automotive industry context.
Be specific and cite actual data from the resume.

Output a JSON with these exact fields:
- score: number 0-100 overall suitability
- recommendation: exactly one of ["Highly Recommended", "Recommended", "Consider", "Not Recommended"]
- summary: 2-3 sentences explaining overall assessment
- matched_skills: array of strings - specific criteria the candidate meets
- missing_skills: array of strings - important requirements the candidate lacks
- strengths: array of 3 specific strings from the resume data
- concerns: array of strings - specific red flags (empty array if none)
- experience_years: number - years in roles RELEVANT to "${criteria.position_name}" only, not total career years`;

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

        // Properly distinguish score=0 from missing score
        const aiScore = aiResponse?.score != null ? aiResponse.score : 0;

        // Step 5: Save result — consistent JSON array storage for all list fields
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
            criteria_data: JSON.stringify(criteria), // structured criteria for audit/re-run
            ai_score: aiScore,
            ai_recommendation: aiResponse?.recommendation || 'Consider',
            ai_summary: aiResponse?.summary || '',
            matched_skills: JSON.stringify(aiResponse?.matched_skills || []),
            missing_skills: JSON.stringify(aiResponse?.missing_skills || []),
            strengths: JSON.stringify(aiResponse?.strengths || []),
            concerns: JSON.stringify(aiResponse?.concerns || []),
            years_experience: aiResponse?.experience_years ?? extractedData?.relevant_years_experience ?? extractedData?.total_years_experience ?? 0,
            scanned_by: user.email,
            status: 'completed',
            // evaluated_template_name records which template (position) was used in this
            // specific scan call. The frontend uses this in multi-template mode to map
            // each independent scan result back to the template that produced it.
            evaluated_template_name: criteria.position_name || ''
        });

        return Response.json({
            success: true,
            scanId: scanRecord.id,
            result: {
                score: aiScore,
                recommendation: aiResponse?.recommendation || 'Consider',
                summary: aiResponse?.summary || '',
                matched_skills: aiResponse?.matched_skills || [],
                missing_skills: aiResponse?.missing_skills || [],
                strengths: aiResponse?.strengths || [],
                concerns: aiResponse?.concerns || [],
                experience_years: aiResponse?.experience_years ?? 0,
                applicant_name: extractedData?.full_name || 'Unknown',
                applicant_email: extractedData?.email || '',
                // Pass the scanned nationality to the frontend; use placeholder if missing
                nationality: extractedData?.nationality || 'Not Specified',
                file_url: fileUrl,
                file_name: fileName,
                extracted_data: JSON.stringify(extractedData),
                code_comparison: codeComparison,
                evaluated_template_name: criteria.position_name || ''
            }
        });

    } catch (error) {
        console.error('scanResume error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});