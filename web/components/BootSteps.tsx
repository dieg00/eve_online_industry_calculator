"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BOOT_STEPS,
  SERVER_SNAPSHOT,
  getBootSnapshot,
  isStalled,
  noteActivity,
  subscribeBoot,
  type BootSnapshot,
} from "@/lib/bootProgress";
import s from "./BootSteps.module.css";

const mb = (bytes: number) => (bytes / 1e6).toFixed(1);
const secs = (ms: number) => (ms < 10_000 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000).toString());

function rate(bps: number): string {
  return bps >= 100_000 ? `${mb(bps)} MB/s` : `${Math.round(bps / 1000)} KB/s`;
}

// Un tick que llega con este retraso es la pestaña bloqueada por CPU (Python
// compilando), no la red parada.
const LATE_TICK_MS = 2000;

/**
 * Arranque en frío por pasos, con lo que está pasando de verdad: bytes
 * recibidos, velocidad, fichero, tiempo restante y cuánto tardó cada paso. Si
 * la red deja de mandar datos lo dice, en vez de dejar un spinner que parece
 * colgado.
 */
export default function BootSteps() {
  const snap = useSyncExternalStore(subscribeBoot, getBootSnapshot, () => SERVER_SNAPSHOT);

  // Reloj propio: el tiempo y el detector de atasco tienen que avanzar aunque
  // no llegue ningún byte, que es justo el caso atascado.
  const [now, setNow] = useState(0);
  const last = useRef(0);
  useEffect(() => {
    const tick = () => {
      const t = performance.now();
      if (last.current && t - last.current > LATE_TICK_MS) noteActivity();
      last.current = t;
      setNow(t);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  const order = BOOT_STEPS.findIndex((x) => x.id === snap.step);
  const current = snap.step === "ready" ? BOOT_STEPS.length : Math.max(order, 0);
  const t = Math.max(now, snap.lastActivityAt);

  return (
    <div className={s.wrap}>
      <ol className={s.steps}>
        {BOOT_STEPS.map(({ id, label }, i) => {
          const done = snap.done.find((d) => d.id === id);
          const state = i < current ? s.done : i === current ? s.active : "";
          return (
            <li key={id} className={`${s.step} ${state}`} aria-current={i === current ? "step" : undefined}>
              <span className={s.ico} aria-hidden="true">
                {i < current ? "✓" : ""}
              </span>
              {label}
              {done && <span className={s.time}>{secs(done.ms)} s</span>}
            </li>
          );
        })}
      </ol>

      {snap.step !== "ready" && <Detail snap={snap} now={t} />}

      <p className={s.note}>
        El motor corre en tu navegador. La primera visita descarga el runtime de Python y los
        datos; las siguientes los reutilizan desde la caché y arrancan mucho más rápido.
      </p>
    </div>
  );
}

function Detail({ snap, now }: { snap: BootSnapshot; now: number }) {
  if (snap.step === "idle") return <p className={s.line}>Iniciando…</p>;

  const elapsed = now - snap.stepStartedAt;
  const stalled = isStalled(snap, now);
  const known = snap.expected > 0;
  const allIn = known && snap.received >= snap.expected * 0.98 && snap.pending === 0;
  // tope en 95 % hasta que el paso termine de verdad: los tamaños son estimados
  const frac = known ? Math.min(snap.received / snap.expected, 0.95) : 0;
  // la velocidad solo vale si llegaron bytes hace poco; si no, se quedaría
  // congelada en el último valor justo cuando la red se para
  const bps = now - snap.lastByteAt < 3000 ? snap.bps : 0;
  const remaining = known && bps > 0 ? (snap.expected - snap.received) / bps : null;

  let text: string;
  if (snap.step === "compile") {
    text = "Cargando los datos dentro de Python; la pestaña puede no responder un momento.";
  } else if (allIn) {
    // en el runtime, tras los bytes queda arrancar el intérprete (CPU)
    text = snap.step === "runtime" ? "Datos recibidos; iniciando Python…" : "Datos recibidos…";
  } else if (known) {
    text = `${mb(snap.received)} de ≈${mb(snap.expected)} MB`;
    if (bps > 0) text += ` · ${rate(bps)}`;
    if (snap.file && !stalled) text += ` · ${snap.file}`;
  } else {
    text =
      snap.received >= 1000
        ? `${Math.round(snap.received / 1000)} KB recibidos`
        : snap.received > 0
          ? `${snap.received} B recibidos`
          : "Conectando…";
    if (snap.file && !stalled) text += ` · ${snap.file}`;
  }

  const eta =
    !stalled && !allIn && remaining != null && elapsed > 3000 && remaining > 1
      ? ` · quedan ≈ ${Math.ceil(remaining)} s`
      : "";

  return (
    <div className={s.detail}>
      {known && snap.step !== "compile" && (
        <div
          className={s.track}
          role="progressbar"
          aria-label="Progreso de la descarga"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(frac * 100)}
        >
          <div className={s.fill} style={{ width: `${frac * 100}%` }} />
        </div>
      )}
      <p className={s.line}>
        <span>{text}</span>
        <span className={s.clock}>
          {secs(elapsed)} s{eta}
        </span>
      </p>

      {/* La región viva solo lleva una frase fija: el aviso visible cambia cada
          segundo ("desde hace 11 s") y un lector de pantalla lo repetiría sin
          parar. Se anuncia una vez al atascarse. */}
      <div aria-live="polite" className={s.sr}>
        {stalled && "La descarga se ha detenido. Puedes reintentar con el botón Reintentar."}
      </div>
      {stalled && (
        <div className={s.stall}>
          <p>
            Sin datos de la red desde hace {Math.round((now - snap.lastActivityAt) / 1000)} s
            {snap.waiting.length > 0 && <> (esperando {snap.waiting.join(", ")})</>}.{" "}
            {snap.step === "data"
              ? "Puede ser la conexión, o que no responda GitHub (de ahí salen los precios del día)."
              : "Puede ser la conexión, o un bloqueador de contenido que impide cargar cdn.jsdelivr.net."}
          </p>
          <button className="btn" onClick={() => location.reload()}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
