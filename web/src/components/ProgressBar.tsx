import type { CSSProperties } from "react";

interface ProgressBarProps {
  status: string;
  label?: string;
  /** Fraction complete in [0, 1], when known. */
  progress?: number | null;
}

function resolveFraction(status: string, progress?: number | null): number | null {
  if (status === "done") {
    return 1;
  }
  if (status === "failed" || status === "cancelled") {
    return null;
  }
  if (progress != null && Number.isFinite(progress)) {
    return Math.max(0, Math.min(1, progress));
  }
  if (status === "queued") {
    return 0;
  }
  return null;
}

export function ProgressBar({ status, label, progress }: ProgressBarProps) {
  const active = status === "running" || status === "queued";
  const fraction = resolveFraction(status, progress);
  const hasDeterminateProgress = fraction != null && active;
  const percent = fraction != null ? Math.round(fraction * 100) : null;

  let fillClass = "progress-fill progress-fill-indeterminate";
  let fillStyle: CSSProperties | undefined;

  if (status === "done") {
    fillClass = "progress-fill progress-fill-done";
    fillStyle = { width: "100%" };
  } else if (status === "failed") {
    fillClass = "progress-fill progress-fill-failed";
    fillStyle = { width: "100%" };
  } else if (hasDeterminateProgress) {
    fillClass = "progress-fill progress-fill-active";
    fillStyle = { width: `${percent}%` };
  }

  const statusText =
    percent != null && active ? `${status} · ${percent}%` : status;

  return (
    <div className="progress-wrap">
      {label && <span className="progress-label muted">{label}</span>}
      <div className={`progress-track${active ? " progress-track-active" : ""}`}>
        <div className={fillClass} style={fillStyle} />
      </div>
      <span className="progress-status">{statusText}</span>
    </div>
  );
}
