import { PoolSettingsPanel } from "./PoolSettingsPanel";
import { RunHistoryPicker } from "./RunHistoryPicker";
import { defaultLayerLabel } from "../lib/layerLabels";
import { POOL_CALCULATION_TYPE } from "../lib/labels";
import type { PhasePortraitSettings } from "../lib/phasePortraitSettings";
import type { PoolClassificationMode, PoolSettings } from "../lib/poolSettings";
import { downloadPoolGrid } from "../lib/svgExport";
import type { PortraitOverlay } from "../lib/portraitOverlay";
import type { Run, SystemDefinition, GridData } from "../types";

interface VariablesPanelStarterProps {
  systemInfo: SystemDefinition | null;
  poolSettings: PoolSettings;
  onPoolSettingsChange: (settings: PoolSettings) => void;
  poolBusy: boolean;
  poolComputeDisabled: boolean;
  onComputePool: () => void;
  poolReady: boolean;
  poolGrid: GridData | null;
  poolLabel?: string;
  poolClassificationMode?: PoolClassificationMode;
  poolLyapunovZero?: number;
  portraitOverlays?: PortraitOverlay[];
  showPortraitOverlay?: boolean;
  phasePortraitSettings: PhasePortraitSettings;
  runs: Run[];
  onLoadPoolRun: (runId: string) => Promise<void>;
  parameterPoint?: { x: number; y: number } | null;
  parameterAxisNames?: { x: string; y: string };
  onParameterPointChange?: (point: { x: number; y: number }) => void;
  standaloneParameters?: Record<string, number>;
  onStandaloneParametersChange?: (params: Record<string, number>) => void;
  poolStandaloneMode?: boolean;
  systems?: string[];
  system?: string;
  onSystemChange?: (system: string) => void;
}

export function VariablesPanelStarter({
  systemInfo,
  poolSettings,
  onPoolSettingsChange,
  poolBusy,
  poolComputeDisabled,
  onComputePool,
  poolReady,
  poolGrid,
  poolLabel,
  poolClassificationMode,
  poolLyapunovZero,
  portraitOverlays = [],
  showPortraitOverlay = false,
  phasePortraitSettings,
  runs,
  onLoadPoolRun,
  parameterPoint,
  parameterAxisNames,
  onParameterPointChange,
  standaloneParameters,
  onStandaloneParametersChange,
  poolStandaloneMode = false,
  systems = [],
  system = "henon",
  onSystemChange,
}: VariablesPanelStarterProps) {
  return (
    <div className="panel-starter variables-panel-starter">
      <div className="panel-starter-title-row">
        <h3 className="panel-starter-title">Стартер · переменные</h3>
      </div>

      <div className="starter-top-row variables-starter-top-row">
        <label className="field">
          <span>Расчёт</span>
          <select disabled value="pool_of_attraction">
            <option value="pool_of_attraction">Pool of attraction</option>
          </select>
        </label>

        {poolStandaloneMode && systems.length > 0 && onSystemChange && (
          <label className="field">
            <span>Система</span>
            <select
              disabled={poolBusy}
              value={system}
              onChange={(e) => onSystemChange(e.target.value)}
            >
              {systems.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <PoolSettingsPanel
        settings={poolSettings}
        systemInfo={systemInfo}
        disabled={poolBusy}
        onChange={onPoolSettingsChange}
        parameterPoint={parameterPoint}
        parameterAxisNames={parameterAxisNames}
        onParameterPointChange={onParameterPointChange}
        standaloneParameters={standaloneParameters}
        onStandaloneParametersChange={onStandaloneParametersChange}
        standaloneMode={poolStandaloneMode}
      />

      <div className="panel-starter-actions">
        <button
          type="button"
          className="btn-sm"
          disabled={poolComputeDisabled || poolBusy}
          onClick={onComputePool}
        >
          Вычислить pool
        </button>
      </div>

      <RunHistoryPicker
        runs={runs}
        label="Загрузить pool"
        emptyHint="Нет готовых pool"
        busy={poolBusy}
        eligible={(run) =>
          run.status === "done" && run.calculation_type === POOL_CALCULATION_TYPE
        }
        formatLabel={defaultLayerLabel}
        onAdd={onLoadPoolRun}
      />

      {poolReady && poolGrid && (
        <div className="computation-item">
          <span className="computation-item-label">{poolLabel ?? "Pool of attraction"}</span>
          <button
            type="button"
            className="btn-sm secondary"
            title={
              showPortraitOverlay && portraitOverlays.some((o) => o.visible)
                ? "Скачать SVG с бассейном и траекториями"
                : "Скачать SVG"
            }
            onClick={() =>
              downloadPoolGrid(poolGrid, poolClassificationMode, poolLyapunovZero, {
                overlays: portraitOverlays,
                showPortraitOverlay,
                dotSize: phasePortraitSettings.dotSize,
              })
            }
          >
            SVG
          </button>
        </div>
      )}
    </div>
  );
}
