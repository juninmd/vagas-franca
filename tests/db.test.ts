import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Migração e round-trip das colunas novas, contra um banco no formato ANTIGO —
 * é o caso real: o `store.db` em produção nasceu antes de `contact`, `deadline`
 * e `pcd`.
 *
 * O `DB_PATH` é fixado ANTES de importar `src/db.ts`, que abre o banco no
 * carregamento do módulo. Por isso este é o único arquivo de teste que importa
 * `db.ts`: o módulo é singleton e fica preso ao caminho do primeiro import.
 */
// O caminho vem de `tests/setup.ts`: `src/config/env.ts` congela `DB_PATH` no
// carregamento do módulo, e outro arquivo de teste pode já tê-lo carregado —
// redefinir a variável aqui não teria efeito nenhum.
const caminho = process.env.DB_PATH as string;
if (!caminho?.includes(tmpdir()))
  throw new Error(`DB_PATH de teste inesperado: ${caminho}`);

const apaga = () => {
  for (const sufixo of ["", "-shm", "-wal"]) {
    try {
      unlinkSync(caminho + sufixo);
    } catch {
      // arquivo pode não existir
    }
  }
};
apaga();

// Banco legado: schema de jobs SEM contact/deadline/pcd, com uma linha dentro.
const legado = new Database(caminho, { create: true });
legado.exec(`
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, company TEXT, area TEXT,
    salary TEXT, schedule TEXT, contract TEXT, workplace TEXT, city TEXT,
    link TEXT NOT NULL, source TEXT NOT NULL, description TEXT, published TEXT,
    first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0, posted INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO jobs (id,title,company,salary,link,source,first_seen,last_seen)
  VALUES ('antiga','Costureira','Calçados X','R$ 1.707,00',
          'https://ex.com/1','TrabalhaBrasil','2026-09-01','2026-09-01');
`);
legado.close();

const {
  applyEnrichment,
  db,
  pruneStaleJobs,
  unpostedJobs,
  upsertJob,
  markPosted,
  idsIgnoradas,
  ignora,
  esqueceIgnoradas,
} = await import("../src/db.ts");

const { salvaVagas } = await import("../src/sources/comum.ts");

afterAll(() => {
  db.close();
  apaga();
});

const vaga = (over: Record<string, unknown> = {}) => ({
  title: "Vendedora",
  company: "Loja Y",
  area: "Vendas & Comércio",
  salary: null,
  schedule: null,
  contract: null,
  workplace: null,
  city: "Franca",
  link: "https://ex.com/2",
  source: "Mural ACIF",
  description: null,
  published: null,
  ...over,
});

const lê = (id: string) =>
  db.query("SELECT * FROM jobs WHERE id = ?").get(id) as Record<
    string,
    unknown
  > | null;

describe("migração em banco já populado", () => {
  test("adiciona as colunas sem perder a linha antiga", () => {
    const colunas = (
      db.query("PRAGMA table_info(jobs)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(colunas).toContain("contact");
    expect(colunas).toContain("deadline");
    expect(colunas).toContain("pcd");

    const antiga = lê("antiga");
    expect(antiga?.title).toBe("Costureira");
    expect(antiga?.salary).toBe("R$ 1.707,00");
    // Linha pré-existente entra com os defaults, nunca nula em `pcd`.
    expect(antiga?.pcd).toBe(0);
    expect(antiga?.deadline).toBe(null);
  });
});

describe("migração que falha de verdade", () => {
  test("banco somente-leitura derruba o boot em vez de seguir sem as colunas", () => {
    // O `catch` da migração já tratou QUALQUER erro como "já migrado". Com o
    // banco travado ou somente-leitura o processo subia sem as colunas e só
    // quebrava horas depois, no digest, como `no such column: deadline`.
    const ro = join(tmpdir(), `vagas-franca-ro-${process.pid}.db`);
    for (const s of ["", "-shm", "-wal"]) {
      try {
        unlinkSync(ro + s);
      } catch {
        // pode não existir
      }
    }
    const legada = new Database(ro, { create: true });
    legada.exec(`CREATE TABLE jobs (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, link TEXT NOT NULL,
      source TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
      enriched INTEGER NOT NULL DEFAULT 0, posted INTEGER NOT NULL DEFAULT 0
    )`);
    legada.close();
    chmodSync(ro, 0o444);

    try {
      // Subprocesso: `db.ts` é singleton e já está carregado neste processo.
      // `bun -e` NÃO aplica o preload de `[test]`, então o isolamento aqui vem
      // só do `DB_PATH` explícito abaixo — tirar essa linha faz o subprocesso
      // cair no default `./data/store.db` e migrar o banco de produção.
      const r = Bun.spawnSync(["bun", "-e", 'await import("./src/db.ts")'], {
        env: { ...process.env, DB_PATH: ro },
      });
      expect(r.exitCode).not.toBe(0);
      expect(new TextDecoder().decode(r.stderr)).toContain("readonly");
    } finally {
      // Sem isto, uma falha deixa pra trás um arquivo somente-leitura que a
      // próxima rodada (outro pid, outro nome) não apaga — e eles acumulam.
      chmodSync(ro, 0o666);
      for (const s of ["", "-shm", "-wal"]) {
        try {
          unlinkSync(ro + s);
        } catch {
          // pode não existir
        }
      }
    }
  }, 30_000);
});

describe("round-trip das colunas novas", () => {
  test("grava e relê deadline, pcd e contact", () => {
    upsertJob(
      vaga({ contact: "rh@ex.com", deadline: "2026-09-20", pcd: 1 }),
      "nova",
      "2026-09-09",
    );
    const j = lê("nova");
    expect(j?.deadline).toBe("2026-09-20");
    expect(j?.pcd).toBe(1);
    expect(j?.contact).toBe("rh@ex.com");
  });

  test("reingestão não apaga o que já foi conquistado", () => {
    // A fonte devolve a mesma vaga sem contato/prazo na rodada seguinte.
    upsertJob(vaga(), "nova", "2026-09-10");
    const j = lê("nova");
    expect(j?.deadline).toBe("2026-09-20");
    expect(j?.pcd).toBe(1);
    expect(j?.contact).toBe("rh@ex.com");
    expect(j?.last_seen).toBe("2026-09-10");
  });

  test("upsert não ressuscita vaga já postada", () => {
    markPosted(["nova"]);
    upsertJob(vaga(), "nova", "2026-09-11");
    expect(lê("nova")?.posted).toBe(1);
  });
});

describe("applyEnrichment", () => {
  test("preenche buraco quando não há salário da fonte", () => {
    upsertJob(vaga({ link: "https://ex.com/3" }), "sem-sal", "2026-09-09");
    applyEnrichment("sem-sal", { salary: "R$ 2.000", schedule: "6x1" });
    const j = lê("sem-sal");
    expect(j?.salary).toBe("R$ 2.000");
    expect(j?.schedule).toBe("6x1");
    expect(j?.enriched).toBe(1);
  });

  test("NÃO sobrescreve salário publicado pelo portal", () => {
    // O campo estruturado do portal vale mais que o que a IA lê da descrição.
    applyEnrichment("antiga", { salary: "R$ 9.999", schedule: null });
    expect(lê("antiga")?.salary).toBe("R$ 1.707,00");
    expect(lê("antiga")?.enriched).toBe(1);
  });

  test("benefício sobrevive ao salário do portal ganhar a disputa", () => {
    // Soldado no salário da IA, o benefício ia junto no descarte — e a linha
    // saía `enriched = 1`, então a extração nunca era refeita: perda definitiva.
    upsertJob(
      vaga({ link: "https://ex.com/7", salary: "R$ 1.500,00" }),
      "com-benef",
      "2026-09-09",
    );
    applyEnrichment("com-benef", {
      salary: "R$ 4.000",
      schedule: null,
      benefits: "VT, cesta básica",
    });
    expect(lê("com-benef")?.salary).toBe("R$ 1.500,00 · VT, cesta básica");
  });

  test("reenriquecer não empilha o bloco de benefícios", () => {
    applyEnrichment("com-benef", {
      salary: null,
      benefits: "VT, cesta básica",
    });
    expect(lê("com-benef")?.salary).toBe("R$ 1.500,00 · VT, cesta básica");
  });

  test("sem salário nenhum, benefício não vira salário — e diz que não mudou", () => {
    // Decisão deliberada: "💰 vale transporte" informaria errado quem lê o post
    // pra decidir se vale a candidatura. O retorno é o que impede o descarte de
    // ser silencioso — sem ele, `enrich` contava a vaga como preenchida.
    upsertJob(vaga({ link: "https://ex.com/8" }), "so-benef", "2026-09-09");
    const mudou = applyEnrichment("so-benef", {
      salary: null,
      benefits: "VT",
    });
    expect(lê("so-benef")?.salary).toBe(null);
    expect(mudou).toBe(false);
  });

  test("devolve true quando de fato gravou algo", () => {
    upsertJob(vaga({ link: "https://ex.com/9" }), "mudou-sim", "2026-09-09");
    expect(
      applyEnrichment("mudou-sim", { salary: "R$ 2.000", schedule: null }),
    ).toBe(true);
    // Segunda passada não muda nada: idempotente, e o retorno acompanha.
    expect(
      applyEnrichment("mudou-sim", { salary: "R$ 2.000", schedule: null }),
    ).toBe(false);
  });
});

describe("pruneStaleJobs", () => {
  test("remove vaga sumida das fontes e vaga fora do prazo", () => {
    upsertJob(
      vaga({ link: "https://ex.com/4", deadline: "2026-09-01" }),
      "vencida",
      "2026-09-30",
    );
    upsertJob(vaga({ link: "https://ex.com/5" }), "fresca", "2026-09-30");

    const removidas = pruneStaleJobs("2026-09-15", "2026-09-30");
    // "antiga"/"nova"/"sem-sal" são velhas; "vencida" passou da data-limite.
    expect(removidas).toBeGreaterThanOrEqual(2);
    expect(lê("vencida")).toBe(null);
    expect(lê("fresca")).not.toBe(null);
  });
});

describe("unpostedJobs", () => {
  test("vaga com salário vem antes da sem salário", () => {
    upsertJob(
      vaga({ link: "https://ex.com/6", salary: "R$ 3.000" }),
      "com-sal",
      "2026-09-30",
    );
    const ids = unpostedJobs(10).map((j) => j.id);
    expect(ids).toContain("com-sal");
    expect(ids.indexOf("com-sal")).toBeLessThan(ids.indexOf("fresca"));
  });
});

describe("salvaVagas — deduplicação entre portais", () => {
  const nova = (over: Record<string, unknown> = {}) => {
    const { area: _a, ...resto } = vaga({
      title: "Operador de Caixa",
      company: "Mercado Dedup",
      link: "https://portal-a.com/1",
      source: "Portal A",
      ...over,
    });
    return resto;
  };

  test("mesma empresa+cargo em outra fonte conta como duplicada", () => {
    const a = salvaVagas([nova()] as never, "2026-10-01");
    const b = salvaVagas(
      [
        nova({
          title: "OPERADOR DE CAIXA",
          company: "MERCADO DEDUP",
          link: "https://portal-b.com/9",
          source: "Portal B",
        }),
      ] as never,
      "2026-10-01",
    );
    expect(a.novas).toBe(1);
    expect(b).toEqual({ novas: 0, total: 1, duplicadas: 1 });
    expect(
      lê(
        new Bun.CryptoHasher("sha1")
          .update("https://portal-b.com/9")
          .digest("hex"),
      ),
    ).toBe(null);
  });

  test("dentro da mesma fonte nada é cortado (uma vaga por loja)", () => {
    const r = salvaVagas(
      [
        nova({ link: "https://portal-a.com/10" }),
        nova({ link: "https://portal-a.com/11" }),
      ] as never,
      "2026-10-01",
    );
    expect(r.duplicadas).toBe(0);
    expect(r.novas).toBe(2);
  });

  test("reingestão da mesma vaga não vira duplicada de si mesma", () => {
    const r = salvaVagas([nova()] as never, "2026-10-02");
    expect(r).toEqual({ novas: 0, total: 1, duplicadas: 0 });
  });
});

describe("ignoradas", () => {
  test("registra o descarte, lembra e esquece o antigo", () => {
    ignora(["a", "b"], "teste", "2026-10-01");
    ignora(["c"], "teste", "2026-10-25");
    expect([...idsIgnoradas()].sort()).toEqual(["a", "b", "c"]);
    expect(esqueceIgnoradas("2026-10-20")).toBe(2);
    expect([...idsIgnoradas()]).toEqual(["c"]);
  });
});
