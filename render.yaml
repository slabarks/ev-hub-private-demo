import { number } from "../utils.js";

function chartShell(id, title, svg, legend) {
  return `<div class="chart-shell" id="${id}"><div class="chart-title">${title || ""}</div>${svg}<div class="legend">${legend}</div></div>`;
}

function fmtAxis(v, opts = {}) {
  const abs = Math.abs(v);
  let value;
  if (opts.yPrefix === "€") {
    if (abs >= 1000000) value = `€${(v / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}m`;
    else if (abs >= 1000) value = `€${(v / 1000).toFixed(abs >= 100000 ? 0 : 1)}k`;
    else value = `€${number(v, opts.yDigits ?? 0)}`;
    return value;
  }
  const suffix = opts.ySuffix || "";
  if (abs >= 1000000) value = `${(v / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}m`;
  else if (abs >= 1000) value = `${(v / 1000).toFixed(abs >= 100000 ? 0 : 1)}k`;
  else value = number(v, opts.yDigits ?? 0);
  return `${value}${suffix}`;
}

function seriesColor(item, idx) {
  return item.color || `var(--chart-${(idx % 7) + 1})`;
}

function axisLabels(width, height, pad, opts = {}) {
  const xLabel = opts.xLabel || "Year";
  const yLabel = opts.yLabel || "";
  return `
    <text x="${(pad.left + (width - pad.right)) / 2}" y="${height - 5}" text-anchor="middle" class="axis-label">${xLabel}</text>
    ${yLabel ? `<text transform="translate(15 ${(pad.top + (height - pad.bottom)) / 2}) rotate(-90)" text-anchor="middle" class="axis-label">${yLabel}</text>` : ""}`;
}

export function lineChart(id, rows, xKey, yKeys, opts = {}) {
  const width = opts.width || 760;
  const height = opts.height || 280;
  const pad = { left: 72, right: 22, top: 26, bottom: 58 };
  const series = yKeys.map((k, idx) => ({ key: k.key, label: k.label || k.key, color: k.color || opts.colors?.[idx], values: rows.map(r => Number(r[k.key]) || 0) }));
  const yVals = series.flatMap(s => s.values);
  const minY = Math.min(0, ...yVals);
  const maxY = Math.max(1, ...yVals);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = i => pad.left + (rows.length <= 1 ? 0 : i * plotW / (rows.length - 1));
  const y = v => pad.top + (maxY === minY ? plotH / 2 : (maxY - v) * plotH / (maxY - minY));
  const paths = series.map((s, idx) => {
    const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${seriesColor(s, idx)}" stroke-width="2.7" />`;
  }).join("");
  const points = series.map((s, idx) => s.values.map((v, i) => `<circle cx="${x(i).toFixed(2)}" cy="${y(v).toFixed(2)}" r="2.6" fill="${seriesColor(s, idx)}"><title>${s.label} ${rows[i][xKey]}: ${fmtAxis(v, opts)}</title></circle>`).join("")).join("");
  const ticks = rows.filter((_, i) => i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1).map(r => {
    const idx = rows.indexOf(r);
    return `<text x="${x(idx)}" y="${height - 22}" text-anchor="middle" class="axis">${r[xKey]}</text>`;
  }).join("");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const val = minY + (maxY - minY) * p;
    return `<g><line x1="${pad.left}" x2="${width - pad.right}" y1="${y(val)}" y2="${y(val)}" class="gridline"/><text x="${pad.left - 8}" y="${y(val) + 4}" text-anchor="end" class="axis">${fmtAxis(val, opts)}</text></g>`;
  }).join("");
  const legend = series.map((s, idx) => `<span><i style="background:${seriesColor(s, idx)}"></i>${s.label}</span>`).join("");
  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${opts.title || "line chart"}">${yTicks}${paths}${points}<line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="axis-line"/>${ticks}${axisLabels(width, height, pad, opts)}</svg>`;
  return chartShell(id, opts.title, svg, legend);
}

export function stackedBarChart(id, rows, xKey, stacks, opts = {}) {
  const width = opts.width || 760;
  const height = opts.height || 300;
  const pad = { left: 72, right: 22, top: 26, bottom: 58 };
  const maxY = Math.max(1, ...rows.map(r => stacks.reduce((acc, s) => acc + Math.max(0, Number(r[s.key]) || 0), 0)));
  const minY = 0;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const bw = plotW / Math.max(1, rows.length) * 0.58;
  const x = i => pad.left + i * plotW / Math.max(1, rows.length) + (plotW / Math.max(1, rows.length) - bw) / 2;
  const y = v => pad.top + (maxY - v) * plotH / (maxY - minY);
  const bars = rows.map((r, i) => {
    let acc = 0;
    return stacks.map((s, j) => {
      const v = Math.max(0, Number(r[s.key]) || 0);
      const yTop = y(acc + v);
      const yBase = y(acc);
      acc += v;
      return `<rect x="${x(i).toFixed(2)}" y="${yTop.toFixed(2)}" width="${bw.toFixed(2)}" height="${Math.max(0, yBase - yTop).toFixed(2)}" fill="${seriesColor(s, j)}"><title>${s.label}: ${fmtAxis(v, opts)}</title></rect>`;
    }).join("");
  }).join("");
  const yTicks = [0, .25, .5, .75, 1].map(p => {
    const val = minY + (maxY - minY) * p;
    return `<g><line x1="${pad.left}" x2="${width - pad.right}" y1="${y(val)}" y2="${y(val)}" class="gridline"/><text x="${pad.left - 8}" y="${y(val) + 4}" text-anchor="end" class="axis">${fmtAxis(val, opts)}</text></g>`;
  }).join("");
  const ticks = rows.filter((_, i) => i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1).map(r => {
    const i = rows.indexOf(r);
    return `<text x="${x(i) + bw/2}" y="${height - 22}" text-anchor="middle" class="axis">${r[xKey]}</text>`;
  }).join("");
  const legend = stacks.map((s, idx) => `<span><i style="background:${seriesColor(s, idx)}"></i>${s.label}</span>`).join("");
  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${opts.title || "stacked bar chart"}">${yTicks}${bars}<line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="axis-line"/>${ticks}${axisLabels(width, height, pad, opts)}</svg>`;
  return chartShell(id, opts.title, svg, legend);
}

export function financeComboChart(id, rows, opts = {}) {
  const width = opts.width || 900;
  const height = opts.height || 330;
  const pad = { left: 78, right: 22, top: 28, bottom: 58 };
  const bars = opts.bars || [];
  const lines = opts.lines || [];
  const allVals = rows.flatMap(r => [...bars.map(b => Number(r[b.key]) || 0), ...lines.map(l => Number(r[l.key]) || 0)]);
  const minY = Math.min(0, ...allVals);
  const maxY = Math.max(1, ...allVals);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const slot = plotW / Math.max(1, rows.length);
  const bw = slot * 0.56;
  const x = i => pad.left + i * slot + (slot - bw) / 2;
  const y = v => pad.top + (maxY - v) * plotH / (maxY - minY);
  const zeroY = y(0);

  const barSvg = rows.map((r, i) => {
    let posAcc = 0;
    let negAcc = 0;
    return bars.map((b, j) => {
      const v = Number(r[b.key]) || 0;
      const start = v >= 0 ? posAcc : negAcc;
      const end = start + v;
      if (v >= 0) posAcc = end; else negAcc = end;
      const y1 = y(start);
      const y2 = y(end);
      return `<rect x="${x(i).toFixed(2)}" y="${Math.min(y1, y2).toFixed(2)}" width="${bw.toFixed(2)}" height="${Math.abs(y2 - y1).toFixed(2)}" fill="${seriesColor(b, j)}"><title>${b.label}: ${fmtAxis(v, opts)}</title></rect>`;
    }).join("");
  }).join("");

  const lineSvg = lines.map((l, idx) => {
    const d = rows.map((r, i) => `${i === 0 ? "M" : "L"}${(x(i) + bw / 2).toFixed(2)},${y(Number(r[l.key]) || 0).toFixed(2)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${seriesColor(l, bars.length + idx)}" stroke-width="2.8"><title>${l.label}</title></path>`;
  }).join("");

  const yTicks = [0, .25, .5, .75, 1].map(p => {
    const val = minY + (maxY - minY) * p;
    return `<g><line x1="${pad.left}" x2="${width - pad.right}" y1="${y(val)}" y2="${y(val)}" class="gridline"/><text x="${pad.left - 8}" y="${y(val) + 4}" text-anchor="end" class="axis">${fmtAxis(val, opts)}</text></g>`;
  }).join("");
  const ticks = rows.filter((_, i) => i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1).map(r => {
    const i = rows.indexOf(r);
    return `<text x="${x(i) + bw/2}" y="${height - 22}" text-anchor="middle" class="axis">${r.year}</text>`;
  }).join("");
  const legend = [...bars, ...lines].map((s, idx) => `<span><i style="background:${seriesColor(s, idx)}"></i>${s.label}</span>`).join("");
  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${opts.title || "financial chart"}">${yTicks}<line x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}" class="axis-line"/>${barSvg}${lineSvg}${ticks}${axisLabels(width, height, pad, { ...opts, yLabel: opts.yLabel || "€" })}</svg>`;
  return chartShell(id, opts.title, svg, legend);
}

export function barLineChart(id, rows, opts = {}) {
  return financeComboChart(id, rows, {
    ...opts,
    bars: opts.bars || [],
    lines: opts.line ? [opts.line] : (opts.lines || [])
  });
}
