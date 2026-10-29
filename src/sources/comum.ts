import { createHash } from "node:crypto";
import { classify } from "../config/areas.ts";
import { env } from "../config/env.ts";
import { inRegion, norm } from "../config/region.ts";
import { type NewJob, upsertJob, vagasComEmpresa } from "../db.ts";
import {
  ehCadastroDeCurriculo,
  ehPcd,
  extraiSalarioRotulado,
  inferirContrato,
  limpaTitulo,
} from "../format.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const hash = (s: string) => createHash("sha1").update(s).digest("hex");

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "pt-BR,pt;q=0.9",
    },
    signal: AbortSignal.timeout(env.feedTimeoutMs * 2),
  });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

/**
 * Busca crua com cara de XHR — endpoints internos de SPA (o mural da ACIF)
 * respondem 404 sem `x-requested-with`/`referer`.
 */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "application/json, text/javascript, */*",
      "x-requested-with": "XMLHttpRequest",
      referer: new URL(url).origin,
    },
    signal: AbortSignal.timeout(env.feedTimeoutMs * 2),
  });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return res.text();
}

/** Tira tags/entidades e colapsa espaço — o texto dos portais vem cheio de SVG. */
export const limpa = (s: string) =>
  s
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();

interface JobPosting {
  description?: string;
  datePosted?: string;
  hiringOrganization?: { name?: string };
}

/**
 * Muitos portais publicam a vaga em JSON-LD `JobPosting` — descrição inteira,
 * empresa e data. Bem mais estável que raspar o HTML da página de detalhe.
 * O `baseSalary` NÃO é lido: nos portais brasileiros ele costuma ser faixa
 * estimada de mercado, não o valor que a vaga oferece.
 */
export function parseJobPosting(html: string): {
  description: string | null;
  company: string | null;
  published: string | null;
} | null {
  for (const m of html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    if (!m[1]?.includes("JobPosting")) continue;
    let data: JobPosting;
    try {
      data = JSON.parse(m[1]) as JobPosting;
    } catch {
      continue;
    }
    return {
      description: data.description ? limpa(data.description) : null,
      company: data.hiringOrganization?.name
        ? limpa(data.hiringOrganization.name)
        : null,
      published: data.datePosted ?? null,
    };
  }
  return null;
}

/** "À combinar", "A combinar", "Salário não informado" não são valor — viram null. */
export function normalizaSalario(raw: string | null): string | null {
  if (!raw) return null;
  const s = limpa(raw);
  if (!s || /combinar|n[ãa]o informad|a definir|sigiloso/i.test(s)) return null;
  return s.replace(/^sal[áa]rio:?\s*/i, "").slice(0, 80);
}

/** Cada portal escreve a cidade do seu jeito: "Franca, SP", "Franca/SP", "Franca - SP". */
export const normalizaCidade = (city: string | null): string | null => {
  if (!city) return null;
  const c = limpa(city).replace(/\s*[,/-]\s*(sp|s[ãa]o paulo)\s*$/i, "");
  return c || null;
};

/** Campo em branco vindo do HTML é ausência de dado, não string vazia. */
const vazioNull = (s: string | null): string | null => (s?.trim() ? s : null);

/**
 * Grava a lista de vagas de uma fonte: limpa o ruído de portal do título,
 * descarta o que não é da região nem é vaga de verdade, deriva a área e
 * deduplica pelo link. Devolve quantas eram inéditas.
 *
 * Mesmo anunciante em dois portais (empresa + cargo iguais, fontes diferentes)
 * vale uma vaga só: a primeira fonte que gravou fica, as outras contam em
 * `duplicadas`. Dentro da mesma fonte nada é cortado — a Gupy publica uma vaga
 * por loja com o mesmo título e a mesma empresa.
 */
export function salvaVagas(
  vagas: Omit<NewJob, "area">[],
  today: string,
): { novas: number; total: number; duplicadas: number } {
  let novas = 0;
  let total = 0;
  let duplicadas = 0;
  const chave = (empresa: string, titulo: string) =>
    `${norm(empresa)}|${norm(titulo)}`;
  const conhecidas = new Set<string>();
  const fontesPorChave = new Map<string, Set<string>>();
  for (const r of vagasComEmpresa()) {
    conhecidas.add(r.id);
    const k = chave(r.company, r.title);
    fontesPorChave.set(k, (fontesPorChave.get(k) ?? new Set()).add(r.source));
  }
  for (const v of vagas) {
    if (!v.title || !v.link) continue;
    const city = normalizaCidade(v.city);
    if (!inRegion(city)) continue;
    const title = limpaTitulo(v.title);
    // Cadastro de currículo entra como se fosse vaga e empurra vaga real pra
    // fora do teto do digest.
    if (ehCadastroDeCurriculo(title)) continue;
    const { area } = classify(title);
    // Do título CRU: `limpaTitulo` tira o aviso de PcD (vira selo no post) e
    // depois não daria mais pra saber que a vaga é afirmativa.
    const pcd = ehPcd(v.title, v.description) ? 1 : 0;
    total++;
    const job: NewJob = {
      ...v,
      title,
      area,
      pcd,
      city,
      contact: vazioNull(v.contact ?? null),
      company: vazioNull(v.company),
      // Quando a fonte não informa, o texto às vezes diz (salário rotulado, CLT,
      // estágio) — só regra fechada, nunca IA, e a fonte sempre ganha.
      salary: v.salary ?? extraiSalarioRotulado(v.description),
      contract:
        vazioNull(v.contract) ??
        inferirContrato(`${title} ${v.description ?? ""}`),
      workplace: vazioNull(v.workplace),
      description: vazioNull(v.description),
    };
    const id = hash(v.link);
    if (job.company && !conhecidas.has(id)) {
      const fontes = fontesPorChave.get(chave(job.company, title));
      if (fontes && [...fontes].some((f) => f !== v.source)) {
        duplicadas++;
        continue;
      }
    }
    if (upsertJob(job, id, today)) novas++;
    if (job.company) {
      conhecidas.add(id);
      const k = chave(job.company, title);
      fontesPorChave.set(k, (fontesPorChave.get(k) ?? new Set()).add(v.source));
    }
  }
  return { novas, total, duplicadas };
}

/** Log padrão de fonte — o mesmo formato em todas facilita ler o console. */
export function logFonte(
  nome: string,
  r: { novas: number; total: number; duplicadas?: number },
): void {
  const dup = r.duplicadas ? `, ${r.duplicadas} já vistas em outro portal` : "";
  console.log(`  [${nome}] ${r.total} vagas (${r.novas} novas${dup})`);
}
