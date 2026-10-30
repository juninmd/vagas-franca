# Parsers por regra, entrega e IA

Como uma vaga bruta vira um campo publicável: primeiro regras fechadas, depois (só o que sobrou) a IA, e sempre com a entrega confirmada antes de marcar qualquer estado.

## Parsers por regra (sem IA)

Quando a fonte não informa, o texto às vezes diz. Tudo em `src/format.ts`, regra fechada, e a fonte sempre ganha:

| Função | O que faz | O que **não** faz |
|---|---|---|
| `extraiSalarioRotulado` | acha o valor que o texto rotula como salário/remuneração/pagamento/piso → `R$ 2.000` | VT, VR, comissão e preço soltos não contam; só R$ 800–30.000; em faixa fica o piso |
| `inferirContrato` | CLT, Estágio, Jovem Aprendiz, PJ, Temporário, Autônomo | "sem registro" nunca vira CLT; aprendiz ganha de "carteira assinada" |
| `extraiRequisitos` | trecho depois do rótulo "Requisitos" até o próximo rótulo, em uma linha de até 160 caracteres | sem rótulo, sem requisito — nada é inventado |

No smoke de 29/10: 238 de 1.033 vagas com salário, 396 com contrato (informado ou inferido) e 267 com requisitos.

## Entrega: nada é marcado sem ter saído

Quatro estados só avançam quando o envio confirma — é o que impede o radar de perder vaga em silêncio:

| Estado | Só muda se | Se falhar |
|---|---|---|
| `posted` da vaga | todas as áreas foram entregues | a vaga volta na fila do próximo digest |
| `digested` da notícia | o bloco de notícias foi entregue | volta no próximo |
| `snapshots` do dia | o raio-X foi entregue | o dia não fecha; a comparação segue apontando pra última foto no ar |
| `enriched` da vaga | a IA respondeu **aquele lote** | o lote é tentado de novo amanhã |

Antes, uma queda do Telegram ou da IA marcava tudo como feito e as vagas daquele dia nunca mais eram publicadas.

## O que a IA faz

Só uma coisa: ler a descrição e extrair **salário, jornada e benefícios** quando o portal não os publica em campo próprio.

Nada do que o modelo devolve é publicado sem passar por `src/confere.ts`, que aplica duas amarras independentes a cada campo:

| Amarra | Contra o quê | Como |
|---|---|---|
| **Ancoragem no texto** | alucinação (modelo pequeno inventa faixa salarial com facilidade) | o número do salário precisa existir na descrição **como token**, não como sequência de dígitos: comparar dígito a dígito fazia "44h … 8h … código 500" validar "R$ 4.481" |
| **Forma fechada** | injeção | salário precisa ter forma de salário, jornada precisa caber no alfabeto de jornada, e benefício precisa citar um benefício conhecido |

A segunda amarra existe porque a descrição é escrita por terceiro: quem a escreve controla a entrada do modelo **e** o texto contra o qual a ancoragem compara. Ancoragem sozinha barra o que o modelo inventa, não o que alguém plantou de propósito — sem forma fechada, `💰 R$ 1.500 CHAME NO ZAP …` era publicável.

O post sai igual mesmo se a IA estiver fora do ar: as vagas com salário de fonte estruturada continuam completas.
