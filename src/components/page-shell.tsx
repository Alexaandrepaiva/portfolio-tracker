import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="max-w-2xl text-sm text-slate-600 sm:text-base">{description}</p>
      </header>
      {children}
    </main>
  );
}
