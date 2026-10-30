import { describe, expect, test } from "bun:test";
import type { Vaga } from "../types.ts";
import {
  contaFiltrosAtivos,
  contaPor,
  FILTROS_VAZIOS,
  filtra,
  filtrosDeUrl,
  filtrosParaUrl,
  mediana,
  norm,
  ordena,
  resumo,
} from "./filtros.ts";

const vaga = (o: Partial<Vaga> = {}): Vaga => ({
  id: "1",
  titulo: "Caixa",
  empresa: "Mercado X",
  area: "Vendas & Comércio",
  salario: null,
  salarioValor: null,
  jornada: null,
  contrato: null,
  modalidade: "Presencial",
  cidade: "Franca",
  fonte: "Portal A",
  link: "https://exemplo.com/1",
  descricao: null,
  requisitos: null,
  prazo: null,
  publicadaEm: null,
  vistaEm: "2026-10-20",
  contato: null,
  pcd: false,
  ...o,
});

const base = [
  vaga({
    id: "a",
    titulo: "Costureira",
    area: "Calçados & Indústria",
    salarioValor: 2100,
    salario: "R$ 2.100",
    contrato: "CLT",
    fonte: "Portal A",
    vistaEm: "2026-10-25",
  }),
  vaga({
    id: "b",
    titulo: "Auxiliar de Produção",
    area: "Calçados & Indústria",
    salarioValor: 2800,
    salario: "R$ 2.800",
    contrato: "PJ",
    fonte: "Portal B",
    requisitos: "Experiência",
  }),
  vaga({
    id: "c",
    titulo: "Vendedor",
    empresa: "Loja Y",
    salarioValor: null,
    contrato: "CLT",
    fonte: "Portal A",
    pcd: true,
    vistaEm: "2026-10-28",
  }),
  vaga({
    id: "d",
    titulo: "Atendente",
    salarioValor: 1800,
    salario: "R$ 1.800",
    modalidade: "Home office",
    fonte: "Portal C",
  }),
];

const ids = (vs: Vaga[]) => vs.map((v) => v.id);

describe("norm", () => {
  test("sem acento e minúsculo", () => {
    expect(norm("  Produção  ")).toBe("producao");
    expect(norm("AÇÃO")).toBe("acao");
  });
});

describe("filtra", () => {
  test("sem filtro devolve tudo", () => {
    expect(filtra(base, FILTROS_VAZIOS)).toHaveLength(4);
  });

  test("busca ignora acento e exige todos os termos", () => {
    expect(ids(filtra(base, { ...FILTROS_VAZIOS, busca: "producao" }))).toEqual(
      ["b"],
    );
    expect(
      ids(filtra(base, { ...FILTROS_VAZIOS, busca: "auxiliar producao" })),
    ).toEqual(["b"]);
    expect(
      filtra(base, { ...FILTROS_VAZIOS, busca: "auxiliar caixa" }),
    ).toEqual([]);
  });

  test("busca acha a empresa", () => {
    expect(ids(filtra(base, { ...FILTROS_VAZIOS, busca: "loja y" }))).toEqual([
      "c",
    ]);
  });

  test("OR dentro do grupo, AND entre grupos", () => {
    const f = {
      ...FILTROS_VAZIOS,
      fontes: ["Portal A", "Portal B"],
      contratos: ["CLT"],
    };
    expect(ids(filtra(base, f))).toEqual(["a", "c"]);
  });

  test("grupo selecionado exclui vaga sem o campo", () => {
    expect(
      ids(filtra(base, { ...FILTROS_VAZIOS, contratos: ["CLT"] })),
    ).toEqual(["a", "c"]);
  });

  test("salário mínimo só deixa quem declara valor suficiente", () => {
    expect(ids(filtra(base, { ...FILTROS_VAZIOS, salarioMin: 2000 }))).toEqual([
      "a",
      "b",
    ]);
    expect(ids(filtra(base, { ...FILTROS_VAZIOS, salarioMin: 2800 }))).toEqual([
      "b",
    ]);
  });

  test("só com salário / requisitos / PcD", () => {
    expect(
      filtra(base, { ...FILTROS_VAZIOS, soComSalario: true }),
    ).toHaveLength(3);
    expect(
      ids(filtra(base, { ...FILTROS_VAZIOS, soComRequisitos: true })),
    ).toEqual(["b"]);
    expect(ids(filtra(base, { ...FILTROS_VAZIOS, soPcd: true }))).toEqual([
      "c",
    ]);
  });
});

describe("ordena", () => {
  test("maior salário primeiro, sem salário no fim", () => {
    expect(ids(ordena(base, "salario"))).toEqual(["b", "a", "d", "c"]);
  });

  test("empate de salário desempata pelo mais recente", () => {
    const vs = [
      vaga({ id: "x", salarioValor: 2000, vistaEm: "2026-10-01" }),
      vaga({ id: "y", salarioValor: 2000, vistaEm: "2026-10-09" }),
    ];
    expect(ids(ordena(vs, "salario"))).toEqual(["y", "x"]);
  });

  test("mais recentes usa a publicação quando existe", () => {
    const vs = [
      vaga({ id: "x", publicadaEm: "2026-10-01", vistaEm: "2026-10-28" }),
      vaga({ id: "y", publicadaEm: "2026-10-20", vistaEm: "2026-10-21" }),
    ];
    expect(ids(ordena(vs, "recentes"))).toEqual(["y", "x"]);
  });

  test("A–Z respeita acento e não muda o array original", () => {
    const vs = [
      vaga({ id: "x", titulo: "Zelador" }),
      vaga({ id: "y", titulo: "Ágata" }),
    ];
    expect(ids(ordena(vs, "az"))).toEqual(["y", "x"]);
    expect(ids(vs)).toEqual(["x", "y"]);
  });
});

describe("contaPor / mediana / resumo", () => {
  test("conta e ordena por frequência", () => {
    expect(contaPor(base, "fonte")).toEqual([
      { valor: "Portal A", n: 2 },
      { valor: "Portal B", n: 1 },
      { valor: "Portal C", n: 1 },
    ]);
  });

  test("ignora vaga sem o campo", () => {
    expect(contaPor(base, "contrato").reduce((s, c) => s + c.n, 0)).toBe(3);
  });

  test("mediana de par, ímpar e vazio", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  test("resumo: mediana só com 3 valores ou mais; novas na semana", () => {
    const r = resumo(base, "2026-10-29");
    expect(r.total).toBe(4);
    expect(r.comSalario).toBe(3);
    expect(r.mediana).toBe(2100);
    expect(r.maior).toBe(2800);
    expect(r.comRequisitos).toBe(1);
    expect(r.fontes).toBe(3);
    // a (25/10) e c (28/10) são da última semana; b e d são de 20/10 (9 dias).
    expect(r.novasNaSemana).toBe(2);
    expect(resumo(base.slice(0, 2), "2026-10-29").mediana).toBeNull();
  });
});

describe("URL", () => {
  test("ida e volta preserva os filtros", () => {
    const f = {
      ...FILTROS_VAZIOS,
      busca: "caixa fixo",
      areas: ["Vendas & Comércio", "Saúde"],
      contratos: ["CLT"],
      salarioMin: 2000,
      soComSalario: true,
      soPcd: true,
      ordem: "recentes" as const,
    };
    expect(filtrosDeUrl(filtrosParaUrl(f))).toEqual(f);
  });

  test("filtros vazios geram URL vazia", () => {
    expect(filtrosParaUrl(FILTROS_VAZIOS)).toBe("");
  });

  test("valores inválidos na URL caem no padrão", () => {
    const f = filtrosDeUrl("?min=abc&ordem=hack&min=-5");
    expect(f.salarioMin).toBe(0);
    expect(f.ordem).toBe("salario");
  });

  test("conta filtros ativos (a busca e a ordem não contam)", () => {
    expect(
      contaFiltrosAtivos({ ...FILTROS_VAZIOS, busca: "x", ordem: "az" }),
    ).toBe(0);
    expect(
      contaFiltrosAtivos({
        ...FILTROS_VAZIOS,
        areas: ["a", "b"],
        salarioMin: 500,
        soPcd: true,
      }),
    ).toBe(4);
  });
});
