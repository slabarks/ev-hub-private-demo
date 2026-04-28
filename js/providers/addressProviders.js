import { MOCK_LOCATION } from "./mockProviders.js";

const ADDRESS_SEARCH_TIMEOUT_MS = 18000;

const CLIENT_PLACE_FALLBACKS = [
  { terms: ["dunmanway"], name: "Dunmanway, County Cork", lat: 51.7206, lon: -9.1126 },
  { terms: ["muckross", "killarney"], name: "Muckross / Killarney, County Kerry", lat: 52.0246, lon: -9.5043 },
  { terms: ["muckross"], name: "Muckross, County Kerry", lat: 52.0246, lon: -9.5043 },
  { terms: ["killarney"], name: "Killarney, County Kerry", lat: 52.0599, lon: -9.5044 },
  { terms: ["newmarket"], name: "Newmarket, County Cork", lat: 52.2159, lon: -9.0007 },
  { terms: ["little", "island"], name: "Little Island, County Cork", lat: 51.9074, lon: -8.3543 },
  { terms: ["eastgate"], name: "Eastgate, Little Island, County Cork", lat: 51.90345, lon: -8.36909 },
  { terms: ["mahon"], name: "Mahon, Cork", lat: 51.8859, lon: -8.3932 },
  { terms: ["ballincollig"], name: "Ballincollig, County Cork", lat: 51.8879, lon: -8.5920 },
  { terms: ["mallow"], name: "Mallow, County Cork", lat: 52.1347, lon: -8.6451 },
  { terms: ["bandon"], name: "Bandon, County Cork", lat: 51.7460, lon: -8.7420 },
  { terms: ["bantry"], name: "Bantry, County Cork", lat: 51.6801, lon: -9.4526 },
  { terms: ["clonakilty"], name: "Clonakilty, County Cork", lat: 51.6231, lon: -8.8702 },
  { terms: ["skibbereen"], name: "Skibbereen, County Cork", lat: 51.5500, lon: -9.2667 },
  { terms: ["midleton"], name: "Midleton, County Cork", lat: 51.9153, lon: -8.1805 },
  { terms: ["cork", "airport"], name: "Cork Airport", lat: 51.8413, lon: -8.4911 },
  { terms: ["dublin", "airport"], name: "Dublin Airport", lat: 53.4264, lon: -6.2499 },
  { terms: ["shannon", "airport"], name: "Shannon Airport", lat: 52.7020, lon: -8.9248 },
  { terms: ["cork"], name: "Cork City", lat: 51.8985, lon: -8.4756 },
  { terms: ["dublin"], name: "Dublin", lat: 53.3498, lon: -6.2603 },
  { terms: ["galway"], name: "Galway, County Galway", lat: 53.2707, lon: -9.0568 },
  { terms: ["limerick"], name: "Limerick, County Limerick", lat: 52.6638, lon: -8.6267 },
  { terms: ["waterford"], name: "Waterford, County Waterford", lat: 52.2593, lon: -7.1101 },
  { terms: ["tralee"], name: "Tralee, County Kerry", lat: 52.2713, lon: -9.7026 },
  { terms: ["sligo"], name: "Sligo", lat: 54.2766, lon: -8.4761 },
  { terms: ["ennis"], name: "Ennis", lat: 52.8463, lon: -8.9807 },
  { terms: ["athlone"], name: "Athlone", lat: 53.4239, lon: -7.9407 },
  { terms: ["portlaoise"], name: "Portlaoise", lat: 53.0344, lon: -7.2998 },
  { terms: ["naas"], name: "Naas", lat: 53.2206, lon: -6.6593 },
  { terms: ["dundalk"], name: "Dundalk", lat: 54.0090, lon: -6.4049 },
  { terms: ["drogheda"], name: "Drogheda", lat: 53.7179, lon: -6.3561 }
];

function clientKnownPlaceFallback(address) {
  const lower = String(address || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const compact = lower.replace(/\s+/g, "");
  return CLIENT_PLACE_FALLBACKS.find(place => place.terms.every(term => lower.includes(term) || compact.includes(term.replace(/\s+/g, "")))) || null;
}

function safeFallbackLocation(address, reason) {
  const place = clientKnownPlaceFallback(address);
  if (place) {
    return {
      ok: true,
      site: { name: place.name, lat: place.lat, lon: place.lon, source: "Client-side Irish town/place fallback", confidence: "nearest known place fallback" },
      traffic: {
        aadt: 12000,
        source: "Fallback AADT estimate only — server search did not complete",
        confidence: "low / fallback",
        provider: "Client-side place fallback",
        method_note: "Search timed out or server was unavailable. Map centred on the nearest known Irish place. Use TII import/manual AADT for investment-grade validation."
      },
      chargers: [],
      warning: `Address search did not complete within ${Math.round(ADDRESS_SEARCH_TIMEOUT_MS/1000)}s. Map centred on ${place.name} as nearest available fallback. Detail: ${reason}`,
      provider_log: { geocode_attempts: [{ provider: "browser timeout guard / client place fallback", status: "fallback", error: reason }], charger_providers: [], traffic_provider: { provider: "Client-side place fallback", confidence: "low / fallback" } },
      debug: { client_fallback: true, reason }
    };
  }
  const mock = JSON.parse(JSON.stringify(MOCK_LOCATION));
  mock.site = { name: address || "Unresolved Irish address", lat: 53.35, lon: -7.70, source: "Client-side Ireland-centre fallback only — no known town/place match", confidence: "unresolved map fallback" };
  mock.chargers = [];
  mock.traffic = {
    aadt: 12000,
    source: "Fallback AADT estimate only — server search did not complete",
    confidence: "low / fallback",
    provider: "Client-side fallback",
    method_note: "Search timed out or server was unavailable. Use TII import/manual AADT for investment-grade validation."
  };
  mock.warning = `Address search did not complete within ${Math.round(ADDRESS_SEARCH_TIMEOUT_MS/1000)}s. The button was reset and a safe fallback was used. Detail: ${reason}`;
  mock.provider_log = { geocode_attempts: [{ provider: "browser timeout guard", status: "fallback", error: reason }], charger_providers: [], traffic_provider: { provider: "Client-side fallback", confidence: "low / fallback" } };
  mock.debug = { client_fallback: true, reason };
  return mock;
}

export async function searchLocation(address, radiusKm, opts = {}) {
  const timeoutMs = opts.timeoutMs || ADDRESS_SEARCH_TIMEOUT_MS;
  const controller = new AbortController();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      try { controller.abort(new DOMException("Address search timed out", "TimeoutError")); } catch (_) { controller.abort(); }
      reject(new DOMException("Address search timed out", "TimeoutError"));
    }, timeoutMs);
  });
  try {
    const fetchPromise = fetch(`/api/search?address=${encodeURIComponent(address)}&radius_km=${encodeURIComponent(radiusKm)}`, { cache: "no-store", signal: controller.signal });
    const resp = await Promise.race([fetchPromise, timeoutPromise]);
    let data = null;
    try { data = await Promise.race([resp.json(), timeoutPromise]); } catch (_) { throw new Error(`Search returned HTTP ${resp.status} without valid JSON`); }
    if (!resp.ok || !data.ok) throw new Error(data?.error || `Search failed with HTTP ${resp.status}`);
    return data;
  } catch (error) {
    const reason = error?.name === "AbortError" || error?.name === "TimeoutError" ? "Search timed out" : (error?.message || String(error));
    return safeFallbackLocation(address, reason);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function searchCoordinates(lat, lon, radiusKm, label = "Manual map point", opts = {}) {
  const timeoutMs = opts.timeoutMs || ADDRESS_SEARCH_TIMEOUT_MS;
  const controller = new AbortController();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      try { controller.abort(new DOMException("Coordinate search timed out", "TimeoutError")); } catch (_) { controller.abort(); }
      reject(new DOMException("Coordinate search timed out", "TimeoutError"));
    }, timeoutMs);
  });
  try {
    const qs = new URLSearchParams({
      address: label,
      lat: String(lat),
      lon: String(lon),
      radius_km: String(radiusKm),
      manual_point: "true"
    });
    const fetchPromise = fetch(`/api/search?${qs.toString()}`, { cache: "no-store", signal: controller.signal });
    const resp = await Promise.race([fetchPromise, timeoutPromise]);
    let data = null;
    try { data = await Promise.race([resp.json(), timeoutPromise]); } catch (_) { throw new Error(`Coordinate search returned HTTP ${resp.status} without valid JSON`); }
    if (!resp.ok || !data.ok) throw new Error(data?.error || `Coordinate search failed with HTTP ${resp.status}`);
    return data;
  } catch (error) {
    const reason = error?.name === "AbortError" || error?.name === "TimeoutError" ? "Coordinate search timed out" : (error?.message || String(error));
    return {
      ok: true,
      site: { name: label, lat: Number(lat), lon: Number(lon), source: "Manual map point fallback after coordinate search error", confidence: "manual coordinates" },
      traffic: {
        aadt: 12000,
        source: "Fallback AADT estimate only — coordinate search did not complete",
        confidence: "low / manual coordinate fallback",
        provider: "Manual coordinate fallback",
        method_note: "The map point is exact, but traffic should be validated with TII map/import or manual AADT."
      },
      chargers: [],
      warning: `Manual map point selected, but coordinate search did not complete. Detail: ${reason}`,
      provider_log: { geocode_attempts: [{ provider: "manual coordinate fallback", status: "fallback", error: reason }], charger_providers: [], traffic_provider: { provider: "Manual coordinate fallback", confidence: "low / manual coordinate fallback" } },
      debug: { client_coordinate_fallback: true, reason }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function connectorPower(connector) {
  const p = connector?.power;
  return typeof p === "number" ? p : Number.isFinite(Number(p)) ? Number(p) : null;
}

export function connectorQuantity(connector) {
  const q = connector?.quantity;
  return Number.isFinite(Number(q)) ? Number(q) : 0;
}

export function maxConnectorPower(site) {
  const powers = (site.connectors || []).map(connectorPower).filter(Number.isFinite);
  return powers.length ? Math.max(...powers) : null;
}

export function totalConnectors(site) {
  return (site.connectors || []).reduce((a, c) => a + connectorQuantity(c), 0);
}

export function categoryForPower(powerKw) {
  if (powerKw == null || !Number.isFinite(powerKw) || powerKw < 7) return "Slow / unknown";
  if (powerKw >= 100) return "Ultra 100+ kW";
  if (powerKw >= 50) return "Rapid 50–99 kW";
  return "Fast 7–49 kW";
}

export function filterChargers(chargers, { radiusKm, minPower, category }) {
  const min = minPower === "Any" ? 0 : Number(String(minPower).replace(" kW+", ""));
  return (chargers || []).filter(site => {
    if (Number.isFinite(site.distance_km) && site.distance_km > radiusKm) return false;
    const connectors = site.connectors || [];
    return connectors.some(connector => {
      const p = connectorPower(connector);
      const powerPass = min === 0 || (Number.isFinite(p) && p >= min);
      const catPass = category === "Any" || categoryForPower(p) === category;
      return powerPass && catPass;
    });
  });
}
