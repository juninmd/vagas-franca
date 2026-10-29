import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { env } from "./config/env.ts";
import { REGION_CITIES } from "./config/region.ts";
import { topic } from "./config/topic.ts";
import { insertItem } from "./db.ts";
import { syncAcif } from "./sources/acif.ts";
import { syncEmpregoFranca } from "./sources/empregofranca.ts";
import { syncEmpregos } from "./sources/empregos.ts";
import { syncGupy, syncGupyRegiao } from "./sources/gupy.ts";
import { syncInfoJobs } from "./sources/infojobs.ts";
import { syncTrabalhaBrasil } from "./sources/trabalhabrasil.ts";

const parser = new Parser({ timeout: env.feedTimeoutMs });

const hash = (s: string) => createHash("sha1").update(s).digest("hex");
const clean = (s?: string) =>
  (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

/**
 * Feed local (Jornal da Franca) publica a cidade inteira — sem este filtro o
 * rodapé de "notícias de emprego" vinha com receita de batata doce e basquete.
 * Os feeds do Google News já vêm por query, mas o filtro não os atrapalha.
 */
const SOBRE_EMPREGO =
  /vaga|emprego|contrata|contrata[çc][ãa]o|admiss[ãa]o|\bPAT\b|feir[ãa]o|mutir[ãa]o|processo seletivo|sele[çc][ãa]o de candidat|est[áa]gio|jovem aprendiz|carteira assinada|\bCLT\b|desemprego|mercado de trabalho|curr[íi]culo|capacita[çc][ãa]o|qualifica[çc][ãa]o profissional/i;

/** A notícia precisa citar Franca ou uma cidade da microrregião. */
const DA_REGIAO = new RegExp(
  REGION_CITIES.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

/** Notícias de emprego (PAT, mutirões, contratações) — vão pro rodapé do post. */
async function ingestNoticias(): Promise<number> {
  let added = 0;
  const now = new Date().toISOString();

  const results = await Promise.allSettled(
    topic.feeds.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      let feedAdded = 0;
      for (const it of (parsed.items ?? []).slice(0, env.maxItemsPerFeed)) {
        const link = it.link ?? "";
        if (!link || !it.title) continue;
        const resumo = clean(it.contentSnippet ?? it.content);
        const texto = `${it.title} ${resumo}`;
        // O Google News devolve mutirão de Curitiba e feirão de Sumaré na
        // busca por Franca; sem checar a cidade o bloco vira notícia de fora.
        if (!SOBRE_EMPREGO.test(texto) || !DA_REGIAO.test(texto)) continue;
        if (
          insertItem({
            id: hash(link),
            title: it.title.trim(),
            link,
            source: feed.name,
            summary: resumo,
            published: it.isoDate ?? it.pubDate ?? null,
            fetched_at: now,
          })
        )
          feedAdded++;
      }
      return feedAdded;
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") added += r.value;
    else console.warn(`  ! feed falhou: ${r.reason}`);
  }
  console.log(`  [notícias] ${added} itens novos`);
  return added;
}

/** Varre todas as fontes de vaga + os feeds de notícia. Fonte que cai não derruba as outras. */
export async function ingest(today: string): Promise<void> {
  const tarefas: [string, Promise<unknown>][] = [
    ["gupy", syncGupy(today)],
    ["trabalhabrasil", syncTrabalhaBrasil(today)],
    ["infojobs", syncInfoJobs(today)],
    ["empregos.com.br", syncEmpregos(today)],
    ["acif", syncAcif(today)],
    ["emprego-franca", syncEmpregoFranca(today)],
    ["gupy-regiao", syncGupyRegiao(today)],
    ["notícias", ingestNoticias()],
  ];
  const results = await Promise.allSettled(tarefas.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === "rejected")
      console.warn(`  ! ${tarefas[i]?.[0]} falhou: ${r.reason}`);
  });
}
