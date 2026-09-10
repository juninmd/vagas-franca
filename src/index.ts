import cron from "node-cron";
import { env } from "./config/env.ts";
import { topic } from "./config/topic.ts";
import { digest, isoDay } from "./digest.ts";
import { ingest } from "./ingest.ts";

const args = new Set(process.argv.slice(2));
const hoje = () => isoDay(new Date());

async function once() {
  await ingest(hoje());
  await digest();
}

if (args.has("--ingest")) {
  await ingest(hoje());
} else if (args.has("--digest")) {
  await digest();
} else if (args.has("--loop")) {
  console.log(`[${topic.name}] agente ativo`);
  console.log(`  fuso:     ${env.cronTimezone}`);
  console.log(`  ingestão: ${env.cronIngestion}`);
  console.log(`  digest:   ${env.cronDigest}`);
  await ingest(hoje());
  // Fuso explícito: o container nasce em UTC e "8h da manhã" é BRT. Sem isso o
  // digest saía às 5h da manhã em qualquer host que não fosse UTC.
  const opts = { timezone: env.cronTimezone };
  cron.schedule(
    env.cronIngestion,
    () => ingest(hoje()).catch(console.error),
    opts,
  );
  cron.schedule(env.cronDigest, () => digest().catch(console.error), opts);
} else {
  // padrão (--once): roda um ciclo e sai
  await once();
  process.exit(0);
}
