import { BifurcationPanel, type ParameterPoint } from "../components/BifurcationPanel";
import { useSearchParams } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createRun,
  cancelRun,
  computePhasePortrait,
  downloadPhasePortraitExport,
  getRun,
  getRunGrid,
  getSystem,
  listCalculations,
  listRuns,
  listSystems,
} from "../api/client";
import { HeatmapViewer, type HeatmapLayer } from "../components/HeatmapViewer";
import { LayerPanel } from "../components/LayerPanel";
import { ProgressBar } from "../components/ProgressBar";
import { RegistryRunForm } from "../components/RegistryRunForm";
import { RunHistoryPicker } from "../components/RunHistoryPicker";
import { StatePlanePanel } from "../components/StatePlanePanel";
import { StatusBadge } from "../components/StatusBadge";
import { VariablesPanelStarter } from "../components/VariablesPanelStarter";
import { useRunPolling } from "../hooks/useRunPolling";
import {
  canOverlayRunOnParameterLayers,
  framesCompatible,
  type Frame,
  type WorldRect,
} from "../lib/frame";
import {
  calculationLabel,
  POOL_CALCULATION_TYPE,
  SIDEBAR_CALCULATION_TYPES,
} from "../lib/labels";
import { defaultLayerLabel } from "../lib/layerLabels";
import { DEFAULT_LYAPUNOV_ZERO } from "../lib/colormap";
import {
  createOverlayId,
  icLabel,
  overlayColor,
  type PortraitOverlay,
} from "../lib/portraitOverlay";
import {
  isGridCalculation,
  modelParamsAtParameterPoint,
  parameterAxisNamesFromMap,
  parameterPointFromModelParams,
  phasePortraitContextFromPoolClick,
  phasePortraitRequest,
  PARAMETER_PLANE_TYPES,
  poolParamsFromFixedPoint,
  poolParamsFromMapClick,
  type PhasePortraitContext,
} from "../lib/linked";
import { defaultPhasePortraitSettings, type PhasePortraitSettings } from "../lib/phasePortraitSettings";
import {
  supportsUniqueAttractorPortraits,
  uniquePoolAttractorSamples,
} from "../lib/poolAttractors";
import {
  defaultPoolSettings,
  poolSettingsFromMapParameters,
  poolSettingsFromPortrait,
  resolvePoolClassificationMode,
} from "../lib/poolSettings";
import type { GridData, Run, SystemDefinition } from "../types";
import {
  defaultParametersForCalculation,
  mergeParametersForCalculation,
  systemDefaultParameters,
} from "../types";

type LinkedRunTarget = "pool";

export function ExplorerPage() {
  const [searchParams] = useSearchParams();
  const [segmentTool,setSegmentTool]=useState<"tree"|"phase">("tree");
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeSystemInfo, setTreeSystemInfo] = useState<SystemDefinition | null>(null);
  const [treePoints, setTreePoints] = useState<ParameterPoint[]>([]);
  const [allCalculationTypes, setAllCalculationTypes] = useState<string[]>(["attraction_map"]);
  const [systems, setSystems] = useState<string[]>(["henon"]);
  const [calculationType, setCalculationType] = useState("lyapunov_spectrum");
  const [system, setSystem] = useState("henon");
  const [systemInfo, setSystemInfo] = useState<SystemDefinition | null>(null);
  const [parameters, setParameters] = useState<Record<string, unknown>>(() =>
    defaultParametersForCalculation("lyapunov_spectrum"),
  );
  const [poolSettings, setPoolSettings] = useState(defaultPoolSettings);
  const [phasePortraitSettings, setPhasePortraitSettings] = useState(defaultPhasePortraitSettings);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [linkedPoolRunId, setLinkedPoolRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [layers, setLayers] = useState<HeatmapLayer[]>([]);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const [selection, setSelection] = useState<WorldRect | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<{ x: number; y: number } | null>(null);
  const [manualParameterPoint, setManualParameterPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [standalonePoolParameters, setStandalonePoolParameters] = useState<Record<string, number>>(
    () => ({ ...systemDefaultParameters.chialvo! }),
  );
  const [poolSelectedPoint, setPoolSelectedPoint] = useState<{ x: number; y: number } | null>(null);
  const [portraitOverlays, setPortraitOverlays] = useState<PortraitOverlay[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [showPortraitOverlay, setShowPortraitOverlay] = useState(true);
  const [phasePortraitContext, setPhasePortraitContext] = useState<PhasePortraitContext | null>(
    null,
  );
  const [phasePortraitLoading, setPhasePortraitLoading] = useState(false);
  const [portraitBatchLabel, setPortraitBatchLabel] = useState<string | null>(null);
  const [linkedPoolGrid, setLinkedPoolGrid] = useState<GridData | null>(null);
  const [poolLyapunovZero, setPoolLyapunovZero] = useState(DEFAULT_LYAPUNOV_ZERO);
  const [phasePortraitError, setPhasePortraitError] = useState<string | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);

  function startPanelResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftPanelWidth : rightPanelWidth;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = side === "left" ? startWidth + delta : startWidth - delta;
      const clamped = Math.max(220, Math.min(side === "left" ? 560 : 620, next));
      if (side === "left") {
        setLeftPanelWidth(clamped);
      } else {
        setRightPanelWidth(clamped);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  const sidebarCalculationTypes = useMemo(
    () => allCalculationTypes.filter((name) => SIDEBAR_CALCULATION_TYPES.has(name)),
    [allCalculationTypes],
  );

  const { run: activeRun, error: pollError } = useRunPolling(activeRunId);
  const { run: linkedPoolRun, error: linkedPoolPollError } = useRunPolling(linkedPoolRunId);

  const visibleMapLayer =
    layers.find((layer) => layer.visible) ?? layers[0] ?? null;
  const mapFrame = visibleMapLayer?.grid.frame;
  const mapAxisNames = {
    x: mapFrame?.axes[0]?.name ?? "x",
    y: mapFrame?.axes[1]?.name ?? "y",
  };
  useEffect(() => { setTreeOpen(false); setTreePoints([]); }, [visibleMapLayer?.id]);
  useEffect(() => {
    let live = true; setTreeSystemInfo(null);
    if (mapFrame?.system) void getSystem(mapFrame.system).then(data => {
      if (live) setTreeSystemInfo(data[mapFrame.system] ?? null);
    }).catch(() => {});
    return () => { live = false; };
  }, [mapFrame?.system]);
  const isParameterPlane = mapFrame?.space === "parameter_plane";
  const effectivePoolPoint = pinnedPoint ?? manualParameterPoint;
  const poolStandaloneMode = !isParameterPlane;

  function defaultParameterPointFromFrame(frame: Frame | undefined): { x: number; y: number } | null {
    if (!frame || frame.space !== "parameter_plane") {
      return null;
    }
    const xAxis = frame.axes[0];
    const yAxis = frame.axes[1];
    if (xAxis?.min === undefined || xAxis?.max === undefined) {
      return null;
    }
    if (yAxis?.min === undefined || yAxis?.max === undefined) {
      return null;
    }
    return {
      x: (xAxis.min + xAxis.max) / 2,
      y: (yAxis.min + yAxis.max) / 2,
    };
  }

  function applyPoolRunToStarter(
    run: Run,
    parentRun?: Run | null,
    parentGrid?: GridData | null,
  ) {
    setSystem(run.system);
    setPoolSettings((current) => poolSettingsFromMapParameters(run.parameters, current));
    const modelParams = run.parameters.parameters as Record<string, number> | undefined;
    if (!modelParams) {
      return;
    }
    setStandalonePoolParameters({
      ...(systemDefaultParameters[run.system] ?? systemDefaultParameters.henon!),
      ...modelParams,
    });
    if (parentRun && parentGrid?.frame.space === "parameter_plane") {
      const axisNames = parameterAxisNamesFromMap(parentRun, parentGrid);
      const point = parameterPointFromModelParams(modelParams, axisNames);
      if (point) {
        setManualParameterPoint(point);
        setPinnedPoint(point);
      }
    }
  }

  function syncPoolContextFromMapRun(run: Run, grid: GridData) {
    setSystem(run.system);
    setPoolSettings((current) =>
      poolSettingsFromMapParameters(run.parameters, current),
    );
    const frame = grid.frame as Frame;
    const point = defaultParameterPointFromFrame(frame);
    if (point) {
      setManualParameterPoint(point);
    }
    const params = run.parameters;
    const staticParams =
      (params.static_parameters as Record<string, number> | undefined) ??
      grid.frame.parameters ??
      {};
    const firstParam = String(params.first_param ?? frame.axes[0]?.name ?? "a");
    const secondParam = String(params.second_param ?? frame.axes[1]?.name ?? "b");
    const center = point ?? { x: 0, y: 0 };
    setStandalonePoolParameters({
      ...systemDefaultParameters[run.system],
      ...staticParams,
      ...modelParamsAtParameterPoint(staticParams, { x: firstParam, y: secondParam }, center),
    });
  }

  const baseLayerFrame = (layers[0]?.grid.frame as Frame | undefined) ?? null;

  function clearPortraitOverlays() {
    setPortraitOverlays([]);
    setActiveOverlayId(null);
    setPhasePortraitContext(null);
    setPoolSelectedPoint(null);
  }

  function clearLinkedPool() {
    setLinkedPoolRunId(null);
    setLinkedPoolGrid(null);
    setPoolLyapunovZero(DEFAULT_LYAPUNOV_ZERO);
    setPoolError(null);
  }

  const refreshRuns = useCallback(async () => {
    const data = await listRuns({ limit: 100 });
    setRuns(data.items);
  }, []);

  useEffect(() => {
    getSystem(system)
      .then((data) => setSystemInfo(data[system] ?? null))
      .catch(() => setSystemInfo(null));
  }, [system]);

  const addLayer = useCallback(async (run: Run) => {
    if (run.status !== "done" || !isGridCalculation(run.calculation_type)) {
      return;
    }
    if (run.calculation_type === POOL_CALCULATION_TYPE) {
      return;
    }
    const grid = await getRunGrid(run.id, { max_dim: 512 });
    const current = layersRef.current;
    if (current.some((layer) => layer.id === run.id)) {
      return;
    }
    const baseFrame = current[0]?.grid.frame as Frame | undefined;
    if (baseFrame && !framesCompatible(baseFrame, grid.frame as Frame)) {
      setActionError("Frame mismatch — cannot overlay this run.");
      return;
    }
    setActionError(null);
    setLayers([
      ...current,
      {
        id: run.id,
        label: defaultLayerLabel(run),
        grid,
        calculationType: run.calculation_type,
        opacity: 1,
        visible: true,
        ...(run.calculation_type === "lyapunov_spectrum"
          ? { lyapunovZero: DEFAULT_LYAPUNOV_ZERO }
          : {}),
      },
    ]);
    if (grid.frame.space === "parameter_plane") {
      syncPoolContextFromMapRun(run, grid);
    }
  }, []);

  const addLayerFromRunId = useCallback(
    async (runId: string) => {
      setActionError(null);
      let run = runsRef.current.find((item) => item.id === runId);
      if (!run) {
        const fetched = await getRun(runId);
        run = fetched;
        setRuns((current) =>
          current.some((item) => item.id === runId) ? current : [fetched, ...current],
        );
      }
      const base = layersRef.current[0]?.grid.frame as Frame | undefined;
      if (!canOverlayRunOnParameterLayers(run, base ?? null)) {
        setActionError("Несовместимый frame — этот run не наложить на текущие слои.");
        return;
      }
      await addLayer(run);
    },
    [addLayer],
  );

  const loadPoolFromRunId = useCallback(async (runId: string) => {
    setPoolError(null);
    try {
      const run =
        runsRef.current.find((item) => item.id === runId) ?? (await getRun(runId));
      if (run.calculation_type !== POOL_CALCULATION_TYPE || run.status !== "done") {
        setPoolError("Только завершённые pool of attraction.");
        return;
      }
      setRuns((current) =>
        current.some((item) => item.id === runId) ? current : [run, ...current],
      );
      let parentRun: Run | null = null;
      let parentGrid: GridData | null = null;
      if (run.parent_run_id) {
        parentRun =
          runsRef.current.find((item) => item.id === run.parent_run_id) ??
          (await getRun(run.parent_run_id));
        if (
          parentRun.status === "done" &&
          PARAMETER_PLANE_TYPES.has(parentRun.calculation_type) &&
          !layersRef.current.some((layer) => layer.id === parentRun!.id)
        ) {
          parentGrid = await getRunGrid(parentRun.id, { max_dim: 512 });
          setRuns((current) =>
            current.some((item) => item.id === parentRun!.id) ? current : [parentRun!, ...current],
          );
          setLayers((current) => {
            if (current.some((layer) => layer.id === parentRun!.id)) {
              return current;
            }
            return [
              ...current,
              {
                id: parentRun!.id,
                label: defaultLayerLabel(parentRun!),
                grid: parentGrid!,
                calculationType: parentRun!.calculation_type,
                opacity: 1,
                visible: true,
              },
            ];
          });
          syncPoolContextFromMapRun(parentRun, parentGrid);
        } else if (parentRun.status === "done") {
          parentGrid =
            (layersRef.current.find((layer) => layer.id === parentRun!.id)?.grid as
              | GridData
              | undefined) ?? (await getRunGrid(parentRun.id, { max_dim: 512 }));
        }
      }
      applyPoolRunToStarter(run, parentRun, parentGrid);
      clearPortraitOverlays();
      setLinkedPoolRunId(run.id);
      const grid = await getRunGrid(run.id, { max_dim: 512 });
      setLinkedPoolGrid(grid);
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const isLayerEligible = useCallback(
    (run: Run) => {
      if (run.status !== "done") {
        return false;
      }
      if (!SIDEBAR_CALCULATION_TYPES.has(run.calculation_type)) {
        return false;
      }
      if (layersRef.current.some((layer) => layer.id === run.id)) {
        return false;
      }
      return canOverlayRunOnParameterLayers(run, baseLayerFrame);
    },
    [baseLayerFrame],
  );

  useEffect(() => {
    Promise.all([listCalculations(), listSystems()])
      .then(([calcs, sys]) => {
        const calcNames = Object.keys(calcs);
        const systemNames = Object.keys(sys);
        if (calcNames.length) {
          setAllCalculationTypes(calcNames);
        }
        if (systemNames.length) {
          setSystems(systemNames);
        }
      })
      .catch(() => undefined);
    refreshRuns().catch(() => undefined);
  }, [refreshRuns]);

  useEffect(() => {
    const runId = searchParams.get("run");
    const nextCalculation = searchParams.get("calculation");
    const nextSystem = searchParams.get("system");
    const panel = searchParams.get("panel");

    if (runId) {
      setActiveRunId(runId);
      let cancelled = false;
      getRun(runId)
        .then(async (run) => {
          if (cancelled) {
            return;
          }
          setCalculationType(run.calculation_type);
          setSystem(run.system);
          setParameters(
            mergeParametersForCalculation(run.calculation_type, run.system, run.parameters),
          );
          setRuns((current) => (current.some((item) => item.id === runId) ? current : [run, ...current]));
          if (run.status !== "done") {
            return;
          }
          if (
            run.calculation_type === POOL_CALCULATION_TYPE ||
            panel === "pool"
          ) {
            await loadPoolFromRunId(runId);
            return;
          }
          if (!isGridCalculation(run.calculation_type)) {
            return;
          }
          const grid = await getRunGrid(runId, { max_dim: 512 });
          if (cancelled) {
            return;
          }
          setLayers((current) => {
            if (current.some((layer) => layer.id === runId)) {
              return current;
            }
            return [
              {
                id: run.id,
                label: defaultLayerLabel(run),
                grid,
                calculationType: run.calculation_type,
                opacity: 1,
                visible: true,
              },
            ];
          });
          if (grid.frame.space === "parameter_plane") {
            syncPoolContextFromMapRun(run, grid);
          }
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }

    if (nextCalculation) {
      setCalculationType(nextCalculation);
    }
    if (nextSystem) {
      setSystem(nextSystem);
      setParameters(defaultParametersForCalculation(nextCalculation ?? calculationType, nextSystem));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate from URL once on navigation
  }, [searchParams]);

  useEffect(() => {
    if (activeRun?.status === "done") {
      refreshRuns().catch(() => undefined);
      if (activeRun.calculation_type === POOL_CALCULATION_TYPE) {
        loadPoolFromRunId(activeRun.id).catch((err) =>
          setPoolError(err instanceof Error ? err.message : String(err)),
        );
        return;
      }
      if (isGridCalculation(activeRun.calculation_type)) {
        addLayer(activeRun).catch((err) =>
          setActionError(err instanceof Error ? err.message : String(err)),
        );
      }
    }
  }, [activeRun?.status, activeRun?.id, activeRun, refreshRuns, addLayer, loadPoolFromRunId]);

  useEffect(() => {
    if (linkedPoolRun?.status === "done") {
      refreshRuns().catch(() => undefined);
      if (linkedPoolRun.calculation_type === POOL_CALCULATION_TYPE) {
        getRunGrid(linkedPoolRun.id, { max_dim: 512 })
          .then((grid) => {
            setLinkedPoolGrid(grid);
            setPoolError(null);
          })
          .catch((err) =>
            setPoolError(err instanceof Error ? err.message : String(err)),
          );
      }
    }
    if (linkedPoolRun?.status === "failed") {
      setPoolError(linkedPoolRun.error_message ?? "Pool of attraction run failed");
    }
  }, [linkedPoolRun?.status, linkedPoolRun?.id, linkedPoolRun, refreshRuns]);

  async function submitRun(body: {
    calculation_type: string;
    system: string;
    parameters: Record<string, unknown>;
    parent_run_id?: string;
    target?: "active" | LinkedRunTarget;
  }) {
    setSubmitError(null);
    setActionError(null);
    const run = await createRun({
      calculation_type: body.calculation_type,
      system: body.system,
      parameters: body.parameters,
      parent_run_id: body.parent_run_id,
    });
    if (body.target === "pool") {
      clearPortraitOverlays();
      setLinkedPoolRunId(run.id);
      setLinkedPoolGrid(null);
      setPoolError(null);
    } else {
      setActiveRunId(run.id);
    }
    setSelection(null);
    await refreshRuns();
    return run;
  }

  async function handleSubmit() {
    try {
      await submitRun({ calculation_type: calculationType, system, parameters });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  }

  function applySelectionToForm() {
    if (!selection) {
      return;
    }
    setParameters((current) => ({
      ...current,
      first_param_min: selection.xMin,
      first_param_max: selection.xMax,
      second_param_min: selection.yMin,
      second_param_max: selection.yMax,
    }));
    setSelection(null);
  }

  function resolveMapContext(world: { x: number; y: number }) {
    const mapLayer =
      layersRef.current.find((layer) => layer.visible) ?? layersRef.current[0];
    if (!mapLayer) {
      return null;
    }
    const mapRun = runsRef.current.find((item) => item.id === mapLayer.id);
    if (!mapRun) {
      return null;
    }
    return { mapLayer, mapRun, world };
  }

  async function addPortraitOverlay(
    context: PhasePortraitContext,
    ic: { x: number; y: number },
    axisNames?: { x: string; y: string },
    settings: PhasePortraitSettings = phasePortraitSettings,
  ) {
    setPhasePortraitLoading(true);
    setPhasePortraitError(null);
    setPhasePortraitContext(context);
    const overlayId = createOverlayId();
    try {
      const request = phasePortraitRequest(context, settings);
      const data = await computePhasePortrait(request);
      setPoolSettings((current) => poolSettingsFromPortrait(current, settings, data));
      setPortraitOverlays((current) => {
        const pinned = current.filter((item) => item.pinned);
        const overlay: PortraitOverlay = {
          id: overlayId,
          label: icLabel(ic, axisNames),
          color: overlayColor(pinned.length),
          trajectory: data,
          context,
          ic,
          visible: true,
          pinned: false,
        };
        return [...pinned, overlay];
      });
      setActiveOverlayId(overlayId);
    } catch (err) {
      setPhasePortraitError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhasePortraitLoading(false);
    }
  }

  async function refreshActiveOverlay(settings: PhasePortraitSettings = phasePortraitSettings) {
    if (!activeOverlayId) {
      return;
    }
    const overlay = portraitOverlays.find((item) => item.id === activeOverlayId);
    if (!overlay) {
      return;
    }
    setPhasePortraitLoading(true);
    setPhasePortraitError(null);
    try {
      const request = phasePortraitRequest(overlay.context, settings);
      const data = await computePhasePortrait(request);
      setPoolSettings((current) => poolSettingsFromPortrait(current, settings, data));
      setPortraitOverlays((current) =>
        current.map((item) =>
          item.id === activeOverlayId ? { ...item, trajectory: data, context: overlay.context } : item,
        ),
      );
    } catch (err) {
      setPhasePortraitError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhasePortraitLoading(false);
    }
  }

  function selectPortraitOverlay(id: string) {
    setActiveOverlayId(id);
    const overlay = portraitOverlays.find((item) => item.id === id);
    if (overlay) {
      setPhasePortraitContext(overlay.context);
    }
  }

  function togglePortraitOverlay(id: string) {
    setPortraitOverlays((current) =>
      current.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item,
      ),
    );
  }

  function pinActiveOverlay() {
    if (!activeOverlayId) {
      return;
    }
    setPortraitOverlays((current) =>
      current.map((item) =>
        item.id === activeOverlayId ? { ...item, pinned: true } : item,
      ),
    );
  }

  function removePortraitOverlay(id: string) {
    setPortraitOverlays((current) => {
      const next = current.filter((item) => item.id !== id);
      if (activeOverlayId === id) {
        const replacement = next[next.length - 1] ?? null;
        setActiveOverlayId(replacement?.id ?? null);
        setPhasePortraitContext(replacement?.context ?? null);
      }
      return next;
    });
  }

  async function handlePhasePortraitUpdate() {
    await refreshActiveOverlay();
  }

  async function handlePhasePortraitDownload() {
    if (!phasePortraitContext) {
      return;
    }
    setPhasePortraitLoading(true);
    setPhasePortraitError(null);
    try {
      const request = phasePortraitRequest(phasePortraitContext, phasePortraitSettings);
      const blob = await downloadPhasePortraitExport(request);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "phase_portrait.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPhasePortraitError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhasePortraitLoading(false);
    }
  }

  async function handleComputePool() {
    if (poolStandaloneMode) {
      if (!systemInfo || Object.keys(standalonePoolParameters).length === 0) {
        return;
      }
      try {
        const poolParams = poolParamsFromFixedPoint(standalonePoolParameters, poolSettings);
        await submitRun({
          calculation_type: POOL_CALCULATION_TYPE,
          system,
          parameters: poolParams,
          target: "pool",
        });
      } catch (err) {
        setPoolError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (!effectivePoolPoint) {
      return;
    }
    const ctx = resolveMapContext(effectivePoolPoint);
    if (!ctx || !isParameterPlane) {
      return;
    }

    try {
      const poolParams = poolParamsFromMapClick(
        ctx.mapRun,
        ctx.mapLayer.grid,
        effectivePoolPoint,
        poolSettings,
      );
      await submitRun({
        calculation_type: POOL_CALCULATION_TYPE,
        system: ctx.mapRun.system,
        parameters: poolParams,
        parent_run_id: ctx.mapRun.id,
        target: "pool",
      });
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runPhasePortraitFromPool(world: { x: number; y: number }) {
    if (!linkedPoolRun || !linkedPoolGrid || linkedPoolRun.status !== "done") {
      return;
    }
    setPoolSelectedPoint(world);
    const context = phasePortraitContextFromPoolClick(linkedPoolRun, linkedPoolGrid, world);
    const axisNames = {
      x: linkedPoolGrid.frame.axes[0]?.name ?? poolSettings.first_var,
      y: linkedPoolGrid.frame.axes[1]?.name ?? poolSettings.second_var,
    };
    await addPortraitOverlay(context, world, axisNames);
  }

  async function handleBuildAllUniqueAttractorPortraits() {
    if (!linkedPoolRun || !linkedPoolGrid || linkedPoolRun.status !== "done") {
      return;
    }
    const mode = linkedPoolClassificationMode;
    if (!supportsUniqueAttractorPortraits(mode)) {
      return;
    }

    const samples = uniquePoolAttractorSamples(linkedPoolGrid, mode);
    if (samples.length === 0) {
      setPhasePortraitError("На карте нет устойчивых аттракторов (только разбегание).");
      return;
    }

    clearPortraitOverlays();
    setPhasePortraitLoading(true);
    setPhasePortraitError(null);
    setPortraitBatchLabel(`Портреты аттракторов (0/${samples.length})`);

    const axisNames = {
      x: linkedPoolGrid.frame.axes[0]?.name ?? poolSettings.first_var,
      y: linkedPoolGrid.frame.axes[1]?.name ?? poolSettings.second_var,
    };
    const built: PortraitOverlay[] = [];

    try {
      for (let index = 0; index < samples.length; index++) {
        const sample = samples[index]!;
        setPortraitBatchLabel(`Портреты аттракторов (${index + 1}/${samples.length})`);
        const context = phasePortraitContextFromPoolClick(
          linkedPoolRun,
          linkedPoolGrid,
          sample.world,
        );
        const request = phasePortraitRequest(context, phasePortraitSettings);
        const data = await computePhasePortrait(request);
        built.push({
          id: createOverlayId(),
          label: `${sample.label} · ${icLabel(sample.world, axisNames)}`,
          color: overlayColor(index),
          trajectory: data,
          context,
          ic: sample.world,
          visible: true,
          pinned: true,
        });
      }
      setPortraitOverlays(built);
      const first = built[0];
      setActiveOverlayId(first?.id ?? null);
      setPhasePortraitContext(first?.context ?? null);
    } catch (err) {
      setPhasePortraitError(err instanceof Error ? err.message : String(err));
      if (built.length > 0) {
        setPortraitOverlays(built);
        const first = built[0];
        setActiveOverlayId(first?.id ?? null);
        setPhasePortraitContext(first?.context ?? null);
      }
    } finally {
      setPhasePortraitLoading(false);
      setPortraitBatchLabel(null);
    }
  }

  function handleMapPointSelect(world: { x: number; y: number }) {
    if (treeOpen && treePoints.length < 2) {
      setTreePoints(current => [...current, world]);
      return;
    }
    const samePin =
      pinnedPoint &&
      Math.abs(pinnedPoint.x - world.x) < 1e-9 &&
      Math.abs(pinnedPoint.y - world.y) < 1e-9;
    if (!samePin) {
      clearPortraitOverlays();
      clearLinkedPool();
    }
    setPinnedPoint(world);
    setManualParameterPoint(world);
    const ctx = resolveMapContext(world);
    if (ctx && ctx.mapLayer.grid.frame.space === "parameter_plane") {
      const params = ctx.mapRun.parameters;
      const axisNames = parameterAxisNamesFromMap(ctx.mapRun, ctx.mapLayer.grid);
      const staticParams =
        (params.static_parameters as Record<string, number> | undefined) ??
        ctx.mapLayer.grid.frame.parameters ??
        {};
      setStandalonePoolParameters((current) => ({
        ...current,
        ...modelParamsAtParameterPoint(staticParams, axisNames, world),
      }));
    }
  }

  async function handleCancel() {
    if (!activeRunId) {
      return;
    }
    try {
      setActionError(null);
      await cancelRun(activeRunId);
      await refreshRuns();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleCalculationTypeChange(nextType: string) {
    setCalculationType(nextType);
    setParameters((current) => mergeParametersForCalculation(nextType, system, current));
    setSelection(null);
    setPinnedPoint(null);
  }

  function handleSystemChange(nextSystem: string) {
    setSystem(nextSystem);
    setParameters(defaultParametersForCalculation(calculationType, nextSystem));
  }

  function updateLayer(id: string, patch: Partial<HeatmapLayer>) {
    setLayers((current) =>
      current.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    );
  }

  async function setAttractionMapDisplayMode(
    id: string,
    mode: "count" | "composition" | "periods",
  ) {
    const layer = layersRef.current.find((item) => item.id === id);
    if (!layer || (layer.attractionMapDisplayMode ?? "count") === mode) {
      return;
    }
    try {
      const grid = await getRunGrid(id, {
        max_dim: 512,
        dataset:
          mode === "composition" ? "composition" : mode === "periods" ? "periods" : "values",
      });
      updateLayer(id, {
        grid,
        calculationType:
          mode === "composition"
            ? "attraction_map_composition"
            : mode === "periods"
              ? "attraction_map_periods"
              : "attraction_map",
        attractionMapDisplayMode: mode,
      });
      setActionError(null);
    } catch (err) {
      setActionError(
        mode === "composition" || mode === "periods"
          ? "В этом артефакте нет данных для выбранного режима. Запустите карту заново."
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  }

  function moveLayerInStack(id: string, towardTop: boolean) {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      if (index === -1) {
        return current;
      }
      const targetIndex = towardTop ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item!);
      return next;
    });
  }

  function handleLayerLabelChange(id: string, label: string) {
    updateLayer(id, { label });
  }

  const isRunning =
    activeRun?.status === "queued" || activeRun?.status === "running";
  const poolBusy =
    linkedPoolRun?.status === "queued" || linkedPoolRun?.status === "running";
  const linkedPoolClassificationMode = resolvePoolClassificationMode(
    linkedPoolRun?.parameters?.classification_mode ?? poolSettings.classification_mode,
    linkedPoolGrid?.value_dtype,
  );

  const poolReady =
    linkedPoolGrid !== null && linkedPoolRun?.status === "done";
  const linkedBusy = phasePortraitLoading || poolBusy;

  const displayError = submitError ?? pollError ?? linkedPoolPollError ?? actionError;

  const poolComputeDisabled = poolStandaloneMode
    ? !systemInfo || poolBusy
    : !effectivePoolPoint || !isParameterPlane || poolBusy;

  return (
    <main
      style={{
        "--explorer-left-width": `${leftPanelWidth}px`,
        "--explorer-right-width": `${rightPanelWidth}px`,
      } as CSSProperties}
      className={`explorer-workspace${leftPanelVisible ? "" : " explorer-left-hidden"}${
        rightPanelVisible ? "" : " explorer-right-hidden"
      }`}
    >
      {leftPanelVisible && <aside className="explorer-sidebar">
        <div className="panel-starter parameters-panel-starter">
          <div className="panel-starter-title-row">
            <h3 className="panel-starter-title">Стартер · параметры</h3>
          </div>

          <RegistryRunForm
            layout="panel"
            calculationTypes={sidebarCalculationTypes}
            systems={systems}
            calculationType={calculationType}
            system={system}
            parameters={parameters}
            disabled={isRunning}
            onCalculationTypeChange={handleCalculationTypeChange}
            onSystemChange={handleSystemChange}
            onChange={setParameters}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />

          {activeRun && (
            <div className="explorer-run-status">
              <span className="run-panel-title">{calculationLabel(activeRun.calculation_type)}</span>
              <StatusBadge status={activeRun.status} />
              <span className="muted run-panel-id">{activeRun.id.slice(0, 8)}…</span>
              {(activeRun.status === "running" || activeRun.status === "queued") && (
                <ProgressBar
                  status={activeRun.status}
                  label="Расчёт"
                  progress={activeRun.progress}
                />
              )}
            </div>
          )}

          {displayError && <pre className="error-box compact">{displayError}</pre>}
        </div>

        <LayerPanel
          layers={layers}
          onToggle={(id) =>
            updateLayer(id, {
              visible: !layers.find((layer) => layer.id === id)?.visible,
            })
          }
          onOpacity={(id, opacity) => updateLayer(id, { opacity })}
          onLyapunovZero={(id, lyapunovZero) => updateLayer(id, { lyapunovZero })}
          onAttractionMapDisplayMode={(id, mode) => void setAttractionMapDisplayMode(id, mode)}
          onLabelChange={handleLayerLabelChange}
          onRemove={(id) => setLayers((current) => current.filter((l) => l.id !== id))}
          onMoveInStack={moveLayerInStack}
          addLayerControl={
            <RunHistoryPicker
              runs={runs}
              label="Добавить карту"
              emptyHint="Нет совместимых карт"
              busy={isRunning}
              eligible={isLayerEligible}
              formatLabel={defaultLayerLabel}
              onAdd={addLayerFromRunId}
            />
          }
        />
      </aside>}
      {leftPanelVisible && (
        <div
          className="explorer-splitter explorer-splitter-left"
          role="separator"
          aria-label="Изменить ширину левой панели"
          aria-orientation="vertical"
          onPointerDown={(event) => startPanelResize("left", event)}
        />
      )}

      <section className="explorer-canvas">
        <div className="explorer-panel-controls" aria-label="Панели Explorer">
          <button
            type="button"
            className="panel-visibility-button"
            title={leftPanelVisible ? "Скрыть параметры и слои" : "Показать параметры и слои"}
            aria-label={leftPanelVisible ? "Скрыть параметры и слои" : "Показать параметры и слои"}
            onClick={() => setLeftPanelVisible((visible) => !visible)}
          >
            {leftPanelVisible ? "‹" : "›"}
          </button>

          <button
            type="button"
            className="panel-visibility-button"
            title={rightPanelVisible ? "Скрыть переменные и бассейн" : "Показать переменные и бассейн"}
            aria-label={rightPanelVisible ? "Скрыть переменные и бассейн" : "Показать переменные и бассейн"}
            onClick={() => setRightPanelVisible((visible) => !visible)}
          >
            {rightPanelVisible ? "›" : "‹"}
          </button>
        </div>

        {treeOpen && treePoints.length === 2 && treeSystemInfo && isParameterPlane && <BifurcationPanel key={visibleMapLayer?.id}
          initialView={segmentTool} system={mapFrame!.system} info={treeSystemInfo} axes={mapAxisNames} points={treePoints}
          fixed={(runs.find(r=>r.id===visibleMapLayer?.id)?.parameters.static_parameters as Record<string,number>) ?? mapFrame!.parameters ?? {}}
          onSelect={()=>setTreePoints([])} onClose={()=>setTreeOpen(false)}/>}
        {selection && PARAMETER_PLANE_TYPES.has(calculationType) && (
          <div className="refine-panel inline">
            <p className="muted refine-panel-text">
              Диапазон: {mapAxisNames.x} [{selection.xMin.toFixed(4)}, {selection.xMax.toFixed(4)}] ·{" "}
              {mapAxisNames.y} [{selection.yMin.toFixed(4)}, {selection.yMax.toFixed(4)}]
            </p>
            <div className="refine-actions">
              <button type="button" className="btn-sm" onClick={applySelectionToForm}>
                В форму
              </button>
              <button type="button" className="btn-sm secondary" onClick={() => setSelection(null)}>
                ×
              </button>
            </div>
          </div>
        )}
        <div className="explorer-panel-map">
          <div className="explorer-panel-body">
            <HeatmapViewer
              toolbarTools={isParameterPlane && <>{(['tree','phase'] as const).map(tool=><button key={tool} className="tree-tool" aria-label={tool==='tree'?'Бифуркационное дерево':'Фазовый портрет вдоль отрезка'} aria-pressed={treeOpen && segmentTool===tool} disabled={!treeSystemInfo}
                onClick={()=>{setTreePoints([]);setSegmentTool(tool);setTreeOpen(!treeOpen || segmentTool!==tool);}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={tool==='tree'?'M6 17L18 7':'M4 16C4 2 20 2 20 12S4 22 4 12'} stroke="currentColor" strokeWidth="1.5"/></svg>
                {treeOpen && segmentTool===tool ? (treePoints.length===0?'Выберите точку A':'Выберите точку B') : tool==='tree'?'Дерево':'Фазовый портрет'}
              </button>)}</>}
              pointToolActive={treeOpen}
              onNavigationToolSelect={()=>setTreeOpen(false)}
              layers={layers}
              selection={selection}
              onSelectionChange={setSelection}
              onPointSelect={handleMapPointSelect}
              clickMarker={pinnedPoint}
              segment={treeOpen ? treePoints : []}
              enableZoom
            />
          </div>
        </div>
      </section>

      {rightPanelVisible && <aside className="explorer-inspector">
        <VariablesPanelStarter
          systemInfo={systemInfo}
          poolSettings={poolSettings}
          onPoolSettingsChange={setPoolSettings}
          poolBusy={poolBusy}
          poolComputeDisabled={poolComputeDisabled}
          onComputePool={() => void handleComputePool()}
          poolReady={poolReady}
          poolGrid={linkedPoolGrid}
          poolLabel={
            linkedPoolRun ? defaultLayerLabel(linkedPoolRun) : undefined
          }
          poolClassificationMode={linkedPoolClassificationMode}
          poolLyapunovZero={poolLyapunovZero}
          portraitOverlays={portraitOverlays}
          showPortraitOverlay={showPortraitOverlay}
          phasePortraitSettings={phasePortraitSettings}
          runs={runs}
          onLoadPoolRun={loadPoolFromRunId}
          parameterPoint={manualParameterPoint}
          parameterAxisNames={mapAxisNames}
          onParameterPointChange={(point) => {
            setPinnedPoint(null);
            setManualParameterPoint(point);
            const mapLayer =
              layers.find((layer) => layer.visible) ?? layers[0] ?? null;
            const mapRun = mapLayer ? runs.find((item) => item.id === mapLayer.id) : null;
            if (
              mapLayer &&
              mapRun &&
              mapLayer.grid.frame.space === "parameter_plane"
            ) {
              const params = mapRun.parameters;
              const axisNames = parameterAxisNamesFromMap(mapRun, mapLayer.grid);
              const staticParams =
                (params.static_parameters as Record<string, number> | undefined) ??
                mapLayer.grid.frame.parameters ??
                {};
              setStandalonePoolParameters((current) => ({
                ...current,
                ...modelParamsAtParameterPoint(staticParams, axisNames, point),
              }));
            }
          }}
          standaloneParameters={standalonePoolParameters}
          onStandaloneParametersChange={setStandalonePoolParameters}
          poolStandaloneMode={poolStandaloneMode}
          systems={systems}
          system={system}
          onSystemChange={(nextSystem) => {
            setSystem(nextSystem);
            setStandalonePoolParameters({
              ...(systemDefaultParameters[nextSystem] ?? systemDefaultParameters.henon!),
            });
          }}
        />

        <div className="inspector-canvas">
          <div className="explorer-panel-body">
            <StatePlanePanel
              overlays={portraitOverlays}
              activeOverlayId={activeOverlayId}
              phasePortraitSettings={phasePortraitSettings}
              phasePortraitContext={phasePortraitContext}
              onPhasePortraitSettingsChange={setPhasePortraitSettings}
              onPhasePortraitUpdate={handlePhasePortraitUpdate}
              onPhasePortraitDownload={handlePhasePortraitDownload}
              poolGrid={linkedPoolGrid}
              poolRunId={linkedPoolRun?.id ?? null}
              poolClassificationMode={linkedPoolClassificationMode}
              poolLyapunovZero={poolLyapunovZero}
              onPoolLyapunovZeroChange={setPoolLyapunovZero}
              portraitBatchLabel={portraitBatchLabel}
              onBuildAllUniqueAttractors={() => void handleBuildAllUniqueAttractorPortraits()}
              phasePortraitLoading={phasePortraitLoading}
              poolStatus={linkedPoolRun?.status ?? null}
              poolProgress={linkedPoolRun?.progress ?? null}
              phasePortraitError={phasePortraitError}
              poolError={poolError}
              poolClickMarker={poolSelectedPoint}
              poolReady={poolReady}
              workflowHint={undefined}
              showPortraitOverlay={showPortraitOverlay}
              onShowPortraitOverlayChange={setShowPortraitOverlay}
              onPoolPointSelect={
                poolReady && !linkedBusy
                  ? (world) => void runPhasePortraitFromPool(world)
                  : undefined
              }
              onSelectOverlay={selectPortraitOverlay}
              onToggleOverlay={togglePortraitOverlay}
              onOverlayColorChange={(id, color) =>
                setPortraitOverlays((current) =>
                  current.map((overlay) => (overlay.id === id ? { ...overlay, color } : overlay)),
                )
              }
              onRemoveOverlay={removePortraitOverlay}
              onClearOverlays={clearPortraitOverlays}
              onSetAllOverlaysVisible={(visible) =>
                setPortraitOverlays((current) =>
                  current.map((overlay) => ({ ...overlay, visible })),
                )
              }
              onPinActiveOverlay={pinActiveOverlay}
            />
          </div>
        </div>
      </aside>}
      {rightPanelVisible && (
        <div
          className="explorer-splitter explorer-splitter-right"
          role="separator"
          aria-label="Изменить ширину правой панели"
          aria-orientation="vertical"
          onPointerDown={(event) => startPanelResize("right", event)}
        />
      )}
    </main>
  );
}
