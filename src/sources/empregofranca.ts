import type { NewJob } from "../db.ts";
import { fetchHtml, limpa, logFonte, salvaVagas } from "./comum.ts";

/**
 * Emprego Franca (empregofranca.com.br) — portal só da cidade, em que a empresa
 * publica o salário em campo próprio (valor exato ou faixa) e a jornada em
 * texto. É a fonte com mais salário estruturado do radar.
 *
 * O site é Next.js e entrega as 20 primeiras vagas já no HTML, dentro do
 * payload RSC (`self.__next_f.push`), no componente `initialJobs`. Lemos só a
 * página pública `/vagas`, uma requisição por rodada; o resto da lista o
 * navegador busca depois e não é consumido aqui.
 */
const BASE = "https://empregofranca.com.br";
const IBGE_FRANCA = "3516200";

interface VagaEF {
  title: string;
  slug: string;
  status: string;
  description?: string | null;
  requirements?: string | null;
  employmentType?: string | null;
  workModel?: string | null;
  shift?: string | null;
  salaryMode?: string | null;
  salaryExactCents?: number | null;
  salaryMinCents?: number | null;
  salaryMaxCents?: number | null;
  benefits?: string[] | null;
  cityIbgeCode?: string | null;
  confidential?: boolean;
  destinationEmail?: string | null;
  destinationWhatsapp?: string | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  organization?: { tradeName?: string; slug?: string } | null;
}

const CONTRATO: Record<string, string> = {
  CLT: "CLT",
  PJ: "PJ",
  INTERNSHIP: "Estágio",
  TEMPORARY: "Temporário",
  APPRENTICE: "Jovem Aprendiz",
  FREELANCER: "Freelancer",
};

const MODALIDADE: Record<string, string> = {
  ONSITE: "Presencial",
  REMOTE: "Home office",
  HYBRID: "Híbrido",
};

const reais = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

/** Salário do campo estruturado; "a combinar" e valor zerado viram null. */
export function salarioEF(v: VagaEF): string | null {
  if (v.salaryMode === "EXACT" && v.salaryExactCents)
    return reais(v.salaryExactCents);
  if (v.salaryMode === "RANGE" && v.salaryMinCents && v.salaryMaxCents)
    return `${reais(v.salaryMinCents)} a ${reais(v.salaryMaxCents)}`;
  return null;
}

/** "16994371285" → "(16) 99437-1285"; o que não tiver 10/11 dígitos fica de fora. */
export function foneEF(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 11)
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return null;
}

/** Lê o array `initialJobs` do payload RSC; devolve [] se o site mudar de forma. */
export function extraiVagasEF(html: string): VagaEF[] {
  let payload = "";
  for (const m of html.matchAll(
    /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g,
  )) {
    try {
      payload += JSON.parse(m[1] as string) as string;
    } catch {
      // chunk truncado: segue com o resto
    }
  }
  const ini = payload.indexOf('"initialJobs":[');
  if (ini < 0) return [];
  const resto = payload.slice(ini + '"initialJobs":'.length);
  // Varre os colchetes respeitando string — o array vem no meio de outro JSON.
  let nivel = 0;
  let emString = false;
  let fim = -1;
  for (let i = 0; i < resto.length; i++) {
    const c = resto[i];
    if (emString) {
      if (c === "\\") i++;
      else if (c === '"') emString = false;
    } else if (c === '"') emString = true;
    else if (c === "[") nivel++;
    else if (c === "]" && --nivel === 0) {
      fim = i + 1;
      break;
    }
  }
  if (fim < 0) return [];
  try {
    return JSON.parse(resto.slice(0, fim)) as VagaEF[];
  } catch {
    return [];
  }
}

export function mapeiaVagasEF(
  vagas: VagaEF[],
  today: string,
): Omit<NewJob, "area">[] {
  const out: Omit<NewJob, "area">[] = [];
  for (const v of vagas) {
    if (v.status !== "PUBLISHED" || !v.title || !v.slug) continue;
    if (v.cityIbgeCode && v.cityIbgeCode !== IBGE_FRANCA) continue;
    const fim = v.expiresAt?.slice(0, 10) ?? null;
    if (fim && fim < today) continue;
    const org = v.organization?.slug;
    const beneficios = v.benefits?.length
      ? `Benefícios: ${v.benefits.join(", ")}.`
      : "";
    out.push({
      title: limpa(v.title),
      company: v.confidential
        ? null
        : limpa(v.organization?.tradeName ?? "") || null,
      salary: salarioEF(v),
      schedule: v.shift ? limpa(v.shift) : null,
      contract: CONTRATO[v.employmentType ?? ""] ?? null,
      workplace: MODALIDADE[v.workModel ?? ""] ?? null,
      city: "Franca",
      link: org ? `${BASE}/vaga/${org}/${v.slug}` : `${BASE}/vagas#${v.slug}`,
      source: "Emprego Franca",
      description:
        limpa(
          [
            v.description,
            v.requirements && `Requisitos: ${v.requirements}.`,
            beneficios,
          ]
            .filter(Boolean)
            .join(" "),
        ).slice(0, 1500) || null,
      published: v.publishedAt ?? null,
      contact:
        [v.destinationEmail, foneEF(v.destinationWhatsapp)]
          .filter(Boolean)
          .join(" · ") || null,
      deadline: fim,
    });
  }
  return out;
}

export async function syncEmpregoFranca(today: string): Promise<void> {
  const html = await fetchHtml(`${BASE}/vagas`);
  const vagas = extraiVagasEF(html);
  if (!vagas.length)
    throw new Error(
      "empregofranca: initialJobs não encontrado (layout mudou?)",
    );
  logFonte("emprego-franca", salvaVagas(mapeiaVagasEF(vagas, today), today));
}
