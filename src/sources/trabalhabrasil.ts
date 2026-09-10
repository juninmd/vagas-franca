import { env } from "../config/env.ts";
import { idsComDescricao, type NewJob } from "../db.ts";
import { pool } from "../pool.ts";
import {
  fetchHtml,
  hash,
  limpa,
  logFonte,
  normalizaSalario,
  parseJobPosting,
  salvaVagas,
} from "./comum.ts";

type Vaga = Omit<NewJob, "area">;

/**
 * Detalhe é buscado em série e com pausa: rajada de 45 páginas fez o portal
 * responder captcha e, depois, 403 até na listagem. Poucas por rodada bastam —
 * o cron roda de 6 em 6 horas e o que já foi detalhado não é rebuscado.
 */
const DETAIL_CONCURRENCY = 1;
const DETAIL_DELAY_MS = 1500;

/**
 * TrabalhaBrasil é o portal com mais vaga operacional de Franca (o grosso do
 * mercado local) e o único que publica salário em campo próprio, não no texto.
 * Card estático com classes semânticas — parse direto, sem IA.
 */
const BASE = "https://www.trabalhabrasil.com.br";
const LISTA = `${BASE}/vagas-de-emprego-em-franca-sp`;

const pega = (card: string, re: RegExp): string | null => {
  const m = card.match(re);
  return m?.[1] ? limpa(m[1]) : null;
};

/** "15 Vagas de Auxiliar de Serviços Gerais" → "Auxiliar de Serviços Gerais". */
const tiraPrefixo = (t: string) =>
  t.replace(/^\s*(?:\d+\s+)?vagas?\s+(?:de|para)\s+/i, "").trim();

function parsePagina(html: string): Vaga[] {
  return html
    .split(/<article class="job-card"/)
    .slice(1)
    .flatMap((card) => {
      const title = pega(card, /class="job-title">([\s\S]*?)<\/h2>/);
      const path = card.match(/href="(\/vagas-de-emprego-[^"]+)"/)?.[1];
      if (!title || !path) return [];
      return [
        {
          title: tiraPrefixo(title),
          company: pega(
            card,
            /class="job-company">[\s\S]*?<span>([^<]+)<\/span>/,
          ),
          salary: normalizaSalario(
            pega(card, /class="salary">([^<]+)<\/span>/),
          ),
          schedule: null,
          contract:
            pega(card, /class="employment-type">([^<]+)<\/span>/)?.replace(
              /\s*\+\d+$/,
              "",
            ) ?? null,
          workplace: pega(card, /class="workplace">([^<]+)<\/span>/),
          city:
            pega(card, /class="job-location">[\s\S]*?<span>([^<]+)<\/span>/)
              ?.split("/")[0]
              ?.trim() ?? null,
          link: `${BASE}${path}`,
          source: "TrabalhaBrasil",
          description: null,
          published: null,
        },
      ];
    });
}

/**
 * A página de detalhe traz `JobPosting` em JSON-LD com a descrição inteira — é
 * dela que saem horário e o salário real, via enrich.
 * O `baseSalary` do LD é DESCARTADO de propósito: é faixa estimada de mercado,
 * não o valor anunciado (vaga de estágio com "bolsa R$ 1.000" no texto vinha
 * como "R$ 1.910 a R$ 2.973"). Salário confiável só o do card.
 * Empresa do card ganha da do LD, que costuma vir "Confidencial".
 */
async function detalha(vaga: Vaga): Promise<Vaga> {
  try {
    await Bun.sleep(DETAIL_DELAY_MS);
    const ld = parseJobPosting(await fetchHtml(vaga.link));
    if (!ld) return vaga;
    return {
      ...vaga,
      company: vaga.company ?? ld.company,
      description: ld.description?.slice(0, 1500) ?? vaga.description,
      published: ld.published ?? vaga.published,
    };
  } catch {
    return vaga;
  }
}

export async function syncTrabalhaBrasil(today: string): Promise<void> {
  const vagas: Vaga[] = [];
  for (let pagina = 1; pagina <= env.pagesPerBoard; pagina++) {
    const url = pagina === 1 ? LISTA : `${LISTA}?pagina=${pagina}`;
    const lote = parsePagina(await fetchHtml(url));
    if (!lote.length) break;
    vagas.push(...lote);
  }
  // Só abre detalhe de vaga inédita, e poucas por vez: 45 requisições seguidas
  // fazem o portal devolver página de captcha (sem LD, sem dado).
  const jaTem = idsComDescricao();
  const pendentes = vagas.filter((v) => !jaTem.has(hash(v.link)));
  const alvo = pendentes.slice(0, env.detailPages);
  const detalhadas = await pool(alvo, DETAIL_CONCURRENCY, detalha);
  const resto = vagas.filter((v) => !alvo.includes(v));
  logFonte("trabalhabrasil", salvaVagas([...detalhadas, ...resto], today));
}
