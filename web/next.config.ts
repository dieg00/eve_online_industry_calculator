import type { NextConfig } from "next";

// Export estático: todo el cómputo vive en el cliente (Pyodide), sin backend.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Pyodide necesita estas cabeceras solo si se usa SharedArrayBuffer / hilos.
  // En export estático no hay servidor, así que se configuran en vercel.json.
};

export default nextConfig;
