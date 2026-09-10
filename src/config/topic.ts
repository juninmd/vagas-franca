// Config específica deste agente. Edite feeds/prompt à vontade.
export const topic = {
  name: "vagas-franca",
  title: "Vagas em Franca-SP",
  emoji: "💼",
  subject: "vagas de emprego abertas em Franca-SP e microrregião",
  // Notícias de emprego (mutirões do PAT, feirões, contratações em massa).
  // Google News por query é mais estável que os portais locais.
  feeds: [
    {
      name: "PAT Franca",
      url: "https://news.google.com/rss/search?q=%22PAT%22+Franca+vagas+emprego&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    },
    {
      name: "Vagas Franca",
      url: "https://news.google.com/rss/search?q=%22vagas+de+emprego%22+%22Franca%22+SP&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    },
    {
      name: "Contratações Franca",
      url: "https://news.google.com/rss/search?q=(mutir%C3%A3o+OR+feir%C3%A3o+OR+contrata%C3%A7%C3%A3o)+emprego+Franca+SP&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    },
    {
      name: "Indústria calçadista Franca",
      url: "https://news.google.com/rss/search?q=ind%C3%BAstria+cal%C3%A7adista+Franca+SP+empregos&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    },
    { name: "Jornal da Franca", url: "https://jornaldafranca.com.br/feed/" },
  ],
};
