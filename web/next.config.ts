import type { NextConfig } from "next";

// URL de la rama `data` (precios e índices que publica la GitHub Action a diario).
// La web la lee en runtime para refrescar precios sin re-deploy. Si no se define
// NEXT_PUBLIC_DATA_URL, se reutiliza DATA_BRANCH_RAW_BASE: es el mismo valor y es
// la única variable que existe en Vercel. Sin esto, la web servía los precios
// empaquetados en el último deploy. No es un secreto: es el raw público del repo.
const dataUrl = process.env.NEXT_PUBLIC_DATA_URL || process.env.DATA_BRANCH_RAW_BASE;

// Export estático: todo el cómputo vive en el cliente (Pyodide), sin backend.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // `env` inlinea el valor en el bundle en build-time (Next lo sustituye en
  // `process.env.NEXT_PUBLIC_DATA_URL`). Solo se define si hay valor: así en
  // local, sin variables, sigue cayendo a la copia de /data/.
  ...(dataUrl ? { env: { NEXT_PUBLIC_DATA_URL: dataUrl } } : {}),
  // Pyodide necesita estas cabeceras solo si se usa SharedArrayBuffer / hilos.
  // En export estático no hay servidor, así que se configuran en vercel.json.
};

export default nextConfig;
