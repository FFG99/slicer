import { useEffect, useRef, useState } from "react";

interface NumberInputProps {
  label: string;
  value: unknown;
  disabled: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  className?: string;
  onChange: (value: number) => void;
}

function formatNumber(value: unknown, integer: boolean): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return "";
  }
  return integer ? String(Math.trunc(n)) : String(n);
}

function isPartialInput(text: string): boolean {
  if (text === "" || text === "-" || text === "." || text === "-.") {
    return true;
  }
  // Incomplete scientific notation (e.g. "1e", "1e-", "1e+")
  if (/[eE]([+-]?)$/.test(text)) {
    return true;
  }
  return false;
}

function isValidNumberInput(raw: string, integer: boolean): boolean {
  if (isPartialInput(raw)) {
    return true;
  }
  if (integer) {
    return /^-?\d+$/.test(raw);
  }
  return /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw);
}

export function NumberInput({
  label,
  value,
  disabled,
  integer = false,
  min,
  max,
  className = "field",
  onChange,
}: NumberInputProps) {
  const [text, setText] = useState(() => formatNumber(value, integer));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(formatNumber(value, integer));
    }
  }, [value, integer]);

  function commit(raw: string) {
    if (isPartialInput(raw)) {
      const fallback = 0;
      onChange(fallback);
      setText(formatNumber(fallback, integer));
      return;
    }
    const parsed = integer ? parseInt(raw, 10) : Number(raw);
    if (Number.isNaN(parsed)) {
      setText(formatNumber(value, integer));
      return;
    }
    let next = parsed;
    if (min !== undefined) {
      next = Math.max(min, next);
    }
    if (max !== undefined) {
      next = Math.min(max, next);
    }
    onChange(next);
    setText(formatNumber(next, integer));
  }

  return (
    <label className={className}>
      <span>{label}</span>
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        disabled={disabled}
        value={text}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidNumberInput(raw, integer)) {
            return;
          }
          setText(raw);
        }}
        onBlur={() => {
          focusedRef.current = false;
          commit(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
