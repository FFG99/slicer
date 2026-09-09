import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`form-section${open ? " form-section-open" : ""}`}>
      <button
        type="button"
        className="form-section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="form-section-chevron" aria-hidden />
        {title}
      </button>
      {open && <div className="form-section-body">{children}</div>}
    </div>
  );
}
