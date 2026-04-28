export const PLATFORM_LIBRARY = [
  { item: "Autel DH240 — 160 kW", platform: "Autel Standalone", type: "All-in-One", powerKw: 160, unitCost: 22979, outputs: 2, maxDualDisp: null, commissioning: 844 },
  { item: "Autel DH240 — 240 kW", platform: "Autel Standalone", type: "All-in-One", powerKw: 240, unitCost: 26387, outputs: 2, maxDualDisp: null, commissioning: 844 },
  { item: "Autel DH480 — 320 kW", platform: "Autel Standalone", type: "All-in-One", powerKw: 320, unitCost: 34859, outputs: 2, maxDualDisp: null, commissioning: 844 },
  { item: "Autel DH480 — 400 kW", platform: "Autel Standalone", type: "All-in-One", powerKw: 400, unitCost: 38267, outputs: 2, maxDualDisp: null, commissioning: 844 },
  { item: "Autel DH480 — 480 kW", platform: "Autel Standalone", type: "All-in-One", powerKw: 480, unitCost: 41675, outputs: 2, maxDualDisp: null, commissioning: 844 },
  { item: "Autel Single Cabinet", platform: "Autel Distributed", type: "Cabinet", powerKw: 480, unitCost: 39760, outputs: 8, maxDualDisp: 4, commissioning: 666 },
  { item: "Autel Double Cabinet 480-960", platform: "Autel Distributed", type: "Cabinet", powerKw: 960, unitCost: 60208, outputs: 12, maxDualDisp: 6, commissioning: 666 },
  { item: "Autel Triple Cabinet 960-1440", platform: "Autel Distributed", type: "Cabinet", powerKw: 1440, unitCost: 80656, outputs: 14, maxDualDisp: 7, commissioning: 666 },
  { item: "Autel Sat (dual dispenser)", platform: "Autel Distributed", type: "Dispenser", powerKw: 400, unitCost: 9347, outputs: 2, maxDualDisp: null, commissioning: null },
  { item: "Kempower Single Cabinet", platform: "Kempower Distributed", type: "Cabinet", powerKw: 200, unitCost: 29213, outputs: 4, maxDualDisp: 2, commissioning: 784 },
  { item: "Kempower Double Cabinet", platform: "Kempower Distributed", type: "Cabinet", powerKw: 400, unitCost: 62399, outputs: 8, maxDualDisp: 4, commissioning: 784 },
  { item: "Kempower Triple Cabinet", platform: "Kempower Distributed", type: "Cabinet", powerKw: 600, unitCost: 93156, outputs: 8, maxDualDisp: 4, commissioning: 784 },
  { item: "Kempower Dual Sat", platform: "Kempower Distributed", type: "Dispenser", powerKw: 400, unitCost: 7481, outputs: 2, maxDualDisp: null, commissioning: null },
  { item: "Autel DC Compact 50 — 50 kW", platform: "Autel Standalone", type: "All-in-One", powerKw: 50, unitCost: 9084, outputs: 2, maxDualDisp: null, commissioning: 446 }
];

export function platformItem(name) {
  return PLATFORM_LIBRARY.find(x => x.item === name) || null;
}

export function dispenserNameForPlatform(platform) {
  return platform && platform.includes("Kempower") ? "Kempower Dual Sat" : "Autel Sat (dual dispenser)";
}

export function cabinetOptions(platform) {
  return PLATFORM_LIBRARY.filter(x => x.type === "Cabinet" && x.platform === platform);
}

export function standaloneChargerOptions() {
  return PLATFORM_LIBRARY.filter(x => x.type === "All-in-One" && x.platform === "Autel Standalone");
}
