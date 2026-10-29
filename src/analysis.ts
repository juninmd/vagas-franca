import { AREA_ORDER } from "./config/areas.ts";
import { db, type Job, lastSnapshot, saveSnapshot } from "./db.ts";
import { type Destaque, melhoresOportunidades } from "./destaques.ts";
import {
  cargoBase,
  ehCadastroDeCurriculo,
  linkSeguro,
  parseSalario,
} from "./format.ts";

// Re-export: `parseSalario`/`cargoBase` sao puros e moram em `format.ts` para
// que o teste deles nao carregue `db.ts` (que abre o banco no import).
export { cargoBase, parseSalario };

/**
 * Raio-X do mercado de trabalho de Franca a partir do estoque acumulado no
 * banco — é o que separa "lista de vagas" de "análise": quanto o mercado paga,
 * quem contrata, o que mais abre vaga e como isso mudou de ontem pra hoje.
 * Tudo em SQL/JS: nenhuma estatística passa pela IA (número inventado é pior
 * que número ausente).
 */

const q = <T>(sql: string, ...params: (string | number)[]): T[] =>
  db.query<T, (string | number)[]>(sql).all(...params);

const brl = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

const mediana = (ns: number[]): number => {
  const s = [...ns].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2
    ? (s[meio] as number)
    : ((s[meio - 1] as number) + (s[meio] as number)) / 2;
};

/**
 * Franca é a capital do calçado: o setor tem vocabulário próprio (pesponto,
 * chanfração, cabedal) que não aparece em nenhuma outra cidade. Ter a lente
 * dele separada é o que faz a análise ser *de Franca*, e não genérica.
 */
const CALCADISTA =
  /costur|pespont|chanfr|sapatei|cal[çc]ad|cabedal|solad|couro|modelist|cortador|montador de cal|acabament|est[óo]quista de cal|serigraf/i;

export interface Raio {
  abertas: number;
  novasHoje: number;
  comSalario: number;
  medianaGeral: number | null;
  /** Vagas do setor calçadista e o que ele paga. */
  calcadista: { n: number; mediana: number | null; empresas: number };
  /** Variação contra a última foto salva (null na primeira execução). */
  variacao: { abertas: number; calcadista: number; dias: number } | null;
  porArea: {
    area: string;
    n: number;
    /** Quantas vagas da área declaram salário — a base da mediana. */
    amostra: number;
    mediana: number | null;
    teto: number | null;
  }[];
  topEmpresas: { empresa: string; n: number }[];
  topProfissoes: { titulo: string; n: number }[];
  contratos: { rotulo: string; n: number }[];
  modalidades: { rotulo: string; n: number }[];
  /** Quantas vagas declaram contrato/modalidade — base dos percentuais. */
  comContrato: number;
  comModalidade: number;
  porCidade: { cidade: string; n: number }[];
  porFonte: { fonte: string; n: number }[];
  /** Ranking ponderado (salário, CLT, benefícios, contato) — ver destaques.ts. */
  destaques: Destaque[];
  melhores: {
    title: string;
    company: string | null;
    valor: number;
    link: string;
  }[];
}

/**
 * "Empresa Confidencial" e "Página de Carreira" são rótulos de anonimato dos
 * portais, não empregadores — no ranking de quem contrata viram ruído.
 */
const EMPRESA_ANONIMA =
  /confidencial|p[áa]gina de carreira|empresa contratante|an[ôo]nim|n[ãa]o informad/i;

const diasEntre = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000,
  );

export function raioX(today: string): Raio {
  const jobs = q<Job>("SELECT * FROM jobs");
  const abertas = jobs.length;

  const comValor = jobs
    .map((j) => ({ j, valor: parseSalario(j.salary) }))
    .filter((x): x is { j: Job; valor: number } => x.valor !== null);

  const doCalcado = jobs.filter((j) =>
    CALCADISTA.test(`${j.title} ${j.description ?? ""}`),
  );
  const valoresCalcado = comValor
    .filter((x) => CALCADISTA.test(`${x.j.title} ${x.j.description ?? ""}`))
    .map((x) => x.valor);
  const calcadista = {
    n: doCalcado.length,
    mediana: valoresCalcado.length >= 2 ? mediana(valoresCalcado) : null,
    empresas: new Set(doCalcado.map((j) => j.company).filter(Boolean)).size,
  };

  const anterior = lastSnapshot(today);
  const variacao = anterior
    ? {
        abertas: abertas - anterior.abertas,
        calcadista: calcadista.n - anterior.calcadista,
        dias: diasEntre(anterior.dia, today),
      }
    : null;

  const porArea = AREA_ORDER.map((area) => {
    const daArea = jobs.filter((j) => j.area === area);
    const valores = comValor
      .filter((x) => x.j.area === area)
      .map((x) => x.valor);
    return {
      area,
      n: daArea.length,
      amostra: valores.length,
      mediana: valores.length >= 2 ? mediana(valores) : null,
      teto: valores.length ? Math.max(...valores) : null,
    };
  }).filter((a) => a.n > 0);

  const contagem = <T extends string>(
    lista: (T | null)[],
    rotulo: string,
  ): { [k: string]: string | number }[] => {
    const mapa = new Map<string, number>();
    for (const v of lista) if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
    return [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ [rotulo]: k, n }));
  };

  return {
    abertas,
    novasHoje: jobs.filter((j) => j.first_seen === today).length,
    comSalario: comValor.length,
    medianaGeral:
      comValor.length >= 3 ? mediana(comValor.map((x) => x.valor)) : null,
    calcadista,
    variacao,
    porArea,
    topEmpresas: contagem(
      jobs.map((j) =>
        j.company && !EMPRESA_ANONIMA.test(j.company) ? j.company : null,
      ),
      "empresa",
    ).slice(0, 8) as unknown as Raio["topEmpresas"],
    topProfissoes: contagem(
      jobs.map((j) => {
        const cargo = cargoBase(j.title);
        return cargo && !ehCadastroDeCurriculo(cargo) ? cargo : null;
      }),
      "titulo",
    ).slice(0, 8) as unknown as Raio["topProfissoes"],
    comContrato: jobs.filter((j) => j.contract).length,
    comModalidade: jobs.filter((j) => j.workplace).length,
    contratos: contagem(
      jobs.map((j) => j.contract),
      "rotulo",
    ).slice(0, 5) as unknown as Raio["contratos"],
    modalidades: contagem(
      jobs.map((j) => j.workplace),
      "rotulo",
    ).slice(0, 4) as unknown as Raio["modalidades"],
    porCidade: contagem(
      jobs.map((j) => j.city),
      "cidade",
    ).slice(0, 6) as unknown as Raio["porCidade"],
    porFonte: contagem(
      jobs.map((j) => j.source),
      "fonte",
    ) as unknown as Raio["porFonte"],
    destaques: melhoresOportunidades(jobs, 5),
    melhores: comValor
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
      .map((x) => ({
        title: x.j.title,
        company: x.j.company,
        valor: x.valor,
        link: x.j.link,
      })),
  };
}

/** Monta o post do raio-X. `esc` é o escapador de Markdown do digest. */
export function formataRaioX(r: Raio, esc: (s: string) => string): string {
  const linhas = [
    "📊 *Raio-X do mercado de trabalho em Franca*",
    "",
    `*${r.abertas}* vagas abertas · *${r.novasHoje}* novas hoje · *${r.comSalario}* com salário declarado`,
  ];

  if (r.medianaGeral)
    linhas.push(`💰 Salário mediano anunciado: *${brl(r.medianaGeral)}*`);

  if (r.variacao) {
    const { abertas, calcadista, dias } = r.variacao;
    const sinal = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    const janela = dias === 1 ? "ontem" : `${dias} dias atrás`;
    linhas.push(
      `📈 Contra ${janela}: *${sinal(abertas)}* vagas no total · *${sinal(calcadista)}* no calçadista`,
    );
  }

  // O bloco do calçado vem antes das áreas: em Franca é ele que dá o termômetro.
  if (r.calcadista.n) {
    const paga = r.calcadista.mediana
      ? ` · mediana ${brl(r.calcadista.mediana)}`
      : " · sem salário publicado o bastante";
    linhas.push(
      "",
      `👟 *Setor calçadista* — *${r.calcadista.n}* vagas em ${r.calcadista.empresas} empresas${paga}`,
    );
  }

  const areas = r.porArea.filter((a) => a.mediana).slice(0, 6);
  if (areas.length) {
    linhas.push("", "*Quanto paga cada área* (mediana · teto)");
    for (const a of areas)
      linhas.push(
        `• ${esc(a.area)} — ${brl(a.mediana as number)}${a.teto ? ` · até ${brl(a.teto)}` : ""} _(${a.amostra} de ${a.n} vagas informam)_`,
      );
  }

  const semValor = r.porArea
    .filter((a) => !a.mediana)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
  if (semValor.length)
    linhas.push(
      "",
      `_Sem salário publicado o bastante para calcular: ${semValor.map((a) => `${esc(a.area)} (${a.n})`).join(", ")}_`,
    );

  if (r.topProfissoes.length) {
    linhas.push("", "*O que mais abre vaga*");
    for (const p of r.topProfissoes.slice(0, 6))
      linhas.push(`• ${esc(p.titulo)} — ${p.n}`);
  }

  if (r.topEmpresas.length) {
    linhas.push("", "*Quem mais contrata*");
    for (const e of r.topEmpresas.slice(0, 6))
      linhas.push(`• ${esc(e.empresa)} — ${e.n}`);
  }

  // Percentual sobre quem declara o campo, não sobre o total: com o total, os
  // rótulos somavam 60% e pareciam faltar categorias.
  const fatia = (lista: { rotulo: string; n: number }[], base: number) =>
    base
      ? lista
          .map((c) => `${esc(c.rotulo)} ${Math.round((c.n / base) * 100)}%`)
          .join(" · ")
      : "";
  if (r.contratos.length)
    linhas.push(
      "",
      `📄 *Contrato:* ${fatia(r.contratos, r.comContrato)} _(${r.comContrato} vagas informam)_`,
    );
  if (r.modalidades.length)
    linhas.push(
      `🏢 *Modalidade:* ${fatia(r.modalidades, r.comModalidade)} _(${r.comModalidade} informam)_`,
    );

  if (r.porCidade.length > 1)
    linhas.push(
      `📍 *Cidades:* ${r.porCidade.map((c) => `${esc(c.cidade)} ${c.n}`).join(" · ")}`,
    );

  if (r.destaques.length) {
    linhas.push("", "⭐ *Melhores oportunidades hoje*");
    for (const d of r.destaques) {
      const url = linkSeguro(d.job.link);
      const titulo = url ? `[${esc(d.job.title)}](${url})` : esc(d.job.title);
      const meta = [
        `*${brl(d.valor)}*`,
        d.job.contract ? esc(d.job.contract) : null,
        d.job.company ? esc(d.job.company) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      linhas.push(`• ${titulo} — ${meta}`);
    }
  }

  if (r.melhores.length) {
    linhas.push("", "*Maiores salários no radar hoje*");
    for (const m of r.melhores) {
      const url = linkSeguro(m.link);
      const cauda = `*${brl(m.valor)}*${m.company ? ` · ${esc(m.company)}` : ""}`;
      linhas.push(
        url
          ? `• [${esc(m.title)}](${url}) — ${cauda}`
          : `• ${esc(m.title)} — ${cauda}`,
      );
    }
  }

  linhas.push(
    "",
    `_Fontes: ${r.porFonte.map((f) => `${esc(f.fonte)} (${f.n})`).join(", ")}_`,
  );
  return linhas.join("\n");
}

/** Fecha o dia no histórico — a comparação de amanhã sai daqui. */
export function registraSnapshot(dia: string, r: Raio): void {
  saveSnapshot({
    dia,
    abertas: r.abertas,
    novas: r.novasHoje,
    com_salario: r.comSalario,
    mediana: r.medianaGeral,
    calcadista: r.calcadista.n,
  });
}
