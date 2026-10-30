# Raio-X e formato do post

O que o bot publica no Telegram: a análise do mercado (Raio-X) e o post por área.

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
