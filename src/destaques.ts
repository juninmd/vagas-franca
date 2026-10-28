import { cityRank } from "./config/region.ts";
import type { Job } from "./db.ts";
import { parseSalario } from "./format.ts";

/**
 * "Melhores oportunidades": ranking transparente, sem IA. Salário alto sozinho
 * enganava — comissão PJ de R$ 3.000 a 25.000 passava na frente de CLT com
 * benefício. Cada ponto abaixo tem motivo e aparece em `motivos`, então dá pra
 * ler por que a vaga subiu.
 *
 * Só concorre vaga com salário declarado: sem o valor não há como comparar.
 */
const BENEFICIOS =
  /vale[- ]refei|vale[- ]alimenta|\bV[RA]\b|plano (de )?sa[úu]de|plano odonto|conv[êe]nio|cesta b[áa]sica|\bPLR\b|participa[çc][ãa]o nos lucros|seguro de vida|bonifica|b[ôo]nus/gi;

const CLT = /clt|efetivo/i;
const TETO_SALARIO = 8000;

export interface Destaque {
  job: Job;
  valor: number;
  score: number;
  motivos: string[];
}

export function pontua(job: Job): Destaque | null {
  const valor = parseSalario(job.salary);
  if (valor === null) return null;

  let score = (Math.min(valor, TETO_SALARIO) / TETO_SALARIO) * 60;
  const motivos = [`salário ${valor.toLocaleString("pt-BR")}`];

  if (job.contract && CLT.test(job.contract)) {
    score += 15;
    motivos.push("CLT");
  }
  const beneficios = new Set(
    (`${job.description ?? ""}`.match(BENEFICIOS) ?? []).map((b) =>
      b.toLowerCase(),
    ),
  );
  if (beneficios.size) {
    score += Math.min(beneficios.size, 3) * 5;
    motivos.push(`${beneficios.size} benefício(s)`);
  }
  if (job.contact) {
    score += 5;
    motivos.push("contato direto");
  }
  if (job.company && !/confidencial|p[áa]gina de carreira/i.test(job.company)) {
    score += 5;
    motivos.push("empresa identificada");
  }
  if (cityRank(job.city) === 0) score += 5;

  return { job, valor, score: Math.round(score * 10) / 10, motivos };
}

/** Top N por pontuação; empate fecha pelo maior salário. Uma vaga por empresa+cargo. */
export function melhoresOportunidades(jobs: Job[], n = 5): Destaque[] {
  const vistos = new Set<string>();
  return jobs
    .map(pontua)
    .filter((d): d is Destaque => d !== null)
    .sort((a, b) => b.score - a.score || b.valor - a.valor)
    .filter((d) => {
      const k = `${d.job.company ?? ""}|${d.job.title}`.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, n);
}
