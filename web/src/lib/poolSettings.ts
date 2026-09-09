import type { PhasePortraitSettings } from "./phasePortraitSettings";
import type { TrajectoryData } from "../types";

export type PoolClassificationMode = "ncf" | "period" | "lyapunov";

export interface PoolSettings {
  first_var: string;
  second_var: string;
  first_var_min: number;
  first_var_max: number;
  second_var_min: number;
  second_var_max: number;
  steps: number;
  num_iter_transient: number;
  escape_threshold: number;
  num_iter_attractor: number;
  classification_mode: PoolClassificationMode;
  accuracy: number;
  /** Fraction of each omega-limit sample that must match in both directions. */
  match_coverage: number;
  /** Full cycle repeats verified at the end of the attractor window. */
  period_verification_cycles: number;
  num_lyapunov_exponents: number;
  preparation_force: number;
}

export const defaultPoolSettings: PoolSettings = {
  first_var: "x",
  second_var: "y",
  first_var_min: -20,
  first_var_max: 20,
  second_var_min: -20,
  second_var_max: 20,
  steps: 100,
  num_iter_transient: 50000,
  escape_threshold: 1e6,
  num_iter_attractor: 5000,
  classification_mode: "ncf",
  accuracy: 0.001,
  match_coverage: 0.75,
  period_verification_cycles: 2,
  num_lyapunov_exponents: 1,
  preparation_force: 0.00001,
};

export function poolSettingsFromMapParameters(
  mapParameters: Record<string, unknown>,
  poolSettings: PoolSettings,
): PoolSettings {
  return {
    ...poolSettings,
    escape_threshold: Number(mapParameters.escape_threshold ?? poolSettings.escape_threshold),
    first_var: String(mapParameters.first_var ?? poolSettings.first_var),
    second_var: String(mapParameters.second_var ?? poolSettings.second_var),
    first_var_min: Number(mapParameters.first_var_min ?? poolSettings.first_var_min),
    first_var_max: Number(mapParameters.first_var_max ?? poolSettings.first_var_max),
    second_var_min: Number(mapParameters.second_var_min ?? poolSettings.second_var_min),
    second_var_max: Number(mapParameters.second_var_max ?? poolSettings.second_var_max),
    num_iter_transient: Number(
      mapParameters.num_iter_transient ?? poolSettings.num_iter_transient,
    ),
    num_iter_attractor: Number(
      mapParameters.num_iter_attractor ?? poolSettings.num_iter_attractor,
    ),
    classification_mode: (mapParameters.classification_mode ??
      poolSettings.classification_mode) as PoolClassificationMode,
    accuracy: Number(mapParameters.accuracy ?? poolSettings.accuracy),
    match_coverage: Number(mapParameters.match_coverage ?? poolSettings.match_coverage),
    period_verification_cycles: Number(
      mapParameters.period_verification_cycles ?? poolSettings.period_verification_cycles,
    ),
    num_lyapunov_exponents: Number(
      mapParameters.num_lyapunov_exponents ?? poolSettings.num_lyapunov_exponents,
    ),
    preparation_force: Number(
      mapParameters.preparation_force ?? poolSettings.preparation_force,
    ),
  };
}

export function poolSettingsFromPortrait(
  base: PoolSettings,
  portraitSettings: PhasePortraitSettings,
  trajectory: TrajectoryData | null,
): PoolSettings {
  let next: PoolSettings = {
    ...base,
    escape_threshold: portraitSettings.escape_threshold,
    num_iter_transient: portraitSettings.num_iter_transient,
    num_iter_attractor: portraitSettings.num_iter_attractor,
  };

  if (!trajectory || trajectory.frame.space !== "phase_plane") {
    return next;
  }

  const frame = trajectory.frame;
  const xAxis = frame.axes[0];
  const yAxis = frame.axes[1];
  const xIndex = xAxis?.index ?? 0;
  const yIndex = yAxis?.index ?? 1;
  const xs = trajectory.state.map((row) => row[xIndex] ?? 0);
  const ys = trajectory.state.map((row) => row[yIndex] ?? 0);
  if (!xs.length) {
    return next;
  }

  const pad = 0.15;
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 0.2;
  const yRange = yMax - yMin || 0.2;

  return {
    ...next,
    first_var: xAxis?.name ?? base.first_var,
    second_var: yAxis?.name ?? base.second_var,
    first_var_min: xMin - pad * xRange,
    first_var_max: xMax + pad * xRange,
    second_var_min: yMin - pad * yRange,
    second_var_max: yMax + pad * yRange,
  };
}

export function resolvePoolClassificationMode(
  mode: unknown,
  valueDtype?: "uint64" | "float64",
): PoolClassificationMode {
  if (mode === "period" || mode === "lyapunov" || mode === "ncf") {
    return mode;
  }
  if (valueDtype === "float64") {
    return "lyapunov";
  }
  return "ncf";
}

/** Legend / palette id for pool visualization (matches dynamic_modes or lyapunov_spectrum). */
export function poolLegendCalculationType(mode: PoolClassificationMode): string {
  switch (mode) {
    case "period":
      return "dynamic_modes";
    case "lyapunov":
      return "lyapunov_spectrum";
    default:
      return "pool_of_attraction";
  }
}
