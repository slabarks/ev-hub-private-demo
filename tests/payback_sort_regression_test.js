#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const storage = new Map();
const context = {
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value))
  },
  PORTFOLIO_FINANCIAL_STORAGE_PREFIX: "evHub.portfolioFinancial",
  number: (value, digits = 0) => Number(value).toFixed(digits),
  console
};
vm.createContext(context);
const names = [
  "portfolioFinancialSortKey",
  "portfolioFinancialSortDir",
  "portfolioFinancialSortValue",
  "portfolioFinancialSortRows",
  "portfolioFinancialPaybackState",
  "portfolioPaybackLabel",
  "portfolioPaybackSubtext"
];
vm.runInContext(`${names.map(functionSource).join("\n")}; this.api = { ${names.join(",")} };`, context);
const api = context.api;

function row(name, state, years, extra = {}) {
  return {
    site: { name },
    paybackState: { state },
    paybackYears: years,
    runRatePaybackYears: years,
    ...extra
  };
}
const rows = [
  row("Immediate", "immediate", 0),
  row("Two years", "positive", 2),
  row("Ten years", "positive", 10),
  row("Seventy years", "positive", 70),
  row("No payback", "negativeCashflow", null),
  row("CAPEX missing", "capexMissing", null),
  row("Actual missing", "notCalculated", null)
];

storage.set("evHub.portfolioFinancial.sortKey", "payback");
storage.set("evHub.portfolioFinancial.sortDir", "asc");
assert.deepEqual(
  Array.from(api.portfolioFinancialSortRows(rows), item => item.site.name),
  ["Immediate", "Two years", "Ten years", "Seventy years", "No payback", "Actual missing", "CAPEX missing"]
);

storage.set("evHub.portfolioFinancial.sortDir", "desc");
assert.deepEqual(
  Array.from(api.portfolioFinancialSortRows(rows), item => item.site.name),
  ["No payback", "Seventy years", "Ten years", "Two years", "Immediate", "Actual missing", "CAPEX missing"]
);

const immediateState = api.portfolioFinancialPaybackState({
  hasActualKwh: true,
  hasOperationalDays: true,
  hasActualCapex: true,
  runRatePaybackYears: 0,
  effectivePaybackCapex: 0,
  forecastOperatingCashflow: 1000,
  fundingApplied: true
});
assert.equal(immediateState.state, "immediate");
assert.equal(api.portfolioPaybackLabel(0, immediateState), "Immediate / 0.0 yrs");
assert.equal(api.portfolioPaybackLabel(73.6, { label: "Payback available", state: "positive" }), ">50 yrs");
assert.match(api.portfolioPaybackSubtext(73.6, { label: "Payback available", state: "positive" }), /73\.6 years/);

console.log("PASS — run-rate payback sorting is semantic, deterministic and keeps unknown values at the bottom.");
