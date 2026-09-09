import { NumberInput } from "./NumberInput";
import { CollapsibleSection } from "./CollapsibleSection";
import type { PoolClassificationMode, PoolSettings } from "../lib/poolSettings";
import type { SystemDefinition } from "../types";

interface PoolSettingsPanelProps {
  settings: PoolSettings;
  systemInfo: SystemDefinition | null;
  disabled?: boolean;
  onChange: (settings: PoolSettings) => void;
  /** Manual (I, c) or other sweep-axis values — alternative to clicking the map. */
  parameterPoint?: { x: number; y: number } | null;
  parameterAxisNames?: { x: string; y: string };
  onParameterPointChange?: (point: { x: number; y: number }) => void;
  /** Full model parameters when no parameter-plane layer is loaded. */
  standaloneParameters?: Record<string, number>;
  onStandaloneParametersChange?: (params: Record<string, number>) => void;
  standaloneMode?: boolean;
}

const CLASSIFICATION_MODE_LABELS: Record<PoolClassificationMode, string> = {
  ncf: "NCF (отпечаток)",
  period: "Период",
  lyapunov: "Показатель Ляпунова",
};

export function PoolSettingsPanel({
  settings,
  systemInfo,
  disabled = false,
  onChange,
  parameterPoint = null,
  parameterAxisNames,
  onParameterPointChange,
  standaloneParameters,
  onStandaloneParametersChange,
  standaloneMode = false,
}: PoolSettingsPanelProps) {
  const variables = systemInfo?.variables ?? [settings.first_var, settings.second_var];
  const mode = settings.classification_mode;
  const modelParamNames = systemInfo?.parameters ?? [];

  function patch(partial: Partial<PoolSettings>) {
    onChange({ ...settings, ...partial });
  }

  function patchStandaloneParam(name: string, value: number) {
    if (!standaloneParameters || !onStandaloneParametersChange) {
      return;
    }
    onStandaloneParametersChange({ ...standaloneParameters, [name]: value });
  }

  return (
    <div className="pool-settings">
      {standaloneMode && standaloneParameters && onStandaloneParametersChange && (
        <CollapsibleSection title="Параметры модели" defaultOpen>
          <div className="field-grid pool-settings-grid">
            {modelParamNames.map((name) => (
              <NumberInput
                key={name}
                label={name}
                value={standaloneParameters[name] ?? 0}
                disabled={disabled}
                onChange={(v) => patchStandaloneParam(name, v)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {!standaloneMode && parameterAxisNames && onParameterPointChange && (
        <CollapsibleSection title="Точка в плоскости параметров" defaultOpen>
          <div className="field-grid pool-settings-grid">
            <NumberInput
              label={parameterAxisNames.x}
              value={parameterPoint?.x ?? 0}
              disabled={disabled}
              onChange={(v) =>
                onParameterPointChange({
                  x: v,
                  y: parameterPoint?.y ?? 0,
                })
              }
            />
            <NumberInput
              label={parameterAxisNames.y}
              value={parameterPoint?.y ?? 0}
              disabled={disabled}
              onChange={(v) =>
                onParameterPointChange({
                  x: parameterPoint?.x ?? 0,
                  y: v,
                })
              }
            />
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Окно IC" defaultOpen={false}>
        <div className="field-grid pool-settings-grid">
        <label className="field">
          <span>First variable</span>
          <select
            disabled={disabled}
            value={settings.first_var}
            onChange={(e) => patch({ first_var: e.target.value })}
          >
            {variables.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Second variable</span>
          <select
            disabled={disabled}
            value={settings.second_var}
            onChange={(e) => patch({ second_var: e.target.value })}
          >
            {variables.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <NumberInput
          label={`${settings.first_var} min`}
          value={settings.first_var_min}
          disabled={disabled}
          onChange={(v) => patch({ first_var_min: v })}
        />
        <NumberInput
          label={`${settings.first_var} max`}
          value={settings.first_var_max}
          disabled={disabled}
          onChange={(v) => patch({ first_var_max: v })}
        />
        <NumberInput
          label={`${settings.second_var} min`}
          value={settings.second_var_min}
          disabled={disabled}
          onChange={(v) => patch({ second_var_min: v })}
        />
        <NumberInput
          label={`${settings.second_var} max`}
          value={settings.second_var_max}
          disabled={disabled}
          onChange={(v) => patch({ second_var_max: v })}
        />
        <NumberInput
          label="Grid steps"
          value={settings.steps}
          disabled={disabled}
          integer
          min={8}
          max={512}
          onChange={(v) => patch({ steps: v })}
        />
        <NumberInput
          label="Порог убегания |x|" value={settings.escape_threshold} min={1e-9} disabled={disabled} onChange={(v)=>patch({escape_threshold:v})}
        />
        <NumberInput
          label="Transient iterations"
          value={settings.num_iter_transient}
          disabled={disabled}
          integer
          min={0}
          onChange={(v) => patch({ num_iter_transient: v })}
        />
        <NumberInput
          label="Attractor iterations"
          value={settings.num_iter_attractor}
          disabled={disabled}
          integer
          min={1}
          onChange={(v) => patch({ num_iter_attractor: v })}
        />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Классификация аттракторов" defaultOpen={false}>
        <div className="field-grid pool-settings-grid">
        <label className="field">
          <span>Режим</span>
          <select
            disabled={disabled}
            value={settings.classification_mode}
            onChange={(e) =>
              patch({ classification_mode: e.target.value as PoolClassificationMode })
            }
          >
            {(Object.keys(CLASSIFICATION_MODE_LABELS) as PoolClassificationMode[]).map(
              (value) => (
                <option key={value} value={value}>
                  {CLASSIFICATION_MODE_LABELS[value]}
                </option>
              ),
            )}
          </select>
        </label>

        {(mode === "ncf" || mode === "period") && (
          <>
            <NumberInput
              label="Accuracy (ε)"
              value={settings.accuracy}
              disabled={disabled}
              min={0}
              onChange={(v) => patch({ accuracy: v })}
            />
            <NumberInput
              label="Повторов цикла"
              value={settings.period_verification_cycles}
              disabled={disabled}
              integer
              min={1}
              max={8}
              onChange={(v) => patch({ period_verification_cycles: v })}
            />
          </>
        )}

        {mode === "ncf" && (
          <NumberInput
            label="Match coverage (0–1)"
            value={settings.match_coverage}
            disabled={disabled}
            min={0.5}
            max={1}
            onChange={(v) => patch({ match_coverage: v })}
          />
        )}

        {mode === "lyapunov" && (
          <>
            <NumberInput
              label="Lyapunov exponents"
              value={settings.num_lyapunov_exponents}
              disabled={disabled}
              integer
              min={1}
              max={32}
              onChange={(v) => patch({ num_lyapunov_exponents: v })}
            />
            <NumberInput
              label="Preparation force"
              value={settings.preparation_force}
              disabled={disabled}
              onChange={(v) => patch({ preparation_force: v })}
            />
          </>
        )}

        </div>
      </CollapsibleSection>
    </div>
  );
}
