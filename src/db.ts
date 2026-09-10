import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./config/env.ts";

mkdirSync(dirname(env.dbPath), { recursive: true });

export const db = new Database(env.dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    company     TEXT,
    area        TEXT,
    salary      TEXT,
    schedule    TEXT,
    contract    TEXT,
    workplace   TEXT,
    city        TEXT,
    contact     TEXT,
    link        TEXT NOT NULL,
    source      TEXT NOT NULL,
    description TEXT,
    published   TEXT,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    enriched    INTEGER NOT NULL DEFAULT 0,
    posted      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs(posted, area);
  CREATE INDEX IF NOT EXISTS idx_jobs_seen   ON jobs(last_seen);

  -- Uma linha por dia: é o que permite dizer "abriu 12 vagas a mais que ontem".
  CREATE TABLE IF NOT EXISTS snapshots (
    dia          TEXT PRIMARY KEY,
    abertas      INTEGER NOT NULL,
    novas        INTEGER NOT NULL,
    com_salario  INTEGER NOT NULL,
    mediana      REAL,
    calcadista   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    link        TEXT NOT NULL,
    source      TEXT NOT NULL,
    summary     TEXT,
    published   TEXT,
    fetched_at  TEXT NOT NULL,
    digested    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_items_digested ON items(digested, fetched_at);
`);

// Banco criado antes destas colunas segue funcionando (SQLite não tem
// ADD COLUMN IF NOT EXISTS; o erro de coluna repetida é o "já migrado").
for (const ddl of [
  "ALTER TABLE jobs ADD COLUMN contact TEXT",
  "ALTER TABLE jobs ADD COLUMN deadline TEXT",
  "ALTER TABLE jobs ADD COLUMN pcd INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(ddl);
  } catch (err) {
    // Só "coluna repetida" significa "já migrado". Engolir tudo transformava
    // banco travado/somente-leitura em "migração ok", e o erro reaparecia lá
    // na frente como `no such column: deadline`, longe da causa.
    if (!/duplicate column/i.test(String(err))) throw err;
  }
}

export interface Job {
  id: string;
  title: string;
  company: string | null;
  area: string | null;
  salary: string | null;
  schedule: string | null;
  contract: string | null;
  workplace: string | null;
  city: string | null;
  /** E-mail/telefone quando a fonte publica (mural da ACIF). */
  contact: string | null;
  /** Data-limite de candidatura (ISO), quando a fonte publica. */
  deadline: string | null;
  /** Vaga afirmativa/reservada a PcD — decidido na ingestão, do título cru. */
  pcd: number;
  link: string;
  source: string;
  description: string | null;
  published: string | null;
  first_seen: string;
  last_seen: string;
  enriched: number;
  posted: number;
}

export type NewJob = Omit<
  Job,
  | "id"
  | "first_seen"
  | "last_seen"
  | "enriched"
  | "posted"
  | "contact"
  | "deadline"
  | "pcd"
> & { contact?: string | null; deadline?: string | null; pcd?: number };

export interface Item {
  id: string;
  title: string;
  link: string;
  source: string;
  summary: string | null;
  published: string | null;
  fetched_at: string;
  digested: number;
}

/**
 * Regrava a vaga mantendo o que já foi conquistado. A precedência é por campo:
 * `COALESCE(excluded, atual)` na maioria, porque a fonte é a autoridade e só
 * preenche buraco; mas `salary`/`schedule` invertem para `COALESCE(atual,
 * excluded)`, senão a reingestão apagaria o que a IA extraiu na véspera.
 * `pcd` nunca volta a 0 (`MAX`) e `posted` fica onde está pra não repostar.
 */
const upsertStmt = db.prepare(`
  INSERT INTO jobs (id, title, company, area, salary, schedule, contract, workplace,
                    city, link, source, description, published, first_seen, last_seen,
                    contact, deadline, pcd)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, ?15, ?16, ?17)
  ON CONFLICT(id) DO UPDATE SET
    last_seen   = excluded.last_seen,
    title       = excluded.title,
    company     = COALESCE(excluded.company,     jobs.company),
    area        = COALESCE(excluded.area,        jobs.area),
    salary      = COALESCE(jobs.salary,          excluded.salary),
    schedule    = COALESCE(jobs.schedule,        excluded.schedule),
    contract    = COALESCE(excluded.contract,    jobs.contract),
    workplace   = COALESCE(excluded.workplace,   jobs.workplace),
    city        = COALESCE(excluded.city,        jobs.city),
    description = COALESCE(excluded.description, jobs.description),
    published   = COALESCE(excluded.published,   jobs.published),
    contact     = COALESCE(excluded.contact,     jobs.contact),
    deadline    = COALESCE(excluded.deadline,    jobs.deadline),
    pcd         = MAX(excluded.pcd,              jobs.pcd)
`);

const existsStmt = db.prepare<{ n: number }, [string]>(
  "SELECT COUNT(*) AS n FROM jobs WHERE id = ?",
);

/** Grava/atualiza a vaga. Devolve true se ela ainda não existia. */
export function upsertJob(job: NewJob, id: string, today: string): boolean {
  const isNew = (existsStmt.get(id)?.n ?? 0) === 0;
  upsertStmt.run(
    id,
    job.title,
    job.company,
    job.area,
    job.salary,
    job.schedule,
    job.contract,
    job.workplace,
    job.city,
    job.link,
    job.source,
    job.description,
    job.published,
    today,
    job.contact ?? null,
    job.deadline ?? null,
    job.pcd ?? 0,
  );
  return isNew;
}

export interface Snapshot {
  dia: string;
  abertas: number;
  novas: number;
  com_salario: number;
  mediana: number | null;
  calcadista: number;
}

/** Grava a foto do dia (idempotente: rodar o digest duas vezes não duplica). */
export function saveSnapshot(s: Snapshot): void {
  db.prepare(
    `INSERT INTO snapshots (dia, abertas, novas, com_salario, mediana, calcadista)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(dia) DO UPDATE SET
       abertas = excluded.abertas, novas = excluded.novas,
       com_salario = excluded.com_salario, mediana = excluded.mediana,
       calcadista = excluded.calcadista`,
  ).run(s.dia, s.abertas, s.novas, s.com_salario, s.mediana, s.calcadista);
}

/** Foto anterior à de hoje — base da comparação no raio-X. */
export function lastSnapshot(before: string): Snapshot | null {
  return (
    db
      .query<Snapshot, [string]>(
        "SELECT * FROM snapshots WHERE dia < ? ORDER BY dia DESC LIMIT 1",
      )
      .get(before) ?? null
  );
}

/** Ids que já têm descrição — evita reabrir a página de detalhe a cada rodada. */
export function idsComDescricao(): Set<string> {
  const rows = db
    .query<{ id: string }, []>(
      "SELECT id FROM jobs WHERE description IS NOT NULL",
    )
    .all();
  return new Set(rows.map((r) => r.id));
}

/**
 * Fila do próximo digest. Vaga com salário já conhecido vem primeiro, depois a
 * que tem descrição (a IA ainda pode achar valor/horário nela) — o post do dia
 * fica com o máximo de informação útil no topo.
 */
export function unpostedJobs(limit: number): Job[] {
  return db
    .query<Job, [number]>(
      `SELECT * FROM jobs WHERE posted = 0
        ORDER BY (salary IS NOT NULL) DESC, (description IS NOT NULL) DESC,
                 last_seen DESC, id
        LIMIT ?`,
    )
    .all(limit);
}

export function jobsByIds(ids: string[]): Job[] {
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(",");
  return db
    .query<Job, string[]>(`SELECT * FROM jobs WHERE id IN (${marks})`)
    .all(...ids);
}

// Preparados uma vez, como o `upsertStmt`: `applyEnrichment` roda uma vez por
// vaga da fila e alocava um statement novo a cada chamada.
const enrichLido = db.query<
  { salary: string | null; schedule: string | null },
  [string]
>("SELECT salary, schedule FROM jobs WHERE id = ?");

const enrichStmt = db.prepare<
  unknown,
  [string | null, string | null, string | null, string]
>(
  `UPDATE jobs SET enriched = 1,
     salary = CASE
       WHEN instr(COALESCE(jobs.salary, ''), ' · ') > 0 THEN jobs.salary
       ELSE substr(COALESCE(jobs.salary, ?1) || COALESCE(' · ' || ?3, ''), 1, 120)
     END,
     schedule = COALESCE(jobs.schedule, ?2)
   WHERE id = ?4`,
);

export function applyEnrichment(
  id: string,
  fields: {
    salary?: string | null;
    schedule?: string | null;
    benefits?: string | null;
  },
): boolean {
  // `COALESCE(jobs.salary, ?)` e não o contrário: o que o portal publica em
  // campo próprio vale mais que o que a IA lê da descrição, e é a mesma
  // precedência que o upsert já aplica. Invertido, a IA sobrescrevia um salário
  // conferido com outro número qualquer achado no texto da vaga.
  //
  // O benefício é concatenado DEPOIS dessa escolha, e não soldado no salário
  // da IA: soldado, ele sumia toda vez que o portal já tinha salário — e como
  // a linha saía `enriched = 1`, a extração não era refeita. O `instr` mantém
  // a operação idempotente: quem já tem " · " não recebe o bloco de novo.
  //
  // Sem salário nenhum (nem do portal, nem da IA) o benefício NÃO vira salário:
  // `NULL || x` é NULL no SQLite, e é o resultado certo — "💰 vale transporte"
  // informaria errado quem lê o post pra decidir se vale a candidatura. Quem
  // chama precisa saber que a linha não mudou, e é o que o retorno diz.
  //
  // O teto de 120 é rede: `confere` corta salário em 40 e `confereBeneficios`
  // em 3×24, então a soma não alcança o corte — que, se alcançasse, deixaria
  // um " ·" pendurado que o `instr` impediria de ser consertado depois.
  const antes = enrichLido.get(id);
  enrichStmt.run(
    fields.salary ?? null,
    fields.schedule ?? null,
    fields.benefits ?? null,
    id,
  );
  const depois = enrichLido.get(id);
  return (
    antes?.salary !== depois?.salary || antes?.schedule !== depois?.schedule
  );
}

export function markEnriched(ids: string[]): void {
  runAll("UPDATE jobs SET enriched = 1 WHERE id = ?", ids);
}

export function markPosted(ids: string[]): void {
  runAll("UPDATE jobs SET posted = 1 WHERE id = ?", ids);
}

export function openJobsCount(): number {
  return (
    db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM jobs").get()?.n ?? 0
  );
}

/**
 * Some com vaga encerrada: a que nenhuma fonte lista há dias e a que já passou
 * da data-limite publicada pela própria fonte (esta não precisa esperar o TTL).
 */
export function pruneStaleJobs(before: string, today: string): number {
  const { changes } = db.run(
    "DELETE FROM jobs WHERE last_seen < ? OR (deadline IS NOT NULL AND deadline < ?)",
    [before, today],
  );
  return changes;
}

const insertItemStmt = db.prepare(`
  INSERT OR IGNORE INTO items (id, title, link, source, summary, published, fetched_at, digested)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
`);

export function insertItem(row: Omit<Item, "digested">): boolean {
  const { changes } = insertItemStmt.run(
    row.id,
    row.title,
    row.link,
    row.source,
    row.summary,
    row.published,
    row.fetched_at,
  );
  return changes > 0;
}

export function pendingItems(limit: number): Item[] {
  return db
    .query<Item, [number]>(
      "SELECT * FROM items WHERE digested = 0 ORDER BY fetched_at DESC LIMIT ?",
    )
    .all(limit);
}

export function markDigested(ids: string[]): void {
  runAll("UPDATE items SET digested = 1 WHERE id = ?", ids);
}

function runAll(sql: string, ids: string[]): void {
  if (!ids.length) return;
  const stmt = db.prepare<unknown, [string]>(sql);
  const tx = db.transaction((list: string[]) => {
    for (const id of list) stmt.run(id);
  });
  tx(ids);
}
