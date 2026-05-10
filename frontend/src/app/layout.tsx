import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Bolao da Copa",
  description: "MVP para criar e participar de boloes de futebol.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <main>
          <nav style={{ display: "flex", justifyContent: "space-between", marginBottom: 32 }}>
            <Link href="/" style={{ fontWeight: 800 }}>
              Bolao da Copa
            </Link>
            <Link className="button secondary" href="/pools/new">
              Criar bolao
            </Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
