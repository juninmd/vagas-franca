import type { Resumo } from "../lib/filtros.ts";
import { reais } from "../lib/formata.ts";

function Dado({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-lg border border-borda bg-superficie px-3 py-2.5 sm:px-4 sm:py-3">
      <dt className="text-xs text-texto-2">{rotulo}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums sm:mt-1 sm:text-2xl">
        {valor}
      </dd>
      {/* A nota some no celular: o quadro de resumo não pode empurrar as vagas para fora da primeira tela. */}
      {nota && (
        <p className="mt-0.5 hidden text-xs text-texto-2 sm:block">{nota}</p>
      )}
    </div>
  );
}

export function ResumoGeral({ resumo }: { resumo: Resumo }) {
  const pct = resumo.total
    ? Math.round((resumo.comSalario / resumo.total) * 100)
    : 0;
  // "Novas" igual ao total só diz que o banco é de uma coleta só; não vira nota.
  const novas =
    resumo.novasNaSemana > 0 && resumo.novasNaSemana < resumo.total
      ? `${resumo.novasNaSemana.toLocaleString("pt-BR")} novas na semana`
      : undefined;
  return (
    <dl className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <Dado
        rotulo="Vagas abertas"
        valor={resumo.total.toLocaleString("pt-BR")}
        nota={novas}
      />
      <Dado
        rotulo="Com salário informado"
        valor={resumo.comSalario.toLocaleString("pt-BR")}
        nota={`${pct}% das vagas`}
      />
      <Dado
        rotulo="Salário mediano"
        valor={resumo.mediana ? reais(resumo.mediana) : "—"}
        nota={
          resumo.maior
            ? `maior: ${reais(resumo.maior)}`
            : "poucos salários para calcular"
        }
      />
      <Dado
        rotulo="Fontes"
        valor={String(resumo.fontes)}
        nota="portais e murais locais"
      />
    </dl>
  );
}
