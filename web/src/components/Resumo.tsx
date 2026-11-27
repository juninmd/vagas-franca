import { StatTile } from "@juninmd/sonido";
import type { Resumo } from "../lib/filtros.ts";
import { reais } from "../lib/formata.ts";

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
    <section
      className="resumo-sonido grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
      aria-label="Resumo das vagas"
    >
      <StatTile
        label="Vagas abertas"
        value={resumo.total.toLocaleString("pt-BR")}
        hint={novas}
        tone="neutral"
      />
      <StatTile
        label="Com salário informado"
        value={resumo.comSalario.toLocaleString("pt-BR")}
        hint={`${pct}% das vagas`}
        tone="neutral"
      />
      <StatTile
        label="Salário mediano"
        value={resumo.mediana ? reais(resumo.mediana) : "—"}
        hint={
          resumo.maior
            ? `maior: ${reais(resumo.maior)}`
            : "poucos salários para calcular"
        }
        tone="neutral"
      />
      <StatTile
        label="Fontes"
        value={String(resumo.fontes)}
        hint="portais e murais locais"
        tone="neutral"
      />
    </section>
  );
}
