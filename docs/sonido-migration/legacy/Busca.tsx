/**
 * Trecho literal de `web/src/App.tsx` em `origin/main` (barra de busca).
 * Fica aqui para a comparação lado a lado não depender de recriar o markup.
 */
export function BuscaLegacy({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1 basis-64">
      <label htmlFor="busca-legado" className="sr-only">
        Buscar por cargo, empresa ou palavra
      </label>
      <input
        id="busca-legado"
        type="search"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar cargo, empresa ou palavra"
        className="w-full rounded-md border border-borda bg-superficie px-3 py-2 text-sm placeholder:text-texto-2"
      />
    </div>
  );
}
