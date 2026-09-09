import { systemDefaultParameters } from "../types";

export function sweptParameterNames(parameters: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  const first = parameters.first_param;
  const second = parameters.second_param;
  if (first) {
    names.add(String(first));
  }
  if (second) {
    names.add(String(second));
  }
  return names;
}

export function staticParameterNames(
  systemParameters: string[],
  swept: Set<string>,
): string[] {
  return systemParameters.filter((name) => !swept.has(name));
}

export function mergeStaticParameters(
  current: Record<string, number>,
  systemParameters: string[],
  swept: Set<string>,
  system: string,
): Record<string, number> {
  const defaults = systemDefaultParameters[system] ?? systemDefaultParameters.henon!;
  const next: Record<string, number> = {};
  for (const name of staticParameterNames(systemParameters, swept)) {
    next[name] = current[name] ?? defaults[name] ?? 0;
  }
  return next;
}

export function withSyncedStaticParameters(
  parameters: Record<string, unknown>,
  systemParameters: string[],
  system: string,
): Record<string, unknown> {
  if (!("static_parameters" in parameters)) {
    return parameters;
  }
  const swept = sweptParameterNames(parameters);
  const current = (parameters.static_parameters as Record<string, number> | undefined) ?? {};
  return {
    ...parameters,
    static_parameters: mergeStaticParameters(current, systemParameters, swept, system),
  };
}
