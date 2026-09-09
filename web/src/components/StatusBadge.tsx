interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge-${status}`}>{status}</span>;
}
