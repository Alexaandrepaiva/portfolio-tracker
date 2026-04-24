import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function HomePage() {
  return (
    <PageShell
      title="Home"
      description="Bootstrap inicial da dashboard. Aqui entram cotações, preço teto, margem de segurança, variação diária e gestão de ativos."
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Cotações e snapshot</h2>
          <p className="mt-2 text-sm text-slate-600">
            Estrutura pronta para consumir `MarketSnapshot` e exibir preço e variação diária.
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Preço teto e margem</h2>
          <p className="mt-2 text-sm text-slate-600">
            Estrutura pronta para leitura de `CeilingPrice` por ativo.
          </p>
        </article>
      </section>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
        <p className="text-sm text-slate-700">
          Próximo passo sugerido: implementar os casos de uso da issue #4 e conectar os cards a repositórios em `src/server`.
        </p>
        <p className="mt-3 text-sm text-slate-700">
          Endpoint de sanidade disponível em <code>/api/health</code>.
        </p>
        <Link
          href="/fatos-relevantes"
          className="mt-4 inline-flex text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Ir para Fatos Relevantes
        </Link>
      </div>
    </PageShell>
  );
}
