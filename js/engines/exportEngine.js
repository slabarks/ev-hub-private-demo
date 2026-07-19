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

function xlsxWorksheet(rows, options = {}) {
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
  const shouldFilter = options.autoFilter !== false && cleanRows.length > 1 && maxCols > 1;
  const filterRef = shouldFilter ? `<autoFilter ref="A1:${xlsxColName(maxCols - 1)}${cleanRows.length}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols}<sheetData>${sheetData}</sheetData>${filterRef}</worksheet>`;
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
    ...namedSheets.map(s => ({ name: `xl/worksheets/sheet${s.id}.xml`, data: xlsxWorksheet(s.rows, s) }))
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

const PDF_PORTFOLIO_CURATOR_MODIFIER_CAPS = { min: 0.70, max: 1.50 };
const PDF_PORTFOLIO_CURATED_SITE_PROFILES = {
  "the_cope_shopping_centre": { active: true, confidence: "Medium", source: "Curated known-site review", modifiers: { catchment: { value: 1.00, label: "Normal", reason: "Selected AADT retained." }, competition: { value: 1.00, label: "Not yet quantified", reason: "No competition uplift applied yet." }, destination: { value: 1.30, label: "Strong retail destination", reason: "Strong retail/shopping destination behaviour." }, access: { value: 1.00, label: "Normal", reason: "No access modifier." } }, note: "Reviewed retail destination-strength modifier applied." },
  "greenhills_hotel": { active: true, confidence: "Medium", source: "Curated known-site review", modifiers: { catchment: { value: 1.00, label: "Normal", reason: "Base hotel catchment retained." }, competition: { value: 1.00, label: "Not yet quantified", reason: "No competition uplift applied yet." }, destination: { value: 1.25, label: "Strong hotel destination", reason: "Stronger hotel/public destination behaviour." }, access: { value: 1.00, label: "Normal", reason: "No access modifier." } }, note: "Reviewed hotel destination-strength modifier applied." },
  "walsh_s_centra_service_station_roscommon": { active: true, confidence: "Medium", source: "Curated known-site review", modifiers: { catchment: { value: 1.25, label: "Strong town catchment", reason: "Town/local catchment stronger than single AADT counter." }, competition: { value: 1.00, label: "Not yet quantified", reason: "No competition uplift applied yet." }, destination: { value: 1.00, label: "Normal", reason: "No destination modifier." }, access: { value: 1.00, label: "Normal", reason: "No access modifier." } }, note: "Reviewed town-catchment modifier applied." },
  "corrib_oil_cork_city": { active: true, confidence: "Medium-low", source: "Curated known-site review", modifiers: { catchment: { value: 1.50, label: "Multi-corridor urban catchment", reason: "Selected AADT likely captures only part of accessible Cork catchment." }, competition: { value: 1.00, label: "Not yet quantified", reason: "No competition uplift applied yet." }, destination: { value: 1.00, label: "Normal", reason: "No destination modifier." }, access: { value: 1.00, label: "Normal", reason: "No access modifier." } }, note: "Conservative multi-corridor catchment modifier applied and capped." },
  "corrib_oil_swinford": { active: true, confidence: "Medium-low", source: "Curated known-site review", modifiers: { catchment: { value: 1.50, label: "Strong town catchment", reason: "Town catchment stronger than selected approach-counter average." }, competition: { value: 1.00, label: "Not yet quantified", reason: "No competition uplift applied yet." }, destination: { value: 1.00, label: "Normal", reason: "No destination modifier." }, access: { value: 1.00, label: "Normal", reason: "No access modifier." } }, note: "Conservative strong-town-catchment modifier applied and capped." }
};
function pdfPortfolioCuratorKey(site) { return pdfPortfolioToken(site?.name || ""); }
function pdfPortfolioCuratorProfile(site) {
  const defaults = {
    catchment: { value: 1.00, label: "Normal", reason: "No curated catchment modifier applied." },
    competition: { value: 1.00, label: "Not reviewed", reason: "No reviewed competition modifier applied." },
    destination: { value: 1.00, label: "Normal", reason: "No curated destination modifier applied." },
    access: { value: 1.00, label: "Normal", reason: "No curated access/visibility modifier applied." }
  };
  const reviewed = site?.curatorProfile || PDF_PORTFOLIO_CURATED_SITE_PROFILES[pdfPortfolioCuratorKey(site)] || null;
  const modifiers = { ...defaults };
  if (reviewed?.modifiers) Object.entries(reviewed.modifiers).forEach(([name, value]) => { modifiers[name] = { ...(defaults[name] || { value: 1, label: "Normal", reason: "" }), ...value }; });
  const combinedRaw = Object.values(modifiers).reduce((acc, item) => acc * Number(item.value || 1), 1);
  const combined = Math.max(PDF_PORTFOLIO_CURATOR_MODIFIER_CAPS.min, Math.min(PDF_PORTFOLIO_CURATOR_MODIFIER_CAPS.max, combinedRaw));
  const active = Boolean(reviewed?.active) && Math.abs(combined - 1) > 0.0001;
  return { active, modifiers, combinedRaw, combined: active ? combined : 1, appliedMultiplier: active ? combined : 1, confidence: reviewed?.confidence || "Neutral", source: reviewed?.source || "Curator framework default", note: reviewed?.note || "Neutral curator default; no reviewed modifier applied.", capped: active && Math.abs(combinedRaw - combined) > 0.0001 };
}
function pdfPortfolioCuratorNote(curator) {
  if (!curator?.active) return "Neutral 1.00x curator default.";
  return `${Number(curator.appliedMultiplier || 1).toFixed(2)}x ${curator.source || "curated"}: ${curator.note || "reviewed modifier applied"}`;
}

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
const PDF_PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE = 0.15;
const PDF_PORTFOLIO_DAY_MS = 24 * 60 * 60 * 1000;
function pdfPortfolioParseDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : null;
}
function pdfPortfolioDateAddDays(date, days) { return new Date(date.getTime() + Number(days || 0) * PDF_PORTFOLIO_DAY_MS); }
function pdfPortfolioDateDiffDays(start, end) { return Math.round((end.getTime() - start.getTime()) / PDF_PORTFOLIO_DAY_MS); }
function pdfPortfolioYearRamp(inputs, yearIndex) {
  const y = Math.max(1, Math.round(Number(yearIndex || 1)));
  if (y === 1) return Number(inputs?.rampUpYear1 ?? DEFAULT_INPUTS.rampUpYear1 ?? 0.60);
  if (y === 2) return Number(inputs?.rampUpYear2 ?? DEFAULT_INPUTS.rampUpYear2 ?? 0.80);
  return 1;
}
function pdfPortfolioGrowthFactor(inputs, yearIndex) {
  const y = Math.max(1, Math.round(Number(yearIndex || 1)));
  const growthYears = Math.max(0, y - 3);
  const trafficGrowth = Number(inputs?.annualTrafficGrowthRate ?? DEFAULT_INPUTS.annualTrafficGrowthRate ?? 0.01);
  const bevGrowth = Number(inputs?.annualBevShareGrowthRate ?? DEFAULT_INPUTS.annualBevShareGrowthRate ?? 0.18);
  const bevStart = Math.max(0.0001, Number(inputs?.onRoadBevShareAtCod ?? DEFAULT_INPUTS.onRoadBevShareAtCod ?? 0.04));
  const bevCap = Math.max(bevStart, Number(inputs?.bevShareCap ?? DEFAULT_INPUTS.bevShareCap ?? 0.25));
  const bevFactor = Math.min(bevCap / bevStart, Math.pow(1 + bevGrowth, growthYears));
  return Math.pow(1 + trafficGrowth, growthYears) * bevFactor;
}
function pdfPortfolioProfile(site) {
  const categoryKey = pdfPortfolioCategoryKey(site);
  const category = PDF_PORTFOLIO_CATEGORY_FACTORS[categoryKey] || PDF_PORTFOLIO_CATEGORY_FACTORS.review;
  const plugs = Number(site?.modelEquivalentPlugs || 0);
  const targetSessionsPer1000Aadt = categoryKey === "urban_service" && plugs >= 4 ? Number(category.highPlugTargetSessionsPer1000Aadt || category.targetSessionsPer1000Aadt || 0) : Number(category.targetSessionsPer1000Aadt || 0);
  const rawAadt = Number(site?.aadt || 0);
  const effectiveAadtCap = Number(category.effectiveAadtCap || rawAadt || 0);
  const effectiveAadt = effectiveAadtCap > 0 ? Math.min(rawAadt, effectiveAadtCap) : rawAadt;
  return { categoryKey, category, targetSessionsPer1000Aadt, rawAadt, effectiveAadt, effectiveAadtCap };
}
function pdfPortfolioCalibratedAnnual(site, inputs = DEFAULT_INPUTS, yearIndex = 1) {
  const profile = pdfPortfolioProfile(site);
  const sessionEnergy = Number(inputs.averageSessionEnergy || DEFAULT_INPUTS.averageSessionEnergy || 30.4);
  const rampFactor = pdfPortfolioYearRamp(inputs, yearIndex);
  const growthFactor = pdfPortfolioGrowthFactor(inputs, yearIndex);
  const targetDailySessions = profile.effectiveAadt > 0 ? (profile.effectiveAadt / 1000) * profile.targetSessionsPer1000Aadt * rampFactor * growthFactor : 0;
  let modelSessions = Math.max(0, targetDailySessions * 365);
  let modelKwh = Math.max(0, modelSessions * sessionEnergy);
  const destinationMonthlyFloorKwh = Number(profile.category.destinationMonthlyFloorKwh || 0);
  const destinationFloorMaxAadt = Number(profile.category.destinationFloorMaxAadt || Infinity);
  const floorAnnualKwh = destinationMonthlyFloorKwh * 12 * rampFactor * growthFactor;
  if (floorAnnualKwh > 0 && profile.rawAadt <= destinationFloorMaxAadt && modelKwh < floorAnnualKwh) {
    modelKwh = floorAnnualKwh;
    modelSessions = sessionEnergy > 0 ? modelKwh / sessionEnergy : modelSessions;
  }
  const baseModelKwh = modelKwh;
  const baseModelSessions = modelSessions;
  const curator = pdfPortfolioCuratorProfile(site);
  const curatorMultiplier = Number(curator?.appliedMultiplier || 1);
  if (curator?.active && curatorMultiplier > 0) {
    modelKwh *= curatorMultiplier;
    modelSessions *= curatorMultiplier;
  }
  return { ...profile, yearIndex: Math.max(1, Math.round(Number(yearIndex || 1))), rampFactor, growthFactor, curator, curatorMultiplier, baseModelKwh, baseModelSessions, modelKwh, modelSessions };
}
function pdfPortfolioAnnualValues(site, metrics = pdfPortfolioMetrics(site)) {
  const actual = site?.actual || {};
  const annualKwh = Number(actual.annualKwh || 0) > 0 ? Number(actual.annualKwh) : Number(metrics.annualisedKwh || 0);
  const hasExplicitAnnual = Number(actual.annualKwh || 0) > 0;
  const diagnostics = site?.liveActuals?.diagnostics || {};
  const firstActiveDate = pdfPortfolioParseDate(diagnostics.firstActiveDate || actual.firstActiveDate);
  const latestDate = pdfPortfolioParseDate(diagnostics.latestDate || actual.asOfDate || site?.liveActuals?.asOfDate);
  const periodEnd = latestDate;
  const periodStart = hasExplicitAnnual && periodEnd ? pdfPortfolioDateAddDays(periodEnd, -364) : periodEnd ? pdfPortfolioDateAddDays(periodEnd, -29) : null;
  return { annualKwh, hasExplicitAnnual, periodStart, periodEnd, firstActiveDate, dataDays: Number(site?.maturity?.dataDays || 0) };
}
function pdfPortfolioFallbackYear(site, actual) {
  const explicit = Number(site?.maturity?.comparisonYearIndex || 0);
  if (explicit > 0) return Math.max(1, Math.min(20, Math.round(explicit)));
  const days = Number(actual?.dataDays || site?.maturity?.dataDays || 0);
  if (days >= 730) return 3;
  if (days >= 365) return 2;
  return 1;
}
function pdfPortfolioModelWeights(site, actual) {
  const fallbackYear = pdfPortfolioFallbackYear(site, actual);
  const first = actual?.firstActiveDate, start = actual?.periodStart, end = actual?.periodEnd;
  if (actual?.hasExplicitAnnual && first && start && end) {
    const weights = [];
    for (let y = 1; y <= 20; y += 1) {
      const ys = pdfPortfolioDateAddDays(first, (y - 1) * 365);
      const ye = pdfPortfolioDateAddDays(first, y * 365 - 1);
      const os = start.getTime() > ys.getTime() ? start : ys;
      const oe = end.getTime() < ye.getTime() ? end : ye;
      const overlapDays = pdfPortfolioDateDiffDays(os, oe);
      if (Number.isFinite(overlapDays) && overlapDays >= 0) weights.push({ yearIndex: y, days: overlapDays + 1 });
    }
    const total = weights.reduce((a,w)=>a+w.days,0);
    if (total > 0) {
      const weighted = weights.map(w => ({ ...w, weight: w.days / total }));
      return { weights: weighted, label: weighted.length === 1 ? `Model Year ${weighted[0].yearIndex}` : `Weighted ${weighted.map(w => `Y${w.yearIndex} ${Math.round(w.weight * 100)}%`).join(" / ")}` };
    }
  }
  return { weights: [{ yearIndex: fallbackYear, weight: 1 }], label: `Model Year ${fallbackYear}` };
}
function pdfPortfolioMatchedAnnualModel(site, inputs, actual) {
  const period = pdfPortfolioModelWeights(site, actual);
  const parts = period.weights.map(w => ({ ...w, estimate: pdfPortfolioCalibratedAnnual(site, inputs, w.yearIndex) }));
  const modelKwh = parts.reduce((a,p)=>a+p.estimate.modelKwh*p.weight,0);
  const profile = parts[0]?.estimate || pdfPortfolioCalibratedAnnual(site, inputs, 1);
  return { modelKwh, basis: period.label, profile, curator: profile.curator };
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

function pdfPortfolioAccuracyLabel(variance) {
  if (!Number.isFinite(variance)) return "No actual";
  const abs = Math.abs(variance);
  if (abs <= 0.10) return "Excellent fit";
  if (abs <= PDF_PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE) return "In benchmark";
  if (abs <= 0.25) return "Moderate variance";
  if (abs <= 0.50) return "High variance";
  return "Major variance";
}
function pdfPortfolioOperationalStatus(site, variance, doNothing) {
  const tier = site.maturity?.tier || "review";
  const aadtReview = ["medium_low", "review", "setup_required"].includes(pdfPortfolioToken(site.aadtConfidence));
  const categoryReview = pdfPortfolioCategoryKey(site) === "review";
  const capacityPressure = doNothing.firstActionYear && doNothing.firstActionYear <= doNothing.startYear + 5;
  const materialVariance = Number.isFinite(variance) && Math.abs(variance) > PDF_PORTFOLIO_IN_BENCHMARK_VARIANCE_TOLERANCE;
  if (!Number.isFinite(variance)) return "No actual";
  if (tier === "early") return aadtReview || categoryReview ? "Review" : "Ramp-up";
  if (aadtReview || categoryReview) return "Review";
  if (capacityPressure) return "Pressure";
  if (materialVariance) return "Review";
  return "Monitor";
}

function pdfPortfolioResult(site) {
  const inputs = pdfPortfolioScenario(site);
  const config = { ...DEFAULT_SELECTED_CONFIG, ...site.modelConfig };
  const demand = calculateDemand(inputs);
  const yy = calculateYearByYear(inputs, config, demand);
  const metrics = pdfPortfolioMetrics(site);
  const actual = pdfPortfolioAnnualValues(site, metrics);
  const matched = pdfPortfolioMatchedAnnualModel(site, inputs, actual);
  const modelAnnual = matched.modelKwh;
  const variance = actual.annualKwh > 0 ? (modelAnnual - actual.annualKwh) / actual.annualKwh : null;
  const doNothing = pdfPortfolioDoNothing(site, metrics, yy.derived, inputs);
  const tier = site.maturity?.tier || "review";
  const accuracy = pdfPortfolioAccuracyLabel(variance);
  const status = pdfPortfolioOperationalStatus(site, variance, doNothing);
  return { site, category: pdfPortfolioProfile(site).category.label, maturity: pdfPortfolioMaturityLabel(tier), actualAnnualKwh: actual.annualKwh, modelledAnnualKwh: modelAnnual, modelBasis: matched.basis, annualVariance: variance, accuracy, status, curator: matched.curator || pdfPortfolioCuratorProfile(site), triggerYear: doNothing.firstActionYear || "Monitor" };
}
function portfolioExportRows(limit = 80) {
  return PORTFOLIO_CALIBRATION_SITES.filter(site => site.displayInPortfolio !== false && !site.retiredFromPortfolio).map(pdfPortfolioResult).sort((a,b) => String(a.site.name).localeCompare(String(b.site.name))).slice(0, limit);
}
function portfolioPdfTableRows(limit = 80) {
  return portfolioExportRows(limit).map(r => [esc(r.site.name), esc(r.maturity), esc(r.category), `${number(r.site.realMicKva,0)} kVA`, number(r.site.aadt,0), kwh(r.actualAnnualKwh,0), kwh(r.modelledAnnualKwh,0), Number.isFinite(r.annualVariance) ? pct(r.annualVariance,1) : "—"]);
}
function portfolioXlsxRows() {
  return [["Site", "Maturity", "Category", "MIC kVA", "AADT", "Actual / annualised kWh/yr", "Matched model kWh/yr", "Model basis", "Variance", "Accuracy label", "Curator modifier", "Curator note", "Action year", "Actual CAPEX ex VAT", "CAPEX note"], ...portfolioExportRows().map(r => [r.site.name, r.maturity, r.category, Number(r.site.realMicKva || 0), Number(r.site.aadt || 0), r.actualAnnualKwh, r.modelledAnnualKwh, r.modelBasis, Number.isFinite(r.annualVariance) ? r.annualVariance : "", r.accuracy, Number(r.curator?.appliedMultiplier || 1), pdfPortfolioCuratorNote(r.curator), r.triggerYear, Number(r.site.actualCapexExVat || 0) || "", r.site.capexCalibrationNote || r.site.capexSource || ""] )];
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


export function exportPortfolioFinancialsExcel(payload) {
  const summaryRows = payload?.summaryRows || [];
  const matrixRows = payload?.matrixRows || [];
  const dictionaryRows = payload?.dictionaryRows || [];
  downloadXlsx("ev_hub_portfolio_financials.xlsx", [
    { name: "Portfolio Summary", rows: summaryRows },
    { name: "Portfolio Financials", rows: matrixRows, autoFilter: true },
    { name: "Definitions", rows: dictionaryRows }
  ]);
}

function compactPdfCell(main, sub = "") {
  return `<div class="pf-pdf-main">${esc(main)}</div>${sub ? `<div class="pf-pdf-sub">${esc(sub)}</div>` : ""}`;
}

function pfPdfMetric(label, value, note = "", cls = "") {
  return `<div class="pf-pdf-card ${esc(cls)}"><span>${esc(label)}</span><strong>${value}</strong>${note ? `<small>${esc(note)}</small>` : ""}</div>`;
}

function pfPdfWindow(title, note, cards, cls = "") {
  return `<section class="pf-pdf-window ${esc(cls)}"><div class="pf-pdf-window-head"><h3>${esc(title)}</h3>${note ? `<p>${esc(note)}</p>` : ""}</div><div class="pf-pdf-card-grid">${cards.join("")}</div></section>`;
}

function pfPdfFilterGroups(groups = []) {
  if (!groups.length) return "";
  return `<section class="pf-pdf-filters"><div class="pf-pdf-section-head"><h2>Filters & commercial terms</h2><p>Counts match the Portfolio Financials filter panel. Highlighted options are active; all inactive means all sites are selected.</p></div><div class="pf-pdf-filter-grid">${groups.map(g => {
    const options = (g.options || []).map(o => `<li class="${o.selected ? "selected" : ""} ${Number(o.count || 0) === 0 ? "muted" : ""}"><span>${esc(o.label)}</span><strong>${number(o.count || 0, 0)}</strong></li>`).join("");
    return `<div class="pf-pdf-filter"><div class="pf-pdf-filter-head"><span>${esc(g.label)}</span><em>${g.allActive ? `All ${number(g.total || 0,0)}` : "Filtered"}</em></div><ul>${options}</ul></div>`;
  }).join("")}</div></section>`;
}

function pfPdfDashboard(summary = {}, horizon = 5) {
  const capexDeltaPct = Number.isFinite(Number(summary.capexDeltaPct)) ? pct(Number(summary.capexDeltaPct), 1) : "—";
  const payback = Number.isFinite(Number(summary.paybackYears)) ? `${number(summary.paybackYears, 1)} yrs` : "No payback";
  const margin = Number.isFinite(Number(summary.profitabilityMargin)) ? pct(Number(summary.profitabilityMargin), 1) : "—";
  return `<section class="pf-pdf-dashboard"><div class="pf-pdf-section-head"><h2>Portfolio dashboard</h2><p>Selected sites together. Revenue is projected unless a trusted trailing-12-month revenue field exists. Landlord costs are not assumed without actual landlord terms.</p></div>
    ${pfPdfWindow("Investment position", "Actual day-one investment against the complete modelled day-one build for the selected sites.", [
      pfPdfMetric("Selected sites", number(summary.selectedSites || 0, 0), `${number(summary.totalSites || 0,0)} active sites`),
      pfPdfMetric("Gross CAPEX tracked", currency(summary.actualCapex || 0, 0), `${number(summary.rowsWithCapex || 0,0)} of ${number(summary.selectedSites || 0,0)} selected sites`),
      pfPdfMetric("Funding available", currency(summary.fundingAvailable || 0, 0), "known matched funding records"),
      pfPdfMetric("Funding applied", currency(summary.fundingApplied || 0, 0), "user-selected reduction to invested capital"),
      pfPdfMetric("Net invested CAPEX", currency(summary.netInvestedCapex || summary.actualCapex || 0, 0), "gross CAPEX minus applied funding"),
      pfPdfMetric("Model day-one CAPEX", currency(summary.modelCapex || 0, 0), "no replacements or later expansion"),
      pfPdfMetric("CAPEX Δ", currency(summary.capexDelta || 0, 0), "day-one model minus actual", Number(summary.capexDelta || 0) < 0 ? "bad" : "good"),
      pfPdfMetric("Within €30k", number(summary.capexWithin30k || 0, 0), "green accuracy band", "good"),
      pfPdfMetric("€30k–€50k", number(summary.capex30to50k || 0, 0), "amber accuracy band"),
      pfPdfMetric("Over €50k", number(summary.capexOver50k || 0, 0), "red accuracy band", Number(summary.capexOver50k || 0) > 0 ? "bad" : "good"),
      pfPdfMetric("CAPEX Δ %", capexDeltaPct, "day-one model minus actual / model", Number(summary.capexDeltaPct || 0) < 0 ? "bad" : Number(summary.capexDeltaPct || 0) > 0 ? "good" : "")
    ], "investment")}
    ${pfPdfWindow("Forward 12-month performance", "One consistent forward period for every selected site. Maturity is excluded from year 1.", [
      pfPdfMetric("Next 12m kWh", kwh(summary.next12mKwh || 0, 0), `${number(summary.rowsWithActuals || 0,0)} selected sites with usable actuals`),
      pfPdfMetric("Next 12m net revenue", currency(summary.nextYearRevenue || 0, 0), "actual trajectory + bounded trend + seasonality"),
      pfPdfMetric("Electricity energy", currency(summary.nextYearElectricity || 0, 0), "forecast kWh × electricity unit cost"),
      pfPdfMetric("Standing & capacity", currency(summary.nextYearNetwork || 0, 0), "DUoS standing + MIC capacity"),
      pfPdfMetric("Other OPEX", currency(summary.nextYearOtherOpex || 0, 0), "support, services, warranty, transactions and landlord"),
      pfPdfMetric("Next 12m site EBITDA", currency(summary.nextYearEbitda || 0, 0), "revenue − energy − network − other OPEX"),
      pfPdfMetric("Portfolio run-rate payback", payback, "net invested CAPEX if funding applied; otherwise gross CAPEX")
    ], "operating")}
    ${pfPdfWindow(`${number(horizon || 5,0)}-year projection & profitability`, `Exact selected horizon. Year 1 is actual-led and maturity begins only from month 13.`, [
      pfPdfMetric("Projection horizon", `${number(horizon || 5,0)} yrs`, "selectable from 1 to 20 years"),
      pfPdfMetric(`${number(horizon || 5,0)}yr revenue`, currency(summary.horizonRevenue || 0, 0), "cumulative net revenue"),
      pfPdfMetric(`${number(horizon || 5,0)}yr electricity`, currency(summary.horizonElectricity || 0, 0), "cumulative electricity purchase cost"),
      pfPdfMetric(`${number(horizon || 5,0)}yr OPEX excl. electricity`, currency(summary.horizonOpex || 0, 0), "cumulative site operating cost"),
      pfPdfMetric(`${number(horizon || 5,0)}yr EBITDA`, currency(summary.horizonEbitda || 0, 0), "cumulative site EBITDA"),
      pfPdfMetric(`${number(horizon || 5,0)}yr net after CAPEX`, currency(summary.netAfterCapex || 0, 0), "cumulative EBITDA minus tracked CAPEX", Number(summary.netAfterCapex || 0) < 0 ? "bad" : "good"),
      pfPdfMetric("Projected portfolio payback", Number.isFinite(Number(summary.projectedPaybackYears)) ? `${number(summary.projectedPaybackYears,1)} yrs` : "No payback", "full 20-year monthly path"),
      pfPdfMetric("Profitability margin", margin, `${number(horizon || 5,0)}yr EBITDA / revenue`)
    ], "projection")}
  </section>`;
}

function pfPdfPerformance(summary = {}) {
  return `<section class="pf-pdf-performance"><div class="pf-pdf-section-head"><h2>Actual performance vs age-matched model</h2><p>Real delivered kWh compared with the current calibrated model over the exact same elapsed operating period.</p></div><div class="pf-pdf-performance-grid">
    ${pfPdfMetric("In line with model", number(summary.inBenchmark || 0, 0), "historical actual within ±15%")}
    ${pfPdfMetric("Actual below model", number(summary.underperforming || 0, 0), "historical actual more than 15% below model")}
    ${pfPdfMetric("Actual above model", number(summary.outperforming || 0, 0), "historical actual more than 15% above model")}
    ${pfPdfMetric("Review / early", number(summary.performanceReview || 0, 0), "insufficient history or comparison unavailable")}
  </div><div class="pf-pdf-warning"><strong>History quality:</strong> ${number(summary.notEnoughData || 0,0)} sites are early or have limited monthly history. This flag is separate from model-performance classification.</div><div class="pf-pdf-warning"><strong>Investment data warnings:</strong> ${number(summary.capexMissing || 0,0)} sites missing actual CAPEX · ${number(summary.noPayback || 0,0)} sites with no positive run-rate payback.</div></section>`;
}

export async function exportPortfolioFinancialsPdf(payload) {
  const summary = payload?.summary || {};
  const rows = payload?.displayRows || [];
  const filtersText = payload?.filtersText || "All sites";
  const filterGroups = payload?.filterGroups || [];
  const horizon = payload?.horizon || 5;
  const exportedAt = new Date().toLocaleString("en-IE");
  const tableRows = rows.map(r => [
    compactPdfCell(r.site, r.configuration || r.commercialTerms),
    compactPdfCell(r.daysLabel, r.daysBasis),
    compactPdfCell(Number.isFinite(r.actualCapex) ? currency(r.actualCapex, 0) : "CAPEX missing", `${r.capexBand || ""}${r.capexBand && r.capexNote ? " · " : ""}${r.capexNote || ""}${Number(r.fundingAvailable || 0) > 0 ? ` · funding ${currency(r.fundingAvailable,0)}${r.fundingApplied ? ` applied · net ${currency(r.netInvestedCapex,0)}` : " available"}` : ""}`),
    compactPdfCell(kwh(r.next12mKwh, 0), `model ${kwh(r.modelForward12mKwh,0)}`),
    compactPdfCell(Number.isFinite(r.performanceVariance) ? `${r.performanceVariance >= 0 ? "+" : ""}${pct(r.performanceVariance,1)}` : "—", `${r.performanceClassification || "Review"} · ${r.dataQualityNote || ""}`),
    compactPdfCell(currency(r.next12mRevenue, 0), "base forecast used in EBITDA"),
    compactPdfCell(currency(r.electricityCost, 0), `${currency(r.electricityUnitCost || 0,3)}/kWh · network ${currency(r.networkStandingAndCapacity || 0,0)}`),
    compactPdfCell(currency(r.otherOpexExElectricityAndNetwork, 0), r.commercialTerms),
    compactPdfCell(currency(r.ebitda, 0), "revenue − energy − network − other OPEX"),
    compactPdfCell(r.paybackLabel, r.paybackNote)
  ]);
  const report = `
  <section class="print-page portfolio-page portfolio-financial-print-page portfolio-financial-summary-page">
    <div class="report-hero portfolio-financial-print-hero">
      <div>
        <img class="report-logo" src="./assets/epower-logo.png" alt="ePower" />
        <div class="eyebrow">Portfolio Financials export</div>
        <h1>Portfolio Financial Performance</h1>
        <p>Independent export of the Portfolio Financials tab · ${esc(exportedAt)} · filters: ${esc(filtersText)}</p>
      </div>
      <div class="report-grid portfolio-financial-print-kpis">
        ${reportMetric("Selected sites", number(summary.selectedSites || 0, 0))}
        ${reportMetric("Net invested CAPEX", currency(summary.netInvestedCapex || summary.actualCapex || 0, 0))}
        ${reportMetric("Annualised kWh", kwh(summary.annualKwh || 0, 0))}
        ${reportMetric("Next 12m EBITDA", currency(summary.nextYearEbitda || 0, 0))}
      </div>
    </div>
    ${pfPdfFilterGroups(filterGroups)}
    ${pfPdfDashboard(summary, horizon)}
    ${pfPdfPerformance(summary)}
  </section>
  <section class="print-page portfolio-page portfolio-financial-print-page portfolio-financial-table-page">
    <div class="panel portfolio-financial-print-panel">
      <h3>Site financial performance table</h3>
      <p class="report-caption">Same investor table as the app: forward kWh, age-matched historical model performance, revenue, electricity energy plus network standing/capacity, other OPEX, funding and run-rate payback.</p>
      <div class="report-table-wrap portfolio-financial-pdf-table-wrap">
        <table class="portfolio-financial-pdf-table">
          <thead><tr>${["Site", "Days", "CAPEX & funding", "Next 12m kWh", "Actual vs age-matched model", "Next 12m revenue", "Energy & network", "Other OPEX", "Site EBITDA", "Run-rate payback"].map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
          <tbody>${tableRows.map(row => `<tr>${row.map(x => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
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
  let pageStyle = document.getElementById("portfolioFinancialPrintPageStyle");
  if (!pageStyle) {
    pageStyle = document.createElement("style");
    pageStyle.id = "portfolioFinancialPrintPageStyle";
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = "@page { size: A4 landscape; margin: 8mm; }";
  document.body.classList.add("print-mode", "portfolio-financial-print-mode");
  await waitForImages(container);
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove("print-mode", "portfolio-financial-print-mode");
      const staleStyle = document.getElementById("portfolioFinancialPrintPageStyle");
      if (staleStyle) staleStyle.remove();
    }, 500);
  }, 250);
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
  const portfolioTableRows = portfolioPdfTableRows(80);
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
    <p class="report-caption">Annual actual performance is compared with the matched portfolio-calibrated model year/basis using each operating site's MIC, AADT, maturity and site category. Variance shows the hard model-vs-actual result and its colour indicates model fit. The portfolio Status column has been removed to keep the benchmark view focused on model accuracy.</p>
    <div class="panel">
      <h3>Operating hub benchmark table</h3>
      ${htmlTable(["Site", "Maturity", "Category", "MIC", "AADT", "Actual / annualised kWh/yr", "Matched model kWh/yr", "Variance"], portfolioTableRows)}
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
