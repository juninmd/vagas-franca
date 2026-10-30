import type { Ordem, Vaga } from "../types.ts";
import { diasDesde, hojeIso } from "./formata.ts";

export interface Filtros {
  busca: string;
  areas: string[];
  contratos: string[];
  modalidades: string[];
  fontes: string[];
  /** 0 = sem piso. Com piso, só entram vagas que declaram salário. */
  salarioMin: number;
  soComSalario: boolean;
  soComRequisitos: boolean;
  soPcd: boolean;
  ordem: Ordem;
}

export const FILTROS_VAZIOS: Filtros = {
  busca: "",
  areas: [],
  contratos: [],
  modalidades: [],
  fontes: [],
  salarioMin: 0,
  soComSalario: false,
  soComRequisitos: false,
  soPcd: false,
  ordem: "salario",
};

/** Minúsculo e sem acento: "Produção" casa com "producao". */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

const textoBusca = (v: Vaga) =>
  norm(
    [v.titulo, v.empresa, v.area, v.cidade, v.contrato, v.descricao]
      .filter(Boolean)
      .join(" "),
  );

/** OR dentro de um grupo, AND entre grupos. Grupo vazio não filtra. */
const noGrupo = (escolhidos: string[], valor: string | null) =>
  escolhidos.length === 0 || (valor !== null && escolhidos.includes(valor));

export function filtra(vagas: Vaga[], f: Filtros): Vaga[] {
  const termos = norm(f.busca).split(/\s+/).filter(Boolean);
  return vagas.filter((v) => {
    if (!noGrupo(f.areas, v.area)) return false;
    if (!noGrupo(f.contratos, v.contrato)) return false;
    if (!noGrupo(f.modalidades, v.modalidade)) return false;
    if (!noGrupo(f.fontes, v.fonte)) return false;
    if (f.soComSalario && v.salarioValor === null) return false;
    if (f.salarioMin > 0 && (v.salarioValor ?? 0) < f.salarioMin) return false;
    if (f.soComRequisitos && !v.requisitos) return false;
    if (f.soPcd && !v.pcd) return false;
    if (termos.length) {
      const texto = textoBusca(v);
      if (!termos.every((t) => texto.includes(t))) return false;
    }
    return true;
  });
}

const quando = (v: Vaga) => v.publicadaEm ?? v.vistaEm;

/** Mais recente primeiro; ISO de data ordena como texto. */
const maisRecente = (a: Vaga, b: Vaga) => quando(b).localeCompare(quando(a));

export function ordena(vagas: Vaga[], ordem: Ordem): Vaga[] {
  const copia = [...vagas];
  if (ordem === "az")
    return copia.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  if (ordem === "recentes") return copia.sort(maisRecente);
  // Maior salário primeiro; quem não declara salário vai para o fim.
  return copia.sort((a, b) => {
    if (a.salarioValor === null && b.salarioValor === null)
      return maisRecente(a, b);
    if (a.salarioValor === null) return 1;
    if (b.salarioValor === null) return -1;
    return b.salarioValor - a.salarioValor || maisRecente(a, b);
  });
}

export interface Contagem {
  valor: string;
  n: number;
}

/** Valores de um campo com a contagem de vagas, do mais frequente ao menos. */
export function contaPor(
  vagas: Vaga[],
  campo: "area" | "contrato" | "modalidade" | "fonte",
): Contagem[] {
  const mapa = new Map<string, number>();
  for (const v of vagas) {
    const valor = v[campo];
    if (valor) mapa.set(valor, (mapa.get(valor) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, "pt-BR"));
}

export function mediana(ns: number[]): number | null {
  if (ns.length === 0) return null;
  const s = [...ns].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2
    ? (s[meio] as number)
    : ((s[meio - 1] as number) + (s[meio] as number)) / 2;
}

export interface Resumo {
  total: number;
  comSalario: number;
  mediana: number | null;
  maior: number | null;
  novasNaSemana: number;
  comRequisitos: number;
  fontes: number;
}

export function resumo(vagas: Vaga[], hoje = hojeIso()): Resumo {
  const valores = vagas.flatMap((v) =>
    v.salarioValor === null ? [] : [v.salarioValor],
  );
  return {
    total: vagas.length,
    comSalario: valores.length,
    // Mediana de menos de 3 valores é ruído; melhor não mostrar.
    mediana: valores.length >= 3 ? mediana(valores) : null,
    maior: valores.length ? Math.max(...valores) : null,
    novasNaSemana: vagas.filter((v) => diasDesde(v.vistaEm, hoje) <= 7).length,
    comRequisitos: vagas.filter((v) => v.requisitos).length,
    fontes: new Set(vagas.map((v) => v.fonte)).size,
  };
}

export function contaFiltrosAtivos(f: Filtros): number {
  return (
    f.areas.length +
    f.contratos.length +
    f.modalidades.length +
    f.fontes.length +
    (f.salarioMin > 0 ? 1 : 0) +
    (f.soComSalario ? 1 : 0) +
    (f.soComRequisitos ? 1 : 0) +
    (f.soPcd ? 1 : 0)
  );
}

// ── estado na URL: o link da busca é compartilhável ───────────────────────

const ORDENS: Ordem[] = ["salario", "recentes", "az"];

export function filtrosParaUrl(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.busca.trim()) p.set("q", f.busca.trim());
  for (const a of f.areas) p.append("area", a);
  for (const c of f.contratos) p.append("contrato", c);
  for (const m of f.modalidades) p.append("modalidade", m);
  for (const s of f.fontes) p.append("fonte", s);
  if (f.salarioMin > 0) p.set("min", String(f.salarioMin));
  if (f.soComSalario) p.set("comSalario", "1");
  if (f.soComRequisitos) p.set("comRequisitos", "1");
  if (f.soPcd) p.set("pcd", "1");
  if (f.ordem !== FILTROS_VAZIOS.ordem) p.set("ordem", f.ordem);
  return p.toString();
}

export function filtrosDeUrl(search: string): Filtros {
  const p = new URLSearchParams(search);
  const min = Number(p.get("min"));
  const ordem = p.get("ordem") as Ordem | null;
  return {
    busca: p.get("q") ?? "",
    areas: p.getAll("area"),
    contratos: p.getAll("contrato"),
    modalidades: p.getAll("modalidade"),
    fontes: p.getAll("fonte"),
    salarioMin: Number.isFinite(min) && min > 0 ? Math.round(min) : 0,
    soComSalario: p.get("comSalario") === "1",
    soComRequisitos: p.get("comRequisitos") === "1",
    soPcd: p.get("pcd") === "1",
    ordem: ordem && ORDENS.includes(ordem) ? ordem : FILTROS_VAZIOS.ordem,
  };
}
