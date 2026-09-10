/**
 * Agrupamento por área no post. É por palavra-chave (não por IA): o título da
 * vaga já diz a profissão, e classificar 300 vagas com o modelo custaria caro
 * pra errar mais.
 *
 * Duas ordens, de propósito diferentes:
 *   RULES  — ordem de CASAMENTO, da regra mais específica para a mais ampla.
 *   AREA_ORDER — ordem de EXIBIÇÃO no digest, do que mais interessa em Franca.
 * Amarrar as duas obrigava "Educação" a vir antes de "Saúde" no post só pra
 * "Tutor de Fonoaudiologia" não virar vaga de hospital.
 */
interface Area {
  area: string;
  emoji: string;
  re: RegExp;
}

const ESTAGIO: Area = {
  area: "Estágio & Jovem Aprendiz",
  emoji: "🌱",
  re: /est[áa]gio|estagi[áa]ri|jovem aprendiz|aprendiz|trainee|menor aprendiz/i,
};

/** Ordem de casamento: o específico primeiro, o vocabulário amplo por último. */
const RULES: Area[] = [
  {
    // Vocabulário do calçado é inconfundível e é o setor-âncora da cidade.
    area: "Calçados & Indústria",
    emoji: "👟",
    re: /costur|pesponto|chanfr|sapatei|cal[çc]ad|couro|solad|corte de cabedal|cabedal|modelist|produ[çc][ãa]o|operador de m[áa]quina|encaixad|acabament|montador|ferrament|solda|torneiro|usinag|manuten[çc][ãa]o industrial|t[êe]xtil|confec[çc]|qualidade|\bpcp\b/i,
  },
  {
    // Antes de Saúde: "Tutor de Fonoaudiologia" é vaga de faculdade, não de hospital.
    area: "Educação",
    emoji: "🎓",
    re: /professor|educador|educacional|pedagog|instrutor|auxiliar de classe|ber[çc][áa]rio|educa[çc][ãa]o infantil|tutor|docente|inspetor de alunos|coordenador de curso|monitor (de turma|de sala|escolar|de educa)/i,
  },
  {
    area: "Saúde",
    emoji: "🩺",
    re: /enfermeir|enfermagem|m[ée]dic|farm[áa]c|dentist|fisioterap|nutricion|psic[óo]log|cuidador|biom[ée]dic|radiolog|veterin[áa]r|fonoaudi[óo]log|flebotomist|[óo]ptic|(auxiliar|t[ée]cnic[oa]) de laborat[óo]ri/i,
  },
  {
    area: "Automotivo",
    emoji: "🚗",
    re: /mec[âa]nic|funilei|lanternag|frentista|lavador|auto ?center|para-?brisa|acess[óo]rios automotivos|borrachei|preparador de ve[íi]cul/i,
  },
  {
    area: "Beleza & Estética",
    emoji: "💇",
    re: /beleza|cabeleirei|manicure|pedicure|est[ée]tic|barbeir|depila|maquiad|sobrancelh|massoterap/i,
  },
  {
    area: "Alimentação & Hotelaria",
    emoji: "🍽️",
    re: /cozinh|chapeiro|gar[çc]on|garconete|padeiro|padari|confeiteir|a[çc]ougue|pizzai|barista|camareir|hotel|restaurante|bar\b|lanchonete|salgadeir/i,
  },
  {
    area: "Vendas & Comércio",
    emoji: "🛍️",
    re: /vendedor|vendas|consultor comercial|representante|promotor|caixa|balconista|\bde loja\b|varejo|repositor|comercial|corretor|gerente de neg[óo]ci|executivo de contas/i,
  },
  {
    area: "Atendimento & Call Center",
    emoji: "📞",
    re: /call ?center|telemarketing|atendimento|recepcionist|recep[çc][ãa]o|relacionamento|\bcrc\b|\bsac\b|\bura\b|televendas|p[óo]s-?venda/i,
  },
  {
    area: "Logística & Transporte",
    emoji: "🚚",
    re: /motorista|entregador|entrega|log[íi]stic|estoqu|almoxarif|empilhad|conferente|expedi[çc][ãa]o|carga|carregament|armaz[ée]m|motoboy|frota|ped[áa]gio|separador/i,
  },
  {
    area: "Marketing & Design",
    emoji: "🎨",
    re: /marketing|designer|design gr[áa]fic|arte ?finalista|social m[íi]dia|m[íi]dias sociais|publicidad|\bcrm\b|e-? ?commerce|marketplace/i,
  },
  {
    area: "Tecnologia",
    emoji: "💻",
    re: /desenvolvedor|programador|analista de sistemas|suporte t[ée]cnico|infraestrutura de ti|\bti\b|software|dados|devops|qa\b|full ?stack|front ?end|back ?end/i,
  },
  {
    area: "Administrativo & Financeiro",
    emoji: "🗂️",
    re: /administrativ|secret[áa]ri|financeir|cont[áa]b|\bcontador|fiscal|cobran[çc]a|departamento pessoal|\brh\b|recursos humanos|compras|faturament|faturist|or[çc]amentist|auditor|legaliza[çc]|analista de opera/i,
  },
  {
    area: "Construção & Serviços",
    emoji: "🧰",
    re: /pedreiro|servente|eletricist|encanador|pintor|jardineir|serralheir|marceneir|limpeza|servi[çc]os gerais|zelador|portari|vigilant|seguran[çc]a|porteiro|dom[ée]stic|dia[ií]ist|praga|dedetiza/i,
  },
  ESTAGIO,
];

const OUTRAS = { area: "Outras oportunidades", emoji: "📌" };

/**
 * Classifica SÓ pelo título: o título de uma vaga é a profissão. Usar a
 * descrição como desempate jogava "Assistente de Beleza" em Calçados (o texto
 * da loja cita "produção") e vaga de dev em Indústria.
 */
export function classify(title: string) {
  // Estágio/aprendiz é vínculo, não profissão, e ganha das demais regras.
  if (ESTAGIO.re.test(title)) return ESTAGIO;
  return RULES.find((r) => r.re.test(title)) ?? OUTRAS;
}

/** Ordem de exibição no digest, do mais procurado em Franca ao resto. */
export const AREA_ORDER = [
  "Calçados & Indústria",
  "Vendas & Comércio",
  "Logística & Transporte",
  "Saúde",
  "Administrativo & Financeiro",
  "Alimentação & Hotelaria",
  "Atendimento & Call Center",
  "Construção & Serviços",
  "Educação",
  "Tecnologia",
  "Automotivo",
  "Marketing & Design",
  "Beleza & Estética",
  "Estágio & Jovem Aprendiz",
  OUTRAS.area,
];

/** Emoji da área, para o cabeçalho do bloco no post. */
const EMOJIS = new Map(
  [...RULES, OUTRAS].map((r) => [r.area, r.emoji] as const),
);
export const areaEmoji = (area: string) => EMOJIS.get(area) ?? OUTRAS.emoji;
