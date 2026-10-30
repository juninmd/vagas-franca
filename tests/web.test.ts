import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "../src/db.ts";
import { serializaVaga, serializaVagas } from "../src/vagas-api.ts";
import { caminhoSeguro, criaHandler } from "../src/web-server.ts";

const job = (o: Partial<Job> = {}): Job => ({
  id: "abc",
  title: "Caixa",
  company: "Mercado X",
  area: "Vendas & Comércio",
  salary: "R$ 2.114,00 por mês",
  schedule: "Seg a Sex",
  contract: "CLT",
  workplace: "Presencial",
  city: "Franca",
  contact: "rh@mercado.com.br",
  deadline: "2026-11-30",
  pcd: 0,
  link: "https://exemplo.com/vaga/1",
  source: "Teste",
  description: "Atendimento. Requisitos: Ensino médio completo. Benefícios: VT",
  published: "2026-10-20T10:00:00Z",
  first_seen: "2026-10-28",
  last_seen: "2026-10-29",
  enriched: 0,
  posted: 0,
  ...o,
});

describe("serializaVaga", () => {
  test("campos principais, salário em número e requisitos extraídos", () => {
    const v = serializaVaga(job());
    expect(v.titulo).toBe("Caixa");
    expect(v.salario).toBe("R$ 2.114");
    expect(v.salarioValor).toBe(2114);
    expect(v.requisitos).toBe("Ensino médio completo");
    expect(v.publicadaEm).toBe("2026-10-20");
    expect(v.prazo).toBe("2026-11-30");
    expect(v.vistaEm).toBe("2026-10-28");
    expect(v.pcd).toBe(false);
  });

  test("link que não é http(s) não chega ao front", () => {
    expect(serializaVaga(job({ link: "javascript:alert(1)" })).link).toBeNull();
    expect(serializaVaga(job({ link: "data:text/html,x" })).link).toBeNull();
  });

  test("contato publica só e-mail e telefone", () => {
    const v = serializaVaga(
      job({ contact: "ligue <b>já</b> 16 99999-1234 ou rh@x.com.br" }),
    );
    expect(v.contato).toBe("rh@x.com.br · 16 99999-1234");
    expect(serializaVaga(job({ contact: "sem nada útil" })).contato).toBeNull();
  });

  test("data lixo vira null e salário ausente fica ausente", () => {
    const v = serializaVaga(
      job({ deadline: "amanhã", published: null, salary: null }),
    );
    expect(v.prazo).toBeNull();
    expect(v.publicadaEm).toBeNull();
    expect(v.salario).toBeNull();
    expect(v.salarioValor).toBeNull();
  });

  test("descrição enorme é cortada", () => {
    const v = serializaVaga(job({ description: "a".repeat(10_000) }));
    expect(v.descricao?.length).toBe(4000);
  });

  test("pcd e total", () => {
    const r = serializaVagas(
      [job({ pcd: 1 }), job({ id: "2" })],
      new Date("2026-10-30T12:00:00Z"),
    );
    expect(r.total).toBe(2);
    expect(r.geradoEm).toBe("2026-10-30T12:00:00.000Z");
    expect(r.vagas[0]?.pcd).toBe(true);
  });

  test("atualizadoEm é a coleta mais recente; sem vagas é null", () => {
    const r = serializaVagas([
      job({ last_seen: "2026-10-27" }),
      job({ id: "2", last_seen: "2026-10-29" }),
    ]);
    expect(r.atualizadoEm).toBe("2026-10-29");
    expect(serializaVagas([]).atualizadoEm).toBeNull();
  });
});

describe("caminhoSeguro", () => {
  test.each([
    "/../etc/passwd",
    "/%2e%2e/etc/passwd",
    "/%2e%2e%2f%2e%2e%2fetc/passwd",
    "/assets/..%2f..%2f..%2fsegredo",
    "/a%00b",
    "/%E0%A4%A",
  ])("%s não sai da pasta", (p) => {
    expect(caminhoSeguro("/srv/dist", p)).toBeNull();
  });

  test("caminho normal fica dentro", () => {
    expect(caminhoSeguro("/srv/dist", "/assets/app.js")).toBe(
      "/srv/dist/assets/app.js",
    );
  });
});

describe("criaHandler", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "vagas-dist-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>app</title>");
    writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
    writeFileSync(join(tmpdir(), "vagas-segredo.txt"), "segredo");
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(join(tmpdir(), "vagas-segredo.txt"), { force: true });
  });

  const lista = () => serializaVagas([job()], new Date("2026-10-30T12:00:00Z"));
  const pede = (path: string, method = "GET") =>
    criaHandler({ distDir: dir, lista })(
      new Request(`http://x${path}`, { method }),
    );

  test("/api/vagas devolve JSON sem cache", async () => {
    const r = pede("/api/vagas");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const corpo = (await r.json()) as { total: number };
    expect(corpo.total).toBe(1);
  });

  test("/api/vagas comprime com gzip só quando o navegador aceita", async () => {
    const sem = criaHandler({ distDir: dir, lista })(
      new Request("http://x/api/vagas"),
    );
    expect(sem.headers.get("content-encoding")).toBeNull();
    const com = criaHandler({ distDir: dir, lista })(
      new Request("http://x/api/vagas", {
        headers: { "accept-encoding": "gzip, br" },
      }),
    );
    expect(com.headers.get("content-encoding")).toBe("gzip");
    expect(com.headers.get("vary")).toBe("accept-encoding");
    const bruto = new Uint8Array(await com.arrayBuffer());
    const texto = new TextDecoder().decode(Bun.gunzipSync(bruto));
    expect((JSON.parse(texto) as { total: number }).total).toBe(1);
  });

  test("outra rota de /api é 404 em JSON", async () => {
    const r = pede("/api/outra");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toContain("application/json");
  });

  test("index e rota do front caem no index.html, com CSP", async () => {
    for (const p of ["/", "/vaga/123"]) {
      const r = pede(p);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain("<title>app</title>");
      expect(r.headers.get("content-security-policy")).toContain(
        "script-src 'self'",
      );
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  test("asset com hash é imutável; arquivo inexistente com extensão é 404", async () => {
    const ok = pede("/assets/app-abc123.js");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("immutable");
    expect(pede("/assets/sumiu.js").status).toBe(404);
  });

  test("não serve arquivo fora da pasta", async () => {
    for (const p of ["/..%2fvagas-segredo.txt", "/%2e%2e/vagas-segredo.txt"]) {
      const r = pede(p);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(await r.text()).not.toContain("segredo");
    }
  });

  test("só GET e HEAD; HEAD não manda corpo", async () => {
    expect(pede("/api/vagas", "POST").status).toBe(405);
    expect(pede("/api/vagas", "DELETE").status).toBe(405);
    const h = pede("/", "HEAD");
    expect(h.status).toBe(200);
    expect(await h.text()).toBe("");
  });

  test("sem build do front responde 503 com a instrução", async () => {
    const vazio = mkdtempSync(join(tmpdir(), "vagas-vazio-"));
    try {
      const r = criaHandler({ distDir: vazio, lista })(
        new Request("http://x/"),
      );
      expect(r.status).toBe(503);
      expect(await r.text()).toContain("web:build");
    } finally {
      rmSync(vazio, { recursive: true, force: true });
    }
  });
});
