"use client";

import { useEffect, useState } from "react";
import { getLastSeenVersion, setLastSeenVersion } from "@/lib/lastSeenVersion";
import type { ChangelogEntry } from "@/lib/types";
import s from "./VersionBadge.module.css";

/**
 * Insignia de versión + panel de novedades. `entries[0].version` es la
 * versión que corre ahora mismo (ver CHANGELOG.md / sync-assets.mjs). En la
 * primera visita nunca se marca como "no vista" — no hay nada que comparar
 * todavía para ese navegador; solo a partir de la segunda visita con una
 * versión distinta aparece la marca, que se limpia al abrir el panel.
 */
export default function VersionBadge({ entries }: { entries: ChangelogEntry[] }) {
  const current = entries[0]?.version ?? null;
  const [seen, setSeen] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    const stored = getLastSeenVersion();
    if (stored === null) {
      setLastSeenVersion(current);
      setSeen(current);
    } else {
      setSeen(stored);
    }
  }, [current]);

  if (!current) return null;
  const unseen = seen !== null && seen !== current;

  return (
    <details
      className={s.wrap}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) {
          setLastSeenVersion(current);
          setSeen(current);
        }
      }}
    >
      <summary className={s.summary}>
        <span className={s.badge}>
          v{current}
          {unseen && <span className={s.dot} aria-hidden="true" />}
        </span>
        <span>novedades</span>
      </summary>

      <div className={s.panel}>
        {entries.map((e) => (
          <div key={e.version} className={s.entry}>
            <p className={s.entryHead}>
              v{e.version}
              {e.date && <span className={s.date}> · {e.date}</span>}
            </p>
            <ul className={s.highlights}>
              {e.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
