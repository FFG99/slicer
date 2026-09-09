import { NumberInput } from "./NumberInput";
import {
  PHASE_PORTRAIT_ATTRACTOR_RANGE,
  PHASE_PORTRAIT_DOT_SIZE_RANGE,
  PHASE_PORTRAIT_TRANSIENT_RANGE,
  type PhasePortraitSettings,
} from "../lib/phasePortraitSettings";
import type { PhasePortraitContext } from "../lib/linked";

interface PhasePortraitSettingsPanelProps {
  settings: PhasePortraitSettings;
  context: PhasePortraitContext | null;
  loading?: boolean;
  disabled?: boolean;
  onChange: (settings: PhasePortraitSettings) => void;
  onUpdate?: () => void;
  onDownload?: () => void;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => Number(item).toFixed(4)).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, number>)
      .map(([key, val]) => `${key}=${Number(val).toFixed(4)}`)
      .join(", ");
  }
  return String(value ?? "—");
}

export function PhasePortraitSettingsPanel({
  settings,
  context,
  loading = false,
  disabled = false,
  onChange,
  onUpdate,
  onDownload,
}: PhasePortraitSettingsPanelProps) {
  function patch(partial: Partial<PhasePortraitSettings>) {
    onChange({ ...settings, ...partial });
  }

  const jobParams = context?.parameters;
  const systemParams = jobParams?.parameters;
  const initialConditions = jobParams?.initial_conditions;

  return (
    <div className="phase-portrait-settings">
      <div className="phase-portrait-settings-grid">
        <NumberInput label="Порог убегания |x|" value={settings.escape_threshold}
          min={1e-9} disabled={disabled || loading} onChange={(v) => patch({ escape_threshold: v })} />
        <NumberInput
          label="Dot size"
          value={settings.dotSize}
          disabled={disabled || loading}
          min={PHASE_PORTRAIT_DOT_SIZE_RANGE[0]}
          max={PHASE_PORTRAIT_DOT_SIZE_RANGE[1]}
          onChange={(v) => patch({ dotSize: v })}
        />
        <NumberInput
          label="Transient iterations"
          value={settings.num_iter_transient}
          disabled={disabled || loading}
          integer
          min={PHASE_PORTRAIT_TRANSIENT_RANGE[0]}
          max={PHASE_PORTRAIT_TRANSIENT_RANGE[1]}
          onChange={(v) => patch({ num_iter_transient: v })}
        />
        <NumberInput
          label="Attractor iterations"
          value={settings.num_iter_attractor}
          disabled={disabled || loading}
          integer
          min={PHASE_PORTRAIT_ATTRACTOR_RANGE[0]}
          max={PHASE_PORTRAIT_ATTRACTOR_RANGE[1]}
          onChange={(v) => patch({ num_iter_attractor: v })}
        />
      </div>

      {context && (
        <dl className="phase-portrait-params">
          <div>
            <dt>System</dt>
            <dd>{context.system}</dd>
          </div>
          <div>
            <dt>Initial conditions</dt>
            <dd>{formatValue(initialConditions)}</dd>
          </div>
          <div>
            <dt>Parameters</dt>
            <dd>{formatValue(systemParams)}</dd>
          </div>
        </dl>
      )}

      <div className="phase-portrait-actions">
        <button
          type="button"
          className="toolbar-btn"
          disabled={disabled || loading || !context || !onUpdate}
          onClick={onUpdate}
        >
          {loading ? "Computing…" : "Update portrait"}
        </button>
        <button
          type="button"
          className="toolbar-btn secondary"
          disabled={disabled || loading || !context || !onDownload}
          onClick={onDownload}
        >
          Download JSON
        </button>
      </div>
    </div>
  );
}
