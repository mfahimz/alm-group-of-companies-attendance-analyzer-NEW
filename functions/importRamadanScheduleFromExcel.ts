import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

/**
 * Import Ramadan Schedule from HR Excel Spreadsheet
 * 
 * SPREADSHEET STRUCTURE:
 * - Header row contains employee names (mapped by column index)
 * - Each date is represented by TWO consecutive rows:
 *   - Row 1: Work hours row (date, ramadan day, numeric hours per employee)
 *   - Row 2: Status row (H=Holiday, L=Leave, empty=Working)
 * 
 * RULES:
 * - If status is H or L, planned_work_hours = 0 regardless of hours value
 * - Empty numeric cells = 0
 * - Import is all-or-nothing (transactional)
 * - Duplicate (employee_id + date) records cause immediate abort
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only admins can import
        if (user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const formData = await req.formData();
        const file = formData.get('file');
        const projectId = formData.get('project_id');
        const company = formData.get('company');
        const employeeHeaderRow = parseInt(formData.get('employee_header_row') || '1'); // 1-based row number
        const dataStartRow = parseInt(formData.get('data_start_row') || '2'); // 1-based row number where date blocks start
        const employeeStartCol = parseInt(formData.get('employee_start_col') || '3'); // 1-based column where employee columns begin

        // Validate required inputs
        if (!file) {
            return Response.json({ error: 'Missing required field: file' }, { status: 400 });
        }
        if (!projectId) {
            return Response.json({ error: 'Missing required field: project_id' }, { status: 400 });
        }
        if (!company) {
            return Response.json({ error: 'Missing required field: company' }, { status: 400 });
        }

        // Parse Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: true });
        
        if (workbook.SheetNames.length === 0) {
            return Response.json({ error: 'Excel file has no sheets' }, { status: 400 });
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        
        // Fetch employees for mapping
        const employees = await base44.asServiceRole.entities.Employee.filter({ company, active: true });
        
        // Build employee name to ID mapping (case-insensitive, trimmed)
        const employeeNameToId = {};
        for (const emp of employees) {
            const normalizedName = (emp.name || '').toLowerCase().trim();
            employeeNameToId[normalizedName] = emp.hrms_id || emp.attendance_id || emp.id;
        }

        // Parse header row to build column → employee mapping
        // employeeHeaderRow is 1-based, XLSX uses 0-based
        const headerRowIndex = employeeHeaderRow - 1;
        const employeeColumnMap = {}; // column_index (0-based) → { name, employee_id }
        const warnings = [];
        const errors = [];

        for (let col = employeeStartCol - 1; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: col });
            const cell = sheet[cellAddress];
            
            if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
                const employeeName = String(cell.v).trim();
                const normalizedName = employeeName.toLowerCase();
                const employeeId = employeeNameToId[normalizedName];
                
                if (!employeeId) {
                    errors.push({
                        type: 'EMPLOYEE_NOT_FOUND',
                        row: employeeHeaderRow,
                        column: col + 1,
                        value: employeeName,
                        message: `Employee "${employeeName}" not found in system for company "${company}"`
                    });
                } else {
                    employeeColumnMap[col] = {
                        name: employeeName,
                        employee_id: employeeId
                    };
                }
            }
        }

        // If any employee mapping errors, abort
        if (errors.length > 0) {
            return Response.json({
                success: false,
                error: 'Employee mapping failed',
                errors,
                message: `${errors.length} employee(s) could not be mapped. Import aborted.`
            }, { status: 400 });
        }

        if (Object.keys(employeeColumnMap).length === 0) {
            return Response.json({
                success: false,
                error: 'No employees found in header row',
                message: `No valid employee names found in row ${employeeHeaderRow} starting from column ${employeeStartCol}`
            }, { status: 400 });
        }

        // Parse date blocks (each date = 2 rows: hours row + status row)
        const records = [];
        const processedDates = new Set();
        let currentRow = dataStartRow - 1; // Convert to 0-based

        while (currentRow <= range.e.r - 1) { // Need at least 2 rows
            // Row 1: Hours row (should contain Date in col A or B, Ramadan Day, and hours per employee)
            const hoursRow = currentRow;
            const statusRow = currentRow + 1;

            // Check if we've reached the end of data
            if (statusRow > range.e.r) {
                break;
            }

            // Find date cell (check columns 0 and 1)
            let dateValue = null;
            let dateColumn = -1;
            
            for (let col = 0; col <= 1; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: hoursRow, c: col });
                const cell = sheet[cellAddress];
                
                if (cell && cell.v !== undefined && cell.v !== null) {
                    // Try to parse as date
                    if (cell.t === 'd' || cell.v instanceof Date) {
                        dateValue = cell.v;
                        dateColumn = col;
                        break;
                    } else if (cell.t === 'n' && cell.v > 40000 && cell.v < 50000) {
                        // Excel date serial number
                        dateValue = XLSX.SSF.parse_date_code(cell.v);
                        if (dateValue) {
                            dateValue = new Date(dateValue.y, dateValue.m - 1, dateValue.d);
                            dateColumn = col;
                            break;
                        }
                    } else if (typeof cell.v === 'string') {
                        // Try parsing string date
                        const parsed = new Date(cell.v);
                        if (!isNaN(parsed.getTime())) {
                            dateValue = parsed;
                            dateColumn = col;
                            break;
                        }
                    }
                }
            }

            // If no date found, check if this is just an empty row or end of data
            if (!dateValue) {
                // Check if the row has any data at all
                let hasData = false;
                for (let col = 0; col <= range.e.c && !hasData; col++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: hoursRow, c: col });
                    const cell = sheet[cellAddress];
                    if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
                        hasData = true;
                    }
                }
                
                if (!hasData) {
                    // Empty row, skip to next pair
                    currentRow += 2;
                    continue;
                }
                
                // Has data but no valid date - this is an error
                errors.push({
                    type: 'INVALID_DATE',
                    row: hoursRow + 1,
                    column: 1,
                    message: `Row ${hoursRow + 1}: Cannot parse date value`
                });
                currentRow += 2;
                continue;
            }

            // Format date as YYYY-MM-DD
            const dateStr = dateValue.toISOString().split('T')[0];
            
            // Check for duplicate date processing
            if (processedDates.has(dateStr)) {
                errors.push({
                    type: 'DUPLICATE_DATE_IN_FILE',
                    row: hoursRow + 1,
                    date: dateStr,
                    message: `Date ${dateStr} appears multiple times in the spreadsheet`
                });
                currentRow += 2;
                continue;
            }
            processedDates.add(dateStr);

            // Find Ramadan day number (usually in column after date or a specific column)
            let ramadanDay = null;
            const ramadanDayCol = dateColumn + 1;
            const ramadanDayCell = sheet[XLSX.utils.encode_cell({ r: hoursRow, c: ramadanDayCol })];
            
            if (ramadanDayCell && typeof ramadanDayCell.v === 'number') {
                ramadanDay = ramadanDayCell.v;
            } else if (ramadanDayCell && !isNaN(parseInt(ramadanDayCell.v))) {
                ramadanDay = parseInt(ramadanDayCell.v);
            }

            if (ramadanDay === null || ramadanDay < 1 || ramadanDay > 30) {
                warnings.push({
                    type: 'MISSING_RAMADAN_DAY',
                    row: hoursRow + 1,
                    date: dateStr,
                    message: `Row ${hoursRow + 1}: Ramadan day number missing or invalid, defaulting to 0`
                });
                ramadanDay = 0;
            }

            // Process each employee column
            for (const [colIndexStr, empInfo] of Object.entries(employeeColumnMap)) {
                const colIndex = parseInt(colIndexStr);
                
                // Get hours value from hours row
                const hoursCell = sheet[XLSX.utils.encode_cell({ r: hoursRow, c: colIndex })];
                let hoursValue = 0;
                
                if (hoursCell && hoursCell.v !== undefined && hoursCell.v !== null) {
                    if (typeof hoursCell.v === 'number') {
                        hoursValue = hoursCell.v;
                    } else if (!isNaN(parseFloat(hoursCell.v))) {
                        hoursValue = parseFloat(hoursCell.v);
                    }
                }

                // Get status value from status row
                const statusCell = sheet[XLSX.utils.encode_cell({ r: statusRow, c: colIndex })];
                let statusValue = '';
                
                if (statusCell && statusCell.v !== undefined && statusCell.v !== null) {
                    statusValue = String(statusCell.v).trim().toUpperCase();
                }

                // Determine day_type and final planned_work_hours
                let dayType = 'WORKING';
                let plannedWorkHours = hoursValue;

                if (statusValue === 'H') {
                    dayType = 'HOLIDAY';
                    if (hoursValue > 0) {
                        warnings.push({
                            type: 'HOURS_OVERRIDDEN_TO_ZERO',
                            row: hoursRow + 1,
                            column: colIndex + 1,
                            employee: empInfo.name,
                            date: dateStr,
                            original_hours: hoursValue,
                            message: `Employee "${empInfo.name}" on ${dateStr}: Hours ${hoursValue} overridden to 0 due to HOLIDAY status`
                        });
                    }
                    plannedWorkHours = 0;
                } else if (statusValue === 'L') {
                    dayType = 'LEAVE';
                    if (hoursValue > 0) {
                        warnings.push({
                            type: 'HOURS_OVERRIDDEN_TO_ZERO',
                            row: hoursRow + 1,
                            column: colIndex + 1,
                            employee: empInfo.name,
                            date: dateStr,
                            original_hours: hoursValue,
                            message: `Employee "${empInfo.name}" on ${dateStr}: Hours ${hoursValue} overridden to 0 due to LEAVE status`
                        });
                    }
                    plannedWorkHours = 0;
                }

                records.push({
                    employee_id: empInfo.employee_id,
                    employee_name: empInfo.name,
                    company,
                    project_id: projectId,
                    date: dateStr,
                    ramadan_day: ramadanDay,
                    planned_work_hours: plannedWorkHours,
                    day_type: dayType,
                    source: 'HR_RAMADAN_SHEET',
                    imported_at: new Date().toISOString(),
                    imported_by: user.email
                });
            }

            // Move to next date block (skip 2 rows)
            currentRow += 2;
        }

        // Check for errors during parsing
        if (errors.length > 0) {
            return Response.json({
                success: false,
                error: 'Parsing errors encountered',
                errors,
                warnings,
                message: `${errors.length} error(s) found. Import aborted.`
            }, { status: 400 });
        }

        if (records.length === 0) {
            return Response.json({
                success: false,
                error: 'No records to import',
                message: 'No valid date blocks found in the spreadsheet'
            }, { status: 400 });
        }

        // Check for existing records (duplicate check)
        const existingRecords = await base44.asServiceRole.entities.RamadanPlanSchedule.filter({
            project_id: projectId,
            company
        });

        const existingKeys = new Set();
        for (const rec of existingRecords) {
            existingKeys.add(`${rec.employee_id}_${rec.date}`);
        }

        const duplicates = [];
        for (const rec of records) {
            const key = `${rec.employee_id}_${rec.date}`;
            if (existingKeys.has(key)) {
                duplicates.push({
                    employee_id: rec.employee_id,
                    employee_name: rec.employee_name,
                    date: rec.date
                });
            }
        }

        if (duplicates.length > 0) {
            return Response.json({
                success: false,
                error: 'Duplicate records exist',
                duplicates: duplicates.slice(0, 20), // Show first 20
                total_duplicates: duplicates.length,
                message: `${duplicates.length} record(s) already exist for this project. Import aborted to prevent duplicates.`
            }, { status: 409 });
        }

        // All validation passed - perform bulk insert
        const batchSize = 50;
        let createdCount = 0;
        
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            await base44.asServiceRole.entities.RamadanPlanSchedule.bulkCreate(batch);
            createdCount += batch.length;
        }

        // Return success summary
        const uniqueEmployees = new Set(records.map(r => r.employee_id));
        const uniqueDates = new Set(records.map(r => r.date));

        return Response.json({
            success: true,
            summary: {
                total_dates_processed: uniqueDates.size,
                total_employees_processed: uniqueEmployees.size,
                total_records_created: createdCount,
                skipped_records: [],
                warnings
            },
            message: `Successfully imported ${createdCount} Ramadan schedule records for ${uniqueEmployees.size} employees across ${uniqueDates.size} dates.`
        });

    } catch (error) {
        console.error('Import error:', error);
        return Response.json({ 
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});