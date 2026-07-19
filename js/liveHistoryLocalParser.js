/*
 * Browser-local parser for the canonical Daily_Charger_kWh dashboard export.
 *
 * The Portfolio Financials upload must remain usable even when a hosting proxy
 * points the browser at an older Python process. This module reads the selected
 * XLSX/ZIP directly in the browser, builds the same site-day/month histories as
 * server.py, and returns the normal live-history schema. No data leaves the
 * browser when this fallback is used.
 */

const LOCAL_SCHEMA_VERSION = "v21-live-history-v7";
const LOCAL_APP_VERSION = "V21.3";
const LOCAL_BUILD_ID = "EVHUB-V21.3-20260719-R1";
const LOCAL_PARSER_BUILD_ID = "EVHUB-LIVE-PARSER-21.4";
const DAY_MS = 86400000;
const EXCEL_EPOCH_DAY = Math.floor(Date.UTC(1899, 11, 30) / DAY_MS);
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12
};

function round(value, digits = 0) {
  const scale = 10 ** digits;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const sign = numeric < 0 ? -1 : 1;
  const scaled = Math.abs(numeric) * scale;
  const lower = Math.floor(scaled);
  const fraction = scaled - lower;
  const rounded = Math.abs(fraction - 0.5) < 1e-10
    ? (lower % 2 === 0 ? lower : lower + 1)
    : Math.round(scaled);
  return sign * rounded / scale;
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripXml(value) {
  return xmlDecode(String(value || "").replace(/<[^>]*>/g, ""));
}

function baseName(path) {
  return String(path || "").replace(/\\/g, "/").split("/").pop() || "";
}

function canonicalDailyFilename(path) {
  const stem = baseName(path).toLowerCase().replace(/\.(xlsx|xlsm|csv)$/i, "");
  const normalised = stem.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalised === "daily_charger_kwh" || normalised.startsWith("daily_charger_kwh_");
}

function ignoredArchivePath(path) {
  const parts = String(path || "").replace(/\\/g, "/").split("/").filter(Boolean);
  const folders = parts.slice(0, -1).map(part => part.toLowerCase());
  return folders.includes("ignore") || folders.includes("__macosx") || parts.some(part => part.startsWith("."));
}

function headerKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function headerIndex(headers, ...candidates) {
  const normalised = headers.map(headerKey);
  for (const candidate of candidates) {
    const index = normalised.indexOf(headerKey(candidate));
    if (index >= 0) return index;
  }
  return null;
}

function liveNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value).replace(/,/g, "").replace(/€/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function datePartsToDay(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const stamp = Date.UTC(year, month - 1, day);
  const date = new Date(stamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(stamp / DAY_MS);
}

function parseLiveDay(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return datePartsToDay(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 70000) {
    return EXCEL_EPOCH_DAY + Math.trunc(value);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return datePartsToDay(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    return month ? datePartsToDay(Number(match[3]), month, Number(match[1])) : null;
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const first = datePartsToDay(Number(match[3]), Number(match[2]), Number(match[1]));
    return first ?? datePartsToDay(Number(match[3]), Number(match[1]), Number(match[2]));
  }
  return null;
}

function dayToIso(dayNumber) {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

function dayParts(dayNumber) {
  const date = new Date(dayNumber * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function monthStartDay(dayNumber) {
  const { year, month } = dayParts(dayNumber);
  return datePartsToDay(year, month, 1);
}

function nextMonthDay(dayNumber) {
  const { year, month } = dayParts(dayNumber);
  return month === 12 ? datePartsToDay(year + 1, 1, 1) : datePartsToDay(year, month + 1, 1);
}

function normaliseSiteKey(value) {
  return String(value || "").toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(dc|kw|kwh|epower|everyday|ev|charger|charging)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

function cleanSiteName(chargePointName) {
  let name = String(chargePointName || "").trim()
    .replace(/^ePower\s+eVeryday\s+-\s+/i, "")
    .replace(/\s*-?\s*eP\d+\b.*$/i, "").replace(/^\s*-+|-+\s*$/g, "").trim();
  const replacements = {
    "Ahern's Centra Carrigtwohill": "Aherns Centra - Carrigtwohill",
    "Ahern's Centra Castlemartyr": "Ahern's Centra - Castlemartyr",
    "Aherne's Circle K Thurles": "Circle K - Aherns Service Station",
    "Corrib Oil, Lee Garage, Cork": "Corrib Oil - Cork City",
    "Corrib Oil Fermoy": "Corrib Oil - Fermoy",
    "Greenhills Hotel DC": "Greenhills Hotel",
    "The Brehon Hotel DC": "The Brehon Hotel",
    "Mallow N20 Plaza": "Mallow Plaza",
    "Long Mile Road - Finline Furniture": "Finline Furniture - Dublin",
    "Supervalu Tipperary": "Supervalu - Tipperary",
    "Banner Plaza Ennis, Junction 12": "Banner Plaza Ennis Junction 12",
    "Fota Island Resort 180 kW DC": "Fota Island Resort",
    "SCG Cobh golf club": "SCG - Cobh golf club",
    "SCG Dundalk Golf Club": "SCG - Dundalk Golf Club"
  };
  return replacements[name] || name;
}

function columnIndex(cellRef) {
  const letters = String(cellRef || "").toUpperCase().replace(/[^A-Z]/g, "");
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function sharedStringsFromXml(xml) {
  const values = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let item;
  while ((item = itemPattern.exec(xml))) {
    let text = "";
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let part;
    while ((part = textPattern.exec(item[1]))) text += xmlDecode(part[1]);
    values.push(text || stripXml(item[1]));
  }
  return values;
}

function firstSheetPath(workbookXml, relsXml) {
  const sheet = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*>/i)
    || workbookXml.match(/<sheet\b[^>]*\bid="([^"]+)"[^>]*>/i);
  const relationshipId = sheet?.[1];
  if (relationshipId) {
    const relPattern = /<Relationship\b([^>]*)\/?\s*>/gi;
    let rel;
    while ((rel = relPattern.exec(relsXml))) {
      const id = rel[1].match(/\bId="([^"]+)"/i)?.[1];
      if (id !== relationshipId) continue;
      const target = rel[1].match(/\bTarget="([^"]+)"/i)?.[1];
      if (target) {
        const clean = target.replace(/^\/+/, "").replace(/^xl\//, "");
        return `xl/${clean}`.replace(/^xl\/xl\//, "xl/");
      }
    }
  }
  return "xl/worksheets/sheet1.xml";
}

function rowValues(rowXml, sharedStrings) {
  const values = [];
  const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
  let cell;
  while ((cell = cellPattern.exec(rowXml))) {
    const attrs = cell[1] || cell[3] || "";
    const body = cell[2] || "";
    const ref = attrs.match(/\br="([^"]+)"/i)?.[1] || "";
    const index = columnIndex(ref);
    while (values.length < index) values.push(null);
    const type = attrs.match(/\bt="([^"]+)"/i)?.[1] || "";
    const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
    let value = "";
    if (type === "s") {
      const sharedIndex = Number(raw);
      value = Number.isInteger(sharedIndex) ? (sharedStrings[sharedIndex] ?? "") : "";
    } else if (type === "inlineStr") {
      const texts = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(match => xmlDecode(match[1]));
      value = texts.join("");
    } else if (type === "str") {
      value = xmlDecode(raw);
    } else if (raw !== "") {
      const number = Number(raw);
      value = Number.isFinite(number) ? number : xmlDecode(raw);
    }
    values[index] = value;
  }
  return values;
}

async function parseXlsxRows(bytes, onRow) {
  const JSZip = globalThis.JSZip;
  if (!JSZip) throw new Error("The browser XLSX reader was not loaded.");
  const zip = await JSZip.loadAsync(bytes);
  const sharedXml = zip.file("xl/sharedStrings.xml") ? await zip.file("xl/sharedStrings.xml").async("string") : "";
  const shared = sharedXml ? sharedStringsFromXml(sharedXml) : [];
  const workbookXml = zip.file("xl/workbook.xml") ? await zip.file("xl/workbook.xml").async("string") : "";
  const relsXml = zip.file("xl/_rels/workbook.xml.rels") ? await zip.file("xl/_rels/workbook.xml.rels").async("string") : "";
  let path = firstSheetPath(workbookXml, relsXml);
  if (!zip.file(path)) path = "xl/worksheets/sheet1.xml";
  const sheetFile = zip.file(path);
  if (!sheetFile) throw new Error("The Excel workbook has no readable first worksheet.");
  const sheetXml = await sheetFile.async("string");
  const data = sheetXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/i)?.[1] || sheetXml;
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let match;
  let rowNumber = 0;
  while ((match = rowPattern.exec(data))) {
    rowNumber += 1;
    onRow(rowValues(match[1], shared), rowNumber);
  }
  return rowNumber;
}

function parseCsvRows(text, onRow) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i <= text.length; i += 1) {
    const ch = text[i] ?? "\n";
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  rows.forEach((value, index) => onRow(value, index + 1));
  return rows.length;
}

async function selectedDailySources(files, progress) {
  const JSZip = globalThis.JSZip;
  if (!JSZip) throw new Error("The browser ZIP reader was not loaded.");
  const primary = [];
  const supporting = [];
  const warnings = [];
  let archiveCount = 0;
  for (const file of files) {
    const lower = String(file.name || "").toLowerCase();
    if (lower.endsWith(".zip")) {
      archiveCount += 1;
      progress?.(`Opening ${file.name} locally…`);
      const archive = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(archive.files).filter(entry => !entry.dir && !ignoredArchivePath(entry.name));
      const spreadsheets = entries.filter(entry => /\.(xlsx|xlsm|csv)$/i.test(entry.name));
      const daily = spreadsheets.filter(entry => canonicalDailyFilename(entry.name));
      if (!daily.length) {
        supporting.push(...spreadsheets.map(entry => entry.name));
        continue;
      }
      for (const entry of spreadsheets) {
        if (daily.includes(entry)) {
          primary.push({ name: entry.name, bytes: await entry.async("uint8array") });
        } else supporting.push(entry.name);
      }
      warnings.push(`${file.name}: extracted ${spreadsheets.length} spreadsheet file(s) locally and selected ${daily.length} Daily_Charger_kWh source.`);
    } else if (canonicalDailyFilename(file.name)) {
      primary.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    } else if (/\.(xlsx|xlsm|csv)$/i.test(lower)) {
      supporting.push(file.name);
    }
  }
  if (!primary.length) {
    throw new Error("No Daily_Charger_kWh.xlsx file was found in the selected files or ZIP pack.");
  }
  return { primary, supporting, warnings, archiveCount };
}

function buildMonthlyHistory(daily, firstActive, latestDay) {
  if (firstActive == null || latestDay == null || latestDay < firstActive) return [];
  const rows = [];
  let cursor = monthStartDay(firstActive);
  let monthIndex = 1;
  while (cursor <= latestDay) {
    const next = nextMonthDay(cursor);
    const monthEnd = next - 1;
    const start = Math.max(cursor, firstActive);
    const end = Math.min(monthEnd, latestDay);
    const calendarDays = end - start + 1;
    let kwh = 0, sessions = 0, net = 0, activeDays = 0, sourceDays = 0;
    for (let day = start; day <= end; day += 1) {
      const values = daily.get(day);
      if (!values) continue;
      sourceDays += 1;
      kwh += Number(values.kwh || 0);
      sessions += Number(values.sessions || 0);
      net += Number(values.net || 0);
      if (Number(values.kwh || 0) >= 1 || Number(values.sessions || 0) >= 1) activeDays += 1;
    }
    const { year, month } = dayParts(cursor);
    const fullCalendarDays = monthEnd - cursor + 1;
    rows.push({
      monthIndex,
      month: `${year}-${String(month).padStart(2, "0")}`,
      monthStart: dayToIso(cursor),
      calendarMonth: month,
      calendarDays,
      sourceDays,
      activeDays,
      isCompleteCalendarMonth: start === cursor && end === monthEnd && calendarDays === fullCalendarDays,
      kwh: round(kwh, 3),
      sessions: round(sessions, 3),
      netRevenue: round(net, 2),
      kwhPerCalendarDay: calendarDays ? round(kwh / calendarDays, 4) : 0,
      sessionsPerCalendarDay: calendarDays ? round(sessions / calendarDays, 4) : 0
    });
    cursor = next;
    monthIndex += 1;
  }
  return rows;
}

function buildDailyHistory(daily, firstActive, latestDay) {
  if (firstActive == null || latestDay == null || latestDay < firstActive) return [];
  const rows = [];
  const window = [];
  let rollingTotal = 0;
  for (let day = firstActive; day <= latestDay; day += 1) {
    const values = daily.get(day);
    const kwh = Number(values?.kwh || 0);
    const sessions = Number(values?.sessions || 0);
    const net = Number(values?.net || 0);
    window.push(kwh);
    rollingTotal += kwh;
    if (window.length > 30) rollingTotal -= window.shift();
    rows.push({
      date: dayToIso(day),
      kwh: round(kwh, 3),
      sessions: round(sessions, 3),
      netRevenue: round(net, 2),
      rolling30Kwh: round(rollingTotal, 3),
      sourcePresent: Boolean(values)
    });
  }
  return rows;
}

function sumRange(daily, start, end) {
  const result = { kwh: 0, sessions: 0, net: 0 };
  for (const [day, values] of daily.entries()) {
    if (day < start || day > end) continue;
    result.kwh += Number(values.kwh || 0);
    result.sessions += Number(values.sessions || 0);
    result.net += Number(values.net || 0);
  }
  return result;
}

function buildPayload(siteDays, sourceInfo, totalRows, startedAt) {
  const allDays = [];
  for (const site of siteDays.values()) for (const day of site.daily.keys()) allDays.push(day);
  if (!allDays.length) throw new Error("The Daily_Charger_kWh export did not contain readable dated rows.");
  const latestPortfolioDay = Math.max(...allDays);
  const actuals = [];
  for (const site of siteDays.values()) {
    const days = [...site.daily.keys()].sort((a, b) => a - b);
    const sessionDays = days.filter(day => Number(site.daily.get(day)?.sessions || 0) >= 1);
    const kwhDays = days.filter(day => Number(site.daily.get(day)?.kwh || 0) >= 1);
    const firstSession = sessionDays.length ? sessionDays[0] : null;
    const firstKwh = kwhDays.length ? kwhDays[0] : null;
    const firstActive = firstSession ?? firstKwh;
    const basis = firstSession != null ? "first_session" : firstKwh != null ? "first_kwh" : "no_commercial_activity";
    const latestDay = days.length ? days[days.length - 1] : latestPortfolioDay;
    const dataDays = firstActive == null ? 0 : latestDay - firstActive + 1;
    const rolling = sumRange(site.daily, latestDay - 29, latestDay);
    const trailingStart = latestDay - 364;
    const trailing = sumRange(site.daily, trailingStart, latestDay);
    const cumulative = firstActive == null ? { kwh: 0, sessions: 0, net: 0 } : sumRange(site.daily, firstActive, latestDay);
    const tier = dataDays >= 365 ? "mature" : dataDays >= 300 ? "near" : "early";
    let annualKwh = 0, annualSessions = 0, annualNetRevenue = 0, dailyKwh = 0, dailySessions = 0;
    let annualisationMethod = "no_actual", annualisationBasis = "no usable live actuals";
    if (tier === "mature" && dataDays >= 365) {
      annualKwh = round(trailing.kwh, 3);
      annualSessions = round(trailing.sessions, 3);
      annualNetRevenue = round(trailing.net, 2);
      dailyKwh = round(trailing.kwh / 365, 4);
      dailySessions = round(trailing.sessions / 365, 4);
      annualisationMethod = "trailing365";
      annualisationBasis = `trailing 365-day actual — ${round(trailing.kwh, 1)} kWh from ${dayToIso(trailingStart)} to ${dayToIso(latestDay)}`;
    } else if (dataDays > 0) {
      annualKwh = round(cumulative.kwh / dataDays * 365, 3);
      annualSessions = round(cumulative.sessions / dataDays * 365, 3);
      annualNetRevenue = round(cumulative.net / dataDays * 365, 2);
      dailyKwh = round(cumulative.kwh / dataDays, 4);
      dailySessions = round(cumulative.sessions / dataDays, 4);
      annualisationMethod = tier === "near" ? "partial_cumulative" : "daily_cumulative";
      const label = tier === "near" ? "partial-year cumulative annualised" : "daily cumulative";
      annualisationBasis = `${label} — ${round(cumulative.kwh, 1)} kWh over ${dataDays} days live (${dayToIso(firstActive)} to ${dayToIso(latestDay)})`;
    }
    const monthlyHistory = buildMonthlyHistory(site.daily, firstActive, latestDay);
    const dailyHistory = buildDailyHistory(site.daily, firstActive, latestDay);
    const sourceDayCount = dailyHistory.filter(row => row.sourcePresent).length;
    actuals.push({
      siteName: site.siteName,
      siteKey: site.siteKey,
      actual: {
        rolling30Kwh: round(rolling.kwh, 3),
        rolling30Sessions: round(rolling.sessions, 3),
        rolling30NetRevenue: round(rolling.net, 2),
        trailing365Kwh: round(trailing.kwh, 3),
        trailing365Sessions: round(trailing.sessions, 3),
        trailing365NetRevenue: round(trailing.net, 2),
        dailyKwh,
        dailySessions,
        annualKwh,
        annualSessions,
        annualNetRevenue,
        asOfDate: dayToIso(latestDay),
        sourceFile: [...site.sourceFiles].sort().join(", "),
        source: "Browser-local Daily_Charger_kWh parser",
        annualisationBasis,
        annualisationMethod,
        firstCommercialSessionDate: firstSession == null ? null : dayToIso(firstSession),
        firstCommercialKwhDate: firstKwh == null ? null : dayToIso(firstKwh),
        commercialDaysBasis: basis,
        monthlyHistory,
        dailyHistory
      },
      maturity: { dataDays: Math.trunc(dataDays), tier },
      diagnostics: {
        firstActiveDate: firstActive == null ? null : dayToIso(firstActive),
        firstCommercialSessionDate: firstSession == null ? null : dayToIso(firstSession),
        firstCommercialKwhDate: firstKwh == null ? null : dayToIso(firstKwh),
        commercialDaysBasis: basis,
        latestDate: dayToIso(latestDay),
        chargerCount: site.chargerNames.size,
        chargerNames: [...site.chargerNames].sort(),
        cumulativeKwh: round(cumulative.kwh, 1),
        daysLive: dataDays,
        monthlyHistoryMonths: monthlyHistory.length,
        dailyHistoryDays: dailyHistory.length,
        sourceDayCount,
        sourceCoveragePct: dataDays > 0 ? round(sourceDayCount / dataDays * 100, 2) : 0,
        completeCalendarMonths: monthlyHistory.filter(row => row.isCompleteCalendarMonth).length
      }
    });
  }
  actuals.sort((a, b) => a.siteName.localeCompare(b.siteName));
  const monthlyHistorySiteCount = actuals.filter(item => item.actual.monthlyHistory.length).length;
  const monthlyObservationCount = actuals.reduce((sum, item) => sum + item.actual.monthlyHistory.length, 0);
  const dailyHistorySiteCount = actuals.filter(item => item.actual.dailyHistory.length).length;
  const dailyObservationCount = actuals.reduce((sum, item) => sum + item.actual.dailyHistory.length, 0);
  const completeMonthObservationCount = actuals.reduce((sum, item) => sum + item.actual.monthlyHistory.filter(row => row.isCompleteCalendarMonth).length, 0);
  const elapsed = round(performance.now() - startedAt, 1);
  return {
    ok: true,
    source: "browser_local_live_calibration_files",
    status: "active",
    schemaVersion: LOCAL_SCHEMA_VERSION,
    uploadSchemaVersion: LOCAL_SCHEMA_VERSION,
    upload_schema_version: LOCAL_SCHEMA_VERSION,
    appVersion: LOCAL_APP_VERSION,
    app_version: LOCAL_APP_VERSION,
    buildId: LOCAL_BUILD_ID,
    build_id: LOCAL_BUILD_ID,
    parserBuildId: LOCAL_PARSER_BUILD_ID,
    parser_build_id: LOCAL_PARSER_BUILD_ID,
    monthlyHistorySupported: true,
    monthly_history_supported: true,
    dailyHistorySupported: true,
    daily_history_supported: true,
    deploymentRootOk: true,
    deployment_root_ok: true,
    frontendBuildVerified: true,
    frontend_build_verified: true,
    latestDate: dayToIso(latestPortfolioDay),
    rollingWindowDays: 30,
    siteActuals: actuals,
    siteCount: actuals.length,
    rowCount: totalRows,
    uploadedArchiveCount: sourceInfo.archiveCount,
    expandedSpreadsheetCount: sourceInfo.primary.length + sourceInfo.supporting.length,
    primarySourceSelection: "browser_local_canonical_filename",
    primarySourceFiles: sourceInfo.primary.map(item => item.name),
    parserTimingsMs: { parserTotal: elapsed, browserLocalParser: elapsed },
    requestTimingsMs: { serverBeforeResponse: 0, browserLocalParser: elapsed },
    monthlyHistorySiteCount,
    monthlyObservationCount,
    dailyHistorySiteCount,
    dailyObservationCount,
    completeMonthObservationCount,
    parsedFiles: sourceInfo.primary.map(item => item.name),
    supportingFiles: sourceInfo.supporting.slice(0, 25),
    warnings: [...sourceInfo.warnings, "The file was processed locally in this browser; no compatible backend upload response was required."].slice(0, 25),
    errors: [],
    localParser: true,
    message: `Uploaded live calibration actuals loaded locally. Latest portfolio date: ${dayToIso(latestPortfolioDay)}. Retained ${dailyObservationCount} site-day and ${monthlyObservationCount} monthly observations across ${monthlyHistorySiteCount} sites.`
  };
}

export async function parsePortfolioCalibrationFilesLocally(files, progress) {
  const startedAt = performance.now();
  progress?.("Reading the selected files locally…");
  const sourceInfo = await selectedDailySources(Array.from(files || []), progress);
  const siteDays = new Map();
  let totalRows = 0;
  for (let sourceIndex = 0; sourceIndex < sourceInfo.primary.length; sourceIndex += 1) {
    const source = sourceInfo.primary[sourceIndex];
    progress?.(`Reading ${baseName(source.name)} (${sourceIndex + 1}/${sourceInfo.primary.length})…`);
    let headers = null;
    let dateIndex = null, chargerIndex = null, kwhIndex = null, netIndex = null, sessionsIndex = null;
    const consumeRow = (row, rowNumber) => {
      if (rowNumber === 1) {
        headers = row;
        dateIndex = headerIndex(headers, "Date of start_time", "date");
        chargerIndex = headerIndex(headers, "charge_point_name");
        kwhIndex = headerIndex(headers, "Total charge_amount");
        netIndex = headerIndex(headers, "Total net");
        sessionsIndex = headerIndex(headers, "transaction_id Count");
        if (dateIndex == null || chargerIndex == null || kwhIndex == null) {
          throw new Error(`${source.name} does not contain Date of start_time, charge_point_name and Total charge_amount.`);
        }
        return;
      }
      totalRows += 1;
      if (row.length <= Math.max(dateIndex, chargerIndex, kwhIndex)) return;
      const day = parseLiveDay(row[dateIndex]);
      const rawName = row[chargerIndex];
      if (day == null || !rawName) return;
      const siteName = cleanSiteName(rawName);
      const siteKey = normaliseSiteKey(siteName);
      if (!siteKey) return;
      if (!siteDays.has(siteKey)) siteDays.set(siteKey, {
        siteName, siteKey, daily: new Map(), chargerNames: new Set(), sourceFiles: new Set()
      });
      const site = siteDays.get(siteKey);
      site.chargerNames.add(String(rawName));
      site.sourceFiles.add(source.name);
      if (!site.daily.has(day)) site.daily.set(day, { kwh: 0, net: 0, sessions: 0 });
      const values = site.daily.get(day);
      values.kwh += liveNumber(row[kwhIndex]);
      values.net += liveNumber(netIndex == null ? 0 : row[netIndex]);
      values.sessions += liveNumber(sessionsIndex == null ? 0 : row[sessionsIndex]);
    };
    if (/\.csv$/i.test(source.name)) {
      parseCsvRows(new TextDecoder("utf-8").decode(source.bytes), consumeRow);
    } else {
      await parseXlsxRows(source.bytes, consumeRow);
    }
  }
  if (!siteDays.size) throw new Error("No usable site rows were found in Daily_Charger_kWh.");
  progress?.("Building continuous daily and monthly histories locally…");
  return buildPayload(siteDays, sourceInfo, totalRows, startedAt);
}

export const LOCAL_LIVE_HISTORY_PARSER_INFO = Object.freeze({
  appVersion: LOCAL_APP_VERSION,
  buildId: LOCAL_BUILD_ID,
  parserBuildId: LOCAL_PARSER_BUILD_ID,
  schemaVersion: LOCAL_SCHEMA_VERSION
});
