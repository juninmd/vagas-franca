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
 * A paginação é client-side (`?pagina=2` devolve a mesma lista), então é só
 * a primeira página — ~20 vagas, sempre as mais recentes.
 */
const LISTA = "https://www.empregos.com.br/vagas/franca-sp";

const pega = (card: string, re: RegExp): string | null => {
  const m = card.match(re);
  return m?.[1] ? limpa(m[1]) : null;
};

export async function syncEmpregos(today: string): Promise<void> {
  const html = await fetchHtml(LISTA);
  const cards = html.split(/<div id="job-card"/).slice(1);

  const vagas = cards.flatMap((card) => {
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

  logFonte("empregos.com.br", salvaVagas(vagas, today));
}
