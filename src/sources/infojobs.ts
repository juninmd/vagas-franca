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

/**
 * A paginação `?page=N` do InfoJobs devolve sempre a página 1, então a lista
 * pública só dá 20 vagas. Os filtros da própria página (contrato, categoria,
 * antiguidade, home office…) são links públicos `data-url` e cada um mostra um
 * recorte diferente: a união deles cobre bem mais que a página crua. Os filtros
 * são abertos em série e com pausa, com teto por rodada.
 */
const MAX_FILTROS = 40;
const PAUSA_FILTRO_MS = 700;

export const filtrosDaPagina = (html: string): string[] => [
  ...new Set(
    [...html.matchAll(/data-url="(empregos-[^"]+\.aspx(?:\?[^"]*)?)"/g)].map(
      (m) => m[1] as string,
    ),
  ),
];

export async function syncInfoJobs(today: string): Promise<void> {
  const vagas: ReturnType<typeof parsePagina> = [];
  const vistos = new Set<string>();
  const junta = (html: string) => {
    for (const v of parsePagina(html))
      if (!vistos.has(v.link)) {
        vistos.add(v.link);
        vagas.push(v);
      }
  };

  const primeira = await fetchHtml(LISTA);
  junta(primeira);
  for (const url of filtrosDaPagina(primeira)
    .filter((u) => u !== "empregos-em-franca,-sp.aspx")
    .slice(0, MAX_FILTROS)) {
    try {
      await Bun.sleep(PAUSA_FILTRO_MS);
      junta(await fetchHtml(`${BASE}/${url}`));
    } catch {
      // um filtro que falha não derruba a fonte
    }
  }
  logFonte("infojobs", salvaVagas(vagas, today));
}
