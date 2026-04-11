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
        const { fileBase64, fileName, fileType, criteria, mode = 'full', existingData = null, existingFileUrl = null } = body;

        // Validation for different modes
        if (mode === 'full' || mode === 'extraction_only') {
            if (!fileBase64 || !fileName) {
                return Response.json({ error: 'File data is required for this mode' }, { status: 400 });
            }
        }
        
        if (mode === 'evaluation_only' && !existingData) {
            return Response.json({ error: 'Extracted data is required for re-evaluation' }, { status: 400 });
        }

        const criteriaList = Array.isArray(criteria) ? criteria : (criteria ? [criteria] : []);
        if (mode !== 'extraction_only' && criteriaList.length === 0) {
            return Response.json({ error: 'Position criteria is required for evaluation' }, { status: 400 });
        }

        // File type validation (if file is provided)
        if (fileBase64 && fileName) {
            const ext = ('.' + fileName.split('.').pop()).toLowerCase();
            const mimeOk = ALLOWED_MIME_TYPES.includes(fileType);
            const extOk = ALLOWED_EXTENSIONS.includes(ext);
            if (!mimeOk && !extOk) {
                return Response.json({ error: 'Invalid file type. Only PDF and DOCX resumes are accepted.' }, { status: 400 });
            }
        }

        // Helper: Extract structured data from uploaded file
        async function extractResumeData(fileUrl: string, positionName: string) {
            const extractionSchema = {
                type: "object",
                properties: {
                    full_name: { type: "string" },
                    email: { type: "string" },
                    phone: { type: "string" },
                    mobile_number: { type: "string", description: "The candidate's primary mobile or phone number if available." },
                    total_years_experience: { type: "number", description: "Total years across all jobs" },
                    relevant_years_experience: {
                        type: "number",
                        description: `Years of experience in roles directly similar to "${positionName}" in the field. Count only roles where the job title, responsibilities, or industry closely match this position. Do NOT count unrelated roles.`
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
                    nationality: { type: "string", description: "The candidate's nationality, e.g., Syrian, Egyptian, Indian, etc." },
                    current_location: { type: "string", description: "The candidate's current city and country of residence." },
                    gender: { type: "string", description: "The candidate's gender (Male/Female)." }
                }
            };

            const extractionResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
                file_url: fileUrl,
                json_schema: extractionSchema
            });

            if (extractionResult.status !== 'success') {
                throw new Error('Extraction failed: ' + (extractionResult.error || 'Unknown error'));
            }

            const output = extractionResult.output;

            // Country Detection Logic
            function detectCountry(num: string) {
                if (!num) return null;
                const clean = num.replace(/\D/g, '');
                const raw = num.trim();

                // International codes first (most reliable)
                if (raw.startsWith('+971') || raw.startsWith('00971') || clean.startsWith('971')) return 'UAE';
                if (raw.startsWith('+966') || raw.startsWith('00966') || clean.startsWith('966')) return 'Saudi Arabia';
                if (raw.startsWith('+974') || raw.startsWith('00974') || clean.startsWith('974')) return 'Qatar';
                if (raw.startsWith('+965') || raw.startsWith('00965') || clean.startsWith('965')) return 'Kuwait';
                if (raw.startsWith('+973') || raw.startsWith('00973') || clean.startsWith('973')) return 'Bahrain';
                if (raw.startsWith('+968') || raw.startsWith('00968') || clean.startsWith('968')) return 'Oman';
                if (raw.startsWith('+91') || raw.startsWith('0091') || clean.startsWith('91')) return 'India';

                // Local prefix logic
                if (clean.startsWith('05')) {
                    // Ambiguous between UAE and Saudi per prompt, defaulting to UAE based on prompt order 
                    // unless it matches common lengths. But prompt says "matches UAE format ... label as UAE".
                    return 'UAE'; 
                }
                
                // Qatar: 3, 5, 6, 7 (length 8)
                if ((/^[3567]/.test(clean) && clean.length === 8)) return 'Qatar';
                // Kuwait: 5, 6, 9 (length 8)
                if ((/^[569]/.test(clean) && clean.length === 8)) return 'Kuwait';
                // Bahrain: 3 (length 8)
                if (clean.startsWith('3') && clean.length === 8) return 'Bahrain';
                // Oman: 7, 9 (length 8)
                if (/^[79]/.test(clean) && clean.length === 8) return 'Oman';
                // India: 6, 7, 8, 9 (length 10)
                if (/^[6789]/.test(clean) && clean.length === 10) return 'India';

                return null;
            }

            output.mobile_country = detectCountry(output.mobile_number || output.phone || '');
            
            return output;
        }

        // Helper: Evaluate extracted data against position criteria
        async function evaluateCandidate(extractedData: any, criteria: any) {
            const codeComparison = buildCodeComparison(extractedData, criteria);
            const criteriaText = buildCriteriaText(criteria);
            const resumeDataStr = JSON.stringify(extractedData, null, 2);

            // Mandatory Rule Checking Logic
            const mandatoryRules = criteria.mandatory_rules || [];
            const failedMandatory = [];
            
            if (mandatoryRules.length > 0) {
                // Check min experience if mandatory
                if (mandatoryRules.includes('min_experience_years') && criteria.min_experience_years) {
                    const candExp = extractedData.relevant_years_experience ?? extractedData.total_years_experience ?? 0;
                    if (candExp < parseFloat(criteria.min_experience_years)) {
                        failedMandatory.push(`Required ${criteria.min_experience_years}+ years experience (Candidate has ${candExp}y)`);
                    }
                }
                // Other mandatory checks (keywords in skills, education, etc.) can be added here
                // For now, we'll let the AI also flag mandatory failures in its summary if we mention them in the prompt
            }

            // --- CHANGE 1: Title match score ---
            const posName = (criteria.position_name || '').toLowerCase();
            const candTitle = (extractedData.current_or_last_position || '').toLowerCase();
            let title_match_score = 0;
            let title_match_label = "No Match";
            if (posName && candTitle) {
                if (posName === candTitle) {
                    title_match_score = 100;
                    title_match_label = "Exact Match";
                } else if (posName.includes(candTitle) || candTitle.includes(posName)) {
                    title_match_score = 60;
                    title_match_label = "Partial Match";
                }
            }

            // --- CHANGE 2: Experience recency score ---
            const currentYear = new Date().getFullYear();
            const experienceEntries = extractedData.experience || [];
            let experience_recency = "Low";
            let latestRelevantYear = -1;
            
            for (const exp of experienceEntries) {
                const role = (exp.role || '').toLowerCase();
                const isRelevant = posName && role && (posName.includes(role) || role.includes(posName));
                
                if (isRelevant) {
                    const dur = (exp.duration || '').toLowerCase();
                    if (dur.includes('present') || dur.includes('current') || dur.includes('now') || (dur.includes(String(currentYear)) && !dur.includes('-'))) {
                        latestRelevantYear = currentYear;
                        break; 
                    } else {
                        const years = dur.match(/\b(20\d\d)\b/g); 
                        if (years) {
                            const endYear = Math.max(...years.map(y => parseInt(y)));
                            if (endYear > latestRelevantYear) latestRelevantYear = endYear;
                        }
                    }
                }
            }
            
            if (latestRelevantYear >= currentYear - 3 && latestRelevantYear !== -1) {
                experience_recency = "High";
            } else if (latestRelevantYear >= currentYear - 6 && latestRelevantYear !== -1) {
                experience_recency = "Medium";
            } else {
                experience_recency = "Low";
            }

            const prompt = `You are an expert HR recruiter and ATS evaluator for Al Maraghi Auto Repairs, Abu Dhabi, UAE.

You are evaluating this candidate specifically for the role of: ${criteria.position_name}.
All scoring, skill matching, and recommendations must be made relative to the requirements of this position only.

${failedMandatory.length > 0 ? `CRITICAL: The candidate FAILED the following mandatory requirements:\n- ${failedMandatory.join('\n- ')}\nAdjust score and recommendation accordingly.` : ''}

SCREENING CRITERIA:
${criteriaText}

EXTRACTED RESUME DATA:
${resumeDataStr}

CODE-BASED REQUIREMENTS MATCH SUMMARY:
- Experience met: ${codeComparison.experience_met}
- Required skills matched: ${codeComparison.candidate_skills_matched?.join(', ') || 'none'}
- Certifications found: ${codeComparison.candidate_certifications?.join(', ') || 'none'}
- Languages present: ${(extractedData?.languages || []).join(', ') || 'none'}

Output a JSON with these exact fields:
- score: number 0-100 overall suitability
- recommendation: exactly one of ["Highly Recommended", "Recommended", "Consider", "Not Recommended"]
- summary: 2-3 sentences explaining overall assessment. If they failed a mandatory rule, state it clearly.
- matched_skills: array of strings
- missing_skills: array of strings
- strengths: array of 3 specific strings
- concerns: array of strings. If they failed mandatory rules, list them here.
- experience_years: number (relevant to the role)
- red_flags: array of strings. Identify specific red flags: employment gaps longer than 6 months, job hopping (defined as more than two roles with less than 12 months tenure each), and industry mismatch where the candidate has no experience in the automotive or related technical service industry. If no red flags are found return an empty array.`;

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
                        experience_years: { type: "number" },
                        red_flags: { type: "array", items: { type: "string" } }
                    }
                }
            });

            // If mandatory rules failed, ensure the recommendation is at most 'Not Recommended' or similar
            if (failedMandatory.length > 0 && (aiResponse.recommendation === 'Highly Recommended' || aiResponse.recommendation === 'Recommended')) {
                aiResponse.recommendation = 'Not Recommended';
                aiResponse.score = Math.min(aiResponse.score, 30);
            }

            return {
                aiResponse,
                codeComparison,
                criteriaText,
                failedMandatory,
                title_match_score,
                title_match_label,
                experience_recency
            };
        }

        let fileUrl = existingFileUrl;
        let extractedData = existingData;

        // Step 1: Upload (if needed)
        let fileObj: File | null = null;
        if (!fileUrl && fileBase64) {
            const binaryStr = atob(fileBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }
            const mimeType = fileType || 'application/octet-stream';
            fileObj = new File([bytes], fileName, { type: mimeType });
            
            const uploadResult = await base44.integrations.Core.UploadFile({ file: fileObj });
            fileUrl = uploadResult.file_url;
        }

        // Step 2: Extract (if needed)
        if (!extractedData && fileUrl && (mode === 'full' || mode === 'extraction_only')) {
            const contextPosition = criteriaList[0]?.position_name || 'Generic Role';
            extractedData = await extractResumeData(fileUrl, contextPosition);
        }

        if (mode === 'extraction_only') {
            return Response.json({ success: true, extractedData, fileUrl });
        }

        // Step 3: Evaluate
        const evaluations = [];
        for (const crit of criteriaList) {
            const evalResult = await evaluateCandidate(extractedData, crit);
            evaluations.push({
                criteria: crit,
                ...evalResult,
                aiScore: evalResult.aiResponse.score,
                title_match_score: evalResult.title_match_score,
                title_match_label: evalResult.title_match_label,
                experience_recency: evalResult.experience_recency
            });
        }

        // Find the best evaluation
        const best = evaluations.reduce((prev, current) => (current.aiScore > prev.aiScore ? current : prev), evaluations[0]);

        // Step 4: Save to history
        const scanRecord = await base44.entities.ResumeScanResult.create({
            applicant_name: extractedData?.full_name || 'Unknown',
            applicant_email: extractedData?.email || '',
            applicant_phone: extractedData?.phone || '',
            mobile_number: extractedData?.mobile_number || '',
            mobile_country: extractedData?.mobile_country || '',
            position_applied: best.criteria.position_name || '',
            department: best.criteria.department || '',
            file_url: fileUrl,
            file_name: fileName || 'uploaded_resume',
            extracted_data: JSON.stringify(extractedData),
            code_comparison: JSON.stringify(best.codeComparison),
            criteria_used: best.criteriaText,
            criteria_data: JSON.stringify(best.criteria),
            ai_score: best.aiScore,
            ai_recommendation: best.aiResponse?.recommendation || 'Consider',
            ai_summary: best.aiResponse?.summary || '',
            matched_skills: JSON.stringify(best.aiResponse?.matched_skills || []),
            missing_skills: JSON.stringify(best.aiResponse?.missing_skills || []),
            strengths: JSON.stringify(best.aiResponse?.strengths || []),
            concerns: JSON.stringify(best.aiResponse?.concerns || []),
            years_experience: best.aiResponse?.experience_years ?? extractedData?.relevant_years_experience ?? extractedData?.total_years_experience ?? 0,
            title_match_score: best.title_match_score,
            title_match_label: best.title_match_label,
            experience_recency: best.experience_recency,
            red_flags: JSON.stringify(best.aiResponse?.red_flags || []),
            scanned_by: user.email,
            status: 'completed',
            evaluation_status: best.failedMandatory.length > 0 ? 'Rejected' : 'Pending',
            nationality: extractedData?.nationality || 'Not Specified',
            location: extractedData?.current_location || 'Not Specified',
            gender: extractedData?.gender || 'Not Specified',
            evaluated_template_name: best.criteria.position_name || '',
            // Company is passed from the selected template at scan time and saved 
            // directly on the result record for reliable company grouping.
            company: best.criteria.company || ''
        });

        return Response.json({
            success: true,
            scanId: scanRecord.id,
            result: {
                // Unified field names: matching the ResumeScanResult entity structure
                ai_score: best.aiScore,
                ai_recommendation: best.aiResponse?.recommendation,
                summary: best.aiResponse?.summary,
                matched_skills: best.aiResponse?.matched_skills,
                missing_skills: best.aiResponse?.missing_skills,
                strengths: best.aiResponse?.strengths,
                concerns: [
                    ...(best.aiResponse?.concerns || []),
                    ...best.failedMandatory
                ],
                years_experience: scanRecord.years_experience,
                applicant_name: scanRecord.applicant_name,
                applicant_email: scanRecord.applicant_email,
                nationality: scanRecord.nationality,
                location: scanRecord.location,
                gender: scanRecord.gender,
                file_url: fileUrl,
                file_name: fileName,
                extracted_data: JSON.stringify(extractedData),
                code_comparison: best.codeComparison,
                matched_template_name: best.criteria.position_name,
                failed_mandatory: best.failedMandatory,
                title_match_score: best.title_match_score,
                title_match_label: best.title_match_label,
                experience_recency: best.experience_recency,
                red_flags: best.aiResponse?.red_flags || [],
                template_scores: criteriaList.length > 1 ? evaluations.map(e => ({
                    template_name: e.criteria.position_name,
                    score: e.aiScore
                })) : undefined
            }
        });

    } catch (error) {
        console.error('scanResume error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});