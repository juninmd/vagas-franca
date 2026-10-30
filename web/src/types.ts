/** Uma vaga como a API (`GET /api/vagas`) entrega. Espelha `src/vagas-api.ts`. */
export interface Vaga {
  id: string;
  titulo: string;
  empresa: string | null;
  area: string | null;
  /** Texto pronto para exibir, ex.: "R$ 2.114". */
  salario: string | null;
  /** Valor numérico do piso (R$ 800–30.000), para ordenar e filtrar. */
  salarioValor: number | null;
  jornada: string | null;
  contrato: string | null;
  modalidade: string | null;
  cidade: string | null;
  fonte: string;
  /** Só http(s); `null` quando a fonte não trouxe um link utilizável. */
  link: string | null;
  descricao: string | null;
  requisitos: string | null;
  /** Data-limite (AAAA-MM-DD) quando a fonte publica uma. */
  prazo: string | null;
  publicadaEm: string | null;
  /** Primeira vez que o radar viu a vaga (AAAA-MM-DD). */
  vistaEm: string;
  /** E-mail e/ou telefone de contato, já filtrados pelo backend. */
  contato: string | null;
  pcd: boolean;
}

export interface RespostaVagas {
  geradoEm: string;
  /** Data (AAAA-MM-DD) da coleta mais recente. */
  atualizadoEm: string | null;
  total: number;
  vagas: Vaga[];
}

export type Ordem = "salario" | "recentes" | "az";
