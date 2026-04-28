export const BATTERY_LIBRARY = [
  { item: "No battery", compatiblePlatform: "All", powerKw: 0, energyKwh: 0, hardwareCost: 0, installComm: 0, warrantyYrs: 0, notes: "No BESS selected — grid-only configuration", logisticsCost: 0, installCommissioning: 0 },
  { item: "Autel 1x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 125, energyKwh: 261, hardwareCost: 52441.87, installComm: 48900, warrantyYrs: 5, notes: "Replacement hw only = €52,442; initial install one-off = €48,900", logisticsCost: 2517.49, installCommissioning: 0 },
  { item: "Autel 2x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 250, energyKwh: 522, hardwareCost: 96188.74, installComm: 48900, warrantyYrs: 5, notes: "Replacement hw only = €96,189; initial install one-off = €48,900", logisticsCost: 5034.98, installCommissioning: 0 },
  { item: "Autel 3x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 375, energyKwh: 783, hardwareCost: 139935.61, installComm: 48900, warrantyYrs: 5, notes: "Replacement hw only = €139,936; initial install one-off = €48,900", logisticsCost: 7552.47, installCommissioning: 0 },
  { item: "Autel 4x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 500, energyKwh: 1044, hardwareCost: 183682.48, installComm: 48900, warrantyYrs: 5, notes: "Replacement hw only = €183,682; initial install one-off = €48,900", logisticsCost: 10069.96, installCommissioning: 0 },
  { item: "Autel 5x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 625, energyKwh: 1305, hardwareCost: 227429.35, installComm: 48900, warrantyYrs: 5, notes: "Replacement hw only = €227,429; initial install one-off = €48,900", logisticsCost: 12587.45, installCommissioning: 0 },
  { item: "Autel 6x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 750, energyKwh: 1566, hardwareCost: 271176.22, installComm: 48900, warrantyYrs: 5, notes: "Replacement hw only = €271,176; initial install one-off = €48,900", logisticsCost: 15104.94, installCommissioning: 0 },
  { item: "Autel 7x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 875, energyKwh: 1827, hardwareCost: 314923.09, installComm: 48900, warrantyYrs: 5, notes: "Replacement hw only = €314,923; initial install one-off = €48,900", logisticsCost: 17622.43, installCommissioning: 0 },
  { item: "Polarium S-150kVA/280kWh", compatiblePlatform: "Kempower", powerKw: 150, energyKwh: 280, hardwareCost: 63730, installComm: 9980, warrantyYrs: 5, notes: "Replacement hw only = €63,730; initial install one-off = €9,980", logisticsCost: 1140, installCommissioning: 6754 },
  { item: "Polarium M-300kVA/560kWh", compatiblePlatform: "Kempower", powerKw: 300, energyKwh: 560, hardwareCost: 102730, installComm: 9980, warrantyYrs: 5, notes: "Replacement hw only = €102,730; initial install one-off = €9,980", logisticsCost: 1837, installCommissioning: 10887 },
  { item: "Polarium L-600kVA/1120kWh (No skid)", compatiblePlatform: "Kempower", powerKw: 600, energyKwh: 1120, hardwareCost: 191820, installComm: 9980, warrantyYrs: 5, notes: "Replacement hw only = €191,820; initial install one-off = €9,980", logisticsCost: 3431, installCommissioning: 20328 },
  { item: "Polarium L-600kVA/1120kWh (With skid)", compatiblePlatform: "Kempower", powerKw: 600, energyKwh: 1120, hardwareCost: 223640, installComm: 9980, warrantyYrs: 5, notes: "Replacement hw only = €223,640; initial install one-off = €9,980", logisticsCost: 4000, installCommissioning: 23700 }
];

export function batteryItem(name) {
  return BATTERY_LIBRARY.find(x => x.item === name) || BATTERY_LIBRARY[0];
}

export function batteryOptionsFor(platform, batteryStrategy = "Grid + battery") {
  if (batteryStrategy === "Grid only") return [BATTERY_LIBRARY[0]];
  if (!platform) return BATTERY_LIBRARY;
  if (platform.includes("Kempower")) return BATTERY_LIBRARY.filter(x => x.compatiblePlatform === "Kempower");
  if (platform.includes("Autel")) return BATTERY_LIBRARY.filter(x => x.compatiblePlatform === "Autel");
  return BATTERY_LIBRARY;
}
