import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cancelRun, deleteRun, downloadRunArtifact, getRunGrid, listRuns } from "../api/client";
import { isGridCalculation } from "../lib/linked";
import { calculationLabel, POOL_CALCULATION_TYPE } from "../lib/labels";
import { colorToRgbBytes, gridValueToColor, layerValueRange } from "../lib/colormap";
import type { GridData, Run } from "../types";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";

interface RunFilters {
  status: string;
  calculation_type: string;
  system: string;
}

const POLL_MS = 2000;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function parseApiError(message: string): string {
  try {
    const payload = JSON.parse(message) as { detail?: string };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
  } catch {
    /* use raw message */
  }
  return message;
}

function RunPreview({ runId, calculationType }: { runId: string; calculationType: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState<GridData | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRunGrid(runId, { max_dim: 64 })
      .then((data) => {
        if (!cancelled) {
          setGrid(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGrid(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid) {
      return;
    }
    const rows = grid.rows;
    const cols = grid.cols;
    const { min, max } = layerValueRange(grid.values);
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const image = ctx.createImageData(cols, rows);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const value = grid.values[i]?.[j] ?? 0;
        const [r, g, b] = colorToRgbBytes(
          gridValueToColor(value, calculationType, grid.value_dtype, min, max),
        );
        const offset = (i * cols + j) * 4;
        image.data[offset] = r;
        image.data[offset + 1] = g;
        image.data[offset + 2] = b;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [grid, calculationType]);

  if (!grid) {
    return <div className="run-preview run-preview-empty muted">No preview</div>;
  }

  return <canvas ref={canvasRef} className="run-preview" />;
}

export function ComputationManager() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<RunFilters>({
    status: "all",
    calculation_type: "all",
    system: "all",
  });

  const refresh = useCallback(async () => {
    try {
      const data = await listRuns({
        status: filters.status === "all" ? undefined : filters.status,
        calculation_type:
          filters.calculation_type === "all" ? undefined : filters.calculation_type,
        system: filters.system === "all" ? undefined : filters.system,
        limit: 100,
      });
      setRuns(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    refresh().catch(() => undefined);
  }, [refresh]);

  const hasActiveRuns = useMemo(
    () => runs.some((run) => run.status === "queued" || run.status === "running"),
    [runs],
  );

  useEffect(() => {
    if (!hasActiveRuns) {
      return;
    }
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveRuns, refresh]);

  const calculationTypes = useMemo(
    () => [...new Set(runs.map((run) => run.calculation_type))].sort(),
    [runs],
  );
  const systems = useMemo(() => [...new Set(runs.map((run) => run.system))].sort(), [runs]);

  const deletableRuns = useMemo(() => runs.filter((run) => run.status !== "running"), [runs]);

  const allDeletableSelected =
    deletableRuns.length > 0 && deletableRuns.every((run) => selectedIds.has(run.id));

  const selectedRun = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;

  function toggleSelected(runId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }

  function selectAllDeletable() {
    setSelectedIds(new Set(deletableRuns.map((run) => run.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function toggleSelectAllDeletable() {
    if (allDeletableSelected) {
      clearSelection();
    } else {
      selectAllDeletable();
    }
  }

  async function handleCancel(runId: string) {
    setCancellingId(runId);
    setActionError(null);
    try {
      await cancelRun(runId);
      await refresh();
    } catch (err) {
      setActionError(parseApiError(err instanceof Error ? err.message : String(err)));
    } finally {
      setCancellingId(null);
    }
  }

  async function handleDelete(runId: string) {
    if (!window.confirm("Delete this computation and its artifact?")) {
      return;
    }
    setDeletingId(runId);
    setActionError(null);
    try {
      await deleteRun(runId);
      if (selectedId === runId) {
        setSelectedId(null);
      }
      setSelectedIds((current) => {
        if (!current.has(runId)) {
          return current;
        }
        const next = new Set(current);
        next.delete(runId);
        return next;
      });
      await refresh();
    } catch (err) {
      setActionError(parseApiError(err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleArtifactDownload(runId: string) {
    try {
      const artifact = await downloadRunArtifact(runId);
      const url = URL.createObjectURL(artifact);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${runId}.h5`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(parseApiError(err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      return;
    }
    if (
      !window.confirm(
        `Delete ${ids.length} computation${ids.length === 1 ? "" : "s"} and their artifacts?`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);
    setActionError(null);
    const failures: string[] = [];

    for (const runId of ids) {
      try {
        await deleteRun(runId);
      } catch (err) {
        failures.push(
          `${runId.slice(0, 8)}…: ${parseApiError(err instanceof Error ? err.message : String(err))}`,
        );
      }
    }

    if (selectedId && ids.includes(selectedId)) {
      setSelectedId(null);
    }
    setSelectedIds(new Set());
    await refresh();

    if (failures.length > 0) {
      setActionError(
        `Deleted ${ids.length - failures.length} of ${ids.length}. Failed: ${failures.join("; ")}`,
      );
    }

    setBulkDeleting(false);
  }

  return (
    <div className="computation-manager">
      <div className="computation-manager-header">
        <div>
          <h2>Computations</h2>
          <p className="muted">
            Queued and completed runs. Open a result in the Explorer or cancel active jobs.
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => refresh().catch(() => undefined)}>
          Refresh
        </button>
      </div>

      <div className="run-filters">
        <label className="field">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="all">All</option>
            <option value="done">Done</option>
            <option value="running">Running</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="field">
          <span>Type</span>
          <select
            value={filters.calculation_type}
            onChange={(event) =>
              setFilters((current) => ({ ...current, calculation_type: event.target.value }))
            }
          >
            <option value="all">All</option>
            {calculationTypes.map((type) => (
              <option key={type} value={type}>
                {calculationLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>System</span>
          <select
            value={filters.system}
            onChange={(event) =>
              setFilters((current) => ({ ...current, system: event.target.value }))
            }
          >
            <option value="all">All</option>
            {systems.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <pre className="error-box">{error}</pre>}
      {actionError && <pre className="error-box">{actionError}</pre>}

      <div className="computation-manager-body">
        <section className="computation-run-list">
          <div className="section-header computation-run-list-header">
            <h3>Run history</h3>
            <span className="muted">
              {loading ? "Loading…" : `${filteredCount(runs, total)} shown`}
            </span>
          </div>

          {runs.length > 0 && (
            <div className="computation-run-list-toolbar">
              <label className="run-select-all">
                <input
                  type="checkbox"
                  checked={allDeletableSelected}
                  disabled={deletableRuns.length === 0 || bulkDeleting}
                  onChange={() => toggleSelectAllDeletable()}
                />
                <span>Выбрать все</span>
              </label>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  className="danger btn-sm"
                  disabled={bulkDeleting || deletingId !== null}
                  onClick={() => void handleBulkDelete()}
                >
                  {bulkDeleting
                    ? "Удаление…"
                    : `Удалить выбранные (${selectedIds.size})`}
                </button>
              )}
            </div>
          )}

          {loading && runs.length === 0 ? (
            <p className="muted">Loading runs…</p>
          ) : runs.length === 0 ? (
            <p className="muted">No runs match the current filters.</p>
          ) : (
            <ul className="computation-run-items">
              {runs.map((run) => {
                const deletable = run.status !== "running";
                const checked = selectedIds.has(run.id);
                return (
                  <li key={run.id} className="computation-run-row">
                    <label className="run-select-checkbox" title={deletable ? "Выбрать для удаления" : "Сначала отмените running run"}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!deletable || bulkDeleting}
                        onChange={() => toggleSelected(run.id)}
                      />
                    </label>
                    <button
                      type="button"
                      className={
                        run.id === selectedRun?.id
                          ? "computation-run-item active"
                          : "computation-run-item"
                      }
                      onClick={() => setSelectedId(run.id)}
                    >
                      <div className="computation-run-item-top">
                        <span className="run-id">{run.id.slice(0, 8)}…</span>
                        <StatusBadge status={run.status} />
                      </div>
                      <span className="run-meta">
                        {calculationLabel(run.calculation_type)} · {run.system}
                      </span>
                      <span className="run-timestamp muted">{formatTimestamp(run.created_at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="computation-run-detail">
          {!selectedRun ? (
            <p className="muted">Select a run to inspect details.</p>
          ) : (
            <>
              <div className="computation-detail-header">
                <div>
                  <h3>{calculationLabel(selectedRun.calculation_type)}</h3>
                  <p className="muted">
                    {selectedRun.system} · {selectedRun.id}
                  </p>
                </div>
                <StatusBadge status={selectedRun.status} />
              </div>

              {selectedRun.status === "done" && isGridCalculation(selectedRun.calculation_type) && (
                <div className="run-preview-panel">
                  <RunPreview
                    runId={selectedRun.id}
                    calculationType={selectedRun.calculation_type}
                  />
                </div>
              )}

              {(selectedRun.status === "running" || selectedRun.status === "queued") && (
                <ProgressBar
                  status={selectedRun.status}
                  label="Computation in progress"
                  progress={selectedRun.progress}
                />
              )}

              <dl className="computation-detail-meta">
                <div>
                  <dt>Created</dt>
                  <dd>{formatTimestamp(selectedRun.created_at)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatTimestamp(selectedRun.updated_at)}</dd>
                </div>
                {selectedRun.parent_run_id && (
                  <div>
                    <dt>Parent run</dt>
                    <dd>{selectedRun.parent_run_id}</dd>
                  </div>
                )}
              </dl>

              {selectedRun.error_message && (
                <pre className="error-box">{selectedRun.error_message}</pre>
              )}

              <details className="computation-parameters">
                <summary>Parameters</summary>
                <pre>{JSON.stringify(selectedRun.parameters, null, 2)}</pre>
              </details>

              <div className="computation-detail-actions">
                <Link
                  className="button-link"
                  to={
                    selectedRun.calculation_type === POOL_CALCULATION_TYPE
                      ? `/?run=${selectedRun.id}&calculation=${selectedRun.calculation_type}&system=${selectedRun.system}&panel=pool`
                      : `/?run=${selectedRun.id}&calculation=${selectedRun.calculation_type}&system=${selectedRun.system}`
                  }
                >
                  Open in Explorer
                </Link>
                {selectedRun.artifact_url && (
                  <button
                    type="button"
                    className="artifact-link"
                    onClick={() => handleArtifactDownload(selectedRun.id)}
                  >
                    Download HDF5
                  </button>
                )}
                {(selectedRun.status === "queued" || selectedRun.status === "running") && (
                  <button
                    type="button"
                    className="danger"
                    disabled={cancellingId === selectedRun.id}
                    onClick={() => handleCancel(selectedRun.id)}
                  >
                    {cancellingId === selectedRun.id ? "Cancelling…" : "Cancel run"}
                  </button>
                )}
                {selectedRun.status !== "running" && (
                  <button
                    type="button"
                    className="danger"
                    disabled={deletingId === selectedRun.id}
                    onClick={() => handleDelete(selectedRun.id)}
                  >
                    {deletingId === selectedRun.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function filteredCount(items: Run[], total: number): string {
  if (items.length === total) {
    return `${total} run${total === 1 ? "" : "s"}`;
  }
  return `${items.length} of ${total}`;
}
