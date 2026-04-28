import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG } from "./data/defaultAssumptions.js";
import { MOCK_LOCATION } from "./providers/mockProviders.js";

export const state = {
  inputs: { ...DEFAULT_INPUTS },
  config: { ...DEFAULT_SELECTED_CONFIG },
  siteContext: { ...MOCK_LOCATION },
  filters: {
    radiusKm: 3,
    minPower: "Any",
    category: "Any",
    manualAadtOverride: false
  }
};

export function setInput(key, value) {
  state.inputs[key] = value;
  if (key === "modelStartYear") state.inputs.codYear = value;
  if (key === "codYear") state.inputs.modelStartYear = value;
}

export function setConfig(key, value) {
  state.config[key] = value;
}

export function setSiteContext(siteContext) {
  state.siteContext = siteContext;
}

export function resetState() {
  Object.assign(state.inputs, DEFAULT_INPUTS);
  Object.assign(state.config, DEFAULT_SELECTED_CONFIG);
  state.siteContext = { ...MOCK_LOCATION };
  state.filters.radiusKm = 3;
  state.filters.minPower = "Any";
  state.filters.category = "Any";
  state.filters.manualAadtOverride = false;
}
