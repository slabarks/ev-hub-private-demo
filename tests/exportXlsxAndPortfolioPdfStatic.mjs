import assert from "node:assert/strict";
import fs from "node:fs";

const exportEngine = fs.readFileSync("js/engines/exportEngine.js", "utf8");

assert.ok(exportEngine.includes('downloadXlsx("ev_hub_annual_financials.xlsx"'), "Annual financial export should download a true .xlsx file");
assert.ok(!exportEngine.includes('ev_hub_annual_financials.xls"'), "Annual financial export should not download an HTML .xls file");
assert.ok(exportEngine.includes("zipStore(xlsxWorkbookFiles(sheets))"), "Annual financial export should generate a zipped OOXML workbook");
assert.ok(exportEngine.includes("Portfolio Calibration Benchmark"), "Investor PDF should include a Portfolio Calibration Benchmark section");
assert.ok(exportEngine.includes("portfolioPdfTableRows"), "Investor PDF portfolio section should be populated from portfolio rows");
assert.ok(exportEngine.includes('{ name: "Portfolio Calibration", rows: portfolioXlsxRows() }'), "XLSX export should include a Portfolio Calibration sheet");

console.log("Export XLSX and Portfolio PDF static regression passed.");
