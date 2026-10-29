import { fetchJson, fetchText, limpa, logFonte, salvaVagas } from "./comum.ts";

/**
 * Mural de vagas da ACIF (Associação Comercial e Industrial de Franca) — a
 * fonte mais local que existe: são empresas da cidade anunciando direto, com
 * e-mail/telefone de contato e requisitos onde o horário costuma aparecer.
 * O mural é uma SPA; estes dois endpoints são o que ela consome:
 *   carregar_vagas.php?pagina=N → HTML dos cards (9 por página), com data-id
 *   detalhes_vaga.php?id=N      → JSON completo da vaga
 */
const BASE = "https://www.acifranca.com.br/empregos-acif/";
const MURAL = "https://www.acifranca.com.br/empregos-acif";

interface AcifVaga {
  id: number;
  nome_empresa: string;
  email_empresa: string;
  contato_empresa: string;
  titulo_vaga: string;
  descricao: string;
  responsabilidade: string;
  requisitos_qualificacoes: string;
  data_final: string;
  ativa: number;
  contato_visivel: number;
  email_visivel: number;
  nome_empresa_visivel: number;
  link: string;
  link_visivel: number;
}

const MINUSCULAS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "com",
  "para",
  "a",
  "o",
]);

/** O mural escreve tudo em CAIXA ALTA; no post isso vira grito. */
const titleCase = (s: string) =>
  limpa(s)
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) =>
      i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(" ");

export async function syncAcif(today: string): Promise<void> {
  const ids: string[] = [];
  // Páginas de 9; para quando repetir ou vier vazia.
  for (let pagina = 1; pagina <= 12; pagina++) {
    const html = await fetchText(`${BASE}carregar_vagas.php?pagina=${pagina}`);
    const novos = [...html.matchAll(/data-id="(\d+)"/g)]
      .map((m) => m[1] as string)
      .filter((id) => !ids.includes(id));
    if (!novos.length) break;
    ids.push(...novos);
  }

  const vagas = [];
  for (const id of ids) {
    let v: AcifVaga;
    try {
      v = await fetchJson<AcifVaga>(`${BASE}detalhes_vaga.php?id=${id}`);
    } catch {
      continue;
    }
    if (!v?.titulo_vaga || !v.ativa) continue;
    if (v.data_final && v.data_final < today) continue;

    const contato = [
      v.email_visivel && v.email_empresa ? v.email_empresa : null,
      v.contato_visivel && v.contato_empresa ? v.contato_empresa : null,
    ]
      .filter(Boolean)
      .join(" · ");

    vagas.push({
      title: titleCase(v.titulo_vaga),
      company:
        v.nome_empresa_visivel && v.nome_empresa
          ? titleCase(v.nome_empresa)
          : null,
      salary: null,
      schedule: null,
      contract: null,
      workplace: "Presencial",
      city: "Franca",
      // A vaga não tem página própria; o id no fragmento mantém o dedupe estável.
      link: v.link_visivel && v.link ? v.link : `${MURAL}#vaga-${v.id}`,
      source: "Mural ACIF",
      description: limpa(
        [
          v.descricao,
          v.responsabilidade,
          v.requisitos_qualificacoes &&
            `Requisitos: ${v.requisitos_qualificacoes}.`,
        ]
          .filter(Boolean)
          .join(" "),
      ).slice(0, 1500),
      published: null,
      contact: contato || null,
      // O mural publica a data-limite; é o único que dá pra dizer "encerra em X".
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(v.data_final) ? v.data_final : null,
    });
  }

  logFonte("acif", salvaVagas(vagas, today));
}
