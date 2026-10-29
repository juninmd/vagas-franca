import { env } from "../config/env.ts";
import { idsComDescricao, type NewJob } from "../db.ts";
import { pool } from "../pool.ts";
import {
  fetchHtml,
  hash,
  limpa,
  logFonte,
  parseJobPosting,
  salvaVagas,
} from "./comum.ts";

type Vaga = Omit<NewJob, "area">;

/**
 * BNE (Banco Nacional de Empregos) — listagem server-side de Franca, 20 vagas
 * por página em `?Page=N`. O card não traz data nem salário: a data sai do
 * `JobPosting` da página de detalhe, aberta só para vaga inédita e em série
 * (mesma cautela do TrabalhaBrasil — rajada derruba a fonte). As páginas
 * misturam vaga de fevereiro com a da semana, então vaga sem data confirmada
 * não entra: ela é detalhada na próxima rodada.
 */
const BASE = "https://www.bne.com.br";
const LISTA = `${BASE}/vagas-de-emprego-em-franca-sp`;
const DETAIL_DELAY_MS = 1000;
/** Vaga publicada há mais que isso é considerada encerrada. */
export const IDADE_MAXIMA_DIAS = 30;

const pega = (card: string, re: RegExp): string | null => {
  const m = card.match(re);
  return m?.[1] ? limpa(m[1]) : null;
};

const MODALIDADE: Record<string, string> = {
  presencial: "Presencial",
  "home office": "Home office",
  híbrido: "Híbrido",
  hibrido: "Híbrido",
};

export function parsePaginaBne(html: string): Vaga[] {
  return html
    .split(/<section[^>]*class="job__card__container/)
    .slice(1)
    .flatMap((card) => {
      const link = card.match(
        /<a class="card__link" href="(https:\/\/www\.bne\.com\.br\/vaga-de-emprego[^"]+)"/,
      )?.[1];
      // Os itens do card são, em ordem: cargo, empresa (opcional), modalidade, cidade.
      const itens = [
        ...card
          .replace(/<svg[\s\S]*?<\/svg>/g, "")
          .matchAll(/<div class="info__vaga-item">([\s\S]*?)<\/div>/g),
      ]
        .map((m) => limpa(m[1] as string))
        .filter(Boolean);
      const cidade = itens.at(-1) ?? null;
      const modalidade = itens.at(-2) ?? null;
      const titulo = itens[0];
      if (!link || !titulo || !cidade || !/\//.test(cidade)) return [];
      return [
        {
          title: titulo,
          company: itens.length >= 4 ? (itens[1] ?? null) : null,
          salary: null,
          schedule: null,
          contract: null,
          workplace: MODALIDADE[(modalidade ?? "").toLowerCase()] ?? null,
          city: cidade.split("/")[0]?.trim() ?? null,
          link,
          source: "BNE",
          description: pega(card, /<p>([\s\S]*?)<\/p>/)?.slice(0, 1500) ?? null,
          published: null,
        },
      ];
    });
}

const diasDesde = (iso: string, hoje: string) =>
  (Date.parse(`${hoje}T12:00:00Z`) -
    Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) /
  86400000;

export async function syncBne(today: string): Promise<void> {
  const vagas: Vaga[] = [];
  const vistos = new Set<string>();
  for (let pagina = 1; pagina <= env.pagesPerBoard; pagina++) {
    const lote = parsePaginaBne(
      await fetchHtml(pagina === 1 ? LISTA : `${LISTA}?Page=${pagina}`),
    );
    const novos = lote.filter((v) => !vistos.has(v.link));
    if (!novos.length) break;
    for (const v of novos) vistos.add(v.link);
    vagas.push(...novos);
  }

  const jaTem = idsComDescricao();
  const conhecidas = vagas.filter((v) => jaTem.has(hash(v.link)));
  const pendentes = vagas
    .filter((v) => !jaTem.has(hash(v.link)))
    .slice(0, env.detailPages * 2);
  const detalhadas = await pool(
    pendentes,
    1,
    async (v): Promise<Vaga | null> => {
      try {
        await Bun.sleep(DETAIL_DELAY_MS);
        const ld = parseJobPosting(await fetchHtml(v.link));
        // Sem data confirmada não dá pra saber se a vaga está aberta.
        if (!ld?.published) return null;
        if (diasDesde(ld.published, today) > IDADE_MAXIMA_DIAS) return null;
        return {
          ...v,
          company: v.company ?? ld.company,
          description: ld.description?.slice(0, 1500) ?? v.description,
          published: ld.published,
        };
      } catch {
        return null;
      }
    },
  );
  logFonte(
    "bne",
    salvaVagas(
      [...conhecidas, ...detalhadas.filter((v): v is Vaga => v !== null)],
      today,
    ),
  );
}
