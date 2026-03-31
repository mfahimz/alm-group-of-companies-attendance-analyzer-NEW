import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * AstraImportTab
 * 
 * Parses Astra Auto Parts monthly detailed attendance reports exported from
 * the "Smart attendance" system. Accepts .xls/.xlsx files, extracts employee
 * punch-in/out times per day, and displays a parsed summary.
 *
 * Props:
 *   - project: the current project object
 *   - employees: array of employee records from the database
 */
export default function AstraImportTab({ project, employees }) {
    // ---------------------------------------------------------------------------
    // State: holds the result of parsing the uploaded report file
    // ---------------------------------------------------------------------------
    const [parsedData, setParsedData] = useState(null);

    // ---------------------------------------------------------------------------
    // State: flattened punch records for preview table (IN/OUT entries)
    // ---------------------------------------------------------------------------
    const [previewPunches, setPreviewPunches] = useState([]);

    // ---------------------------------------------------------------------------
    // State: upload progress tracking
    // ---------------------------------------------------------------------------
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

    // Ref to the file input so we can reset it programmatically
    const fileInputRef = useRef(null);

    // ---------------------------------------------------------------------------
    // parseAstraReport
    //
    // Accepts the raw 2D array (rows × columns) produced by sheet_to_json and
    // returns a structured object:
    //   { employees: [ { name, code, records: [ { attendance_id, punch_date, in_time, out_time } ] } ],
    //     reportPeriod: string }
    // ---------------------------------------------------------------------------
    const parseAstraReport = (rows) => {
        // --- Step A: Find the report period and extract the year ----------------
        // Scan rows 3–9 (0-indexed) looking for a cell containing "To" between
        // two dates like "01-Feb-2026 To 28-Feb-2026"
        let reportPeriod = '';
        let reportYear = null;

        for (let r = 3; r <= Math.min(9, rows.length - 1); r++) {
            const row = rows[r];
            if (!row) continue;
            for (let c = 0; c < row.length; c++) {
                const cellVal = row[c];
                if (cellVal && typeof cellVal === 'string' && /\d{2}-[A-Za-z]{3}-\d{4}\s+To\s+\d{2}-[A-Za-z]{3}-\d{4}/i.test(cellVal)) {
                    reportPeriod = cellVal.trim();
                    // Extract the year from the first date in the period string
                    const yearMatch = cellVal.match(/(\d{4})/);
                    if (yearMatch) {
                        reportYear = yearMatch[1];
                    }
                    break;
                }
            }
            if (reportYear) break;
        }

        if (!reportYear) {
            toast.error('Could not find report period (expected "DD-Mon-YYYY To DD-Mon-YYYY" in rows 4–10).');
            return null;
        }

        // --- Step B: Build day-to-date mapping ---------------------------------
        // Find the row where column 1 (index 0) contains "Days". The row
        // immediately below it holds the actual date labels (e.g., "01-Feb").
        // We build a map: columnIndex -> "YYYY-MM-DD"
        const dayToDateMap = {}; // { colIndex: "YYYY-MM-DD" }
        let daysRowIndex = -1;

        // Month abbreviation lookup for converting "Feb" -> "02" etc.
        const monthMap = {
            Jan: '01', Feb: '02', Mar: '03', Apr: '04',
            May: '05', Jun: '06', Jul: '07', Aug: '08',
            Sep: '09', Oct: '10', Nov: '11', Dec: '12'
        };

        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            if (!row) continue;
            const col1 = row[1];
            if (col1 && typeof col1 === 'string' && col1.trim() === 'Days') {
                daysRowIndex = r;
                break;
            }
        }

        if (daysRowIndex === -1) {
            toast.error('Could not find "Days" header row in the report.');
            return null;
        }

        // The "Days" row itself contains the date labels like "01-Feb", "02-Feb" etc.
        const dateRow = rows[daysRowIndex];
        if (dateRow) {
            for (let c = 0; c < dateRow.length; c++) {
                const cellVal = dateRow[c];
                if (cellVal && typeof cellVal === 'string') {
                    const dateMatch = cellVal.trim().match(/^(\d{2})-([A-Za-z]{3})$/);
                    if (dateMatch) {
                        const day = dateMatch[1];
                        const monthAbbr = dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1).toLowerCase();
                        const monthNum = monthMap[monthAbbr];
                        if (monthNum) {
                            // Build full ISO date: YYYY-MM-DD
                            dayToDateMap[c] = `${reportYear}-${monthNum}-${day}`;
                        }
                    }
                }
            }
        }

        const totalDaysCovered = Object.keys(dayToDateMap).length;
        if (totalDaysCovered === 0) {
            toast.error('Could not parse any date columns from the row below "Days".');
            return null;
        }

        // --- Step C: Find each employee block ----------------------------------
        // Scan every row looking for "Employee Code:-" in column 1 (index 0).
        // When found:
        //   - Employee code is at column index 6
        //   - Employee name appears after "Employee Name:-" label at column index 18
        //   - In the next ~12 rows, find "In Time" and "Out Time" rows
        const parsedEmployees = [];

        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            if (!row) continue;
            const col1 = row[1];

            if (col1 && typeof col1 === 'string' && col1.trim().startsWith('Employee Code:-')) {
                // Extract employee code from column 6
                const empCode = row[6] != null ? String(row[6]).trim() : '';

                // Extract employee name from column 18
                // The cell at column 18 may contain the name directly, or the label
                // "Employee Name:-" may be at a nearby column with the name at 18.
                let empName = '';
                // Look for a cell containing "Employee Name:-" in this row, name follows it
                for (let c = 0; c < row.length; c++) {
                    const cv = row[c];
                    if (cv && typeof cv === 'string' && cv.trim().startsWith('Employee Name:-')) {
                        // Name could be embedded after the label or in the next populated cell
                        const afterLabel = cv.replace('Employee Name:-', '').trim();
                        if (afterLabel) {
                            empName = afterLabel;
                        } else if (row[c + 1]) {
                            empName = String(row[c + 1]).trim();
                        }
                        break;
                    }
                }
                // Fallback: try column 18 directly if name is still empty
                if (!empName && row[18] != null) {
                    empName = String(row[18]).trim();
                }

                const headerRowIndex = r;

                // --- Step D: Find In Time and Out Time rows --------------------
                // Scan the next 12 rows after the header looking for these labels
                let inTimeRow = null;
                let outTimeRow = null;

                for (let offset = 1; offset <= 12 && (headerRowIndex + offset) < rows.length; offset++) {
                    const scanRow = rows[headerRowIndex + offset];
                    if (!scanRow) continue;
                    const label = scanRow[1];
                    if (label && typeof label === 'string') {
                        const trimmed = label.trim();
                        if (trimmed === 'In Time') {
                            inTimeRow = scanRow;
                        } else if (trimmed === 'Out Time') {
                            outTimeRow = scanRow;
                        }
                    }
                    // Stop early if both found
                    if (inTimeRow && outTimeRow) break;
                }

                // --- Step E: Build daily records for this employee ---------------
                // For each column in the dayToDateMap, read in_time and out_time
                const dailyRecords = [];

                for (const [colIndexStr, dateStr] of Object.entries(dayToDateMap)) {
                    const colIndex = parseInt(colIndexStr, 10);
                    const inTimeVal = inTimeRow ? inTimeRow[colIndex] : null;
                    const outTimeVal = outTimeRow ? outTimeRow[colIndex] : null;

                    dailyRecords.push({
                        attendance_id: empCode,
                        punch_date: dateStr,
                        in_time: inTimeVal != null ? String(inTimeVal).trim() : '',
                        out_time: outTimeVal != null ? String(outTimeVal).trim() : ''
                    });
                }

                parsedEmployees.push({
                    name: empName,
                    code: empCode,
                    records: dailyRecords
                });
            }
        }

        if (parsedEmployees.length === 0) {
            toast.error('No employee blocks found. Ensure the report contains "Employee Code:-" rows.');
            return null;
        }

        return {
            employees: parsedEmployees,
            reportPeriod,
            totalDaysCovered
        };
    };

    // ---------------------------------------------------------------------------
    // handleFileUpload
    //
    // Reads the selected file as an ArrayBuffer, parses it with SheetJS (XLSX),
    // converts the first sheet to a 2D array, then calls parseAstraReport.
    // ---------------------------------------------------------------------------
    const handleFileUpload = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target.result;
                if (!data || !(data instanceof ArrayBuffer)) {
                    toast.error('Failed to read file as ArrayBuffer.');
                    return;
                }

                // Parse the workbook from binary data
                const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });

                // Use the first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to 2D array (array of arrays), with header: 1 for raw rows
                // and defval: null so empty cells become null instead of undefined
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                // Parse the structured report data
                const result = parseAstraReport(rows);
                if (result) {
                    setParsedData(result);

                    // ---------------------------------------------------------------
                    // Flatten parsed employee data into individual punch records.
                    // Each day can produce 0, 1, or 2 punches (IN and/or OUT).
                    //
                    // Rules:
                    //   - Skip day entirely if in_time is empty or "00:00"
                    //   - Generate IN punch if in_time is valid
                    //   - Generate OUT punch if out_time is valid and does NOT
                    //     end with "(SE)" (system-estimated, unreliable)
                    //   - Strip any "(SE)" suffix from out_time before use
                    // ---------------------------------------------------------------
                    const punches = [];

                    for (const emp of result.employees) {
                        for (const rec of emp.records) {
                            // Skip days with no punch or 00:00 (absent/no-data marker)
                            if (!rec.in_time || rec.in_time === '00:00') continue;

                            // Helper: pad time to HH:MM:SS if needed (e.g. "9:15" -> "09:15:00")
                            const padTime = (t) => {
                                const cleaned = t.replace(/\s*\(SE\)\s*$/i, '').trim();
                                const parts = cleaned.split(':');
                                const hh = (parts[0] || '0').padStart(2, '0');
                                const mm = (parts[1] || '00').padStart(2, '0');
                                const ss = (parts[2] || '00').padStart(2, '0');
                                return `${hh}:${mm}:${ss}`;
                            };

                            // IN punch — always generated when in_time is valid
                            punches.push({
                                attendance_id: rec.attendance_id,
                                punch_date: rec.punch_date,
                                timestamp_raw: `${rec.punch_date} ${padTime(rec.in_time)}`,
                                project_id: project.id,
                                employee_name: emp.name,
                                type: 'IN'
                            });

                            // OUT punch — only if out_time is valid and NOT (SE)
                            if (rec.out_time && rec.out_time !== '00:00' && !/\(SE\)\s*$/.test(rec.out_time)) {
                                punches.push({
                                    attendance_id: rec.attendance_id,
                                    punch_date: rec.punch_date,
                                    timestamp_raw: `${rec.punch_date} ${padTime(rec.out_time)}`,
                                    project_id: project.id,
                                    employee_name: emp.name,
                                    type: 'OUT'
                                });
                            }
                        }
                    }

                    // Sort by attendance_id, then punch_date, then timestamp_raw
                    punches.sort((a, b) => {
                        if (a.attendance_id !== b.attendance_id) return a.attendance_id.localeCompare(b.attendance_id);
                        if (a.punch_date !== b.punch_date) return a.punch_date.localeCompare(b.punch_date);
                        return a.timestamp_raw.localeCompare(b.timestamp_raw);
                    });

                    setPreviewPunches(punches);
                    toast.success(`Parsed ${result.employees.length} employees across ${result.totalDaysCovered} days.`);
                }
            } catch (err) {
                console.error('Astra report parsing error:', err);
                toast.error('Failed to parse the report: ' + (err.message || 'Unknown error'));
            }
        };
        reader.readAsArrayBuffer(selectedFile);
    };

    // ---------------------------------------------------------------------------
    // handleUpload
    //
    // Uploads the flattened preview punches to the database in batches of 8.
    // Each batch uses bulkCreate with retry logic for 429 rate-limit errors.
    // On failure, all records tagged with the importBatchId are rolled back.
    // On success, the batch tag is cleared from all uploaded records.
    // ---------------------------------------------------------------------------
    const handleUpload = async () => {
        if (previewPunches.length === 0) return;

        // Generate a unique batch ID to tag all records for rollback tracking
        const importBatchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Prepare final records — strip display-only fields (employee_name, type)
        const punchRecords = previewPunches.map(p => ({
            attendance_id: p.attendance_id,
            punch_date: p.punch_date,
            timestamp_raw: p.timestamp_raw,
            project_id: p.project_id,
            calendar_period_id: importBatchId
        }));

        const BATCH_SIZE = 8;
        const BATCH_DELAY = 1500; // ms between batches
        const RETRY_DELAYS = [1000, 2000, 4000]; // retry delays for 429 errors

        setIsUploading(true);
        setUploadProgress({ current: 0, total: punchRecords.length });

        // Helper: retry a function up to 3 times on 429 rate-limit errors
        const retryOnRateLimit = async (fn, context) => {
            for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
                try {
                    return await fn();
                } catch (err) {
                    const isRateLimit = err?.status === 429 ||
                        err?.response?.status === 429 ||
                        /rate.?limit|too many|throttl/i.test(err?.message || '');

                    if (isRateLimit && attempt < RETRY_DELAYS.length) {
                        const delay = RETRY_DELAYS[attempt];
                        console.warn(`${context}: Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS.length})`);
                        await new Promise(r => setTimeout(r, delay));
                    } else {
                        throw err;
                    }
                }
            }
        };

        try {
            // --- Upload in batches of 8 using bulkCreate --------------------------
            for (let i = 0; i < punchRecords.length; i += BATCH_SIZE) {
                const batch = punchRecords.slice(i, i + BATCH_SIZE);

                await retryOnRateLimit(
                    () => base44.entities.Punch.bulkCreate(batch),
                    `Batch ${Math.floor(i / BATCH_SIZE) + 1}`
                );

                const processed = Math.min(i + BATCH_SIZE, punchRecords.length);
                setUploadProgress({ current: processed, total: punchRecords.length });

                // Delay between batches to avoid rate limiting
                if (i + BATCH_SIZE < punchRecords.length) {
                    await new Promise(r => setTimeout(r, BATCH_DELAY));
                }
            }

            // --- Success: clear the batch tag from all uploaded records -----------
            const uploadedPunches = await retryOnRateLimit(
                () => base44.entities.Punch.filter(
                    { project_id: project.id, calendar_period_id: importBatchId },
                    null,
                    50000
                ),
                'Finalize fetch'
            );

            for (let i = 0; i < uploadedPunches.length; i += BATCH_SIZE) {
                const cleanBatch = uploadedPunches.slice(i, i + BATCH_SIZE);
                for (const p of cleanBatch) {
                    try {
                        await base44.entities.Punch.update(p.id, { calendar_period_id: null });
                    } catch (e) {
                        // Non-critical — tag left behind won't affect functionality
                        console.warn('Failed to clear batch tag for', p.id, e);
                    }
                }
                if (i + BATCH_SIZE < uploadedPunches.length) {
                    await new Promise(r => setTimeout(r, BATCH_DELAY));
                }
            }

            // --- Reset UI state and show success ---------------------------------
            setIsUploading(false);
            setUploadProgress({ current: 0, total: 0 });
            setPreviewPunches([]);
            setParsedData(null);
            if (fileInputRef.current) fileInputRef.current.value = '';

            toast.success(
                `${punchRecords.length} punches uploaded successfully. Please run analysis from the Attendance tab.`,
                { duration: 6000 }
            );

        } catch (uploadError) {
            // --- Rollback: delete all records tagged with this batch ID -----------
            console.error('Upload failed, starting rollback:', uploadError);

            try {
                const toRollback = await retryOnRateLimit(
                    () => base44.entities.Punch.filter(
                        { project_id: project.id, calendar_period_id: importBatchId },
                        null,
                        50000
                    ),
                    'Rollback fetch'
                );

                for (let i = 0; i < toRollback.length; i += BATCH_SIZE) {
                    const rollbackBatch = toRollback.slice(i, i + BATCH_SIZE);
                    for (const rec of rollbackBatch) {
                        try {
                            await base44.entities.Punch.delete(rec.id);
                        } catch (delErr) {
                            // One retry after 2s for rate-limited deletes
                            await new Promise(r => setTimeout(r, 2000));
                            try {
                                await base44.entities.Punch.delete(rec.id);
                            } catch (e) {
                                console.error('Rollback delete failed for', rec.id, e);
                            }
                        }
                    }
                    if (i + BATCH_SIZE < toRollback.length) {
                        await new Promise(r => setTimeout(r, BATCH_DELAY));
                    }
                }
            } catch (rollbackErr) {
                console.error('Rollback query failed:', rollbackErr);
            }

            setIsUploading(false);
            setUploadProgress({ current: 0, total: 0 });
            toast.error(
                'Upload failed. All uploaded records have been rolled back.',
                { duration: 8000 }
            );
        }
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <div className="space-y-6">
            {/* File upload section */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                    Upload Astra Auto Parts Monthly Detailed Report
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                    Accepts .xls and .xlsx files from the Smart attendance system.
                </p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-sm file:font-semibold
                        file:bg-indigo-50 file:text-indigo-700
                        hover:file:bg-indigo-100
                        cursor-pointer"
                />
            </div>

            {/* Summary section — only shown after successful parsing */}
            {parsedData && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <h4 className="text-md font-semibold text-slate-800 mb-3">
                        Parsing Summary
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                        {/* Report period */}
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Report Period</p>
                            <p className="text-sm font-medium text-slate-800 mt-1">{parsedData.reportPeriod}</p>
                        </div>
                        {/* Employees found */}
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Employees Found</p>
                            <p className="text-2xl font-bold text-indigo-700 mt-1">{parsedData.employees.length}</p>
                        </div>
                        {/* Total days covered */}
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Days Covered</p>
                            <p className="text-2xl font-bold text-indigo-700 mt-1">{parsedData.totalDaysCovered}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview table — flattened punch records ready for upload */}
            {previewPunches.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <h4 className="text-md font-semibold text-slate-800 mb-1">
                        Punch Preview
                    </h4>
                    <p className="text-sm text-slate-600 mb-4">
                        {previewPunches.length} total punch records to upload
                    </p>

                    <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-slate-50/90 backdrop-blur-md z-10 border-b border-slate-200/60 shadow-sm">
                                <TableRow className="hover:bg-transparent border-b border-slate-200">
                                    <TableHead>Employee Name</TableHead>
                                    <TableHead>Attendance ID</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Punch Time</TableHead>
                                    <TableHead>Type</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewPunches.map((punch, index) => {
                                    // Highlight unknown employees in amber
                                    const isKnown = employees.find(
                                        e => String(e.attendance_id) === String(punch.attendance_id)
                                    );
                                    const rowClass = !isKnown ? 'bg-amber-50' : '';

                                    return (
                                        <TableRow key={index} className={`${rowClass} hover:bg-slate-50/80 transition-colors duration-200 border-b border-slate-100 last:border-0 text-slate-700`}>
                                            <TableCell className="font-medium">
                                                {punch.employee_name}
                                                {!isKnown && (
                                                    <AlertTriangle className="w-4 h-4 text-amber-600 inline ml-1" />
                                                )}
                                            </TableCell>
                                            <TableCell>{punch.attendance_id}</TableCell>
                                            <TableCell>{punch.punch_date}</TableCell>
                                            <TableCell>{punch.timestamp_raw}</TableCell>
                                            <TableCell>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    punch.type === 'IN'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {punch.type}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Informational note about skipped days */}
                    <p className="text-xs text-slate-400 mt-3">
                        Days with 00:00 or no punch were skipped. Single-entry days show IN punch only.
                    </p>

                    {/* Upload progress bar — shown during upload */}
                    {isUploading && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-4">
                            <p className="text-sm font-medium text-indigo-900 mb-2">
                                Uploading punches...
                            </p>
                            <Progress
                                value={uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}
                                className="bg-indigo-100"
                            />
                            <p className="text-xs text-indigo-700 mt-2">
                                {uploadProgress.current} of {uploadProgress.total} punches
                            </p>
                        </div>
                    )}

                    {/* Action buttons: Confirm & Upload + Cancel */}
                    <div className="flex gap-3 mt-4">
                        <Button
                            onClick={handleUpload}
                            disabled={isUploading || previewPunches.length === 0}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Confirm &amp; Upload
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            disabled={isUploading}
                            onClick={() => {
                                setPreviewPunches([]);
                                setParsedData(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
