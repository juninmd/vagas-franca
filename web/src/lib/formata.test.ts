import { describe, expect, test } from "bun:test";
import {
  dataBr,
  diasDesde,
  reais,
  rotuloIdade,
  rotuloPrazo,
} from "./formata.ts";

const HOJE = "2026-10-30";

describe("diasDesde", () => {
  test("passado, hoje e futuro", () => {
    expect(diasDesde("2026-10-27", HOJE)).toBe(3);
    expect(diasDesde(HOJE, HOJE)).toBe(0);
    expect(diasDesde("2026-11-02", HOJE)).toBe(-3);
  });

  test("aceita data com hora e atravessa virada de mês", () => {
    expect(diasDesde("2026-09-30T23:59:00Z", HOJE)).toBe(30);
  });
});

describe("rotuloIdade", () => {
  test.each([
    ["2026-10-30", "hoje"],
    ["2026-10-29", "ontem"],
    ["2026-10-25", "há 5 dias"],
    ["2026-10-02", "há 4 semanas"],
    ["2026-07-01", "há 4 meses"],
  ])("%s → %s", (iso, esperado) => {
    expect(rotuloIdade(iso, HOJE)).toBe(esperado);
  });

  test("sem data não rotula", () => {
    expect(rotuloIdade(null, HOJE)).toBeNull();
  });
});

describe("rotuloPrazo", () => {
  test("hoje, amanhã e dias; urgente até 7", () => {
    expect(rotuloPrazo("2026-10-30", HOJE)).toEqual({
      texto: "encerra hoje",
      urgente: true,
    });
    expect(rotuloPrazo("2026-10-31", HOJE)).toEqual({
      texto: "encerra amanhã",
      urgente: true,
    });
    expect(rotuloPrazo("2026-11-06", HOJE)).toEqual({
      texto: "encerra em 7 dias",
      urgente: true,
    });
    expect(rotuloPrazo("2026-11-27", HOJE)).toEqual({
      texto: "encerra em 28 dias",
      urgente: false,
    });
  });

  test("prazo vencido ou ausente some", () => {
    expect(rotuloPrazo("2026-10-29", HOJE)).toBeNull();
    expect(rotuloPrazo(null, HOJE)).toBeNull();
  });
});

describe("formatação", () => {
  test("reais sem centavos", () => {
    expect(reais(2114)).toMatch(/R\$\s?2\.114/);
  });

  test("data brasileira", () => {
    expect(dataBr("2026-10-30")).toBe("30/10/2026");
    expect(dataBr("2026-10-30T10:00:00Z")).toBe("30/10/2026");
    expect(dataBr(null)).toBeNull();
    expect(dataBr("lixo")).toBeNull();
  });
});
