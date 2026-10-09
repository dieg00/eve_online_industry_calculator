"use client";

import s from "./BootSteps.module.css";

// Los prefijos son los textos de estado que emiten pyodide.ts / engine.ts.
const STEPS: [prefix: string, label: string][] = [
  ["Descargando", "Runtime de Python (Pyodide)"],
  ["Instalando", "Motor de cálculo"],
  ["Cargando datos", "Blueprints, precios de Jita e índices"],
  ["Compilando", "Preparar el motor"],
];

/**
 * Arranque en frío por pasos. Antes era un spinner con una línea de texto que
 * no decía ni cuánto quedaba ni que solo pasa la primera vez.
 */
export default function BootSteps({ status }: { status: string }) {
  let current = STEPS.findIndex(([prefix]) => status.startsWith(prefix));
  if (current < 0) current = status ? 0 : STEPS.length;

  return (
    <div className={s.wrap} role="status" aria-live="polite">
      <ol className={s.steps}>
        {STEPS.map(([, label], i) => {
          const state = i < current ? s.done : i === current ? s.active : "";
          return (
            <li key={label} className={`${s.step} ${state}`}>
              <span className={s.ico}>{i < current ? "✓" : ""}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <p className={s.note}>
        El motor corre en tu navegador. La primera vez descarga ~10 MB; después queda en caché y
        cada cálculo es instantáneo.
      </p>
    </div>
  );
}
