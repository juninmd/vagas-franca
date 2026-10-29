import { REGION_CITIES } from "./config/region.ts";

// Nomes de cidade são só letras e espaço — não precisam de escape de regex.
const CIDADES = REGION_CITIES.join("|");

/**
 * "Banco de talentos" é cadastro de currículo aberto, não vaga de uma
 * profissão: entra no radar como se fossem 8 oportunidades, empurra vaga real
 * pra fora do teto do digest e distorce a contagem de "quem mais contrata".
 */
export const ehCadastroDeCurriculo = (titulo: string) =>
  /banco de (talentos|curr[íi]culos)|cadastro (de )?curr|talent pool|curriculoteca/i.test(
    titulo,
  );

/** No título, citar PcD só acontece quando a vaga é reservada mesmo. */
const PCD_TITULO = /\bpcds?\b|pessoas? com defici[êe]ncia|defici[êe]ncia/i;

/**
 * Na descrição a menção sozinha não vale: quase toda empresa cola "acreditamos
 * na diversidade, você que é PCD..." no rodapé, e o selo apareceria em vaga
 * que não é reservada. Exige a palavra que reserva a vaga.
 */
const PCD_DESCRICAO =
  /vagas?\s+(exclusiv|afirmativ|destinad|reservad)\w*\s+(para|a|à|às|aos)\s+(pessoas?\s+com\s+defici|pcds?)|exclusiv\w*\s+para\s+pcds?/i;

/** Vaga afirmativa/reservada — vira selo no post em vez de ruído no título. */
export const ehPcd = (titulo: string, descricao?: string | null) =>
  PCD_TITULO.test(titulo) || PCD_DESCRICAO.test(descricao ?? "");

/**
 * Tira do título o que é do portal, não da profissão: marca entre pipes
 * (`|LOJAS RENNER| Assistente de Loja`), código interno (`1012 - Consultor`),
 * cidade repetida no fim (`- FRANCA/SP`, `- FRAN` truncado) e o aviso de PcD,
 * que vira selo próprio. Roda na ingestão: o título limpo é o que classifica,
 * deduplica e aparece no post.
 */
export function limpaTitulo(raw: string): string {
  // Teto antes das regras: `title` chega cru da fonte, sem limite de tamanho, e
  // a limpeza final de pontas é quadrática (1s num título de 20 mil caracteres).
  // Nenhum cargo real passa de 120.
  const t = corta(raw)
    .replace(/\|[^|]{2,40}\|/g, " ")
    .replace(/^\s*vagas?\s*[-–—:]\s*/i, "")
    .replace(/^\s*\d{3,6}\s*[-–—]\s*/, "")
    .replace(
      /[-–—(/|]?\s*\(?\s*(vaga\s+)?(exclusiva?|afirmativa|destinada?|reservada?)[^)|]*\b(pcd|defici[êe]ncia)\b[^)|]*\)?/gi,
      " ",
    )
    .replace(/\(\s*(pcd|exclusivo para pcd)\s*\)/gi, " ")
    // Menção seca de PcD, sem a palavra que reserva a vaga: "Auxiliar Comercial
    // Pessoa com Deficiência". Sem esta regra o título mantinha o aviso E ainda
    // ganhava o selo ♿ — o ruído que o selo existe pra substituir.
    //
    // A regra é solta o bastante pra pegar o aviso e presa o bastante pra não
    // comer profissão. Duas amarras, as duas custaram bug:
    //   1. O aviso fecha um trecho — está no começo do título, ou vem antes do
    //      fim, ou antes de outro separador ("... Pessoa com Deficiência -
    //      Filial Franca"). No meio de um trecho ele não é aviso.
    //   2. Depois de preposição a expressão diz QUEM a pessoa atende, não
    //      quem pode se candidatar: "Cuidador de Pessoa com Deficiência"
    //      perdia a profissão inteira e virava "Cuidador de". É por isso que
    //      `para` bloqueia a regra 2 mas é aceito na regra 1: depois de um
    //      separador ("- Vaga para PCD") ele faz parte do aviso, não da frase.
    // O ramo `a\s+` que existia aqui casava o "a" final da palavra anterior:
    // "Motorista PCD" saía "Motorist", e no feminino isso era quase a regra.
    //
    // O separador que fecha o trecho é capturado e devolvido: descartá-lo
    // deixava "Vendedora , Loja Centro" no post.
    .replace(
      /(?:^|\s*[-–—(/|,])\s*\(?\s*(?:vaga\s+)?(?:\bpara\s+)?(?:pessoas?\s+com\s+defici[êe]ncia|pcds?)\s*\)?(\s*[-–—(/|,]|$)/i,
      "$1",
    )
    .replace(
      /(?<!\b(?:de|da|do|das|dos|com|para|em|a|à))\s+\(?(?:pessoas?\s+com\s+defici[êe]ncia|pcds?)\)?(\s*[-–—(/|,]|$)/i,
      "$1",
    )
    // De novo, porque o aviso pode ter sido o que separava "Vaga" do cargo:
    // "Vaga PCD - Operador" deixava "Vaga - Operador", e `cargoBase` gravava a
    // profissão como "vaga" no ranking de quem mais contrata.
    .replace(/^\s*vagas?\s*[-–—:]\s*/i, "")
    // O separador re-emitido perde o espaço que vinha antes dele, porque o
    // `\s*` da regra 1 já o consumiu: "Analista de Dados- Home Office". Só
    // travessão colado à esquerda E com espaço à direita — "Franca/SP" e
    // "12x36" não têm espaço depois, então nem são tocados.
    .replace(/(\S)\s*([-–—])\s+/g, "$1 $2 ")
    .replace(
      new RegExp(
        `[-–—|/(]\\s*(em\\s+|na\\s+)?(${CIDADES})\\b(\\s*[-/,]?\\s*sp\\b)?\\s*\\)?\\s*$`,
        "i",
      ),
      " ",
    )
    .replace(/[-–—|/]\s*FRAN\s*$/i, " ")
    .replace(/\s*[-–—|/,]\s*sp\s*$/i, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|/,:]+|[\s\-–—|/,:]+$/g, "")
    .trim();
  // Se a limpeza comeu o título todo (era só a marca), ou sobrou só "Vaga" —
  // que não é profissão e envenenaria o ranking de `cargoBase` —, fica o
  // original. O corte é reaplicado aqui: sem isso o teto de 200 não valia nada,
  // porque este retorno devolvia o `raw` inteiro (um título de 18 mil
  // caracteres montado só de `|marca|` zerava a janela e escapava pelo `else`).
  const util = t.length >= 3 && !/^vagas?$/i.test(t);
  return corta(util ? t : raw.trim());
}

/**
 * Corta sem partir caractere: `slice` conta unidade UTF-16, então um emoji em
 * cima do limite vira metade de par substituto — que o Telegram rejeita com
 * 400 e derruba a formatação da área inteira naquele dia.
 */
const corta = (s: string, teto = 200) =>
  s.length <= teto ? s : [...s].slice(0, teto).join("");

/**
 * Salário para leitura humana: "R$ 1.707,00 por mês" → "R$ 1.707". Os centavos
 * são sempre ",00" nos portais e o "por mês" se repete em toda linha do post.
 * O que vem depois de " · " são os benefícios extraídos pela IA — preservados.
 */
export function formataSalario(raw: string | null): string | null {
  if (!raw) return null;
  const [valor, ...extras] = raw.split(" · ");
  const limpo = (valor ?? "")
    .replace(/(\d),00\b/g, "$1")
    .replace(/\bpor m[êe]s\b|\bmensa(l|is)\b|\/m[êe]s\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—,]\s*$/, "")
    .trim();
  return [limpo, ...extras].filter(Boolean).join(" · ") || null;
}

/**
 * Texto de fonte externa pronto pro Markdown legado do Telegram: um `_` solto
 * abre itálico e nunca fecha, e a mensagem inteira volta 400. Título, empresa
 * e área passam por aqui; URL vai sempre por `linkSeguro`.
 *
 * A barra invertida entra PRIMEIRO na classe. Sem ela, uma barra vinda da
 * fonte ficava na frente da barra que este escape insere e anulava o escape:
 * o título `vaga\](http://mau)` reabria o colchete e injetava OUTRO link no
 * post — a mesma classe de furo que `linkSeguro` fecha do lado da URL.
 */
export const mdSafe = (s: string) => s.replace(/([\\_*[\]`])/g, "\\$1");

/**
 * Contato publicável: e-mail e/ou telefone, e nada mais.
 *
 * O mural da ACIF entrega `email_empresa`/`contato_empresa` como texto livre
 * digitado pelo anunciante, e a linha do ✉️ imprimia isso verbatim e sem teto.
 * Era a maior superfície livre do post — mais larga do que tudo que passa pela
 * conferência da IA. Extrai as formas que o campo existe pra ter; o resto cai.
 */
export function contatoSeguro(raw: string | null): string | null {
  if (!raw) return null;
  // Teto na entrada: `contact` não tem limite de tamanho em lugar nenhum (a
  // `description` tem, a ACIF corta em 1500) e a busca do e-mail é quadrática
  // numa corrida longa sem `@` — 160 mil caracteres levavam 40s e o digest é
  // de uma thread só.
  const texto = raw.slice(0, 500);
  const partes: string[] = [];
  // `\w` não casa letra acentuada: em "seleção@empresa.com.br" o casamento
  // começava DEPOIS do "ç" e publicava "o@empresa.com.br" — um endereço
  // diferente, plausível, para o qual a pessoa manda currículo e ninguém
  // recebe. Errar o endereço é pior que não ter endereço.
  const email = texto.match(
    /(?<![\p{L}\p{N}._+-])[\p{L}\p{N}._+-]+@[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]{2,}/u,
  );
  if (email) partes.push(email[0].replace(/[.,;:)]+$/, "").slice(0, 60));
  // Telefone brasileiro: fixo, celular com nono dígito, ou 0800. As bordas
  // impedem que um número de protocolo ("Vaga ref. 20240115") vire telefone.
  const fone = texto.match(
    /(?<!\d)(?:0800[\s.-]?\d{3}[\s.-]?\d{4}|\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4})(?!\d)/,
  );
  if (fone) partes.push(fone[0].trim().slice(0, 20));
  return partes.length ? partes.join(" · ") : null;
}

/**
 * URL pronta pra ir dentro de `[rótulo](url)` no Markdown do Telegram.
 *
 * O `link` é entrada NÃO CONFIÁVEL: o mural da ACIF deixa a empresa preencher
 * o campo e a API da Gupy é multiempresa. No Markdown legado o parser fecha o
 * link no primeiro `)` e não há escape pra ele — um `)` no meio da URL fecha o
 * link e joga o resto no corpo da mensagem, inclusive OUTRO link, dentro do
 * post diário que o leitor confia. Percent-encoding preserva a URL e fecha isso.
 *
 * Devolve null pro que não for http(s): `javascript:`/`data:` nunca saem daqui.
 */
export function linkSeguro(raw: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // `new URL` já normaliza espaço e caractere de controle; sobra o que o
  // Markdown lê. `_` é rotina em URL da Gupy e sozinho abre itálico ou provoca
  // 400 — percent-encoding preserva a URL e não deixa nada disso vivo.
  return url.href.replace(
    /[()\\_*[\]`]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

/**
 * Converte "R$ 1.750,00 por mês", "R$ 2.200,00 a R$ 2.300,00", "R$ 1.900 + VT"
 * em número. Faixa vira o piso — é o que a pessoa recebe pra começar.
 * Ignora valor fora de 800..30000: número solto de descrição entra como salário
 * e distorce a média.
 *
 * Mora aqui, e não em `analysis.ts`, porque é função pura: `analysis.ts` importa
 * `db.ts`, que ABRE o banco no carregamento do módulo — testar o parser puxava
 * junto o banco de produção.
 */
export function parseSalario(texto: string | null): number | null {
  if (!texto) return null;
  // Só o primeiro segmento: `enrich` grava "R$ 2.500 · VR 1.000,00, cesta" e o
  // benefício de R$ 1.000 virava "o salário" (o mínimo entre os dois).
  const valor = texto.split(" · ")[0] as string;
  const valores: number[] = [];
  // Três formas, nesta ordem: com separador de milhar ("1.750,00"), sem ele
  // ("1900", "1900,00") e só centavos ("25,00", que o filtro de faixa descarta).
  // A alternativa antiga tentava `\d{1,3}` primeiro e lia "R$ 1900" como 190.
  // O limite à direita barra só um novo grupo de milhar, não um ponto final:
  // com `(?![\d.])` a frase "Salário de R$ 1.900." não casava nada.
  for (const m of valor.matchAll(
    /(?<![\d,.])(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{4,6}(?:,\d{2})?|\d{1,3},\d{2})(?!\.?\d)/g,
  )) {
    const bruto = (m[1] as string).replace(/\./g, "").replace(",", ".");
    const n = Number(bruto);
    if (Number.isFinite(n) && n >= 800 && n <= 30000) valores.push(n);
  }
  return valores.length ? Math.min(...valores) : null;
}

/** Preposição não distingue profissão e desalinha o corte de 3 palavras. */
const LIGACAO = new Set(["de", "da", "do", "das", "dos", "e", "em", "para"]);

/**
 * Normaliza o cargo pra contar profissão: tira cidade, código e senioridade.
 * O cargo vem antes do primeiro qualificador; depois dele é filial, turno ou
 * cidade. A Gupy publica uma vaga por loja e trunca o parêntese no meio
 * ("ATENDENTE DE RESTAURANTE ( SAO JOSE"), então o corte não pode depender de
 * o parêntese fechar.
 */
export function cargoBase(titulo: string): string {
  const semGenero = titulo.replace(/\(\s*(a|o|as|os)\s*\)/gi, " ");
  const cabeca = semGenero.split(/\s*\(|\s[-–—|/]\s/)[0] as string;
  // Se o corte não sobrou nada útil (título que começa por código), usa o todo.
  return palavrasDoCargo(cabeca) || palavrasDoCargo(semGenero);
}

function palavrasDoCargo(texto: string): string {
  return texto
    .replace(/\|[^|]*\|/g, " ")
    .replace(/\b(jr|j[úu]nior|pleno|pl|s[êe]nior|sr|i{1,3}|\d{3,})\b/gi, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 1 && !LIGACAO.has(p))
    .slice(0, 3)
    .join(" ");
}

/**
 * "encerra em 3 dias" a partir da data-limite da vaga (o mural da ACIF publica
 * `data_final`). Só vale a pena avisar quando a janela é curta.
 */
export function prazo(deadline: string | null, hoje: string): string | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const dias = Math.round(
    (Date.parse(`${deadline}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) /
      86400000,
  );
  if (dias < 0 || dias > 7) return null;
  if (dias === 0) return "encerra hoje";
  return dias === 1 ? "encerra amanhã" : `encerra em ${dias} dias`;
}

const VALOR = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{3,6}(?:,\d{2})?)`;
const ROTULO_SALARIO =
  "(?:sal[áa]rio|remunera[çc][ãa]o|pagamento|ganhos?|piso)";
/** "Salário R$ 2.000", "salário: 2.000,00", "remuneração de R$2.000". */
const SALARIO_DEPOIS = new RegExp(
  `${ROTULO_SALARIO}\\b(?:(?!R\\$)[^\\d\\n]){0,30}(?:R\\$\\s*)?${VALOR}`,
  "gi",
);
/** "R$ 2.338,79 de salário", "R$ 2.000 fixo". */
const SALARIO_ANTES = new RegExp(
  `R\\$\\s*${VALOR}\\s*(?:de |\\/ ?|por m[êe]s )?(?:sal[áa]rio|fixo)`,
  "gi",
);

/**
 * Salário que o próprio texto rotula como salário/remuneração/pagamento/piso,
 * no formato canônico "R$ 2.000". Valor solto (VT, VR, comissão, preço) não
 * conta — é o que separava salário de benefício nos anúncios de texto livre. A
 * faixa 800–30.000 é a mesma de `parseSalario`; em faixa "A - B" fica o piso.
 */
export function extraiSalarioRotulado(texto: string | null): string | null {
  if (!texto) return null;
  const t = texto.slice(0, 3000);
  for (const re of [SALARIO_DEPOIS, SALARIO_ANTES]) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const valor = parseSalario(`R$ ${m[1]}`);
      if (valor)
        return `R$ ${valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
    }
  }
  return null;
}

/**
 * Tipo de contrato quando a fonte não o informa mas o texto diz. A ordem
 * importa: "estágio" e "aprendiz" ganham de "registrado" (aprendiz também tem
 * carteira), e "sem registro" nunca vira CLT.
 */
export function inferirContrato(texto: string | null): string | null {
  if (!texto) return null;
  const t = texto.slice(0, 3000);
  if (/est[áa]gio|estagi[áa]ri/i.test(t)) return "Estágio";
  if (/jovem aprendiz|menor aprendiz|\baprendiz\b/i.test(t))
    return "Jovem Aprendiz";
  if (/\bPJ\b|pessoa jur[íi]dica/.test(t)) return "PJ";
  if (/tempor[áa]ri|extra natal|safrista/i.test(t)) return "Temporário";
  if (/free ?lance|freelancer|aut[ôo]nomo/i.test(t)) return "Autônomo";
  if (/\bsem (registro|carteira)\b/i.test(t)) return null;
  if (
    /\bCLT\b|carteira (assinada|registrada)|registro em carteira|trabalho registrado|\bregistrad[oa]\b|efetivo/i.test(
      t,
    )
  )
    return "CLT";
  return null;
}

/**
 * "Requisitos da vaga" a partir do texto da descrição: o trecho depois do rótulo
 * "Requisitos"/"Requisitos e qualificações"/"Pré-requisitos" até o próximo
 * rótulo conhecido, em uma linha de até 160 caracteres. Sem rótulo, sem
 * requisito — nada é inventado.
 */
export function extraiRequisitos(texto: string | null): string | null {
  if (!texto) return null;
  const m = texto
    .slice(0, 3000)
    .match(
      /(?:pr[ée]-)?requisitos?(?:\s+e\s+qualifica[çc][õo]es|\s+da\s+vaga|\s+necess[áa]rios)?\s*[:\-–]\s*([\s\S]+?)(?=\s(?:benef[íi]cios?|atividades|responsabilidades|como se candidatar|sal[áa]rio|hor[áa]rio|diferenciais|oferecemos|enviar|interessados|remunera[çc][ãa]o)\b\s*[:\-–]|$)/i,
    );
  const limpo = (m?.[1] ?? "")
    .replace(/\s+/g, " ")
    .replace(/[;,.\s]+$/, "")
    .trim();
  if (limpo.length < 4) return null;
  return limpo.length > 160 ? `${[...limpo].slice(0, 157).join("")}…` : limpo;
}
