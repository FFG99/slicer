import { useEffect, useMemo, useRef, useState } from "react";
import { getRunGrid } from "../api/client";
import { isGridCalculation } from "../lib/linked";
import { calculationLabel } from "../lib/labels";
import { gridValueToColor, layerValueRange, colorToRgbBytes } from "../lib/colormap";
import type { GridData, Run } from "../types";
import { StatusBadge } from "./StatusBadge";

interface RunManagerProps {
  runs: Run[];
  selectedId: string | null;
  onSelect: (runId: string) => void;
}

function RunPreview({ runId, calculationType }: { runId: string; calculationType: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState<GridData | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRunGrid(runId, { max_dim: 48 })
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

export function RunManager({ runs, selectedId, onSelect }: RunManagerProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [systemFilter, setSystemFilter] = useState("all");
  const [previewId, setPreviewId] = useState<string | null>(selectedId);

  useEffect(() => {
    setPreviewId(selectedId);
  }, [selectedId]);

  const calculationTypes = useMemo(
    () => [...new Set(runs.map((run) => run.calculation_type))].sort(),
    [runs],
  );
  const systems = useMemo(
    () => [...new Set(runs.map((run) => run.system))].sort(),
    [runs],
  );

  const filtered = runs.filter((run) => {
    if (statusFilter !== "all" && run.status !== statusFilter) {
      return false;
    }
    if (typeFilter !== "all" && run.calculation_type !== typeFilter) {
      return false;
    }
    if (systemFilter !== "all" && run.system !== systemFilter) {
      return false;
    }
    return true;
  });

  const previewRun = filtered.find((run) => run.id === previewId) ?? filtered[0] ?? null;

  return (
    <section className="run-manager">
      <h2>Runs</h2>
      <div className="run-filters">
        <label className="field">
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="done">Done</option>
            <option value="running">Running</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label className="field">
          <span>Type</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
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
          <select value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)}>
            <option value="all">All</option>
            {systems.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {previewRun && (
        <div className="run-preview-panel">
          {previewRun.status === "done" && isGridCalculation(previewRun.calculation_type) ? (
            <RunPreview runId={previewRun.id} calculationType={previewRun.calculation_type} />
          ) : (
            <div className="run-preview run-preview-empty muted">
              {previewRun.status === "running" || previewRun.status === "queued"
                ? "Computing…"
                : "Preview unavailable"}
            </div>
          )}
          <div className="run-preview-meta">
            <span>{calculationLabel(previewRun.calculation_type)}</span>
            <StatusBadge status={previewRun.status} />
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="muted">No runs match filters.</p>
      ) : (
        <ul className="run-list-items">
          {filtered.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                className={run.id === selectedId ? "run-item active" : "run-item"}
                onClick={() => onSelect(run.id)}
                onMouseEnter={() => setPreviewId(run.id)}
                onFocus={() => setPreviewId(run.id)}
              >
                <span className="run-id">{run.id.slice(0, 8)}…</span>
                <StatusBadge status={run.status} />
                <span className="run-meta">
                  {calculationLabel(run.calculation_type)} · {run.system}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
