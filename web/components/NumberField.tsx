"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label?: React.ReactNode;
  value: string | number | null;
  onCommit: (raw: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  disabled?: boolean;
  delay?: number;
};

/**
 * Campo numérico que confirma con retardo, para no recalcular en cada tecla.
 * Mientras tiene el foco no se resincroniza con la prop: si no, el valor que
 * devuelve normalizado el motor pisaría lo que se está escribiendo.
 */
export default function NumberField({
  label,
  value,
  onCommit,
  placeholder,
  min,
  max,
  step,
  disabled,
  delay = 250,
}: Props) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused.current) setText(value == null ? "" : String(value));
  }, [value]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function schedule(raw: string) {
    setText(raw);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(raw), delay);
  }

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    onCommit(text);
  }

  const input = (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => schedule(e.target.value)}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        flush();
      }}
      onKeyDown={(e) => e.key === "Enter" && flush()}
    />
  );

  if (!label) return input;
  return (
    <div className="field">
      <label>{label}</label>
      {input}
    </div>
  );
}
