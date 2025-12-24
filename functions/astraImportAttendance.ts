import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file');
        const fileName = formData.get('fileName') || 'unknown.xlsx';

        if (!file) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            return Response.json({ error: 'No sheets found in the workbook' }, { status: 400 });
        }
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet['!ref']) {
            return Response.json({ error: 'Empty worksheet' }, { status: 400 });
        }
        
        const range = XLSX.utils.decode_range(worksheet['!ref']);

        // Generate batch ID
        const batchId = `astra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Step 1: Parse header rows to build column -> date map
        const dateMap = parseHeaderRows(worksheet, range);
        
        if (Object.keys(dateMap).length === 0) {
            return Response.json({
                error: 'No valid date columns found in header rows',
                success: false
            }, { status: 400 });
        }

        // Step 2: Parse employee blocks
        const employeeBlocks = parseEmployeeBlocks(worksheet, range, dateMap);

        if (employeeBlocks.length === 0) {
            return Response.json({
                error: 'No employee blocks detected in the file',
                success: false
            }, { status: 400 });
        }

        // Step 3: Resolve or create employees and create punch records
        let totalCreated = 0;
        let totalSkipped = 0;
        const skippedBlocks = [];

        for (const block of employeeBlocks) {
            try {
                // Find or create employee
                let employee = null;
                const existingEmployees = await base44.asServiceRole.entities.Employee.filter({
                    company: 'Astra Auto Parts',
                    attendance_id: block.employeeCode
                });

                if (existingEmployees.length > 0) {
                    employee = existingEmployees[0];
                } else {
                    // Generate unique random HRMS ID between 1-1000
                    const allEmployees = await base44.asServiceRole.entities.Employee.filter({
                        company: 'Astra Auto Parts'
                    });
                    const existingHrmsIds = new Set(
                        allEmployees.map(emp => emp.hrms_id?.match(/ASTRA-(\d+)/)?.[1]).filter(Boolean).map(Number)
                    );
                    
                    let randomNum;
                    let attempts = 0;
                    do {
                        randomNum = Math.floor(Math.random() * 1000) + 1;
                        attempts++;
                        if (attempts > 1000) {
                            throw new Error('Unable to generate unique HRMS ID - all numbers taken');
                        }
                    } while (existingHrmsIds.has(randomNum));
                    
                    const newHrmsId = `ASTRA-${String(randomNum).padStart(4, '0')}`;
                    
                    // Create new employee
                    employee = await base44.asServiceRole.entities.Employee.create({
                        hrms_id: newHrmsId,
                        attendance_id: block.employeeCode,
                        employee_code: block.employeeCode,
                        name: block.employeeName || block.employeeCode,
                        company: 'Astra Auto Parts',
                        department: 'Admin',
                        active: true
                    });
                }

                // Create punch records
                for (const punch of block.punches) {
                    // Skip if all values are null
                    if (!punch.in_time && !punch.out_time && 
                        !punch.late_minutes && !punch.early_minutes && 
                        !punch.overtime_minutes && !punch.status) {
                        totalSkipped++;
                        continue;
                    }

                    // Check if record already exists
                    const existing = await base44.asServiceRole.entities.AttendancePunch.filter({
                        employee_id: employee.id,
                        punch_date: punch.punch_date,
                        import_batch_id: batchId
                    });

                    if (existing.length === 0) {
                        await base44.asServiceRole.entities.AttendancePunch.create({
                            employee_id: employee.id,
                            punch_date: punch.punch_date,
                            in_time: punch.in_time || null,
                            out_time: punch.out_time || null,
                            late_minutes: punch.late_minutes || 0,
                            early_minutes: punch.early_minutes || 0,
                            overtime_minutes: punch.overtime_minutes || 0,
                            status: punch.status || null,
                            source_file_name: fileName,
                            import_batch_id: batchId
                        });
                        totalCreated++;
                    } else {
                        totalSkipped++;
                    }
                }
            } catch (error) {
                skippedBlocks.push({
                    employeeCode: block.employeeCode,
                    reason: error.message
                });
            }
        }

        return Response.json({
            success: true,
            import_batch_id: batchId,
            total_employees_detected: employeeBlocks.length,
            total_punch_records_created: totalCreated,
            total_records_skipped: totalSkipped,
            skipped_blocks: skippedBlocks
        });

    } catch (error) {
        return Response.json({ 
            error: error.message,
            success: false
        }, { status: 500 });
    }
});

function parseHeaderRows(worksheet, range) {
    const dateMap = {};
    const headerRows = [0, 1, 2]; // Day index, dates, weekdays

    for (let col = range.s.c; col <= range.e.c; col++) {
        const dateCell = worksheet[XLSX.utils.encode_cell({ r: 1, c: col })];
        
        if (!dateCell || !dateCell.v) continue;

        let dateValue = null;
        
        // Try parsing as Excel date
        if (dateCell.t === 'd') {
            dateValue = dateCell.v;
        } else if (dateCell.t === 'n') {
            // Excel serial number
            dateValue = XLSX.SSF.parse_date_code(dateCell.v);
            if (dateValue) {
                dateValue = new Date(dateValue.y, dateValue.m - 1, dateValue.d);
            }
        } else if (dateCell.t === 's') {
            // Try parsing text date
            const parsed = parseDateString(dateCell.v);
            if (parsed) dateValue = parsed;
        }

        if (dateValue && dateValue instanceof Date && !isNaN(dateValue)) {
            const isoDate = dateValue.toISOString().split('T')[0];
            dateMap[col] = isoDate;
        }
    }

    return dateMap;
}

function parseDateString(str) {
    // Try formats like "01-Nov", "1-Nov-24", etc.
    const formats = [
        /(\d{1,2})-([A-Za-z]{3})-?(\d{2,4})?/,
        /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/
    ];

    for (const format of formats) {
        const match = str.match(format);
        if (match) {
            const day = parseInt(match[1]);
            const monthStr = match[2];
            const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
            
            const months = {
                'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
            };
            
            const month = months[monthStr.toLowerCase()];
            if (month !== undefined) {
                const fullYear = year < 100 ? 2000 + year : year;
                return new Date(fullYear, month, day);
            }
        }
    }
    return null;
}

function parseEmployeeBlocks(worksheet, range, dateMap) {
    const blocks = [];
    let currentBlock = null;

    for (let row = 3; row <= range.e.r; row++) {
        const firstCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
        const cellValue = firstCell?.v?.toString().trim() || '';

        // Check if this is a new employee block
        if (cellValue && !isRowLabel(cellValue)) {
            // Save previous block
            if (currentBlock) {
                blocks.push(currentBlock);
            }

            // Start new block
            currentBlock = {
                employeeCode: cellValue,
                employeeName: cellValue,
                rows: {},
                punches: []
            };
        }

        // Assign row to current block
        if (currentBlock && cellValue) {
            const rowLabel = normalizeRowLabel(cellValue);
            if (rowLabel) {
                currentBlock.rows[rowLabel] = row;
            }
        }
    }

    // Save last block
    if (currentBlock) {
        blocks.push(currentBlock);
    }

    // Extract punch data for each block
    return blocks.map(block => {
        const punches = [];

        for (const [col, punchDate] of Object.entries(dateMap)) {
            const colNum = parseInt(col);

            const inTime = getCellValue(worksheet, block.rows['IN'], colNum);
            const outTime = getCellValue(worksheet, block.rows['OUT'], colNum);
            const lateBy = parseMinutes(getCellValue(worksheet, block.rows['LATE_BY'], colNum));
            const earlyBy = parseMinutes(getCellValue(worksheet, block.rows['EARLY_BY'], colNum));
            const totalOT = parseMinutes(getCellValue(worksheet, block.rows['TOTAL_OT'], colNum));
            const status = getCellValue(worksheet, block.rows['STATUS'], colNum);

            punches.push({
                punch_date: punchDate,
                in_time: normalizeTime(inTime),
                out_time: normalizeTime(outTime),
                late_minutes: lateBy,
                early_minutes: earlyBy,
                overtime_minutes: totalOT,
                status: status
            });
        }

        return {
            ...block,
            punches
        };
    }).filter(block => block.rows.IN && block.rows.OUT);
}

function isRowLabel(str) {
    const labels = ['IN', 'OUT', 'LATE BY', 'EARLY BY', 'TOTAL OT', 'DURATION', 'T DURATION', 'STATUS'];
    const normalized = str.toUpperCase().trim();
    return labels.some(label => normalized.includes(label));
}

function normalizeRowLabel(str) {
    const normalized = str.toUpperCase().trim();
    if (normalized.includes('IN') && !normalized.includes('DURATION')) return 'IN';
    if (normalized.includes('OUT')) return 'OUT';
    if (normalized.includes('LATE BY') || normalized.includes('LATE_BY')) return 'LATE_BY';
    if (normalized.includes('EARLY BY') || normalized.includes('EARLY_BY')) return 'EARLY_BY';
    if (normalized.includes('TOTAL OT') || normalized.includes('TOTAL_OT')) return 'TOTAL_OT';
    if (normalized.includes('STATUS')) return 'STATUS';
    return null;
}

function getCellValue(worksheet, row, col) {
    if (row === undefined || col === undefined) return null;
    const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
    return cell?.v?.toString().trim() || null;
}

function normalizeTime(timeStr) {
    if (!timeStr) return null;
    
    // Remove any non-time characters
    timeStr = timeStr.replace(/[^0-9:APMapm]/g, '');
    
    // Try to match HH:mm format
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = match[3]?.toUpperCase();
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }
    
    return null;
}

function parseMinutes(str) {
    if (!str) return 0;
    
    // Try to extract number
    const match = str.match(/(\d+)/);
    if (match) {
        return parseInt(match[1]);
    }
    
    // Try HH:mm format
    const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        return hours * 60 + minutes;
    }
    
    return 0;
}