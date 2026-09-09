import { useEffect, useState } from "react";

/** Pre-measure fallback so the first paint is not a 0-sized canvas. */
const FALLBACK_SIDE = 480;
/** Never let the visible map get smaller than this, whatever the layout does. */
const MIN_SIDE = 160;
/** Resize in steps so window dragging does not redraw on every pixel. */
const SIDE_STEP = 16;
/** Backing-store resolution bounds (rasterization cost grows as side^2). */
const MIN_DRAW_SIDE = 256;
const MAX_DRAW_SIDE = 1024;
/** Minimum width kept for the info column in beside mode + flex gap. */
const INFO_BESIDE_RESERVED = 184;
/** Estimate of the info block height in below mode before it is measured. */
const INFO_BELOW_FALLBACK = 170;
const ROW_GAP = 8;

interface Box {
  width: number;
  height: number;
}

function useObservedSize(node: HTMLElement | null): Box | null {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!node) {
      setBox(null);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }
      setBox((current) =>
        current && current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return box;
}

export interface SquareCanvasSize {
  /** Attach to the row wrapping the canvas slot and the info column. */
  rowRef: (node: HTMLDivElement | null) => void;
  /** Attach to the slot element the canvas should fill. */
  slotRef: (node: HTMLDivElement | null) => void;
  /** Attach to the axes/legend info block. */
  infoRef: (node: HTMLDivElement | null) => void;
  /** CSS side of the canvas: the largest square that fits the layout. */
  cssSide: number;
  /** Canvas backing-store side (device-pixel aware, capped for speed). */
  drawSide: number;
  /** True when axes/legends go beside the map instead of below it. */
  infoBeside: boolean;
}

/**
 * Sizes a square map canvas from ResizeObserver measurements. CSS alone
 * cannot express "largest square inside a flex/grid-sized box" reliably
 * across viewport shapes (percentage chains collapse or fall back to the
 * canvas's intrinsic size), so the available space is measured explicitly.
 *
 * The axes/legend info block is placed on whichever side of the map wastes
 * less space: beside it on wide rows, below it on tall ones. The choice is
 * made by comparing the square side each placement would allow, using only
 * the row box (mode-independent) and the info height last measured in
 * below mode, so the decision cannot oscillate.
 */
export function useSquareCanvasSize(): SquareCanvasSize {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [info, setInfo] = useState<HTMLDivElement | null>(null);
  const rowBox = useObservedSize(row);
  const slotBox = useObservedSize(slot);
  const infoBox = useObservedSize(info);
  const [infoBelowHeight, setInfoBelowHeight] = useState(INFO_BELOW_FALLBACK);

  let infoBeside = false;
  if (rowBox) {
    const besideSide = Math.min(rowBox.height, rowBox.width - INFO_BESIDE_RESERVED);
    const belowSide = Math.min(
      rowBox.width,
      rowBox.height - infoBelowHeight - ROW_GAP,
    );
    infoBeside = besideSide > belowSide + ROW_GAP;
  }

  useEffect(() => {
    if (!infoBeside && infoBox) {
      const measured = Math.round(infoBox.height);
      setInfoBelowHeight((current) => (current === measured ? current : measured));
    }
  }, [infoBeside, infoBox]);

  let rawSide = FALLBACK_SIDE;
  if (infoBeside && rowBox) {
    // The slot is content-sized in beside mode; the square takes what the
    // row allows and the info column absorbs the exact leftover width.
    rawSide = Math.min(rowBox.height, rowBox.width - INFO_BESIDE_RESERVED);
  } else if (slotBox) {
    rawSide = Math.min(slotBox.width, slotBox.height);
  }
  const cssSide = Math.max(
    MIN_SIDE,
    Math.floor(Math.floor(rawSide) / SIDE_STEP) * SIDE_STEP,
  );

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const drawSide = Math.max(
    MIN_DRAW_SIDE,
    Math.min(MAX_DRAW_SIDE, Math.round(cssSide * dpr)),
  );

  return {
    rowRef: setRow,
    slotRef: setSlot,
    infoRef: setInfo,
    cssSide,
    drawSide,
    infoBeside,
  };
}
