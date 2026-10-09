"use client";

import type { ResolveResult } from "@/lib/engine";
import { iskShort, pct } from "@/lib/format";

export function MobileBar({ r }: { r: ResolveResult }) {
  const tone = r.margin == null ? "" : r.margin >= 0 ? "good" : "bad";
  return (
    <button
      type="button"
      className="mobile-bar"
      onClick={() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" })}
      aria-label="Ir al resultado"
    >
      <span className="n">
        {r.root_demand > 1 ? `${r.root_demand} × ` : ""}
        {r.root_name}
      </span>
      <span className={`m ${tone}`}>
        {iskShort(r.margin)} <span className="muted small">{pct(r.margin_pct)}</span>
      </span>
    </button>
  );
}
