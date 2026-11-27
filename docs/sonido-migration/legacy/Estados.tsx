interface PropsErro {
  mensagem: string;
  onTentar: () => void;
}

export function ErroCarga({ mensagem, onTentar }: PropsErro) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-borda bg-superficie p-6 text-center"
    >
      <h2 className="text-lg font-semibold">Não consegui carregar as vagas</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-texto-2">
        {mensagem}. Confira se o servidor está de pé (
        <code className="rounded bg-superficie-2 px-1">bun run web</code>) e
        tente de novo.
      </p>
      <button
        type="button"
        onClick={onTentar}
        className="mt-4 rounded-md bg-marca-fundo px-4 py-2 text-sm font-semibold text-sobre-marca hover:opacity-90"
      >
        Tentar de novo
      </button>
    </div>
  );
}

export function SemDados() {
  return (
    <div className="rounded-lg border border-borda bg-superficie p-6 text-center">
      <h2 className="text-lg font-semibold">Ainda não há vagas no banco</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-texto-2">
        Rode a coleta com{" "}
        <code className="rounded bg-superficie-2 px-1">bun run ingest</code> e
        recarregue esta página.
      </p>
    </div>
  );
}

export function SemResultados({ onLimpar }: { onLimpar: () => void }) {
  return (
    <div className="rounded-lg border border-borda bg-superficie p-6 text-center">
      <h2 className="text-lg font-semibold">Nenhuma vaga com esses filtros</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-texto-2">
        Tente outra palavra, tire algum filtro ou baixe o salário mínimo.
      </p>
      <button
        type="button"
        onClick={onLimpar}
        className="mt-4 rounded-md border border-borda px-4 py-2 text-sm font-semibold hover:bg-superficie-2"
      >
        Limpar filtros
      </button>
    </div>
  );
}

/** Mesmo molde do cartão final, para a página não pular quando os dados chegam. */
export function Esqueleto({ quantos = 6 }: { quantos?: number }) {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4"
      aria-hidden="true"
    >
      {Array.from({ length: quantos }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa e sem estado
          key={i}
          className="h-52 rounded-lg border border-borda bg-superficie p-4 motion-safe:animate-pulse"
        >
          <div className="h-4 w-3/4 rounded bg-superficie-2" />
          <div className="mt-2 h-3 w-1/2 rounded bg-superficie-2" />
          <div className="mt-6 h-6 w-1/3 rounded bg-superficie-2" />
          <div className="mt-6 h-3 w-full rounded bg-superficie-2" />
          <div className="mt-2 h-3 w-5/6 rounded bg-superficie-2" />
        </div>
      ))}
    </div>
  );
}
