import type { GridData, Run } from "../types";
import type { PhasePortraitSettings } from "./phasePortraitSettings";
import type { PoolSettings } from "./poolSettings";
import { POOL_CALCULATION_TYPE } from "./labels";

export const GRID_CALCULATION_TYPES = new Set([
  "attraction_map",
  POOL_CALCULATION_TYPE,
  "lyapunov_spectrum",
  "dynamic_modes",
]);

export const PARAMETER_PLANE_TYPES = new Set([
  "attraction_map",
  "lyapunov_spectrum",
  "dynamic_modes",
]);

export interface PhasePortraitContext {
  system: string;
  parameters: Record<string, unknown>;
}

export function isGridCalculation(calculationType: string): boolean {
  return GRID_CALCULATION_TYPES.has(calculationType);
}

export function phasePortraitRequest(
  context: PhasePortraitContext,
  settings: PhasePortraitSettings,
): PhasePortraitContext {
  return {
    system: context.system,
    parameters: {
      ...context.parameters,
      escape_threshold: settings.escape_threshold,
      num_iter_transient: settings.num_iter_transient,
      num_iter_attractor: settings.num_iter_attractor,
      output_mode: "phase_plane",
    },
  };
}

export function phasePortraitContextFromMapClick(
  mapRun: Run,
  grid: GridData,
  world: { x: number; y: number },
): PhasePortraitContext {
  const params = mapRun.parameters;
  const space = grid.frame.space;

  if (space === "ic_plane") {
    const firstVar = String(params.first_var ?? grid.frame.axes[0]?.name ?? "x");
    const secondVar = String(params.second_var ?? grid.frame.axes[1]?.name ?? "y");
    const fixedParams =
      (params.parameters as Record<string, number> | undefined) ??
      grid.frame.parameters ??
      {};
    const startingPoint = (params.starting_point as number[] | undefined) ?? [0.1, 0.1];
    const initial = [...startingPoint];
    const variableOrder = [firstVar, secondVar];
    for (let i = 0; i < initial.length; i++) {
      const name = variableOrder[i];
      if (name === firstVar) {
        initial[i] = world.x;
      } else if (name === secondVar) {
        initial[i] = world.y;
      }
    }

    return {
      system: mapRun.system,
      parameters: {
        parameters: fixedParams,
        initial_conditions: initial,
      },
    };
  }

  const firstParam = String(params.first_param ?? grid.frame.axes[0]?.name ?? "a");
  const secondParam = String(params.second_param ?? grid.frame.axes[1]?.name ?? "b");
  const staticParams =
    (params.static_parameters as Record<string, number> | undefined) ??
    grid.frame.parameters ??
    {};
  const startingPoint = (params.starting_point as number[] | undefined) ?? [0.1, 0.1];

  return {
    system: mapRun.system,
    parameters: {
      parameters: {
        ...staticParams,
        [firstParam]: world.x,
        [secondParam]: world.y,
      },
      initial_conditions: startingPoint,
    },
  };
}

export function parameterAxisNamesFromMap(
  mapRun: Run,
  grid: GridData,
): { x: string; y: string } {
  const params = mapRun.parameters;
  return {
    x: String(params.first_param ?? grid.frame.axes[0]?.name ?? "a"),
    y: String(params.second_param ?? grid.frame.axes[1]?.name ?? "b"),
  };
}

export function parameterPointFromModelParams(
  modelParams: Record<string, number>,
  axisNames: { x: string; y: string },
): { x: number; y: number } | null {
  const x = modelParams[axisNames.x];
  const y = modelParams[axisNames.y];
  if (x === undefined || y === undefined) {
    return null;
  }
  return { x, y };
}

export function modelParamsAtParameterPoint(
  staticParams: Record<string, number>,
  axisNames: { x: string; y: string },
  world: { x: number; y: number },
): Record<string, number> {
  return {
    ...staticParams,
    [axisNames.x]: world.x,
    [axisNames.y]: world.y,
  };
}

export function poolParamsFromFixedPoint(
  modelParameters: Record<string, number>,
  poolSettings: PoolSettings,
  startingPoint: number[] = [0.1, 0.1],
): Record<string, unknown> {
  return {
    parameters: modelParameters,
    first_var: poolSettings.first_var,
    second_var: poolSettings.second_var,
    first_var_min: poolSettings.first_var_min,
    first_var_max: poolSettings.first_var_max,
    second_var_min: poolSettings.second_var_min,
    second_var_max: poolSettings.second_var_max,
    steps: poolSettings.steps,
    starting_point: startingPoint,
    escape_threshold: poolSettings.escape_threshold,
    num_iter_transient: poolSettings.num_iter_transient,
    num_iter_attractor: poolSettings.num_iter_attractor,
    classification_mode: poolSettings.classification_mode,
    accuracy: poolSettings.accuracy,
    match_coverage: poolSettings.match_coverage,
    period_verification_cycles: poolSettings.period_verification_cycles,
    num_lyapunov_exponents: poolSettings.num_lyapunov_exponents,
    preparation_force: poolSettings.preparation_force,
  };
}

export function poolParamsFromMapClick(
  mapRun: Run,
  grid: GridData,
  world: { x: number; y: number },
  poolSettings: PoolSettings,
): Record<string, unknown> {
  const params = mapRun.parameters;
  const firstParam = String(params.first_param ?? grid.frame.axes[0]?.name ?? "a");
  const secondParam = String(params.second_param ?? grid.frame.axes[1]?.name ?? "b");
  const staticParams =
    (params.static_parameters as Record<string, number> | undefined) ??
    grid.frame.parameters ??
    {};
  const startingPoint = (params.starting_point as number[] | undefined) ?? [0.1, 0.1];

  return poolParamsFromFixedPoint(
    modelParamsAtParameterPoint(staticParams, { x: firstParam, y: secondParam }, world),
    poolSettings,
    startingPoint,
  );
}

export function phasePortraitContextFromPoolClick(
  poolRun: Run,
  grid: GridData,
  world: { x: number; y: number },
): PhasePortraitContext {
  const params = poolRun.parameters;
  const firstVar = String(params.first_var ?? grid.frame.axes[0]?.name ?? "x");
  const secondVar = String(params.second_var ?? grid.frame.axes[1]?.name ?? "y");
  const fixedParams =
    (params.parameters as Record<string, number> | undefined) ??
    grid.frame.parameters ??
    {};
  const startingPoint = (params.starting_point as number[] | undefined) ?? [0.1, 0.1];
  const initial = [...startingPoint];
  const variableOrder = [firstVar, secondVar];
  for (let i = 0; i < initial.length; i++) {
    const name = variableOrder[i];
    if (name === firstVar) {
      initial[i] = world.x;
    } else if (name === secondVar) {
      initial[i] = world.y;
    }
  }

  return {
    system: poolRun.system,
    parameters: {
      parameters: fixedParams,
      initial_conditions: initial,
    },
  };
}
