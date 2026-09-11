"use client";

import { useEffect, useState } from "react";
import { getPref, setPref } from "@/lib/prefs";
import s from "./Section.module.css";

/**
 * Sección plegable. `<details>` nativo: se pliega con teclado y sin JS. La
 * preferencia se lee tras montar para no romper la hidratación del export
 * estático.
 */
export default function Section({
  id,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(getPref(`sec.${id}`, defaultOpen));
  }, [id, defaultOpen]);

  return (
    <details
      className={`panel ${s.section}`}
      open={open}
      onToggle={(e) => {
        const v = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(v);
        setPref(`sec.${id}`, v);
      }}
    >
      <summary className={s.summary}>
        <span className={s.marker} aria-hidden="true" />
        <span className={s.title}>{title}</span>
        {badge && <span className={s.badge}>{badge}</span>}
      </summary>
      <div className={s.body}>{children}</div>
    </details>
  );
}
