"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import s from "./Combobox.module.css";

export type ComboOption = { id: string; name: string; meta?: string };

type Props = {
  label: React.ReactNode;
  /** Nombre de la opción seleccionada; el input se resincroniza cuando cambia. */
  value: string;
  options: ComboOption[];
  onPick: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Mínimo de caracteres antes de sugerir. */
  minChars?: number;
  max?: number;
};

/**
 * Sustituye al `<input list=...>` + `<datalist>`: aquel no se navegaba con
 * teclado, solo confirmaba en `onBlur` con match exacto y no daba ninguna señal
 * cuando lo escrito no correspondía a nada.
 */
export default function Combobox({
  label,
  value,
  options,
  onPick,
  placeholder,
  disabled,
  minChars = 2,
  max = 60,
}: Props) {
  const id = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // El valor resuelto manda: si el motor normaliza a otro item, se refleja.
  useEffect(() => setText(value), [value]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < minChars) return [];
    const starts: ComboOption[] = [];
    const contains: ComboOption[] = [];
    for (const o of options) {
      const n = o.name.toLowerCase();
      if (n.startsWith(q)) starts.push(o);
      else if (n.includes(q)) contains.push(o);
      if (starts.length >= max) break;
    }
    return [...starts, ...contains].slice(0, max);
  }, [text, options, minChars, max]);

  const dirty = text.trim() !== value.trim();
  const exact = matches.find((o) => o.name.toLowerCase() === text.trim().toLowerCase());

  function commit(o: ComboOption) {
    setText(o.name);
    setOpen(false);
    onPick(o.id);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => {
        const n = matches.length;
        if (!n) return 0;
        return e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
      });
    } else if (e.key === "Enter") {
      const pick = matches[active] ?? exact;
      if (open && pick) {
        e.preventDefault();
        commit(pick);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setText(value); // deshace lo tecleado
    }
  }

  return (
    <div className={`field ${s.box}`} ref={boxRef}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && matches[active] ? `${id}-o${active}` : undefined}
        className={dirty ? s.dirty : undefined}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setText(value); // sin selección explícita no se cambia nada
        }}
        onKeyDown={onKeyDown}
      />

      {open && matches.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className={s.list}
          // evita que el blur del input cierre la lista antes del click
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? `${s.opt} ${s.active}` : s.opt}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(o)}
            >
              <span className={s.name}>{o.name}</span>
              {o.meta && <span className={s.meta}>{o.meta}</span>}
            </li>
          ))}
        </ul>
      )}

      {open && dirty && text.trim().length >= minChars && matches.length === 0 && (
        <p className={s.empty}>sin coincidencias</p>
      )}
    </div>
  );
}
