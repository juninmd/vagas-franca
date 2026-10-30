// Verifica a interface web no navegador e tira os prints do README.
//
//   bun run web:build
//   DB_PATH=/tmp/vagas.db node scripts/web-screenshots.mjs
//
// Sobe o servidor de verdade (`src/server.ts`) contra o banco indicado, abre o
// build de produção no Chromium e confere o que não dá para ver num teste de
// função: console limpo, nenhuma requisição para fora, teclado, foco, Esc, URL
// e os dois temas. Falha com código 1 se algo estiver errado. Precisa do pacote
// `playwright`; o banco precisa ter vagas (rode `bun run ingest` antes).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const DB_PATH = process.env.DB_PATH;
if (!DB_PATH || DB_PATH === "./data/store.db") {
  console.error(
    "Defina DB_PATH para uma cópia do banco (o servidor só lê, mas por segurança não use o de produção).",
  );
  process.exit(2);
}
const OUT = ".github/assets/screenshots";
mkdirSync(OUT, { recursive: true });

// ── servidor ──────────────────────────────────────────────────────────────
const servidor = spawn("bun", ["run", "src/server.ts"], {
  env: { ...process.env, DB_PATH, PORT: "0" },
  stdio: ["ignore", "pipe", "inherit"],
});
const base = await new Promise((resolve, reject) => {
  const t = setTimeout(
    () => reject(new Error("servidor não subiu em 15 s")),
    15000,
  );
  servidor.stdout.on("data", (b) => {
    const m = String(b).match(/http:\/\/127\.0\.0\.1:\d+/);
    if (m) {
      clearTimeout(t);
      resolve(m[0]);
    }
  });
});
console.log("servidor em", base);

const falhas = [];
const confere = (ok, msg) => {
  console.log(ok ? "  ok " : "  FALHOU", msg);
  if (!ok) falhas.push(msg);
};

// Vaga para o print da gaveta: tem salário, requisitos e empresa, é recente
// (publicada há até 60 dias, ou a fonte não informa a data) e **não** tem
// contato — o print não deve mostrar e-mail nem telefone de ninguém.
const api = await (await fetch(`${base}/api/vagas`)).json();
const recente = (v) =>
  !v.publicadaEm || (Date.now() - Date.parse(v.publicadaEm)) / 86_400_000 <= 60;
const escolhida = api.vagas
  .filter(
    (v) =>
      v.salarioValor &&
      v.requisitos &&
      v.empresa &&
      !v.contato &&
      v.link &&
      recente(v),
  )
  .sort((a, b) => b.salarioValor - a.salarioValor)[0];
confere(
  Boolean(escolhida),
  `há vaga para o print da gaveta (${escolhida?.titulo})`,
);

const browser = await chromium.launch();

async function abre(contexto, caminho = "/") {
  const page = await contexto.newPage();
  const erros = [];
  const externas = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()))
      erros.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
      externas.push(r.url());
  });
  await page.goto(base + caminho, { waitUntil: "networkidle" });
  await page.waitForSelector("article");
  return { page, erros, externas };
}

// ── desktop, tema claro ───────────────────────────────────────────────────
const claro = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "light",
  locale: "pt-BR",
});
{
  const { page, erros, externas } = await abre(claro);
  confere(
    (await page.locator("article").count()) > 0,
    `lista renderiza (${await page.locator("article").count()} cartões no primeiro lote)`,
  );
  confere(
    (await page.locator("h1").innerText()) === "Vagas em Franca-SP",
    "título h1",
  );
  confere(
    await page
      .locator("html")
      .evaluate((e) => getComputedStyle(e).colorScheme.includes("light")),
    "color-scheme declarado",
  );
  await page.screenshot({ path: `${OUT}/web-lista-claro.png` });

  // busca: filtra, atualiza a URL e anuncia a contagem
  await page.fill("#busca", "caixa");
  await page.waitForFunction(() =>
    /de \d/.test(document.querySelector("[aria-live]")?.textContent ?? ""),
  );
  const contagem = await page.locator("[aria-live]").innerText();
  confere(
    /de [\d.]+ vagas/.test(contagem),
    `busca "caixa" filtra e anuncia: ${contagem}`,
  );
  confere(page.url().includes("q=caixa"), "busca vai para a URL");

  // filtro de salário mínimo + só com salário, pela lateral
  await page.fill("#busca", "");
  await page.locator("#lateral-min").fill("2500");
  await page.waitForTimeout(150);
  confere(page.url().includes("min=2500"), "salário mínimo vai para a URL");
  // textContent, não innerText: cartão fora da tela com `content-visibility: auto`
  // ainda não foi desenhado e o innerText dele vem vazio.
  const cartoes = await page
    .locator("article")
    .evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  const abaixo = cartoes.filter((t) => {
    const m = t.match(/R\$\s?([\d.]+)/);
    return !m || Number(m[1].replace(/\./g, "")) < 2500;
  });
  confere(
    cartoes.length > 0 && abaixo.length === 0,
    `com mínimo de R$ 2.500 todos os ${cartoes.length} cartões têm salário >= 2.500`,
  );

  // limpar volta ao todo
  await page
    .getByRole("button", { name: /^Limpar/ })
    .first()
    .click();
  confere(!page.url().includes("min="), "Limpar tira o filtro da URL");

  // vazio sem resultado
  await page.fill("#busca", "zzzxxyy");
  await page.waitForSelector("text=Nenhuma vaga com esses filtros");
  confere(true, "estado vazio por filtro tem texto e botão de limpar");
  await page.fill("#busca", "");

  // abrir a gaveta pelo cartão, com teclado
  await page.goto(`${base}/?q=${encodeURIComponent(escolhida.titulo)}`, {
    waitUntil: "networkidle",
  });
  const botao = page
    .getByRole("button", { name: escolhida.titulo, exact: true })
    .first();
  await botao.focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("dialog[open]");
  confere(true, "Enter no título abre a gaveta");
  confere(
    await page.evaluate(
      () => document.activeElement?.closest("dialog") !== null,
    ),
    "foco entra na gaveta",
  );
  confere(
    (await page.locator("dialog[open] h2").first().innerText()).includes(
      escolhida.titulo.slice(0, 20),
    ),
    "gaveta mostra a vaga escolhida",
  );
  confere(
    (await page
      .locator("dialog[open] a[target=_blank]")
      .getAttribute("rel")) === "noopener noreferrer",
    "link de candidatura abre fora com noopener noreferrer",
  );
  await page.screenshot({ path: `${OUT}/web-detalhe-claro.png` });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  confere(true, "Esc fecha a gaveta");
  confere(
    await botao.evaluate((b) => b === document.activeElement),
    "foco volta ao cartão que abriu",
  );

  confere(
    erros.length === 0,
    `console sem erro nem aviso${erros.length ? `: ${erros.join(" | ")}` : ""}`,
  );
  confere(
    externas.length === 0,
    `nenhuma requisição para fora${externas.length ? `: ${externas.join(", ")}` : ""}`,
  );
  await page.close();
}

// ── teclado atravessa cartões adiados (content-visibility) ────────────────
// Cada cartão tem um único foco (o botão do título). Partindo do primeiro, cada
// Tab deve cair no cartão seguinte, inclusive nos que o navegador ainda não desenhou.
{
  const { page } = await abre(claro);
  await page.locator("article button").first().focus();
  const indice = () =>
    page.evaluate(() => {
      const a = document.activeElement?.closest("article");
      return a ? [...document.querySelectorAll("article")].indexOf(a) : -1;
    });
  let esperado = await indice();
  let seguiu = esperado === 0;
  for (let i = 0; i < 24 && seguiu; i++) {
    await page.keyboard.press("Tab");
    esperado += 1;
    seguiu = (await indice()) === esperado;
  }
  confere(
    seguiu && esperado === 24,
    `Tab passa por 25 cartões em sequência, além dos 8 sem render adiado (parou no ${esperado})`,
  );
  await page.close();
}

// ── desktop, tema escuro ──────────────────────────────────────────────────
const escuro = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  locale: "pt-BR",
});
{
  const { page, erros } = await abre(escuro);
  const fundo = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  confere(
    fundo !== "rgb(255, 255, 255)",
    `tema escuro segue o sistema (fundo ${fundo})`,
  );
  await page.screenshot({ path: `${OUT}/web-lista-escuro.png` });
  confere(erros.length === 0, "console limpo no escuro");
  await page.close();
}

// ── celular ───────────────────────────────────────────────────────────────
const celular = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  colorScheme: "light",
  locale: "pt-BR",
  isMobile: true,
  hasTouch: true,
});
{
  const { page, erros } = await abre(celular);
  const larguraPagina = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  confere(
    larguraPagina <= 390,
    `sem rolagem horizontal no celular (largura ${larguraPagina})`,
  );
  await page.screenshot({ path: `${OUT}/web-celular.png` });
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page.waitForSelector("dialog[open]");
  await page.screenshot({ path: `${OUT}/web-celular-filtros.png` });
  confere(true, "botão Filtros abre a folha no celular");
  confere(erros.length === 0, "console limpo no celular");
  await page.close();
}

await browser.close();
servidor.kill();
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : "\nUI OK");
process.exit(falhas.length ? 1 : 0);
