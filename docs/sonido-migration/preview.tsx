import { Button, Card, SearchField } from "@juninmd/sonido";
import type { ReactNode } from "react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ErroCarga,
  Esqueleto,
  SemResultados,
} from "../../web/src/components/Estados.tsx";
import { PainelFiltros } from "../../web/src/components/Filtros.tsx";
import { ResumoGeral } from "../../web/src/components/Resumo.tsx";
import { VagaCard } from "../../web/src/components/VagaCard.tsx";
import type { Filtros, Resumo } from "../../web/src/lib/filtros.ts";
import { FILTROS_VAZIOS } from "../../web/src/lib/filtros.ts";
import type { Vaga } from "../../web/src/types.ts";
import { AcoesLegacy } from "./legacy/Acoes.tsx";
import { BuscaLegacy } from "./legacy/Busca.tsx";
import {
  ErroCarga as ErroCargaLegacy,
  Esqueleto as EsqueletoLegacy,
  SemResultados as SemResultadosLegacy,
} from "./legacy/Estados.tsx";
import { PainelFiltros as PainelFiltrosLegacy } from "./legacy/Filtros.tsx";
import { ResumoGeral as ResumoGeralLegacy } from "./legacy/Resumo.tsx";
import { VagaCard as VagaCardLegacy } from "./legacy/VagaCard.tsx";
import "@juninmd/sonido/styles.css";
import "./preview.css";
import "../../web/src/sonido-bridge.css";

const THEME =
  new URLSearchParams(location.search).get("theme") === "light"
    ? "light"
    : "dark";
document.documentElement.dataset.theme = THEME;

/** Dados fictícios: nenhuma empresa, vaga ou salário real. */
const VAGA: Vaga = {
  id: "demo-1",
  titulo: "Auxiliar de Costura",
  empresa: "Confecções Aurora (fictícia)",
  area: "Calçados & Indústria",
  salario: "R$ 2.450",
  salarioValor: 2450,
  jornada: "44h semanais",
  contrato: "CLT",
  modalidade: "Presencial",
  cidade: "Franca",
  fonte: "Mural da Praça (fictício)",
  link: null,
  descricao: "Vaga de exemplo criada só para esta comparação visual.",
  requisitos: "Experiência com costura reta e overloque.",
  prazo: "2026-12-02",
  publicadaEm: "2026-11-20",
  vistaEm: "2026-11-25",
  contato: null,
  pcd: false,
};

const RESUMO: Resumo = {
  total: 128,
  comSalario: 74,
  mediana: 2150,
  maior: 6200,
  novasNaSemana: 23,
  comRequisitos: 61,
  fontes: 9,
};

const FACETAS = {
  areas: [
    { valor: "Calçados & Indústria", n: 42 },
    { valor: "Vendas & Comércio", n: 31 },
    { valor: "Administrativo", n: 18 },
  ],
  contratos: [
    { valor: "CLT", n: 96 },
    { valor: "PJ", n: 21 },
  ],
  modalidades: [
    { valor: "Presencial", n: 88 },
    { valor: "Híbrido", n: 12 },
    { valor: "Home office", n: 9 },
  ],
  fontes: [
    { valor: "Gupy (fictício)", n: 54 },
    { valor: "Mural da Praça (fictício)", n: 22 },
  ],
};

const FILTROS_ATIVOS: Filtros = {
  ...FILTROS_VAZIOS,
  areas: ["Vendas & Comércio"],
  salarioMin: 2000,
  soPcd: true,
};

function Row({
  title,
  hint,
  before,
  after,
  beforeFile,
  afterFile,
}: {
  title: string;
  hint: string;
  before: ReactNode;
  after: ReactNode;
  beforeFile: string;
  afterFile: string;
}) {
  return (
    <section className="pv-row">
      <div className="pv-row__head">
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>
      <div className="pv-cols">
        <div className="pv-col pv-col--before">
          <div className="pv-col__head">
            <strong>Antes · componente do vagas-franca</strong>
          </div>
          <div className="pv-stage">{before}</div>
          <code className="pv-file">{beforeFile}</code>
        </div>
        <div className="pv-col pv-col--after">
          <div className="pv-col__head">
            <strong>Depois · @juninmd/sonido</strong>
          </div>
          <div className="pv-stage">{after}</div>
          <code className="pv-file">{afterFile}</code>
        </div>
      </div>
    </section>
  );
}

function BuscaRow() {
  const [antes, setAntes] = useState("costura");
  const [depois, setDepois] = useState("costura");
  return (
    <Row
      title="Busca"
      hint="rótulo acessível, lupa, botão de limpar e Esc para zerar"
      before={<BuscaLegacy valor={antes} onChange={setAntes} />}
      after={
        <SearchField
          value={depois}
          onChange={setDepois}
          label="Buscar por cargo, empresa ou palavra"
          placeholder="Buscar cargo, empresa ou palavra"
        />
      }
      beforeFile="web/src/App.tsx (origin/main)"
      afterFile="SearchField do Sonido"
    />
  );
}

function BotoesRow() {
  return (
    <Row
      title="Botões"
      hint="secundário/outline, link denso e ação principal"
      before={<AcoesLegacy />}
      after={
        <div className="pv-stack">
          <Button variant="secondary" appearance="outline">
            Mostrar mais 36 de 92 restantes
          </Button>
          <Button variant="secondary" appearance="outline" size="sm">
            Fechar
          </Button>
          <Button variant="link" size="sm">
            Limpar (3)
          </Button>
          <Button variant="primary" size="lg">
            Ver 128 vagas
          </Button>
        </div>
      }
      beforeFile="web/src/App.tsx, Estados.tsx, VagaGaveta.tsx (origin/main)"
      afterFile="Button do Sonido"
    />
  );
}

function CartaoRow() {
  return (
    <Row
      title="Pílulas do cartão"
      hint="contrato, modalidade, PcD, área e prazo"
      before={
        <div className="pv-stage--cards">
          <VagaCardLegacy vaga={VAGA} onAbrir={() => {}} adiado={false} />
        </div>
      }
      after={
        <div className="pv-stage--cards">
          <VagaCard vaga={VAGA} onAbrir={() => {}} adiado={false} />
        </div>
      }
      beforeFile="web/src/components/VagaCard.tsx (origin/main)"
      afterFile="Badge do Sonido dentro do mesmo VagaCard"
    />
  );
}

function EstadosRow() {
  const [tentativa, setTentativa] = useState(0);
  return (
    <Row
      title="Estados vazios"
      hint="erro recuperável e busca sem resultado, com a ação principal"
      before={
        <div className="pv-stack" style={{ display: "grid" }}>
          <SemResultadosLegacy onLimpar={() => {}} />
          <ErroCargaLegacy
            mensagem="o servidor respondeu 500"
            onTentar={() => {}}
          />
        </div>
      }
      after={
        <div className="pv-stack" style={{ display: "grid" }}>
          <SemResultados onLimpar={() => {}} />
          <ErroCarga
            mensagem="o servidor respondeu 500"
            onTentar={() => setTentativa((t) => t + 1)}
          />
          <span className="sr-only">tentativas: {tentativa}</span>
        </div>
      }
      beforeFile="web/src/components/Estados.tsx (origin/main)"
      afterFile="EmptyState + Button do Sonido"
    />
  );
}

function ResumoRow() {
  return (
    <Row
      title="Resumo"
      hint="quatro números com nota de apoio; a nota some no celular"
      before={<ResumoGeralLegacy resumo={RESUMO} />}
      after={<ResumoGeral resumo={RESUMO} />}
      beforeFile="web/src/components/Resumo.tsx (origin/main)"
      afterFile="StatTile do Sonido dentro do mesmo ResumoGeral"
    />
  );
}

function FiltrosRow() {
  const [antes, setAntes] = useState<Filtros>(FILTROS_ATIVOS);
  const [depois, setDepois] = useState<Filtros>(FILTROS_ATIVOS);
  return (
    <Row
      title="Painel de filtros"
      hint="contêiner da lateral, link de limpar e contadores das facetas"
      before={
        <div className="rounded-lg border border-borda bg-superficie p-4">
          <PainelFiltrosLegacy
            filtros={antes}
            facetas={FACETAS}
            onChange={setAntes}
            onLimpar={() => setAntes(FILTROS_VAZIOS)}
            prefixo="antes"
          />
        </div>
      }
      after={
        <Card surface="solid" padding="sm">
          <PainelFiltros
            filtros={depois}
            facetas={FACETAS}
            onChange={setDepois}
            onLimpar={() => setDepois(FILTROS_VAZIOS)}
            prefixo="depois"
          />
        </Card>
      }
      beforeFile="web/src/components/Filtros.tsx (origin/main)"
      afterFile="Card + Button + Badge (count) do Sonido"
    />
  );
}

function EsqueletoRow() {
  return (
    <Row
      title="Esqueleto de carga"
      hint="mesmo molde do cartão para a página não pular"
      before={<EsqueletoLegacy quantos={2} />}
      after={<Esqueleto quantos={2} />}
      beforeFile="web/src/components/Estados.tsx (origin/main)"
      afterFile="Skeleton do Sonido dentro do mesmo Esqueleto"
    />
  );
}

function App() {
  return (
    <main className="pv-page">
      <header className="pv-head">
        <p className="pv-kicker">vagas-franca · @juninmd/sonido 2.5.0</p>
        <h1>Primitivas do app · design system</h1>
        <p>
          Mesmo CSS e mesmos tokens da aplicação (tema{" "}
          {THEME === "light" ? "claro" : "escuro"}), com dados fictícios. O lado
          Antes importa cópias literais de <code>origin/main</code> em{" "}
          <code>legacy/</code>; o Depois importa os arquivos do app já apoiados
          no Sonido.
        </p>
      </header>

      <BuscaRow />
      <BotoesRow />
      <CartaoRow />
      <EstadosRow />
      <ResumoRow />
      <FiltrosRow />
      <EsqueletoRow />

      <footer className="pv-foot">
        Capturas em 1180×900 @2x, full page, em Chromium. Empresas, vagas e
        salários são fictícios.
      </footer>
    </main>
  );
}

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
createRoot(el).render(<App />);
