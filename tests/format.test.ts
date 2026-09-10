import { describe, expect, test } from "bun:test";
import {
  cargoBase,
  contatoSeguro,
  ehCadastroDeCurriculo,
  ehPcd,
  formataSalario,
  limpaTitulo,
  linkSeguro,
  mdSafe,
  prazo,
} from "../src/format.ts";

describe("limpaTitulo", () => {
  const casos: [string, string][] = [
    [
      "|LOJAS RENNER| Assistente de Loja - Franca Shopping - Franca SP",
      "Assistente de Loja - Franca Shopping",
    ],
    ["1012 - Consultor De Vendas", "Consultor De Vendas"],
    ["Vaga - Inspetor de Alunos", "Inspetor de Alunos"],
    ["AJUDANTE DE ENTREGAS - FRAN", "AJUDANTE DE ENTREGAS"],
    ["Ajudante de Armazém Noturno - Franca/SP", "Ajudante de Armazém Noturno"],
    ["Operador de Telemarketing | Franca/SP", "Operador de Telemarketing"],
    [
      "Atendente (Vaga exclusiva para PcD) - Petz Franca",
      "Atendente - Petz Franca",
    ],
    [
      "Assistente de Atendimento - Vaga afirmativa para PcD / Franca/SP",
      "Assistente de Atendimento",
    ],
    [
      "ATENDENTE DE CALL CENTER (EXCLUSIVO PARA PCD)",
      "ATENDENTE DE CALL CENTER",
    ],
    ["DESIGNER GRÁFICO - Franca - SP", "DESIGNER GRÁFICO"],
    ["Analista Contábil", "Analista Contábil"],
  ];
  for (const [entrada, esperado] of casos)
    test(`"${entrada}"`, () => expect(limpaTitulo(entrada)).toBe(esperado));

  test("menção seca de PcD sai do título (o selo ♿ a substitui)", () => {
    expect(limpaTitulo("Auxiliar Comercial Pessoa com Deficiência")).toBe(
      "Auxiliar Comercial",
    );
    expect(limpaTitulo("AUXILIAR COMERCIAL (PESSOA COM DEFICIÊNCIA)")).toBe(
      "AUXILIAR COMERCIAL",
    );
  });

  test("tirar o aviso de PcD não pode comer letra da profissão", () => {
    // O ramo `a\s+` da regra do aviso casava o "a" final da palavra anterior:
    // toda vaga cujo cargo termina em "a" — a maioria no feminino — saía
    // truncada no post e ainda quebrava a contagem de profissões.
    expect(limpaTitulo("Motorista PCD")).toBe("Motorista");
    expect(limpaTitulo("Vendedora PCD")).toBe("Vendedora");
    expect(limpaTitulo("Auxiliar de Limpeza PCD")).toBe("Auxiliar de Limpeza");
    expect(limpaTitulo("ATENDENTE PCD")).toBe("ATENDENTE");
  });

  test("o aviso não precisa estar no fim, só fechar um trecho", () => {
    // Os dois títulos são do banco real. Exigir fim de string deixava o aviso
    // no título E o selo ♿ na linha — os dois ruídos ao mesmo tempo.
    expect(
      limpaTitulo("Auxiliar Comercial Pessoa com Deficiência - Filial Franca"),
    ).toBe("Auxiliar Comercial - Filial Franca");
    expect(
      limpaTitulo(
        "AUXILIAR COMERCIAL (PESSOA COM DEFICIÊNCIA) - FILIAL FRANCA",
      ),
    ).toBe("AUXILIAR COMERCIAL - FILIAL FRANCA");
  });

  test("PcD como público atendido fica: ali é a profissão, não o aviso", () => {
    // Depois de preposição a expressão diz QUEM a pessoa atende. Removê-la
    // deixava "Cuidador de" — título sem profissão e sem classificação.
    expect(limpaTitulo("Cuidador de Pessoa com Deficiência")).toBe(
      "Cuidador de Pessoa com Deficiência",
    );
    expect(limpaTitulo("Analista de Inclusão de Pessoas com Deficiência")).toBe(
      "Analista de Inclusão de Pessoas com Deficiência",
    );
    expect(
      limpaTitulo("Professor de Libras para Pessoas com Deficiência"),
    ).toBe("Professor de Libras para Pessoas com Deficiência");
  });

  test("aviso no meio do título não come o espaço do separador", () => {
    // O separador re-emitido perdia o espaço à esquerda: "Analista de Dados-
    // Home Office" ia pro post E quebrava `cargoBase`, que precisa de espaço
    // dos dois lados pra cortar — a profissão virava "analista dados home".
    expect(limpaTitulo("Auxiliar Administrativo - PCD - Matriz")).toBe(
      "Auxiliar Administrativo - Matriz",
    );
    expect(limpaTitulo("Analista de Dados - PcD - Home Office")).toBe(
      "Analista de Dados - Home Office",
    );
  });

  test("título que sobra só como 'Vaga' volta ao original", () => {
    // Senão `cargoBase` grava a profissão como "vagas" no ranking.
    expect(limpaTitulo("Vagas PCD")).toBe("Vagas PCD");
    expect(cargoBase(limpaTitulo("Vaga PCD - Operador de Máquinas"))).toBe(
      "operador máquinas",
    );
  });

  test("o teto de 200 vale também pelo caminho do fallback", () => {
    // O retorno de fallback devolvia o `raw` inteiro: um título montado só de
    // `|marca|` zerava a janela de limpeza e escapava do teto com 18 mil
    // caracteres, que estouram o limite da mensagem lá no telegram.
    expect(limpaTitulo("|aaaa|".repeat(3000)).length).toBe(200);
    // E o corte não parte caractere: emoji em cima do limite virava metade de
    // par substituto, que o Telegram rejeita com 400.
    expect(limpaTitulo(`${"A".repeat(199)}😀`).endsWith("😀")).toBe(true);
  });

  test("nunca devolve vazio", () => {
    expect(limpaTitulo("|MARCA|")).toBe("|MARCA|");
  });
});

describe("formataSalario", () => {
  test.each([
    ["R$ 1.707,00 por mês", "R$ 1.707"],
    ["R$ 2.200,00 a R$ 5.000,00", "R$ 2.200 a R$ 5.000"],
    ["R$ 2.114,00", "R$ 2.114"],
    ["R$ 1.900 · VT, VR", "R$ 1.900 · VT, VR"],
    [null, null],
  ])("%s → %s", (entrada, esperado) => {
    expect(formataSalario(entrada as string | null)).toBe(
      esperado as string | null,
    );
  });
});

describe("filtros", () => {
  test("banco de talentos não é vaga", () => {
    expect(ehCadastroDeCurriculo("BANCO DE TALENTOS - EXCLUSIVO PCD")).toBe(
      true,
    );
    expect(ehCadastroDeCurriculo("Banco de Talentos Q2Bank")).toBe(true);
    expect(ehCadastroDeCurriculo("Auxiliar de Banco de Dados")).toBe(false);
    expect(ehCadastroDeCurriculo("Costureira")).toBe(false);
  });

  test("título que cita PcD é vaga afirmativa", () => {
    expect(ehPcd("Atendente (Vaga exclusiva para PcD)")).toBe(true);
    expect(ehPcd("Auxiliar Comercial Pessoa com Deficiência")).toBe(true);
    expect(ehPcd("Auxiliar de Produção")).toBe(false);
  });

  test("na descrição só conta a palavra que reserva a vaga", () => {
    expect(
      ehPcd("Assistente", "Vaga exclusiva para pessoa com deficiência"),
    ).toBe(true);
    expect(
      ehPcd("Assistente", "Vaga destinada a Pessoas com Deficiência"),
    ).toBe(true);
    // Rodapé institucional que quase toda empresa cola — não é vaga reservada.
    expect(
      ehPcd(
        "Assistente",
        "Acreditamos na diversidade. Você que é PCD, cadastre-se",
      ),
    ).toBe(false);
    expect(
      ehPcd(
        "Aprendiz",
        "Ter entre 14 e 24 anos (para pessoas com deficiência não há limite)",
      ),
    ).toBe(false);
    expect(ehPcd("Assistente", null)).toBe(false);
  });
});

describe("prazo", () => {
  test.each([
    ["2026-09-09", "encerra hoje"],
    ["2026-09-10", "encerra amanhã"],
    ["2026-09-12", "encerra em 3 dias"],
    ["2026-10-30", null],
    ["2026-09-01", null],
    ["", null],
  ])("%s → %s", (d, esperado) => {
    expect(prazo(d as string, "2026-09-09")).toBe(esperado as string | null);
  });
});

describe("linkSeguro", () => {
  test("URL normal passa intacta", () => {
    expect(
      linkSeguro("https://www.acifranca.com.br/empregos-acif#vaga-947"),
    ).toBe("https://www.acifranca.com.br/empregos-acif#vaga-947");
  });

  test("fecha a injeção de link no Markdown do Telegram", () => {
    // O `link` do mural da ACIF é campo livre da empresa. Um `)` fecha o
    // `[rótulo](url)` e o resto vira corpo da mensagem — inclusive OUTRO link,
    // dentro do post diário em que o leitor confia.
    const injecao =
      "https://real.com/x) 🚨 *ALERTA* [clique aqui](https://phish.example/roubo";
    const saida = linkSeguro(injecao) as string;
    expect(saida).not.toContain(")");
    expect(saida).toContain("%29");
    expect(saida.startsWith("https://real.com/x%29")).toBe(true);
  });

  test("parêntese legítimo é preservado por percent-encoding", () => {
    // `_` também sai codificado: sozinho ele abre itálico no Markdown legado,
    // e URL da Gupy tem `_` de rotina.
    expect(linkSeguro("https://ex.com/vaga_(nova)")).toBe(
      "https://ex.com/vaga%5F%28nova%29",
    );
  });

  test("esquema perigoso vira null", () => {
    expect(linkSeguro("javascript:alert(1)")).toBe(null);
    expect(linkSeguro("data:text/html,<script>")).toBe(null);
    expect(linkSeguro("file:///etc/passwd")).toBe(null);
  });

  test("lixo e vazio viram null", () => {
    expect(linkSeguro("nao-e-url")).toBe(null);
    expect(linkSeguro("")).toBe(null);
    expect(linkSeguro(null)).toBe(null);
  });
});

describe("mdSafe", () => {
  test("neutraliza o Markdown que quebraria a mensagem", () => {
    expect(mdSafe("Café_Bom *Ltda*")).toBe("Café\\_Bom \\*Ltda\\*");
  });

  test("barra da fonte não anula o escape (injeção de link no rótulo)", () => {
    // Sem escapar a barra primeiro, a `\` do atacante escapava a `\` que este
    // escape insere: o `]` voltava a valer, fechava o rótulo e o `(...)` logo
    // depois virava link de verdade dentro do post.
    const titulo = "Boa vaga\\](https://phish.example)";
    const saida = mdSafe(titulo);
    expect(saida).toBe("Boa vaga\\\\\\](https://phish.example)");
    // Nenhum `]` fica sem a barra imediatamente antes dele.
    expect(/(?<!\\)]/.test(saida)).toBe(false);
  });

  test("texto sem metacaractere passa intacto", () => {
    expect(mdSafe("Auxiliar de Produção — Franca/SP")).toBe(
      "Auxiliar de Produção — Franca/SP",
    );
  });
});

/**
 * `contact` vem do mural da ACIF, digitado pelo anunciante, e ia verbatim e sem
 * teto pra linha do ✉️ — a maior superfície livre do post, mais larga que tudo
 * que passa pela conferência da IA.
 */
describe("contatoSeguro", () => {
  test("e-mail com acento não pode virar OUTRO e-mail", () => {
    // `\w` sem flag `u` não casa letra acentuada: o casamento começava depois
    // do "ç" e o post publicava "o@empresa.com.br" — endereço plausível, real,
    // e errado. Quem se candidata manda currículo pro vazio.
    expect(contatoSeguro("seleção@empresa.com.br")).toBe(
      "seleção@empresa.com.br",
    );
    expect(contatoSeguro("João.Silva@empresa.com.br")).toBe(
      "João.Silva@empresa.com.br",
    );
  });

  test("formatos reais do mural passam", () => {
    expect(contatoSeguro("ralexandre.fra@gmail.com · 16992517497")).toBe(
      "ralexandre.fra@gmail.com · 16992517497",
    );
    expect(contatoSeguro("(16) 99262-2752")).toBe("(16) 99262-2752");
    expect(contatoSeguro("16 3723-0104")).toBe("16 3723-0104");
    expect(contatoSeguro("0800 771 1234")).toBe("0800 771 1234");
  });

  test("número que não é telefone não vira telefone", () => {
    // Sem borda, qualquer corrida de 8 dígitos virava "contato".
    expect(contatoSeguro("Vaga ref. 20240115 - comparecer ao PAT")).toBe(null);
    expect(contatoSeguro("CLIQUE AQUI http://mau.example/x agora")).toBe(null);
  });

  test("texto livre do anunciante não é publicado", () => {
    expect(contatoSeguro("Fale com Ana na loja, urgente!")).toBe(null);
    expect(contatoSeguro("")).toBe(null);
    expect(contatoSeguro(null)).toBe(null);
  });

  test("pontuação final não gruda no e-mail", () => {
    expect(contatoSeguro("Enviar currículo para rh@empresa.com.br.")).toBe(
      "rh@empresa.com.br",
    );
  });

  test("campo gigante não pendura o digest", () => {
    // A busca do e-mail é quadrática numa corrida longa sem `@`, e `contact`
    // não tem teto em lugar nenhum: 160 mil caracteres levavam 40s, numa
    // thread só, dentro da janela do cron.
    const t0 = Date.now();
    contatoSeguro("a".repeat(160_000));
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
