import { afterEach, describe, expect, test } from "bun:test";
import { sendTelegram } from "../src/telegram.ts";

/**
 * O contrato que o digest inteiro depende: `sendTelegram` só devolve true se a
 * mensagem realmente saiu. Se mentir, `markPosted` apaga a vaga do radar.
 * A rede é injetada — nenhum teste fala com o Telegram.
 */

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

interface Chamada {
  parseMode: string | undefined;
}

/** Instala um fetch falso que responde a sequência dada, e registra as chamadas. */
function fakeFetch(respostas: (() => Response | Promise<Response>)[]) {
  const chamadas: Chamada[] = [];
  let i = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { parse_mode?: string };
    chamadas.push({ parseMode: body.parse_mode });
    const proxima = respostas[Math.min(i, respostas.length - 1)];
    i++;
    return (proxima as () => Response | Promise<Response>)();
  }) as unknown as typeof fetch;
  return chamadas;
}

const ok = () => new Response('{"ok":true}', { status: 200 });
const status =
  (n: number, corpo = "{}") =>
  () =>
    new Response(corpo, { status: n });
const timeout = () => {
  const err = new Error("The operation timed out.");
  err.name = "TimeoutError";
  throw err;
};

describe("sendTelegram — status de entrega", () => {
  test("entrega bem-sucedida devolve true", async () => {
    fakeFetch([ok]);
    expect(await sendTelegram("oi")).toBe(true);
  });

  test("403 (bot removido do chat) devolve false, sem insistir", async () => {
    const chamadas = fakeFetch([status(403)]);
    expect(await sendTelegram("oi")).toBe(false);
    expect(chamadas.length).toBe(1);
  });

  test("erro permanente devolve false — é o que segura o markPosted", async () => {
    fakeFetch([status(404)]);
    expect(await sendTelegram("oi")).toBe(false);
  });
});

describe("sendTelegram — degradação", () => {
  test("400 reenvia sem Markdown e considera entregue", async () => {
    // Markdown quebrado vindo do título de uma vaga não pode derrubar a área.
    const chamadas = fakeFetch([status(400), ok]);
    expect(await sendTelegram("*quebrado_")).toBe(true);
    expect(chamadas.map((c) => c.parseMode)).toEqual(["Markdown", undefined]);
  });

  test("429 respeita o retry_after e repete", async () => {
    const chamadas = fakeFetch([
      status(429, '{"parameters":{"retry_after":0}}'),
      ok,
    ]);
    expect(await sendTelegram("oi")).toBe(true);
    expect(chamadas.length).toBe(2);
  });

  test("5xx repete e ainda pode entregar", async () => {
    const chamadas = fakeFetch([status(500), ok]);
    expect(await sendTelegram("oi")).toBe(true);
    expect(chamadas.length).toBe(2);
  });

  test("desiste depois do teto de tentativas, devolvendo false", async () => {
    const chamadas = fakeFetch([status(500)]);
    expect(await sendTelegram("oi")).toBe(false);
    // Teto de tentativas: não pode virar laço infinito de 5xx.
    expect(chamadas.length).toBeLessThanOrEqual(4);
  });

  test("queda de rede (sem resposta) repete e devolve false", async () => {
    // Diferente do timeout: aqui `fetch` estoura sem TimeoutError, então nada
    // saiu do processo — repetir é seguro e é o único caminho que ainda entrega.
    const chamadas = fakeFetch([
      () => {
        throw new TypeError("Unable to connect");
      },
    ]);
    expect(await sendTelegram("oi")).toBe(false);
    expect(chamadas.length).toBeGreaterThan(2);
    expect(chamadas.length).toBeLessThanOrEqual(4);
  }, 20_000);

  test("timeout repete no máximo uma vez", async () => {
    // Sem chave de idempotência, cada repetição pode duplicar o post no canal.
    const chamadas = fakeFetch([timeout]);
    expect(await sendTelegram("oi")).toBe(false);
    expect(chamadas.length).toBe(2);
  });

  test("timeout seguido de sucesso entrega", async () => {
    fakeFetch([timeout, ok]);
    expect(await sendTelegram("oi")).toBe(true);
  });
});

describe("sendTelegram — 429 com espera absurda", () => {
  test("um retry_after de uma hora não pendura o digest", async () => {
    // Flood control devolve centenas de segundos; obedecer cru segurava a
    // rodada inteira além do próximo cron.
    const chamadas = fakeFetch([
      status(429, '{"parameters":{"retry_after":3600}}'),
    ]);
    const t0 = Date.now();
    const entregue = await sendTelegram("oi");
    const gasto = Date.now() - t0;
    expect(entregue).toBe(false);
    expect(chamadas.length).toBeGreaterThan(1);
    // Teto de 120s por espera; o teste só prova que não são 3600s.
    expect(gasto).toBeLessThan(3600_000);
  }, 20_000);
});
