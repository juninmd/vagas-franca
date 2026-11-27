/**
 * Trechos literais de `web/src/App.tsx`, `web/src/components/Estados.tsx` e
 * `web/src/components/VagaGaveta.tsx` em `origin/main`, onde cada botão era um
 * `<button>` com classes Tailwind próprias.
 */
export function AcoesLegacy() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="rounded-md border border-borda bg-superficie px-5 py-2.5 text-sm font-medium hover:bg-superficie-2"
      >
        Mostrar mais 36 de 92 restantes
      </button>
      <button
        type="button"
        className="rounded-md border border-borda px-3 py-1.5 text-sm font-medium hover:bg-superficie-2"
      >
        Fechar
      </button>
      <button
        type="button"
        className="rounded-md px-2 py-1 text-sm text-marca underline underline-offset-2 enabled:hover:bg-superficie-2 disabled:text-texto-2 disabled:no-underline"
      >
        Limpar (3)
      </button>
      <button
        type="button"
        className="rounded-md bg-marca-fundo px-4 py-2.5 text-sm font-semibold text-sobre-marca hover:opacity-90"
      >
        Ver 128 vagas
      </button>
    </div>
  );
}
