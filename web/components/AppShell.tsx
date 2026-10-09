"use client";

import { useEffect, useState, type ReactNode } from "react";

export function AppShell({
  query,
  meta,
  children,
}: {
  query: string | null;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  function share() {
    if (!query) return;
    const url = `${location.origin}${location.pathname}?${query}`;
    navigator.clipboard?.writeText(url).then(() => setCopied(true));
  }

  return (
    <>
      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            Ξ
          </span>
          <div>
            <h1>Industria EVE</h1>
            <p className="tagline">¿Cuánto ganas fabricando? Minas, compras, construyes.</p>
          </div>
        </div>
        <span className="header-spacer" />
        {meta && <span className="header-meta">{meta}</span>}
        <button type="button" className="btn sm" onClick={share} disabled={!query} title="Copia un enlace con este cálculo">
          {copied ? "Enlace copiado ✓" : "Compartir cálculo"}
        </button>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
