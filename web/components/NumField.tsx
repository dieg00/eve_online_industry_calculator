"use client";

// Input numérico controlado "con borrador": mientras se escribe se guarda el
// texto tal cual (se puede vaciar y reescribir) y solo se emite un valor cuando
// el texto es un número válido; al salir del campo vacío se emite null.

import { useEffect, useRef, useState } from "react";

type Props = {
  id?: string;
  value: number | null;          // valor canónico (ya en las unidades del input)
  onCommit: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  digits?: number;               // decimales al formatear el valor canónico
};

function fmt(v: number | null, digits?: number): string {
  if (v == null || !isFinite(v)) return "";
  return digits != null ? String(+v.toFixed(digits)) : String(v);
}

export function NumField({ id, value, onCommit, min, max, step, placeholder, digits }: Props) {
  const [draft, setDraft] = useState(() => fmt(value, digits));
  const focused = useRef(false);

  // si el valor cambia desde fuera (otro control, un enlace), refrescar el texto
  useEffect(() => {
    if (!focused.current) setDraft(fmt(value, digits));
  }, [value, digits]);

  function parse(text: string): number | null {
    if (text.trim() === "") return null;
    const n = Number(text.replace(",", "."));
    if (!isFinite(n)) return null;
    if (min != null && n < min) return null;
    if (max != null && n > max) return null;
    return n;
  }

  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const t = e.target.value;
        setDraft(t);
        const n = parse(t);
        if (n != null) onCommit(n);
      }}
      onBlur={() => {
        focused.current = false;
        const n = parse(draft);
        if (n == null) onCommit(null);
        setDraft(fmt(n ?? value, digits));
      }}
    />
  );
}

/** Campo en % que guarda una fracción (0.03 <-> "3"). `def` = valor por defecto que se emite como null. */
export function PctField({
  id,
  value,
  def,
  onCommit,
  placeholder,
  step = 0.1,
}: {
  id: string;
  value: number | null;
  def: number | null;
  onCommit: (frac: number | null) => void;
  placeholder?: string;
  step?: number;
}) {
  return (
    <NumField
      id={id}
      min={0}
      step={step}
      digits={3}
      placeholder={placeholder}
      value={value != null ? value * 100 : null}
      onCommit={(v) => {
        if (v == null) return onCommit(null);
        const frac = v / 100;
        onCommit(def != null && Math.abs(frac - def) < 1e-9 ? null : frac);
      }}
    />
  );
}
