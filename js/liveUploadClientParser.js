const textDecoder = new TextDecoder("utf-8");

function readU16(view, offset) { return view.getUint16(offset, true); }
function readU32(view, offset) { return view.getUint32(offset, true); }

function xmlUnescape(value = "") {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attrValue(tag = "", name = "") {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag).match(new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? xmlUnescape(match[1] ?? match[2] ?? "") : "";
}

function normaliseArchivePath(path = "") {
  const parts = String(path).replace(/\\/g, "/").replace(/^\/+/, "").split("/");
  const out = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser does not support the local Excel decompression fallback.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEocd = Math.max(0, bytes.length - 0xffff - 22);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minEocd; i -= 1) {
    if (readU32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP end-of-directory record was not found.");
  const entryCount = readU16(view, eocd + 10);
  let cursor = readU32(view, eocd + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || readU32(view, cursor) !== 0x02014b50) {
      throw new Error("ZIP central directory is incomplete.");
    }
    const method = readU16(view, cursor + 10);
    const compressedSize = readU32(view, cursor + 20);
    const uncompressedSize = readU32(view, cursor + 24);
    const nameLength = readU16(view, cursor + 28);
    const extraLength = readU16(view, cursor + 30);
    const commentLength = readU16(view, cursor + 32);
    const localOffset = readU32(view, cursor + 42);
    const name = normaliseArchivePath(textDecoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));
    if (localOffset + 30 > bytes.length || readU32(view, localOffset) !== 0x04034b50) {
      throw new Error(`ZIP entry ${name || index} has an invalid local header.`);
    }
    const localNameLength = readU16(view, localOffset + 26);
    const localExtraLength = readU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = new Uint8Array(compressed);
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error(`ZIP entry ${name || index} uses unsupported compression method ${method}.`);
    if (uncompressedSize && data.length !== uncompressedSize) {
      throw new Error(`ZIP entry ${name || index} decompressed to ${data.length} bytes; expected ${uncompressedSize}.`);
    }
    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function xlsxColumnIndex(cellRef = "") {
  const letters = String(cellRef).toUpperCase().replace(/[^A-Z]/g, "");
  let value = 0;
  for (const ch of letters) value = value * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, value - 1);
}

function extractTextNodes(fragment = "") {
  let text = "";
  const regex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi;
  let match;
  while ((match = regex.exec(fragment))) text += xmlUnescape(match[1] || "");
  return text;
}

async function parseXlsxRows(raw) {
  const entries = await unzipEntries(raw);
  const getText = name => {
    const data = entries.get(name);
    if (!data) throw new Error(`Excel workbook is missing ${name}.`);
    return textDecoder.decode(data);
  };

  const shared = [];
  if (entries.has("xl/sharedStrings.xml")) {
    const sharedXml = getText("xl/sharedStrings.xml");
    const siRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi;
    let si;
    while ((si = siRegex.exec(sharedXml))) shared.push(extractTextNodes(si[1] || ""));
  }

  const workbookXml = getText("xl/workbook.xml");
  const sheetTag = workbookXml.match(/<sheet\b[^>]*\br:id=(?:"[^"]+"|'[^']+')[^>]*\/?\s*>/i)?.[0];
  if (!sheetTag) throw new Error("Excel workbook has no readable worksheet.");
  const relationshipId = attrValue(sheetTag, "r:id");
  const relsXml = getText("xl/_rels/workbook.xml.rels");
  let target = "";
  const relRegex = /<Relationship\b[^>]*\/?\s*>/gi;
  let rel;
  while ((rel = relRegex.exec(relsXml))) {
    if (attrValue(rel[0], "Id") === relationshipId) { target = attrValue(rel[0], "Target"); break; }
  }
  if (!target) target = "worksheets/sheet1.xml";
  let sheetPath = normaliseArchivePath(target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`);
  if (!entries.has(sheetPath)) sheetPath = "xl/worksheets/sheet1.xml";
  const sheetXml = getText(sheetPath);
  const sheetData = sheetXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/i)?.[1] || sheetXml;
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetData))) {
    const values = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cell;
    while ((cell = cellRegex.exec(rowMatch[1] || ""))) {
      const attrs = cell[1] || "";
      const body = cell[2] || "";
      const col = xlsxColumnIndex(attrValue(attrs, "r"));
      while (values.length < col) values.push(null);
      const type = attrValue(attrs, "t");
      const rawValue = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
      let value = "";
      if (type === "s") {
        const idx = Number(rawValue);
        value = Number.isInteger(idx) && idx >= 0 ? (shared[idx] ?? "") : "";
      } else if (type === "inlineStr") {
        value = extractTextNodes(body);
      } else if (type === "str") {
        value = xmlUnescape(rawValue);
      } else if (rawValue !== "") {
        const numeric = Number(rawValue);
        value = Number.isFinite(numeric) ? numeric : xmlUnescape(rawValue);
      }
      values.push(value);
    }
    rows.push(values);
  }
  return rows;
}

function parseCsvRows(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
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
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const number = Number(String(value).replace(/,/g, "").replace(/€/g, "").trim());
  return Number.isFinite(number) ? number : 0;
}
function utcDate(year, month, day) { return Date.UTC(year, month - 1, day); }
function parseLiveDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  if (typeof value === "number" && value > 20000 && value < 70000) return utcDate(1899, 12, 30) + Math.trunc(value) * 86400000;
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (match) {
    const months = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12 };
    const month = months[match[2].toLowerCase()];
    if (month) return utcDate(Number(match[3]), month, Number(match[1]));
  }
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return utcDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return utcDate(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}
function isoDate(timestamp) { return new Date(timestamp).toISOString().slice(0, 10); }
function normaliseLiveSiteKey(value = "") {
  return String(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(dc|kw|kwh|epower|everyday|ev|charger|charging)\b/g, " ").replace(/\s+/g, " ").trim();
}
function cleanLiveSiteName(value = "") {
  let name = String(value).trim().replace(/^ePower\s+eVeryday\s+-\s+/i, "").replace(/\s*-?\s*eP\d+\b.*$/i, "").replace(/^\s+|\s+$/g, "").replace(/^[-\s]+|[-\s]+$/g, "");
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
    "SCG Dundalk Golf Club": "SCG - Dundalk Golf Club",
  };
  return replacements[name] || name;
}
function roundValue(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}
function monthStart(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}
function nextMonth(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
function buildMonthlyHistory(daily, firstActive, latestDate) {
  if (firstActive === null || latestDate < firstActive) return [];
  const rows = [];
  let cursor = monthStart(firstActive);
  let monthIndex = 1;
  while (cursor <= latestDate) {
    const next = nextMonth(cursor);
    const monthEnd = next - 86400000;
    const scopeStart = Math.max(cursor, firstActive);
    const scopeEnd = Math.min(monthEnd, latestDate);
    const calendarDays = Math.floor((scopeEnd - scopeStart) / 86400000) + 1;
    let kwh = 0, sessions = 0, net = 0, activeDays = 0, sourceDays = 0;
    for (const [day, values] of daily.entries()) {
      if (day < scopeStart || day > scopeEnd) continue;
      sourceDays += 1;
      kwh += Number(values.kwh || 0);
      sessions += Number(values.sessions || 0);
      net += Number(values.net || 0);
      if (Number(values.kwh || 0) >= 1 || Number(values.sessions || 0) >= 1) activeDays += 1;
    }
    const fullCalendarDays = Math.floor((monthEnd - cursor) / 86400000) + 1;
    const date = new Date(cursor);
    rows.push({
      monthIndex,
      month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      monthStart: isoDate(cursor),
      calendarMonth: date.getUTCMonth() + 1,
      calendarDays,
      sourceDays,
      activeDays,
      isCompleteCalendarMonth: scopeStart === cursor && scopeEnd === monthEnd && calendarDays === fullCalendarDays,
      kwh: roundValue(kwh, 3),
      sessions: roundValue(sessions, 3),
      netRevenue: roundValue(net, 2),
      kwhPerCalendarDay: calendarDays ? roundValue(kwh / calendarDays, 4) : 0,
      sessionsPerCalendarDay: calendarDays ? roundValue(sessions / calendarDays, 4) : 0,
    });
    cursor = next;
    monthIndex += 1;
  }
  return rows;
}

async function expandSelectedFiles(files) {
  const expanded = [];
  const warnings = [];
  let archiveCount = 0;
  for (const file of files) {
    const name = String(file?.name || "uploaded-file");
    const raw = new Uint8Array(await file.arrayBuffer());
    if (!name.toLowerCase().endsWith(".zip")) {
      expanded.push({ name, raw });
      continue;
    }
    archiveCount += 1;
    const entries = await unzipEntries(raw);
    let used = 0;
    for (const [entryName, entryRaw] of entries) {
      const safeName = normaliseArchivePath(entryName);
      const parts = safeName.split("/").filter(Boolean);
      const folderParts = parts.slice(0, -1).map(part => part.toLowerCase());
      const lower = (parts.at(-1) || "").toLowerCase();
      if (!parts.length || folderParts.includes("ignore") || folderParts.includes("__macosx") || parts.some(part => part.startsWith("."))) continue;
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm") && !lower.endsWith(".csv")) continue;
      expanded.push({ name: safeName, raw: entryRaw });
      used += 1;
    }
    if (!used) throw new Error(`${name} contained no usable XLSX, XLSM or CSV calibration files outside Ignore folders.`);
    warnings.push(`${name}: expanded ${used} calibration spreadsheet file(s) in the browser.`);
  }
  return { expanded, warnings, archiveCount };
}

export async function parseLiveCalibrationFilesClient(files, metadata = {}) {
  const { expanded, warnings, archiveCount } = await expandSelectedFiles(Array.from(files || []));
  const parsedSources = [];
  const supportingFiles = [];
  const siteDays = new Map();
  let totalRows = 0;

  for (const file of expanded) {
    let rows;
    try {
      rows = file.name.toLowerCase().endsWith(".csv") ? parseCsvRows(textDecoder.decode(file.raw)) : await parseXlsxRows(file.raw);
    } catch (error) {
      warnings.push(`${file.name}: could not be read locally (${error?.message || error}).`);
      continue;
    }
    if (!rows.length) continue;
    const headers = rows[0] || [];
    const dateIndex = headerIndex(headers, "Date of start_time", "date", "start_time", "session_date");
    const chargePointIndex = headerIndex(headers, "charge_point_name", "charge point name", "charger_name", "chargepoint");
    const kwhIndex = headerIndex(headers, "Total charge_amount", "charge_amount", "total_kwh", "kwh");
    const netIndex = headerIndex(headers, "Total net", "net", "net_revenue", "revenue");
    const sessionsIndex = headerIndex(headers, "transaction_id Count", "transaction_count", "sessions", "session_count");
    if (dateIndex === null || chargePointIndex === null || kwhIndex === null || sessionsIndex === null) {
      supportingFiles.push(`${file.name}: not a charger-level daily actuals export; kept as supporting file only`);
      continue;
    }
    parsedSources.push(file.name);
    for (const row of rows.slice(1)) {
      totalRows += 1;
      const date = parseLiveDate(row[dateIndex]);
      const rawName = row[chargePointIndex];
      if (date === null || !String(rawName ?? "").trim()) continue;
      const siteName = cleanLiveSiteName(rawName);
      const siteKey = normaliseLiveSiteKey(siteName);
      if (!siteKey) continue;
      if (!siteDays.has(siteKey)) siteDays.set(siteKey, { siteName, siteKey, daily: new Map(), chargerNames: new Set(), sourceFiles: new Set() });
      const site = siteDays.get(siteKey);
      site.chargerNames.add(String(rawName));
      site.sourceFiles.add(file.name);
      if (!site.daily.has(date)) site.daily.set(date, { kwh: 0, net: 0, sessions: 0 });
      const day = site.daily.get(date);
      day.kwh += liveNumber(row[kwhIndex]);
      day.net += netIndex !== null ? liveNumber(row[netIndex]) : 0;
      day.sessions += liveNumber(row[sessionsIndex]);
    }
  }

  if (!parsedSources.length) throw new Error("No usable charger-level daily export was found. Upload Daily_Charger_kWh.xlsx or the complete Overview ZIP pack.");
  const allDates = [];
  for (const site of siteDays.values()) for (const day of site.daily.keys()) allDates.push(day);
  if (!allDates.length) throw new Error("The charger-level export did not contain any readable dated rows.");
  const latestDate = Math.max(...allDates);
  const rollingStart = latestDate - 29 * 86400000;
  const trailingStart = latestDate - 364 * 86400000;
  const actuals = [];

  for (const site of siteDays.values()) {
    const daily = site.daily;
    const sessionDates = [...daily.entries()].filter(([, value]) => Number(value.sessions || 0) >= 1).map(([day]) => day);
    const kwhDates = [...daily.entries()].filter(([, value]) => Number(value.kwh || 0) >= 1).map(([day]) => day);
    const firstSession = sessionDates.length ? Math.min(...sessionDates) : null;
    const firstKwh = kwhDates.length ? Math.min(...kwhDates) : null;
    const firstActive = firstSession ?? firstKwh;
    const daysBasis = firstSession !== null ? "first_session" : firstKwh !== null ? "first_kwh" : "no_commercial_activity";
    const dataDays = firstActive !== null ? Math.floor((latestDate - firstActive) / 86400000) + 1 : 0;
    const sumScope = (start, end) => {
      let kwh = 0, net = 0, sessions = 0;
      for (const [day, values] of daily.entries()) {
        if (day < start || day > end) continue;
        kwh += Number(values.kwh || 0); net += Number(values.net || 0); sessions += Number(values.sessions || 0);
      }
      return { kwh, net, sessions };
    };
    const rolling = sumScope(rollingStart, latestDate);
    const trailing = sumScope(trailingStart, latestDate);
    const cumulative = firstActive !== null ? sumScope(firstActive, latestDate) : { kwh: 0, net: 0, sessions: 0 };
    const tier = dataDays >= 365 ? "mature" : dataDays >= 300 ? "near" : "early";
    let annualisedKwh = 0, annualisedSessions = 0, annualisedNet = 0, dailyKwhAvg = 0, dailySessionsAvg = 0, annualisationMethod = "no_actual", annualisationBasis = "no usable live actuals";
    if (tier === "mature" && dataDays >= 365) {
      annualisedKwh = roundValue(trailing.kwh, 3); annualisedSessions = roundValue(trailing.sessions, 3); annualisedNet = roundValue(trailing.net, 2);
      dailyKwhAvg = roundValue(trailing.kwh / 365, 4); dailySessionsAvg = roundValue(trailing.sessions / 365, 4);
      annualisationMethod = "trailing365";
      annualisationBasis = `trailing 365-day actual — ${roundValue(trailing.kwh, 1)} kWh from ${isoDate(trailingStart)} to ${isoDate(latestDate)}`;
    } else if (dataDays > 0) {
      annualisedKwh = roundValue(cumulative.kwh / dataDays * 365, 3); annualisedSessions = roundValue(cumulative.sessions / dataDays * 365, 3); annualisedNet = roundValue(cumulative.net / dataDays * 365, 2);
      dailyKwhAvg = roundValue(cumulative.kwh / dataDays, 4); dailySessionsAvg = roundValue(cumulative.sessions / dataDays, 4);
      annualisationMethod = tier === "near" ? "partial_cumulative" : "daily_cumulative";
      const label = tier === "near" ? "partial-year cumulative annualised" : "daily cumulative";
      annualisationBasis = `${label} — ${roundValue(cumulative.kwh, 1)} kWh over ${dataDays} days live (${firstActive !== null ? isoDate(firstActive) : "?"} to ${isoDate(latestDate)})`;
    }
    const monthlyHistory = buildMonthlyHistory(daily, firstActive, latestDate);
    actuals.push({
      siteName: site.siteName,
      siteKey: site.siteKey,
      actual: {
        rolling30Kwh: roundValue(rolling.kwh, 3), rolling30Sessions: roundValue(rolling.sessions, 3), rolling30NetRevenue: roundValue(rolling.net, 2),
        trailing365Kwh: roundValue(trailing.kwh, 3), trailing365Sessions: roundValue(trailing.sessions, 3), trailing365NetRevenue: roundValue(trailing.net, 2),
        dailyKwh: dailyKwhAvg, dailySessions: dailySessionsAvg,
        annualKwh: annualisedKwh, annualSessions: annualisedSessions, annualNetRevenue: annualisedNet,
        asOfDate: isoDate(latestDate), sourceFile: [...site.sourceFiles].sort().join(", "), source: "Browser-parsed live calibration files",
        annualisationBasis, annualisationMethod,
        firstCommercialSessionDate: firstSession !== null ? isoDate(firstSession) : null,
        firstCommercialKwhDate: firstKwh !== null ? isoDate(firstKwh) : null,
        commercialDaysBasis: daysBasis,
        monthlyHistory,
      },
      maturity: { dataDays: Math.trunc(dataDays), tier },
      diagnostics: {
        firstActiveDate: firstActive !== null ? isoDate(firstActive) : null,
        firstCommercialSessionDate: firstSession !== null ? isoDate(firstSession) : null,
        firstCommercialKwhDate: firstKwh !== null ? isoDate(firstKwh) : null,
        commercialDaysBasis: daysBasis,
        latestDate: isoDate(latestDate), chargerCount: site.chargerNames.size, chargerNames: [...site.chargerNames].sort(),
        cumulativeKwh: roundValue(cumulative.kwh, 1), daysLive: dataDays, monthlyHistoryMonths: monthlyHistory.length,
        completeCalendarMonths: monthlyHistory.filter(row => row.isCompleteCalendarMonth).length,
      }
    });
  }
  actuals.sort((a, b) => a.siteName.localeCompare(b.siteName));
  const monthlyHistorySiteCount = actuals.filter(item => item.actual.monthlyHistory.length > 0).length;
  const monthlyObservationCount = actuals.reduce((sum, item) => sum + item.actual.monthlyHistory.length, 0);
  const completeMonthObservationCount = actuals.reduce((sum, item) => sum + item.actual.monthlyHistory.filter(row => row.isCompleteCalendarMonth).length, 0);
  return {
    ok: true,
    source: "browser_parsed_live_calibration_files",
    status: "active",
    schemaVersion: metadata.schemaVersion || "browser-live-history-v1",
    uploadSchemaVersion: metadata.schemaVersion || "browser-live-history-v1",
    upload_schema_version: metadata.schemaVersion || "browser-live-history-v1",
    appVersion: metadata.appVersion || "browser",
    app_version: metadata.appVersion || "browser",
    buildId: metadata.buildId || "browser-local-parser",
    build_id: metadata.buildId || "browser-local-parser",
    parserBuildId: metadata.parserBuildId || "browser-local-parser-v1",
    parser_build_id: metadata.parserBuildId || "browser-local-parser-v1",
    monthlyHistorySupported: true,
    monthly_history_supported: true,
    latestDate: isoDate(latestDate),
    rollingWindowDays: 30,
    siteActuals: actuals,
    siteCount: actuals.length,
    rowCount: totalRows,
    uploadedArchiveCount: archiveCount,
    expandedSpreadsheetCount: expanded.length,
    monthlyHistorySiteCount,
    monthlyObservationCount,
    completeMonthObservationCount,
    parsedFiles: parsedSources,
    supportingFiles: supportingFiles.slice(0, 25),
    warnings: warnings.slice(0, 25),
    errors: [],
    message: `Uploaded actuals parsed locally in the browser. Latest date: ${isoDate(latestDate)}. Retained ${monthlyObservationCount} monthly observations across ${monthlyHistorySiteCount} sites.`
  };
}

export const __liveUploadParserTest = { unzipEntries, parseXlsxRows, cleanLiveSiteName, normaliseLiveSiteKey, parseLiveDate, buildMonthlyHistory };
