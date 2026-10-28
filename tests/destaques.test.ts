import { describe, expect, test } from "bun:test";
import type { Job } from "../src/db.ts";
import { melhoresOportunidades, pontua } from "../src/destaques.ts";

const job = (o: Partial<Job>): Job =>
  ({
    id: o.title ?? "x",
    title: "Vaga",
    company: "Empresa",
    area: null,
    salary: "R$ 2.000",
    schedule: null,
    contract: "CLT",
    workplace: null,
    city: "Franca",
    contact: null,
    link: "https://x.com/1",
    source: "t",
    description: null,
    published: null,
    first_seen: "",
    last_seen: "",
    enriched: 0,
    posted: 0,
    deadline: null,
    pcd: 0,
    ...o,
  }) as Job;

describe("destaques", () => {
  test("sem salário não concorre", () => {
    expect(pontua(job({ salary: null }))).toBeNull();
  });

  test("CLT de R$ 2.500 com benefício vence PJ de R$ 3.000 sem nada", () => {
    const r = melhoresOportunidades([
      job({ title: "PJ", salary: "R$ 3.000", contract: "PJ" }),
      job({
        title: "CLT",
        salary: "R$ 2.500",
        description: "VR, plano de saúde e cesta básica",
      }),
    ]);
    expect(r[0]?.job.title).toBe("CLT");
  });

  test("salário acima do teto não domina o ranking", () => {
    const a = pontua(job({ salary: "R$ 20.000" }));
    const b = pontua(job({ salary: "R$ 8.000" }));
    expect(a?.score).toBe(b?.score);
  });

  test("mesma empresa+cargo aparece uma vez", () => {
    const r = melhoresOportunidades([
      job({}),
      job({ id: "2" }),
      job({ id: "3" }),
    ]);
    expect(r).toHaveLength(1);
  });

  test("respeita o limite n", () => {
    const js = Array.from({ length: 9 }, (_, i) => job({ title: `V${i}` }));
    expect(melhoresOportunidades(js, 3)).toHaveLength(3);
  });
});
