import { describe, expect, it } from "bun:test";
import { extractJobFromHtml, parseJobPosting } from "../src/sources/comum.ts";

describe("extractJobFromHtml", () => {
  it("extrai vaga e descrição limpa via Readability do digest-kit quando não há JobPosting", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Auxiliar Administrativo - Franca SP</title></head>
        <body>
          <header><nav><a href="/">Início</a><a href="/login">Área da Empresa</a></nav></header>
          <main>
            <article>
              <h1>Auxiliar Administrativo</h1>
              <p>Estamos contratando auxiliar administrativo para emissão de notas fiscais, atendimento telefônico e controle de planilhas.</p>
              <p>Requisitos: ensino médio completo e experiência prévia na área administrativa em Franca.</p>
            </article>
          </main>
          <footer>Todos os direitos reservados - Mural de Vagas</footer>
        </body>
      </html>
    `;

    const job = extractJobFromHtml(html);
    expect(job).not.toBeNull();
    expect(job?.title).toContain("Auxiliar Administrativo");
    expect(job?.description).toContain("emissão de notas fiscais");
    expect(job?.description).toContain("ensino médio completo");
    expect(job?.description).not.toContain("Área da Empresa");
    expect(job?.description).not.toContain("Mural de Vagas");
  });

  it("parseJobPosting utiliza extractJobFromHtml como fallback resiliente", () => {
    const htmlSemJsonLd = `
      <html>
        <body>
          <article>
            <h1>Vendedora Interna</h1>
            <p>Vaga para vendedora interna em loja de calçados no centro de Franca. Salário fixo mais comissões.</p>
          </article>
        </body>
      </html>
    `;

    const parsed = parseJobPosting(htmlSemJsonLd);
    expect(parsed).not.toBeNull();
    expect(parsed?.description).toContain("Vendedora Interna");
    expect(parsed?.description).toContain("loja de calçados");
  });
});
