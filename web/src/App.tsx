import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ErroCarga,
  Esqueleto,
  SemDados,
  SemResultados,
} from "./components/Estados.tsx";
import { PainelFiltros } from "./components/Filtros.tsx";
import { ResumoGeral } from "./components/Resumo.tsx";
import { VagaCard } from "./components/VagaCard.tsx";
import { VagaGaveta } from "./components/VagaGaveta.tsx";
import { useAtraso } from "./hooks/useAtraso.ts";
import { useVagas } from "./hooks/useVagas.ts";
import {
  contaFiltrosAtivos,
  contaPor,
  FILTROS_VAZIOS,
  type Filtros,
  filtra,
  filtrosDeUrl,
  filtrosParaUrl,
  ordena,
  resumo,
} from "./lib/filtros.ts";
import { dataBr } from "./lib/formata.ts";
import type { Ordem } from "./types.ts";

/** Cartões por lote e quantos ficam "acima da dobra" (sem render adiado). */
const PASSO = 36;
const ACIMA_DA_DOBRA = 8;

const ROTULO_ORDEM: Record<Ordem, string> = {
  salario: "Maior salário",
  recentes: "Mais recentes",
  az: "A–Z",
};

export function App() {
  const { estado, recarregar } = useVagas();
  const [filtros, setFiltros] = useState<Filtros>(() =>
    filtrosDeUrl(window.location.search),
  );
  const [limite, setLimite] = useState(PASSO);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const folha = useRef<HTMLDialogElement>(null);

  const mudaFiltros = (f: Filtros) => {
    setFiltros(f);
    setLimite(PASSO);
  };
  const limpa = () => mudaFiltros({ ...FILTROS_VAZIOS, ordem: filtros.ordem });

  // O link da página guarda a busca: dá para mandar "caixa, acima de R$ 2.000" no zap.
  useEffect(() => {
    const qs = filtrosParaUrl(filtros);
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }, [filtros]);

  const vagas = useMemo(
    () => (estado.status === "ok" ? estado.dados.vagas : []),
    [estado],
  );

  // A busca por texto é a única que roda a cada tecla; o resto é imediato.
  const buscaAdiada = useDeferredValue(filtros.busca);
  const efetivos = useMemo(
    () => ({ ...filtros, busca: buscaAdiada }),
    [filtros, buscaAdiada],
  );

  const filtradas = useMemo(
    () => ordena(filtra(vagas, efetivos), filtros.ordem),
    [vagas, efetivos, filtros.ordem],
  );

  // Contagem de cada grupo ignora a seleção do próprio grupo, senão marcar uma
  // área zeraria as outras e não daria para somar escolhas.
  const facetas = useMemo(
    () => ({
      areas: contaPor(filtra(vagas, { ...efetivos, areas: [] }), "area"),
      contratos: contaPor(
        filtra(vagas, { ...efetivos, contratos: [] }),
        "contrato",
      ),
      modalidades: contaPor(
        filtra(vagas, { ...efetivos, modalidades: [] }),
        "modalidade",
      ),
      fontes: contaPor(filtra(vagas, { ...efetivos, fontes: [] }), "fonte"),
    }),
    [vagas, efetivos],
  );

  const resumoGeral = useMemo(() => resumo(vagas), [vagas]);
  const aberta = useMemo(
    () => vagas.find((v) => v.id === abertaId) ?? null,
    [vagas, abertaId],
  );
  const mostrando = filtradas.slice(0, limite);
  const ativos = contaFiltrosAtivos(filtros);
  const mostraEsqueleto = useAtraso(estado.status === "carregando");

  const painel = (prefixo: string) => (
    <PainelFiltros
      filtros={filtros}
      facetas={facetas}
      onChange={mudaFiltros}
      onLimpar={limpa}
      prefixo={prefixo}
    />
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#vagas"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-md focus:bg-superficie focus:px-3 focus:py-2"
      >
        Pular para as vagas
      </a>

      <header className="border-b border-borda bg-superficie">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <img
            src="/icon.svg"
            alt=""
            width={36}
            height={36}
            className="rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight">
              Vagas em Franca-SP
            </h1>
            <p className="text-sm text-texto-2">
              Radar diário de empregos da cidade
            </p>
          </div>
          {estado.status === "ok" && estado.dados.atualizadoEm && (
            <p className="hidden text-right text-sm text-texto-2 sm:block">
              Última coleta
              <br />
              <span className="font-medium text-texto">
                {dataBr(estado.dados.atualizadoEm)}
              </span>
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
        {estado.status === "ok" && estado.dados.total > 0 && (
          <ResumoGeral resumo={resumoGeral} />
        )}

        {estado.status === "erro" && (
          <div className="mt-6">
            <ErroCarga mensagem={estado.mensagem} onTentar={recarregar} />
          </div>
        )}

        {estado.status === "carregando" && (
          <div className="mt-6 min-h-96">
            {mostraEsqueleto && <Esqueleto />}
          </div>
        )}

        {estado.status === "ok" && estado.dados.total === 0 && (
          <div className="mt-6">
            <SemDados />
          </div>
        )}

        {estado.status === "ok" && estado.dados.total > 0 && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr]">
            <aside className="hidden lg:block">
              <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-borda bg-superficie p-4">
                {painel("lateral")}
              </div>
            </aside>

            <section
              id="vagas"
              aria-labelledby="titulo-vagas"
              className="min-w-0"
            >
              <h2 id="titulo-vagas" className="sr-only">
                Vagas
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 basis-64">
                  <label htmlFor="busca" className="sr-only">
                    Buscar por cargo, empresa ou palavra
                  </label>
                  <input
                    id="busca"
                    type="search"
                    value={filtros.busca}
                    onChange={(e) =>
                      mudaFiltros({ ...filtros, busca: e.target.value })
                    }
                    placeholder="Buscar cargo, empresa ou palavra"
                    className="w-full rounded-md border border-borda bg-superficie px-3 py-2 text-sm placeholder:text-texto-2"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="ordem" className="text-sm text-texto-2">
                    Ordenar
                  </label>
                  <select
                    id="ordem"
                    value={filtros.ordem}
                    onChange={(e) =>
                      mudaFiltros({
                        ...filtros,
                        ordem: e.target.value as Ordem,
                      })
                    }
                    className="rounded-md border border-borda bg-superficie px-2 py-2 text-sm"
                  >
                    {(Object.keys(ROTULO_ORDEM) as Ordem[]).map((o) => (
                      <option key={o} value={o}>
                        {ROTULO_ORDEM[o]}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => folha.current?.showModal()}
                  className="rounded-md border border-borda bg-superficie px-3 py-2 text-sm font-medium hover:bg-superficie-2 lg:hidden"
                >
                  Filtros{ativos > 0 ? ` (${ativos})` : ""}
                </button>
              </div>

              <p aria-live="polite" className="mt-3 text-sm text-texto-2">
                {filtradas.length === vagas.length
                  ? `${filtradas.length.toLocaleString("pt-BR")} vagas`
                  : `${filtradas.length.toLocaleString("pt-BR")} de ${vagas.length.toLocaleString("pt-BR")} vagas`}
              </p>

              {filtradas.length === 0 ? (
                <div className="mt-4">
                  <SemResultados onLimpar={limpa} />
                </div>
              ) : (
                <>
                  <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4">
                    {mostrando.map((v, i) => (
                      <li key={v.id} className="flex">
                        <VagaCard
                          vaga={v}
                          onAbrir={setAbertaId}
                          adiado={i >= ACIMA_DA_DOBRA}
                        />
                      </li>
                    ))}
                  </ul>
                  {mostrando.length < filtradas.length && (
                    <div className="mt-6 text-center">
                      <button
                        type="button"
                        onClick={() => setLimite((l) => l + PASSO)}
                        className="rounded-md border border-borda bg-superficie px-5 py-2.5 text-sm font-medium hover:bg-superficie-2"
                      >
                        Mostrar mais{" "}
                        {Math.min(PASSO, filtradas.length - mostrando.length)}{" "}
                        de{" "}
                        {(filtradas.length - mostrando.length).toLocaleString(
                          "pt-BR",
                        )}{" "}
                        restantes
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>

      <VagaGaveta vaga={aberta} onFechar={() => setAbertaId(null)} />

      {/* Folha de filtros do celular: o mesmo painel da lateral, em <dialog> nativo. */}
      <dialog
        ref={folha}
        aria-labelledby="folha-titulo"
        className="gaveta"
        {...({ closedby: "any" } as Record<string, string>)}
      >
        <h2 id="folha-titulo" className="sr-only">
          Filtros
        </h2>
        <div className="flex-1 overflow-y-auto p-4">{painel("folha")}</div>
        <div className="border-t border-borda p-4">
          <button
            type="button"
            onClick={() => folha.current?.close()}
            className="w-full rounded-md bg-marca-fundo px-4 py-2.5 text-sm font-semibold text-sobre-marca hover:opacity-90"
          >
            Ver {filtradas.length.toLocaleString("pt-BR")} vagas
          </button>
        </div>
      </dialog>
    </div>
  );
}
