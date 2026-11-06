// FPL Draft Tracker – lille server uden eksterne pakker.
//
// Serveren har to opgaver:
//   1. Den viser hjemmesidens filer fra mappen "public".
//   2. Den henter data fra FPL Draft-API'et og sender dem videre til siden.
//      Det er nødvendigt, fordi FPL ikke tillader, at en browser på en anden
//      adresse henter data direkte (ingen CORS-header).
//
// Svarene gemmes kort i hukommelsen (cache), så vi ikke spørger FPL hver gang
// nogen åbner siden.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 3000;
const LEAGUE_ID = process.env.LEAGUE_ID || "67616";
const UPSTREAM = "https://draft.premierleague.com/api/";
// Sæt MOCK_DIR til en mappe med JSON-filer for at køre uden internet (bruges til test).
const MOCK_DIR = process.env.MOCK_DIR || "";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");

// ---------------------------------------------------------------------------
// Hvilke data siden må hente, og hvor længe de gemmes (sekunder).
// Siden beder om korte navne (fx "league/details"), og serveren sætter selv
// liga-ID'et på. Alt andet afvises, så serveren ikke kan misbruges som proxy.
// ---------------------------------------------------------------------------
const ROUTES = [
  { pattern: /^bootstrap-static$/, upstream: () => "bootstrap-static", ttl: 600 },
  { pattern: /^game$/, upstream: () => "game", ttl: 60 },
  { pattern: /^league\/details$/, upstream: () => `league/${LEAGUE_ID}/details`, ttl: 60 },
  { pattern: /^league\/element-status$/, upstream: () => `league/${LEAGUE_ID}/element-status`, ttl: 300 },
  { pattern: /^league\/transactions$/, upstream: () => `draft/league/${LEAGUE_ID}/transactions`, ttl: 300 },
  { pattern: /^league\/trades$/, upstream: () => `draft/league/${LEAGUE_ID}/trades`, ttl: 300 },
  { pattern: /^event\/(\d{1,2})\/live$/, upstream: (m) => `event/${m[1]}/live`, ttl: 60 },
  { pattern: /^entry\/(\d{1,9})\/event\/(\d{1,2})$/, upstream: (m) => `entry/${m[1]}/event/${m[2]}`, ttl: 60 },
];

const cache = new Map(); // nøgle -> { time, body }

async function fetchUpstream(upstreamPath) {
  if (MOCK_DIR) {
    const file = path.join(MOCK_DIR, upstreamPath.replace(/\//g, "_") + ".json");
    return await readFile(file, "utf8");
  }
  const res = await fetch(UPSTREAM + upstreamPath, {
    headers: { "User-Agent": "fpl-draft-tracker (privat liga-side)", Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`FPL svarede ${res.status} på ${upstreamPath}`);
  return await res.text();
}

async function handleApi(req, res, apiPath) {
  const route = ROUTES.map((r) => ({ r, m: apiPath.match(r.pattern) })).find((x) => x.m);
  if (!route) return send(res, 404, JSON.stringify({ error: "Ukendt endpoint" }), "application/json");

  const upstreamPath = route.r.upstream(route.m);
  const hit = cache.get(upstreamPath);
  const fresh = hit && Date.now() - hit.time < route.r.ttl * 1000;

  if (!fresh) {
    try {
      const body = await fetchUpstream(upstreamPath);
      cache.set(upstreamPath, { time: Date.now(), body });
    } catch (err) {
      console.error(err.message);
      // Hvis FPL er nede, viser vi hellere lidt gamle data end ingenting.
      if (!hit) return send(res, 502, JSON.stringify({ error: "Kunne ikke hente data fra FPL" }), "application/json");
    }
  }
  const body = cache.get(upstreamPath).body;
  send(res, 200, body, "application/json", { "Cache-Control": `public, max-age=${Math.min(route.r.ttl, 60)}` });
}

// ---------------------------------------------------------------------------
// Statiske filer
// ---------------------------------------------------------------------------
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function handleStatic(req, res, urlPath) {
  let filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(urlPath)));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbudt", "text/plain");
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = path.join(filePath, "index.html");
    const data = await readFile(filePath);
    send(res, 200, data, TYPES[path.extname(filePath)] || "application/octet-stream", { "Cache-Control": "no-cache" });
  } catch {
    send(res, 404, "Ikke fundet", "text/plain; charset=utf-8");
  }
}

function send(res, status, body, type, extra = {}) {
  res.writeHead(status, { "Content-Type": type, ...extra });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Kun GET", "text/plain");
  if (url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
  if (url.pathname.startsWith("/api/fpl/")) return handleApi(req, res, url.pathname.slice("/api/fpl/".length));
  return handleStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`FPL Draft Tracker kører på http://localhost:${PORT} (liga ${LEAGUE_ID}${MOCK_DIR ? ", testdata" : ""})`);
});
