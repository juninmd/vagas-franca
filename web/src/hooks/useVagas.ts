import { useCallback, useEffect, useState } from "react";
import type { RespostaVagas } from "../types.ts";

/** Um valor com casos nomeados: carregando, erro e sucesso não coexistem. */
export type EstadoVagas =
  | { status: "carregando" }
  | { status: "ok"; dados: RespostaVagas }
  | { status: "erro"; mensagem: string };

export function useVagas() {
  const [estado, setEstado] = useState<EstadoVagas>({ status: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  // `tentativa` só existe para disparar a busca de novo no botão "Tentar de novo".
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependência intencional
  useEffect(() => {
    // Cancelar a busca anterior evita que uma resposta lenta sobrescreva a nova.
    const controle = new AbortController();
    setEstado({ status: "carregando" });
    fetch("/api/vagas", { signal: controle.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`o servidor respondeu ${r.status}`);
        return r.json() as Promise<RespostaVagas>;
      })
      .then((dados) => setEstado({ status: "ok", dados }))
      .catch((e: unknown) => {
        if (controle.signal.aborted) return;
        setEstado({
          status: "erro",
          mensagem: e instanceof Error ? e.message : "falha desconhecida",
        });
      });
    return () => controle.abort();
  }, [tentativa]);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);
  return { estado, recarregar };
}
