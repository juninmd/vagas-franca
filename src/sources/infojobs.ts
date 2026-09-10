import { env } from "../config/env.ts";
import {
  fetchHtml,
  limpa,
  logFonte,
  normalizaSalario,
  salvaVagas,
} from "./comum.ts";

/**
 * InfoJobs mistura vagas de outras cidades na busca de Franca (patrocinadas);
 * a cidade sai do próprio card e o filtro de região em `salvaVagas` corta o
 * resto. Os campos ficam ao lado de ícones SVG — a âncora do parse é o
 * `xlink:href="#icone"`, que é estável, não a classe do CSS.
 */
const BASE = "https://www.infojobs.com.br";
const LISTA = `${BASE}/empregos-em-franca,-sp.aspx`;

const pega = (card: string, re: RegExp): string | null => {
  const m = card.match(re);
  return m?.[1] ? limpa(m[1]) : null;
};

/** Texto que vem logo depois do ícone (salário, escolaridade, modalidade). */
const porIcone = (card: string, icone: string) =>
  pega(card, new RegExp(`#${icone}" />\\s*</svg>([^<]+)<`));

function parsePagina(html: string) {
  return html
    .split(/<div id="vacancy/)
    .slice(1)
    .flatMap((card) => {
      const title = pega(card, /js_vacancyTitle">([\s\S]*?)<\/h2>/);
      const path = card.match(/data-href="([^"]+)"/)?.[1];
      if (!title || !path) return [];
      return [
        {
          title,
          company: pega(
            card,
            /<a class="text-body text-decoration-none" href="[^"]+">([\s\S]*?)<span/,
          ),
          salary: normalizaSalario(porIcone(card, "money")),
          schedule: null,
          contract: null,
          workplace: porIcone(card, "buildings"),
          city:
            pega(card, /<div class="mb-8">\s*([^<]+?)\s*(?:<|$)/)?.replace(
              /\s*-\s*SP$/i,
              "",
            ) ?? null,
          link: path.startsWith("http") ? path : `${BASE}${path}`,
          source: "InfoJobs",
          description:
            pega(card, /<div class="text-medium">([\s\S]*?)<\/div>/)?.slice(
              0,
              1500,
            ) ?? null,
          published: pega(card, /class="js_date" data-value="([^"]+)"/),
        },
      ];
    });
}

export async function syncInfoJobs(today: string): Promise<void> {
  const vagas = [];
  const vistos = new Set<string>();
  for (let pagina = 1; pagina <= env.pagesPerBoard; pagina++) {
    const url = pagina === 1 ? LISTA : `${LISTA}?page=${pagina}`;
    const lote = parsePagina(await fetchHtml(url));
    const novos = lote.filter((v) => !vistos.has(v.link));
    // Página que repete a anterior significa que a paginação foi ignorada.
    if (!novos.length) break;
    for (const v of novos) vistos.add(v.link);
    vagas.push(...novos);
  }
  logFonte("infojobs", salvaVagas(vagas, today));
}
