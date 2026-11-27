import { Button, EmptyState, Skeleton } from "@juninmd/sonido";

interface PropsErro {
  mensagem: string;
  onTentar: () => void;
}

export function ErroCarga({ mensagem, onTentar }: PropsErro) {
  return (
    <div role="alert">
      <EmptyState
        titleAs="h2"
        title="Não consegui carregar as vagas"
        description={
          <>
            {mensagem}. Confira se o servidor está de pé (
            <code className="rounded bg-superficie-2 px-1">bun run web</code>) e
            tente de novo.
          </>
        }
        action={
          <Button variant="primary" onClick={onTentar}>
            Tentar de novo
          </Button>
        }
      />
    </div>
  );
}

export function SemDados() {
  return (
    <EmptyState
      titleAs="h2"
      title="Ainda não há vagas no banco"
      description={
        <>
          Rode a coleta com{" "}
          <code className="rounded bg-superficie-2 px-1">bun run ingest</code> e
          recarregue esta página.
        </>
      }
    />
  );
}

export function SemResultados({ onLimpar }: { onLimpar: () => void }) {
  return (
    <EmptyState
      titleAs="h2"
      title="Nenhuma vaga com esses filtros"
      description="Tente outra palavra, tire algum filtro ou baixe o salário mínimo."
      action={
        <Button variant="secondary" appearance="outline" onClick={onLimpar}>
          Limpar filtros
        </Button>
      }
    />
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
          className="h-52 rounded-lg border border-borda bg-superficie p-4"
        >
          <Skeleton rows={6} label="" />
        </div>
      ))}
    </div>
  );
}
