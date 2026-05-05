import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { 
  format, 
  parseISO, 
  isValid
} from 'npm:date-fns@3.6.0';
import { formatInTimeZone, toZonedTime } from 'npm:date-fns-tz@3.1.3';

const UAE_TIMEZONE = 'Asia/Dubai';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const client = base44.asServiceRole;

    // Get current time in UAE
    const now = new Date();
    const todayStr = formatInTimeZone(now, UAE_TIMEZONE, 'yyyy-MM-dd');
    const nowISO = now.toISOString();

    console.log(`[AutoProject] Running for UAE date: ${todayStr}`);

    // 1. Fetch pending schedules that should have triggered by today
    // We check trigger_date <= todayStr to handle any missed runs (though usually it's exactly today)
    const schedules = await client.entities.ProjectSchedule.filter({
      status: 'pending',
      trigger_date: { $lte: todayStr }
    });

    if (!schedules || schedules.length === 0) {
      console.log('[AutoProject] No pending schedules for today.');
      return Response.json({ success: true, message: 'No pending schedules found.' });
    }

    const results = [];
    
    // Process in batches of 10
    for (let i = 0; i < schedules.length; i += 10) {
      const batch = schedules.slice(i, i + 10);
      
      for (const schedule of batch) {
        try {
          const outcome = await processScheduleRow(client, schedule, nowISO);
          results.push({ schedule_id: schedule.id, ...outcome });
        } catch (err) {
          console.error(`[AutoProject] Error processing schedule ${schedule.id}:`, err);
          results.push({ schedule_id: schedule.id, status: 'error', error: err.message });
          
          await client.entities.ProjectSchedule.update(schedule.id, {
            status: 'failed',
            error_message: err.message,
            last_run_at: nowISO
          });

          await logAudit(client, {
            action_type: 'error',
            entity_name: 'ProjectSchedule',
            entity_id: schedule.id,
            context: `Failed to process schedule row: ${err.message}`,
            company: schedule.company
          });
        }
        
        await delay(300);
      }
    }

    return Response.json({
      success: true,
      today: todayStr,
      processed_count: schedules.length,
      results
    });

  } catch (error) {
    console.error('[AutoProject] Global error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function processScheduleRow(client, schedule, nowISO) {
  const { 
    company, 
    project_name, 
    date_from, 
    date_to, 
    is_dry_run, 
    auto_fill_defaults 
  } = schedule;

  // 1. Duplicate prevention (Company + date_from + date_to)
  const existingProjects = await client.entities.Project.filter({
    company: company,
    date_from: date_from,
    date_to: date_to
  });

  if (existingProjects && existingProjects.length > 0) {
    // Project already exists (manual creation or previous run)
    await client.entities.ProjectSchedule.update(schedule.id, {
      status: 'completed',
      last_run_at: nowISO,
      error_message: 'Skipped: Project already exists for this period.'
    });
    
    await logAudit(client, {
      action_type: 'skip',
      entity_name: 'ProjectSchedule',
      entity_id: schedule.id,
      context: `Project already exists for ${company} (${date_from} to ${date_to}). Row marked as completed.`,
      company: company
    });
    
    return { status: 'skipped', reason: 'duplicate_project' };
  }

  // 2. Dry Run check
  if (is_dry_run) {
    await client.entities.ProjectSchedule.update(schedule.id, {
      status: 'completed',
      last_run_at: nowISO,
      error_message: 'Dry run completed successfully.'
    });

    await logAudit(client, {
      action_type: 'dry_run',
      entity_name: 'ProjectSchedule',
      entity_id: schedule.id,
      context: `DRY RUN: Would have created project "${project_name}" for ${company} (${date_from} to ${date_to})`,
      company: company
    });

    return { status: 'dry_run', project_name, date_from, date_to };
  }

  // 3. Create Project
  const defaults = auto_fill_defaults ? JSON.parse(auto_fill_defaults) : {};
  
  const projectData = {
    name: project_name,
    company: company,
    date_from: date_from,
    date_to: date_to,
    description: `Automatically created via schedule row: ${schedule.label || schedule.id}`,
    status: 'draft',
    // Apply defaults or safe fallbacks
    salary_calculation_days: defaults.salary_calculation_days || 30,
    ot_calculation_days: defaults.ot_calculation_days || 30,
    weekly_off_override: defaults.weekly_off_override || 'None',
    use_carried_grace_minutes: defaults.use_carried_grace_minutes || false,
    use_gift_minutes: defaults.use_gift_minutes || false,
    shift_blocks_count: defaults.shift_blocks_count || 2,
    ...defaults
  };

  const newProject = await client.entities.Project.create(projectData);

  // 4. Mark schedule as completed
  await client.entities.ProjectSchedule.update(schedule.id, {
    status: 'completed',
    last_run_at: nowISO
  });

  // 5. Audit Log
  await logAudit(client, {
    action_type: 'create',
    entity_name: 'ProjectSchedule',
    entity_id: schedule.id,
    context: `Successfully created project: ${project_name} (${newProject.id})`,
    project_id: newProject.id,
    company: company
  });

  return { status: 'created', project_id: newProject.id, name: project_name };
}

async function logAudit(client, payload) {
  try {
    await client.entities.AuditLog.create({
      ...payload,
      user_email: 'system-automation@base44.ai',
      user_role: 'system'
    });
  } catch (err) {
    console.error('[AutoProject] AuditLog failed:', err);
  }
}
