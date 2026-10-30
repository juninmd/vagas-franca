# Interface web

Uma página de consulta com todas as vagas do banco: busca, filtros, ordenação por salário e o detalhe de cada vaga. Só leitura; quem coleta e publica continua sendo o bot. Visão geral e prints no [README](../README.md).

## Como rodar

```bash
bun run web:install                       # dependências do front (web/bun.lock)
bun run web:build                         # gera web/dist (tsc + vite build)
DB_PATH=/tmp/vagas.db bun run web         # serve a API e o front em http://127.0.0.1:3000
```

Em desenvolvimento, com recarga a quente:

```bash
DB_PATH=/tmp/vagas.db bun run web         # terminal 1: a API
bun run web:dev                           # terminal 2: Vite em http://localhost:5173, com /api repassado à porta 3000
```

| Variável | Para quê | Padrão |
|---|---|---|
| `PORT` | porta do servidor (`0` escolhe uma livre) | `3000` |
| `HOST` | endereço de escuta | `127.0.0.1` |
| `API_PORT` | porta da API que o Vite repassa em desenvolvimento | `3000` |
| `DB_PATH` | banco SQLite (o mesmo do bot) | `./data/store.db` |

> [!WARNING]
> A página mostra e-mail e telefone que anunciantes publicaram. Por isso o servidor escuta só em `127.0.0.1`; `HOST=0.0.0.0` é uma decisão sua e não há login. Não exponha à internet sem um proxy com autenticação na frente.

## Arquitetura

```
SQLite ─→ src/server.ts ─→ GET /api/vagas ─┐
                                           ├─→ web/ (React + Tailwind), build em web/dist
          src/web-server.ts ─→ arquivos ───┘
```

| Peça | Papel |
|---|---|
| `src/vagas-api.ts` | transforma cada linha do banco no JSON da API; puro, sem banco |
| `src/web-server.ts` | rotas, arquivos estáticos, cabeçalhos de segurança e gzip; recebe de onde ler as vagas, então testa-se sem rede |
| `src/server.ts` | liga o SQLite ao handler e sobe o `Bun.serve` |
| `web/src/lib/filtros.ts` | filtro, ordenação, resumo e estado na URL; funções puras e testadas |
| `web/src/components/` | cartão, gaveta de detalhe, painel de filtros, resumo e estados |

O front é um projeto separado (`web/package.json`, `web/bun.lock`): o bot e o `Dockerfile` não ganham dependência nenhuma.

## Contrato da API

`GET /api/vagas` devolve:

```json
{
  "geradoEm": "2026-10-30T14:02:11.000Z",
  "atualizadoEm": "2026-10-29",
  "total": 1033,
  "vagas": [
    {
      "id": "…", "titulo": "Caixa", "empresa": "Mercado X", "area": "Vendas & Comércio",
      "salario": "R$ 2.114", "salarioValor": 2114, "jornada": null,
      "contrato": "CLT", "modalidade": "Presencial", "cidade": "Franca", "fonte": "Emprego em Franca",
      "link": "https://…", "descricao": "…", "requisitos": "Ensino médio completo",
      "prazo": "2026-11-27", "publicadaEm": null, "vistaEm": "2026-10-29",
      "contato": "rh@mercado.com.br", "pcd": false
    }
  ]
}
```

- `atualizadoEm` é a data da coleta mais recente, não a hora da requisição: é o quão fresco é o que se vê.
- `salarioValor` é o piso em reais (entre 800 e 30.000) e serve para ordenar e filtrar; `salario` é o texto para exibir.
- `link` só sai se for `http(s)`; `contato` só sai como e-mail e telefone; `requisitos` só existe quando a descrição os rotula. São as mesmas regras do post do Telegram.
- A lista inteira vai numa resposta e é filtrada no navegador. Com ~1.000 vagas são ~880 KB, ou ~180 KB com gzip (que o servidor aplica quando o navegador aceita).

## Decisões de interface

- **Tema pelo sistema.** `color-scheme: light dark` e tokens com `light-dark()` no `@theme` do Tailwind; não há botão de tema, porque quem fixa o esquema contra o sistema é raro.
- **Gaveta e folha de filtros em `<dialog>` nativo**, abertos com `showModal()`: foco, Esc, fundo inerte e retorno do foco ao cartão ficam com o navegador. Sem `role`, `aria-modal` nem armadilha de foco escritos à mão. Onde falta `closedby` (Safari), um fallback por ponteiro fecha ao clicar fora.
- **O cartão inteiro é clicável** por um único botão no título (`after:absolute after:inset-0`): um só foco por cartão e o nome acessível é o cargo.
- **Os filtros ficam na URL** (`?q=caixa&min=2000&contrato=CLT`): a busca é um link que dá para mandar.
- **As contagens de cada grupo ignoram a própria seleção**, para marcar uma área não zerar as outras e dar para somar escolhas.
- **Lista longa.** 36 cartões por vez, e os que ficam abaixo da primeira tela usam `content-visibility: auto` com `contain-intrinsic-size`, para a barra de rolagem não pular. O teclado atravessa esses cartões (verificado, ver abaixo).
- **Estados.** Carregando (esqueleto só depois de 200 ms, para não piscar), erro com o motivo e "Tentar de novo", banco vazio com o comando que o enche, e sem resultados com "Limpar filtros". Uma resposta tardia nunca sobrescreve a atual (a busca anterior é cancelada).

## Testes e verificação

```bash
bun test                                   # raiz e web/src juntos: API, rotas e lógica de filtros
(cd web && bun run build)                  # tsc --noEmit e vite build
DB_PATH=/tmp/vagas.db node scripts/web-screenshots.mjs   # roteiro no navegador e prints do README
```

O roteiro `scripts/web-screenshots.mjs` sobe o servidor de verdade contra o banco indicado, abre o build de produção no Chromium e falha com código 1 se algo estiver errado. Ele confere:

- console sem erro nem aviso, e nenhuma requisição para fora do próprio servidor;
- busca, salário mínimo e "Limpar" refletidos na lista, na contagem anunciada e na URL;
- Enter no título abre a gaveta, o foco entra nela, Esc fecha e o foco volta ao cartão;
- 25 Tabs seguidos passam por 25 cartões em sequência, inclusive os de render adiado;
- tema escuro pelo sistema e ausência de rolagem horizontal no celular.

Os prints usam uma vaga sem contato e recente, para não mostrar e-mail nem telefone de ninguém.

## Limites

- Não há autenticação, paginação no servidor nem atualização em tempo real: a página lê o banco quando é carregada.
- O servidor não faz parte da imagem Docker do bot; rode `bun run web` onde o banco estiver.
- A API devolve vagas com até 21 dias sem serem revistas (o TTL do banco); a data da coleta no cabeçalho mostra a idade do que se vê.
