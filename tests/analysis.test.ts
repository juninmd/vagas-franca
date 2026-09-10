import { describe, expect, test } from "bun:test";
import { cityRank, inRegion } from "../src/config/region.ts";
import { cargoBase, parseSalario } from "../src/format.ts";
import { split } from "../src/telegram.ts";

describe("parseSalario", () => {
  test.each([
    ["R$ 1.750,00 por mês", 1750],
    ["R$ 2.200,00 a R$ 2.300,00", 2200],
    ["R$ 1.900 + VT", 1900],
    ["R$ 1900", 1900],
    // Benefício não é salário: sem o piso de 800 a mediana desabava.
    ["VR 25,00 por dia", null],
    ["a combinar", null],
    // Teto de 30k barra número solto de descrição (código, CEP, telefone).
    ["R$ 999.999,00", null],
    [null, null],
  ])("%s → %s", (entrada, esperado) => {
    expect(parseSalario(entrada as string | null)).toBe(
      esperado as number | null,
    );
  });

  test("faixa vira o piso — é o que se recebe pra começar", () => {
    expect(parseSalario("R$ 2.200,00 a R$ 5.000,00")).toBe(2200);
  });

  test("benefício depois do · não pode virar o salário", () => {
    // `enrich` grava "<valor> · <benefícios>"; lendo a string toda, o mínimo
    // entre 2.500 e o VR de 1.000 virava "o salário" da vaga.
    expect(parseSalario("R$ 2.500 · VR 1.000,00, cesta básica")).toBe(2500);
    expect(parseSalario("R$ 1.900 · VT, VR 900,00")).toBe(1900);
  });

  test("salário no fim da frase, seguido de ponto", () => {
    // O limite à direita rejeitava o ponto final e o valor sumia do raio-X.
    expect(parseSalario("Salário de R$ 1.900.")).toBe(1900);
    expect(parseSalario("R$ 1.900. Benefícios: VT")).toBe(1900);
    expect(parseSalario("R$ 1900.")).toBe(1900);
  });

  test("código longo de vaga continua não sendo salário", () => {
    expect(parseSalario("vaga 12258307")).toBe(null);
    expect(parseSalario("R$ 999.999,00")).toBe(null);
  });
});

describe("cargoBase", () => {
  test("tira senioridade, código, cidade e ligação", () => {
    expect(cargoBase("Consultor de Vendas Jr - Franca")).toBe(
      "consultor vendas",
    );
    expect(cargoBase("1012 - Consultor De Vendas")).toBe("consultor vendas");
  });

  test("mesma profissão escrita de dois jeitos conta como uma", () => {
    // Rankeava "atendente de restaurante" (19) e "atendente restaurante x"
    // (18) como profissões diferentes — era a mesma vaga do McDonald's.
    expect(cargoBase("ATENDENTE RESTAURANTE 6X1")).toBe(
      cargoBase("Atendente de Restaurante"),
    );
  });

  test("filial não entra na profissão, nem com parêntese truncado", () => {
    // A Gupy publica uma vaga por loja e corta o parêntese no meio.
    const esperado = cargoBase("Atendente de Restaurante");
    expect(cargoBase("ATENDENTE DE RESTAURANTE ( SAO JOSE")).toBe(esperado);
    expect(cargoBase("ATENDENTE DE RESTAURANTE ( JARDIM LIMA")).toBe(esperado);
    expect(cargoBase("Atendente de Restaurante - Estação Franca")).toBe(
      esperado,
    );
  });

  test("qualificador de gênero não vira palavra do cargo", () => {
    expect(cargoBase("Consultor(a) Óptico(a)")).toBe("consultor óptico");
  });

  test("agrupa variações do mesmo cargo", () => {
    expect(cargoBase("Auxiliar de Produção I")).toBe(
      cargoBase("AUXILIAR DE PRODUÇÃO"),
    );
  });
});

describe("região", () => {
  test("Franca primeiro, vizinha depois, resto fora", () => {
    expect(cityRank("Franca")).toBe(0);
    expect(cityRank("Franca - SP")).toBe(0);
    expect(cityRank("Batatais")).toBe(1);
    expect(cityRank("São Paulo")).toBe(2);
    // Armadilha documentada no README: Franco da Rocha não é Franca.
    expect(cityRank("Franco da Rocha")).toBe(2);
  });

  test("cidade ausente não descarta a vaga", () => {
    expect(inRegion(null)).toBe(true);
  });

  test("acento não muda o resultado", () => {
    expect(cityRank("Itirapua")).toBe(cityRank("Itirapuã"));
  });
});

describe("split de mensagem", () => {
  test("texto curto sai inteiro", () => {
    expect(split("oi", 100)).toEqual(["oi"]);
  });

  test("nenhum pedaço passa do limite", () => {
    const texto = Array.from({ length: 200 }, (_, i) => `linha ${i}`).join(
      "\n",
    );
    for (const p of split(texto, 300))
      expect(p.length).toBeLessThanOrEqual(300);
  });

  test("linha maior que o limite é cortada, não estourada", () => {
    // Antes ia inteira e o Telegram devolvia 400 — a mensagem sumia.
    for (const p of split("x".repeat(5000), 1000))
      expect(p.length).toBeLessThanOrEqual(1000);
  });

  test("não perde conteúdo", () => {
    const texto = Array.from({ length: 50 }, (_, i) => `linha ${i}`).join("\n");
    expect(split(texto, 120).join("\n").replace(/\s+/g, " ")).toBe(
      texto.replace(/\s+/g, " "),
    );
  });
});
