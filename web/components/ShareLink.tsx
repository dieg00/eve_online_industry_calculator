"use client";

import { useState } from "react";
import s from "./ShareLink.module.css";

/** El estado entero vive en la URL, así que compartirla es compartir el cálculo. */
export default function ShareLink({ query }: { query: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}?${query}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* portapapeles bloqueado: la URL ya está en la barra de direcciones */
    }
  }

  return (
    <div className={s.bar}>
      <code className={s.code}>?{query}</code>
      <button className="btn btn-xs" onClick={copy}>
        {copied ? "copiado ✓" : "copiar enlace"}
      </button>
    </div>
  );
}
