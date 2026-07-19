export const currency = (v, digits = 0) => Number.isFinite(v) ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v) : "—";
export const number = (v, digits = 0) => Number.isFinite(v) ? new Intl.NumberFormat("en-IE", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v) : "—";
export const pct = (v, digits = 1) => Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : "—";
export const kw = (v, digits = 0) => `${number(v, digits)} kW`;
export const kwh = (v, digits = 0) => `${number(v, digits)} kWh`;
export const kva = (v, digits = 0) => `${number(v, digits)} kVA`;
export const asNum = (v, fallback = 0) => {
  const n = typeof v === "string" && v.trim().toUpperCase() === "N/A" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
export const max = arr => Math.max(...arr.filter(Number.isFinite));
export const min = arr => Math.min(...arr.filter(Number.isFinite));
export const sum = arr => arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function ceilTo(value, step = 1) {
  return Math.ceil(value / step) * step;
}
export function vlookup(name, rows, key = "item") {
  return rows.find(row => row[key] === name) || null;
}
export function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
export function toCsv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const escape = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [keys.map(escape).join(","), ...rows.map(row => keys.map(k => escape(row[k])).join(","))].join("\n");
}
export function npv(cashflows, rate) {
  const r = Number(rate);
  if (!Array.isArray(cashflows) || !cashflows.length || !Number.isFinite(r) || r <= -1) return null;
  return cashflows.reduce((acc, cf, t) => acc + Number(cf || 0) / Math.pow(1 + r, t), 0);
}

// Robust annual IRR solver. A valid IRR requires at least one positive and one
// negative cash flow and a genuine NPV sign change. This deliberately returns
// null instead of a plausible-looking guess when no economic root exists.
export function irr(cashflows) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) return null;
  const flows = cashflows.map(v => Number(v || 0));
  if (!flows.every(Number.isFinite)) return null;
  if (!flows.some(v => v < 0) || !flows.some(v => v > 0)) return null;

  const valueAt = rate => npv(flows, rate);
  const scanRates = [];
  // Dense coverage around normal project-finance returns, followed by a
  // logarithmic tail for unusually high but still mathematically valid IRRs.
  for (let i = 0; i <= 1200; i += 1) scanRates.push(-0.9999 + i * (2.9999 / 1200)); // -99.99% to 200%
  for (let i = 1; i <= 500; i += 1) scanRates.push(2 + (Math.pow(10, i / 250) - 1)); // 200% to ~10,100%

  let left = scanRates[0];
  let fLeft = valueAt(left);
  for (let i = 1; i < scanRates.length; i += 1) {
    const right = scanRates[i];
    const fRight = valueAt(right);
    if (!Number.isFinite(fLeft) || !Number.isFinite(fRight)) {
      left = right;
      fLeft = fRight;
      continue;
    }
    if (Math.abs(fLeft) < 1e-9) return left;
    if (Math.abs(fRight) < 1e-9) return right;
    if (fLeft * fRight < 0) {
      let lo = left, hi = right, flo = fLeft;
      for (let iteration = 0; iteration < 200; iteration += 1) {
        const mid = (lo + hi) / 2;
        const fmid = valueAt(mid);
        if (!Number.isFinite(fmid)) return null;
        if (Math.abs(fmid) < 1e-9 || Math.abs(hi - lo) < 1e-10) return mid;
        if (flo * fmid <= 0) hi = mid;
        else { lo = mid; flo = fmid; }
      }
      return (lo + hi) / 2;
    }
    left = right;
    fLeft = fRight;
  }
  return null;
}
