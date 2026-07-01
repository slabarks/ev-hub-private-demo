// CAPEX calibration metadata for operating hubs.
// Scope: preserve hardware, ESB and battery libraries; use these values only
// to show actual CAPEX, override known-site initial CAPEX when explicitly loaded,
// and calibrate/review civils + electrical + installation + commissioning residuals.

export function capexKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(dc|kw|kwh|epower|everyday|ev|charger|charging)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const KNOWN_SITE_CAPEX = [
  { key: "anner hotel 120", aliases: ["Anner Hotel", "Anner Hotel 120 kW DC"], actualCapexExVat: 58580, treatment: "retired_reference", note: "Removed from active portfolio because no MIC was confirmed in the verified mapping dataset." },
  { key: "circle k junction 20", aliases: ["Circle K - Junction 20", "Circle K Junction 20"], actualCapexExVat: 64999, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "circle k express dungarvan", aliases: ["Circle K Express Dungarvan", "Dungarvan Nissan"], actualCapexExVat: 125696, treatment: "actual_capex_review", note: "Actual CAPEX provided; high/review works-cost behaviour." },
  { key: "the cope shopping centre", aliases: ["The Cope Shopping Centre", "The Cope SC"], actualCapexExVat: 120728, treatment: "actual_capex_review", note: "Actual CAPEX provided; high/review works-cost behaviour." },
  { key: "walsh centra roscommon", aliases: ["Walsh Roscommon", "Walsh's Centra Service Station Roscommon"], actualCapexExVat: 163576, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "corrib oil cork city", aliases: ["Corrib Oil Cork City", "Corrib Oil - Cork City", "Corrib Oil, Lee Garage, Cork"], actualCapexExVat: 268323, treatment: "actual_capex_outlier", note: "Actual CAPEX provided; review/outlier for works-cost calibration." },
  { key: "oran point oranmore", aliases: ["Oran Point", "Oran Point, Oranmore", "Oranpoint Galway"], actualCapexExVat: 85993, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "athlone m6 junction 13 westpoint business centre", aliases: ["Athlone M6 Junction 13", "Athlone - M6 Junction 13, Westpoint Business Centre", "Westpoint Athlone"], actualCapexExVat: 142011, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "corrib oil tralee", aliases: ["Corrib Oil - Tralee", "Corrib Oil Tralee"], actualCapexExVat: 171634, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "the brehon hotel", aliases: ["The Brehon Hotel", "The Brehon Hotel DC"], actualCapexExVat: 90858, treatment: "actual_capex_ac_scope_note", note: "Actual CAPEX includes ancillary AC scope; DC model remains 1 charger / 2 fast plugs." },
  { key: "greenhills hotel", aliases: ["Greenhills Hotel", "Greenhills Hotel DC"], actualCapexExVat: 162823, treatment: "actual_capex_ac_scope_note", note: "Dashboard points include AC; DC mapping remains Kempower 1 cabinet + 2 dual DC dispensers." },
  { key: "southgate shopping centre", aliases: ["Southgate Shopping Centre"], actualCapexExVat: 133517, treatment: "actual_capex", note: "Actual project CAPEX provided." },

  { key: "ahern s centra castlemartyr", aliases: ["Ahern's Centra - Castlemartyr", "Ahern's Centra Castlemartyr"], actualCapexExVat: 89011, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 1 charger / 2 plugs confirmed." },
  { key: "aherns centra carrigtwohill", aliases: ["Aherns Centra - Carrigtwohill", "Ahern's Centra Carrigtwohill"], actualCapexExVat: 134222, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 1 charger / 2 plugs confirmed." },
  { key: "axis retail park", aliases: ["Axis Retail Park"], actualCapexExVat: 146060, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 2 × Autel DH480 / 4 plugs." },
  { key: "charleville park hotel", aliases: ["Charleville Park Hotel"], actualCapexExVat: 140055, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 2 × Autel DH480 / 4 plugs." },
  { key: "mallow plaza", aliases: ["Mallow Plaza", "Mallow N20 Plaza"], actualCapexExVat: 131568, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 2 × Autel DH480 / 4 plugs." },
  { key: "newtown park hotel", aliases: ["Newtown Park Hotel"], actualCapexExVat: 128485, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 2 × Autel DH480 / 4 plugs." },
  { key: "o brien s larkin s cross", aliases: ["O'Brien's Larkin's Cross", "O'Briens Larkin's Cross"], actualCapexExVat: 111915, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 2 × Autel DH480 / 4 plugs." },
  { key: "corrib oil swinford", aliases: ["Corrib Oil - Swinford", "Corrib Oil Swinford"], actualCapexExVat: 99945, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 1 × Autel DH480 / 2 plugs." },
  { key: "supervalu tipperary", aliases: ["Supervalu - Tipperary", "Supervalu Tipperary"], actualCapexExVat: 96139, treatment: "actual_capex", note: "Verified hardware/CAPEX mapping dataset; 1 × Autel DH480 / 2 plugs." },
  { key: "newbridge retail park", aliases: ["Newbridge Retail Park"], actualCapexExVat: 132300, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "castletroy park hotel", aliases: ["Castletroy Park Hotel"], actualCapexExVat: 113416, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "circle k aherns service station", aliases: ["Circle K - Aherns Service Station", "Aherne's Circle K Thurles", "Circle K Ahern Thurles"], actualCapexExVat: 73617, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "euro business park", aliases: ["Euro Business Park", "Euro Business Park, Little Island"], actualCapexExVat: 171522, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "tullamore retail park", aliases: ["Tullamore", "Tullamore Retail Park"], actualCapexExVat: 642662, treatment: "actual_capex_large_hub", note: "Large-hub actual CAPEX; keep separate from normal works benchmark." },
  { key: "finline furniture dublin", aliases: ["Finline Furniture", "Finline Furniture - Dublin", "Long Mile Road - Finline Furniture"], actualCapexExVat: 164525, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "leopardstown retail park", aliases: ["Leopardstown Retail Park"], actualCapexExVat: 171779, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "malahide afc", aliases: ["Malahide AFC"], actualCapexExVat: 141297, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "corrib oil fermoy", aliases: ["Corrib Oil - Fermoy", "Corrib Oil Fermoy"], actualCapexExVat: 158644, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "castleknock hotel", aliases: ["Castleknock Hotel"], actualCapexExVat: 133072, treatment: "actual_capex_ac_scope_note", note: "Actual CAPEX includes ancillary AC scope; DC model remains 1 charger / 2 fast plugs." },
  { key: "texaco newcastle", aliases: ["Texaco Newcastle"], actualCapexExVat: 139663, treatment: "actual_capex", note: "Actual project CAPEX provided." },
  { key: "douglas court", aliases: ["Douglas Court", "Douglas Court Shopping Centre", "Douglas Phase 1"], actualCapexExVat: 201933, treatment: "actual_capex_ds480_high_side", note: "Douglas Court loaded as 4 active plugs for current model validation; physical DS480 8-connector hardware retained as inactive capacity context." },
  { key: "banner plaza ennis", aliases: ["Banner Plaza Ennis", "Banner Plaza Ennis Junction 12", "Banner Plaza Ennis, Junction 12"], actualCapexExVat: 865368, treatment: "actual_capex_battery_major_infra", note: "Banner model uses full installed design: 2 triple cabinets + 8 plugs + Polarium large skid battery. Uploaded live actuals may reflect partial activation only; major infrastructure benchmark only." },
  { key: "ashbourne high street", aliases: ["Ashbourne High Street", "Ashbourne Town Centre"], actualCapexExVat: 117121, treatment: "mixed_reference_blocked", note: "Mixed site; shown for reference but blocked from clean model loading." },
  { key: "west point retail park ennis", aliases: ["West Point Retail Park Ennis", "West Point Retail Park - Ennis", "Westpoint Ennis"], actualCapexExVat: 143652, treatment: "mixed_reference_blocked", note: "Mixed DC/AC site; shown for reference but blocked from clean model loading." },
  { key: "fota island resort", aliases: ["Fota Island Resort", "Fota Island Resort 180 kW DC"], actualCapexExVat: 99829, treatment: "review_reference_blocked", note: "MIC not confirmed; shown for reference but blocked from model loading." },
  { key: "killashee house hotel", aliases: ["Killashee House Hotel"], actualCapexExVat: 128154, treatment: "future_hardware_record", note: "Future-only verified hardware record; do not show in active portfolio until live data and AADT mapping are available." },
  { key: "centra a1 banbridge", aliases: ["Centra A1 Banbridge"], actualCapexExVat: 117230, treatment: "outside_roi_reference_blocked", note: "Outside ROI/TII scope; shown for reference but blocked from model loading." }
];

const CAPEX_INDEX = new Map();
for (const row of KNOWN_SITE_CAPEX) {
  [row.key, ...(row.aliases || [])].forEach(alias => {
    const key = capexKey(alias);
    if (key) CAPEX_INDEX.set(key, row);
  });
}

export function actualCapexRecordForSite(siteOrName) {
  const keys = typeof siteOrName === "string"
    ? [siteOrName]
    : [siteOrName?.id, siteOrName?.name, siteOrName?.liveActuals?.siteName, siteOrName?.address].filter(Boolean);
  for (const raw of keys) {
    const found = CAPEX_INDEX.get(capexKey(raw));
    if (found) return found;
  }
  return null;
}

export function actualCapexForSite(siteOrName) {
  const rec = actualCapexRecordForSite(siteOrName);
  return Number(rec?.actualCapexExVat || 0) || 0;
}

export function capexStatusForSite(siteOrName) {
  return actualCapexRecordForSite(siteOrName)?.treatment || "actual_capex_not_provided";
}

export function capexNoteForSite(siteOrName) {
  return actualCapexRecordForSite(siteOrName)?.note || "Actual CAPEX not provided — calibrated model estimate is used.";
}
