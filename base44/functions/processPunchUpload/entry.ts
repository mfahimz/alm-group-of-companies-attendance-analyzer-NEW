import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';
import * as XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, file_uri, file_metadata, upload_type } = await req.json();

        if (!project_id || !file_uri) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // 1. Create UploadJob record
        const uploadJob = await base44.asServiceRole.entities.UploadJob.create({
            project_id,
            user_email: user.email,
            file_name: file_metadata?.name || 'unknown',
            file_mime_type: file_metadata?.type || 'unknown',
            file_size_bytes: file_metadata?.size || 0,
            file_uri,
            upload_type,
            status: 'processing',
            progress: 0,
            import_batch_id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        });

        const updateJob = async (updates) => {
            await base44.asServiceRole.entities.UploadJob.update(uploadJob.id, updates);
        };

        try {
            // 2. Download file content
            const { signed_url: signedUrl } = await base44.integrations.Core.CreateFileSignedUrl({ 
                file_uri,
                expires_in: 300 // 5 minutes
            });

            if (!signedUrl) {
                throw new Error('Could not generate signed URL for file access');
            }

            const response = await fetch(signedUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch file: ${response.statusText}`);
            }
            
            const fileContent = await response.arrayBuffer();

            if (!fileContent) {
                throw new Error('Could not retrieve file content from storage');
            }

            // 3. Guard against extremely large files that might crash the runtime during parsing
            const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB limit for safety in Deno
            if (fileContent.byteLength > MAX_FILE_SIZE_BYTES) {
                throw new Error('This file is too large to process. Please try uploading a smaller file or splitting your data into multiple files.');
            }

            await updateJob({ progress: 10 });

            // 4. Parse and Validate
            let workbook;
            try {
                workbook = XLSX.read(new Uint8Array(fileContent), { type: 'array', cellDates: true });
            } catch (parseError) {
                console.error('XLSX parse error:', parseError);
                throw new Error('We could not read the format of this file. Please ensure it is a valid Excel or CSV file.');
            }
            
            const project = await base44.asServiceRole.entities.Project.get(project_id);
            
            if (!project) {
                throw new Error('Project not found');
            }
            
            // Paginated fetch for employees to avoid truncation
            const fetchAllEmployees = async () => {
                const all = [];
                let skip = 0;
                const limit = 500;
                while (true) {
                    const batch = await base44.asServiceRole.entities.Employee.filter({ company: project.company }, null, limit, skip);
                    all.push(...batch);
                    if (!Array.isArray(batch) || batch.length < limit) break;
                    skip += limit;
                }
                return all;
            };
            const employees = await fetchAllEmployees();
            const normalizeId = (value) => String(value ?? '').trim();
            const employeeAttendanceIds = new Set(
                employees
                    .map(e => normalizeId(e.attendance_id ?? e.data?.attendance_id))
                    .filter(Boolean)
            );
            
            const records = [];
            const warnings = [];
            let records_invalid_format = 0;
            let records_invalid_data = 0;

            // Reuse parsing logic from frontend
            if (upload_type === 'astra') {
                const parseAstraExcel = (wb, proj) => {
                    if (!proj || !proj.date_from) throw new Error("Astra Excel: Project dates are missing");
                    const reportYear = proj.date_from.split('-')[0];
                    const firstSheetName = wb.SheetNames[0];
                    const worksheet = wb.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                    const dayToDateMap = {};
                    let daysRowIndex = -1;
                    const monthMap = {
                        Jan: '01', Feb: '02', Mar: '03', Apr: '04',
                        May: '05', Jun: '06', Jul: '07', Aug: '08',
                        Sep: '09', Oct: '10', Nov: '11', Dec: '12'
                    };

                    for (let r = 0; r < rows.length; r++) {
                        if (rows[r] && rows[r][1] && String(rows[r][1]).trim() === 'Days') {
                            daysRowIndex = r;
                            break;
                        }
                    }

                    if (daysRowIndex === -1) throw new Error('Astra Excel: Could not find "Days" header row');

                    const dateRow = rows[daysRowIndex];
                    for (let c = 0; c < dateRow.length; c++) {
                        const cellVal = dateRow[c];
                        if (cellVal && typeof cellVal === 'string') {
                            const dateMatch = cellVal.trim().match(/^(\d{2})-([A-Za-z]{3})$/);
                            if (dateMatch) {
                                const monthAbbr = dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1).toLowerCase();
                                if (monthMap[monthAbbr]) {
                                    dayToDateMap[c] = `${reportYear}-${monthMap[monthAbbr]}-${dateMatch[1]}`;
                                }
                            }
                        }
                    }

                    const punches = [];
                    for (let r = 0; r < rows.length; r++) {
                        const row = rows[r];
                        if (row && typeof row[1] === 'string' && row[1].trim().startsWith('Employee Code:-')) {
                            const empCode = row[6] != null ? String(row[6]).trim() : '';
                            let inTimeRow = null, outTimeRow = null;
                            for (let offset = 1; offset <= 12 && (r + offset) < rows.length; offset++) {
                                const label = rows[r + offset]?.[1];
                                if (label === 'In Time') inTimeRow = rows[r + offset];
                                else if (label === 'Out Time') outTimeRow = rows[r + offset];
                            }

                            const convertToAmPm = (time24, dateStr) => {
                                const cleaned = time24.replace(/\s*\(SE\)\s*$/i, '').trim();
                                const [hhRaw, mm] = cleaned.split(':');
                                let hh = parseInt(hhRaw || '0', 10);
                                const period = hh >= 12 ? 'PM' : 'AM';
                                if (hh > 12) hh -= 12;
                                if (hh === 0) hh = 12;
                                const [y, m, d] = dateStr.split('-');
                                return `${d}/${m}/${y} ${hh}:${(mm || '00').padStart(2, '0')} ${period}`;
                            };

                            for (const [colIndexStr, punch_date] of Object.entries(dayToDateMap)) {
                                const colIndex = parseInt(colIndexStr, 10);
                                const inStr = String(inTimeRow?.[colIndex] || '').trim();
                                const outStr = String(outTimeRow?.[colIndex] || '').trim();

                                if (inStr && inStr !== '00:00') {
                                    punches.push({ attendance_id: empCode, punch_date, timestamp_raw: convertToAmPm(inStr, punch_date) });
                                }
                                if (outStr && outStr !== '00:00' && !/\(SE\)\s*$/.test(outStr)) {
                                    punches.push({ attendance_id: empCode, punch_date, timestamp_raw: convertToAmPm(outStr, punch_date) });
                                }
                            }
                        }
                    }
                    return punches;
                };
                records.push(...parseAstraExcel(workbook, project));
            } else {
                // Universal / Naser Mohsin CSV (from Excel or raw)
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const csvData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                const headers = csvData[0];
                
                for (let i = 1; i < csvData.length; i++) {
                    const values = csvData[i];
                    if (values.length < 2) continue;
                    
                    const attendance_id = String(values[0]).trim();
                    let timestamp_raw = '';
                    let punch_date = '';

                    if (values.length >= 4 && (String(values[2]).includes('/') || String(values[2]).includes('-'))) {
                        timestamp_raw = `${values[2]} ${values[3]}`;
                    } else if (values.length >= 3 && (String(values[2]).includes('/') || String(values[2]).includes('-'))) {
                        timestamp_raw = values[2];
                    } else {
                        timestamp_raw = values[1] || '';
                    }

                    const processUniversalDate = (val) => {
                        if (!val) return '';
                        if (val instanceof Date) return val.toISOString().split('T')[0];
                        const str = String(val).trim();
                        const ddmmyyyyMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                        if (ddmmyyyyMatch) return `${ddmmyyyyMatch[3]}-${ddmmyyyyMatch[2].padStart(2, '0')}-${ddmmyyyyMatch[1].padStart(2, '0')}`;
                        const isoMatch = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
                        return '';
                    };
                    punch_date = processUniversalDate(timestamp_raw);
                    
                    if (attendance_id && punch_date) {
                        records.push({ attendance_id, punch_date, timestamp_raw });
                    } else {
                        records_invalid_format++;
                    }
                }
            }

            await updateJob({ 
                progress: 30, 
                records_total: records.length, 
                records_parsed: records.length,
                records_invalid_format
            });

            // 4. Validate and Deduplicate
            const validRecords = [];
            let records_duplicate = 0;
            
            // Fetch existing punches to deduplicate
            const fetchExistingPunches = async () => {
                const all = [];
                let skip = 0;
                const limit = 500;
                while (true) {
                    const batch = await base44.asServiceRole.entities.Punch.filter({ project_id }, null, limit, skip);
                    all.push(...batch);
                    if (!Array.isArray(batch) || batch.length < limit) break;
                    skip += limit;
                }
                return all;
            };
            const existingPunches = await fetchExistingPunches();
            const punchKeys = new Set(existingPunches.map(p => `${normalizeId(p.attendance_id ?? p.data?.attendance_id)}_${p.timestamp_raw ?? p.data?.timestamp_raw}`));

            for (const rec of records) {
                const attendanceId = normalizeId(rec.attendance_id);
                const empExists = employeeAttendanceIds.has(attendanceId);
                if (!empExists) {
                    records_invalid_data++;
                    warnings.push(`Unknown employee ${attendanceId}`);
                    continue;
                }

                const key = `${attendanceId}_${rec.timestamp_raw}`;
                if (punchKeys.has(key)) {
                    records_duplicate++;
                    continue;
                }

                validRecords.push({
                    ...rec,
                    attendance_id: attendanceId,
                    project_id,
                    import_batch_id: uploadJob.import_batch_id
                });
                punchKeys.add(key); // Prevent duplicates within the same file
            }

            await updateJob({ 
                progress: 50, 
                records_to_save: validRecords.length, 
                records_invalid_data, 
                records_duplicate,
                warnings_json: JSON.stringify([...new Set(warnings)].slice(0, 50))
            });

            if (records.length === 0) {
                throw new Error('No punch records were found in this file. Please check the file format and try again.');
            }

            if (validRecords.length === 0) {
                throw new Error('No punch records could be imported. Please verify that the attendance IDs in the file match the employee master list.');
            }

            // 5. Save in larger, throttled batches with strong retry protection
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const getStatus = (err) => err?.status || err?.response?.status || err?.originalError?.response?.status || 0;
            const batchSize = 50;
            let records_saved = 0;

            for (let i = 0; i < validRecords.length; i += batchSize) {
                const batch = validRecords.slice(i, i + batchSize);
                let attempt = 0;
                const MAX_ATTEMPTS = 6;

                while (attempt < MAX_ATTEMPTS) {
                    try {
                        await base44.asServiceRole.entities.Punch.bulkCreate(batch);
                        break;
                    } catch (err) {
                        attempt++;
                        const status = getStatus(err);
                        if ((status === 429 || status >= 500) && attempt < MAX_ATTEMPTS) {
                            await sleep(Math.min(30000, 2000 * Math.pow(2, attempt)));
                            continue;
                        }
                        throw err;
                    }
                }

                records_saved += batch.length;
                const progress = 50 + Math.floor((records_saved / validRecords.length) * 50);
                await updateJob({ progress, records_saved });
                await sleep(1200);
            }

            await updateJob({ status: 'completed', progress: 100 });

            return Response.json({
                success: true,
                upload_job_id: uploadJob.id,
                records_total: records.length,
                records_saved,
                records_skipped: records_invalid_format + records_invalid_data + records_duplicate
            });

        } catch (jobError) {
            console.error('Job execution error:', jobError);
            
            // 6. Rollback
            await updateJob({ status: 'rolling_back', error_message: jobError.message });
            
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const getStatus = (err) => err?.status || err?.response?.status || err?.originalError?.response?.status || 0;
            const toRollback = [];
            let rollbackSkip = 0;
            const rollbackLimit = 100;
            while (true) {
                const page = await base44.asServiceRole.entities.Punch.filter({ 
                    project_id, 
                    import_batch_id: uploadJob.import_batch_id 
                }, null, rollbackLimit, rollbackSkip);
                toRollback.push(...page);
                if (!Array.isArray(page) || page.length < rollbackLimit) break;
                rollbackSkip += rollbackLimit;
            }
            
            let records_rolled_back = 0;
            for (const p of toRollback) {
                let deleted = false;
                for (let attempt = 0; attempt < 5 && !deleted; attempt++) {
                    try {
                        await base44.asServiceRole.entities.Punch.delete(p.id);
                        records_rolled_back++;
                        deleted = true;
                    } catch (delErr) {
                        const status = getStatus(delErr);
                        if (status === 429 || status >= 500) {
                            await sleep(Math.min(20000, 2000 * Math.pow(2, attempt + 1)));
                        } else {
                            console.error('Rollback delete failed:', p.id, delErr);
                            deleted = true;
                        }
                    }
                }
                await sleep(500);
            }

            await updateJob({ 
                status: 'failed', 
                records_rolled_back, 
                error_message: `Upload failed: ${jobError.message}` 
            });

            return Response.json({ error: jobError.message }, { status: 500 });
        }

    } catch (error) {
        console.error('ProcessPunchUpload error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});