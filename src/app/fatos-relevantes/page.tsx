import { PageShell } from "@/components/page-shell";

export default function RelevantFactsPage() {
  return (
    <PageShell
      title="Fatos Relevantes"
      description="Feed inicial para documentos relevantes processados por IA e filtrados por ativo."
    >
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Feed placeholder</h2>
        <p className="mt-2 text-sm text-slate-600">
          A listagem usará `RelevantDocument` e `AiSummary`, com filtros por ticker e estado de processamento.
        </p>
      </section>
    </PageShell>
  );
}
