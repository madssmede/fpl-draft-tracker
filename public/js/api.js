// Henter data fra vores egen server (/api/fpl/...), som henter dem fra FPL.
// Liga-ID'et kender serveren selv, så siden behøver ikke vide det.

const memo = new Map();

async function get(path, { force = false } = {}) {
  if (!force && memo.has(path)) return memo.get(path);
  const promise = fetch(`/api/fpl/${path}`).then(async (res) => {
    if (!res.ok) throw new Error(`Kunne ikke hente ${path} (${res.status})`);
    return res.json();
  });
  memo.set(path, promise);
  promise.catch(() => memo.delete(path));
  return promise;
}

/** Glemmer de data, der ændrer sig under en runde, så næste kald henter friske. */
export function forgetLiveData() {
  for (const key of memo.keys()) {
    if (key === "game" || key === "league/details" || key.includes("/live") || key.startsWith("entry/")) {
      memo.delete(key);
    }
  }
}

export const api = {
  bootstrap: () => get("bootstrap-static"),
  game: () => get("game"),
  details: () => get("league/details"),
  transactions: () => get("league/transactions"),
  trades: () => get("league/trades"),
  elementStatus: () => get("league/element-status"),
  live: (gw) => get(`event/${gw}/live`),
  picks: (entryId, gw) => get(`entry/${entryId}/event/${gw}`),
};

/** Bootstrap pakket om til opslagstabeller. Gemmes, så det kun sker én gang. */
let indexPromise;
export function playerIndex() {
  indexPromise ??= api.bootstrap().then((b) => ({
    players: new Map(b.elements.map((e) => [e.id, e])),
    clubs: new Map(b.teams.map((t) => [t.id, t])),
    types: new Map(b.element_types.map((t) => [t.id, t])),
    events: new Map(b.events.data.map((e) => [e.id, e])),
    points: {
      win: b.settings?.league?.h2h_win ?? 3,
      draw: b.settings?.league?.h2h_draw ?? 1,
      loss: b.settings?.league?.h2h_lose ?? 0,
    },
  }));
  return indexPromise;
}
