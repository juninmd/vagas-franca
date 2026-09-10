/**
 * Conferência do que a IA extrai da descrição da vaga — a fronteira de
 * confiança do projeto.
 *
 * Duas ameaças, não uma:
 *
 * 1. **Alucinação.** O modelo pequeno inventa valor com frequência.
 * 2. **Injeção.** A descrição é escrita por terceiro (o mural da ACIF é campo
 *    livre), então o atacante controla a ENTRADA do modelo *e* o texto contra
 *    o qual a conferência compara. Exigir que o valor "apareça na descrição"
 *    barra a alucinação, mas não barra quem plantou a frase de propósito.
 *
 * Por isso cada campo tem duas amarras independentes:
 *
 * | Campo | Forma | Ancoragem |
 * |---|---|---|
 * | salário | gramática fechada (`FORMA_SALARIO`) | todo número existe na descrição |
 * | jornada | **toda palavra** no léxico de jornada | todo número existe na descrição |
 * | benefício | **toda palavra** no léxico de benefício | o item existe na descrição |
 *
 * A amarra de forma é por PALAVRA, não por substring. Testar substring foi o
 * erro que deixou `va` (de "vale") aprovar "vagas 16 99999 0000": um léxico
 * checado por `includes` não é um léxico, é um prefixo. Só um vocabulário
 * fechado, palavra a palavra, impede que sobre espaço livre no meio do campo.
 *
 * Módulo puro e sem dependência: `enrich.ts` importa `db.ts`, que abre o banco
 * no carregamento do módulo, e uma fronteira de confiança que não dá pra testar
 * sem abrir banco não é testada.
 */

const LIXO = /^(null|n\/a|não informado)$/i;

/** Acento, caixa e pontuação fora: "vale-transporte" e "Vale Transporte" iguais. */
export const normaliza = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const palavras = (s: string) => normaliza(s).split(" ").filter(Boolean);

const conjunto = (...listas: string[][]) => new Set(listas.flat());

/**
 * Números como TOKEN, não como fluxo de dígitos. Comparar `digitos(valor)`
 * contra `digitos(texto)` colidia com qualquer descrição: "44h ... 8h ... 1h
 * ... código 500" validava "R$ 4.481" e "R$ 1.500" ao mesmo tempo. Como o
 * índice da vaga no lote é escolhido pelo próprio modelo, essa colisão deixava
 * uma descrição hostil fabricar salário na vaga de OUTRA empresa — e o valor
 * ainda entrava na mediana e na tabela `snapshots`, onde fica depois da vaga
 * sumir.
 */
const numerosDe = (s: string): Set<string> => {
  const set = new Set<string>();
  for (const m of s.matchAll(/\d[\d.,]*/g)) {
    const n = (m[0] as string)
      .replace(/[.,]+$/, "")
      .replace(/\./g, "")
      .replace(/,\d{2}$/, "")
      .replace(/,/g, "");
    if (n) set.add(n);
  }
  return set;
};

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{2,6}(?:,\d{2})?`;

/** Salário publicável tem forma fechada: valor, ou faixa, com unidade opcional. */
const FORMA_SALARIO = new RegExp(
  `^(?:a partir de\\s+|sal[áa]rio:?\\s+|remunera[çc][ãa]o:?\\s+)?` +
    `r?\\$?\\s*(?:${NUM})(?:\\s*(?:a|até|-|–)\\s*r?\\$?\\s*(?:${NUM}))?` +
    `(?:\\s*(?:por|ao|\\/)\\s*(?:m[êe]s|hora|dia|semana)|\\s*mensa(?:l|is)|\\s*l[íi]quidos?)?$`,
  "i",
);

/**
 * Salário: forma fechada E todo número dele presente na descrição.
 *
 * A forma fechada é o que impede o campo de virar espaço livre: antes, o valor
 * voltava cru com `slice(0, 80)`, e "R$ 1.500 CHAME NO ZAP vagas-franca.com/x"
 * era publicado inteiro na linha do 💰.
 */
export function confere(
  valor: string | null | undefined,
  texto: string,
): string | null {
  if (!valor) return null;
  const v = valor.trim().replace(/\s+/g, " ");
  // Corta por rejeição, não por `slice`: truncar um valor bem-formado publicava
  // "R$ 1.500.000,00 a R$ 2.000.000,00 por se".
  if (!v || v.length > 44 || LIXO.test(v) || !FORMA_SALARIO.test(v))
    return null;
  const nosTexto = numerosDe(texto);
  const nosValor = [...numerosDe(v)];
  if (!nosValor.length || !nosValor.every((n) => nosTexto.has(n))) return null;
  return v;
}

/** Léxico de jornada: dia da semana, unidade de tempo e ligação. Nada mais. */
const DIAS = [
  "seg",
  "segunda",
  "ter",
  "terca",
  "qua",
  "quarta",
  "qui",
  "quinta",
  "sex",
  "sexta",
  "sab",
  "sabado",
  "sabados",
  "dom",
  "domingo",
  "domingos",
  "segundas",
  "tercas",
  "quartas",
  "quintas",
  "sextas",
  "feira",
  "feiras",
  "uteis",
  "util",
  "final",
  "finais",
  "semana",
  "fim",
  "fins",
];
const TEMPO = [
  "h",
  "hs",
  "hora",
  "horas",
  "horario",
  "min",
  "minutos",
  "escala",
  "jornada",
  "turno",
  "turnos",
  "noturno",
  "diurno",
  "matutino",
  "vespertino",
  "comercial",
  "integral",
  "parcial",
  "semanais",
  "semanal",
  "mensais",
  "intervalo",
  "folga",
  "folgas",
  "revezamento",
];
const LIGACAO = [
  "a",
  "as",
  "ate",
  "das",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "aos",
  "com",
  "por",
  "ou",
  "x",
];
const LEXICO_JORNADA = conjunto(DIAS, TEMPO, LIGACAO);

const TEM_HORARIO = /\d{1,2}\s*[h:]|\d+x\d+|\d{2,3}\s*h(oras)?\b|escala/i;

/**
 * Jornada: toda palavra tem que estar no léxico e todo número tem que existir
 * na descrição.
 *
 * O alfabeto anterior era `[\p{L}\d\s:xh,\-–/]` — "qualquer letra Unicode" não
 * é alfabeto de jornada, é prosa sem pontuação, e passava
 * "18h as 22h ligue 16 99999 0000 Ana" inteiro pra linha do 🕑. Como o número
 * também é ancorado, o telefone não sobrevive nem se a palavra sobrevivesse.
 */
export function confereJornada(
  valor: string | null | undefined,
  texto: string,
): string | null {
  if (!valor) return null;
  const v = valor.trim().replace(/\s+/g, " ");
  if (!v || v.length > 60 || LIXO.test(v) || !TEM_HORARIO.test(v)) return null;
  for (const p of palavras(v)) {
    // Token numérico ("6x1", "07", "44") é validado pela ancoragem abaixo.
    if (/^\d/.test(p)) continue;
    if (!LEXICO_JORNADA.has(p)) return null;
  }
  const nosTexto = numerosDe(texto);
  if (![...numerosDe(v)].every((n) => nosTexto.has(n))) return null;
  return v;
}

/**
 * Léxico de benefício no mercado brasileiro, palavra a palavra. É fechado de
 * propósito: sem ele, a ancoragem no texto não vale nada, porque quem escreve
 * a descrição planta a frase e o modelo a copia.
 */
const BENEFICIO = [
  "vale",
  "vales",
  "vt",
  "vr",
  "va",
  "vale transporte",
  "transporte",
  "fretado",
  "alimentacao",
  "refeicao",
  "cesta",
  "basica",
  "ticket",
  "cartao",
  "plano",
  "convenio",
  "assistencia",
  "medica",
  "medico",
  "saude",
  "odontologico",
  "odonto",
  "dental",
  "seguro",
  "vida",
  "gympass",
  "totalpass",
  "academia",
  "creche",
  "auxilio",
  "ajuda",
  "custo",
  "comissao",
  "comissoes",
  "bonificacao",
  "bonificacoes",
  "bonus",
  "premiacao",
  "premiacoes",
  "participacao",
  "lucros",
  "resultados",
  "plr",
  "uniforme",
  "uniformes",
  "estacionamento",
  "desconto",
  "descontos",
  "farmacia",
  "psicologico",
  "treinamento",
  "capacitacao",
  "carreira",
  "day",
  "off",
  "folga",
  "cafe",
  "manha",
  "refeitorio",
  "restaurante",
  "combustivel",
  "moradia",
  "aniversario",
];
/** Palavra que não é benefício sozinha, mas liga dois que são. */
const COLA = ["de", "da", "do", "e", "no", "na", "em", "com", "mais", "r"];
const LEXICO_BENEFICIO = conjunto(BENEFICIO, COLA);
const NUCLEO_BENEFICIO = new Set(BENEFICIO);

/**
 * Benefício: toda palavra no léxico, pelo menos uma delas sendo benefício de
 * verdade (não só cola), e o item inteiro presente na descrição.
 *
 * Passam no máximo 3 itens de 32 caracteres — o orçamento existe pra que a
 * linha do 💰 não vire parágrafo nem com o modelo colaborando com quem
 * escreveu a descrição. O texto devolvido é o ORIGINAL do item, com acento:
 * a normalização serve pra comparar, não pra publicar.
 */
export function confereBeneficios(
  valor: string | null | undefined,
  texto: string,
): string | null {
  if (!valor) return null;
  const fonte = normaliza(texto);
  const itens: string[] = [];
  for (const bruto of valor.split(/[,;/|+]|\se\s/)) {
    // Parêntese sai: a lista costuma ser cortada no meio de um ("Ticket
    // Alimentação (R$ 680") e o par aberto sem fechar fica feio na linha.
    const item = bruto
      .replace(/[()]/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[:;.\-–]+$/, "");
    if (!item || item.length > 32) continue;
    const ps = palavras(item);
    if (!ps.length || ps.length > 5) continue;
    // Número curto passa ("vale de 500"); corrida longa de dígitos é telefone.
    if (!ps.every((p) => LEXICO_BENEFICIO.has(p) || /^\d{1,3}$/.test(p)))
      continue;
    if (!ps.some((p) => NUCLEO_BENEFICIO.has(p))) continue;
    if (!fonte.includes(normaliza(item))) continue;
    itens.push(item);
    if (itens.length === 3) break;
  }
  return itens.length ? itens.join(", ") : null;
}
