import { describe, expect, test } from "bun:test";
import { pool } from "../src/pool.ts";

/**
 * `enrich` decide QUAIS lotes marcar como enriquecidos por `results[i].ok`,
 * casando com `lotes[i]`. Se `pool` devolvesse fora de ordem, um lote que
 * falhou seria marcado como concluído e o salário daquelas vagas sumiria pra
 * sempre. O alinhamento é o contrato, não um detalhe.
 */
describe("pool", () => {
  test("resultado sai na ordem da entrada, não na de conclusão", async () => {
    const entrada = [50, 10, 30, 0, 20];
    const saida = await pool(entrada, 3, async (ms) => {
      await Bun.sleep(ms);
      return ms;
    });
    expect(saida).toEqual(entrada);
  });

  test("índice bate item a item mesmo com concorrência", async () => {
    const entrada = Array.from({ length: 40 }, (_, i) => i);
    const saida = await pool(entrada, 7, async (n) => {
      await Bun.sleep(n % 5);
      return n * 2;
    });
    for (const [i, n] of entrada.entries()) expect(saida[i]).toBe(n * 2);
  });

  test("respeita o teto de chamadas simultâneas", async () => {
    let emVoo = 0;
    let pico = 0;
    await pool(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async () => {
        emVoo++;
        pico = Math.max(pico, emVoo);
        await Bun.sleep(2);
        emVoo--;
        return null;
      },
    );
    expect(pico).toBeLessThanOrEqual(4);
  });

  test("lista vazia não trava", async () => {
    expect(await pool([], 4, async () => 1)).toEqual([]);
  });
});
