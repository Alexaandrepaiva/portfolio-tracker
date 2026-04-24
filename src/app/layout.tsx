import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Tracker",
  description: "Base architecture for Brazilian stock and FII portfolio tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">
        <div className="min-h-screen">
          <nav className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-6 px-6 sm:px-10">
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
                Portfolio Tracker
              </span>
              <Link href="/" className="text-sm text-slate-600 transition hover:text-slate-900">
                Home
              </Link>
              <Link
                href="/fatos-relevantes"
                className="text-sm text-slate-600 transition hover:text-slate-900"
              >
                Fatos Relevantes
              </Link>
            </div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
