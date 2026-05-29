/**
 * Elisa — Proxy DJEN via Vercel Edge Functions
 *
 * Versão Vercel Edge do proxy. Roda no edge network da Vercel
 * (não tem CloudFront na frente como Deno Deploy, sem geo-block,
 * sem bot detection automática no Free).
 *
 * Custo: Vercel Hobby (Free) dá 100k invocations/dia. A Elisa usa
 * ~200/dia max.
 */

export const config = {
  runtime: "edge",
};

const DJEN_TARGET = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

const HEADERS_NAVEGADOR: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://comunica.pje.jus.br/",
  "Origin": "https://comunica.pje.jus.br",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

export default async function handler(request: Request): Promise<Response> {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "X-Elisa-Secret, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Apenas GET é suportado." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Verifica o secret (env var na Vercel)
  const PROXY_SECRET = process.env.PROXY_SECRET || "";
  if (PROXY_SECRET) {
    const secretRecebido = request.headers.get("X-Elisa-Secret") || "";
    if (secretRecebido !== PROXY_SECRET) {
      return new Response(
        JSON.stringify({ error: "X-Elisa-Secret inválido ou ausente." }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // Forward pro DJEN preservando query params
  const urlEntrada = new URL(request.url);
  const urlAlvo = DJEN_TARGET + urlEntrada.search;

  let respostaDjen: Response;
  try {
    respostaDjen = await fetch(urlAlvo, {
      method: "GET",
      headers: HEADERS_NAVEGADOR,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "Falha ao contatar o DJEN",
        detalhes: String(e),
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // Repassa o body cru
  const headersResposta = new Headers();
  const ct = respostaDjen.headers.get("Content-Type");
  if (ct) headersResposta.set("Content-Type", ct);
  headersResposta.set("Access-Control-Allow-Origin", "*");
  headersResposta.set("X-Proxy-Origin", "vercel-edge");

  return new Response(respostaDjen.body, {
    status: respostaDjen.status,
    headers: headersResposta,
  });
}
