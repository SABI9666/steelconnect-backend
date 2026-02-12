// src/utils/sheetAnalyzer.js
// Advanced Sheet Fetcher + Intelligent Dashboard Auto-Generator
// Supports: Google Sheets, SharePoint/OneDrive, and direct file uploads
// Auto-sync: Re-fetches linked sheets on schedule to keep dashboards up-to-date

import * as XLSX from 'xlsx';

// =====================================================================
// LINK TYPE DETECTION - Identify Google Sheets vs SharePoint vs OneDrive
// =====================================================================

/**
 * Detect the type of link provided
 * Returns: 'google' | 'sharepoint' | 'onedrive' | 'unknown'
 */
export function detectLinkType(url) {
    if (!url || typeof url !== 'string') return 'unknown';
    const u = url.toLowerCase().trim();
    if (u.includes('docs.google.com/spreadsheets')) return 'google';
    if (u.includes('.sharepoint.com')) return 'sharepoint';
    if (u.includes('onedrive.live.com') || u.includes('1drv.ms')) return 'onedrive';
    if (u.includes('office.com') || u.includes('office365.com')) return 'sharepoint';
    return 'unknown';
}

// =====================================================================
// GOOGLE SHEET FETCHER
// =====================================================================

function extractSheetId(url) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

async function fetchGoogleSheet(googleSheetUrl) {
    const sheetId = extractSheetId(googleSheetUrl);
    if (!sheetId) {
        throw new Error('Invalid Google Sheet URL. Please provide a valid Google Sheets link.');
    }

    const exportUrls = [
        `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
    ];

    let buffer = null;
    let format = 'xlsx';

    for (const exportUrl of exportUrls) {
        try {
            const response = await fetch(exportUrl, {
                redirect: 'follow',
                headers: { 'User-Agent': 'SteelConnect-Analytics/1.0' }
            });

            if (!response.ok) {
                console.log(`[SHEET-FETCH] Google ${format} export failed (${response.status}), trying next...`);
                format = 'csv';
                continue;
            }

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
                const text = await response.text();
                if (text.includes('signin') || text.includes('ServiceLogin') || text.includes('accounts.google')) {
                    throw new Error('Google Sheet is not publicly shared. Please set sharing to "Anyone with the link can view".');
                }
                console.log(`[SHEET-FETCH] Got HTML response for ${format}, trying next...`);
                format = 'csv';
                continue;
            }

            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            console.log(`[SHEET-FETCH] Google Sheet downloaded (${buffer.length} bytes)`);
            break;
        } catch (fetchError) {
            if (fetchError.message.includes('not publicly shared')) throw fetchError;
            console.log(`[SHEET-FETCH] Google fetch attempt failed:`, fetchError.message);
            format = 'csv';
        }
    }

    if (!buffer || buffer.length === 0) {
        throw new Error('Could not download Google Sheet. Make sure it is shared publicly ("Anyone with the link can view").');
    }
    return buffer;
}

// =====================================================================
// SHAREPOINT / ONEDRIVE FETCHER
// =====================================================================

/**
 * Convert a SharePoint sharing link to a direct download URL
 * SharePoint sharing links come in many formats:
 * - https://{tenant}.sharepoint.com/:x:/g/personal/{user}/{token}
 * - https://{tenant}.sharepoint.com/:x:/r/personal/{user}/Documents/{file}
 * - https://{tenant}.sharepoint.com/sites/{site}/_layouts/15/Doc.aspx?sourcedoc={id}
 * - https://{tenant}-my.sharepoint.com/personal/{user}/_layouts/15/guestaccess.aspx?share={token}
 * - https://{tenant}.sharepoint.com/:x:/s/{site}/{token}
 * OneDrive links:
 * - https://onedrive.live.com/edit.aspx?resid={id}
 * - https://1drv.ms/{shortcode}
 */
function buildSharePointDownloadUrl(url) {
    const u = url.trim();

    // Pattern 1: /:x:/g/ or /:x:/s/ or /:x:/r/ sharing links
    // These can be downloaded by appending ?download=1
    if (/\/:x:\/[gsr]\//.test(u)) {
        const separator = u.includes('?') ? '&' : '?';
        return u + separator + 'download=1';
    }

    // Pattern 2: _layouts/15/Doc.aspx?sourcedoc= → convert to download
    if (u.includes('_layouts/15/Doc.aspx') && u.includes('sourcedoc=')) {
        return u.replace('Doc.aspx', 'download.aspx') + '&action=download';
    }

    // Pattern 3: _layouts/15/guestaccess.aspx?share=
    if (u.includes('guestaccess.aspx') && u.includes('share=')) {
        return u + '&download=1';
    }

    // Pattern 4: OneDrive live.com links
    if (u.includes('onedrive.live.com')) {
        return u.replace('/edit.aspx', '/download.aspx').replace('/view.aspx', '/download.aspx');
    }

    // Pattern 5: 1drv.ms short links — follow redirect then try download
    if (u.includes('1drv.ms')) {
        return u; // Will be followed via redirect
    }

    // Pattern 6: Direct .xlsx/.xls/.csv link on SharePoint
    if (/\.(xlsx|xls|csv)(\?|$)/i.test(u)) {
        return u;
    }

    // Default: try appending download=1
    const separator = u.includes('?') ? '&' : '?';
    return u + separator + 'download=1';
}

async function fetchSharePointSheet(sharePointUrl) {
    const downloadUrl = buildSharePointDownloadUrl(sharePointUrl);
    console.log(`[SHEET-FETCH] SharePoint download URL: ${downloadUrl}`);

    // Try download with multiple approaches
    const attempts = [
        { url: downloadUrl, label: 'direct download' },
        { url: sharePointUrl + (sharePointUrl.includes('?') ? '&' : '?') + 'download=1', label: 'download=1' },
        { url: sharePointUrl, label: 'original URL' },
    ];

    // Deduplicate URLs
    const seen = new Set();
    const uniqueAttempts = attempts.filter(a => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
    });

    let buffer = null;

    for (const attempt of uniqueAttempts) {
        try {
            console.log(`[SHEET-FETCH] Trying SharePoint (${attempt.label})...`);
            const response = await fetch(attempt.url, {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv, */*'
                }
            });

            if (!response.ok) {
                console.log(`[SHEET-FETCH] SharePoint ${attempt.label} returned ${response.status}`);
                continue;
            }

            const contentType = response.headers.get('content-type') || '';

            // Check if we got an HTML login/error page instead of a file
            if (contentType.includes('text/html')) {
                const text = await response.text();
                if (text.includes('login') || text.includes('signin') || text.includes('Sign in') ||
                    text.includes('microsoftonline.com') || text.includes('federation')) {
                    throw new Error('SharePoint file requires authentication. Please set the file sharing to "Anyone with the link can view" or "Anyone with the link can edit".');
                }
                // Some SharePoint pages embed the download link
                const downloadMatch = text.match(/href="([^"]+download[^"]+)"/i) ||
                                     text.match(/data-url="([^"]+)"/i);
                if (downloadMatch) {
                    console.log(`[SHEET-FETCH] Found embedded download link, retrying...`);
                    const innerResponse = await fetch(downloadMatch[1], { redirect: 'follow' });
                    if (innerResponse.ok) {
                        const arrayBuffer = await innerResponse.arrayBuffer();
                        buffer = Buffer.from(arrayBuffer);
                        if (buffer.length > 0) break;
                    }
                }
                console.log(`[SHEET-FETCH] Got HTML response from SharePoint, trying next...`);
                continue;
            }

            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);

            if (buffer.length > 0) {
                console.log(`[SHEET-FETCH] SharePoint file downloaded (${buffer.length} bytes) via ${attempt.label}`);
                break;
            }
        } catch (fetchError) {
            if (fetchError.message.includes('requires authentication')) throw fetchError;
            console.log(`[SHEET-FETCH] SharePoint ${attempt.label} failed:`, fetchError.message);
        }
    }

    if (!buffer || buffer.length === 0) {
        throw new Error('Could not download file from SharePoint/OneDrive. Please ensure:\n1. The file is shared with "Anyone with the link"\n2. The link is a direct sharing link to an Excel file (.xlsx, .xls) or CSV');
    }
    return buffer;
}

// =====================================================================
// UNIFIED SHEET DATA FETCHER - Google Sheets + SharePoint + OneDrive
// =====================================================================

/**
 * Fetch sheet data from any supported link type
 * Returns: { sheets: {sheetName: [rows]}, sheetNames: [], source: 'google'|'sharepoint' }
 */
export async function fetchSheetData(url) {
    const linkType = detectLinkType(url);
    console.log(`[SHEET-FETCH] Detected link type: ${linkType} for URL: ${url.substring(0, 80)}...`);

    let buffer;
    if (linkType === 'google') {
        buffer = await fetchGoogleSheet(url);
    } else if (linkType === 'sharepoint' || linkType === 'onedrive') {
        buffer = await fetchSharePointSheet(url);
    } else {
        // Try as generic URL — attempt direct download
        try {
            console.log(`[SHEET-FETCH] Unknown link type, attempting direct download...`);
            const response = await fetch(url, { redirect: 'follow' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            if (!buffer || buffer.length === 0) throw new Error('Empty response');
        } catch (e) {
            throw new Error('Unsupported link type. Please provide a Google Sheets URL or SharePoint/OneDrive sharing link.');
        }
    }

    // Parse the downloaded buffer
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheets = {};
        for (const sheetName of workbook.SheetNames) {
            const ws = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (jsonData.length > 0) {
                sheets[sheetName] = jsonData;
            }
        }

        const sheetNames = Object.keys(sheets);
        if (sheetNames.length === 0) {
            throw new Error('No valid data found in the sheet. Make sure it contains data with headers.');
        }

        console.log(`[SHEET-FETCH] Parsed ${sheetNames.length} sheet(s): ${sheetNames.join(', ')}`);
        return { sheets, sheetNames, source: linkType };
    } catch (parseError) {
        if (parseError.message.includes('No valid data')) throw parseError;
        if (parseError.message.includes('requires authentication')) throw parseError;
        throw new Error('Failed to parse the downloaded file. Please ensure it is a valid Excel (.xlsx, .xls) or CSV file.');
    }
}

// Backward-compatible alias
export async function fetchGoogleSheetData(url) {
    return fetchSheetData(url);
}

// =====================================================================
// PARSE SPREADSHEET BUFFER (uploaded file)
// =====================================================================

export function parseSpreadsheet(buffer, originalname) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheets = {};
    for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (jsonData.length > 0) {
            sheets[sheetName] = jsonData;
        }
    }
    return sheets;
}

// =====================================================================
// INTELLIGENT AUTO-GENERATE DASHBOARD
// Analyzes data deeply: detects patterns, picks optimal chart types,
// generates comprehensive KPIs, creates multiple chart views per sheet
// =====================================================================

/**
 * Classify a column based on its header name and data
 */
function classifyColumn(header, rows) {
    const h = header.toLowerCase();
    const sampleValues = rows.slice(0, 20).map(r => r[header]);
    const nonEmpty = sampleValues.filter(v => v !== '' && v !== null && v !== undefined);

    // Check if it's a date/time column
    if (/date|time|day|week|month|year|period|quarter|q[1-4]/i.test(h)) {
        return { type: 'date', category: 'label' };
    }

    // Check if values are actual dates
    if (nonEmpty.length > 0 && (nonEmpty[0] instanceof Date ||
        (typeof nonEmpty[0] === 'string' && !isNaN(Date.parse(nonEmpty[0])) && nonEmpty[0].match(/\d{2,4}[-/]\d{1,2}[-/]\d{1,2}/)))) {
        return { type: 'date', category: 'label' };
    }

    // Category/label columns
    if (/name|category|type|group|class|department|dept|division|region|area|zone|city|state|country|product|item|material|grade|status|project|client|vendor|supplier|contractor/i.test(h)) {
        return { type: 'category', category: 'label' };
    }

    // Percentage columns
    if (/percent|pct|rate|ratio|efficiency|yield|margin|growth|change|%/i.test(h)) {
        const allNumeric = nonEmpty.every(v => !isNaN(parseFloat(v)));
        if (allNumeric) return { type: 'percentage', category: 'numeric' };
    }

    // Currency/financial columns
    if (/revenue|sales|cost|price|amount|value|budget|expense|profit|loss|income|payment|invoice|billing|total|turnover|wage|salary/i.test(h)) {
        const allNumeric = nonEmpty.every(v => !isNaN(parseFloat(String(v).replace(/[$,₹€£]/g, ''))));
        if (allNumeric) return { type: 'currency', category: 'numeric' };
    }

    // Quantity/count columns
    if (/qty|quantity|count|number|num|units|pieces|tons|kg|mt|weight|volume|length|width|height|thickness|diameter|gauge|size|stock|inventory|production|output|capacity|load|order/i.test(h)) {
        const allNumeric = nonEmpty.every(v => !isNaN(parseFloat(v)));
        if (allNumeric) return { type: 'quantity', category: 'numeric' };
    }

    // Check if the column is numeric by sampling values
    const numericCount = nonEmpty.filter(v => !isNaN(parseFloat(v)) && typeof v !== 'boolean').length;
    const stringCount = nonEmpty.filter(v => typeof v === 'string' && isNaN(parseFloat(v))).length;

    if (numericCount > nonEmpty.length * 0.7) {
        return { type: 'number', category: 'numeric' };
    }

    if (stringCount > nonEmpty.length * 0.7) {
        // Check unique values count for category vs free text
        const unique = new Set(nonEmpty.map(v => String(v).trim().toLowerCase()));
        if (unique.size <= Math.min(rows.length * 0.5, 30)) {
            return { type: 'category', category: 'label' };
        }
        return { type: 'text', category: 'label' };
    }

    return { type: 'mixed', category: 'label' };
}

/**
 * Choose the best chart type based on data characteristics
 */
function pickChartType(labelInfo, numericCols, rowCount, dataCharacteristics) {
    // For distribution/composition with few categories → doughnut/pie
    if (numericCols.length === 1 && rowCount <= 10 && labelInfo.type === 'category') {
        return 'doughnut';
    }

    // For time series data → line chart
    if (labelInfo.type === 'date') {
        return numericCols.length <= 3 ? 'line' : 'bar';
    }

    // For comparison across categories
    if (labelInfo.type === 'category') {
        if (rowCount <= 8 && numericCols.length <= 2) return 'bar';
        if (rowCount <= 6 && numericCols.length >= 3) return 'radar';
        if (numericCols.length === 1 && rowCount <= 12) return 'doughnut';
        return 'bar';
    }

    // Large datasets → line
    if (rowCount > 15) return 'line';

    // Medium datasets with multiple metrics → bar
    if (numericCols.length >= 2) return 'bar';

    // Default
    return rowCount <= 8 ? 'doughnut' : 'bar';
}

/**
 * Compute comprehensive KPIs for a column
 */
function computeKPIs(header, values, allRows, labelCol) {
    const filtered = values.filter(v => !isNaN(v) && isFinite(v));
    if (filtered.length === 0) return null;

    const total = filtered.reduce((a, b) => a + b, 0);
    const count = filtered.length;
    const avg = total / count;
    const max = Math.max(...filtered);
    const min = Math.min(...filtered);

    // Standard deviation
    const variance = filtered.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    // Median
    const sorted = [...filtered].sort((a, b) => a - b);
    const median = count % 2 === 0 ? (sorted[count/2 - 1] + sorted[count/2]) / 2 : sorted[Math.floor(count/2)];

    // Trend (compare first half vs second half)
    const midpoint = Math.floor(count / 2);
    const firstHalf = filtered.slice(0, midpoint);
    const secondHalf = filtered.slice(midpoint);
    const firstAvg = firstHalf.length ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
    const secondAvg = secondHalf.length ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
    const trend = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg * 100) : 0;

    // Growth rate (last vs first value)
    const firstVal = filtered[0];
    const lastVal = filtered[filtered.length - 1];
    const growthRate = firstVal > 0 ? ((lastVal - firstVal) / firstVal * 100) : 0;

    // Find the peak label
    let peakLabel = '';
    if (labelCol) {
        const maxIdx = values.indexOf(max);
        if (maxIdx >= 0 && allRows[maxIdx]) {
            peakLabel = String(allRows[maxIdx][labelCol] || '');
        }
    }

    return {
        label: header,
        total: Math.round(total * 100) / 100,
        avg: Math.round(avg * 100) / 100,
        max: Math.round(max * 100) / 100,
        min: Math.round(min * 100) / 100,
        median: Math.round(median * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        count,
        trend: Math.round(trend * 10) / 10,
        growthRate: Math.round(growthRate * 10) / 10,
        peakLabel
    };
}

/**
 * Generate secondary charts (additional views of the data)
 */
function generateSecondaryCharts(sheetName, rows, labelCol, numericCols, labelInfo) {
    const secondary = [];

    // 1. If there are enough numeric columns, create a composition/distribution chart
    if (numericCols.length >= 3 && rows.length >= 3) {
        // Aggregate totals across all rows for each column → pie/doughnut
        const totals = numericCols.slice(0, 8).map(col => {
            const sum = rows.reduce((acc, r) => acc + (parseFloat(r[col]) || 0), 0);
            return Math.round(sum * 100) / 100;
        });

        secondary.push({
            sheetName,
            customTitle: `${sheetName} - Metric Distribution`,
            chartType: 'doughnut',
            labelColumn: 'Metric',
            dataColumns: numericCols.slice(0, 8),
            labels: numericCols.slice(0, 8),
            datasets: [{ label: 'Total', data: totals }],
            kpis: [],
            rowCount: numericCols.length,
            isSecondary: true
        });
    }

    // 2. Top/Bottom analysis — if more than 10 rows, show top 8 by largest numeric column
    if (rows.length > 10 && numericCols.length >= 1) {
        const primaryCol = numericCols[0];
        const sortedRows = [...rows].sort((a, b) => (parseFloat(b[primaryCol]) || 0) - (parseFloat(a[primaryCol]) || 0));
        const top8 = sortedRows.slice(0, 8);

        secondary.push({
            sheetName,
            customTitle: `Top 8 by ${primaryCol}`,
            chartType: 'bar',
            labelColumn: labelCol,
            dataColumns: [primaryCol],
            labels: top8.map(r => String(r[labelCol] || '')),
            datasets: [{
                label: primaryCol,
                data: top8.map(r => parseFloat(r[primaryCol]) || 0)
            }],
            kpis: [],
            rowCount: 8,
            isSecondary: true
        });
    }

    // 3. If there's a category column with few unique values, create grouped summary
    if (labelInfo.type === 'category' && numericCols.length >= 1) {
        const uniqueLabels = [...new Set(rows.map(r => String(r[labelCol])))];
        if (uniqueLabels.length >= 2 && uniqueLabels.length <= 12 && uniqueLabels.length < rows.length) {
            // Group by label and sum each numeric column
            const grouped = {};
            for (const label of uniqueLabels) {
                grouped[label] = {};
                for (const col of numericCols.slice(0, 4)) {
                    grouped[label][col] = rows
                        .filter(r => String(r[labelCol]) === label)
                        .reduce((sum, r) => sum + (parseFloat(r[col]) || 0), 0);
                }
            }

            const groupedDatasets = numericCols.slice(0, 4).map(col => ({
                label: col,
                data: uniqueLabels.map(lbl => Math.round((grouped[lbl][col] || 0) * 100) / 100)
            }));

            secondary.push({
                sheetName,
                customTitle: `${sheetName} - Summary by ${labelCol}`,
                chartType: uniqueLabels.length <= 6 ? 'radar' : 'bar',
                labelColumn: labelCol,
                dataColumns: numericCols.slice(0, 4),
                labels: uniqueLabels,
                datasets: groupedDatasets,
                kpis: [],
                rowCount: uniqueLabels.length,
                isSecondary: true
            });
        }
    }

    // 4. Polar Area chart for multi-metric comparison (if 3-8 numeric cols)
    if (numericCols.length >= 3 && numericCols.length <= 8 && rows.length >= 2) {
        const avgPerCol = numericCols.map(col => {
            const vals = rows.map(r => parseFloat(r[col]) || 0);
            return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        });

        secondary.push({
            sheetName,
            customTitle: `${sheetName} - Average Metrics Overview`,
            chartType: 'polarArea',
            labelColumn: 'Metric',
            dataColumns: numericCols,
            labels: numericCols,
            datasets: [{ label: 'Average', data: avgPerCol }],
            kpis: [],
            rowCount: numericCols.length,
            isSecondary: true
        });
    }

    return secondary;
}

/**
 * MAIN: Auto-generate intelligent dashboard config from parsed sheet data
 * Creates multiple chart types, deep KPIs, and secondary analysis charts
 */
export function autoGenerateDashboardConfig(sheets, frequency) {
    const configs = [];

    for (const [sheetName, rows] of Object.entries(sheets)) {
        if (rows.length === 0) continue;
        const headers = Object.keys(rows[0]);
        if (headers.length === 0) continue;

        // Classify all columns
        const columnInfo = {};
        const labelCols = [];
        const numericCols = [];

        for (const h of headers) {
            const info = classifyColumn(h, rows);
            columnInfo[h] = info;
            if (info.category === 'numeric') {
                numericCols.push(h);
            } else {
                labelCols.push(h);
            }
        }

        // Pick the best label column
        let labelCol = labelCols.find(c => columnInfo[c].type === 'date')
            || labelCols.find(c => columnInfo[c].type === 'category')
            || labelCols[0]
            || headers[0];

        // If no numeric columns found, try harder - check all columns for numeric data
        if (numericCols.length === 0) {
            for (const h of headers) {
                if (h === labelCol) continue;
                const vals = rows.map(r => r[h]);
                const numCount = vals.filter(v => !isNaN(parseFloat(v)) && v !== '' && v !== null).length;
                if (numCount > rows.length * 0.5) {
                    numericCols.push(h);
                    columnInfo[h] = { type: 'number', category: 'numeric' };
                }
            }
        }

        if (numericCols.length === 0) continue;

        const labelInfo = columnInfo[labelCol] || { type: 'text', category: 'label' };

        // Generate labels
        const labels = rows.map(r => {
            const val = r[labelCol];
            if (val instanceof Date) return val.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
            return String(val || '');
        });

        // Build datasets
        const datasets = numericCols.map(col => ({
            label: col,
            data: rows.map(r => {
                const v = r[col];
                const parsed = parseFloat(String(v).replace(/[$,₹€£]/g, ''));
                return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
            })
        }));

        // Pick optimal chart type
        const chartType = pickChartType(labelInfo, numericCols, rows.length, columnInfo);

        // Compute deep KPIs for up to 8 numeric columns
        const kpis = numericCols.slice(0, 8).map(col => {
            const values = rows.map(r => {
                const v = r[col];
                return parseFloat(String(v).replace(/[$,₹€£]/g, '')) || 0;
            });
            return computeKPIs(col, values, rows, labelCol);
        }).filter(Boolean);

        // Main chart config
        const mainConfig = {
            sheetName,
            customTitle: sheetName,
            chartType,
            labelColumn: labelCol,
            dataColumns: numericCols,
            labels,
            datasets,
            kpis,
            rowCount: rows.length,
            columnCount: headers.length,
            numericColumnCount: numericCols.length,
            isSecondary: false
        };

        configs.push(mainConfig);

        // Generate secondary analysis charts
        const secondaryCharts = generateSecondaryCharts(sheetName, rows, labelCol, numericCols, labelInfo);
        configs.push(...secondaryCharts);
    }

    return configs;
}
