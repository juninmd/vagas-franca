// Bun carrega .env automaticamente — sem dotenv.
const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

/**
 * SecOps: `NODE_TLS_REJECT_UNAUTHORIZED=0` desliga a validação de certificado
 * do processo INTEIRO — inclusive a chamada ao Telegram, que leva o token do
 * bot. Se foi ligado por causa de um certificado interno do cluster, o certo é
 * `NODE_EXTRA_CA_CERTS=/caminho/ca.crt`, que confia só naquela CA.
 */
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
  console.warn(
    "[segurança] NODE_TLS_REJECT_UNAUTHORIZED=0: TLS sem validação em TODAS as " +
      "requisições (Telegram e portais). Prefira NODE_EXTRA_CA_CERTS.",
  );

export const env = {
  aiProvider: (process.env.AI_PROVIDER ?? "litellm") as
    | "litellm"
    | "ollama"
    | "openai"
    | "anthropic"
    | "google",
  litellmBaseUrl:
    process.env.LITELLM_BASE_URL ??
    "http://litellm.ai.svc.cluster.local:4000/v1",
  litellmKey: process.env.LITELLM_API_KEY ?? "",
  litellmModel: process.env.LITELLM_MODEL ?? "cloud/gemma3",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",

  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatIds: (process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Espaçamento entre mensagens: o Telegram corta em ~20/min por grupo.
  telegramIntervalMs: num(process.env.TELEGRAM_INTERVAL_MS, 3500),
  // Teto pra qualquer espera de reenvio. O `retry_after` do flood control do
  // Telegram chega a centenas de segundos; obedecido cru, um 429 segurava o
  // digest inteiro além do próximo cron.
  telegramMaxWaitMs: num(process.env.TELEGRAM_MAX_WAIT_MS, 120_000),

  cronIngestion: process.env.CRON_INGESTION ?? "0 */6 * * *",
  cronDigest: process.env.CRON_DIGEST ?? "0 11 * * *",
  // Fuso do cron, explícito: sem ele o node-cron usa o relógio do host e o
  // mesmo `0 11 * * *` dispara em hora diferente em cada máquina. UTC é o
  // padrão porque é o que as expressões acima já assumem.
  cronTimezone: process.env.CRON_TZ ?? "UTC",

  dbPath: process.env.DB_PATH ?? "./data/store.db",
  maxItemsPerFeed: num(process.env.MAX_ITEMS_PER_FEED, 20),
  // Teto de vagas enviadas à IA por rodada de enriquecimento (em lotes paralelos).
  enrichMaxJobs: num(process.env.ENRICH_MAX_JOBS, 120),
  // Teto de vagas publicadas num digest — evita inundar o canal.
  jobsPerDigest: num(process.env.JOBS_PER_DIGEST, 60),
  // Vaga não revista há tantos dias é considerada encerrada e sai do banco.
  jobTtlDays: num(process.env.JOB_TTL_DAYS, 21),
  feedTimeoutMs: num(process.env.FEED_TIMEOUT_MS, 12000),
  // Teto por chamada de IA: sem isso um provider travado pendura o digest.
  aiTimeoutMs: num(process.env.AI_TIMEOUT_MS, 60000),
  // Páginas varridas por portal HTML (20 vagas/página, em geral).
  pagesPerBoard: num(process.env.PAGES_PER_BOARD, 5),
  // Páginas de detalhe abertas por rodada — é onde estão salário e horário.
  detailPages: num(process.env.DETAIL_PAGES, 12),
};
