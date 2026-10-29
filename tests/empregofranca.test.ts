import { describe, expect, test } from "bun:test";
import {
  extraiVagasEF,
  foneEF,
  mapeiaVagasEF,
  salarioEF,
} from "../src/sources/empregofranca.ts";

const vaga = (extra: Record<string, unknown> = {}) => ({
  title: "OPERADOR DE CAIXA",
  slug: "operador-de-caixa",
  status: "PUBLISHED",
  employmentType: "CLT",
  workModel: "ONSITE",
  salaryMode: "EXACT",
  salaryExactCents: 237700,
  cityIbgeCode: "3516200",
  destinationWhatsapp: "16994371285",
  expiresAt: "2026-11-30T12:00:00.000Z",
  benefits: ["Vale transporte"],
  organization: { tradeName: "Mercado X", slug: "mercado-x" },
  ...extra,
});

const html = (jobs: unknown) =>
  `<script>self.__next_f.push([1,${JSON.stringify(
    `x:[["$","div",null,{"initialJobs":${JSON.stringify(jobs)},"b":"]"}]]`,
  )}])</script>`;

describe("empregofranca", () => {
  test("extrai initialJobs do payload RSC, mesmo com ']' dentro de string", () => {
    const r = extraiVagasEF(html([vaga({ description: "usa ] e [ soltos" })]));
    expect(r).toHaveLength(1);
    expect(r[0]?.slug).toBe("operador-de-caixa");
  });

  test("layout desconhecido devolve [] em vez de estourar", () => {
    expect(extraiVagasEF("<html></html>")).toEqual([]);
  });

  test("salário: exato, faixa e a combinar", () => {
    expect(salarioEF(vaga() as never)).toBe("R$ 2.377");
    expect(
      salarioEF(
        vaga({
          salaryMode: "RANGE",
          salaryMinCents: 300000,
          salaryMaxCents: 2500000,
        }) as never,
      ),
    ).toBe("R$ 3.000 a R$ 25.000");
    expect(salarioEF(vaga({ salaryMode: "NEGOTIABLE" }) as never)).toBeNull();
  });

  test("telefone formatado; número torto vira null", () => {
    expect(foneEF("16994371285")).toBe("(16) 99437-1285");
    expect(foneEF("123")).toBeNull();
  });

  test("mapeia link, contrato, contato e prazo; descarta vencida e de outra cidade", () => {
    const [j, ...resto] = mapeiaVagasEF(
      [
        vaga(),
        vaga({ slug: "velha", expiresAt: "2026-01-01T00:00:00Z" }),
        vaga({ slug: "outra", cityIbgeCode: "3550308" }),
        vaga({ slug: "rascunho", status: "DRAFT" }),
      ] as never,
      "2026-10-28",
    );
    expect(resto).toHaveLength(0);
    expect(j?.link).toBe(
      "https://empregofranca.com.br/vaga/mercado-x/operador-de-caixa",
    );
    expect(j?.contract).toBe("CLT");
    expect(j?.workplace).toBe("Presencial");
    expect(j?.contact).toBe("(16) 99437-1285");
    expect(j?.deadline).toBe("2026-11-30");
    expect(j?.description).toContain("Benefícios: Vale transporte");
  });

  test("vaga confidencial não expõe a empresa", () => {
    const [j] = mapeiaVagasEF(
      [vaga({ confidential: true })] as never,
      "2026-10-28",
    );
    expect(j?.company).toBeNull();
  });
});
