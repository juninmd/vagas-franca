import { describe, expect, test } from "bun:test";
import { confere, confereBeneficios, confereJornada } from "../src/confere.ts";

/**
 * A descrição da vaga é escrita por terceiro e entra num prompt: o modelo lê
 * texto de fora e a saída dele vai direto pro post diário. Estes testes são
 * sobre o que NÃO pode passar.
 *
 * O detalhe que define o desenho: o atacante controla a descrição, então
 * controla a entrada do modelo E o texto contra o qual a conferência compara.
 * Exigir "aparece na descrição" barra alucinação, não barra injeção — quem
 * segura injeção é a amarra de FORMATO de cada campo.
 */

const TEXTO =
  "Vaga para auxiliar. Salário de R$ 1.900,00 por mês. Oferecemos vale-transporte, " +
  "vale refeição e cesta básica. Escala 6x1, das 08h às 17h.";

describe("confere (salário)", () => {
  test("valor presente na descrição passa", () => {
    expect(confere("R$ 1.900,00", TEXTO)).toBe("R$ 1.900,00");
    expect(confere("R$ 1.900", TEXTO)).toBe("R$ 1.900");
  });

  test("valor que não está no texto é descartado, não corrigido", () => {
    expect(confere("R$ 3.500,00", TEXTO)).toBe(null);
  });

  test("resposta vazia do modelo não vira salário", () => {
    expect(confere("não informado", TEXTO)).toBe(null);
    expect(confere(null, TEXTO)).toBe(null);
    expect(confere("a combinar", TEXTO)).toBe(null);
  });

  test("número tem que bater como TOKEN, não como fluxo de dígitos", () => {
    // Comparar dígito a dígito colidia com qualquer descrição: aqui o fluxo é
    // "448181500" e continha "4481", "1500" e "8181" ao mesmo tempo. Como o
    // índice da vaga no lote é escolhido pelo modelo, uma descrição hostil
    // fabricava salário na vaga de OUTRA empresa — e o valor ia pra mediana e
    // pra tabela `snapshots`, onde fica depois da vaga ser podada.
    const outra =
      "Jornada 44h semanais, das 8h as 18h, intervalo 1h. Codigo 500 da filial.";
    expect(confere("R$ 4.481", outra)).toBe(null);
    expect(confere("R$ 8.181,50", outra)).toBe(null);
    expect(confere("R$ 1.500", outra)).toBe(null);
    expect(confere("R$ 18.150", outra)).toBe(null);
  });

  test("salário não é campo de texto livre", () => {
    // O valor voltava cru com `slice(0, 80)`: bastava o modelo copiar a frase
    // plantada na descrição pra ela ser publicada na linha do 💰.
    const golpe =
      "Vaga de auxiliar. Salario R$ 1.900 CHAME NO ZAP vagas-franca.com/x agora.";
    expect(
      confere("R$ 1.900 CHAME NO ZAP vagas-franca.com/x agora", golpe),
    ).toBe(null);
    expect(confere("R$ 1.900", golpe)).toBe("R$ 1.900");
  });

  test("faixa e unidade continuam passando", () => {
    const t = "Salário de R$ 1.500,00 a R$ 2.000,00 por mês.";
    expect(confere("R$ 1.500,00 a R$ 2.000,00 por mês", t)).toBe(
      "R$ 1.500,00 a R$ 2.000,00 por mês",
    );
  });
});

describe("confereJornada", () => {
  test("jornada citada no texto passa", () => {
    expect(confereJornada("Escala 6x1", TEXTO)).toBe("Escala 6x1");
  });

  test("frase sem marca de horário não é jornada", () => {
    expect(confereJornada("ambiente descontraído", TEXTO)).toBe(null);
  });

  test("jornada também não é campo de texto livre", () => {
    // Mesma forma do furo do salário: a marca de horário provava que existia
    // UM horário, e os outros ~70 caracteres iam livres pra linha do 🕑.
    const golpe = "Escala 6x1. Candidate-se em https://mau.example/x agora.";
    expect(
      confereJornada(
        "escala 6x1 -- candidate-se em https://mau.example/x",
        golpe,
      ),
    ).toBe(null);
    expect(confereJornada("escala 6x1", golpe)).toBe("escala 6x1");
  });
});

describe("confereBeneficios", () => {
  test("benefício citado passa, normalizado", () => {
    // O texto devolvido é o ORIGINAL do item: a normalização serve pra
    // comparar com a descrição, não pra publicar sem acento no post.
    expect(confereBeneficios("Vale-transporte, cesta básica", TEXTO)).toBe(
      "Vale-transporte, cesta básica",
    );
  });

  test("benefício inventado pelo modelo não entra no post", () => {
    // O gemma3 completa a lista com o que é comum, não com o que está escrito.
    expect(confereBeneficios("plano de saúde, gympass", TEXTO)).toBe(null);
  });

  test("mistura: só o que está na descrição sobrevive", () => {
    expect(confereBeneficios("cesta básica, plano odontológico", TEXTO)).toBe(
      "cesta básica",
    );
  });

  test("frase plantada na descrição não vira benefício", () => {
    // ESTE é o caminho que a ancoragem sozinha não fecha: a frase ESTÁ na
    // descrição, porque foi o atacante que a escreveu lá. Sem vocabulário
    // fechado, saía impressa na linha do 💰 de um anúncio de aparência real.
    const golpe =
      "Auxiliar. Salario R$ 1.900. Chame no zap 16 99999 0000. Oferecemos VT.";
    expect(confereBeneficios("chame no zap 16 99999 0000", golpe)).toBe(null);
    expect(
      confereBeneficios("CLIQUE AQUI, chame no zap 16 99999 0000, VT", golpe),
    ).toBe("VT");
  });

  test("endereço não é benefício, com ou sem barra no fim", () => {
    const t = "Oferecemos VT. Acesse vagas-franca.com e mau.example/x.";
    expect(confereBeneficios("vagas-franca.com", t)).toBe(null);
    expect(confereBeneficios("mau.example/x", t)).toBe(null);
    expect(confereBeneficios("http://mau.example", t)).toBe(null);
  });

  test("no máximo 3 itens: a linha do post não vira parágrafo", () => {
    const texto =
      "Oferecemos vale transporte, vale refeicao, cesta basica, plano de saude, seguro de vida e gympass.";
    const saida = confereBeneficios(
      "vale transporte, vale refeicao, cesta basica, plano de saude, seguro de vida, gympass",
      texto,
    ) as string;
    expect(saida.split(", ").length).toBe(3);
  });

  test("nada a conferir devolve null", () => {
    expect(confereBeneficios(null, TEXTO)).toBe(null);
    expect(confereBeneficios("", TEXTO)).toBe(null);
  });

  test("léxico é por PALAVRA, não por substring", () => {
    // O léxico já foi um regex `\b(vale|vt|va|…)` sem fronteira de fechamento:
    // o ramo `va` aprovava "vagas", que é das palavras mais comuns do idioma.
    // Bastava plantar a frase na descrição e todo o resto do item ia junto.
    const golpe =
      "Auxiliar. Oferecemos VT. Vagas 16 99999 0000. Chame Ana 16 99999 0000 vale muito. www exemplo com";
    for (const payload of [
      "Vagas 16 99999 0000",
      "Ana 16 99999 0000 vale",
      "VT www exemplo com",
      "vagas whats 16 991234567",
      "vale muito",
    ])
      expect(confereBeneficios(payload, golpe)).toBe(null);
    // E o benefício de verdade da mesma descrição continua passando.
    expect(confereBeneficios("VT", golpe)).toBe("VT");
  });

  test("benefícios reais do mercado não são rejeitados", () => {
    const t =
      "Oferecemos vale transporte, vale refeição, cesta básica, plano de saúde e odontológico, assistência médica, PLR, café da manhã, transporte fretado, vale alimentação de R$ 500.";
    for (const [entrada, esperado] of [
      ["assistência médica, PLR", "assistência médica, PLR"],
      [
        "café da manhã, transporte fretado",
        "café da manhã, transporte fretado",
      ],
      ["vale alimentação de R$ 500", "vale alimentação de R$ 500"],
    ] as [string, string][])
      expect(confereBeneficios(entrada, t)).toBe(esperado);
  });
});

describe("confereJornada — palavra a palavra", () => {
  const desc =
    "Jornada de 44h semanais. Escala 6x1, das 08h às 17h. Seg a Sex. Envie curriculo.";

  test("prosa com telefone não passa, mesmo com marca de horário", () => {
    // O alfabeto era `\p{L}` — "qualquer letra Unicode" é prosa, não jornada.
    for (const payload of [
      "18h as 22h ligue 16 99999 0000 Ana",
      "8h chame 16 99999 0000 falar com Ana Paula",
      "acesse vagasfranca com br 8h",
    ])
      expect(confereJornada(payload, desc)).toBe(null);
  });

  test("jornada não ancorada na descrição é alucinação, não extração", () => {
    // Horário que não está no texto: o modelo completou com o que é comum.
    expect(
      confereJornada(
        "Seg a Sex das 07:00 as 19:00",
        "Jornada de 44h semanais.",
      ),
    ).toBe(null);
  });

  test("formatos reais de jornada continuam passando", () => {
    for (const v of [
      "Escala 6x1",
      "Escala 6x1 - folga aos domingos",
      "44h semanais",
      "Seg a Sex 08h às 17h",
    ])
      expect(confereJornada(v, `${desc} folga aos domingos`)).toBe(v);

    // O ponto é removido, não rejeitado: é ele que faz o cliente do Telegram
    // transformar `vale-cesta-basica.com` em link clicável.
    expect(confereJornada("Seg. a Sex. 08h às 17h", desc)).toBe(
      "Seg a Sex 08h às 17h",
    );
  });

  test("número que não é horário não passa, mesmo só com dígitos", () => {
    // O léxico só olha palavra; a carga aqui não tem NENHUMA palavra fora do
    // léxico — o que a barra é a forma do número. Sem essa regra, um telefone
    // de recrutador viajava na linha da jornada, e a âncora não ajuda: o
    // atacante escreveu a descrição, então o número está lá.
    const desc =
      "Turno das 18h as 22h. Duvidas com o RH pelo 16 99999 0000 ou 0800 771 1234.";
    for (const v of [
      "18h as 22h 16 99999 0000",
      "18h as 22h ☎ 16999990000",
      "das 18h as 22h 0800 771 1234",
      "18h as 22h 16999990000",
    ])
      expect(confereJornada(v, desc)).toBe(null);

    // E a jornada legítima da MESMA descrição continua passando.
    expect(confereJornada("18h as 22h", desc)).toBe("18h as 22h");
  });

  test("benefício com dígitos de telefone não passa", () => {
    const desc = "Vale alimentacao. Contato 16 999 990 000.";
    expect(confereBeneficios("vale 16 999 990 000", desc)).toBe(null);
    expect(confereBeneficios("vale alimentacao", desc)).toBe(
      "vale alimentacao",
    );
  });
});

describe("beneficios: ruido de corte", () => {
  test("conjuncao pendurada nao vai pro post", () => {
    const desc = "Oferecemos Vale-Transporte e, Vale-Refeicao, Alimentacao.";
    expect(confereBeneficios("Vale-Transporte e, Vale-Refeicao", desc)).toBe(
      "Vale-Transporte, Vale-Refeicao",
    );
  });
});
