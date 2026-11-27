# Migração do `web/` para o `@juninmd/sonido`

O front do vagas-franca mantinha à mão as mesmas primitivas que o
[`@juninmd/sonido`](https://github.com/juninmd/sonido) publica. Esta pasta guarda a
comparação lado a lado usada na revisão: o lado **Antes** importa cópias literais de
`origin/main` em `legacy/`; o **Depois** importa os arquivos do app já apoiados no
Sonido 2.5.0.

## Componentes trocados

| Componente   | Antes (vagas-franca)                                                                                  | Depois (`@juninmd/sonido`)                                                                 | Arquivos                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Button`     | `<button>` com `rounded-md border …` repetido em cada tela; link de candidatura era um `<a>` estilizado | `Button` com `variant` (`primary`/`secondary`/`link`), `appearance="outline"`, `size` sm/md/lg e `href` | `web/src/App.tsx`, `web/src/components/Estados.tsx`, `web/src/components/Filtros.tsx`, `web/src/components/VagaGaveta.tsx` |
| `Badge`      | `const chip = "rounded-md border …"` para contrato/modalidade/PcD/área; prazo era um `<span>` com `bg-aviso-fundo` | `Badge` soft (neutral/accent/warning) e `appearance="count"` nos contadores das facetas      | `web/src/components/VagaCard.tsx`, `web/src/components/Filtros.tsx`, `web/src/App.tsx`        |
| `SearchField`| `<label class="sr-only">` + `<input type="search">` com classes Tailwind                              | `SearchField` (rótulo acessível, lupa, limpar e Esc)                                        | `web/src/App.tsx`                                                                             |
| `EmptyState` | três blocos `div.rounded-lg.border` com título, texto e botão                                          | `EmptyState` com `titleAs="h2"` e `action`; o erro mantém o wrapper `role="alert"`         | `web/src/components/Estados.tsx`                                                              |
| `StatTile`   | `Dado` com `dl`/`dt`/`dd` e cartão desenhado à mão                                                     | `StatTile` (label, valor, hint) dentro de uma `section` rotulada                           | `web/src/components/Resumo.tsx`                                                               |
| `Card`       | `div.sticky … rounded-lg border bg-superficie p-4` da lateral                                           | `Card surface="solid" padding="sm"` dentro do wrapper que continua responsável pelo sticky | `web/src/App.tsx`                                                                             |
| `Skeleton`   | cinco `div.bg-superficie-2` por cartão com `animate-pulse`                                              | `Skeleton rows={6}` com shimmer e respeito a `prefers-reduced-motion`                      | `web/src/components/Estados.tsx`                                                              |

O comportamento e a ARIA continuam os mesmos: `role="alert"` no erro, `titleAs="h2"` nos
títulos, `aria-live` da contagem de vagas, `<ul>/<li>` das pílulas, `dl` de fatos na
gaveta e os `<dialog>` nativos (foco, Esc, fundo inerte e `closedby`) intactos.

## Tema e tokens

- `@juninmd/sonido/styles.css` é importado **uma vez** em `web/src/main.tsx`, antes de
  `index.css` e da ponte.
- `web/src/sonido-bridge.css` mapeia os tokens `--sn-*` para a paleta que o app já tinha
  (`--color-fundo`, `--color-superficie`, `--color-texto`, `--color-marca-fundo` etc.),
  incluindo escala de texto (12/14/18 px), raios de 6/8 px, fonte do sistema e
  `--sn-shadow-card: none`. O verde da marca continua verde; nada de coral/violeta.
- O app segue o sistema, então `main.tsx` grava `data-theme="light"` ou `"dark"` a partir
  de `prefers-color-scheme` e escuta mudanças. Sem isso, o `:root` unlayered do Sonido
  (dark) venceria o `light-dark()` dos tokens do app.
- O CSS do Sonido é distribuído como um bundle único e unlayered. Por isso os
  componentes do Sonido não recebem utilitários que disputem `display`, `padding` ou
  `height`: o `lg:hidden` do botão de filtros virou um `<span>` em volta, e o sticky da
  lateral ficou no wrapper do `Card`.

## Capturas

`preview.html` + `preview.tsx` montam a mesma página com os dois lados, usando o CSS real
do app (`web/src/index.css`), a ponte e o `styles.css` instalado do Sonido.

```bash
# na raiz do repositório (usa o Vite e o Sonido instalados em web/)
node web/node_modules/vite/bin/vite.js --config web/vite.preview.config.ts
# http://localhost:5316/preview.html          (tema escuro)
# http://localhost:5316/preview.html?theme=light
node C:/caminho/para/full.cjs "http://localhost:5316/preview.html" "docs/sonido-migration/antes-depois.png"
```

As capturas `antes-depois.png` (escuro) e `antes-depois-claro.png` (claro) foram feitas
em Chromium 1180×900, `fullPage`, device scale 2, com empresas, vagas e salários
fictícios.

## Verificação

```text
bun install (web, bun 1.4.5, --frozen-lockfile) → exit 0, @juninmd/sonido@2.5.0
bun run typecheck (web)                   → exit 0
bun test (web)                            → 33 pass, 0 fail
bun run build (web)                       → exit 0
bun run typecheck (raiz)                  → exit 0
bun test (raiz)                           → 288 pass, 0 fail
biome check web/src web/vite.preview.config.ts web/package.json docs/sonido-migration
                                          → exit 0 (1 warning no copy literal de legacy/)
```

O `bun.lock` do `web/` difere de `origin/main` em **três linhas**: a dependência no
workspace e a entrada resolvida de `@juninmd/sonido@2.5.0`. Nenhuma outra versão mudou.
O Bun global desta máquina é 1.3.13 e não lê `lockfileVersion: 2` (falha idêntica em
`origin/main`); por isso o install e os comandos acima rodaram com
`bunx bun@1.4.5`, a versão que gerou o lock.

Não havia teste de markup dos componentes do `web/`; nenhum teste foi alterado,
desabilitado ou pulado.

### Falha pré-existente de lint no Windows

`biome check .` na raiz continua vermelho por CRLF (`core.autocrlf=true`; o Biome espera
LF). A falha não é desta branch:

```text
# worktree limpo em origin/main (e18304f)
biome check .  → 70 errors, exit 1

# esta branch
biome check .  → 54 errors, exit 1 — todos em src/, scripts/ e tests/ intocados
```

Os arquivos do `web/` tocados foram normalizados para LF; o restante do repositório
continua exatamente como em `origin/main`. O único diagnóstico dentro de
`docs/sonido-migration` é um aviso (`suppressions/unused`) na cópia literal de
`legacy/Estados.tsx`, mantida como veio de `origin/main`.

## O que ficou de fora

- **`PageHeader`**: o cabeçalho do app é uma barra compacta, não um herói. Usar o
  `PageHeader` com `accent` mudaria o topo da página em vez de preservar o desenho; fica
  para uma decisão de design separada.
- **`Dialog`**: a folha de filtros do celular e a gaveta da vaga são `<dialog>` nativos
  com foco/Esc/`closedby`; o `Dialog` do Sonido é um overlay controlado com outra API.
- **`Checkbox`**: as facetas precisam de rótulo truncado + contador na mesma linha; o
  `<input type="checkbox">` nativo dentro do `<label>` continua lá.
- **`Select`**: a ordenação usa o `<select>` nativo, que já é acessível e tem estilo
  próprio; trocar exigiria refazer o controle.
- **`ProgressBar`/`ProgressRing`**: o app não exibe progresso.
- **`ConfirmButton`**: não há ação destrutiva no app.

## Nota de peso

O `styles.css` do Sonido é um arquivo único. O CSS do build foi de 18,66 kB para
165,34 kB (30,68 kB gzip); o JS cresceu ~3,6 kB. Se isso incomodar, o próximo passo é
publicar imports por componente no pacote.
