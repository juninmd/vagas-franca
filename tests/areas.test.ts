import { describe, expect, test } from "bun:test";
import { AREA_ORDER, classify } from "../src/config/areas.ts";

/** Títulos reais colhidos do banco que hoje caem em "Outras oportunidades". */
const CASOS: [string, string][] = [
  ["TECNICO ENFERMAGEM - UTI NEONATAL | HOSPITAL FRANCA", "Saúde"],
  ["TECNICA DE ENFERMAGEM -HOME CARE EM FRANCA", "Saúde"],
  ["FONOAUDIOLOGO", "Saúde"],
  ["Flebotomista Técnico Operacional", "Saúde"],
  ["Auxiliar Óptico", "Saúde"],
  ["Analista Contábil", "Administrativo & Financeiro"],
  ["Contador", "Administrativo & Financeiro"],
  ["Faturista", "Administrativo & Financeiro"],
  ["Orçamentista", "Administrativo & Financeiro"],
  ["Encarregado de Loja - Petz Franca", "Vendas & Comércio"],
  ["LIDER DE LOJA VAREJO", "Vendas & Comércio"],
  ["Corretor de Imóveis", "Vendas & Comércio"],
  ["AJUDANTE DE ENTREGAS - FRAN", "Logística & Transporte"],
  ["AUXILIAR DE CARREGAMENTO - FRAN", "Logística & Transporte"],
  ["Ajudante de Armazém Noturno - Franca/SP", "Logística & Transporte"],
  ["Auxiliar de Padaria", "Alimentação & Hotelaria"],
  ["TUTOR PRESENCIAL - AGRONOMIA", "Educação"],
  ["Vaga - Inspetor de Alunos | Claretiano", "Educação"],
  ["Auxiliar Educacional", "Educação"],
  ["Controlador de Pragas", "Construção & Serviços"],
];

describe("classify", () => {
  for (const [titulo, esperado] of CASOS) {
    test(`"${titulo}" → ${esperado}`, () => {
      expect(classify(titulo).area).toBe(esperado);
    });
  }

  test("estágio ganha de qualquer profissão", () => {
    expect(classify("Estágio em Enfermagem").area).toBe(
      "Estágio & Jovem Aprendiz",
    );
  });

  // Regressão documentada no README: a loja cita "produção" na descrição.
  test("Assistente de Beleza não cai em Calçados", () => {
    expect(classify("|LOJAS RENNER| Assistente de Beleza").area).not.toBe(
      "Calçados & Indústria",
    );
  });

  test("toda área classificável está em AREA_ORDER", () => {
    for (const [titulo] of CASOS)
      expect(AREA_ORDER).toContain(classify(titulo).area);
  });
});

/** Casos em que duas regras casam: quem tem que vencer é a mais específica. */
describe("prioridade entre regras", () => {
  const casos: [string, string][] = [
    ["Atendimento / Vendas", "Vendas & Comércio"],
    ["Operador De Vendas E Atendimento", "Vendas & Comércio"],
    ["Vendedora para E-commerce", "Vendas & Comércio"],
    ["Auxiliar de E-commerce", "Marketing & Design"],
    ["Atendente de Call Center", "Atendimento & Call Center"],
    ["Atendente de Restaurante", "Alimentação & Hotelaria"],
    ["Atendente de Farmácia", "Saúde"],
    ["ASSISTENTE ADMINISTRATIVO - AUDIOVISUAL", "Administrativo & Financeiro"],
    ["PROFESSOR A - EAD - FARMÁCIA - FRANCA/ SP", "Educação"],
    ["TUTOR PRESENCIAL - FONOAUDIOLOGIA", "Educação"],
    ["Analista de Pcp/mrp", "Calçados & Indústria"],
    ["Mecânico de Manutenção Industrial", "Calçados & Indústria"],
    ["Mecânico de Linha Leve Flex e Diesel", "Automotivo"],
  ];
  for (const [titulo, esperado] of casos)
    test(`"${titulo}" → ${esperado}`, () =>
      expect(classify(titulo).area).toBe(esperado));
});
