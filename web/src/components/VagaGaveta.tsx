import { useEffect, useRef } from "react";
import { dataBr, rotuloIdade, rotuloPrazo } from "../lib/formata.ts";
import type { Vaga } from "../types.ts";

interface Props {
  vaga: Vaga | null;
  onFechar: () => void;
}

/** "rh@x.com · 16 99999-1234" → links mailto/tel; o resto fica como texto. */
function Contato({ texto }: { texto: string }) {
  return (
    <ul className="space-y-1">
      {texto.split(" · ").map((parte) => {
        const href = parte.includes("@")
          ? `mailto:${parte}`
          : `tel:${parte.replace(/[^\d+]/g, "")}`;
        return (
          <li key={parte}>
            <a href={href} className="text-marca underline underline-offset-2">
              {parte}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Fato({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div>
      <dt className="text-xs text-texto-2">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium">{valor}</dd>
    </div>
  );
}

export function VagaGaveta({ vaga, onFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  // Abre/fecha o <dialog> nativo conforme a vaga escolhida. Foco, Esc, fundo
  // inerte e retorno do foco ao cartão ficam por conta do navegador.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (vaga && !d.open) d.showModal();
    if (!vaga && d.open) d.close();
  }, [vaga]);

  // `closedby="any"` fecha ao clicar fora; onde falta (Safari), o mesmo por ponteiro.
  useEffect(() => {
    const d = ref.current;
    if (!d || "closedBy" in HTMLDialogElement.prototype) return;
    const fora = (e: PointerEvent) => {
      const r = d.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };
    let apertouFora = false;
    const baixo = (e: PointerEvent) => {
      apertouFora = fora(e);
    };
    const cima = (e: PointerEvent) => {
      if (apertouFora && fora(e)) d.close();
    };
    d.addEventListener("pointerdown", baixo);
    d.addEventListener("pointerup", cima);
    return () => {
      d.removeEventListener("pointerdown", baixo);
      d.removeEventListener("pointerup", cima);
    };
  }, []);

  const prazo = vaga ? rotuloPrazo(vaga.prazo) : null;

  return (
    <dialog
      ref={ref}
      onClose={onFechar}
      aria-labelledby="gaveta-titulo"
      className="gaveta lateral"
      // React 19 repassa atributos que não conhece; `closedby` ainda não está nos tipos.
      {...({ closedby: "any" } as Record<string, string>)}
    >
      {vaga && (
        <>
          <header className="flex items-start gap-3 border-b border-borda p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h2
                id="gaveta-titulo"
                className="text-lg font-semibold leading-snug"
              >
                {vaga.titulo}
              </h2>
              {vaga.empresa && (
                <p className="mt-0.5 text-sm text-texto-2">{vaga.empresa}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-md border border-borda px-3 py-1.5 text-sm font-medium hover:bg-superficie-2"
            >
              Fechar
            </button>
          </header>

          <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-5">
            <div>
              {vaga.salario ? (
                <p className="text-2xl font-semibold tabular-nums text-marca">
                  {vaga.salario}
                </p>
              ) : (
                <p className="text-sm text-texto-2">
                  Salário não informado pelo anunciante
                </p>
              )}
              {prazo && (
                <p
                  className={`mt-2 text-sm font-medium ${prazo.urgente ? "text-aviso" : "text-texto-2"}`}
                >
                  {prazo.texto}
                  {vaga.prazo ? ` (${dataBr(vaga.prazo)})` : ""}
                </p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fato rotulo="Contrato" valor={vaga.contrato} />
              <Fato rotulo="Modalidade" valor={vaga.modalidade} />
              <Fato rotulo="Jornada" valor={vaga.jornada} />
              <Fato rotulo="Cidade" valor={vaga.cidade} />
              <Fato rotulo="Área" valor={vaga.area} />
              <Fato rotulo="Fonte" valor={vaga.fonte} />
              <Fato
                rotulo="Publicada"
                valor={
                  dataBr(vaga.publicadaEm) &&
                  `${dataBr(vaga.publicadaEm)} (${rotuloIdade(vaga.publicadaEm)})`
                }
              />
              <Fato rotulo="Vista pelo radar" valor={dataBr(vaga.vistaEm)} />
              {vaga.pcd && <Fato rotulo="Reservada" valor="♿ PcD" />}
            </dl>

            {vaga.requisitos && (
              <section>
                <h3 className="text-sm font-semibold">Requisitos</h3>
                <p className="mt-1 text-sm leading-relaxed text-texto-2">
                  {vaga.requisitos}
                </p>
              </section>
            )}

            {vaga.descricao && (
              <section>
                <h3 className="text-sm font-semibold">Descrição do anúncio</h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-texto-2">
                  {vaga.descricao}
                </p>
              </section>
            )}

            {vaga.contato && (
              <section>
                <h3 className="text-sm font-semibold">Contato da empresa</h3>
                <div className="mt-1 text-sm">
                  <Contato texto={vaga.contato} />
                </div>
              </section>
            )}
          </div>

          <footer className="border-t border-borda p-4 sm:p-5">
            {vaga.link ? (
              <a
                href={vaga.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md bg-marca-fundo px-4 py-2.5 text-center text-sm font-semibold text-sobre-marca hover:opacity-90"
              >
                Ver vaga e se candidatar
                <span className="sr-only"> (abre em outra aba)</span>
              </a>
            ) : (
              <p className="text-center text-sm text-texto-2">
                Esta fonte não tem link próprio para a vaga; use o contato
                acima.
              </p>
            )}
          </footer>
        </>
      )}
    </dialog>
  );
}
