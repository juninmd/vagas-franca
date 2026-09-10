import { env } from "../config/env.ts";
import { REGION_CITIES } from "../config/region.ts";
import { fetchJson, limpa, logFonte, salvaVagas } from "./comum.ts";

/**
 * Portal público da Gupy — o único JSON limpo de vagas de Franca que existe.
 * O `state` tem que ir por extenso ("São Paulo"): "SP" devolve zero.
 */
const API = "https://employability-portal.gupy.io/api/v1/jobs";

interface GupyJob {
  name: string;
  description: string;
  careerPageName: string;
  type: string;
  publishedDate: string;
  isRemoteWork: boolean;
  city: string;
  state: string;
  jobUrl: string;
  workplaceType: string;
}

const TIPOS: Record<string, string> = {
  vacancy_type_effective: "Efetivo",
  vacancy_type_temporary: "Temporário",
  vacancy_type_internship: "Estágio",
  vacancy_type_apprentice: "Jovem Aprendiz",
  vacancy_type_talent_pool: "Banco de talentos",
  vacancy_type_outsource: "Terceirizado",
  vacancy_type_summer: "Trainee",
  vacancy_type_associate: "Associado",
  vacancy_type_freelancer: "Freelancer",
};

const LOCAL: Record<string, string> = {
  "on-site": "Presencial",
  remote: "Home office",
  hybrid: "Híbrido",
};

/** Ingere vagas da Gupy para uma cidade. Devolve nada; loga o resultado. */
export async function syncGupy(
  today: string,
  cidade = "Franca",
): Promise<void> {
  const vagas: GupyJob[] = [];
  const porPagina = 100;
  for (
    let offset = 0;
    offset < porPagina * env.pagesPerBoard;
    offset += porPagina
  ) {
    const url = `${API}?city=${encodeURIComponent(cidade)}&state=${encodeURIComponent("São Paulo")}&limit=${porPagina}&offset=${offset}`;
    const page = await fetchJson<{ data: GupyJob[] }>(url);
    vagas.push(...(page.data ?? []));
    if ((page.data ?? []).length < porPagina) break;
  }

  const r = salvaVagas(
    vagas.map((v) => ({
      title: limpa(v.name),
      company: v.careerPageName ? limpa(v.careerPageName) : null,
      // A Gupy não expõe faixa salarial nem jornada em campo próprio — os dois
      // saem da descrição, no enrich por IA.
      salary: null,
      schedule: null,
      contract: TIPOS[v.type] ?? null,
      workplace: v.isRemoteWork
        ? "Home office"
        : (LOCAL[v.workplaceType] ?? null),
      city: v.city ?? cidade,
      link: v.jobUrl,
      source: "Gupy",
      description: limpa(v.description).slice(0, 1500),
      published: v.publishedDate ?? null,
    })),
    today,
  );
  logFonte(`gupy ${cidade}`, r);
}

/**
 * Mesma API, cidades vizinhas — muita gente de Franca trabalha em Batatais,
 * Orlândia ou Ituverava. Em série pra não abrir 15 conexões de uma vez; cada
 * cidade que falha não derruba as outras.
 */
export async function syncGupyRegiao(today: string): Promise<void> {
  for (const cidade of REGION_CITIES.filter((c) => c !== "Franca")) {
    try {
      await syncGupy(today, cidade);
    } catch (err) {
      console.warn(`  ! gupy ${cidade} falhou: ${err}`);
    }
  }
}
