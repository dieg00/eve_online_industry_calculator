"use client";

import s from "./Warnings.module.css";

/** Antes se cortaba en 15 sin decir cuántos quedaban fuera. */
export default function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;

  return (
    <details className={`panel ${s.wrap}`}>
      <summary className={s.summary}>
        {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"} del motor
      </summary>
      <ul className={s.list}>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}
