import { describe, expect, test } from "bun:test";
import { parsePaginaBne } from "../src/sources/bne.ts";
import {
  linksDaHome,
  parseDetalheEmpregoEmFranca,
  prazoIso,
} from "../src/sources/empregoemfranca.ts";
import {
  extraiVagasEF,
  foneEF,
  mapeiaVagasEF,
  salarioEF,
} from "../src/sources/empregofranca.ts";
import {
  parseFrancaClassificados,
  tituloDe,
} from "../src/sources/francaclassificados.ts";
import { parseHardFranca } from "../src/sources/hardfranca.ts";
import { filtrosDaPagina } from "../src/sources/infojobs.ts";
import { parsePaginaMelhoresEmpregos } from "../src/sources/melhoresempregos.ts";

const vaga = (extra: Record<string, unknown> = {}) => ({
  title: "OPERADOR DE CAIXA",
  slug: "operador-de-caixa",
  status: "PUBLISHED",
  employmentType: "CLT",
  workModel: "ONSITE",
  salaryMode: "EXACT",
  salaryExactCents: 237700,
  cityIbgeCode: "3516200",
  destinationWhatsapp: "16994371285",
  expiresAt: "2026-11-30T12:00:00.000Z",
  benefits: ["Vale transporte"],
  organization: { tradeName: "Mercado X", slug: "mercado-x" },
  ...extra,
});

const html = (jobs: unknown) =>
  `<script>self.__next_f.push([1,${JSON.stringify(
    `x:[["$","div",null,{"initialJobs":${JSON.stringify(jobs)},"b":"]"}]]`,
  )}])</script>`;

describe("empregofranca", () => {
  test("extrai initialJobs do payload RSC, mesmo com ']' dentro de string", () => {
    const r = extraiVagasEF(html([vaga({ description: "usa ] e [ soltos" })]));
    expect(r).toHaveLength(1);
    expect(r[0]?.slug).toBe("operador-de-caixa");
  });

  test("layout desconhecido devolve [] em vez de estourar", () => {
    expect(extraiVagasEF("<html></html>")).toEqual([]);
  });

  test("salário: exato, faixa e a combinar", () => {
    expect(salarioEF(vaga() as never)).toBe("R$ 2.377");
    expect(
      salarioEF(
        vaga({
          salaryMode: "RANGE",
          salaryMinCents: 300000,
          salaryMaxCents: 2500000,
        }) as never,
      ),
    ).toBe("R$ 3.000 a R$ 25.000");
    expect(salarioEF(vaga({ salaryMode: "NEGOTIABLE" }) as never)).toBeNull();
  });

  test("telefone formatado; número torto vira null", () => {
    expect(foneEF("16994371285")).toBe("(16) 99437-1285");
    expect(foneEF("123")).toBeNull();
  });

  test("mapeia link, contrato, contato e prazo; descarta vencida e de outra cidade", () => {
    const [j, ...resto] = mapeiaVagasEF(
      [
        vaga(),
        vaga({ slug: "velha", expiresAt: "2026-01-01T00:00:00Z" }),
        vaga({ slug: "outra", cityIbgeCode: "3550308" }),
        vaga({ slug: "rascunho", status: "DRAFT" }),
      ] as never,
      "2026-10-28",
    );
    expect(resto).toHaveLength(0);
    expect(j?.link).toBe(
      "https://empregofranca.com.br/vaga/mercado-x/operador-de-caixa",
    );
    expect(j?.contract).toBe("CLT");
    expect(j?.workplace).toBe("Presencial");
    expect(j?.contact).toBe("(16) 99437-1285");
    expect(j?.deadline).toBe("2026-11-30");
    expect(j?.description).toContain("Benefícios: Vale transporte");
  });

  test("vaga confidencial não expõe a empresa", () => {
    const [j] = mapeiaVagasEF(
      [vaga({ confidential: true })] as never,
      "2026-10-28",
    );
    expect(j?.company).toBeNull();
  });
});

const cardBne = (cidade: string, itens: string[]) =>
  `<section style="x" class="job__card__container job-container" id="job-1">
    <a class="card__link" href="https://www.bne.com.br/vaga-de-emprego-na-area-comercio-em-franca-sp/sdr/6230318">Vaga De Sdr</a>
    <div class="info__vaga">
      ${[...itens, cidade].map((i) => `<div class="info__vaga-item"><svg><path/></svg> ${i}</div>`).join("")}
      <p>qualifica&#xE7;&#xE3;o de leads</p>
    </div></section>`;

describe("bne", () => {
  test("card com empresa: cargo, empresa, modalidade e cidade", () => {
    const [v] = parsePaginaBne(
      cardBne("Franca / SP", ["SDR Vendas", "Seti Consultoria", "Presencial"]),
    );
    expect(v?.title).toBe("SDR Vendas");
    expect(v?.company).toBe("Seti Consultoria");
    expect(v?.workplace).toBe("Presencial");
    expect(v?.city).toBe("Franca");
    expect(v?.link).toContain("/6230318");
    expect(v?.description).toContain("qualificação");
  });

  test("card sem empresa não confunde modalidade com empresa", () => {
    const [v] = parsePaginaBne(
      cardBne("Franca / SP", ["Auxiliar de Expedição", "Home Office"]),
    );
    expect(v?.company).toBeNull();
    expect(v?.workplace).toBe("Home office");
  });

  test("card sem cidade no formato Cidade / UF é descartado", () => {
    expect(parsePaginaBne(cardBne("Brasil", ["X", "Presencial"]))).toEqual([]);
  });
});

describe("empregoemfranca", () => {
  test("links únicos da home com o título do h2", () => {
    const h = `<h2><a href="https://empregoemfranca.com/vagas/caixa-1/">Caixa</a></h2>
      <h2><a href="https://empregoemfranca.com/vagas/caixa-1/">Caixa</a></h2>
      <h2><a href="https://empregoemfranca.com/vagas/outra-2/">Outra</a></h2>`;
    expect(linksDaHome(h).map((l) => l.title)).toEqual(["Caixa", "Outra"]);
  });

  test("prazo dd/mm/aa e data impossível", () => {
    expect(prazoIso("Enviar currículo até 27/11/26")).toBe("2026-11-27");
    expect(prazoIso("até 99/99/26")).toBeNull();
    expect(prazoIso("sem prazo")).toBeNull();
  });

  test("detalhe: empresa, salário, benefícios, prazo e contato só da candidatura", () => {
    const html = `<body><p>Contato: portal@empregoemfranca.com</p>
      Nome da Empresa / Agência: Perlatto calçados Vaga: Emprego Cidade: Franca - SP
      Atividades: Atendimento ao cliente. Remuneração: 2.114,00 Beneficios: Vale-alimentação
      Requisitos: Boa comunicação Como se candidatar: rh2@perlatto.com.br Importante! Denuncie
      <a href="https://api.whatsapp.com/send?phone=551637273377">zap</a>
      Enviar currículo até 27/11/26</body>`;
    const v = parseDetalheEmpregoEmFranca(html, {
      title: "Atendimento SAC",
      link: "https://empregoemfranca.com/vagas/x-1/",
    });
    expect(v?.company).toBe("Perlatto calçados");
    expect(v?.salary).toBe("R$ 2.114");
    expect(v?.city).toBe("Franca");
    expect(v?.deadline).toBe("2026-11-27");
    expect(v?.contact).toContain("rh2@perlatto.com.br");
    expect(v?.contact).not.toContain("portal@");
    expect(v?.description).toContain("Benefícios: Vale-alimentação");
  });

  test("remuneração a combinar não vira salário", () => {
    const v = parseDetalheEmpregoEmFranca(
      "Nome da Empresa / Agência: X Vaga: Emprego Cidade: Franca - SP Atividades: a Remuneração: A combinar Beneficios: b Requisitos: c Como se candidatar",
      { title: "T", link: "https://empregoemfranca.com/vagas/x-1/" },
    );
    expect(v?.salary).toBeNull();
  });

  test("página sem o rótulo Cidade não é vaga", () => {
    expect(
      parseDetalheEmpregoEmFranca("<p>404</p>", { title: "T", link: "l" }),
    ).toBeNull();
  });
});

describe("hardfranca", () => {
  const bloco = (id: number, t: string, txt: string) =>
    `<div id="anuncio_completo_${id}" style="display:none"><div class="titulo-anuncio">${t}</div><div style="x">${txt}</div></div>
     <div id="anuncio_completo_dest${id}" style="display:none"><div class="titulo-anuncio">${t}</div><div>${txt}</div></div>`;

  test("extrai salário e contato; id duplicado conta uma vez", () => {
    const r = parseHardFranca(
      bloco(
        95886,
        "SUPERVISOR",
        "Salário R$ 4.000,00, VA. Enviar para rh@empresa.com.br",
      ),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.salary).toBe("R$ 4.000");
    expect(r[0]?.contact).toBe("rh@empresa.com.br");
    expect(r[0]?.link).toBe(
      "https://hardfranca.com.br/anuncios.php#anuncio-95886",
    );
  });

  test("valor solto fora da faixa não vira salário", () => {
    const r = parseHardFranca(bloco(1, "A", "VT R$ 25,00 por dia"));
    expect(r[0]?.salary).toBeNull();
  });
});

describe("francaclassificados", () => {
  test.each([
    ["PRECISA-SE DE COLADEIRA DE PEÇAS – 16 98865-1306.", "Coladeira de Peças"],
    ["PRECISA-SE DE AUX DE MONTAGEM, SEXO FEMININO", "Auxiliar de Montagem"],
    [
      "Loterica X / Centro Contrata-se Funcionária para casa lotérica",
      "Funcionária",
    ],
    [
      "Estamos contratando profissional de vendas. Enviar currículo",
      "Profissional de Vendas",
    ],
    [
      "SERVENTE DE PEDREIRO – COM REGISTRO 📍 LOCAL: Franca",
      "Servente de Pedreiro",
    ],
  ])("título de %s", (texto, esperado) => {
    expect(tituloDe(texto)).toBe(esperado);
  });

  const pagina = (...ps: string[]) =>
    `<section id="empregos">${ps.map((p) => `<p class="vagas text-left">${p}</p>`).join("")}</section>
     <section id="concursos"><p class="vagas">PRECISA-SE DE FORA DA SEÇÃO DE EMPREGOS</p>`;

  test("lê só a seção de empregos, uma vez por texto repetido", () => {
    const r = parseFrancaClassificados(
      pagina(
        "PRECISA-SE DE CAIXA COM EXPERIÊNCIA. WHATSAPP 16 99999-1111",
        "PRECISA-SE DE CAIXA COM EXPERIÊNCIA. WHATSAPP 16 99999-1111",
        "PRECISA-SE DE MOTORISTA. Salário R$ 2.500,00 enviar para rh@x.com.br",
      ),
    );
    expect(r.map((v) => v.title)).toEqual(["Caixa", "Motorista"]);
    expect(r[1]?.salary).toBe("R$ 2.500");
    expect(r[1]?.contact).toBe("rh@x.com.br");
    expect(r[0]?.link).toMatch(/#emprego-[0-9a-f]{12}$/);
  });

  test("quem procura emprego não é vaga; salário sem rótulo não conta", () => {
    const r = parseFrancaClassificados(
      pagina(
        "Procuro emprego como auxiliar de limpeza, tenho experiência",
        "PRECISA-SE DE VENDEDORA. Comissão de R$ 3.000,00 por mês",
      ),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.salary).toBeNull();
  });

  test("página sem a seção de empregos devolve []", () => {
    expect(parseFrancaClassificados("<html></html>")).toEqual([]);
  });
});

describe("infojobs filtros", () => {
  test("coleta data-url únicos de empregos-*", () => {
    const h = `<a data-url="empregos-em-franca,-sp.aspx?def1=1"></a>
      <a data-url="empregos-em-franca,-sp.aspx?def1=1"></a>
      <a data-url="empregos-de-transportes-em-franca,-sp.aspx"></a>
      <a data-url="/outra/coisa"></a>`;
    expect(filtrosDaPagina(h)).toEqual([
      "empregos-em-franca,-sp.aspx?def1=1",
      "empregos-de-transportes-em-franca,-sp.aspx",
    ]);
  });
});

describe("melhoresempregos", () => {
  const card = (data: string, empresa = "Loja X") =>
    `<div class="list-item" itemscope itemtype="http://schema.org/JobPosting" ><h3 class="list-item-title" itemprop="title"><a title="t" href="/vaga/vendedor/franca-sp/1/"> Vendedor | FRANCA </a></h3><a class="list-item-tag item-badge job-type-clt" href="/clt/">CLT</a><a class="list-item-tag item-badge job-type-presencial">Presencial</a><span itemprop="hiringOrganization"><div itemprop="name"> ${empresa} </div></span><span itemprop="addressLocality">Franca</span><time itemprop="datePosted" datetime="${data}">x</time><meta itemprop="description" content="Vaga para Vendedor em Franca." /></div>`;

  test("lê título, empresa, contrato, modalidade e data", () => {
    const [v] = parsePaginaMelhoresEmpregos(card("2026-10-29"), "2026-10-29");
    expect(v?.title).toBe("Vendedor | FRANCA");
    expect(v?.company).toBe("Loja X");
    expect(v?.contract).toBe("CLT");
    expect(v?.workplace).toBe("Presencial");
    expect(v?.published).toBe("2026-10-29");
    expect(v?.salary).toBeNull();
    expect(v?.link).toBe(
      "https://www.melhoresempregos.com/vaga/vendedor/franca-sp/1/",
    );
  });

  test("vaga com mais de 30 dias fica de fora; empresa confidencial vira null", () => {
    expect(
      parsePaginaMelhoresEmpregos(card("2026-09-01"), "2026-10-29"),
    ).toEqual([]);
    const [v] = parsePaginaMelhoresEmpregos(
      card("2026-10-28", "Empresa Confidencial (Cadastre-se)"),
      "2026-10-29",
    );
    expect(v?.company).toBeNull();
  });
});
