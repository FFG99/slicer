export interface PhasePortraitSettings {
  dotSize: number;
  num_iter_transient: number;
  escape_threshold: number;
  num_iter_attractor: number;
}

export const PHASE_PORTRAIT_TRANSIENT_RANGE = [0, 10_000_000] as const;
export const PHASE_PORTRAIT_ATTRACTOR_RANGE = [1, 10_000_000] as const;
export const PHASE_PORTRAIT_DOT_SIZE_RANGE = [0.5, 8] as const;
export const PHASE_PORTRAIT_DOT_COLOR = "#5b8def";

export const defaultPhasePortraitSettings: PhasePortraitSettings = {
  dotSize: 2.5,
  num_iter_transient: 20,
  escape_threshold: 1e6,
  num_iter_attractor: 40,
};
