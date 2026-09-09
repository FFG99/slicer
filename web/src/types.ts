export interface AttractionMapParameters {
  first_param: string;
  second_param: string;
  first_param_min: number;
  first_param_max: number;
  second_param_min: number;
  second_param_max: number;
  steps: number;
  first_var: string;
  second_var: string;
  first_var_min: number;
  first_var_max: number;
  second_var_min: number;
  second_var_max: number;
  var_steps: number;
  static_parameters: Record<string, number>;
  starting_point: number[];
  num_iter_transient: number;
  num_iter_attractor: number;
  accuracy: number;
  match_coverage: number;
  period_verification_cycles: number;
}

export interface Run {
  id: string;
  calculation_type: string;
  system: string;
  parameters: Record<string, unknown>;
  frame: Record<string, unknown> | null;
  status: string;
  progress?: number | null;
  artifact_key: string | null;
  artifact_url: string | null;
  parent_run_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunList {
  items: Run[];
  total: number;
}

export interface GridData {
  rows: number;
  cols: number;
  full_rows: number;
  full_cols: number;
  row_offset: number;
  col_offset: number;
  row_end?: number;
  col_end?: number;
  downsample: number;
  value_dtype?: "uint64" | "float64";
  categories?: Array<{ value: number; label: string }>;
  values: number[][];
  frame: {
    system: string;
    space: string;
    parameters?: Record<string, number>;
    axes: Array<{
      name: string;
      role: string;
      min?: number;
      max?: number;
      steps?: number;
      index?: number;
    }>;
  };
}

export interface TrajectoryData {
  points: number;
  dim: number;
  full_points: number;
  start: number;
  end?: number;
  downsample: number;
  t: number[];
  state: number[][];
  frame: GridData["frame"];
}

export interface RegistryParameter {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  range?: [number, number];
  default?: unknown;
  allowed_values?: string[];
  options_source?: "system.parameters" | "system.variables";
}

export interface SystemReference {
  citation: string;
  url: string;
}

export interface SystemDefinition {
  description?: string;
  parameters: string[];
  variables: string[];
  default_starting_point?: number[];
  builtin?: boolean;
  reference?: SystemReference;
  can_delete: boolean;
}

export type SystemsResponse = Record<string, SystemDefinition>;

export interface RegistryCalculation {
  description?: string;
  parameters: RegistryParameter[];
  overlay_with?: string[];
}

export type RegistryResponse = Record<string, RegistryCalculation>;

export const defaultPhasePortraitParameters: Record<string, unknown> = {
  parameters: { a: 1.25, b: 0.3 },
  initial_conditions: [0.1, 0.1],
  num_iter_transient: 50000,
  num_iter_attractor: 5000,
  output_mode: "phase_plane",
};

export const defaultPoolOfAttractionParameters: Record<string, unknown> = {
  first_var: "x",
  second_var: "y",
  first_var_min: -20,
  first_var_max: 20,
  second_var_min: -20,
  second_var_max: 20,
  steps: 100,
  parameters: { a: 1.25, b: 0.3 },
  starting_point: [0.1, 0.1],
  num_iter_transient: 50000,
  num_iter_attractor: 5000,
  classification_mode: "ncf",
  accuracy: 0.001,
  match_coverage: 0.75,
  period_verification_cycles: 2,
  num_lyapunov_exponents: 1,
  preparation_force: 0.00001,
};

export const defaultLyapunovSpectrumParameters: Record<string, unknown> = {
  first_param: "a",
  second_param: "b",
  first_param_min: 1.2,
  first_param_max: 1.3,
  second_param_min: 0.25,
  second_param_max: 0.35,
  steps: 100,
  static_parameters: {},
  starting_point: [0.1, 0.1],
  num_iter_transient: 50000,
  num_iter_attractor: 5000,
  num_lyapunov_exponents: 1,
  preparation_force: 0.00001,
  direction: "n",
};

export const defaultDynamicModesParameters: Record<string, unknown> = {
  first_param: "a",
  second_param: "b",
  first_param_min: 1.2,
  first_param_max: 1.3,
  second_param_min: 0.25,
  second_param_max: 0.35,
  steps: 100,
  static_parameters: {},
  starting_point: [0.1, 0.1],
  num_iter_transient: 50000,
  num_iter_attractor: 5000,
  accuracy: 0.001,
  direction: "n",
};

export const systemDefaultParameters: Record<string, Record<string, number>> = {
  henon: { a: 1.25, b: 0.3 },
  chialvo: { a: 0.2, b: 0.6, c: 1.0, I: -0.5 },
  // Post Neimark-Sacker (|lambda| = sqrt(J), NS line at J = 1); J > 1 gives a
  // bounded chaotic attractor near the origin instead of a stable fixed point.
  universal2d: { S: 0.0, J: 1.5 },
};

/**
 * Parameter-plane sweep defaults per system. Universal2D's tunable parameters
 * are S and J (not a/b), and the interesting regime map lives in
 * S in [-2.1, 1.5], J in [0.95, 1.9] (around the Neimark-Sacker line J = 1).
 */
function sweepAxesForSystem(system: string): {
  first_param: string;
  second_param: string;
  first_param_min: number;
  first_param_max: number;
  second_param_min: number;
  second_param_max: number;
  static_parameters: Record<string, number>;
} {
  const sysParams = systemDefaultParameters[system] ?? systemDefaultParameters.henon!;
  if (system === "chialvo") {
    return {
      first_param: "c",
      second_param: "I",
      first_param_min: 0.265,
      first_param_max: 0.29,
      second_param_min: 0.05,
      second_param_max: 0.075,
      static_parameters: { a: sysParams.a!, b: sysParams.b! },
    };
  }
  if (system === "universal2d") {
    return {
      first_param: "S",
      second_param: "J",
      first_param_min: -2.1,
      first_param_max: 1.5,
      second_param_min: 0.95,
      second_param_max: 1.9,
      static_parameters: {},
    };
  }
  return {
    first_param: "a",
    second_param: "b",
    first_param_min: 1.2,
    first_param_max: 1.3,
    second_param_min: 0.25,
    second_param_max: 0.35,
    static_parameters: {},
  };
}

export function mergeParametersForCalculation(
  calculationType: string,
  system: string,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const defaults = defaultParametersForCalculation(calculationType, system);
  const merged = { ...current };
  for (const [key, value] of Object.entries(defaults)) {
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

export function defaultParametersForCalculation(
  calculationType: string,
  system = "henon",
): Record<string, unknown> {
  const sysParams = systemDefaultParameters[system] ?? systemDefaultParameters.henon!;

  switch (calculationType) {
    case "phase_portrait":
      return { ...defaultPhasePortraitParameters, parameters: { ...sysParams } };
    case "pool_of_attraction":
      return { ...defaultPoolOfAttractionParameters, parameters: { ...sysParams } };
    case "lyapunov_spectrum":
      return {
        ...defaultLyapunovSpectrumParameters,
        ...sweepAxesForSystem(system),
      };
    case "dynamic_modes":
      return {
        ...defaultDynamicModesParameters,
        ...sweepAxesForSystem(system),
      };
    default: {
      return {
        ...defaultAttractionMapParameters,
        ...sweepAxesForSystem(system),
      };
    }
  }
}

export const defaultAttractionMapParameters: AttractionMapParameters = {
  first_param: "a",
  second_param: "b",
  first_param_min: 1.2,
  first_param_max: 1.3,
  second_param_min: 0.25,
  second_param_max: 0.35,
  steps: 100,
  first_var: "x",
  second_var: "y",
  first_var_min: -20,
  first_var_max: 20,
  second_var_min: -20,
  second_var_max: 20,
  var_steps: 100,
  static_parameters: {},
  starting_point: [0.1, 0.1],
  num_iter_transient: 50000,
  num_iter_attractor: 5000,
  accuracy: 0.001,
  match_coverage: 0.75,
  period_verification_cycles: 2,
};
