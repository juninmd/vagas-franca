import { chat } from "./ai.ts";
import { confere, confereBeneficios, confereJornada } from "./confere.ts";
import { env } from "./config/env.ts";
import { applyEnrichment, type Job, markEnriched } from "./db.ts";
import { pool } from "./pool.ts";

const PROMPT = `Você lê descrições de vagas de emprego e extrai SÓ o que está escrito nelas.

Responda APENAS com um array JSON válido (sem markdown, sem comentários). Um objeto por vaga que tiver algo a extrair:
{"item": <número da vaga>, "salary": "R$ 1.900" | null, "schedule": "Seg a Sex, 07:00 às 16:00" | null, "benefits": "VT, VR, cesta básica" | null}

Regras:
- NUNCA invente. Se o valor não estiver escrito no texto da vaga, use null.
- salary: só o valor mensal principal, como está no texto ("R$ 1.900", "R$ 1.500 a R$ 2.000"). Ignore "a combinar", "salário compatível".
- schedule: jornada/horário como está no texto ("Seg a Sex 07h às 17h", "12x36", "44h semanais", "escala 6x1").
- benefits: lista curta separada por vírgula, só benefícios citados.
- Vaga sem nenhum dos três → não inclua no array.
- Se nenhuma vaga tiver dados, responda [].`;

interface Extracted {
  item: number;
  salary?: string | null;
  schedule?: string | null;
  benefits?: string | null;
}

// Lote por chamada: lista longa faz o modelo pular itens.
const BATCH = 10;
const CONCURRENCY = 4;

const chunk = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

function parseJson(raw: string): Extracted[] {
  const text = raw
    .replace(/^```(?:json)?/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("sem array JSON na resposta");
  // O gemma3 às vezes emite \u inválido — neutraliza pra não quebrar o parse.
  const json = text
    .slice(start, end + 1)
    .replace(/\\u(?![0-9a-fA-F]{4})/g, "u");
  return JSON.parse(json) as Extracted[];
}

interface Resultado {
  /** Só o lote que a IA respondeu vira `enriched`. */
  ok: boolean;
  preenchidas: number;
}

async function runBatch(batch: Job[]): Promise<Resultado> {
  const lista = batch
    .map((j, i) => `${i + 1}. ${j.title}\n${j.description ?? ""}`)
    .join("\n\n");

  let dados: Extracted[] = [];
  try {
    const raw = await chat(
      PROMPT,
      `Vagas:\n\n${lista}\n\nExtraia salário, horário e benefícios em JSON.`,
    );
    if (process.env.DEBUG_ENRICH) console.log(`[enrich:raw]\n${raw}`);
    dados = parseJson(raw);
  } catch (err) {
    // Falha isolada: este lote NÃO é marcado como enriquecido e volta amanhã.
    // Marcá-lo apagaria pra sempre o salário de vagas que só a IA extrai.
    console.error(`[enrich] IA/parse falhou (${err})`);
    return { ok: false, preenchidas: 0 };
  }

  let preenchidas = 0;
  for (const d of dados) {
    const job = batch[d.item - 1];
    if (!job) continue;
    const texto = `${job.title} ${job.description ?? ""}`;
    const salary = confere(d.salary, texto);
    const beneficios = confereBeneficios(d.benefits, texto);
    const schedule = confereJornada(d.schedule, texto);
    if (!salary && !schedule && !beneficios) continue;
    // Benefício vai separado do salário: soldado aqui, ele era descartado
    // junto quando o portal já publicava o salário — e a vaga saía `enriched`,
    // então a extração nunca era refeita.
    //
    // Conta só o que mudou de fato: benefício sem salário nenhum pra carregar
    // é descartado no banco, e contá-lo inflava o número do log.
    if (applyEnrichment(job.id, { salary, schedule, benefits: beneficios }))
      preenchidas++;
    else if (beneficios && !salary)
      // O descarte é deliberado, mas não pode ser mudo: a vaga sai `enriched`
      // e a extração não é refeita, então o benefício se perde de vez.
      console.warn(
        `[enrich] benefício descartado (vaga ${job.id} sem salário): ${beneficios}`,
      );
  }
  return { ok: true, preenchidas };
}

/**
 * Preenche salário/jornada usando a descrição + IA. Recebe exatamente as vagas
 * que vão ao ar: enriquecer uma fila diferente da que é postada desperdiçava
 * chamadas e deixava vaga com salário no texto sair como "a combinar".
 */
export async function enrich(candidatas: Job[]): Promise<number> {
  const fila = candidatas
    .filter((j) => !j.enriched && (j.description?.length ?? 0) > 60)
    .slice(0, env.enrichMaxJobs);
  if (!fila.length) {
    console.log("[enrich] nada a enriquecer");
    return 0;
  }
  const lotes = chunk(fila, BATCH);
  const results = await pool(lotes, CONCURRENCY, runBatch);

  // Dentro de um lote que a IA respondeu, vaga sem dado no texto não volta à
  // fila. Lote que falhou fica intocado pra ser tentado na próxima rodada.
  const concluidos = lotes.filter((_, i) => results[i]?.ok);
  markEnriched(concluidos.flat().map((j) => j.id));

  const preenchidas = results.reduce((a, r) => a + (r?.preenchidas ?? 0), 0);
  const falhos = lotes.length - concluidos.length;
  console.log(
    `[enrich] ${preenchidas}/${fila.length} vagas com salário/jornada` +
      (falhos ? ` · ${falhos} lote(s) adiado(s) por falha da IA` : ""),
  );
  return preenchidas;
}
