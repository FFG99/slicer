export const CALCULATION_LABELS: Record<string, string> = {
  attraction_map: "Attraction map",
  attraction_map_composition: "Attraction map · EP/P/NP",
  attraction_map_periods: "Attraction map · periods",
  pool_of_attraction: "Pool of attraction",
  lyapunov_spectrum: "Lyapunov spectrum",
  dynamic_modes: "Dynamic modes",
  phase_portrait: "Phase portrait",
};

export function calculationLabel(type: string): string {
  return CALCULATION_LABELS[type] ?? type.replace(/_/g, " ");
}

export const SIDEBAR_CALCULATION_TYPES = new Set([
  "attraction_map",
  "lyapunov_spectrum",
  "dynamic_modes",
]);

export const PHASE_PORTRAIT_CALCULATION_TYPE = "phase_portrait";
export const POOL_CALCULATION_TYPE = "pool_of_attraction";
