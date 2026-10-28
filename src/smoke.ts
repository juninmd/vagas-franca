import { db, type Job } from "./db.ts";
import { melhoresOportunidades } from "./destaques.ts";
import { isoDay } from "./digest.ts";
import { parseSalario } from "./format.ts";
import { syncAcif } from "./sources/acif.ts";
import { syncEmpregoFranca } from "./sources/empregofranca.ts";
import { syncEmpregos } from "./sources/empregos.ts";
import { syncInfoJobs } from "./sources/infojobs.ts";
import { syncTrabalhaBrasil } from "./sources/trabalhabrasil.ts";

/**
 * Smoke test ao vivo: coleta as fontes alcançáveis, grava no banco de DB_PATH
 * (use um banco descartável) e imprime os valores. Sai com código 1 se algo
 * básico quebrou — fonte sem vaga, salário fora da faixa, ranking vazio.
 */
const hoje = isoDay(new Date());
const falhas: string[] = [];

const fontes: [string, () => Promise<unknown>][] = [
  ["emprego-franca", () => syncEmpregoFranca(hoje)],
  ["acif", () => syncAcif(hoje)],
  ["trabalhabrasil", () => syncTrabalhaBrasil(hoje)],
  ["infojobs", () => syncInfoJobs(hoje)],
  ["empregos.com.br", () => syncEmpregos(hoje)],
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
