# vagas-franca 💼

Bot de Telegram que publica **todo dia a lista de vagas de emprego abertas em Franca-SP** — profissão, valor, jornada, tipo de contrato e link pra se candidatar.

Mesmo esqueleto dos agentes `role-radar` / `evo-agent`: fontes → SQLite (dedupe) → IA pt-BR → Telegram. Bun, sem build step.

## Como funciona

```
fontes (JSON/HTML)  ─┐
                     ├─→ SQLite (dedupe por link, TTL de 21 dias)
Google News (RSS)   ─┘        │
                              ├─→ enrich por IA: salário/jornada/benefícios da descrição
                              └─→ digest diário no Telegram, agrupado por área
```

### Fontes de vaga

| Fonte | Como | Traz |
|---|---|---|
| **Mural ACIF** (Assoc. Comercial e Industrial de Franca) | endpoints da SPA: `empregos-acif/carregar_vagas.php?pagina=N` + `detalhes_vaga.php?id=N` (JSON) | ~87 vagas de empresas da cidade, **com e-mail/telefone de contato** e requisitos (onde o horário aparece) |
| **Gupy** (portal público) | API JSON `employability-portal.gupy.io` | ~130 vagas de Franca + ~32 das cidades vizinhas, empresa, contrato, modalidade, descrição |
| **Emprego Franca** (empregofranca.com.br) | payload RSC do Next.js na página pública `/vagas` (20 vagas, 1 requisição) | salário exato/faixa em campo próprio, contrato, jornada, benefícios e WhatsApp/e-mail |
| **Franca Classificados** | seção "Lista de Empregos" (~310 anúncios em texto livre); link por hash do texto, título = profissão no começo do anúncio | salário (só o rotulado "salário") e contato por regra |
| **Melhores Empregos** | cards SSR em microdados `JobPosting`, `/vagas-em-franca-sp/N/` ordenado por data; só vaga dos últimos 30 dias | título, empresa (quando não é "confidencial"), contrato, modalidade e data real; o `baseSalary` do card é estimativa e é ignorado |
| **Emprego em Franca** (empregoemfranca.com) | home (~70 vagas) + detalhe por vaga, parse por rótulos (`Remuneração:`, `Benefícios:`, `Enviar currículo até`) | empresa, salário, benefícios, prazo e contato — só da seção de candidatura |
| **BNE** | HTML SSR `?Page=N`; data confirmada no `JobPosting` do detalhe (só vaga publicada nos últimos 30 dias entra) | cargo, empresa, modalidade, descrição |
| **Hard Franca** (hardfranca.com.br) | `anuncios.php` com ~160 anúncios inline; o id crescente do anúncio faz de relógio (janela de ~1 mês) | texto livre: salário e contato extraídos por regra; título já publicado por outra fonte é descartado |
| **TrabalhaBrasil** | HTML + `JobPosting` (JSON-LD) na página de detalhe | vagas operacionais, salário do card, descrição completa |
| **InfoJobs** | HTML da busca de Franca + até 40 filtros públicos da própria página (`data-url`: contrato, categoria, antiguidade, home office) | salário e modalidade em campo próprio; ~140 vagas em vez de 20 |
| **empregos.com.br** | HTML (SSR), páginas `/vagas/franca-sp/N` | descrição crua do anunciante — é onde aparecem salário e horário |
| **Google News + Jornal da Franca** | RSS | notícias de emprego: "Emprega Franca", mutirões do PAT, feirões |

Detalhes que custaram investigação e estão no código:

- `state=SP` na API da Gupy devolve **zero**; tem que ser `São Paulo` por extenso.
- O `baseSalary` do JSON-LD do TrabalhaBrasil é **faixa estimada de mercado**, não o valor da vaga (estágio com bolsa de R$ 1.000 vinha como "R$ 1.910 a R$ 2.973") — por isso é ignorado; salário confiável só o do card ou o extraído do texto.
- Rajada de requisições no TrabalhaBrasil derruba a fonte (captcha e depois 403): detalhe é buscado em série, poucos por rodada, e nunca duas vezes pra mesma vaga.
- A paginação do empregos.com.br é por **caminho** (`/vagas/franca-sp/2`); o `?pagina=2` é ignorado. Depois da 2ª página a busca degrada para Franco da Rocha e São Paulo, que o filtro de região descarta — por isso a fonte rende ~30 vagas de Franca.
- Mesma empresa + mesmo cargo em portais diferentes vale uma vaga só (`salvaVagas`, log `já vistas em outro portal`); dentro da mesma fonte nada é cortado, porque a Gupy publica uma vaga por loja. Só pega quando a fonte informa a empresa — Mural ACIF, Hard Franca e Franca Classificados não informam.
- A paginação `?page=N` do InfoJobs devolve sempre a página 1; o que amplia a cobertura são os filtros da própria página, abertos em série com pausa.
- A API da Gupy devolveu 404 no ambiente de teste de 29/10/2026 (`employability-portal.gupy.io` e `portal.api.gupy.io`); a API oficial (`api.gupy.io`) exige credencial. A fonte continua no código, mas não foi validada ao vivo.
- A classificação por área usa **só o título**: a descrição da loja cita "produção" e jogava "Assistente de Beleza" em Calçados & Indústria.
- A ordem em que as regras de área **casam** é separada da ordem em que as áreas **aparecem** no post. Amarradas, "Tutor de Fonoaudiologia" virava vaga de hospital só porque Saúde precisava aparecer antes de Educação.
- Cada mensagem do digest é uma área: o Telegram corta em ~20 mensagens/minuto por grupo e **áreas inteiras sumiam do post** com 429 silencioso. Os envios são espaçados e o `retry_after` é respeitado.
- Os endpoints da ACIF são relativos a `/empregos-acif/` (na raiz dão 404) e exigem `x-requested-with: XMLHttpRequest` + `referer`.
- `vagas.com.br/vagas-em-franca-sp` é uma armadilha: devolve vagas de **Franco da Rocha** e São Paulo, não de Franca. `empregafranca.com.br`, Jooble, Indeed e Catho bloqueiam (403/404). O portal da prefeitura (`www3.franca.sp.gov.br`) não é WordPress e não expõe feed/API — o "Emprega Franca" só chega via Google News.
- O Google News mistura mutirão de Curitiba e feirão de Sumaré na busca por Franca: as notícias passam por filtro de assunto **e** de cidade da microrregião.

## Raio-X do mercado (análise)

Depois da lista sai um post de análise calculado **em SQL/JS, sem IA** (número inventado é pior que número ausente), a partir de todo o estoque do banco:

- vagas abertas, novas do dia e quantas têm salário declarado;
- **variação contra a última foto publicada** (tabela `snapshots`, uma linha por dia, gravada só depois que o post sai — se o envio falhar, o dia não conta como fechado);
- **lente do setor calçadista**, que é o que faz a análise ser de Franca e não genérica: quantas vagas, quantas empresas e quanto paga o setor (vocabulário próprio — pesponto, chanfração, cabedal, solado);
- salário mediano geral e **mediana + teto por área** (áreas sem amostra são declaradas como tal, não estimadas);
- o que mais abre vaga, quem mais contrata (rótulos de anonimato como "Empresa Confidencial" e "Página de Carreira" são excluídos);
- distribuição de contrato, modalidade e cidade;
- **melhores oportunidades** (`src/destaques.ts`): ranking sem IA — salário (teto R$ 8k), CLT, benefícios, contato direto e empresa identificada; só concorre vaga com salário declarado;
- os maiores salários do radar e a contagem por fonte.

O parser de salário usa o piso da faixa e ignora valores fora de R$ 800–30.000, senão benefício ("VR 25,00") entra como salário e distorce a mediana.

### Entrega: nada é marcado sem ter saído

Quatro estados só avançam quando o envio confirma — é o que impede o radar de perder vaga em silêncio:

| Estado | Só muda se | Se falhar |
|---|---|---|
| `posted` da vaga | todas as áreas foram entregues | a vaga volta na fila do próximo digest |
| `digested` da notícia | o bloco de notícias foi entregue | volta no próximo |
| `snapshots` do dia | o raio-X foi entregue | o dia não fecha; a comparação segue apontando pra última foto no ar |
| `enriched` da vaga | a IA respondeu **aquele lote** | o lote é tentado de novo amanhã |

Antes, uma queda do Telegram ou da IA marcava tudo como feito e as vagas daquele dia nunca mais eram publicadas.

### O que a IA faz

Só uma coisa: ler a descrição e extrair **salário, jornada e benefícios** quando o portal não os publica em campo próprio.

Nada do que o modelo devolve é publicado sem passar por `src/confere.ts`, que aplica duas amarras independentes a cada campo:

| Amarra | Contra o quê | Como |
|---|---|---|
| **Ancoragem no texto** | alucinação (modelo pequeno inventa faixa salarial com facilidade) | o número do salário precisa existir na descrição **como token**, não como sequência de dígitos: comparar dígito a dígito fazia "44h … 8h … código 500" validar "R$ 4.481" |
| **Forma fechada** | injeção | salário precisa ter forma de salário, jornada precisa caber no alfabeto de jornada, e benefício precisa citar um benefício conhecido |

A segunda amarra existe porque a descrição é escrita por terceiro: quem a escreve controla a entrada do modelo **e** o texto contra o qual a ancoragem compara. Ancoragem sozinha barra o que o modelo inventa, não o que alguém plantou de propósito — sem forma fechada, `💰 R$ 1.500 CHAME NO ZAP …` era publicável.

O post sai igual mesmo se a IA estiver fora do ar: as vagas com salário de fonte estruturada continuam completas.

## Rodar

```bash
bun install
cp .env.example .env      # preencha TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_IDS
bun run dev               # 1 ciclo: ingest + digest
bun run ingest            # só coleta
bun run digest            # só publica (enriquece a fila do dia antes)
bun start                 # loop com cron
bun test                  # 80 testes, sem rede
bun run smoke             # coleta ao vivo (use DB_PATH descartável) e imprime o top 10
bun run typecheck
bun run lint
```

Sem `TELEGRAM_BOT_TOKEN` o digest é impresso no console — dá pra revisar o post antes de plugar o canal.

## Config (`.env`)

| Var | Padrão | Pra que |
|---|---|---|
| `AI_PROVIDER` | `litellm` | `litellm` \| `ollama` \| `openai` \| `anthropic` \| `google` |
| `CRON_INGESTION` | `0 */6 * * *` | coleta de 6 em 6 horas (UTC) |
| `CRON_DIGEST` | `0 11 * * *` | post diário 8h BRT |
| `JOBS_PER_DIGEST` | `60` | teto de vagas por post — o resto sai nos dias seguintes |
| `ENRICH_MAX_JOBS` | `120` | teto de vagas mandadas à IA por rodada |
| `PAGES_PER_BOARD` | `5` | páginas varridas por portal HTML |
| `DETAIL_PAGES` | `12` | páginas de detalhe abertas por rodada (educação com o portal) |
| `JOB_TTL_DAYS` | `21` | vaga não revista há tanto tempo é considerada encerrada |
| `TELEGRAM_INTERVAL_MS` | `3500` | espaçamento entre mensagens (o Telegram corta em ~20/min por grupo) |
| `CRON_TZ` | `UTC` | fuso das expressões de cron — explícito pra não depender do relógio do host |
| `AI_TIMEOUT_MS` | `60000` | teto por chamada de IA |

> **Segurança:** `NODE_TLS_REJECT_UNAUTHORIZED=0` desliga a validação de certificado do processo inteiro — inclusive na chamada ao Telegram, que leva o token do bot. Para certificado interno de cluster use `NODE_EXTRA_CA_CERTS=/caminho/ca.crt`, que confia só naquela CA. O agente avisa no boot se encontrar a variável ligada.

## Formato do post

```
💼 Vagas em Franca-SP — quarta-feira, 09/09

59 vagas novas hoje · 329 abertas no radar
27 com salário informado. Detalhes por área a seguir 👇

🛍️ Vendas & Comércio (21)

• Consultor de Vendas — Ancora Consorcios
  💰 R$ 1.707 · 🕑 Seg a Sex 08:00 às 18:00
  📄 Efetivo/CLT · 📍 Presencial · Franca
  🔗 Ver vaga e se candidatar · TrabalhaBrasil

• Assistente de Atendimento ♿ — Selfit Academias
  💰 a combinar
  📍 Presencial · Franca
  ⏳ encerra em 3 dias
  ✉️ rh@exemplo.com.br
  🔗 Ver vaga e se candidatar · Mural ACIF
```

O que o título **não** carrega mais, porque virou informação própria: `|LOJAS RENNER|`, código interno (`1012 -`), a cidade repetida (`- FRANCA/SP`, `- FRAN` truncado) e o aviso de PcD — que vira o selo ♿ e só aparece quando a vaga é de fato reservada (o rodapé "acreditamos na diversidade" de quase toda descrição não conta). `⏳` sai da `data_final` do mural da ACIF, e a vaga vencida é removida sem esperar o TTL. Cadastro de currículo ("Banco de Talentos") não entra: não é vaga, e ocupava o teto do digest.

Áreas: Calçados & Indústria, Vendas & Comércio, Logística & Transporte, Saúde, Administrativo & Financeiro, Alimentação & Hotelaria, Atendimento & Call Center, Construção & Serviços, Educação, Tecnologia, Automotivo, Marketing & Design, Beleza & Estética, Estágio & Jovem Aprendiz, Outras.
