import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calculadora de industria — EVE Online",
  description:
    "Coste real de producción y margen make-or-buy, con el coste de instalación acumulado en cada nivel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
