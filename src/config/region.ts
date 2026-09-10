/** Franca primeiro; as vizinhas entram porque muita gente da cidade trabalha nelas. */
export const REGION_CITIES = [
  "Franca",
  "Restinga",
  "Itirapuã",
  "Ribeirão Corrente",
  "Cristais Paulista",
  "Patrocínio Paulista",
  "Jeriquara",
  "Rifaina",
  "São José da Bela Vista",
  "Claraval",
  "Ibiraci",
  "Batatais",
  "Orlândia",
  "Nuporanga",
  "Ituverava",
  "Pedregulho",
];

/** Sem acento, minúsculo — a comparação de cidade nunca depende de acentuação. */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const ALLOWED = new Set(REGION_CITIES.map(norm));

/** 0 = Franca, 1 = vizinha permitida, 2 = fora da região. */
export function cityRank(city: string | null): number {
  if (!city) return 1;
  const c = norm(city);
  if (c.startsWith("franca")) return 0;
  return ALLOWED.has(c.replace(/\s*[-,]\s*sp$/, "")) ? 1 : 2;
}

export const inRegion = (city: string | null) => cityRank(city) < 2;
