import { norm } from "../config/region.ts";
import { db, type NewJob } from "../db.ts";
import { contatoSeguro, parseSalario } from "../format.ts";
import { fetchHtml, limpa, logFonte, salvaVagas } from "./comum.ts";

type Vaga = Omit<NewJob, "area">;

/**
 * Hard Franca (hardfranca.com.br) — classificado local de empregos. A página
 * `anuncios.php` já traz o texto completo de ~160 anúncios (campos livres:
 * salário e contato vêm dentro do texto). Não há data nem página própria por
 * anúncio, então:
 *  - o id do anúncio (crescente, global do site) serve de relógio: só entram os
 *    mais recentes que `JANELA_IDS` abaixo do maior id da página (~1 mês);
 *  - o link é a âncora `#anuncio-<id>`, estável para o dedupe;
 *  - título já publicado por outra fonte é descartado (o mesmo RH anuncia em
 *    vários portais).
 */
const URL = "https://hardfranca.com.br/anuncios.php";
export const JANELA_IDS = 4500;

export function parseHardFranca(html: string): (Vaga & { id: number })[] {
  const vistos = new Set<number>();
  const out: (Vaga & { id: number })[] = [];
  for (const m of html.matchAll(
    /<div id="anuncio_completo_(?:dest)?(\d+)"[^>]*>\s*<div class="titulo-anuncio">([\s\S]*?)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g,
  )) {
    const id = Number(m[1]);
    if (vistos.has(id)) continue;
    vistos.add(id);
    const title = limpa(m[2] as string);
    const texto = limpa(m[3] as string);
    if (!title || !texto) continue;
    const valor = parseSalario(
      texto.match(/R\$\s?\d[\d.]*(?:,\d{2})?/)?.[0] ?? null,
    );
    out.push({
      id,
      title: title.slice(0, 120),
      company: null,
      salary: valor ? `R$ ${valor.toLocaleString("pt-BR")}` : null,
      schedule: null,
      contract: null,
      workplace: "Presencial",
      city: "Franca",
      link: `${URL}#anuncio-${id}`,
      source: "Hard Franca",
      description: texto.slice(0, 1500),
      published: null,
      contact: contatoSeguro(texto),
    });
  }
  return out;
}

export async function syncHardFranca(today: string): Promise<void> {
  const todas = parseHardFranca(await fetchHtml(URL));
  if (!todas.length)
    throw new Error("hardfranca: nenhum anúncio (layout mudou?)");
  const maior = Math.max(...todas.map((v) => v.id));
  const titulos = new Set(
    db
      .query<{ title: string }, []>(
        "SELECT title FROM jobs WHERE source != 'Hard Franca'",
      )
      .all()
      .map((r) => norm(r.title)),
  );
  const vagas = todas
    .filter((v) => v.id >= maior - JANELA_IDS)
    .filter((v) => !titulos.has(norm(v.title)))
    .map(({ id: _id, ...v }) => v);
  logFonte("hardfranca", salvaVagas(vagas, today));
}
