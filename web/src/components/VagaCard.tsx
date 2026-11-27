import { Badge } from "@juninmd/sonido";
import { rotuloIdade, rotuloPrazo } from "../lib/formata.ts";
import type { Vaga } from "../types.ts";

interface Props {
  vaga: Vaga;
  onAbrir: (id: string) => void;
  /** Cartões abaixo da primeira tela só são desenhados perto de aparecer. */
  adiado: boolean;
}

export function VagaCard({ vaga, onAbrir, adiado }: Props) {
  const idade = rotuloIdade(vaga.publicadaEm ?? vaga.vistaEm);
  const prazo = rotuloPrazo(vaga.prazo);

  return (
    <article
      className={`relative flex flex-1 flex-col gap-3 rounded-lg border border-borda bg-superficie p-4 transition-colors hover:border-marca has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca ${
        adiado ? "cartao-adiado" : ""
      }`}
    >
      <header>
        <h3 className="text-base font-semibold leading-snug">
          {/* O botão cobre o cartão inteiro (after:inset-0): clicar em qualquer ponto abre o detalhe. */}
          <button
            type="button"
            onClick={() => onAbrir(vaga.id)}
            className="text-left outline-none after:absolute after:inset-0 after:content-['']"
          >
            {vaga.titulo}
          </button>
        </h3>
        {vaga.empresa && (
          <p className="mt-0.5 text-sm text-texto-2">{vaga.empresa}</p>
        )}
      </header>

      {vaga.salario ? (
        <p className="text-xl font-semibold tabular-nums text-marca">
          {vaga.salario}
        </p>
      ) : (
        <p className="text-sm text-texto-2">Salário não informado</p>
      )}

      <ul className="flex flex-wrap gap-1.5">
        {vaga.contrato && (
          <li>
            <Badge tone="neutral">{vaga.contrato}</Badge>
          </li>
        )}
        {vaga.modalidade && (
          <li>
            <Badge tone="neutral">{vaga.modalidade}</Badge>
          </li>
        )}
        {vaga.pcd && (
          <li>
            <Badge tone="accent">♿ PcD</Badge>
          </li>
        )}
        {vaga.area && (
          <li>
            <Badge tone="neutral">{vaga.area}</Badge>
          </li>
        )}
      </ul>

      {vaga.requisitos && (
        <p className="line-clamp-2 text-sm text-texto-2">
          <span className="font-medium text-texto">Requisitos: </span>
          {vaga.requisitos}
        </p>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-texto-2">
        <span>
          {vaga.fonte}
          {idade ? ` · ${idade}` : ""}
        </span>
        {prazo && (
          <Badge tone={prazo.urgente ? "warning" : "neutral"}>
            {prazo.texto}
          </Badge>
        )}
      </footer>
    </article>
  );
}
