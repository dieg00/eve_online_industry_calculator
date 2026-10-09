"use client";

import { useCallback } from "react";
import type { Buildable } from "@/lib/engine";
import { ACTIVITY_LABEL, secBand, type SystemsDoc } from "@/lib/data";
import { Combobox, type ComboOption } from "./Combobox";

function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(` ${q}`)) return 2;
  return 3;
}

export function ItemPicker({
  buildables,
  selectedName,
  onPick,
}: {
  buildables: Buildable[];
  selectedName: string;
  onPick: (typeId: number) => void;
}) {
  const search = useCallback(
    (text: string): ComboOption[] => {
      const q = text.trim().toLowerCase();
      return buildables
        .filter(([, name]) => name.toLowerCase().includes(q))
        .map((b) => [rank(b[1], q), b] as const)
        .sort((a, b) => a[0] - b[0] || a[1][1].localeCompare(b[1][1]))
        .slice(0, 50)
        .map(([, [id, name, activity]]) => ({
          id: String(id),
          label: name,
          hint: activity !== 1 ? ACTIVITY_LABEL[activity] ?? "" : undefined,
        }));
    },
    [buildables],
  );
  return (
    <Combobox
      inputId="item"
      value={selectedName}
      search={search}
      onPick={(id) => onPick(+id)}
      placeholder="Providence, Damage Control II, Hulk…"
    />
  );
}

export function SystemPicker({
  systems,
  selectedName,
  onPick,
}: {
  systems: SystemsDoc["systems"];
  selectedName: string;
  onPick: (systemId: number) => void;
}) {
  const search = useCallback(
    (text: string): ComboOption[] => {
      const q = text.trim().toLowerCase();
      return Object.entries(systems)
        .filter(([, [name]]) => name.toLowerCase().includes(q))
        .map((e) => [rank(e[1][0], q), e] as const)
        .sort((a, b) => a[0] - b[0] || a[1][1][0].localeCompare(b[1][1][0]))
        .slice(0, 40)
        .map(([, [id, [name, sec]]]) => ({
          id,
          label: name,
          hint: sec.toFixed(1),
          lead: <span className={`sec-dot sec-${secBand(sec)}`} />,
        }));
    },
    [systems],
  );
  return (
    <Combobox
      inputId="system"
      value={selectedName}
      search={search}
      onPick={(id) => onPick(+id)}
      placeholder="Jita, Amarr, Sakht…"
    />
  );
}
