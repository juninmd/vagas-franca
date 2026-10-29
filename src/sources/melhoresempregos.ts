import { env } from "../config/env.ts";
import type { NewJob } from "../db.ts";
import { fetchHtml, limpa, logFonte, salvaVagas } from "./comum.ts";

type Vaga = Omit<NewJob, "area">;

/**
 * Melhores Empregos — agregador com cards SSR em microdados `JobPosting`.
 * Lista por data decrescente em `/vagas-em-franca-sp/N/` (20 por página), e a
 * `datePosted` do card é a data real, então a idade da vaga é conhecida sem
 * abrir o detalhe. O `baseSalary` do card é faixa estimada de mercado (igual
 * ao TrabalhaBrasil) e por isso NÃO é lido como salário.
 */
const BASE = "https://www.melhoresempregos.com";
const LISTA = `${BASE}/vagas-em-franca-sp/`;
/** Vaga publicada há mais que isso é considerada encerrada. */
export const IDADE_MAXIMA_DIAS = 30;

const CONTRATO: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  estagio: "Estágio",
  aprendiz: "Jovem Aprendiz",
  temporario: "Temporário",
};
const MODALIDADE: Record<string, string> = {
  presencial: "Presencial",
  "home-office": "Home office",
  remoto: "Home office",
  hibrido: "Híbrido",
};

const diasDesde = (iso: string, hoje: string) =>
  (Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86400000;

export function parsePaginaMelhoresEmpregos(
  html: string,
  hoje: string,
): Vaga[] {
  return html
    .split(/<div class="list-item" itemscope/)
    .slice(1)
    .flatMap((card) => {
      const m = card.match(
        /<h3 class="list-item-title"[^>]*><a [^>]*href="(\/vaga\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/,
      );
      const data = card.match(
        /itemprop="datePosted" datetime="(\d{4}-\d{2}-\d{2})"/,
      )?.[1];
      if (!m || !data || diasDesde(data, hoje) > IDADE_MAXIMA_DIAS) return [];
      const tags = [...card.matchAll(/job-type-([a-z-]+)"/g)].map(
        (t) => t[1] as string,
      );
      const empresa = limpa(
        card.match(/itemprop="name">([\s\S]*?)<\/div>/)?.[1] ?? "",
      );
      return [
        {
          title: limpa(m[2] as string),
          company: empresa && !/confidencial/i.test(empresa) ? empresa : null,
          salary: null,
          schedule: null,
          contract: tags.map((t) => CONTRATO[t]).find(Boolean) ?? null,
          workplace: tags.map((t) => MODALIDADE[t]).find(Boolean) ?? null,
          city:
            limpa(
              card.match(/itemprop="addressLocality">([^<]+)</)?.[1] ?? "",
            ) || null,
          link: `${BASE}${m[1]}`,
          source: "Melhores Empregos",
          description:
            limpa(
              card.match(/itemprop="description" content="([^"]*)"/)?.[1] ?? "",
            ) || null,
          published: data,
        },
      ];
    });
}

export async function syncMelhoresEmpregos(today: string): Promise<void> {
  const vagas: Vaga[] = [];
  const vistos = new Set<string>();
  for (let pagina = 1; pagina <= env.pagesPerBoard; pagina++) {
    const html = await fetchHtml(pagina === 1 ? LISTA : `${LISTA}${pagina}/`);
    const lote = parsePaginaMelhoresEmpregos(html, today);
    const novos = lote.filter((v) => !vistos.has(v.link));
    // Lista é por data: página sem nenhuma vaga recente encerra a varredura.
    if (!novos.length) break;
    for (const v of novos) vistos.add(v.link);
    vagas.push(...novos);
  }
  logFonte("melhoresempregos", salvaVagas(vagas, today));
}
