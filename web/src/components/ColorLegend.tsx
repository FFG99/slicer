import { calculationLabel } from "../lib/labels";
import { useEffect, useState } from "react";
import {
  hasPaletteLegend,
  paletteLegendEntries,
  resolveLyapunovZero,
  setPaletteColor,
} from "../lib/colormap";

interface ColorLegendProps {
  calculationType: string;
  title?: string;
  lyapunovZero?: number;
  categories?: Array<{ value: number; label: string }>;
}

export function ColorLegend({ calculationType, title, lyapunovZero, categories }: ColorLegendProps) {
  const [, setPaletteRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setPaletteRevision((value) => value + 1);
    window.addEventListener("slicer-palette-change", refresh);
    return () => window.removeEventListener("slicer-palette-change", refresh);
  }, []);
  if (!hasPaletteLegend(calculationType, categories)) {
    return null;
  }

  const entries = paletteLegendEntries(calculationType, categories);
  const heading = title ?? calculationLabel(calculationType);
  const zero =
    calculationType === "lyapunov_spectrum" ? resolveLyapunovZero(lyapunovZero) : undefined;

  return (
    <div className="color-legend">
      <div className="color-legend-title">{heading}</div>
      {zero !== undefined && (
        <p className="color-legend-note muted">
          Q: [−{zero}, {zero}] · P &lt; −{zero} · C &gt; {zero}
        </p>
      )}
      <div className="color-legend-items">
        {entries.map((entry) => (
          <div className="color-legend-item" key={entry.label}>
            <label
              className="color-legend-swatch"
              style={{ background: entry.color }}
              title={`Изменить цвет ${entry.label}`}
            >
              <input
                type="color"
                aria-label={`Цвет ${entry.label}`}
                value={entry.color}
                onChange={(event) => setPaletteColor(calculationType, entry.index, event.target.value)}
              />
            </label>
            <span className="color-legend-label">{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface HeatmapLegendSpec {
  calculationType: string;
  lyapunovZero?: number;
  title?: string;
  categories?: Array<{ value: number; label: string }>;
}

interface HeatmapColorLegendsProps {
  layers: HeatmapLegendSpec[];
}

function legendKey(spec: HeatmapLegendSpec): string {
  if (spec.calculationType === "lyapunov_spectrum") {
    return `lyapunov_spectrum:${resolveLyapunovZero(spec.lyapunovZero)}`;
  }
  if (
    spec.calculationType === "attraction_map_composition" ||
    spec.calculationType === "attraction_map_periods"
  ) {
    return `${spec.calculationType}:${spec.categories
      ?.map((category) => `${category.value}:${category.label}`)
      .join("|") ?? ""}`;
  }
  return spec.calculationType;
}

export function HeatmapColorLegends({ layers }: HeatmapColorLegendsProps) {
  const seen = new Set<string>();
  const specs: HeatmapLegendSpec[] = [];
  for (const layer of layers) {
    if (!hasPaletteLegend(layer.calculationType, layer.categories)) {
      continue;
    }
    const key = legendKey(layer);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    specs.push(layer);
  }

  if (specs.length === 0) {
    return null;
  }

  return (
    <div className="heatmap-color-legends">
      {specs.map((spec) => (
        <ColorLegend
          key={legendKey(spec)}
          calculationType={spec.calculationType}
          title={spec.title}
          lyapunovZero={spec.lyapunovZero}
          categories={spec.categories}
        />
      ))}
    </div>
  );
}
