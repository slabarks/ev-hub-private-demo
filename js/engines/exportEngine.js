import { toCsv, downloadText, currency, number, pct, kwh, kva } from "../utils.js";
import { lineChart, stackedBarChart, financeComboChart } from "../ui/charts.js";
import { MOCK_LOCATION } from "../providers/mockProviders.js";
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG } from "../data/defaultAssumptions.js";
import { PORTFOLIO_CALIBRATION_SITES } from "../data/operatingHubCalibrationLibrary.js";
import { calculateDemand } from "./demandEngine.js";
import { calculateYearByYear } from "./financialEngine.js";

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function reportMetric(label, value) {
  return `<div class="report-card"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`;
}

function htmlTable(headers, rows) {
  if (!rows || !rows.length) rows = [["No rows to display."]];
  return `<div class="report-table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(x => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function scenarioRows(compare) {
  return [...(compare?.scenarios || [])]
    .sort((a, b) => (Number.isFinite(b.roi) ? b.roi : -999) - (Number.isFinite(a.roi) ? a.roi : -999))
    .map((s, i) => [
      i + 1,
      esc(s.name),
      esc(s.config.platform),
      `${esc(s.config.selectedMicKva)} kVA`,
      esc(s.config.batterySize || "No battery"),
      Number.isFinite(s.roi) ? pct(s.roi, 1) : "—",
      currency(s.cumulativeCashFlow, 0),
      s.breakEvenYear || "Not within horizon",
      esc(s.feasibilityStatus)
    ]);
}

function getReportCtx(state) {
  return state.siteContext || {
    ...MOCK_LOCATION,
    traffic: { ...MOCK_LOCATION.traffic, source: "Excel / TII N40 corridor reference" }
  };
}

function getSiteLat(ctx) { return Number(ctx?.site?.lat ?? ctx?.latitude ?? MOCK_LOCATION.site.lat); }
function getSiteLon(ctx) { return Number(ctx?.site?.lon ?? ctx?.longitude ?? MOCK_LOCATION.site.lon); }

function lonLatToWorldPx(lon, lat, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const x = (lon + 180) / 360 * scale;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function staticMapZoomForRadius(lat, radiusKm, width, height) {
  const radiusMeters = Math.max(250, Number(radiusKm || 3) * 1000);
  // Keep the full radius ring comfortably inside the printable map frame.
  // A fixed zoom caused large search radii to print with only the edge of the circle visible.
  const targetRadiusPx = Math.min(width, height) * 0.34;
  const cosLat = Math.max(0.25, Math.cos(lat * Math.PI / 180));
  const rawZoom = Math.log2((cosLat * 156543.03392) / (radiusMeters / targetRadiusPx));
  return Math.max(8, Math.min(15, Math.floor(rawZoom)));
}

function staticMapHtml(state, ctx) {
  const lat = getSiteLat(ctx);
  const lon = getSiteLon(ctx);
  const width = 980;
  const height = 360;
  const radiusKm = Number(state.filters?.radiusKm || 3);
  const zoom = staticMapZoomForRadius(lat, radiusKm, width, height);
  const center = lonLatToWorldPx(lon, lat, zoom);
  const startX = center.x - width / 2;
  const startY = center.y - height / 2;
  const tileStartX = Math.floor(startX / 256);
  const tileEndX = Math.floor((center.x + width / 2) / 256);
  const tileStartY = Math.floor(startY / 256);
  const tileEndY = Math.floor((center.y + height / 2) / 256);
  const maxTile = Math.pow(2, zoom);
  const tiles = [];
  for (let x = tileStartX; x <= tileEndX; x++) {
    for (let y = tileStartY; y <= tileEndY; y++) {
      if (y < 0 || y >= maxTile) continue;
      const wrappedX = ((x % maxTile) + maxTile) % maxTile;
      const left = Math.round(x * 256 - startX);
      const top = Math.round(y * 256 - startY);
      tiles.push(`<img class="static-map-tile" src="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png" style="left:${left}px;top:${top}px" alt="" loading="eager" decoding="sync">`);
    }
  }
  const mpp = Math.cos(lat * Math.PI / 180) * 156543.03392 / Math.pow(2, zoom);
  const radiusPx = Math.max(14, (radiusKm * 1000) / mpp);
  const radius = `<div class="static-map-radius" style="width:${radiusPx * 2}px;height:${radiusPx * 2}px;left:${width / 2 - radiusPx}px;top:${height / 2 - radiusPx}px"></div>`;
  const siteMarker = `<div class="static-map-marker site" style="left:${width / 2}px;top:${height / 2}px">⚡</div>`;
  const chargerMarkers = (ctx.chargers || []).slice(0, 20).map(c => {
    const pt = lonLatToWorldPx(Number(c.lon), Number(c.lat), zoom);
    const left = Math.round(pt.x - startX);
    const top = Math.round(pt.y - startY);
    if (!Number.isFinite(left) || !Number.isFinite(top) || left < -30 || left > width + 30 || top < -30 || top > height + 30) return "";
    return `<div class="static-map-marker charger" style="left:${left}px;top:${top}px" title="${esc(c.name)}">•</div>`;
  }).join("");
  return `<div class="static-map" style="width:${width}px;height:${height}px">${tiles.join("")}${radius}${chargerMarkers}${siteMarker}<div class="static-map-scale">Radius: ${number(radiusKm, radiusKm < 1 ? 1 : 0)} km</div><div class="static-map-attribution">© OpenStreetMap contributors</div></div>`;
}

function mapPanelHtml(state, ctx) {
  return `
    <div class="panel">
      <h3>Site map</h3>
      ${staticMapHtml(state, ctx)}
      <p class="report-caption">Selected site, search radius and nearby charger coverage. Map tiles are loaded from OpenStreetMap for the investor PDF.</p>
    </div>`;
}

function reportValidationChecklist(results, state) {
  const tech = results.yearByYear.technical || {};
  const failures = tech.failures || [];
  const lower = failures.map(f => String(f).toLowerCase());
  const has = text => lower.some(f => f.includes(text));
  const gridOnly = state.config.batteryStrategy === "Grid only";
  const checks = [
    ["Platform compatibility", !(has("invalid") || has("platform") || has("cabinet")), "Select compatible charger, cabinet and battery options."],
    ["Plug capacity", !has("plug"), "Increase chargers, dispensers or satellites."],
    ["MIC coverage", !(has("mic") || has("power constrained")), gridOnly ? "Increase MIC to cover peak site load." : "Increase MIC or select more battery support."],
    ["Battery power coverage", gridOnly || !has("battery power"), "Select a higher-kW battery or increase MIC."],
    ["Battery energy coverage", gridOnly || !has("battery energy"), "Select a larger usable kWh battery or enable augmentation."],
    ["Overnight recharge", !has("overnight") && !has("recharge"), "Increase MIC or reduce residual battery duty."],
    ["Battery SOH / replacement", true, "Battery degradation and replacement timing are handled in the model."],
    ["Charger replacement", true, "Charger replacement cycle is included in annual cash flow."]
  ];
  return `<div class="validator-grid report-validator">${checks.map(([label, ok, fix]) => {
    const status = ok ? "Passed" : "Needs action";
    const cls = ok ? "good" : "bad";
    return `<div class="validator-card ${cls}"><div class="status">${status}</div><strong>${esc(label)}</strong><small>${ok ? "Configuration passes this check." : esc(fix)}</small></div>`;
  }).join("")}</div>`;
}

function waitForImages(container, timeoutMs = 8500) {
  const imgs = [...container.querySelectorAll("img")];
  if (!imgs.length) return Promise.resolve();
  const loaders = imgs.map(img => new Promise(resolve => {
    if (img.complete) return resolve();
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }));
  return Promise.race([
    Promise.all(loaders),
    new Promise(resolve => setTimeout(resolve, timeoutMs))
  ]);
}

function annualFinancialChartRows(rows) {
  return rows.map(r => ({
    ...r,
    additionalCapex: Math.abs((r.batteryReplacementCapex || 0) + (r.chargerReplacementCapex || 0) + (r.augmentationCapex || 0))
  }));
}

function annualTechnicalRows(rows) {
  return rows.map(r => [
    r.year,
    number(r.peakDemandRequiredKw || 0, 1) + " kW",
    number(r.selectedMicKva || 0, 0) + " kVA",
    number(r.installedBatteryUnits || 0, 0),
    r.installedBatteryUnits ? pct(r.batterySohEnd || 0, 1) : "—",
    number(r.batteryEnergyAvailableKwhSohAdjusted || 0, 0) + " kWh",
    number(r.batteryPowerDeficitKw || 0, 1) + " kW",
    number(r.batteryEnergyDeficitKwh || 0, 0) + " kWh",
    r.batteryReplacementTrigger ? "Battery replacement" : "",
    r.chargerReplacementTrigger ? "Charger replacement" : "",
    r.augmentationFlag ? "Battery deployment / augmentation" : "",
    currency((r.batteryReplacementCapex || 0) + (r.chargerReplacementCapex || 0) + (r.augmentationCapex || 0), 0)
  ]);
}

const ANNUAL_TECH_HEADERS = ["Year", "Required peak", "Selected MIC", "Installed battery units", "Battery SOH", "SOH-adjusted usable kWh", "Power deficit", "Energy deficit", "Battery replacement", "Charger replacement", "Battery deployment", "Replacement / deployment capex"];

function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function xlsxEsc(v) {
  return String(v ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

function xlsxColName(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xlsxCell(value, r, c) {
  const ref = `${xlsxColName(c)}${r}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (value instanceof Date) return `<c r="${ref}"><v>${value.toISOString()}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${xlsxEsc(value)}</t></is></c>`;
}

function xlsxWorksheet(rows) {
  const cleanRows = rows.map(row => Array.isArray(row) ? row : [row]);
  const maxCols = Math.max(1, ...cleanRows.map(r => r.length));
  const widths = Array.from({ length: maxCols }, (_, col) => {
    const maxLen = Math.max(8, ...cleanRows.slice(0, 120).map(row => String(row[col] ?? "").length));
    return Math.min(42, Math.max(10, maxLen + 2));
  });
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
  const sheetData = cleanRows.map((row, idx) => {
    const r = idx + 1;
    return `<row r="${r}">${row.map((v, c) => xlsxCell(v, r, c)).join("")}</row>`;
  }).join("");
  const freeze = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols}<sheetData>${sheetData}</sheetData></worksheet>`;
}

function xlsxSafeSheetName(name, used) {
  let base = String(name || "Sheet").replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    const suffix = ` ${i++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: d };
}

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; }
function u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; }
function concatBytes(parts) {
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach(p => { out.set(p, offset); offset += p.length; });
  return out;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const { time, date } = dosDateTime();
  let offset = 0;
  files.forEach(file => {
    const name = enc.encode(file.name);
    const data = typeof file.data === "string" ? enc.encode(file.data) : file.data;
    const crc = crc32(data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
    ]);
    const central = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  });
  const centralStart = offset;
  const central = concatBytes(centralParts);
  const end = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(centralStart), u16(0)]);
  return concatBytes([...localParts, central, end]);
}

function xlsxWorkbookFiles(sheets) {
  const used = new Set();
  const namedSheets = sheets.map((sheet, idx) => ({ ...sheet, id: idx + 1, safeName: xlsxSafeSheetName(sheet.name, used) }));
  const sheetEntries = namedSheets.map(s => `<sheet name="${xlsxEsc(s.safeName)}" sheetId="${s.id}" r:id="rId${s.id}"/>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${namedSheets.map(s => `<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${namedSheets.map(s => `<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return [
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/styles.xml", data: styles },
    ...namedSheets.map(s => ({ name: `xl/worksheets/sheet${s.id}.xml`, data: xlsxWorksheet(s.rows) }))
  ];
}

function downloadXlsx(filename, sheets) {
  const bytes = zipStore(xlsxWorkbookFiles(sheets));
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(filename, blob);
}

const PDF_PORTFOLIO_CATEGORY_FACTORS = {
  motorway_plaza: { label: "Motorway / plaza", relevance: 0.35, capture: 0.22, targetSessionsPer1000Aadt: 0.32, effectiveAadtCap: 45000 },
  retail: { label: "Retail park / shopping centre", relevance: 0.30, capture: 0.20, targetSessionsPer1000Aadt: 1.20, effectiveAadtCap: 20000 },
  urban_service: { label: "Urban service station", relevance: 0.22, capture: 0.16, targetSessionsPer1000Aadt: 0.19, highPlugTargetSessionsPer1000Aadt: 0.36, effectiveAadtCap: 35000 },
  hotel_destination: { label: "Hotel / destination", relevance: 0.12, capture: 0.12, targetSessionsPer1000Aadt: 0.34, effectiveAadtCap: 12000, destinationMonthlyFloorKwh: 3000, destinationFloorMaxAadt: 10000 },
  local_community: { label: "Local / community", relevance: 0.06, capture: 0.08, targetSessionsPer1000Aadt: 0.06, effectiveAadtCap: 120000 },
  review: { label: "Review", relevance: 0.24, capture: 0.16, targetSessionsPer1000Aadt: 0.80, effectiveAadtCap: 20000 }
};

function pdfPortfolioToken(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function pdfPortfolioCategoryKey(site) {
  const n = String(site?.name || "").toLowerCase();
  if (site?.categoryKey && PDF_PORTFOLIO_CATEGORY_FACTORS[site.categoryKey]) return site.categoryKey;
  if (/(mallow plaza|tullamore|athlone|rhu glenn|junction 20)/.test(n)) return "motorway_plaza";
  if (/(retail|shopping|cope|supervalu|southgate|newbridge|leopardstown|axis)/.test(n)) return "retail";
  if (/(hotel|brehon|greenhills|charleville|castletroy|newtown)/.test(n)) return "hotel_destination";
  if (/(corrib|circle k|centra|walsh|dungarvan|fermoy|tralee|roscommon)/.test(n)) return "urban_service";
  if (/(afc|community|gaa|sports)/.test(n)) return "local_community";
  return "review";
}
function pdfPortfolioMaturityLabel(tier) { return tier === "mature" ? "Mature" : tier === "near" ? "Near-mature" : tier === "early" ? "Early" : "Review"; }
function pdfPortfolioMaturityRamp(site) { return site?.maturity?.tier === "early" ? 0.60 : site?.maturity?.tier === "near" ? 0.90 : 1; }
function pdfPortfolioProfile(site) {
  const categoryKey = pdfPortfolioCategoryKey(site);
  const category = PDF_PORTFOLIO_CATEGORY_FACTORS[categoryKey] || PDF_PORTFOLIO_CATEGORY_FACTORS.review;
  const plugs = Number(site?.modelEquivalentPlugs || 0);
  const targetSessionsPer1000Aadt = categoryKey === "urban_service" && plugs >= 4 ? Number(category.highPlugTargetSessionsPer1000Aadt || category.targetSessionsPer1000Aadt || 0) : Number(category.targetSessionsPer1000Aadt || 0);
  const rawAadt = Number(site?.aadt || 0);
  const effectiveAadtCap = Number(category.effectiveAadtCap || rawAadt || 0);
  const effectiveAadt = effectiveAadtCap > 0 ? Math.min(rawAadt, effectiveAadtCap) : rawAadt;
  return { categoryKey, category, targetSessionsPer1000Aadt, rawAadt, effectiveAadt, maturityRamp: pdfPortfolioMaturityRamp(site) };
}
function pdfPortfolioCalibratedMonthly(site, inputs = DEFAULT_INPUTS) {
  const profile = pdfPortfolioProfile(site);
  const sessionEnergy = Number(inputs.averageSessionEnergy || DEFAULT_INPUTS.averageSessionEnergy || 30.4);
  const targetDailySessions = profile.effectiveAadt > 0 ? (profile.effectiveAadt / 1000) * profile.targetSessionsPer1000Aadt * profile.maturityRamp : 0;
  let modelSessions = Math.max(0, targetDailySessions * 30);
  let modelKwh = Math.max(0, modelSessions * sessionEnergy);
  const destinationFloorKwh = Number(profile.category.destinationMonthlyFloorKwh || 0);
  const destinationFloorMaxAadt = Number(profile.category.destinationFloorMaxAadt || Infinity);
  if (destinationFloorKwh > 0 && profile.rawAadt <= destinationFloorMaxAadt && modelKwh < destinationFloorKwh) {
    modelKwh = destinationFloorKwh;
    modelSessions = sessionEnergy > 0 ? modelKwh / sessionEnergy : modelSessions;
  }
  return { ...profile, modelKwh, modelSessions };
}
function pdfPortfolioScenario(site) {
  const key = pdfPortfolioCategoryKey(site);
  const factor = PDF_PORTFOLIO_CATEGORY_FACTORS[key] || PDF_PORTFOLIO_CATEGORY_FACTORS.review;
  return { ...DEFAULT_INPUTS, modelStartYear: 2025, codYear: 2025, trafficSourceYear: 2025, siteAddress: site.address || site.name, rawCorridorTrafficAadt: Number(site.aadt || 0), averageSessionEnergy: DEFAULT_INPUTS.averageSessionEnergy, siteRelevanceFactor: factor.relevance, siteCaptureRate: factor.capture, siteLimitationFactor: DEFAULT_INPUTS.siteLimitationFactor, annualBevShareGrowthRate: DEFAULT_INPUTS.annualBevShareGrowthRate, fastChargePropensity: DEFAULT_INPUTS.fastChargePropensity, peakWindowShare: DEFAULT_INPUTS.peakWindowShare, peakHourShareWithinPeakWindow: DEFAULT_INPUTS.peakHourShareWithinPeakWindow, rampUpYear1: DEFAULT_INPUTS.rampUpYear1, rampUpYear2: DEFAULT_INPUTS.rampUpYear2 };
}
function pdfPortfolioMetrics(site) {
  const actual = site?.actual || {};
  const actualKwh = Number(actual.rolling30Kwh || 0);
  const actualSessions = Number(actual.rolling30Sessions || 0);
  const dailyKwh = Number(actual.dailyKwh || (actualKwh > 0 ? actualKwh / 30 : 0));
  const dailySessions = Number(actual.dailySessions || (actualSessions > 0 ? actualSessions / 30 : 0));
  const aadt = Number(site?.aadt || 0);
  const plugs = Number(site?.modelEquivalentPlugs || 0);
  const micKva = Number(site?.realMicKva || 0);
  return { dailyKwh, dailySessions, annualisedKwh: dailyKwh * 365, avgKwhSession: actualSessions > 0 ? actualKwh / actualSessions : Number(DEFAULT_INPUTS.averageSessionEnergy || 30.4), sessionsPer1000Aadt: aadt > 0 ? dailySessions / (aadt / 1000) : null, kwhPerPlugDay: plugs > 0 ? dailyKwh / plugs : null, kwhPerKvaDay: micKva > 0 ? dailyKwh / micKva : null };
}
function pdfPortfolioAnnualValues(site, metrics = pdfPortfolioMetrics(site)) {
  const actual = site?.actual || {};
  const annualKwh = Number(actual.annualKwh || 0) > 0 ? Number(actual.annualKwh) : Number(metrics.annualisedKwh || 0);
  return { annualKwh };
}
function pdfPortfolioDoNothing(site, metrics, derived, inputs) {
  const startYear = Number(inputs?.modelStartYear || 2025);
  const installedOutputs = Math.max(0, Number(derived?.installedOutputs || site?.modelEquivalentPlugs || 0));
  const installedPowerKw = Math.max(0, Number(derived?.installedChargerPowerKw || 0));
  const micKva = Math.max(0, Number(site?.realMicKva || inputs?.selectedMicKva || 0));
  const gridPowerKw = micKva * Number(inputs?.powerFactor || DEFAULT_INPUTS.powerFactor || 0.98);
  const annualTrafficGrowth = Number(inputs?.annualTrafficGrowthRate ?? DEFAULT_INPUTS.annualTrafficGrowthRate ?? 0.01);
  const annualBevGrowth = Number(inputs?.annualBevShareGrowthRate ?? DEFAULT_INPUTS.annualBevShareGrowthRate ?? 0.18);
  const bevStart = Math.max(0.0001, Number(inputs?.onRoadBevShareAtCod ?? DEFAULT_INPUTS.onRoadBevShareAtCod ?? 0.04));
  const bevCap = Math.max(bevStart, Number(inputs?.bevShareCap ?? DEFAULT_INPUTS.bevShareCap ?? 0.25));
  const baseFleetPower = Number(inputs?.baseFleetPlanningPower || DEFAULT_INPUTS.baseFleetPlanningPower || 60);
  const sessionEnergy = Number(metrics?.avgKwhSession || inputs?.averageSessionEnergy || DEFAULT_INPUTS.averageSessionEnergy || 30.4);
  const overhead = Number(inputs?.plugInOverstayOverheadHours || DEFAULT_INPUTS.plugInOverstayOverheadHours || 0.03);
  const peakShare = Number(inputs?.peakWindowShare || DEFAULT_INPUTS.peakWindowShare || 0.50);
  const peakHourShare = Number(inputs?.peakHourShareWithinPeakWindow || DEFAULT_INPUTS.peakHourShareWithinPeakWindow || 0.25);
  const designFloor = Number(inputs?.designPeakFloorSessions || DEFAULT_INPUTS.designPeakFloorSessions || 1);
  let techUplift = 1;
  let durationUplift = 1;
  let firstPlugYear = null, firstMicYear = null, firstChargerYear = null, firstConstraintYear = null;
  for (let t = 0; t < 20; t += 1) {
    if (t > 0) {
      const techRate = t <= 10 ? Number(inputs?.techUpliftEarlyPhaseRate ?? DEFAULT_INPUTS.techUpliftEarlyPhaseRate ?? 0.025) : Number(inputs?.techUpliftMiddlePhaseRate ?? DEFAULT_INPUTS.techUpliftMiddlePhaseRate ?? 0.01);
      const techCap = Number(inputs?.techUpliftCap ?? DEFAULT_INPUTS.techUpliftCap ?? 1.25);
      const durationResponse = Number(inputs?.durationResponseFactor ?? DEFAULT_INPUTS.durationResponseFactor ?? 0.4);
      techUplift = Math.min(techCap, techUplift * (1 + techRate));
      durationUplift = Math.min(techCap, durationUplift * (1 + techRate * durationResponse));
    }
    const bevFuture = Math.min(bevCap, bevStart * Math.pow(1 + annualBevGrowth, t));
    const growthFactor = Math.pow(1 + annualTrafficGrowth, t) * (bevFuture / bevStart);
    const dailySessions = Math.max(0, Number(metrics?.dailySessions || 0) * growthFactor);
    const fleetPowerKw = baseFleetPower * techUplift;
    const sessionDurationHrs = sessionEnergy / Math.max(1, fleetPowerKw / durationUplift) + overhead;
    const peakConcurrentSessions = Math.max(designFloor, dailySessions * peakShare * peakHourShare * sessionDurationHrs);
    const peakDemandKw = peakConcurrentSessions * fleetPowerKw;
    const plugPlanningTrigger = installedOutputs > 0 && peakConcurrentSessions > installedOutputs * 0.80;
    const micPlanningTrigger = gridPowerKw > 0 && peakDemandKw > gridPowerKw * 0.90;
    const chargerPlanningTrigger = installedPowerKw > 0 && peakDemandKw > installedPowerKw * 0.90;
    const capacityRatio = Math.min(installedOutputs > 0 ? Math.min(1, installedOutputs / Math.max(1, peakConcurrentSessions)) : 0, gridPowerKw > 0 ? Math.min(1, gridPowerKw / Math.max(1, peakDemandKw)) : 0, installedPowerKw > 0 ? Math.min(1, installedPowerKw / Math.max(1, peakDemandKw)) : 0);
    if (!firstPlugYear && plugPlanningTrigger) firstPlugYear = startYear + t;
    if (!firstMicYear && micPlanningTrigger) firstMicYear = startYear + t;
    if (!firstChargerYear && chargerPlanningTrigger) firstChargerYear = startYear + t;
    if (!firstConstraintYear && (capacityRatio < 0.98 || plugPlanningTrigger || micPlanningTrigger || chargerPlanningTrigger)) firstConstraintYear = startYear + t;
  }
  const firstPlanningYear = [firstPlugYear, firstMicYear, firstChargerYear].filter(Boolean).sort((a,b)=>a-b)[0] || null;
  const firstActionYear = [firstConstraintYear, firstPlanningYear].filter(Boolean).sort((a,b)=>a-b)[0] || null;
  const triggerDrivers = [firstPlugYear === firstActionYear ? "plug utilisation" : "", firstMicYear === firstActionYear ? "MIC/grid power" : "", firstChargerYear === firstActionYear ? "charger output" : ""].filter(Boolean);
  return { startYear, firstActionYear, triggerDrivers };
}
function pdfPortfolioResult(site) {
  const inputs = pdfPortfolioScenario(site);
  const config = { ...DEFAULT_SELECTED_CONFIG, ...site.modelConfig };
  const demand = calculateDemand(inputs);
  const yy = calculateYearByYear(inputs, config, demand);
  const metrics = pdfPortfolioMetrics(site);
  const actual = pdfPortfolioAnnualValues(site, metrics);
  const cal = pdfPortfolioCalibratedMonthly(site, inputs);
  const annualScale = 365 / 30;
  const modelAnnual = Number(cal.modelKwh || 0) * annualScale;
  const variance = actual.annualKwh > 0 ? (modelAnnual - actual.annualKwh) / actual.annualKwh : null;
  const doNothing = pdfPortfolioDoNothing(site, metrics, yy.derived, inputs);
  const tier = site.maturity?.tier || "review";
  const aadtReview = ["medium_low", "review"].includes(pdfPortfolioToken(site.aadtConfidence));
  let status = "In benchmark";
  if (tier === "early") status = "Ramp-up";
  if (aadtReview || pdfPortfolioCategoryKey(site) === "review") status = "Review";
  if (doNothing.firstActionYear && doNothing.firstActionYear <= doNothing.startYear + 5) status = "Capacity pressure";
  if (tier !== "early" && variance > 0.20) status = "Under-capturing";
  if (tier !== "early" && variance < -0.20 && status !== "Capacity pressure") status = "Outperforming";
  return { site, category: pdfPortfolioProfile(site).category.label, maturity: pdfPortfolioMaturityLabel(tier), actualAnnualKwh: actual.annualKwh, modelledAnnualKwh: modelAnnual, annualVariance: variance, status, triggerYear: doNothing.firstActionYear || "Monitor" };
}
function portfolioExportRows(limit = 32) {
  return PORTFOLIO_CALIBRATION_SITES.map(pdfPortfolioResult).sort((a,b) => String(a.site.name).localeCompare(String(b.site.name))).slice(0, limit);
}
function portfolioPdfTableRows(limit = 32) {
  return portfolioExportRows(limit).map(r => [esc(r.site.name), esc(r.maturity), esc(r.category), `${number(r.site.realMicKva,0)} kVA`, number(r.site.aadt,0), kwh(r.actualAnnualKwh,0), kwh(r.modelledAnnualKwh,0), Number.isFinite(r.annualVariance) ? pct(r.annualVariance,1) : "—", esc(r.status)]);
}
function portfolioXlsxRows() {
  return [["Site", "Maturity", "Category", "MIC kVA", "AADT", "Actual kWh/yr", "Model kWh/yr", "Variance", "Status", "Action year"], ...portfolioExportRows().map(r => [r.site.name, r.maturity, r.category, Number(r.site.realMicKva || 0), Number(r.site.aadt || 0), r.actualAnnualKwh, r.modelledAnnualKwh, Number.isFinite(r.annualVariance) ? r.annualVariance : "", r.status, r.triggerYear])];
}

export function exportDemandCsv(demand) {
  downloadText("ev_hub_demand_model.csv", toCsv(demand.years), "text/csv;charset=utf-8");
}

export function exportYearByYearCsv(yearByYear) {
  downloadText("ev_hub_year_by_year.csv", toCsv(yearByYear.rows), "text/csv;charset=utf-8");
}

export function exportScenarioCsv(compare) {
  const rows = compare.scenarios.map(s => ({
    rank: s.rank || "",
    scenario: s.name,
    platform: s.config.platform,
    mic: s.config.selectedMicKva,
    battery: s.config.batterySize,
    validityStatus: s.validityStatus,
    feasibilityStatus: s.feasibilityStatus,
    totalCapex: s.totalCapex,
    totalOpex: s.totalOpex,
    totalCostToServeDemand: s.totalCostToServeDemand,
    cumulativeCashFlow: s.cumulativeCashFlow,
    roi: s.roi,
    breakEvenYear: s.breakEvenYear || "",
    npv: s.npv,
    irr: s.irr,
    servedDemandPercentage: s.servedDemandPercentage,
    lostDemand: s.lostDemand,
    lostRevenue: s.lostRevenue,
    failureReason: s.failureReason
  }));
  downloadText("ev_hub_scenario_comparison.csv", toCsv(rows), "text/csv;charset=utf-8");
}

export function exportAssumptionsJson(state) {
  downloadText("ev_hub_assumptions.json", JSON.stringify({
    exportedAt: new Date().toISOString(),
    inputs: state.inputs,
    config: state.config,
    site: state.siteContext
  }, null, 2), "application/json;charset=utf-8");
}

export function exportAuditJson(state, results) {
  downloadText("ev_hub_audit_log.json", JSON.stringify({
    exportedAt: new Date().toISOString(),
    selectedSite: state.siteContext,
    assumptions: state.inputs,
    technicalConfiguration: state.config,
    demandSummary: results.demand,
    financialSummary: results.financialSummary,
    scenarioComparison: results.compare
  }, null, 2), "application/json;charset=utf-8");
}

export function exportAnnualFinancialsExcel(state, results) {
  const rows = results.yearByYear.rows.slice(0, state.inputs.investmentHorizon);
  const financial = results.financialSummary;
  const recommended = results.compare.recommended;
  const summaryRows = [
    ["Metric", "Value"],
    ["Site", state.inputs.siteAddress],
    ["Investment horizon", state.inputs.investmentHorizon + " years"],
    ["Selected platform", state.config.platform],
    ["Selected MIC kVA", Number(state.config.selectedMicKva || 0)],
    ["Selected battery", state.config.batterySize || "No battery"],
    ["Recommended scenario", recommended?.name || "No feasible scenario"],
    ["Cumulative cash flow", Number(financial.cumulativeCashFlow || 0)],
    ["ROI", Number.isFinite(financial.roi) ? financial.roi : ""],
    ["Break-even year", financial.breakEvenYear || "Not within horizon"]
  ];
  const annualRows = [["Year","Sessions served","Delivered kWh","Revenue","Electricity cost","Gross profit","Total opex","Annual cash flow","Cumulative cash flow"],
    ...rows.map(r => [
      r.year,
      Number(r.sessionsServed || 0),
      Number(r.deliveredEnergyServedKwh || 0),
      Number(r.totalRevenue || 0),
      Number(r.electricityCost || 0),
      Number(r.grossProfit || 0),
      Number(r.totalOperatingCosts || 0),
      Number(r.annualCashFlow || 0),
      Number(r.cumulativeCashFlow || 0)
    ])
  ];
  const technicalRows = [ANNUAL_TECH_HEADERS, ...rows.map(r => [
    r.year,
    Number(r.peakDemandRequiredKw || 0),
    Number(r.selectedMicKva || 0),
    Number(r.installedBatteryUnits || 0),
    Number(r.installedBatteryUnits ? r.batterySohEnd || 0 : 0),
    Number(r.batteryEnergyAvailableKwhSohAdjusted || 0),
    Number(r.batteryPowerDeficitKw || 0),
    Number(r.batteryEnergyDeficitKwh || 0),
    r.batteryReplacementTrigger ? "Battery replacement" : "",
    r.chargerReplacementTrigger ? "Charger replacement" : "",
    r.augmentationFlag ? "Battery deployment / augmentation" : "",
    Number((r.batteryReplacementCapex || 0) + (r.chargerReplacementCapex || 0) + (r.augmentationCapex || 0))
  ])];
  const scenarioRows = [["Scenario","Platform","MIC kVA","Battery","ROI","Cumulative cash flow","Break-even","Status"],
    ...results.compare.scenarios.map(s => [
      s.name,
      s.config.platform,
      Number(s.config.selectedMicKva || 0),
      s.config.batterySize || "No battery",
      Number.isFinite(s.roi) ? s.roi : "",
      Number(s.cumulativeCashFlow || 0),
      s.breakEvenYear || "Not within horizon",
      s.feasibilityStatus
    ])
  ];
  downloadXlsx("ev_hub_annual_financials.xlsx", [
    { name: "Investment Summary", rows: summaryRows },
    { name: "Annual Financials", rows: annualRows },
    { name: "Annual Technical Detail", rows: technicalRows },
    { name: "Scenario Ranking", rows: scenarioRows },
    { name: "Portfolio Calibration", rows: portfolioXlsxRows() }
  ]);
}

export async function exportInvestorPdf(state, results) {
  const d = results.demand;
  const f = results.financialSummary;
  const y = results.yearByYear;
  const rec = results.compare.recommended;
  const ctx = getReportCtx(state);
  const lat = getSiteLat(ctx);
  const lon = getSiteLon(ctx);
  const horizonRows = y.rows.slice(0, state.inputs.investmentHorizon);
  const annualChartRows = annualFinancialChartRows(horizonRows);
  const demandChartRows = d.years.slice(0, 20).map(r => ({
    ...r,
    annualPeakWindowSessions: (r.annualSessionsDemanded || 0) * state.inputs.peakWindowShare,
    annualNonPeakSessions: (r.annualSessionsDemanded || 0) * (1 - state.inputs.peakWindowShare),
    annualPeakWindowKwh: (r.annualEnergyDemandedKwh || 0) * state.inputs.peakWindowShare,
    annualNonPeakKwh: (r.annualEnergyDemandedKwh || 0) * (1 - state.inputs.peakWindowShare)
  }));

  const annualTechnicalTableRows = annualTechnicalRows(horizonRows);

  const annualTableRows = horizonRows.map(r => [
    r.year,
    number(r.sessionsServed, 0),
    number(r.deliveredEnergyServedKwh, 0),
    currency(r.totalRevenue, 0),
    currency(r.electricityCost, 0),
    currency(r.grossProfit, 0),
    currency(r.totalOperatingCosts, 0),
    currency(r.annualCashFlow, 0),
    currency(r.cumulativeCashFlow, 0)
  ]);

  const demandRows = d.years.slice(0, 20).map(r => [
    r.year,
    pct(r.bevShare, 1),
    number(r.bevDailyTraffic, 0),
    number(r.annualSessionsDemanded, 0),
    number(r.annualEnergyDemandedKwh, 0),
    kva(r.requiredMicNoBatteryKva, 0)
  ]);

  const chargerSummary = (ctx.chargers || []).slice(0, 8).map(c => [
    esc(c.name),
    esc(c.operator || "—"),
    `${number(c.distance_km, 2)} km`,
    esc(c.source || "—")
  ]);

  const scenarioTableRows = scenarioRows(results.compare);
  const portfolioTableRows = portfolioPdfTableRows(32);
  const capexRows = (f.capexEvents || []).map(e => [e.year, currency(e.amount, 0), esc(e.reason)]);
  const technicalStatus = results.yearByYear.technical.feasible
    ? "Configuration is technically feasible under the model checks."
    : (results.yearByYear.technical.failures || []).join("; ");

  const demandCharts = [
    lineChart("reportBevTrafficChart", demandChartRows, "year", [{ key: "bevDailyTraffic", label: "Relevant BEV traffic" }], { title: "Relevant BEV traffic growth by year" }),
    stackedBarChart("reportDemandSessionsChart", demandChartRows, "year", [{ key: "annualPeakWindowSessions", label: "Peak-window sessions" }, { key: "annualNonPeakSessions", label: "Non-peak sessions" }], { title: "Demanded charging sessions by year" }),
    stackedBarChart("reportDemandKwhChart", demandChartRows, "year", [{ key: "annualPeakWindowKwh", label: "Peak-window kWh" }, { key: "annualNonPeakKwh", label: "Non-peak kWh" }], { title: "Demanded kWh by year" }),
    lineChart("reportRequiredMicChart", demandChartRows, "year", [{ key: "requiredMicNoBatteryKva", label: "Required MIC no battery" }], { title: "Required MIC by year" })
  ].join("");

  const investmentChart = financeComboChart("reportCashflowBreakEvenChart", horizonRows, {
    title: "Cash flow and break-even over the selected horizon",
    bars: [{ key: "annualCashFlow", label: "Annual cash flow" }],
    lines: [{ key: "cumulativeCashFlow", label: "Cumulative cash flow" }]
  });

  const annualCharts = [
    financeComboChart("reportAnnualPerformanceTrend", annualChartRows, {
      title: "Annual performance trend",
      bars: [{ key: "annualCashFlow", label: "Annual cash flow" }],
      lines: [{ key: "totalRevenue", label: "Revenue" }, { key: "grossProfit", label: "Gross profit" }, { key: "cumulativeCashFlow", label: "Cumulative cash flow" }]
    }),
    stackedBarChart("reportAnnualCostBreakdown", annualChartRows, "year", [
      { key: "electricityCost", label: "Electricity cost" },
      { key: "totalOperatingCosts", label: "Operating costs" },
      { key: "additionalCapex", label: "Replacement / augmentation capex" }
    ], { title: "Annual cost breakdown" })
  ].join("");

  const report = `
  <section class="print-page cover-page">
    <div class="report-hero">
      <div>
        <img class="report-logo" src="./assets/epower-logo.png" alt="ePower" />
        <div class="eyebrow">Investor report</div>
        <h1>EV Charging Hub Investment Tool</h1>
        <p>${esc(state.inputs.siteAddress)} · exported ${esc(new Date().toLocaleString("en-IE"))}</p>
      </div>
      <div class="report-grid">
        ${reportMetric("Model start year", esc(state.inputs.modelStartYear || state.inputs.codYear))}
        ${reportMetric("Investment horizon", `${esc(state.inputs.investmentHorizon)} years`)}
        ${reportMetric("Selected platform", esc(state.config.platform))}
        ${reportMetric("Selected MIC", kva(state.config.selectedMicKva, 0))}
      </div>
    </div>
    <h2>1. Site Screening</h2>
    <div class="report-grid">
      ${reportMetric("AADT used", number(state.inputs.rawCorridorTrafficAadt, 0))}
      ${reportMetric("Traffic source", esc(ctx.traffic?.source || "Base / manual input"))}
      ${reportMetric("Nearby sites", number((ctx.chargers || []).length, 0))}
      ${reportMetric("Latitude", number(lat, 5))}
      ${reportMetric("Longitude", number(lon, 5))}
      ${reportMetric("Search radius", `${number(state.filters?.radiusKm || 0, 1)} km`)}
    </div>
    ${mapPanelHtml(state, ctx)}
    <div class="panel">
      <h3>Nearby charging sites</h3>
      ${htmlTable(["Site", "Operator", "Distance", "Source"], chargerSummary)}
    </div>
  </section>

  <section class="print-page">
    <h2>2. Demand Forecast</h2>
    <div class="report-grid">
      ${reportMetric("Required MIC no battery", kva(d.maxRequiredMicNoBatteryKva, 0))}
      ${reportMetric("Max concurrent sessions", number(d.maxConcurrentSessions, 1))}
      ${reportMetric("20-year demanded energy", kwh(d.totalDemandedEnergyKwh, 0))}
      ${reportMetric("Year 1 demanded sessions", number(d.years?.[0]?.annualSessionsDemanded || 0, 0))}
      ${reportMetric("Peak-window share", pct(state.inputs.peakWindowShare, 0))}
      ${reportMetric("Average session energy", kwh(state.inputs.averageSessionEnergy, 0))}
    </div>
    <div class="report-chart-grid two">${demandCharts}</div>
    <div class="panel">
      <h3>Demand model table</h3>
      ${htmlTable(["Year", "BEV share", "Relevant BEV traffic", "Demanded sessions", "Demanded kWh", "Required MIC"], demandRows)}
    </div>
  </section>

  <section class="print-page">
    <h2>3. Product Configuration</h2>
    <div class="report-grid">
      ${reportMetric("Platform", esc(state.config.platform))}
      ${reportMetric("Battery", esc(state.config.batterySize || "No battery"))}
      ${reportMetric("Selected MIC", kva(state.config.selectedMicKva, 0))}
      ${reportMetric("Selling price", currency(state.inputs.netSellingPriceExVat, 3) + "/kWh")}
      ${reportMetric("Electricity cost", currency(state.inputs.electricityCost, 3) + "/kWh")}
      ${reportMetric("Grant support", currency(state.inputs.grantSupport, 0))}
    </div>
    <div class="panel">
      <h3>Configuration validator</h3>
      <p>${esc(technicalStatus)}</p>
      ${reportValidationChecklist(results, state)}
    </div>
  </section>

  <section class="print-page">
    <h2>4. Investment Case</h2>
    <div class="report-grid">
      ${reportMetric("Initial investment", currency(f.grossInitialInvestmentBeforeGrant, 0))}
      ${reportMetric("Net initial investment", currency(f.initialInvestment, 0))}
      ${reportMetric("Total capex", currency(f.totalCapex, 0))}
      ${reportMetric("Cumulative cash flow", currency(f.cumulativeCashFlow, 0))}
      ${reportMetric("ROI", Number.isFinite(f.roi) ? pct(f.roi, 1) : "—")}
      ${reportMetric("Break-even", f.breakEvenYear || "Not within horizon")}
    </div>
    <div class="report-chart-grid">${investmentChart}</div>
    <div class="panel">
      <h3>Capex deployment years</h3>
      ${htmlTable(["Year", "Amount", "Reason"], capexRows)}
    </div>
  </section>

  <section class="print-page">
    <h2>5. Annual Financials</h2>
    <div class="report-grid">
      ${reportMetric("Total sessions served", number(horizonRows.reduce((a, r) => a + (r.sessionsServed || 0), 0), 0))}
      ${reportMetric("Total delivered energy", kwh(f.lifetimeKwhDelivered, 0))}
      ${reportMetric("Total revenue", currency(f.totalRevenue, 0))}
      ${reportMetric("Cumulative cash flow", currency(f.cumulativeCashFlow, 0))}
    </div>
    <div class="report-chart-grid">${annualCharts}</div>
    <div class="panel">
      <h3>Annual financial table</h3>
      ${htmlTable(["Year", "Sessions served", "Delivered kWh", "Revenue", "Electricity cost", "Gross profit", "Total opex", "Annual cash flow", "Cumulative cash flow"], annualTableRows)}
    </div>
    <div class="panel">
      <h3>Annual technical detail</h3>
      <p class="report-caption">Shows why lifecycle capex is deployed: staged battery additions, SOH-adjusted usable kWh, battery replacement and charger replacement events.</p>
      ${htmlTable(ANNUAL_TECH_HEADERS, annualTechnicalTableRows)}
    </div>
  </section>


  <section class="print-page portfolio-page">
    <h2>6. Portfolio Calibration Benchmark</h2>
    <p class="report-caption">Annual actual performance is compared with the portfolio-calibrated model using each operating site's MIC, AADT, maturity and site category. Mature sites carry the highest benchmark confidence; early sites are directional.</p>
    <div class="panel">
      <h3>Operating hub benchmark table</h3>
      ${htmlTable(["Site", "Maturity", "Category", "MIC", "AADT", "Actual kWh/yr", "Model kWh/yr", "Variance", "Status"], portfolioTableRows)}
    </div>
  </section>

  <section class="print-page scenario-page">
    <h2>7. Scenario Ranking</h2>
    <div class="recommend-card">
      <div>
        <div class="eyebrow">Recommended configuration</div>
        <h3>${esc(rec?.name || "No feasible scenario")}</h3>
        <p>${esc(results.compare.explanation || "No feasible scenario could be recommended for the selected assumptions.")}</p>
      </div>
      <div class="recommend-metrics">
        ${reportMetric("Recommended MIC", rec ? kva(rec.config.selectedMicKva, 0) : "—")}
        ${reportMetric("Recommended battery", esc(rec?.config?.batterySize || "No battery"))}
        ${reportMetric("Recommended ROI", rec && Number.isFinite(rec.roi) ? pct(rec.roi, 1) : "—")}
        ${reportMetric("Cumulative cash flow", rec ? currency(rec.cumulativeCashFlow, 0) : "—")}
        ${reportMetric("Break-even", rec?.breakEvenYear || "Not within horizon")}
        ${reportMetric("Status", esc(rec?.feasibilityStatus || "No feasible scenario"))}
      </div>
    </div>
    <div class="panel" style="margin-top:18px">
      <h3>ROI ranking of scenarios</h3>
      ${htmlTable(["ROI rank", "Scenario", "Platform", "MIC", "Battery", "ROI", "Cumulative CF", "Break-even", "Status"], scenarioTableRows)}
    </div>
  </section>`;

  let container = document.getElementById("printReportContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "printReportContainer";
    container.className = "print-report";
    document.body.appendChild(container);
  }
  container.innerHTML = report;
  document.body.classList.add("print-mode");
  await waitForImages(container);
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove("print-mode"), 500);
  }, 250);
}

export function printInvestorMemo() {
  window.print();
}
