import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || (user.role !== 'admin' && user.extended_role !== 'supervisor')) {
            return Response.json({ error: 'Forbidden: Admin or Supervisor access required' }, { status: 403 });
        }

        const { candidate_id, job_position_id, file_url } = await req.json();

        if (!candidate_id || !job_position_id || !file_url) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch job requirements
        const requirements = await base44.asServiceRole.entities.JobRequirement.filter({
            job_position_id
        });

        if (requirements.length === 0) {
            return Response.json({ error: 'No requirements defined for this job position' }, { status: 400 });
        }

        // Prepare requirements for LLM analysis
        const mustHaveReqs = requirements.filter(r => r.importance === 'must_have');
        const niceToHaveReqs = requirements.filter(r => r.importance === 'nice_to_have');

        const prompt = `Analyze this resume (PDF URL: ${file_url}) against the following job requirements.

MUST HAVE REQUIREMENTS:
${mustHaveReqs.map((r, i) => `${i + 1}. ${r.requirement_text}`).join('\n')}

NICE TO HAVE REQUIREMENTS:
${niceToHaveReqs.map((r, i) => `${i + 1}. ${r.requirement_text}`).join('\n')}

Please analyze the resume and provide:
1. A JSON object with extracted candidate information (name, email, phone, years_of_experience)
2. List of skills extracted from the resume
3. Which requirements are matched (by index number)
4. Which requirements are missing
5. Overall match score (0-100)
6. A brief summary of the candidate's fit

Return the response as a JSON object with the following structure:
{
  "candidate": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "years_of_experience": number
  },
  "extracted_skills": ["skill1", "skill2", ...],
  "matched_requirements": [{"index": 1, "requirement": "text", "match_level": "high/medium"}],
  "missing_requirements": ["requirement text"],
  "overall_score": number,
  "summary": "brief analysis"
}`;

        // Call LLM to analyze resume
        const analysisResponse = await base44.integrations.Core.InvokeLLM({
            prompt,
            add_context_from_internet: false,
            file_urls: file_url,
            response_json_schema: {
                type: 'object',
                properties: {
                    candidate: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            email: { type: 'string' },
                            phone: { type: 'string' },
                            years_of_experience: { type: 'number' }
                        }
                    },
                    extracted_skills: { type: 'array', items: { type: 'string' } },
                    matched_requirements: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                index: { type: 'number' },
                                requirement: { type: 'string' },
                                match_level: { type: 'string' }
                            }
                        }
                    },
                    missing_requirements: { type: 'array', items: { type: 'string' } },
                    overall_score: { type: 'number' },
                    summary: { type: 'string' }
                }
            }
        });

        // Calculate must-have matches
        const mustHaveMatches = analysisResponse.matched_requirements
            .filter(m => m.index <= mustHaveReqs.length)
            .length;

        // Determine recommendation
        let recommendation = 'not_suitable';
        const scoreThreshold = 70;

        if (analysisResponse.overall_score >= scoreThreshold) {
            if (mustHaveMatches === mustHaveReqs.length && analysisResponse.overall_score >= 85) {
                recommendation = 'strong_match';
            } else if (mustHaveMatches === mustHaveReqs.length) {
                recommendation = 'good_match';
            } else if (mustHaveMatches >= Math.ceil(mustHaveReqs.length * 0.7)) {
                recommendation = 'moderate_match';
            }
        } else if (analysisResponse.overall_score >= 50) {
            recommendation = 'weak_match';
        }

        // Create screening result
        const screeningResult = await base44.asServiceRole.entities.ScreeningResult.create({
            candidate_id,
            job_position_id,
            overall_score: analysisResponse.overall_score,
            must_have_match_count: mustHaveMatches,
            must_have_total: mustHaveReqs.length,
            nice_to_have_match_count: analysisResponse.matched_requirements.filter(m => m.index > mustHaveReqs.length).length,
            matched_requirements: JSON.stringify(analysisResponse.matched_requirements),
            missing_requirements: JSON.stringify(analysisResponse.missing_requirements),
            extracted_skills: JSON.stringify(analysisResponse.extracted_skills),
            extracted_experience_years: analysisResponse.candidate.years_of_experience,
            ai_analysis_summary: analysisResponse.summary,
            recommendation
        });

        // Update candidate with extracted data and status
        await base44.asServiceRole.entities.Candidate.update(candidate_id, {
            candidate_name: analysisResponse.candidate.name,
            candidate_email: analysisResponse.candidate.email,
            candidate_phone: analysisResponse.candidate.phone,
            screening_status: 'analyzed'
        });

        return Response.json({
            success: true,
            screening_result: screeningResult
        });

    } catch (error) {
        console.error('Resume analysis error:', error);
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});