import { env } from "./config/env.ts";

const API = () => `https://api.telegram.org/bot${env.telegramToken}`;
const TIMEOUT_MS = 20000;
const MAX_TENTATIVAS = 4;

/**
 * O Telegram aceita ~20 mensagens/minuto por grupo. Um digest com 13 áreas
 * estoura isso e as últimas voltam 429 — na prática, áreas inteiras sumiam do
 * post. Uma fila global espaça os envios; `retry_after` do 429 é respeitado.
 */
let proximoEnvio = 0;
async function aguardaVez(): Promise<void> {
  const agora = Date.now();
  // Reserva o horário ANTES de dormir. Lendo e só então gravando, dois envios
  // concorrentes leriam o mesmo `proximoEnvio` e acordariam no mesmo instante
  // — o espaçamento sumiria justo quando há mais mensagens em voo.
  const vez = Math.max(agora, proximoEnvio);
  proximoEnvio = vez + env.telegramIntervalMs;
  if (vez > agora) await Bun.sleep(vez - agora);
}

/** Recuo exponencial, limitado pelo mesmo teto do `retry_after`. */
const recuo = (tentativa: number) =>
  Math.min(1000 * 2 ** tentativa, env.telegramMaxWaitMs);

/** Adia toda a fila — 429 é do chat inteiro, não só desta mensagem. */
const adiaFila = (ms: number) => {
  proximoEnvio = Math.max(proximoEnvio, Date.now() + ms);
};

interface Resposta {
  ok: boolean;
  status: number;
  retryAfter: number;
  corpo: string;
  /** Estourou o tempo: pode ter sido entregue mesmo assim. Ver `entrega`. */
  timeout: boolean;
}

async function chama(metodo: string, body: object): Promise<Resposta> {
  try {
    const res = await fetch(`${API()}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = await res.text();
    let retryAfter = 0;
    if (res.status === 429) {
      const p = safeJson(corpo)?.parameters?.retry_after;
      retryAfter = Math.min(
        (typeof p === "number" && p > 0 ? p : 30) * 1000,
        env.telegramMaxWaitMs,
      );
    }
    return {
      ok: res.ok,
      status: res.status,
      retryAfter,
      corpo,
      timeout: false,
    };
  } catch (err) {
    // Timeout/DNS: rede, não recusa do Telegram — vale nova tentativa.
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return { ok: false, status: 0, retryAfter: 0, corpo: String(err), timeout };
  }
}

function safeJson(s: string): { parameters?: { retry_after?: number } } | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Um pedaço, um chat. Degrada um problema por vez: 429 espera e repete, 5xx e
 * rede repetem com recuo, 400 (Markdown quebrado vindo da fonte) reenvia como
 * texto puro. Devolve false só quando nada mais dá pra fazer.
 */
async function entrega(chatId: string, texto: string): Promise<boolean> {
  let parseMode: string | undefined = "Markdown";
  let timeouts = 0;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    await aguardaVez();
    const res = await chama("sendMessage", {
      chat_id: chatId,
      text: texto,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      disable_web_page_preview: true,
    });
    if (res.ok) return true;

    if (res.status === 429) {
      console.warn(`[telegram] 429 — aguardando ${res.retryAfter / 1000}s`);
      adiaFila(res.retryAfter);
      continue;
    }
    if (res.status === 400 && parseMode) {
      // Markdown malformado vindo da fonte: reenvia sem marcação.
      parseMode = undefined;
      continue;
    }
    if (res.timeout) {
      // O Telegram não tem chave de idempotência: uma mensagem que estourou o
      // tempo pode ter sido entregue, e repetir duplica o bloco no canal.
      // Preferimos duplicar a perder a vaga, mas só UMA vez, e avisando — em
      // duplicata no canal, é esta linha que explica o que houve.
      timeouts++;
      if (timeouts > 1) {
        console.error("[telegram] 2º timeout no mesmo envio — desistindo");
        return false;
      }
      console.warn(
        "[telegram] timeout — repetindo; se a 1ª tiver chegado, o bloco sai duplicado",
      );
      adiaFila(recuo(tentativa));
      continue;
    }
    if (res.status >= 500 || res.status === 0) {
      adiaFila(recuo(tentativa));
      continue;
    }
    console.error(`[telegram] ${res.status}: ${res.corpo.slice(0, 300)}`);
    return false;
  }
  console.error(`[telegram] desistiu após ${MAX_TENTATIVAS} tentativas`);
  return false;
}

/**
 * Publica em todos os chats configurados. Devolve `false` se qualquer pedaço
 * não chegou — quem chama usa isso pra NÃO marcar a vaga como postada, senão
 * uma queda do Telegram apaga o dia inteiro do radar.
 */
export async function sendTelegram(text: string): Promise<boolean> {
  if (!env.telegramToken || !env.telegramChatIds.length) {
    console.log("[telegram] não configurado — imprimindo no console:\n");
    console.log(text);
    return true;
  }
  let tudoOk = true;
  for (const chatId of env.telegramChatIds)
    for (const pedaco of split(text, 3800))
      tudoOk = (await entrega(chatId, pedaco)) && tudoOk;
  return tudoOk;
}

/**
 * Quebra em pedaços de até `max`, sempre em fim de linha. Linha maior que o
 * limite (descrição colada sem quebra) é cortada na força — antes ela ia
 * inteira e o Telegram devolvia 400.
 */
export function split(text: string, max: number): string[] {
  const out: string[] = [];
  let buf = "";
  const fecha = () => {
    if (buf.trim()) out.push(buf.trimEnd());
    buf = "";
  };
  for (const linha of text.split("\n")) {
    for (const parte of quebraLonga(linha, max)) {
      if (buf.length + parte.length + 1 > max) fecha();
      buf += `${parte}\n`;
    }
  }
  fecha();
  return out.length ? out : [text.slice(0, max)];
}

/**
 * O corte acontece DEPOIS do escape de Markdown, então não pode cair em cima
 * de uma barra de escape: o pedaço terminaria com `\` solto (400) e o seguinte
 * começaria com o metacaractere que aquela barra protegia. Recua até o corte
 * ficar depois de um número par de barras.
 */
function quebraLonga(linha: string, max: number): string[] {
  if (linha.length <= max) return [linha];
  const partes: string[] = [];
  let i = 0;
  while (i < linha.length) {
    let fim = Math.min(i + max, linha.length);
    if (fim < linha.length) {
      let barras = 0;
      while (fim - 1 - barras >= i && linha[fim - 1 - barras] === "\\")
        barras++;
      if (barras % 2 === 1) fim--;
    }
    partes.push(linha.slice(i, fim));
    i = fim;
  }
  return partes;
}
