export interface FixedPoint {
  state: number[];
  residual: number;
  multipliers: [number, number][];
  stability: "stable" | "saddle" | "repeller" | "nonhyperbolic";
  type: string;
  unstable_dimension: number;
  conditions: string[];
}
export interface FixedPointSample {
  t?: number;
  parameter: number;
  model_parameters?: Record<string, number>;
  points: FixedPoint[];
  attempts: number;
  failed_attempts: number;
  invalid_derivatives: number;
}
export interface FixedPointResult {
  system: string;
  parameter: string;
  variables: string[];
  model_parameters: Record<string, number>;
  start?: Record<string, number>;
  end?: Record<string, number>;
  settings: Record<string, unknown>;
  total: number;
  offset: number;
  samples: FixedPointSample[];
}

export function fixedPointEndpoints(parameters: Record<string, unknown>): [Record<string, number>, Record<string, number>] {
  if (parameters.start && parameters.end) return [parameters.start as Record<string, number>, parameters.end as Record<string, number>];
  const model = parameters.model_parameters as Record<string, number>;
  const parameter = String(parameters.parameter);
  return [{ ...model, [parameter]: Number(parameters.parameter_min) }, { ...model, [parameter]: Number(parameters.parameter_max) }];
}

export function supportsFixedPointDiagram(dimension: number) { return dimension === 1 || dimension === 2; }

export const fixedPointConditionLabels: Record<string, string> = {
  mu_plus_one: "μ ≈ +1", mu_minus_one: "μ ≈ −1", unit_complex_pair: "комплексная пара |μ| ≈ 1",
};
export const fixedPointStyles = {
  attracting: { code: 'Stable', label: 'Асимптотически устойчивая неподвижная точка', color: '#15803d' },
  repelling: { code: 'Unstable', label: 'Неустойчивая неподвижная точка', color: '#d97706' },
  stable_node: { code: 'Stable Node', label: 'Устойчивый узел', color: '#15803d' },
  repeller_node: { code: 'Unstable Node', label: 'Неустойчивый узел', color: '#d97706' },
  saddle: { code: 'Saddle', label: 'Седло', color: '#7c3aed' },
  stable_focus: { code: 'Stable Focus', label: 'Устойчивый фокус', color: '#2563eb' },
  repeller_focus: { code: 'Unstable Focus', label: 'Неустойчивый фокус', color: '#dc2626' },
  nonhyperbolic: { code: 'Nonhyperbolic', label: 'Негиперболическая точка', color: '#6b7280' },
};

export function fixedPointStyle(point: Pick<FixedPoint, 'type' | 'state'>) {
  let type = point.type;
  // Old scalar artifacts used the planar node names. Interpret those results
  // using their state dimension rather than showing a planar type in 1D.
  if (point.state.length === 1) {
    if (type === 'stable' || type === 'stable_node') type = 'attracting';
    if (type === 'repeller' || type === 'repeller_node') type = 'repelling';
  }
  return fixedPointStyles[type as keyof typeof fixedPointStyles] ?? fixedPointStyles.nonhyperbolic;
}

export function fixedPointLegend(result: FixedPointResult) {
  const types: (keyof typeof fixedPointStyles)[] = result.variables.length === 1
    ? ['attracting', 'repelling']
    : ['stable_node', 'repeller_node', 'saddle', 'stable_focus', 'repeller_focus'];
  if (result.samples.some(s => s.points.some(p => p.type === 'nonhyperbolic'))) types.push('nonhyperbolic');
  return types.map(type => fixedPointStyles[type]);
}
