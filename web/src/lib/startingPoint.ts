import type { SystemDefinition } from "../types";

export function normalizeStartingPoint(
  point: unknown,
  system: Pick<SystemDefinition, "variables" | "default_starting_point">,
): number[] {
  const current = Array.isArray(point) ? point : [];
  return system.variables.map((_, index) =>
    current[index] ?? system.default_starting_point?.[index] ?? 0.1,
  );
}
