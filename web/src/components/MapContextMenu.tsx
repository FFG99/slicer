export type MapContextSource = "parameter_map" | "pool_map";

export interface MapContextMenuState {
  clientX: number;
  clientY: number;
  world: { x: number; y: number };
  source: MapContextSource;
}

interface MapContextMenuProps {
  menu: MapContextMenuState;
  axisNames: { x: string; y: string };
  showPoolOfAttraction: boolean;
  busy: boolean;
  onPhasePortrait: () => void;
  onPoolOfAttraction: () => void;
  onCopyCoordinates: () => void;
  onClose: () => void;
}

export function MapContextMenu({
  menu,
  axisNames,
  showPoolOfAttraction,
  busy,
  onPhasePortrait,
  onPoolOfAttraction,
  onCopyCoordinates,
  onClose,
}: MapContextMenuProps) {
  const { world, source } = menu;
  const isPoolMap = source === "pool_map";

  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div
        className="context-menu"
        style={{ left: menu.clientX, top: menu.clientY }}
        role="menu"
      >
        <div className="context-menu-header">
          {axisNames.x} = {world.x.toFixed(4)}
          <br />
          {axisNames.y} = {world.y.toFixed(4)}
        </div>
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => {
            onPhasePortrait();
            onClose();
          }}
        >
          {isPoolMap ? "Phase portrait at this IC" : "Phase portrait"}
        </button>
        {showPoolOfAttraction && !isPoolMap && (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              onPoolOfAttraction();
              onClose();
            }}
          >
            Pool of attraction
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className="context-menu-secondary"
          onClick={() => {
            onCopyCoordinates();
            onClose();
          }}
        >
          Copy coordinates
        </button>
      </div>
    </>
  );
}
