import { idsComDescricao, type NewJob } from "../db.ts";
import { contatoSeguro, parseSalario } from "../format.ts";
import { pool } from "../pool.ts";
import { fetchHtml, hash, limpa, logFonte, salvaVagas } from "./comum.ts";
import { foneEF } from "./empregofranca.ts";

type Vaga = Omit<NewJob, "area">;

/**
 * Emprego em Franca (empregoemfranca.com) — mural local feito por RH de
 * empresas da cidade. A home lista ~70 vagas; cada página de detalhe tem campos
 * rotulados (empresa, remuneração, benefícios, requisitos, prazo, contato) em
 * texto corrido, então o parse ancora nos rótulos, não no HTML do Elementor.
 * Detalhe é aberto só para vaga inédita, em série e com pausa.
 */
const BASE = "https://empregoemfranca.com";
const DETAIL_DELAY_MS = 800;
const MAX_DETALHES = 80;

export function linksDaHome(html: string): { title: string; link: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(
    /<h2[^>]*>\s*<a href="(https:\/\/empregoemfranca\.com\/vagas\/[^"]+)">([\s\S]*?)<\/a>/g,
  ))
    out.set(m[1] as string, limpa(m[2] as string));
  return [...out].map(([link, title]) => ({ title, link }));
}

/** Pega o valor entre dois rótulos do texto corrido da vaga. */
const entre = (texto: string, de: string, ate: string): string | null => {
  const i = texto.indexOf(de);
  if (i < 0) return null;
  const resto = texto.slice(i + de.length);
  const j = resto.indexOf(ate);
  return limpa(j < 0 ? resto : resto.slice(0, j)) || null;
};

/** "dd/mm/aa" → ISO; data impossível vira null. */
export function prazoIso(texto: string): string | null {
  const m = texto.match(/at[ée]\s+(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (!m) return null;
  const ano = m[3]?.length === 2 ? `20${m[3]}` : (m[3] as string);
  const iso = `${ano}-${m[2]}-${m[1]}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function parseDetalheEmpregoEmFranca(
  html: string,
  base: { title: string; link: string },
): Vaga | null {
  const texto = limpa(
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " "),
  );
  const empresa = entre(texto, "Nome da Empresa / Agência:", " Vaga:");
  const cidade = entre(texto, "Cidade:", " Atividades:");
  if (!cidade) return null;
  const remuneracao = entre(texto, "Remuneração:", " Beneficios:");
  const beneficios = entre(texto, "Beneficios:", " Requisitos:");
  const atividades = entre(texto, "Atividades:", " Remuneração:");
  const requisitos = entre(texto, "Requisitos:", " Como se candidatar");
  const tipo = entre(texto, " Vaga:", " Cidade:");
  // Só entra salário com forma de valor e dentro da faixa plausível.
  const valor = remuneracao ? parseSalario(`R$ ${remuneracao}`) : null;
  const wa = html.match(/api\.whatsapp\.com\/send\?phone=55(\d{10,11})/)?.[1];
  // Só a seção de candidatura: o rodapé do site tem o e-mail do próprio portal.
  const candidatura = entre(texto, "Como se candidatar", "Importante!") ?? "";
  const email = contatoSeguro(
    candidatura.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/)?.[0] ?? null,
  );
  return {
    title: base.title,
    company: empresa && !/confidencial/i.test(empresa) ? empresa : null,
    salary: valor ? `R$ ${valor.toLocaleString("pt-BR")}` : null,
    schedule: null,
    contract: tipo && /est[áa]gio|aprendiz/i.test(tipo) ? tipo : null,
    workplace: "Presencial",
    city: cidade.split(/\s+-\s+/)[0] ?? null,
    link: base.link,
    source: "Emprego em Franca",
    description:
      limpa(
        [
          atividades,
          requisitos && `Requisitos: ${requisitos}`,
          beneficios && `Benefícios: ${beneficios}`,
        ]
          .filter(Boolean)
          .join(" "),
      ).slice(0, 1500) || null,
    published: null,
    contact: [email, foneEF(wa)].filter(Boolean).join(" · ") || null,
    deadline: prazoIso(texto),
  };
}

export async function syncEmpregoEmFranca(today: string): Promise<void> {
  const lista = linksDaHome(await fetchHtml(`${BASE}/`));
  if (!lista.length)
    throw new Error("empregoemfranca: nenhuma vaga na home (layout mudou?)");
  const jaTem = idsComDescricao();
  const alvo = lista
    .filter((v) => !jaTem.has(hash(v.link)))
    .slice(0, MAX_DETALHES);
  const vagas = await pool(alvo, 1, async (v) => {
    try {
      await Bun.sleep(DETAIL_DELAY_MS);
      return parseDetalheEmpregoEmFranca(await fetchHtml(v.link), v);
    } catch {
      return null;
    }
  });
  const ok = vagas.filter((v): v is Vaga => v !== null);
  // Prazo vencido sai: a home mantém vaga encerrada por dias.
  logFonte(
    "empregoemfranca",
    salvaVagas(
      ok.filter((v) => !v.deadline || v.deadline >= today),
      today,
    ),
  );
}
