"use client";

// Combobox accesible y sin dependencias: input + lista filtrada, navegación con
// teclado (↑ ↓ Enter Esc) y selección con ratón. El padre decide qué opciones
// corresponden a un texto (`search`) y qué pasa al elegir una (`onPick`).

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

export type ComboOption = {
  id: string;
  label: string;
  hint?: string;
  lead?: ReactNode;
};

type Props = {
  value: string;                                 // etiqueta de la opción seleccionada
  search: (text: string) => ComboOption[];       // opciones para un texto (ya filtradas/limitadas)
  onPick: (id: string) => void;
  placeholder?: string;
  inputId?: string;
  minChars?: number;
};

export function Combobox({ value, search, onPick, placeholder, inputId, minChars = 2 }: Props) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // si cambia la selección desde fuera (p. ej. al cargar un enlace), reflejarla
  useEffect(() => {
    setText(value);
  }, [value]);

  const options = useMemo(
    () => (open && text.trim().length >= minChars ? search(text) : []),
    [open, text, search, minChars],
  );

  function pick(id: string) {
    const opt = options.find((o) => o.id === id);
    if (opt) setText(opt.label);
    setOpen(false);
    onPick(id);
  }

  function commitOrRevert() {
    const q = text.trim().toLowerCase();
    if (q && q !== value.toLowerCase()) {
      const all = search(text);
      const exact = all.find((o) => o.label.toLowerCase() === q);
      const hit = exact ?? (all.length === 1 ? all[0] : undefined);
      if (hit) {
        setText(hit.label);
        setOpen(false);
        onPick(hit.id);
        return;
      }
    }
    setText(value);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && options[active]) {
        e.preventDefault();
        pick(options[active].id);
      } else {
        commitOrRevert();
      }
    } else if (e.key === "Escape") {
      setText(value);
      setOpen(false);
    }
  }

  const showList = open && text.trim().length >= minChars;

  return (
    <div className="combo">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onBlur={commitOrRevert}
        onKeyDown={onKey}
      />
      {text && (
        <button
          type="button"
          className="clear"
          aria-label="Borrar"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setText("");
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}
      {showList && (
        <ul className="combo-list" id={listId} role="listbox">
          {options.length === 0 && <li className="none">Sin resultados</li>}
          {options.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.id)}
            >
              {o.lead}
              <span className="name">{o.label}</span>
              {o.hint && <span className="hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
