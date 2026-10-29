import { env } from "../config/env.ts";
import {
  fetchHtml,
  limpa,
  logFonte,
  normalizaSalario,
  salvaVagas,
} from "./comum.ts";

/**
 * empregos.com.br renderiza os cards no servidor (Nuxt SSR) — dá pra ler sem
 * navegador. É a fonte mais rica em salário e horário: os anunciantes colam a
 * descrição inteira ("SALÁRIO R$ 1.900 ... HORÁRIO: SEGUNDA A SEXTA 07:00").
 * A paginação é por caminho (`/vagas/franca-sp/2`, 20 vagas por página, sem
 * repetição); o query `?pagina=2` é ignorado e devolve a primeira página.
 */
const LISTA = "https://www.empregos.com.br/vagas/franca-sp";

const pega = (card: string, re: RegExp): string | null => {
  const m = card.match(re);
  return m?.[1] ? limpa(m[1]) : null;
};

function parsePagina(html: string) {
  const cards = html.split(/<div id="job-card"/).slice(1);
  return cards.flatMap((card) => {
    const title =
      pega(
        card,
        /<h2 class="max-w-96 break-words"><span[^>]*>([^<]+)<\/span>/,
      ) ?? pega(card, /aria-label="Abrir detalhes da vaga ([^"]+)"/);
    const path = card.match(/href="(\/vaga\/\d+\/[^"]+)"/)?.[1];
    if (!title || !path) return [];

    // Horário quase nunca vem em campo próprio aqui — sai da descrição no enrich.
    return [
      {
        title,
        company: pega(card, /alt="Logo da empresa ([^"]+)"/),
        salary: normalizaSalario(
          pega(card, /alt="Ícone de salário"[^>]*><h3>([^<]+)<\/h3>/),
        ),
        schedule: null,
        contract: null,
        workplace: pega(
          card,
          /alt="Ícone de pessoa"[^>]*><span>([^<]+)<\/span>/,
        ),
        city: pega(card, /<h3 title="([^"]+)"/),
        link: `https://www.empregos.com.br${path}`,
        source: "empregos.com.br",
        description:
          pega(card, /line-clamp-3">([^<]+)</)?.slice(0, 1500) ?? null,
        published: null,
      },
    ];
  });
}

export async function syncEmpregos(today: string): Promise<void> {
  const vagas: ReturnType<typeof parsePagina> = [];
  const vistos = new Set<string>();
  for (let pagina = 1; pagina <= env.pagesPerBoard; pagina++) {
    const lote = parsePagina(
      await fetchHtml(pagina === 1 ? LISTA : `${LISTA}/${pagina}`),
    );
    const novos = lote.filter((v) => !vistos.has(v.link));
    // Página que só repete a anterior significa que a paginação acabou.
    if (!novos.length) break;
    for (const v of novos) vistos.add(v.link);
    vagas.push(...novos);
  }
  logFonte("empregos.com.br", salvaVagas(vagas, today));
}
