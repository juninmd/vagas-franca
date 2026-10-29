import { parseSalario } from "./format.ts";

/**
 * O smoke GRAVA vagas no banco. `db.ts` abre o banco no import, então o guard
 * vem antes dos imports dinâmicos: sem `DB_PATH` explícito o script cairia no
 * `./data/store.db` de produção.
 */
if (!process.env.DB_PATH || process.env.DB_PATH === "./data/store.db") {
  console.error(
    "smoke: defina DB_PATH para um banco descartável (ex.: DB_PATH=/tmp/smoke.db bun run smoke)",
  );
  process.exit(2);
}

const { melhoresOportunidades } = await import("./destaques.ts");
const { db } = await import("./db.ts");
const { isoDay } = await import("./digest.ts");
const { syncEmpregoFranca } = await import("./sources/empregofranca.ts");
const { syncBne } = await import("./sources/bne.ts");
const { syncEmpregoEmFranca } = await import("./sources/empregoemfranca.ts");
const { syncHardFranca } = await import("./sources/hardfranca.ts");
const { syncFrancaClassificados } = await import(
  "./sources/francaclassificados.ts"
);
const { syncAcif } = await import("./sources/acif.ts");
const { syncTrabalhaBrasil } = await import("./sources/trabalhabrasil.ts");
const { syncInfoJobs } = await import("./sources/infojobs.ts");
const { syncEmpregos } = await import("./sources/empregos.ts");

import type { Job } from "./db.ts";

/**
 * Smoke test ao vivo: coleta as fontes alcançáveis, grava no banco de DB_PATH
 * (use um banco descartável) e imprime os valores. Sai com código 1 se algo
 * básico quebrou — fonte sem vaga, salário fora da faixa, ranking vazio.
 */
const hoje = isoDay(new Date());
const falhas: string[] = [];

const fontes: [string, () => Promise<unknown>][] = [
  ["emprego-franca", () => syncEmpregoFranca(hoje)],
  ["bne", () => syncBne(hoje)],
  ["francaclassificados", () => syncFrancaClassificados(hoje)],
  ["empregoemfranca", () => syncEmpregoEmFranca(hoje)],
  ["acif", () => syncAcif(hoje)],
  ["trabalhabrasil", () => syncTrabalhaBrasil(hoje)],
  ["infojobs", () => syncInfoJobs(hoje)],
  ["empregos.com.br", () => syncEmpregos(hoje)],
  ["hardfranca", () => syncHardFranca(hoje)],
];
for (const [nome, run] of fontes) {
  try {
    await run();
  } catch (e) {
    falhas.push(`${nome}: ${e}`);
    console.warn(`  ! ${nome} falhou: ${e}`);
  }
}

const jobs = db.query<Job, []>("SELECT * FROM jobs").all();
const porFonte = db
  .query<{ source: string; n: number; s: number }, []>(
    "SELECT source, COUNT(*) n, SUM(salary IS NOT NULL) s FROM jobs GROUP BY source ORDER BY n DESC",
  )
  .all();

console.log(`\n=== SMOKE ${hoje} — ${jobs.length} vagas no banco ===`);
console.table(
  porFonte.map((f) => ({ fonte: f.source, vagas: f.n, "com salário": f.s })),
);

const top = melhoresOportunidades(jobs, 10);
console.log("\n=== TOP 10 MELHORES OPORTUNIDADES ===");
console.table(
  top.map((d, i) => ({
    "#": i + 1,
    vaga: d.job.title.slice(0, 38),
    empresa: (d.job.company ?? "—").slice(0, 26),
    R$: d.valor,
    contrato: d.job.contract ?? "—",
    score: d.score,
    fonte: d.job.source,
  })),
);

if (!jobs.length) falhas.push("banco vazio");
if (!top.length) falhas.push("ranking vazio");
for (const j of jobs) {
  const v = parseSalario(j.salary);
  if (j.salary && v !== null && (v < 800 || v > 30000))
    falhas.push(`salário fora da faixa: ${j.title} ${j.salary}`);
}
if (!porFonte.some((f) => f.source === "Emprego Franca"))
  falhas.push("Emprego Franca não trouxe vagas");

console.log(
  falhas.length ? `\nFALHOU:\n- ${falhas.join("\n- ")}` : "\nSMOKE OK ✅",
);
process.exit(falhas.length ? 1 : 0);
