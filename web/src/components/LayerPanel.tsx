import { useState, type ReactNode } from "react";
import type { HeatmapLayer } from "./HeatmapViewer";
import { NumberInput } from "./NumberInput";
import { resolveLyapunovZero } from "../lib/colormap";
import { downloadHeatmapLayer } from "../lib/svgExport";

interface LayerPanelProps {
  layers: HeatmapLayer[];
  onToggle: (id: string) => void;
  onOpacity: (id: string, opacity: number) => void;
  onLyapunovZero: (id: string, zero: number) => void;
  onAttractionMapDisplayMode: (
    id: string,
    mode: "count" | "composition" | "periods",
  ) => void;
  onLabelChange: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onMoveInStack: (id: string, towardTop: boolean) => void;
  addLayerControl?: ReactNode;
}

export function LayerPanel({
  layers,
  onToggle,
  onOpacity,
  onLyapunovZero,
  onAttractionMapDisplayMode,
  onLabelChange,
  onRemove,
  onMoveInStack,
  addLayerControl,
}: LayerPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const displayLayers = [...layers].reverse();

  function startEdit(layer: HeatmapLayer) {
    setEditingId(layer.id);
    setEditValue(layer.label);
  }

  function commitEdit(id: string) {
    const trimmed = editValue.trim();
    if (trimmed) {
      onLabelChange(id, trimmed);
    }
    setEditingId(null);
  }

  return (
    <section className="layer-panel">
      <div className="layer-panel-header">
        <h2>Слои</h2>
        {layers.length > 0 && (
          <span className="muted layer-panel-hint">
            {layers.length} · сверху ближе к камере
          </span>
        )}
      </div>

      {addLayerControl && <div className="layer-add-control">{addLayerControl}</div>}

      {layers.length > 0 && (
        <ul className="layer-stack">
          {displayLayers.map((layer) => {
            const arrayIndex = layers.findIndex((item) => item.id === layer.id);
            const isTop = arrayIndex === layers.length - 1;
            const isBottom = arrayIndex === 0;
            const isEditing = editingId === layer.id;

            return (
              <li key={layer.id} className="layer-item">
                <div className="layer-item-header">
                  <label className="layer-row">
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => onToggle(layer.id)}
                    />
                    <span className="layer-stack-badge muted">#{layers.length - arrayIndex}</span>
                  </label>
                  <div className="layer-actions">
                    <button
                      type="button"
                      title="Скачать SVG"
                      onClick={() =>
                        downloadHeatmapLayer({
                          grid: layer.grid,
                          calculationType: layer.calculationType,
                          lyapunovZero: resolveLyapunovZero(layer.lyapunovZero),
                        })
                      }
                    >
                      ⇩
                    </button>
                    <button
                      type="button"
                      title="Выше в наложении"
                      disabled={isTop}
                      onClick={() => onMoveInStack(layer.id, true)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Ниже в наложении"
                      disabled={isBottom}
                      onClick={() => onMoveInStack(layer.id, false)}
                    >
                      ↓
                    </button>
                    <button type="button" title="Удалить слой" onClick={() => onRemove(layer.id)}>
                      ×
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <input
                    className="layer-name-input"
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit(layer.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitEdit(layer.id);
                      }
                      if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="layer-name-button"
                    title="Переименовать"
                    onClick={() => startEdit(layer)}
                  >
                    {layer.label}
                  </button>
                )}

                <div className="layer-opacity-row">
                  <span className="muted">Прозрачность</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={layer.opacity}
                    onChange={(e) => onOpacity(layer.id, Number(e.target.value))}
                  />
                  <span className="layer-opacity-value muted">{Math.round(layer.opacity * 100)}%</span>
                </div>

                {layer.calculationType === "lyapunov_spectrum" && (
                  <div className="layer-viz-row">
                    <NumberInput
                      className="field layer-viz-field"
                      label="Ноль (виз.)"
                      value={resolveLyapunovZero(layer.lyapunovZero)}
                      disabled={false}
                      min={1e-9}
                      max={10}
                      onChange={(zero) => onLyapunovZero(layer.id, zero)}
                    />
                    <span className="muted layer-viz-hint">Q ∈ [−z, z]</span>
                  </div>
                )}

                {(layer.calculationType === "attraction_map" ||
                  layer.calculationType === "attraction_map_composition" ||
                  layer.calculationType === "attraction_map_periods") && (
                  <div className="layer-display-toggle" role="group" aria-label="Режим отображения карты">
                    <button
                      type="button"
                      className={
                        (layer.attractionMapDisplayMode ?? "count") === "count"
                          ? "is-active"
                          : undefined
                      }
                      aria-pressed={(layer.attractionMapDisplayMode ?? "count") === "count"}
                      onClick={() => onAttractionMapDisplayMode(layer.id, "count")}
                    >
                      Количество
                    </button>
                    <button
                      type="button"
                      className={
                        (layer.attractionMapDisplayMode ?? "count") === "composition"
                          ? "is-active"
                          : undefined
                      }
                      aria-pressed={(layer.attractionMapDisplayMode ?? "count") === "composition"}
                      onClick={() => onAttractionMapDisplayMode(layer.id, "composition")}
                    >
                      EP / P / NP
                    </button>
                    <button
                      type="button"
                      className={
                        layer.attractionMapDisplayMode === "periods" ? "is-active" : undefined
                      }
                      aria-pressed={layer.attractionMapDisplayMode === "periods"}
                      onClick={() => onAttractionMapDisplayMode(layer.id, "periods")}
                    >
                      Периоды
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
