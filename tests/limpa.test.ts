import { describe, expect, it } from "bun:test";
import { limpa } from "../src/sources/comum.ts";

describe("limpa", () => {
  it("decodifica acentos e aspas escritos como entidade", () => {
    expect(limpa("Auxiliar de Produ&ccedil;&atilde;o &#39;noturno&#39;")).toBe(
      "Auxiliar de Produção 'noturno'",
    );
  });

  it("decodifica entidades numéricas fora do plano básico sem corromper", () => {
    expect(limpa("Vaga &#128512; &#x1F600;")).toBe("Vaga 😀 😀");
  });

  it("não decodifica duas vezes (&amp;lt; fica literal)", () => {
    expect(limpa("R&amp;D &amp;lt;b&amp;gt;")).toBe("R&D &lt;b&gt;");
  });

  it("mantém entidade desconhecida ou inválida como veio", () => {
    expect(limpa("&foo; &#99999999;")).toBe("&foo; &#99999999;");
  });

  it("segue removendo tags, svg e espaço extra", () => {
    expect(limpa("<p>Vendedor</p> <svg><path/></svg>&nbsp; Franca")).toBe(
      "Vendedor Franca",
    );
  });
});
