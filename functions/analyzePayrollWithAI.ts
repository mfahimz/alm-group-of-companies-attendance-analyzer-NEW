import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, analysis_type } = await req.json();

        // Fetch relevant data
        const [project, salarySnapshots, analysisResults, employees, exceptions] = await Promise.all([
            project_id ? base44.entities.Project.filter({ id: project_id }) : Promise.resolve([]),
            project_id 
                ? base44.asServiceRole.entities.SalarySnapshot.filter({ project_id })
                : base44.asServiceRole.entities.SalarySnapshot.list('-created_date', 100),
            project_id
                ? base44.asServiceRole.entities.AnalysisResult.filter({ project_id })
                : base44.asServiceRole.entities.AnalysisResult.list('-created_date', 100),
            base44.asServiceRole.entities.Employee.filter({ company: user.company, active: true }),
            project_id
                ? base44.asServiceRole.entities.Exception.filter({ project_id })
                : base44.asServiceRole.entities.Exception.list('-created_date', 50)
        ]);

        const projectData = project.length > 0 ? project[0] : null;

        // Prepare data summary for AI
        const dataSummary = {
            project: projectData ? {
                name: projectData.name,
                date_from: projectData.date_from,
                date_to: projectData.date_to,
                status: projectData.status
            } : 'All recent data',
            total_employees: employees.length,
            total_salary_records: salarySnapshots.length,
            total_analysis_records: analysisResults.length,
            total_exceptions: exceptions.length,
            salary_data_sample: salarySnapshots.slice(0, 20).map(s => ({
                employee_name: s.employee_name,
                attendance_id: s.attendance_id,
                basic_salary: s.basic_salary,
                total_salary: s.total_salary,
                deductible_amount: s.deductible_amount,
                lop_deduction: s.lop_deduction,
                present_days: s.present_days,
                full_absence_count: s.full_absence_count,
                deductible_hours: s.deductible_hours
            })),
            analysis_data_sample: analysisResults.slice(0, 20).map(a => ({
                attendance_id: a.attendance_id,
                working_days: a.working_days,
                present_days: a.present_days,
                full_absence_count: a.full_absence_count,
                late_minutes: a.late_minutes,
                early_checkout_minutes: a.early_checkout_minutes,
                deductible_minutes: a.deductible_minutes
            })),
            exception_summary: {
                by_type: exceptions.reduce((acc, e) => {
                    acc[e.type] = (acc[e.type] || 0) + 1;
                    return acc;
                }, {}),
                pending_approvals: exceptions.filter(e => e.approval_status?.includes('pending')).length
            }
        };

        let prompt = '';
        let response_schema = {};

        if (analysis_type === 'anomaly_detection') {
            prompt = `You are an expert payroll auditor. Analyze the following payroll data and identify potential anomalies, discrepancies, or issues that require attention.

Data Summary:
${JSON.stringify(dataSummary, null, 2)}

Identify:
1. Unusual salary deductions or patterns
2. Employees with abnormally high absence rates
3. Inconsistencies between attendance and salary records
4. Potential data entry errors
5. Outliers in late minutes or early checkout patterns

For each anomaly found, provide:
- Severity (high/medium/low)
- Description of the issue
- Affected employee(s) if applicable
- Recommended action`;

            response_schema = {
                type: "object",
                properties: {
                    anomalies: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                severity: { type: "string", enum: ["high", "medium", "low"] },
                                category: { type: "string" },
                                description: { type: "string" },
                                affected_employees: { type: "array", items: { type: "string" } },
                                recommended_action: { type: "string" }
                            }
                        }
                    },
                    summary: { type: "string" },
                    overall_health_score: { type: "number" }
                }
            };
        } else if (analysis_type === 'cost_prediction') {
            prompt = `You are a financial forecasting expert. Based on the historical payroll data provided, predict future payroll costs and provide insights.

Data Summary:
${JSON.stringify(dataSummary, null, 2)}

Provide:
1. Predicted monthly payroll cost for the next 3 months
2. Key factors influencing the predictions
3. Potential cost-saving opportunities
4. Employee growth trend analysis
5. Risk factors that could increase costs`;

            response_schema = {
                type: "object",
                properties: {
                    predictions: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                month: { type: "string" },
                                predicted_cost: { type: "number" },
                                confidence_level: { type: "string" }
                            }
                        }
                    },
                    key_factors: { type: "array", items: { type: "string" } },
                    cost_saving_opportunities: { type: "array", items: { type: "string" } },
                    growth_trend: { type: "string" },
                    risk_factors: { type: "array", items: { type: "string" } }
                }
            };
        } else if (analysis_type === 'optimization_report') {
            prompt = `You are a payroll optimization consultant. Analyze the payroll data and generate a comprehensive report with actionable insights.

Data Summary:
${JSON.stringify(dataSummary, null, 2)}

Generate a report covering:
1. Key metrics (average salary, total deductions, attendance rates)
2. Areas for optimization (process improvements, policy recommendations)
3. Compliance and accuracy assessment
4. Employee attendance patterns and trends
5. Exception management effectiveness
6. Actionable recommendations prioritized by impact`;

            response_schema = {
                type: "object",
                properties: {
                    key_metrics: {
                        type: "object",
                        properties: {
                            average_salary: { type: "number" },
                            total_deductions: { type: "number" },
                            average_attendance_rate: { type: "number" },
                            average_late_minutes: { type: "number" }
                        }
                    },
                    optimization_areas: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                area: { type: "string" },
                                description: { type: "string" },
                                impact: { type: "string", enum: ["high", "medium", "low"] },
                                recommendation: { type: "string" }
                            }
                        }
                    },
                    compliance_score: { type: "number" },
                    attendance_insights: { type: "string" },
                    recommendations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                priority: { type: "string", enum: ["high", "medium", "low"] },
                                title: { type: "string" },
                                description: { type: "string" },
                                expected_benefit: { type: "string" }
                            }
                        }
                    }
                }
            };
        } else {
            return Response.json({ error: 'Invalid analysis_type' }, { status: 400 });
        }

        // Call AI
        const aiResponse = await base44.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: response_schema
        });

        return Response.json({
            success: true,
            analysis_type,
            result: aiResponse,
            generated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('AI Analysis Error:', error);
        return Response.json({ 
            error: error.message,
            details: error.stack 
        }, { status: 500 });
    }
});