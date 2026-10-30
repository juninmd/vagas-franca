import { useEffect, useState } from "react";

/**
 * `true` só depois de `ms` com `ativo` ligado. Esqueleto de carga que aparece em
 * menos de 200 ms pisca na tela e parece mais lento que esperar em branco.
 */
export function useAtraso(ativo: boolean, ms = 200): boolean {
  const [passou, setPassou] = useState(false);
  useEffect(() => {
    if (!ativo) {
      setPassou(false);
      return;
    }
    const t = setTimeout(() => setPassou(true), ms);
    return () => clearTimeout(t);
  }, [ativo, ms]);
  return ativo && passou;
}
