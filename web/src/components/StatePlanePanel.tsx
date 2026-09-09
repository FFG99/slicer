import { ProgressBar } from "./ProgressBar";
import { PortraitOverlayPanel } from "./PortraitOverlayPanel";
import { StatePlaneViewer } from "./StatePlaneViewer";
import { PhasePortraitSettingsPanel } from "./PhasePortraitSettingsPanel";
import { CollapsibleSection } from "./CollapsibleSection";
import type { PortraitOverlay } from "../lib/portraitOverlay";
import type { PhasePortraitSettings } from "../lib/phasePortraitSettings";
import type { PhasePortraitContext } from "../lib/linked";
import type { PoolClassificationMode } from "../lib/poolSettings";
import { supportsUniqueAttractorPortraits } from "../lib/poolAttractors";
import type { GridData } from "../types";

interface StatePlanePanelProps {
  overlays: PortraitOverlay[];
  activeOverlayId: string | null;
  phasePortraitSettings: PhasePortraitSettings;
  phasePortraitContext: PhasePortraitContext | null;
  onPhasePortraitSettingsChange: (settings: PhasePortraitSettings) => void;
  onPhasePortraitUpdate: () => void;
  onPhasePortraitDownload: () => void;
  poolGrid: GridData | null;
  poolRunId: string | null;
  poolClassificationMode?: PoolClassificationMode;
  poolLyapunovZero?: number;
  onPoolLyapunovZeroChange?: (zero: number) => void;
  portraitBatchLabel?: string | null;
  onBuildAllUniqueAttractors?: () => void;
  phasePortraitLoading: boolean;
  poolStatus: string | null;
  poolProgress?: number | null;
  phasePortraitError: string | null;
  poolError: string | null;
  poolClickMarker?: { x: number; y: number } | null;
  poolReady?: boolean;
  workflowHint?: string;
  showPortraitOverlay: boolean;
  onShowPortraitOverlayChange: (value: boolean) => void;
  onPoolPointSelect?: (world: { x: number; y: number }) => void;
  onSelectOverlay: (id: string) => void;
  onToggleOverlay: (id: string) => void;
  onOverlayColorChange: (id: string, color: string) => void;
  onRemoveOverlay: (id: string) => void;
  onClearOverlays: () => void;
  onSetAllOverlaysVisible?: (visible: boolean) => void;
  onPinActiveOverlay: () => void;
}

export function StatePlanePanel({
  overlays,
  activeOverlayId,
  phasePortraitSettings,
  phasePortraitContext,
  onPhasePortraitSettingsChange,
  onPhasePortraitUpdate,
  onPhasePortraitDownload,
  poolGrid,
  poolRunId,
  poolClassificationMode,
  poolLyapunovZero,
  onPoolLyapunovZeroChange,
  portraitBatchLabel = null,
  onBuildAllUniqueAttractors,
  phasePortraitLoading,
  poolStatus,
  poolProgress = null,
  phasePortraitError,
  poolError,
  poolClickMarker,
  poolReady = false,
  workflowHint,
  showPortraitOverlay,
  onShowPortraitOverlayChange,
  onPoolPointSelect,
  onSelectOverlay,
  onToggleOverlay,
  onOverlayColorChange,
  onRemoveOverlay,
  onClearOverlays,
  onSetAllOverlaysVisible,
  onPinActiveOverlay,
}: StatePlanePanelProps) {
  const canBuildAllAttractors =
    poolReady &&
    supportsUniqueAttractorPortraits(poolClassificationMode ?? "ncf") &&
    onBuildAllUniqueAttractors !== undefined;

  return (
    <div className="explorer-viz-dock state-plane-viz-dock">
      <div className="state-plane-panel">
        {poolReady && (
          <CollapsibleSection title="Настройки портрета" defaultOpen={false}>
            <PhasePortraitSettingsPanel
              settings={phasePortraitSettings}
              context={phasePortraitContext}
              loading={phasePortraitLoading}
              disabled={phasePortraitLoading}
              onChange={onPhasePortraitSettingsChange}
              onUpdate={onPhasePortraitUpdate}
              onDownload={onPhasePortraitDownload}
            />
          </CollapsibleSection>
        )}
        <div className="pool-attractor-toolbar">
          <label className="overlay-toggle state-plane-overlay-toggle">
            <input
              type="checkbox"
              checked={showPortraitOverlay}
              onChange={(e) => onShowPortraitOverlayChange(e.target.checked)}
            />
            Траектории поверх бассейна
          </label>
          {canBuildAllAttractors && (
            <button
              type="button"
              className="btn-sm"
              disabled={phasePortraitLoading}
              onClick={onBuildAllUniqueAttractors}
            >
              Все аттракторы
            </button>
          )}
          {poolClassificationMode === "lyapunov" && poolReady && (
            <span className="muted toolbar-hint">
              Для λ₁-карты стройте портреты кликом по ячейкам
            </span>
          )}
        </div>

        {(phasePortraitLoading || (poolStatus && poolStatus !== "done")) && (
          <div className="variables-progress">
            {phasePortraitLoading && (
              <ProgressBar
                status="running"
                label={portraitBatchLabel ?? "Phase portrait"}
              />
            )}
            {poolStatus && poolStatus !== "done" && (
              <ProgressBar
                status={poolStatus}
                label="Pool of attraction"
                progress={poolProgress}
              />
            )}
          </div>
        )}

        {phasePortraitError && <pre className="error-box compact">{phasePortraitError}</pre>}
        {poolError && <pre className="error-box compact">{poolError}</pre>}

        <StatePlaneViewer
          poolGrid={poolGrid}
          poolRunId={poolRunId}
          poolClassificationMode={poolClassificationMode}
          poolLyapunovZero={poolLyapunovZero}
          onPoolLyapunovZeroChange={onPoolLyapunovZeroChange}
          overlays={overlays}
          portraitSettings={phasePortraitSettings}
          showPortraitOverlay={showPortraitOverlay}
          clickMarker={poolClickMarker}
          poolReady={poolReady}
          workflowHint={workflowHint}
          onPointSelect={onPoolPointSelect}
          enableZoom
        />
      </div>

      <aside className="viz-dock-side viz-dock-right">
        <PortraitOverlayPanel
          overlays={overlays}
          activeId={activeOverlayId}
          poolReady={poolReady}
          onSelect={onSelectOverlay}
          onToggle={onToggleOverlay}
          onColorChange={onOverlayColorChange}
          onRemove={onRemoveOverlay}
          onClear={onClearOverlays}
          onSetAllVisible={onSetAllOverlaysVisible}
          onPinActive={onPinActiveOverlay}
        />
      </aside>
    </div>
  );
}
