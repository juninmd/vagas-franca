# vagas-franca 💼

Bot de Telegram que publica todo dia as vagas de emprego abertas em Franca-SP — profissão, salário, jornada, contrato, requisitos e link pra se candidatar — e uma análise do mercado (Raio-X). Coleta de 10 portais e murais locais, guarda tudo em SQLite sem repetir vaga, e usa IA só para ler salário e jornada que o portal não publica em campo próprio. Bun, sem build.

Não há interface web: a saída é o Telegram, ou o console quando não há token.

## Pré-requisitos

- [Bun](https://bun.sh) — testado com 1.4.4.
- Para publicar no Telegram: token de um bot e o id do chat. Sem isso o post é impresso no console.
- Para a IA: um dos provedores de `AI_PROVIDER`. Sem IA o post sai igual, só com os salários que os portais informam.

## Início rápido

Verificado num checkout limpo em 29/10/2026.

```bash
git clone https://github.com/juninmd/vagas-franca.git && cd vagas-franca
bun install --frozen-lockfile
cp .env.example .env

# Coleta ao vivo num banco descartável e mostra o resultado (~2,5 min, ~680 vagas)
DB_PATH=/tmp/vagas.db PAGES_PER_BOARD=1 INFOJOBS_FILTROS=0 bun run smoke

# Imprime o post de hoje no console (sem TELEGRAM_BOT_TOKEN)
DB_PATH=/tmp/vagas.db bun run digest
```

O `smoke` recusa rodar sem `DB_PATH` (ou com `./data/store.db`): ele grava no banco. Para publicar de verdade, preencha `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_IDS` no `.env` e rode `bun run dev`.

Trecho do que o `digest` imprime (Markdown do Telegram, como sai no console; `JOBS_PER_DIGEST=3` limita o post):

```
🛍️ *Vendas & Comércio* (1)

• *Caixa* — Suave Cor Tintas - Loja de Tintas
  💰 R$ 2.016
  📍 Presencial · Franca
  ✅ _Disponibilidade para trabalhar das 07h até as 18:00h (com 2h de almoço e rodízio aos sábados). Ensino médio completo. Conhecimentos em Word, excel e e-mail. …_
  ✉️ rhtintasfranca@gmail.com
  🔗 [Ver vaga e se candidatar](https://empregoemfranca.com/vagas/caixa-8478541/) · _Emprego em Franca_
```

## Comandos

| Comando | O que faz |
|---|---|
| `bun run dev` | 1 ciclo: coleta + digest |
| `bun run ingest` | só coleta |
| `bun run digest` | só publica (enriquece a fila do dia antes) |
| `bun start` | loop com cron (`CRON_INGESTION`, `CRON_DIGEST`) |
| `DB_PATH=... bun run smoke` | coleta ao vivo e imprime fontes, top 10 de oportunidades e a lista por salário |
| `bun test` | ~220 testes, sem rede |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Biome, **corrigindo** os arquivos (`--write`); para só checar, como a CI: `bunx biome ci .` |

`bun test` termina com 1 falha anterior a este trabalho, em `tests/db.test.ts` ("banco somente-leitura derruba o boot"): o processo filho morre com `no such column: area` em vez da mensagem `readonly` que o teste espera. Falha também fora de root (verificado como `nobody`); os outros ~220 testes passam.

## Configuração

Tudo por variável de ambiente (o Bun lê o `.env` sozinho). Modelo completo em [`.env.example`](.env.example).

| Variável | Padrão | Para quê | Exemplo |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | token do bot; vazio imprime no console | `123456:ABC...` |
| `TELEGRAM_CHAT_IDS` | — | chats que recebem o post, separados por vírgula | `123456789` |
| `DB_PATH` | `./data/store.db` | banco SQLite (o estado do radar: dedupe, "já postei", histórico) | `/data/store.db` |
| `AI_PROVIDER` | `litellm` | `litellm` \| `ollama` \| `openai` \| `anthropic` \| `google` | `ollama` |
| `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL` | cluster interno | provedor padrão | — |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | `localhost:11434`, `llama3.2` | IA local | — |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (+ `*_MODEL`) | — | provedores em nuvem | `sk-...` |
| `CRON_INGESTION` | `0 */6 * * *` | coleta de 6 em 6 horas | |
| `CRON_DIGEST` | `0 11 * * *` | post diário, 8h BRT | |
| `CRON_TZ` | `UTC` | fuso das expressões de cron | `America/Sao_Paulo` |
| `JOBS_PER_DIGEST` | `60` | teto de vagas por post; o resto sai nos dias seguintes | |
| `ENRICH_MAX_JOBS` | `120` | teto de vagas mandadas à IA por rodada | |
| `PAGES_PER_BOARD` | `5` | páginas varridas por portal HTML | |
| `INFOJOBS_FILTROS` | `120` | filtros públicos do InfoJobs abertos por rodada (a página expõe ~90) | `0` |
| `DETAIL_PAGES` | `12` | páginas de detalhe abertas por rodada, por portal (o BNE usa `× 3`) | |
| `JOB_TTL_DAYS` | `21` | vaga não revista há tanto tempo é considerada encerrada | |
| `TELEGRAM_INTERVAL_MS` | `3500` | espaçamento entre mensagens (o Telegram corta em ~20/min por grupo) | |
| `AI_TIMEOUT_MS` | `60000` | teto por chamada de IA | |

> **Segurança:** `NODE_TLS_REJECT_UNAUTHORIZED=0` desliga a validação de certificado do processo inteiro — inclusive na chamada ao Telegram, que leva o token do bot. Para certificado interno de cluster use `NODE_EXTRA_CA_CERTS=/caminho/ca.crt`, que confia só naquela CA. O agente avisa no boot se encontrar a variável ligada.

## Como funciona

```
portais e murais (HTML/JSON) ─┐
                              ├─→ SQLite (dedupe por link e por empresa+cargo, TTL de 21 dias)
Google News (RSS) ────────────┘        │
                                       ├─→ regras: salário rotulado, contrato, requisitos
                                       ├─→ IA: salário/jornada/benefícios que sobraram
                                       └─→ Telegram: post por área + Raio-X
```

Nada é marcado como publicado antes de o envio confirmar; uma queda do Telegram ou da IA não faz o radar perder vaga.

## Fontes

Vagas de Franca no smoke ao vivo de 29/10/2026, com `PAGES_PER_BOARD=10`: **~1.080 em 10 fontes**.

| Fonte | Vagas |
|---|---|
| Franca Classificados | ~310 |
| InfoJobs | ~190 |
| TrabalhaBrasil | ~150 |
| Hard Franca | ~120 |
| Melhores Empregos | ~100 |
| Mural ACIF | ~75 |
| Emprego em Franca | ~75 |
| empregos.com.br | ~30 |
| Emprego Franca | 20 |
| BNE | ~12 por rodada |

Os números variam com o dia e com `PAGES_PER_BOARD`. Cada fonte e o que ficou de fora estão em [docs/fontes.md](docs/fontes.md).

## Limites

- Não existe lista oficial das vagas de Franca; "o máximo" não é verificável. A cobertura é a dos portais abertos e permitidos.
- **Gupy** devolveu 404 no ambiente de teste e não foi validada ao vivo; **Catho** e **Indeed** bloqueiam coleta e ficam de fora.
- Hard Franca e Franca Classificados não têm data por anúncio: pode haver vaga já preenchida.
- A CI do repositório (`Validate`, Security Scan, Docker) falha em segundos em todos os runs desde 23/10, sem passos nem log. Compatível com bloqueio de cobrança do Actions; não é o código. Detalhes no [`AGENTS.md`](AGENTS.md).

## Deploy

```bash
docker build -t vagas-franca . && docker run -d -v vagas:/data \
  -e TELEGRAM_BOT_TOKEN=... -e TELEGRAM_CHAT_IDS=... vagas-franca
```

Esses dois comandos não foram executados: o ambiente em que este README foi escrito não tinha o daemon do Docker.

O volume em `/data` guarda o banco; sem ele cada deploy reposta tudo do zero. O contêiner roda `bun run src/index.ts --loop`; sem `--loop` o processo roda um ciclo e sai.

## Documentação

- [docs/fontes.md](docs/fontes.md) — cada portal, cobertura, limites e armadilhas já investigadas.
- [docs/parsers-e-ia.md](docs/parsers-e-ia.md) — regras de salário/contrato/requisitos, entrega confirmada e o que a IA faz.
- [docs/raio-x-e-post.md](docs/raio-x-e-post.md) — a análise do mercado e o formato do post.
- [`AGENTS.md`](AGENTS.md) — instruções para agentes e padrão dos workflows.
