import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const defaults = fs.readFileSync(new URL('../js/data/defaultAssumptions.js', import.meta.url), 'utf8');
const demandEngine = fs.readFileSync(new URL('../js/engines/demandEngine.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');

for (const token of [
  'DEMAND_BENCHMARK_PROFILES',
  'inferDemandBenchmarkProfile',
  'applyDemandBenchmarkProfile',
  'benchmarkProfileSelect',
  'effectiveAadtCap',
  'benchmarkTargetSessionsPer1000Aadt'
]) {
  if (!app.includes(token) && !defaults.includes(token) && !demandEngine.includes(token)) throw new Error(`Missing benchmark profile token: ${token}`);
}
if (!demandEngine.includes('Math.min(Number(inputs.rawCorridorTrafficAadt || 0), effectiveAadtCap)')) throw new Error('Demand engine does not cap effective AADT.');
if (!css.includes('.benchmark-profile-card')) throw new Error('Benchmark profile card styling is missing.');
console.log('Demand benchmark profile static checks passed.');
