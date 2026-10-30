import { existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import type { RespostaVagas } from "./vagas-api.ts";

/**
 * Rotas da interface web: `GET /api/vagas` e os arquivos estáticos de
 * `web/dist` (com volta para `index.html`, que é uma SPA). Fica sem banco e sem
 * `Bun.serve` de propósito: recebe de onde ler as vagas e devolve uma função
 * `Request → Response`, o que dá para testar sem rede.
 */
export interface Deps {
  /** Lista as vagas abertas já no formato da API. */
  lista: () => RespostaVagas;
  /** Pasta do build do front (`web/dist`). */
  distDir: string;
}

// A página só carrega o que é dela. `style-src 'unsafe-inline'` cobre os
// atributos `style` que o React escreve; scripts continuam só do próprio site.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SEGURANCA: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": CSP,
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...SEGURANCA,
    },
  });

/**
 * A lista inteira passa de 800 KB em JSON puro (as descrições pesam), mas é
 * texto repetitivo e comprime ~8x. Só comprime se o navegador aceita.
 */
const jsonGzip = (corpo: unknown, aceita: string) => {
  const bytes = new TextEncoder().encode(JSON.stringify(corpo));
  const gzip = /\bgzip\b/.test(aceita);
  return new Response(gzip ? Bun.gzipSync(bytes) : bytes, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      vary: "accept-encoding",
      ...(gzip ? { "content-encoding": "gzip" } : {}),
      ...SEGURANCA,
    },
  });
};

/**
 * Caminho do arquivo dentro de `distDir`, ou null se escapar dele. O
 * `decodeURIComponent` vem antes da checagem: `%2e%2e%2f` também é `../`.
 */
export function caminhoSeguro(
  distDir: string,
  pathname: string,
): string | null {
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decodificado.includes("\0")) return null;
  const raiz = normalize(distDir + sep);
  const alvo = normalize(join(distDir, decodificado));
  return alvo.startsWith(raiz) || alvo === normalize(distDir) ? alvo : null;
}

const arquivo = (caminho: string, head: boolean, imutavel: boolean) => {
  const f = Bun.file(caminho);
  return new Response(head ? null : f, {
    headers: {
      "content-type": f.type,
      "content-length": String(f.size),
      // Arquivos de `assets/` têm hash no nome: nunca mudam sob o mesmo nome.
      "cache-control": imutavel
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      ...SEGURANCA,
    },
  });
};

const ehArquivo = (p: string) => existsSync(p) && statSync(p).isFile();

export function criaHandler(deps: Deps): (req: Request) => Response {
  return (req) => {
    if (req.method !== "GET" && req.method !== "HEAD")
      return json({ erro: "método não permitido" }, 405);
    const head = req.method === "HEAD";
    const { pathname } = new URL(req.url);

    if (pathname === "/api/vagas") {
      if (head) return new Response(null, { headers: SEGURANCA });
      return jsonGzip(deps.lista(), req.headers.get("accept-encoding") ?? "");
    }
    if (pathname.startsWith("/api/"))
      return json({ erro: "não encontrado" }, 404);

    const alvo = caminhoSeguro(deps.distDir, pathname);
    if (alvo === null) return json({ erro: "caminho inválido" }, 400);
    if (ehArquivo(alvo))
      return arquivo(alvo, head, pathname.startsWith("/assets/"));

    // Pedido de arquivo que não existe (tem extensão) é 404; rota do front cai no index.
    if (/\.[a-z0-9]+$/i.test(pathname))
      return json({ erro: "não encontrado" }, 404);
    const index = join(deps.distDir, "index.html");
    if (ehArquivo(index)) return arquivo(index, head, false);
    return json({ erro: "front não compilado: rode `bun run web:build`" }, 503);
  };
}
