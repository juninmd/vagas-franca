const MS_DIA = 86_400_000;

/** Meio-dia UTC: a diferença em dias não depende do fuso de quem lê. */
const dia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);

export const hojeIso = (agora = new Date()) => agora.toISOString().slice(0, 10);

export const reais = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

/** Dias entre `iso` e `hoje` (positivo = `iso` é do passado). */
export function diasDesde(iso: string, hoje = hojeIso()): number {
  return Math.round((dia(hoje) - dia(iso)) / MS_DIA);
}

/** "hoje", "ontem", "há 5 dias", "há 3 semanas", "há 2 meses". */
export function rotuloIdade(
  iso: string | null,
  hoje = hojeIso(),
): string | null {
  if (!iso) return null;
  const d = diasDesde(iso, hoje);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 14) return `há ${d} dias`;
  if (d < 60) return `há ${Math.floor(d / 7)} semanas`;
  return `há ${Math.floor(d / 30)} meses`;
}

/** Aviso de prazo; `null` quando não há prazo ou ele já passou. */
export function rotuloPrazo(
  prazo: string | null,
  hoje = hojeIso(),
): { texto: string; urgente: boolean } | null {
  if (!prazo) return null;
  const d = -diasDesde(prazo, hoje);
  if (d < 0) return null;
  if (d === 0) return { texto: "encerra hoje", urgente: true };
  if (d === 1) return { texto: "encerra amanhã", urgente: true };
  return { texto: `encerra em ${d} dias`, urgente: d <= 7 };
}

/** Data AAAA-MM-DD → "30/10/2026". */
export function dataBr(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : null;
}
