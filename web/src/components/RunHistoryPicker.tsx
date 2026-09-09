import { useId, useState } from "react";
import { calculationLabel } from "../lib/labels";
import { defaultLayerLabel } from "../lib/layerLabels";
import type { Run } from "../types";

interface RunHistoryPickerProps {
  runs: Run[];
  label: string;
  hint?: string;
  emptyHint?: string;
  eligible: (run: Run) => boolean;
  formatLabel?: (run: Run) => string;
  busy?: boolean;
  onAdd: (runId: string) => Promise<void>;
}

export function RunHistoryPicker({
  runs,
  label,
  hint,
  emptyHint = "Нет подходящих вычислений",
  eligible,
  formatLabel = defaultLayerLabel,
  busy = false,
  onAdd,
}: RunHistoryPickerProps) {
  const selectId = useId();
  const [selectedId, setSelectedId] = useState("");
  const [adding, setAdding] = useState(false);

  const options = runs.filter(eligible);

  async function handleAdd() {
    if (!selectedId) {
      return;
    }
    setAdding(true);
    try {
      await onAdd(selectedId);
      setSelectedId("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="run-history-picker">
      <div className="run-history-picker-row">
        <div className="field run-history-field">
          <label htmlFor={selectId}>{label}</label>
          <select
            id={selectId}
            disabled={busy || adding || options.length === 0}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">
              {options.length === 0 ? emptyHint : "Выберите run…"}
            </option>
            {options.map((run) => (
              <option key={run.id} value={run.id}>
                {formatLabel(run)} · {calculationLabel(run.calculation_type)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn-sm secondary"
          disabled={!selectedId || busy || adding}
          onClick={() => void handleAdd()}
        >
          {adding ? "…" : "Добавить"}
        </button>
      </div>
      {hint && <p className="muted run-history-hint">{hint}</p>}
    </div>
  );
}
