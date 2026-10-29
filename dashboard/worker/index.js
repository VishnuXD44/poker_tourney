// Serves the static export from ./out, plus one route: /api/table/<code>/ws opens a
// WebSocket to that table's Durable Object (worker/pokerTable.js). Only /api/* runs this
// script first (run_worker_first in wrangler.jsonc); everything else is served as assets.
export { PokerTable } from "./pokerTable.js";

const TABLE_ROUTE = /^\/api\/table\/([a-z0-9]{6,16})\/ws$/;

/** Browsers always send Origin on WebSocket upgrades; only accept our own pages. */
function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(TABLE_ROUTE);
    if (match) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      if (!sameOrigin(request, url)) return new Response("Forbidden", { status: 403 });
      return env.TABLES.get(env.TABLES.idFromName(match[1])).fetch(request);
    }
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
