import type { Job } from "./db.ts";
import {
  contatoSeguro,
  extraiRequisitos,
  formataSalario,
  linkSeguro,
  parseSalario,
} from "./format.ts";

/**
 * O que a interface web recebe de cada vaga. Puro (sem banco) para ser testado
 * sem abrir o SQLite; o contrato espelha `web/src/types.ts`.
 *
 * Tudo aqui sai do texto de terceiros, então só passa o que já é tratado pelo
 * resto do app: `linkSeguro` (só http/https), `contatoSeguro` (só e-mail e
 * telefone) e `formataSalario`. O front ainda escapa tudo por ser React, mas
 * não depende disso para o link e o contato.
 */
export interface VagaApi {
  id: string;
  titulo: string;
  empresa: string | null;
  area: string | null;
  salario: string | null;
  salarioValor: number | null;
  jornada: string | null;
  contrato: string | null;
  modalidade: string | null;
  cidade: string | null;
  fonte: string;
  link: string | null;
  descricao: string | null;
  requisitos: string | null;
  prazo: string | null;
  publicadaEm: string | null;
  vistaEm: string;
  contato: string | null;
  pcd: boolean;
}

export interface RespostaVagas {
  geradoEm: string;
  /** Data (AAAA-MM-DD) da coleta mais recente: o quão fresco é o que se vê. */
  atualizadoEm: string | null;
  total: number;
  vagas: VagaApi[];
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const TETO_DESCRICAO = 4000;

/** Data AAAA-MM-DD ou null; a fonte às vezes manda data com hora ou lixo. */
const soData = (s: string | null): string | null => {
  const d = s?.slice(0, 10) ?? null;
  return d && DATA_ISO.test(d) ? d : null;
};

export function serializaVaga(j: Job): VagaApi {
  return {
    id: j.id,
    titulo: j.title,
    empresa: j.company,
    area: j.area,
    salario: formataSalario(j.salary),
    salarioValor: parseSalario(j.salary),
    jornada: j.schedule,
    contrato: j.contract,
    modalidade: j.workplace,
    cidade: j.city,
    fonte: j.source,
    link: linkSeguro(j.link),
    descricao: j.description ? j.description.slice(0, TETO_DESCRICAO) : null,
    requisitos: extraiRequisitos(j.description),
    prazo: soData(j.deadline),
    publicadaEm: soData(j.published),
    vistaEm: soData(j.first_seen) ?? j.first_seen,
    contato: contatoSeguro(j.contact),
    pcd: j.pcd === 1,
  };
}

export function serializaVagas(
  jobs: Job[],
  agora: Date = new Date(),
): RespostaVagas {
  const datas = jobs.flatMap((j) => soData(j.last_seen) ?? []);
  return {
    geradoEm: agora.toISOString(),
    atualizadoEm: datas.length ? datas.reduce((a, b) => (a > b ? a : b)) : null,
    total: jobs.length,
    vagas: jobs.map(serializaVaga),
  };
}
