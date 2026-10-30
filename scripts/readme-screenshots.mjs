// Regenera as imagens do README a partir da saída REAL dos comandos.
//
//   DB_PATH=/tmp/vagas.db node scripts/readme-screenshots.mjs
//
// Roda `bun run smoke` e `bun run digest` (coleta ao vivo, ~3 min), corta trechos
// da saída e desenha cada um numa janela de terminal com o Playwright. Nada é
// inventado: o script só remove linhas (contato das empresas e o excesso), e
// marca o corte com "…". Precisa do pacote `playwright` instalado.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// `createRequire` porque o `import` de ESM ignora NODE_PATH, e o Playwright costuma
// estar instalado globalmente.
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error(
    "Falta o pacote `playwright` (ex.: `bunx playwright install chromium`).",
  );
  process.exit(2);
}

const DB_PATH = process.env.DB_PATH;
if (!DB_PATH || DB_PATH === "./data/store.db") {
  console.error(
    "Defina DB_PATH para um banco descartável (o smoke grava nele).",
  );
  process.exit(2);
}

const OUT = ".github/assets";
mkdirSync(`${OUT}/screenshots`, { recursive: true });

// Sequência de cor ANSI; o ESC vem de fromCharCode para o lint não acusar caractere de controle.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const strip = (s) => s.replace(ANSI, "");
const rodar = (script, env) => {
  const r = spawnSync("bun", ["run", script], {
    env: { ...process.env, DB_PATH, ...env },
    encoding: "utf8",
    maxBuffer: 1 << 27,
  });
  if (r.status !== 0)
    throw new Error(`bun run ${script} saiu com ${r.status}\n${r.stderr}`);
  return strip(r.stdout).split("\n");
};

console.log("smoke…");
const smoke = rodar("smoke", { PAGES_PER_BOARD: "1", INFOJOBS_FILTROS: "0" });
console.log("digest…");
const digest = rodar("digest", { JOBS_PER_DIGEST: "6" });

// ── recortes ──────────────────────────────────────────────────────────────
const idx = (linhas, re, de = 0) => {
  const i = linhas.findIndex((l, n) => n >= de && re.test(l));
  if (i < 0) throw new Error(`não achei ${re} na saída`);
  return i;
};

// Tabela do console.table: 3 linhas de cabeçalho, N linhas de dados, borda final.
const tabela = (linhas, titulo, n) => {
  const ini = idx(linhas, titulo);
  const topo = idx(linhas, /^┌/, ini);
  const fim = idx(linhas, /^└/, topo);
  const corpo = linhas.slice(topo, fim + 1);
  return n && corpo.length > 3 + n + 1
    ? [...corpo.slice(0, 3 + n), "…", corpo[corpo.length - 1]]
    : corpo;
};

const fontes = [
  smoke[idx(smoke, /^=== SMOKE/)],
  ...tabela(smoke, /^=== SMOKE/),
];
const lista = [
  smoke[idx(smoke, /^=== LISTA ORDENADA/)],
  ...tabela(smoke, /^=== LISTA ORDENADA/, 10),
];

// Post por área: duas primeiras áreas do digest, sem a linha de contato.
const areaRe = /^\S+ \*.+\* \(\d+\)$/;
const a1 = idx(digest, areaRe);
const a2 = idx(digest, areaRe, a1 + 1);
const a3 = idx(digest, /^\[telegram\]|^\S+ \*.+\* \(\d+\)$/, a2 + 1);
const post = digest
  .slice(a1, a3)
  .filter(
    (l) => !/^\s*✉️/.test(l) && !/^\[telegram\]/.test(l) && l.trim() !== "",
  )
  .map((l) => (areaRe.test(l) ? `\n${l}` : l))
  .join("\n")
  .trim()
  .split("\n");

// Raio-X: do título até a primeira lista de áreas.
const r0 = idx(digest, /^📊 \*Raio-X/);
const r1 = idx(digest, /^\*O que mais abre vaga\*/, r0);
const raiox = digest.slice(r0, r1).filter((l) => !/^\[telegram\]/.test(l));
while (raiox.at(-1)?.trim() === "") raiox.pop();
raiox.push("", "…");

// ── desenho ───────────────────────────────────────────────────────────────
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONTE =
  "'JetBrains Mono','DejaVu Sans Mono','Noto Color Emoji',ui-monospace,monospace";

const CHAR = 9; // largura de um caractere monoespaçado a 15px
const larguraDe = (linhas, minimo) =>
  Math.max(minimo, Math.max(...linhas.map((l) => [...l].length)) * CHAR + 64);

const janela = (titulo, comando, linhas, largura, semQuebra = false) => `
<div style="width:${largura}px;background:#0b1220;border:1px solid #1e293b;border-radius:14px;overflow:hidden;font-family:${FONTE}">
  <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#111a2e;border-bottom:1px solid #1e293b">
    <span style="width:12px;height:12px;border-radius:50%;background:#f87171"></span>
    <span style="width:12px;height:12px;border-radius:50%;background:#fbbf24"></span>
    <span style="width:12px;height:12px;border-radius:50%;background:#4ade80"></span>
    <span style="margin-left:10px;color:#94a3b8;font-size:14px">${esc(titulo)}</span>
  </div>
  <pre style="margin:0;padding:18px 20px;color:#e2e8f0;font-size:${semQuebra ? 15 : 16}px;line-height:1.45;white-space:${semQuebra ? "pre" : "pre-wrap;overflow-wrap:anywhere"}"><span style="color:#4ade80">$</span> ${esc(comando)}\n${esc(linhas.join("\n"))}</pre>
</div>`;

const pagina = (corpo, w, h) =>
  `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#020617;width:${w}px;${h ? `height:${h}px;` : ""}">${corpo}</body>`;

const browser = await chromium.launch();
const tirar = async (html, w, h, arquivo) => {
  const page = await browser.newPage({
    viewport: { width: w, height: h ?? 400 },
    deviceScaleFactor: 2,
  });
  await page.setContent(html);
  await page.screenshot({ path: arquivo, fullPage: !h });
  await page.close();
  console.log("ok", arquivo);
};

await tirar(
  pagina(janela("bun run digest", "bun run digest", post, 900), 900),
  900,
  null,
  `${OUT}/screenshots/post.png`,
);
await tirar(
  pagina(janela("bun run digest", "bun run digest", raiox, 900), 900),
  900,
  null,
  `${OUT}/screenshots/raio-x.png`,
);
const wLista = larguraDe(lista, 900);
await tirar(
  pagina(janela("bun run smoke", "bun run smoke", lista, wLista, true), wLista),
  wLista,
  null,
  `${OUT}/screenshots/lista-por-salario.png`,
);
await tirar(
  pagina(janela("bun run smoke", "bun run smoke", fontes, 900), 900),
  900,
  null,
  `${OUT}/screenshots/fontes.png`,
);

// Cabeçalho 1280×640: nome e frase à esquerda, a tabela de fontes real à direita.
const hero = `
<div style="width:1280px;height:640px;background:#0f172a;display:flex;align-items:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="width:520px;padding:0 0 0 80px">
    <div style="color:#4ade80;font-size:30px;font-weight:600">Franca-SP · Telegram</div>
    <div style="color:#f8fafc;font-size:78px;font-weight:800;line-height:1.05;margin:10px 0 24px">vagas-<br/>franca</div>
    <div style="color:#94a3b8;font-size:30px;line-height:1.35">As vagas abertas da cidade, todo dia, com salário e requisitos.</div>
  </div>
  <div style="margin-left:48px">${janela("bun run smoke", "bun run smoke", fontes, 580)}</div>
</div>`;
await tirar(pagina(hero, 1280, 640), 1280, 640, `${OUT}/readme-header.png`);

await browser.close();
