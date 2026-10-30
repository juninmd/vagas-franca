# Fontes de vaga

De onde vêm as vagas, o que cada portal entrega, o que foi checado e o que ficou de fora. Visão geral e números no [README](../README.md).

## Tabela de fontes

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

## Cobertura e limites

Não existe lista oficial de todas as vagas de Franca para comparar, então "o máximo" não é verificável. O que foi checado fonte a fonte:

- **Paginação esgotada de verdade:** Melhores Empregos (a página 5 já chega em 1º de outubro, no corte de 30 dias), empregos.com.br (depois da 2ª página a busca degrada para Franco da Rocha e São Paulo), ACIF, Emprego em Franca, Hard Franca e Franca Classificados (lista inteira numa página).
- **BNE:** o site responde 403 depois de algumas dezenas de detalhes seguidos. A rodada para no primeiro 403/429 (orçamento = `DETAIL_PAGES × 3`) e a vaga descartada por idade fica na tabela `ignoradas` por uma semana, para a próxima rodada não reabrir as mesmas. As páginas mais fundas são antigas (jan/2026 na página 6).
- **TrabalhaBrasil:** a listagem vai a ~400 páginas, mas **não é ordenada por data** (item da página 1 de abr/2026, da 30 de jan/2026, da 400 de jul/2024); por isso o padrão fica em poucas páginas.
- **InfoJobs:** a paginação `?page=N` devolve sempre a página 1; o que amplia a cobertura são os filtros da página (138 vagas com 40 filtros, 188 com todos).
- **Emprego Franca:** só as 20 primeiras — o resto da lista o navegador carrega depois, e o endpoint interno não foi consumido.
- **Hard Franca e Franca Classificados:** os anúncios não têm data. O primeiro usa uma janela estimada pelo id; o segundo confia no que o dono do site mantém na página, então pode haver vaga já preenchida.
- **Gupy:** devolveu 404 no ambiente de teste de 29/10/2026 (`employability-portal.gupy.io` e `portal.api.gupy.io`); a API oficial (`api.gupy.io`) exige credencial. A fonte continua no código, mas não foi validada ao vivo.
- **Fora de propósito:** Catho (`robots.txt` com `Disallow: /`) e Indeed bloqueiam coleta; `vagas.com.br/vagas-em-franca-sp` devolve vagas de **Franco da Rocha** e São Paulo, não de Franca; Jooble e `empregafranca.com.br` bloqueiam (403/404). O portal da prefeitura (`www3.franca.sp.gov.br`) não expõe feed/API — o "Emprega Franca" só chega via Google News.

## Detalhes que custaram investigação e estão no código

- `state=SP` na API da Gupy devolve **zero**; tem que ser `São Paulo` por extenso.
- O `baseSalary` do JSON-LD do TrabalhaBrasil e dos cards do Melhores Empregos é **faixa estimada de mercado**, não o valor da vaga (estágio com bolsa de R$ 1.000 vinha como "R$ 1.910 a R$ 2.973") — por isso é ignorado; salário confiável só o do card ou o extraído do texto.
- Rajada de requisições no TrabalhaBrasil derruba a fonte (captcha e depois 403): detalhe é buscado em série, poucos por rodada, e nunca duas vezes pra mesma vaga.
- A paginação do empregos.com.br é por **caminho** (`/vagas/franca-sp/2`); o `?pagina=2` é ignorado.
- A classificação por área usa **só o título**: a descrição da loja cita "produção" e jogava "Assistente de Beleza" em Calçados & Indústria.
- A ordem em que as regras de área **casam** é separada da ordem em que as áreas **aparecem** no post. Amarradas, "Tutor de Fonoaudiologia" virava vaga de hospital só porque Saúde precisava aparecer antes de Educação.
- Cada mensagem do digest é uma área: o Telegram corta em ~20 mensagens/minuto por grupo e **áreas inteiras sumiam do post** com 429 silencioso. Os envios são espaçados e o `retry_after` é respeitado.
- Os endpoints da ACIF são relativos a `/empregos-acif/` (na raiz dão 404) e exigem `x-requested-with: XMLHttpRequest` + `referer`.
- O Google News mistura mutirão de Curitiba e feirão de Sumaré na busca por Franca: as notícias passam por filtro de assunto **e** de cidade da microrregião.
