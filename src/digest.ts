import { formataRaioX, raioX, registraSnapshot } from "./analysis.ts";
import { AREA_ORDER, areaEmoji } from "./config/areas.ts";
import { env } from "./config/env.ts";
import { topic } from "./config/topic.ts";
import {
  type Job,
  jobsByIds,
  markDigested,
  markPosted,
  openJobsCount,
  pendingItems,
  pruneStaleJobs,
  unpostedJobs,
} from "./db.ts";
import { enrich } from "./enrich.ts";
import {
  contatoSeguro,
  extraiRequisitos,
  formataSalario,
  linkSeguro,
  mdSafe,
  prazo,
} from "./format.ts";
import { sendTelegram } from "./telegram.ts";

const TZ = "America/Sao_Paulo";

export const isoDay = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: TZ });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const humanDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });

/** Chave de duplicata: ignora acento, caixa e pontuação do título/empresa. */
const chaveVaga = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Duas vagas só são a mesma se derem pra provar: título + empresa. Sem empresa
 * (o mural publica anônimo) a chave cai no id — o mural tinha duas "Vendedora"
 * de empresas diferentes e uma sumia do post marcada como já publicada.
 */
const chaveDuplicata = (j: Job) =>
  j.company
    ? `${chaveVaga(j.title)}|${chaveVaga(j.company)}`
    : `${chaveVaga(j.title)}|#${j.id}`;

/** Vaga com salário no post vale mais que vaga sem — sobe na lista. */
const ranking = (a: Job, b: Job) =>
  Number(Boolean(b.salary)) - Number(Boolean(a.salary)) ||
  Number(Boolean(b.schedule)) - Number(Boolean(a.schedule)) ||
  a.title.localeCompare(b.title, "pt-BR");

function jobLines(job: Job, today: string): string {
  // Vaga afirmativa vira selo: no título era ruído repetido em toda linha.
  const selo = job.pcd ? " ♿" : "";
  // `**` é entidade vazia e a API devolve 400 — a mensagem ainda sai, porque
  // `chama()` reenvia sem Markdown, mas sai sem formatação nenhuma por causa
  // de um título em branco na fonte.
  const titulo = mdSafe(job.title).trim() || "Vaga sem título";
  const head = job.company
    ? `• *${titulo}*${selo} — ${mdSafe(job.company)}`
    : `• *${titulo}*${selo}`;
  const linhas = [head];

  const salario = formataSalario(job.salary);
  const valores = [
    salario ? `💰 ${mdSafe(salario)}` : "💰 a combinar",
    job.schedule ? `🕑 ${mdSafe(job.schedule)}` : null,
  ].filter(Boolean);
  linhas.push(`  ${valores.join(" · ")}`);

  const ficha = [
    job.contract ? `📄 ${mdSafe(job.contract)}` : null,
    job.workplace ? `📍 ${mdSafe(job.workplace)}` : null,
    job.city ? mdSafe(job.city) : null,
  ].filter(Boolean);
  if (ficha.length) linhas.push(`  ${ficha.join(" · ")}`);

  // Requisitos só aparecem quando a descrição os rotula — nada é inventado.
  const requisitos = extraiRequisitos(job.description);
  if (requisitos) linhas.push(`  ✅ _${mdSafe(requisitos)}_`);

  // Prazo curto é a informação que muda o comportamento de quem lê hoje.
  const limite = prazo(job.deadline, today);
  if (limite) linhas.push(`  ⏳ *${limite}*`);

  // O mural da ACIF publica e-mail/telefone da empresa: é por ali que a
  // candidatura acontece, então vale mais que o link.
  const contato = contatoSeguro(job.contact);
  if (contato) linhas.push(`  ✉️ ${mdSafe(contato)}`);

  // `link` vem da fonte e é texto livre no mural da ACIF — nunca entra cru
  // dentro de `(...)`, senão um `)` fecha o link e injeta conteúdo no post.
  const url = linkSeguro(job.link);
  linhas.push(
    url
      ? `  🔗 [Ver vaga e se candidatar](${url}) · _${mdSafe(job.source)}_`
      : `  🔗 _${mdSafe(job.source)}_`,
  );
  return linhas.join("\n");
}

/** Notícias de emprego da cidade: mutirão do PAT, feirão, contratação em massa. */
async function postaNoticias(): Promise<void> {
  const noticias = pendingItems(8);
  if (!noticias.length) return;
  // Notícia sem link utilizável não tem valor nenhum: sai da lista, mas segue
  // marcada como digerida — senão volta na fila todo dia, pra sempre.
  const linhas = noticias.flatMap((n) => {
    const url = linkSeguro(n.link);
    return url
      ? [`• [${mdSafe(n.title)}](${url}) — _${mdSafe(n.source)}_`]
      : [];
  });
  if (!linhas.length) {
    markDigested(noticias.map((n) => n.id));
    return;
  }
  const entregue = await sendTelegram(
    `📰 *Notícias de emprego em Franca*\n\n${linhas.join("\n")}`,
  );
  // Notícia marcada como digerida sem ter saído nunca mais volta à fila.
  if (entregue) markDigested(noticias.map((n) => n.id));
}

/** Enriquece, monta e publica o digest do dia. */
export async function digest(today = isoDay(new Date())): Promise<void> {
  // Vaga que sumiu de todas as fontes há semanas está encerrada.
  const removidas = pruneStaleJobs(addDays(today, -env.jobTtlDays), today);
  if (removidas)
    console.log(`[digest] ${removidas} vaga(s) antiga(s) removida(s)`);

  // Escolhe a fila do dia ANTES de enriquecer, e enriquece só ela: assim toda
  // vaga publicada passou pela IA.
  const fila = unpostedJobs(env.jobsPerDigest);
  await enrich(fila);
  const novas = jobsByIds(fila.map((j) => j.id));
  const abertas = openJobsCount();

  if (!novas.length) {
    await sendTelegram(
      `${topic.emoji} *${topic.title}* — ${humanDay(today)}\n\nNenhuma vaga nova hoje. Seguem *${abertas}* vagas abertas no radar — o próximo lote sai amanhã.`,
    );
    console.log("[digest] sem vagas novas");
    return;
  }

  // A mesma vaga costuma sair em dois portais (e a empresa reposta a própria).
  // Fica a versão mais informativa; as outras são marcadas como postadas do
  // mesmo jeito, senão voltam amanhã.
  const vistas = new Set<string>();
  const publicaveis = [...novas].sort(ranking).filter((j) => {
    const chave = chaveDuplicata(j);
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });

  const comSalario = publicaveis.filter((j) => j.salary).length;
  await sendTelegram(
    `${topic.emoji} *${topic.title}* — ${humanDay(today)}\n\n` +
      `*${publicaveis.length}* vagas novas hoje · *${abertas}* abertas no radar\n` +
      `${comSalario} com salário informado. Detalhes por área a seguir 👇`,
  );

  // Um post por área: agrupado, o leitor acha a profissão dele de relance.
  const porArea = new Map<string, Job[]>();
  for (const job of publicaveis) {
    const area = job.area ?? "Outras oportunidades";
    porArea.set(area, [...(porArea.get(area) ?? []), job]);
  }

  const areas = [...porArea.entries()].sort(
    (a, b) => AREA_ORDER.indexOf(a[0]) - AREA_ORDER.indexOf(b[0]),
  );
  let tudoEntregue = true;
  for (const [area, jobs] of areas) {
    const corpo = jobs
      .sort(ranking)
      .map((j) => jobLines(j, today))
      .join("\n\n");
    const ok = await sendTelegram(
      `${areaEmoji(area)} *${mdSafe(area)}* (${jobs.length})\n\n${corpo}`,
    );
    if (!ok) console.error(`[digest] área "${area}" não foi entregue`);
    tudoEntregue = ok && tudoEntregue;
  }

  // Raio-X entra depois da lista: o leitor já viu as vagas do dia e agora
  // recebe a leitura do mercado (quanto paga, quem contrata, o que abre mais).
  const raio = raioX(today);
  const raioOk = await sendTelegram(formataRaioX(raio, mdSafe));
  // Só depois de publicar: se o envio falhar, o dia não conta como fechado e a
  // comparação de amanhã continua apontando para a última foto que foi ao ar.
  if (raioOk) registraSnapshot(today, raio);

  await postaNoticias();

  // Marcar como postada uma vaga que não chegou ao canal é perdê-la pra
  // sempre: ela nunca mais entra numa fila de digest. Fica pro dia seguinte.
  if (tudoEntregue) markPosted(novas.map((j) => j.id));
  else
    console.error(
      "[digest] envio incompleto — vagas mantidas na fila do próximo digest",
    );

  console.log(
    `[digest] ${publicaveis.length} vagas em ${areas.length} área(s) ` +
      `(${novas.length - publicaveis.length} duplicatas omitidas) | ${abertas} abertas`,
  );
}
