import { describe, expect, test } from "bun:test";
import { num } from "../src/config/env.ts";

describe("num", () => {
  test("usa o padrão quando a variável não existe ou está vazia", () => {
    expect(num(undefined, 20)).toBe(20);
    expect(num("", 20)).toBe(20);
  });

  test("lê um número válido, inclusive 0", () => {
    expect(num("30", 20)).toBe(30);
    expect(num("0", 20)).toBe(0);
  });

  // NaN chegava a `slice(0, NaN)` (feed vazio) e a `AbortSignal.timeout(NaN)` (TypeError).
  test("valor inválido cai no padrão em vez de virar NaN", () => {
    expect(num("20abc", 20)).toBe(20);
    expect(num("sessenta", 60)).toBe(60);
    expect(num("-1", 21)).toBe(21);
  });
});
