import { createHash } from "node:crypto";
import type { NewJob } from "../db.ts";
import {
  contatoSeguro,
  extraiSalarioRotulado,
  inferirContrato,
} from "../format.ts";
import { fetchHtml, limpa, logFonte, salvaVagas } from "./comum.ts";

type Vaga = Omit<NewJob, "area">;

/**
 * Franca Classificados — mural local de anúncios. A seção "Lista de Empregos"
 * vem inteira no HTML (~300 anúncios em texto livre, quase todos "PRECISA-SE
 * DE ..."), sem data nem página própria por anúncio:
 *  - o link é uma âncora `#emprego-<hash do texto>`, estável para o dedupe;
 *  - o título é a profissão tirada do começo do texto;
 *  - salário (só o que vem rotulado "salário") e contato saem por regra;
 *  - anúncio repetido (mesmo texto) conta uma vez; "procuro emprego" não é vaga.
 * Só a seção de empregos é lida: o resto da página é imóvel, veículo etc.
 */
const URL = "https://www.francaclassificados.com/";

const MINUSCULAS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "com",
  "para",
  "a",
  "o",
]);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) =>
      i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(" ");

const PROCURA_TRABALHO =
  /(^|\s)(procuro|busco|estou procurando|ofere[çc]o meus servi)/i;

/** Profissão no começo do anúncio; cai nos primeiros 60 caracteres se não achar. */
export function tituloDe(texto: string): string {
  // "Loterica X / Centro Contrata-se Funcionária ..." — o verbo pode vir depois do local.
  const bruto = texto.replace(/\baux\b\.?/gi, "Auxiliar");
  const gatilho = bruto
    .slice(0, 140)
    .match(
      /(?:precisa-se|contrata-se|contrata(?![a-zà-ú])|procura-se|admite-se)\s*(?:de|para)?\s*/i,
    );
  const base = gatilho
    ? bruto.slice((gatilho.index ?? 0) + gatilho[0].length)
    : bruto;
  const sem = base.replace(
    /^(?:estamos contratando|vaga|oportunidade)\s*(?:de|para)?\s*|^(?:uma?|\d+)\s+(?:vagas?\s+)?(?:de|para)?\s*/i,
    "",
  );
  const corte = sem.split(
    /\s*[–—.,:;(📍🏢💰🎁🍽]|\s-\s|\s(?:para|com|no|na|que|em|sexo|maior|registr\w+)\s/iu,
  )[0] as string;
  const t = (corte.length >= 3 ? corte : sem)
    .replace(/\s+\d+$/, "")
    .trim()
    .slice(0, 60);
  // "Pessoa", "Funcionária" sozinhos não dizem a vaga: junta o complemento
  // ("para trabalhar em granja de suínos" → "Pessoa – Granja de Suínos").
  if (
    /^(?:funcion[áa]ri[oa]s?|pessoas?|profissional|colaborador\w*|candidat\w+)$/i.test(
      t,
    )
  ) {
    const alvo = bruto.match(
      /para\s+(?:trabalhar\s+|atuar\s+)?(?:como|de|em|na|no|nas|nos)\s+([^.,–—(📍\n]{3,40})/iu,
    )?.[1];
    if (alvo) return `${titleCase(t)} – ${titleCase(alvo.trim())}`;
  }
  return titleCase(t || texto.slice(0, 60));
}

export function parseFrancaClassificados(html: string): Vaga[] {
  const ini = html.indexOf('id="empregos"');
  if (ini < 0) return [];
  const fim = html.indexOf('id="concursos"', ini);
  const secao = html.slice(ini, fim < 0 ? undefined : fim);
  const vistos = new Set<string>();
  const out: Vaga[] = [];
  for (const m of secao.matchAll(
    /<p class="vagas[^"]*"[^>]*>([\s\S]*?)<\/p>/g,
  )) {
    const texto = limpa((m[1] as string).replace(/<br\s*\/?>/gi, " "));
    if (texto.length < 15 || PROCURA_TRABALHO.test(texto)) continue;
    const id = createHash("sha1")
      .update(texto.toLowerCase())
      .digest("hex")
      .slice(0, 12);
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push({
      title: tituloDe(texto),
      company: null,
      salary: extraiSalarioRotulado(texto),
      schedule: null,
      contract: inferirContrato(texto),
      workplace: "Presencial",
      city: "Franca",
      link: `${URL}#emprego-${id}`,
      source: "Franca Classificados",
      description: texto.slice(0, 1500),
      published: null,
      contact: contatoSeguro(texto),
    });
  }
  return out;
}

export async function syncFrancaClassificados(today: string): Promise<void> {
  const vagas = parseFrancaClassificados(await fetchHtml(URL));
  if (!vagas.length)
    throw new Error(
      "francaclassificados: nenhum anúncio de emprego (layout mudou?)",
    );
  logFonte("francaclassificados", salvaVagas(vagas, today));
}
