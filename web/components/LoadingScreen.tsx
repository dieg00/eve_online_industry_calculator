const STEPS = [
  ["Descargando", "Runtime de Python (Pyodide)"],
  ["Instalando", "Motor de cálculo"],
  ["Cargando datos", "Blueprints, precios de Jita e índices"],
  ["Compilando", "Preparar el motor"],
] as const;

export function LoadingScreen({ status }: { status: string }) {
  let current = STEPS.findIndex(([prefix]) => status.startsWith(prefix));
  if (current < 0) current = status ? 0 : STEPS.length;
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <h2>Preparando la calculadora</h2>
      <p>
        El motor corre en tu navegador. La primera vez descarga ~10 MB; después queda en caché y
        cada cálculo es instantáneo.
      </p>
      <div className="steps">
        {STEPS.map(([, label], i) => (
          <div key={label} className={`step ${i < current ? "done" : i === current ? "active" : ""}`}>
            <span className="ico">{i < current ? "✓" : ""}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorScreen({
  title,
  message,
  onRetry,
  retryLabel = "Reintentar",
}: {
  title: string;
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="error-screen">
      <h2>{title}</h2>
      <pre>{message}</pre>
      <button type="button" className="btn primary" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}
