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
export function irr(cashflows, guess = 0.1) {
  let rate = guess;
  for (let i = 0; i < 100; i++) {
    let f = 0, df = 0;
    cashflows.forEach((cf, t) => {
      const denom = Math.pow(1 + rate, t);
      f += cf / denom;
      if (t > 0) df -= t * cf / Math.pow(1 + rate, t + 1);
    });
    if (Math.abs(df) < 1e-12) break;
    const next = rate - f / df;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = Math.max(-0.9999, Math.min(10, next));
  }
  return Number.isFinite(rate) ? rate : null;
}
export function npv(cashflows, rate) {
  return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}
