import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Pré-carregado por `bunfig.toml` antes de qualquer teste.
 *
 * `src/db.ts` abre o banco no carregamento do módulo. Sem isto, importar
 * qualquer coisa que puxe `db.ts` fazia a suíte abrir e MIGRAR o
 * `./data/store.db` de produção — e disputar o lock com o bot em `--loop`.
 * O token falso garante que nenhum teste caia no caminho "não configurado" por
 * acidente; a rede em si é sempre injetada pelo teste.
 */
// Atribuição incondicional, não `??=`: o `.env` do desenvolvedor define
// `DB_PATH=./data/store.db` (é o que o `.env.example` manda copiar), e o Bun
// carrega o `.env` ANTES deste preload — com `??=` o isolamento não existia
// justamente na máquina onde o banco de produção está.
process.env.DB_PATH = join(tmpdir(), `vagas-franca-test-${process.pid}.db`);
process.env.TELEGRAM_BOT_TOKEN = "token-de-teste";
process.env.TELEGRAM_CHAT_IDS = "1";
// Sem espaçamento: a fila de envio é testada por relógio próprio, não dormindo.
process.env.TELEGRAM_INTERVAL_MS = "0";
// Teto de espera minúsculo: o teste prova que o clamp existe sem dormir de fato.
process.env.TELEGRAM_MAX_WAIT_MS = "50";
// `src/ai.ts` usa o `fetch` global direto — um teste que alcance `chat()` sem
// substituir o `fetch` mandaria a chave de verdade pro provedor configurado.
// Mesma classe de risco que as linhas do Telegram acima já fecham.
process.env.LITELLM_API_KEY = "chave-de-teste";
process.env.OPENAI_API_KEY = "chave-de-teste";
process.env.ANTHROPIC_API_KEY = "chave-de-teste";
process.env.GEMINI_API_KEY = "chave-de-teste";
// A chave falsa impede o vazamento de credencial, não a requisição: sem isto o
// endereço continua sendo o do cluster real do desenvolvedor.
// `AI_PROVIDER` fixo também: com `openai`/`anthropic`/`google` no `.env` do
// desenvolvedor, `src/ai.ts` mira endereço real embutido no código e o
// `fetch` de negação vira a ÚNICA linha de defesa.
process.env.AI_PROVIDER = "ollama";
process.env.LITELLM_BASE_URL = "http://127.0.0.1:1/v1";
process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1";

// Rede fechada por padrão. Quem precisa de rede injeta o próprio `fetch` (é o
// que `telegram.test.ts` faz); qualquer outro caminho falha dizendo o nome do
// alvo, em vez de sair calado pra internet — ACIF, Gupy e provedor de IA são
// todos endereços reais que a suíte alcançaria sem querer.
globalThis.fetch = (async (entrada: RequestInfo | URL) => {
  const alvo =
    typeof entrada === "string"
      ? entrada
      : ((entrada as Request).url ?? entrada);
  throw new Error(
    `[teste] fetch bloqueado para ${alvo} — injete um fetch falso neste teste`,
  );
}) as unknown as typeof fetch;
