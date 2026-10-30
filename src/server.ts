import { join } from "node:path";
import { db, type Job } from "./db.ts";
import { serializaVagas } from "./vagas-api.ts";
import { criaHandler } from "./web-server.ts";

/**
 * Interface web: `bun run web` serve `GET /api/vagas` (lê o SQLite) e o build
 * do front em `web/dist`. Só leitura — quem coleta e publica continua sendo o
 * bot (`bun start`), que pode rodar ao mesmo tempo (o banco usa WAL).
 *
 * Escuta em 127.0.0.1 por padrão: a página mostra e-mail e telefone de
 * anunciantes, então abrir para a rede é uma decisão (`HOST=0.0.0.0`).
 */
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const DIST = join(import.meta.dir, "..", "web", "dist");

const handler = criaHandler({
  distDir: DIST,
  lista: () =>
    serializaVagas(
      db
        .query<Job, []>(
          "SELECT * FROM jobs ORDER BY last_seen DESC, first_seen DESC",
        )
        .all(),
    ),
});

const server = Bun.serve({ hostname: HOST, port: PORT, fetch: handler });
console.log(
  `[web] http://${server.hostname}:${server.port}  (banco: ${process.env.DB_PATH ?? "./data/store.db"})`,
);
