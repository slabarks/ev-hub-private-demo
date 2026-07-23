#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "..", "js", "app.js"), "utf8");

function extractFunction(name) {
  let start = app.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  if (app.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
  const signatureEnd = app.indexOf(") {", start);
  assert.ok(signatureEnd >= 0, `${name} signature must contain a function body`);
  const brace = signatureEnd + 2;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let templateDepth = 0;
  for (let i = brace; i < app.length; i += 1) {
    const ch = app[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (quote === "`" && ch === "$" && app[i + 1] === "{") { templateDepth += 1; i += 1; depth += 1; continue; }
      if (ch === quote && templateDepth === 0) quote = null;
      else if (quote === "`" && ch === "}" && templateDepth > 0) { templateDepth -= 1; depth -= 1; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return app.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const functionNames = [
  "portfolioServerCompatibility",
  "portfolioUploadError",
  "portfolioUploadResponsePreview",
  "portfolioAppBaseUrl",
  "portfolioApiCandidates",
  "portfolioRetryableRouteError",
  "portfolioFetchJson",
  "portfolioVerifyUploadBackend",
  "portfolioCalibrationFormData",
  "portfolioSnapshotValidation",
  "portfolioUploadCalibrationFiles",
];

const validHistory = annualKwh => ({
  ok: true,
  buildId: "EVHUB-V21.8-20260722-R1",
  uploadSchemaVersion: "v21-live-history-v7",
  parserBuildId: "EVHUB-LIVE-PARSER-21.8",
  parsedFiles: ["Daily_Charger_kWh.csv"],
  siteActuals: [{ actual: {
    annualKwh,
    monthlyHistory: [{ month: "2026-01", kwh: annualKwh / 12 }],
    dailyHistory: [{ date: "2026-01-01", kwh: annualKwh / 365, rolling30Kwh: annualKwh / 12 }]
  } }]
});

const calls = [];
let uploadMode = "relative-success";
const fetchMock = async (url, options = {}) => {
  const href = String(url);
  calls.push({ href, method: options.method || "GET" });
  if (href.endsWith("/api/version")) {
    return new Response("<!DOCTYPE html><title>Not found</title>", { status: 404, headers: { "content-type": "text/html" } });
  }
  if (href === "https://example.test/tools/evhub/api/import-live-calibration") {
    if (uploadMode === "relative-success") return Response.json(validHistory(1));
    if (uploadMode === "relative-incomplete") return Response.json({ ok: true, parsedFiles: ["Daily_Charger_kWh.csv"], siteActuals: [{ actual: { annualKwh: 1 } }] });
    return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  }
  if (href === "https://example.test/api/import-live-calibration") {
    return Response.json(validHistory(2));
  }
  return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
};

const context = {
  console,
  URL,
  Response,
  FormData,
  Blob,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: fetchMock,
  document: { baseURI: "https://example.test/tools/evhub/index.html" },
  window: { location: new URL("https://example.test/tools/evhub/index.html") },
};
vm.createContext(context);
vm.runInContext(`
const APP_RELEASE_VERSION = "V21.8";
const APP_BUILD_ID = "EVHUB-V21.8-20260722-R1";
const LIVE_UPLOAD_PARSER_BUILD_ID = "EVHUB-LIVE-PARSER-21.8";
const PORTFOLIO_LIVE_ACTUALS_SCHEMA_VERSION = "v21-live-history-v7";
const PORTFOLIO_UPLOAD_PREFLIGHT_TIMEOUT_MS = 20000;
const PORTFOLIO_UPLOAD_REQUEST_TIMEOUT_MS = 150000;
${functionNames.map(extractFunction).join("\n")}
this.verify = portfolioVerifyUploadBackend;
this.upload = portfolioUploadCalibrationFiles;
this.candidates = portfolioApiCandidates;
`, context);

const candidates = context.candidates("api/version");
assert.deepEqual(Array.from(candidates), [
  "https://example.test/tools/evhub/api/version",
  "https://example.test/api/version",
]);

const preflight = await context.verify();
assert.equal(preflight.available, false, "missing /api/version must remain advisory and must not throw");

const file = new Blob(["sample"], { type: "text/csv" });
Object.defineProperty(file, "name", { value: "Daily_Charger_kWh.csv" });
let result = await context.upload([file]);
assert.equal(result.response.status, 200);
assert.equal(result.uploadUrl, "https://example.test/tools/evhub/api/import-live-calibration");

uploadMode = "root-success";
result = await context.upload([file]);
assert.equal(result.response.status, 200);
assert.equal(result.uploadUrl, "https://example.test/api/import-live-calibration", "root route must be tried when the application-relative route is unavailable");

uploadMode = "relative-incomplete";
result = await context.upload([file]);
assert.equal(result.uploadUrl, "https://example.test/api/import-live-calibration", "an incomplete 200 response must not prevent trying a later valid route");
assert.ok(result.attempts.some(item => /unusable response/.test(item)), "incomplete route response must be recorded in diagnostics");

assert.ok(calls.some(call => call.href.endsWith("/api/version")), "diagnostic route should still be attempted");
assert.ok(calls.some(call => call.href === "https://example.test/api/import-live-calibration"), "root upload fallback should be attempted");
console.log("PASS — missing version route and incomplete legacy responses no longer block a valid upload route.");
