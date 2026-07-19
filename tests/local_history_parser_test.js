#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const vendorSource = fs.readFileSync(path.join(root, "assets", "vendor", "jszip.min.js"), "utf8");
const vendorContext = { console, setTimeout, clearTimeout, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder };
vendorContext.self = vendorContext;
vendorContext.window = vendorContext;
vendorContext.globalThis = vendorContext;
vm.createContext(vendorContext);
vm.runInContext(vendorSource, vendorContext);
assert.equal(typeof vendorContext.JSZip, "function", "vendored JSZip must load as a browser global");
globalThis.JSZip = vendorContext.JSZip;

const { parsePortfolioCalibrationFilesLocally } = await import(pathToFileURL(path.join(root, "js", "liveHistoryLocalParser.js")));

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inlineCell(ref, value) {
  return `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
}
function numberCell(ref, value) {
  return `<c r="${ref}"><v>${value}</v></c>`;
}
function excelDate(dayIndex) {
  const date = new Date(Date.UTC(2026, 0, 1 + dayIndex));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getUTCDate()).padStart(2, "0")} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const rows = [];
rows.push(`<row r="1">${[
  "Date of start_time", "charge_point_name", "Total charge_amount", "Total net", "Ave kW", "transaction_id Count", "Variance of charge_amount"
].map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}1`, value)).join("")}</row>`);
let rowNumber = 2;
for (let day = 0; day < 46; day += 1) {
  const date = excelDate(day);
  const siteAActive = day >= 2;
  const siteBActive = day >= 9;
  rows.push(`<row r="${rowNumber}">${inlineCell(`A${rowNumber}`, date)}${inlineCell(`B${rowNumber}`, "Test Alpha eP1001")}${numberCell(`C${rowNumber}`, siteAActive ? 20 + day : 0)}${numberCell(`D${rowNumber}`, siteAActive ? 10 + day / 10 : 0)}${numberCell(`E${rowNumber}`, 0)}${numberCell(`F${rowNumber}`, siteAActive ? 2 : 0)}${inlineCell(`G${rowNumber}`, "")}</row>`);
  rowNumber += 1;
  rows.push(`<row r="${rowNumber}">${inlineCell(`A${rowNumber}`, date)}${inlineCell(`B${rowNumber}`, "Test Beta eP2001")}${numberCell(`C${rowNumber}`, siteBActive ? 10 + day / 2 : 0)}${numberCell(`D${rowNumber}`, siteBActive ? 5 + day / 20 : 0)}${numberCell(`E${rowNumber}`, 0)}${numberCell(`F${rowNumber}`, siteBActive ? 1 : 0)}${inlineCell(`G${rowNumber}`, "")}</row>`);
  rowNumber += 1;
}

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`;

const workbookZip = new globalThis.JSZip();
workbookZip.file("xl/workbook.xml", workbookXml);
workbookZip.file("xl/_rels/workbook.xml.rels", relsXml);
workbookZip.file("xl/worksheets/sheet1.xml", sheetXml);
const workbookBytes = await workbookZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

const outerZip = new globalThis.JSZip();
outerZip.file("Overview/Daily_Charger_kWh.xlsx", workbookBytes);
outerZip.file("Ignore/ePF_-_Overview_Averages.xlsx", "ignored");
const outerBytes = await outerZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
const upload = new File([outerBytes], "Calibration_Pack.zip", { type: "application/zip" });

const progress = [];
const payload = await parsePortfolioCalibrationFilesLocally([upload], message => progress.push(message));
assert.equal(payload.ok, true);
assert.equal(payload.localParser, true);
assert.equal(payload.schemaVersion, "v21-live-history-v7");
assert.equal(payload.buildId, "EVHUB-V21.6-20260719-R1");
assert.equal(payload.parserBuildId, "EVHUB-LIVE-PARSER-21.6");
assert.equal(payload.siteCount, 2);
assert.equal(payload.rowCount, 92);
assert.equal(payload.dailyHistorySiteCount, 2);
assert.equal(payload.monthlyHistorySiteCount, 2);
assert.ok(payload.dailyObservationCount > 70);
assert.ok(payload.monthlyObservationCount >= 4);
assert.equal(payload.latestDate, "2026-02-15");
assert.deepEqual(payload.primarySourceFiles, ["Overview/Daily_Charger_kWh.xlsx"]);
assert.ok(payload.supportingFiles.includes("Ignore/ePF_-_Overview_Averages.xlsx") === false, "Ignore folder entries must be skipped, not parsed as support files");
assert.ok(progress.some(message => /Reading/i.test(message)));
const alpha = payload.siteActuals.find(item => item.siteName === "Test Alpha");
const beta = payload.siteActuals.find(item => item.siteName === "Test Beta");
assert.ok(alpha && beta);
assert.equal(alpha.actual.firstCommercialSessionDate, "2026-01-03");
assert.equal(beta.actual.firstCommercialSessionDate, "2026-01-10");
assert.equal(alpha.actual.dailyHistory[0].date, "2026-01-03");
assert.equal(alpha.actual.dailyHistory.at(-1).date, "2026-02-15");
assert.ok(alpha.actual.monthlyHistory.every(row => Number.isFinite(row.kwhPerCalendarDay)));
console.log("PASS — browser-local ZIP/XLSX parser produced complete daily and monthly histories without a backend.");
