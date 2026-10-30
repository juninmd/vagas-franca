# vagas-franca 💼

Bot de Telegram que publica **todo dia a lista de vagas de emprego abertas em Franca-SP** — profissão, valor, jornada, tipo de contrato, requisitos e link pra se candidatar.

Mesmo esqueleto dos agentes `role-radar` / `evo-agent`: fontes → SQLite (dedupe) → IA pt-BR → Telegram. Bun, sem build step. **Não há interface web**: a saída é o Telegram (digest + Raio-X) e o terminal (`bun run smoke`).

## Como funciona

```
fontes (HTML/JSON)  ─┐
                     ├─→ SQLite (dedupe por link e por empresa+cargo, TTL de 21 dias)
Google News (RSS)   ─┘        │
                              ├─→ parsers por regra: salário rotulado, contrato, requisitos
                              ├─→ enrich por IA: salário/jornada/benefícios que sobraram
                              └─→ digest diário no Telegram, agrupado por área + Raio-X
```

### Fontes de vaga

Vagas de Franca no smoke ao vivo de 29/10/2026 (`PAGES_PER_BOARD=10`): **~1.080 em 10 fontes**.

| Fonte | Como | Vagas | Traz |
|---|---|---|---|
| **Franca Classificados** | seção "Lista de Empregos" (anúncios em texto livre); link por hash do texto, título = profissão no começo do anúncio | ~310 | salário (só o rotulado) e contato por regra |
| **InfoJobs** | HTML da busca + os filtros públicos da própria página (`data-url`: contrato, categoria, antiguidade, home office) | ~190 | salário e modalidade em campo próprio |
| **TrabalhaBrasil** | HTML + `JobPosting` (JSON-LD) no detalhe | ~150 | vagas operacionais, salário do card, descrição completa |
| **Hard Franca** (hardfranca.com.br) | `anuncios.php` com os anúncios inline; o id crescente faz de relógio (janela de ~1 mês) | ~120 | texto livre: salário e contato por regra |
| **Melhores Empregos** | cards SSR em microdados `JobPosting`, `/vagas-em-franca-sp/N/` por data; só vaga dos últimos 30 dias | ~100 | empresa (quando não é "confidencial"), contrato, modalidade, data real |
| **Mural ACIF** (Assoc. Comercial e Industrial) | endpoints da SPA: `carregar_vagas.php?pagina=N` + `detalhes_vaga.php?id=N` (JSON) | ~75 | **e-mail/telefone de contato**, requisitos, prazo (`data_final`) |
| **Emprego em Franca** (empregoemfranca.com) | home + detalhe, parse por rótulos (`Remuneração:`, `Benefícios:`, `Enviar currículo até`) | ~75 | empresa, salário, benefícios, prazo e contato (só da seção de candidatura) |
| **empregos.com.br** | HTML (SSR), páginas `/vagas/franca-sp/N` | ~30 | descrição crua do anunciante — onde aparecem salário e horário |
| **Emprego Franca** (empregofranca.com.br) | payload RSC do Next.js na página pública `/vagas` (só as 20 primeiras) | 20 | salário exato/faixa em campo próprio, contrato, jornada, benefícios, WhatsApp/e-mail |
| **BNE** | HTML SSR `?Page=N`; data confirmada no `JobPosting` do detalhe (só vaga dos últimos 30 dias) | ~12 por rodada | cargo, empresa, modalidade, descrição |
| **Gupy** (portal público) | API JSON `employability-portal.gupy.io` | não validada | ver "Cobertura e limites" |
| **Google News + Jornal da Franca** | RSS | — | notícias de emprego: "Emprega Franca", mutirões do PAT, feirões |

Mesma empresa + mesmo cargo em portais diferentes vale **uma vaga só** (`salvaVagas`, log `já vistas em outro portal`); dentro da mesma fonte nada é cortado, porque a Gupy publica uma vaga por loja. Só pega quando a fonte informa a empresa — Mural ACIF, Hard Franca e Franca Classificados não informam.

### Parsers por regra (sem IA)

Quando a fonte não informa, o texto às vezes diz. Tudo em `src/format.ts`, regra fechada, e a fonte sempre ganha:

| Função | O que faz | O que **não** faz |
|---|---|---|
| `extraiSalarioRotulado` | acha o valor que o texto rotula como salário/remuneração/pagamento/piso → `R$ 2.000` | VT, VR, comissão e preço soltos não contam; só R$ 800–30.000; em faixa fica o piso |
| `inferirContrato` | CLT, Estágio, Jovem Aprendiz, PJ, Temporário, Autônomo | "sem registro" nunca vira CLT; aprendiz ganha de "carteira assinada" |
| `extraiRequisitos` | trecho depois do rótulo "Requisitos" até o próximo rótulo, em uma linha de até 160 caracteres | sem rótulo, sem requisito — nada é inventado |

No smoke de 29/10: 238 de 1.033 vagas com salário, 396 com contrato (informado ou inferido) e 267 com requisitos.

### Cobertura e limites

Não existe lista oficial de todas as vagas de Franca para comparar, então "o máximo" não é verificável. O que foi checado fonte a fonte:

- **Paginação esgotada de verdade:** Melhores Empregos (a página 5 já chega em 1º de outubro, no corte de 30 dias), empregos.com.br (depois da 2ª página a busca degrada para Franco da Rocha e São Paulo), ACIF, Emprego em Franca, Hard Franca e Franca Classificados (lista inteira numa página).
- **BNE:** o site responde 403 depois de algumas dezenas de detalhes seguidos. A rodada para no primeiro 403/429 (orçamento = `DETAIL_PAGES × 3`) e a vaga descartada por idade fica na tabela `ignoradas` por uma semana, para a próxima rodada não reabrir as mesmas. As páginas mais fundas são antigas (jan/2026 na página 6).
- **TrabalhaBrasil:** a listagem vai a ~400 páginas, mas **não é ordenada por data** (item da página 1 de abr/2026, da 30 de jan/2026, da 400 de jul/2024); por isso o padrão fica em poucas páginas.
- **InfoJobs:** a paginação `?page=N` devolve sempre a página 1; o que amplia a cobertura são os filtros da página (138 vagas com 40 filtros, 188 com todos).
- **Emprego Franca:** só as 20 primeiras — o resto da lista o navegador carrega depois, e o endpoint interno não foi consumido.
- **Hard Franca e Franca Classificados:** os anúncios não têm data. O primeiro usa uma janela estimada pelo id; o segundo confia no que o dono do site mantém na página, então pode haver vaga já preenchida.
- **Gupy:** devolveu 404 no ambiente de teste de 29/10/2026 (`employability-portal.gupy.io` e `portal.api.gupy.io`); a API oficial (`api.gupy.io`) exige credencial. A fonte continua no código, mas não foi validada ao vivo.
- **Fora de propósito:** Catho (`robots.txt` com `Disallow: /`) e Indeed bloqueiam coleta; `vagas.com.br/vagas-em-franca-sp` devolve vagas de **Franco da Rocha** e São Paulo, não de Franca; Jooble e `empregafranca.com.br` bloqueiam (403/404). O portal da prefeitura (`www3.franca.sp.gov.br`) não expõe feed/API — o "Emprega Franca" só chega via Google News.

### Detalhes que custaram investigação e estão no código

- `state=SP` na API da Gupy devolve **zero**; tem que ser `São Paulo` por extenso.
- O `baseSalary` do JSON-LD do TrabalhaBrasil e dos cards do Melhores Empregos é **faixa estimada de mercado**, não o valor da vaga (estágio com bolsa de R$ 1.000 vinha como "R$ 1.910 a R$ 2.973") — por isso é ignorado; salário confiável só o do card ou o extraído do texto.
- Rajada de requisições no TrabalhaBrasil derruba a fonte (captcha e depois 403): detalhe é buscado em série, poucos por rodada, e nunca duas vezes pra mesma vaga.
- A paginação do empregos.com.br é por **caminho** (`/vagas/franca-sp/2`); o `?pagina=2` é ignorado.
- A classificação por área usa **só o título**: a descrição da loja cita "produção" e jogava "Assistente de Beleza" em Calçados & Indústria.
- A ordem em que as regras de área **casam** é separada da ordem em que as áreas **aparecem** no post. Amarradas, "Tutor de Fonoaudiologia" virava vaga de hospital só porque Saúde precisava aparecer antes de Educação.
- Cada mensagem do digest é uma área: o Telegram corta em ~20 mensagens/minuto por grupo e **áreas inteiras sumiam do post** com 429 silencioso. Os envios são espaçados e o `retry_after` é respeitado.
- Os endpoints da ACIF são relativos a `/empregos-acif/` (na raiz dão 404) e exigem `x-requested-with: XMLHttpRequest` + `referer`.
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
bun test                  # ~220 testes, sem rede (1 falha conhecida: banco somente-leitura, só quando roda como root)
DB_PATH=/tmp/smoke.db bun run smoke   # coleta ao vivo e imprime fontes, top 10 e lista por salário (recusa rodar sem DB_PATH descartável)
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
| `INFOJOBS_FILTROS` | `120` | filtros públicos do InfoJobs abertos por rodada (a página expõe ~90) |
| `DETAIL_PAGES` | `12` | páginas de detalhe abertas por rodada, por portal (educação com o portal; o BNE usa `× 3`) |
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
  ✅ Boa comunicação; experiência com vendas
  🔗 Ver vaga e se candidatar · TrabalhaBrasil

• Assistente de Atendimento ♿ — Selfit Academias
  💰 a combinar
  📍 Presencial · Franca
  ⏳ encerra em 3 dias
  ✉️ rh@exemplo.com.br
  🔗 Ver vaga e se candidatar · Mural ACIF
```

A linha `✅` mostra os requisitos da vaga e só aparece quando a descrição os rotula. O que o título **não** carrega mais, porque virou informação própria: `|LOJAS RENNER|`, código interno (`1012 -`), a cidade repetida (`- FRANCA/SP`, `- FRAN` truncado) e o aviso de PcD — que vira o selo ♿ e só aparece quando a vaga é de fato reservada (o rodapé "acreditamos na diversidade" de quase toda descrição não conta). `⏳` sai da `data_final` do mural da ACIF, e a vaga vencida é removida sem esperar o TTL. Cadastro de currículo ("Banco de Talentos") não entra: não é vaga, e ocupava o teto do digest.

Áreas: Calçados & Indústria, Vendas & Comércio, Logística & Transporte, Saúde, Administrativo & Financeiro, Alimentação & Hotelaria, Atendimento & Call Center, Construção & Serviços, Educação, Tecnologia, Automotivo, Marketing & Design, Beleza & Estética, Estágio & Jovem Aprendiz, Outras.
