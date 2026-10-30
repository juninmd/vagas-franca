import type { ReactNode } from "react";
import {
  type Contagem,
  contaFiltrosAtivos,
  type Filtros,
} from "../lib/filtros.ts";
import { reais } from "../lib/formata.ts";

export interface Facetas {
  areas: Contagem[];
  contratos: Contagem[];
  modalidades: Contagem[];
  fontes: Contagem[];
}

interface Props {
  filtros: Filtros;
  facetas: Facetas;
  onChange: (f: Filtros) => void;
  onLimpar: () => void;
  /** Prefixo dos `id`s: o mesmo painel existe na lateral e na folha do celular. */
  prefixo: string;
}

const alterna = (lista: string[], valor: string) =>
  lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold">{titulo}</legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
  );
}

function Opcao({
  id,
  rotulo,
  n,
  marcado,
  onChange,
}: {
  id: string;
  rotulo: string;
  n?: number;
  marcado: boolean;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-superficie-2"
    >
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        onChange={onChange}
        className="size-4 shrink-0 accent-marca-fundo"
      />
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      {n !== undefined && (
        <span className="text-xs tabular-nums text-texto-2">{n}</span>
      )}
    </label>
  );
}

export function PainelFiltros({
  filtros,
  facetas,
  onChange,
  onLimpar,
  prefixo,
}: Props) {
  const ativos = contaFiltrosAtivos(filtros);
  const lista = (
    campo: "areas" | "contratos" | "modalidades" | "fontes",
    itens: Contagem[],
  ) =>
    itens.map((c) => (
      <Opcao
        key={c.valor}
        id={`${prefixo}-${campo}-${c.valor}`}
        rotulo={c.valor}
        n={c.n}
        marcado={filtros[campo].includes(c.valor)}
        onChange={() =>
          onChange({ ...filtros, [campo]: alterna(filtros[campo], c.valor) })
        }
      />
    ));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Filtros</h2>
        <button
          type="button"
          onClick={onLimpar}
          disabled={ativos === 0}
          className="rounded-md px-2 py-1 text-sm text-marca underline underline-offset-2 enabled:hover:bg-superficie-2 disabled:text-texto-2 disabled:no-underline"
        >
          Limpar{ativos > 0 ? ` (${ativos})` : ""}
        </button>
      </div>

      <div>
        <label
          htmlFor={`${prefixo}-min`}
          className="mb-2 flex items-baseline justify-between text-sm font-semibold"
        >
          <span>Salário mínimo</span>
          <span className="font-normal tabular-nums text-texto-2">
            {filtros.salarioMin > 0 ? reais(filtros.salarioMin) : "qualquer"}
          </span>
        </label>
        <input
          id={`${prefixo}-min`}
          type="range"
          min={0}
          max={6000}
          step={250}
          value={filtros.salarioMin}
          onChange={(e) =>
            onChange({ ...filtros, salarioMin: Number(e.target.value) })
          }
          className="w-full accent-marca-fundo"
        />
      </div>

      <Grupo titulo="Mostrar só">
        <Opcao
          id={`${prefixo}-so-salario`}
          rotulo="Com salário informado"
          marcado={filtros.soComSalario}
          onChange={() =>
            onChange({ ...filtros, soComSalario: !filtros.soComSalario })
          }
        />
        <Opcao
          id={`${prefixo}-so-req`}
          rotulo="Com requisitos"
          marcado={filtros.soComRequisitos}
          onChange={() =>
            onChange({ ...filtros, soComRequisitos: !filtros.soComRequisitos })
          }
        />
        <Opcao
          id={`${prefixo}-so-pcd`}
          rotulo="Vagas PcD"
          marcado={filtros.soPcd}
          onChange={() => onChange({ ...filtros, soPcd: !filtros.soPcd })}
        />
      </Grupo>

      {facetas.areas.length > 0 && (
        <Grupo titulo="Área">{lista("areas", facetas.areas)}</Grupo>
      )}
      {facetas.contratos.length > 0 && (
        <Grupo titulo="Contrato">{lista("contratos", facetas.contratos)}</Grupo>
      )}
      {facetas.modalidades.length > 0 && (
        <Grupo titulo="Modalidade">
          {lista("modalidades", facetas.modalidades)}
        </Grupo>
      )}
      {facetas.fontes.length > 0 && (
        <Grupo titulo="Fonte">{lista("fontes", facetas.fontes)}</Grupo>
      )}
    </div>
  );
}
