import type { PortraitOverlay } from "../lib/portraitOverlay";

interface PortraitOverlayPanelProps {
  overlays: PortraitOverlay[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onColorChange: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSetAllVisible?: (visible: boolean) => void;
  onPinActive?: () => void;
  poolReady?: boolean;
}

export function PortraitOverlayPanel({
  overlays,
  activeId,
  onSelect,
  onToggle,
  onColorChange,
  onRemove,
  onClear,
  onSetAllVisible,
  onPinActive,
  poolReady = false,
}: PortraitOverlayPanelProps) {
  const activeOverlay = overlays.find((overlay) => overlay.id === activeId) ?? null;
  const canPinActive = Boolean(activeOverlay && !activeOverlay.pinned && onPinActive);
  const allVisible = overlays.every((overlay) => overlay.visible);

  if (!poolReady) {
    return (
      <div className="portrait-overlay-panel portrait-overlay-panel-dock">
        <span className="portrait-overlay-title">Траектории</span>
      </div>
    );
  }

  if (overlays.length === 0) {
    return (
      <div className="portrait-overlay-panel portrait-overlay-panel-dock">
        <span className="portrait-overlay-title">Траектории</span>
      </div>
    );
  }

  return (
    <div className="portrait-overlay-panel portrait-overlay-panel-dock">
      <div className="portrait-overlay-header">
        <span className="portrait-overlay-title">Траектории ({overlays.length})</span>
        <div className="portrait-overlay-header-actions">
          {canPinActive && (
            <button type="button" className="btn-sm" onClick={onPinActive}>
              Закрепить
            </button>
          )}
          <button type="button" className="btn-sm secondary" onClick={onClear}>
            Очистить
          </button>
        </div>
      </div>
      {onSetAllVisible && (
        <button
          type="button"
          className="portrait-overlay-toggle-all"
          onClick={() => onSetAllVisible(!allVisible)}
        >
          {allVisible ? "Скрыть все" : "Показать все"}
        </button>
      )}
      <ul className="portrait-overlay-list">
        {overlays.map((overlay) => (
          <li key={overlay.id} className="portrait-overlay-item">
            <label className="portrait-overlay-row">
              <input
                type="checkbox"
                checked={overlay.visible}
                onChange={() => onToggle(overlay.id)}
              />
              <label
                className="portrait-overlay-swatch"
                style={{ background: overlay.color }}
                title="Изменить цвет траектории"
              >
                <input
                  type="color"
                  aria-label={`Цвет траектории ${overlay.label}`}
                  value={overlay.color}
                  onChange={(event) => onColorChange(overlay.id, event.target.value)}
                />
              </label>
              <button
                type="button"
                className={
                  overlay.id === activeId
                    ? "portrait-overlay-name active"
                    : "portrait-overlay-name"
                }
                onClick={() => onSelect(overlay.id)}
              >
                {!overlay.pinned && <span className="portrait-overlay-current-badge">текущий</span>}
                {overlay.label}
              </button>
            </label>
            <button
              type="button"
              className="portrait-overlay-remove"
              title="Удалить"
              onClick={() => onRemove(overlay.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
