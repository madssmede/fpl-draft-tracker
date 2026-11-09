// Alle beregninger samlet ét sted. Ingen af funktionerne her henter data
// eller rører ved siden – de tager JSON fra FPL ind og giver tal tilbage.
// Det gør dem nemme at teste (se mappen "test").

export const H2H_POINTS = { win: 3, draw: 1, loss: 0 };

// Positioner i FPL: 1 = målmand, 2 = forsvar, 3 = midtbane, 4 = angreb
export const POS = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
const FORMATION_MIN = { 1: 1, 2: 3, 3: 2, 4: 1 };
const FORMATION_MAX = { 1: 1, 2: 5, 3: 5, 4: 3 };

// ---------------------------------------------------------------------------
// Hold og kampe
// ---------------------------------------------------------------------------

/** Map fra league_entry-id (bruges i kampe) til holdet. */
export function entryMap(details) {
  return new Map(details.league_entries.map((e) => [e.id, e]));
}

/** Kampene i én runde. */
export function matchesForEvent(details, event) {
  return details.matches.filter((m) => m.event === event);
}

function resultFor(own, other) {
  if (own > other) return "V";
  if (own < other) return "T";
  return "U";
}

// ---------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------

/**
 * Beregner tabellen ud fra færdigspillede kampe (til og med runde `uptoEvent`).
 * Vi regner selv, fordi feltet matches_played i FPL's egen tabel er forkert.
 * Rækkefølge: point, derefter scorede point (samme som FPL).
 */
export function computeStandings(details, uptoEvent = Infinity, points = H2H_POINTS) {
  const rows = new Map(
    details.league_entries.map((e) => [
      e.id,
      { entry: e, played: 0, won: 0, drawn: 0, lost: 0, pf: 0, pa: 0, pts: 0, form: [] },
    ])
  );

  const finished = details.matches
    .filter((m) => m.finished && m.event <= uptoEvent)
    .sort((a, b) => a.event - b.event);

  for (const m of finished) {
    const a = rows.get(m.league_entry_1);
    const b = rows.get(m.league_entry_2);
    if (!a || !b) continue; // fri runde
    addResult(a, m.league_entry_1_points, m.league_entry_2_points, m.event, points);
    addResult(b, m.league_entry_2_points, m.league_entry_1_points, m.event, points);
  }

  const sorted = [...rows.values()].sort((x, y) => y.pts - x.pts || y.pf - x.pf);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}

function addResult(row, own, other, event, points) {
  const res = resultFor(own, other);
  row.played++;
  row.pf += own;
  row.pa += other;
  if (res === "V") (row.won++, (row.pts += points.win));
  if (res === "U") (row.drawn++, (row.pts += points.draw));
  if (res === "T") (row.lost++, (row.pts += points.loss));
  row.form.push({ event, res, own, other });
}

/**
 * Alt til holdsiden: placering i tabellen, resultater med den nyeste først,
 * samt gennemsnit, bedste og dårligste runde (null, før første runde er spillet).
 */
export function teamProfile(details, id, points = H2H_POINTS) {
  const standing = computeStandings(details, Infinity, points).find((r) => r.entry.id === id);
  if (!standing) return null;

  const history = details.matches
    .filter((m) => m.finished && (m.league_entry_1 === id || m.league_entry_2 === id))
    .map((m) => {
      const isFirst = m.league_entry_1 === id;
      const own = isFirst ? m.league_entry_1_points : m.league_entry_2_points;
      const other = isFirst ? m.league_entry_2_points : m.league_entry_1_points;
      return { event: m.event, opponentId: isFirst ? m.league_entry_2 : m.league_entry_1, own, other, res: resultFor(own, other) };
    })
    .sort((a, b) => b.event - a.event);

  const byScore = [...history].sort((a, b) => b.own - a.own);
  return {
    standing,
    history,
    average: history.length ? standing.pf / history.length : null,
    best: byScore[0] ?? null,
    worst: byScore.at(-1) ?? null,
  };
}

/**
 * Holdets nuværende trup delt op i positioner, med flest point øverst.
 * entryId er holdets entry_id, for det er det, FPL gemmer i feltet owner.
 */
export function squadByPosition(elementStatus, entryId, players) {
  const squad = elementStatus
    .filter((s) => s.owner === entryId)
    .map((s) => players.get(s.element))
    .filter(Boolean);
  return Object.values(POS).map((type) => ({
    type,
    players: squad.filter((p) => p.element_type === type).sort((a, b) => b.total_points - a.total_points),
  }));
}

/** Hvad man kan sortere spillerlisten efter, og hvilket felt i FPL's data det svarer til. */
export const PLAYER_SORTS = {
  point: (p) => p.total_points,
  form: (p) => Number(p.form),
  mal: (p) => p.goals_scored,
  assists: (p) => p.assists,
  minutter: (p) => p.minutes,
};

/**
 * Spillerlisten: alle spillere i Premier League med deres ejer i ligaen (null = fri spiller).
 * position: 1-4 eller null for alle.
 * owner: null for alle, "fri" for spillere uden ejer, eller et holds entry_id.
 * Ved lighed afgør samlede point og derefter navnet.
 */
export function playerList(players, elementStatus, { position = null, owner = null, sort = "point" } = {}) {
  const key = PLAYER_SORTS[sort] ?? PLAYER_SORTS.point;
  const owners = new Map(elementStatus.map((s) => [s.element, s.owner ?? null]));
  return [...players.values()]
    .map((player) => ({ player, owner: owners.get(player.id) ?? null }))
    .filter((row) => position == null || row.player.element_type === position)
    .filter((row) => owner == null || (owner === "fri" ? row.owner == null : row.owner === owner))
    .sort(
      (a, b) =>
        key(b.player) - key(a.player) ||
        b.player.total_points - a.player.total_points ||
        a.player.web_name.localeCompare(b.player.web_name, "da")
    );
}

/**
 * Den bedst mulige startopstilling: de 11 spillere med flest samlede point.
 * Reglerne: 1 målmand, 3-5 forsvarere, 3-5 midtbanespillere og 1-3 angribere.
 * Vi prøver hver tilladt formation med de bedste spillere på hver position og
 * tager den med flest point. Giver null, hvis ingen formation kan stilles.
 */
export const BEST_LINEUP_RULES = { 1: [1, 1], 2: [3, 5], 3: [3, 5], 4: [1, 3] };

export function bestLineup(players, rules = BEST_LINEUP_RULES) {
  const byPos = {};
  for (const type of Object.values(POS)) {
    byPos[type] = players
      .filter((p) => p.element_type === type)
      .sort((a, b) => b.total_points - a.total_points || a.web_name.localeCompare(b.web_name, "da"));
  }
  const range = ([min, max]) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

  let best = null;
  for (const gk of range(rules[1]))
    for (const def of range(rules[2]))
      for (const mid of range(rules[3]))
        for (const fwd of range(rules[4])) {
          const counts = { 1: gk, 2: def, 3: mid, 4: fwd };
          if (gk + def + mid + fwd !== 11) continue;
          if (Object.entries(counts).some(([type, n]) => byPos[type].length < n)) continue;
          const rows = Object.entries(counts).map(([type, n]) => byPos[type].slice(0, n));
          const total = rows.flat().reduce((sum, p) => sum + p.total_points, 0);
          if (!best || total > best.total) best = { formation: `${def}-${mid}-${fwd}`, rows, total };
        }
  return best;
}

/** Seneste færdige runde i ligaen (0 hvis ingen). */
export function lastFinishedEvent(details) {
  return details.matches.filter((m) => m.finished).reduce((max, m) => Math.max(max, m.event), 0);
}

/** Tabellen med pile for, hvor meget hvert hold er rykket siden runden før. */
export function standingsWithMovement(details, points = H2H_POINTS) {
  const last = lastFinishedEvent(details);
  const now = computeStandings(details, last, points);
  const before = new Map(computeStandings(details, last - 1, points).map((r) => [r.entry.id, r.rank]));
  for (const r of now) r.movement = last > 1 ? before.get(r.entry.id) - r.rank : 0;
  return now;
}

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------

/** Map: runde -> Map(league_entry-id -> point), kun færdige runder. */
export function scoresByEvent(details) {
  const out = new Map();
  for (const m of details.matches) {
    if (!m.finished) continue;
    if (!out.has(m.event)) out.set(m.event, new Map());
    const s = out.get(m.event);
    if (m.league_entry_1) s.set(m.league_entry_1, m.league_entry_1_points);
    if (m.league_entry_2) s.set(m.league_entry_2, m.league_entry_2_points);
  }
  return out;
}

/**
 * Afsluttede runder med den nyeste først: rundens kampe og højeste score.
 * topIds er en liste, fordi flere hold kan dele rundens højeste score.
 */
export function pastRounds(details) {
  const scores = scoresByEvent(details);
  return [...scores.keys()]
    .filter((event) => matchesForEvent(details, event).every((m) => m.finished))
    .sort((a, b) => b - a)
    .map((event) => {
      const topPoints = Math.max(...scores.get(event).values());
      const topIds = [...scores.get(event)].filter(([, p]) => p === topPoints).map(([id]) => id);
      return { event, matches: matchesForEvent(details, event), topPoints, topIds };
    });
}

/** Dato i dansk tid som "2026-11-08", så to tidspunkter kan sammenlignes på dag. */
function copenhagenDay(date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date(date));
}

/** Dagen efter, fx "2026-11-08" -> "2026-11-09". */
function nextDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Hvilken runde Kampe-fanen skal vise øverst.
 * Den aktuelle runde bliver stående, til den er afgjort af FPL OG dagen efter rundens
 * sidste Premier League-kamp er omme (dansk tid). Derefter vises næste runde.
 * FPL oplyser ikke, hvornår en runde blev afgjort. De afgør den som regel samme aften
 * eller dagen efter sidste kamp, så "dagen efter" dækker afgørelsesdagen.
 *
 * current: game.current_event · finished: er alle ligaens kampe i runden afgjort?
 * lastKickoff: tidspunkt for rundens sidste kamp (eller null) · lastEvent: sæsonens sidste runde
 */
export function featuredEvent({ current, finished, lastKickoff, now = new Date(), lastEvent = 38 }) {
  if (!finished || current >= lastEvent) return current;
  if (lastKickoff && copenhagenDay(now) <= nextDay(copenhagenDay(lastKickoff))) return current;
  return current + 1;
}

/** Runder efter afterEvent, hvor ingen kamp er færdig endnu, i rækkefølge: [{ event, matches }]. */
export function upcomingRounds(details, afterEvent) {
  const events = [...new Set(details.matches.map((m) => m.event))]
    .filter((event) => event > afterEvent)
    .sort((a, b) => a - b);
  return events
    .map((event) => ({ event, matches: matchesForEvent(details, event) }))
    .filter((r) => r.matches.every((m) => !m.finished));
}

/**
 * Ligaens næste draft, der ikke er holdt endnu: { event, time, orderMethod } eller null.
 * FPL gemmer alle ligaens drafts i league.drafts (den første er sæsonstarten).
 */
export function nextDraft(league) {
  const draft = (league?.drafts ?? [])
    .filter((d) => !d.draft_completed && !d.draft_started && d.draft_dt)
    .sort((a, b) => new Date(a.draft_dt) - new Date(b.draft_dt))[0];
  return draft ? { event: draft.event, time: draft.draft_dt, orderMethod: draft.order_method } : null;
}

/**
 * "Heldtabellen": hvad var resultatet, hvis hvert hold havde mødt alle de
 * andre hver eneste runde? Viser, hvem der har haft medvind og modvind.
 */
export function allPlayTable(details, points = H2H_POINTS) {
  const rows = new Map(
    details.league_entries.map((e) => [e.id, { entry: e, won: 0, drawn: 0, lost: 0, pts: 0, tops: 0, bottoms: 0 }])
  );
  for (const scores of scoresByEvent(details).values()) {
    const values = [...scores.values()];
    const max = Math.max(...values);
    const min = Math.min(...values);
    for (const [id, p] of scores) {
      const row = rows.get(id);
      if (!row) continue;
      if (p === max) row.tops++;
      if (p === min) row.bottoms++;
      for (const [otherId, q] of scores) {
        if (otherId === id) continue;
        if (p > q) row.won++;
        else if (p === q) row.drawn++;
        else row.lost++;
      }
    }
  }
  for (const r of rows.values()) {
    const games = r.won + r.drawn + r.lost;
    r.pts = r.won * points.win + r.drawn * points.draw;
    r.winPct = games ? (r.won + r.drawn / 2) / games : 0;
  }
  const sorted = [...rows.values()].sort((a, b) => b.pts - a.pts || b.won - a.won);
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}

/** Sjove rekorder: højeste/laveste score, største sejr, snævreste sejr. */
export function seasonRecords(details) {
  const finished = details.matches.filter((m) => m.finished && m.league_entry_1 && m.league_entry_2);
  if (!finished.length) return null;

  const scores = [];
  for (const m of finished) {
    scores.push({ event: m.event, id: m.league_entry_1, points: m.league_entry_1_points });
    scores.push({ event: m.event, id: m.league_entry_2, points: m.league_entry_2_points });
  }
  const margin = (m) => Math.abs(m.league_entry_1_points - m.league_entry_2_points);
  const decided = finished.filter((m) => margin(m) > 0);

  return {
    highest: scores.reduce((a, b) => (b.points > a.points ? b : a)),
    lowest: scores.reduce((a, b) => (b.points < a.points ? b : a)),
    biggestWin: decided.reduce((a, b) => (margin(b) > margin(a) ? b : a), decided[0]),
    closestWin: decided.reduce((a, b) => (margin(b) < margin(a) ? b : a), decided[0]),
    // Højeste score, der alligevel tabte
    unluckiest: finished
      .map((m) => {
        const loserIs1 = m.league_entry_1_points < m.league_entry_2_points;
        if (m.league_entry_1_points === m.league_entry_2_points) return null;
        return {
          event: m.event,
          id: loserIs1 ? m.league_entry_1 : m.league_entry_2,
          points: loserIs1 ? m.league_entry_1_points : m.league_entry_2_points,
          match: m,
        };
      })
      .filter(Boolean)
      .reduce((a, b) => (b.points > a.points ? b : a)),
  };
}

// ---------------------------------------------------------------------------
// Livepoint for et hold
// ---------------------------------------------------------------------------

/**
 * Status for en Premier League-klub i en runde:
 * "none" (ingen kamp), "upcoming", "live" eller "done".
 */
export function clubStatus(fixtures, clubId) {
  const own = fixtures.filter((f) => f.team_h === clubId || f.team_a === clubId);
  if (!own.length) return "none";
  const done = (f) => f.finished || f.finished_provisional;
  if (own.every(done)) return "done";
  if (own.some((f) => f.started && !done(f))) return "live";
  if (own.some(done)) return "live"; // dobbeltrunde, hvor første kamp er spillet
  return "upcoming";
}

/** Point og minutter for en spiller fra event/{gw}/live. */
export function liveStats(live, elementId) {
  const el = live?.elements?.[elementId] ?? live?.elements?.[String(elementId)];
  return el?.stats ?? null;
}

/**
 * Hvor mange point hver ting gav i runden, fx { minutes: 2, goals_scored: 5 }.
 * FPL's "explain" har én liste pr. kamp (to ved dobbeltrunde), så vi lægger dem sammen.
 * Formatet er [[[{ stat, value, points }, ...], kamp-id], ...].
 */
export function pointsByStat(live, elementId) {
  const el = live?.elements?.[elementId] ?? live?.elements?.[String(elementId)];
  const out = {};
  for (const [items] of el?.explain ?? []) {
    for (const item of items ?? []) out[item.stat] = (out[item.stat] ?? 0) + item.points;
  }
  return out;
}

/**
 * Bygger et holds opstilling med point.
 *
 * picksData:  svaret fra entry/{entry_id}/event/{gw}
 * live:       svaret fra event/{gw}/live
 * players:    Map(element-id -> spiller fra bootstrap-static)
 *
 * Når runden er afgjort, har FPL allerede lavet udskiftningerne (picksData.subs
 * er udfyldt), og så bruger vi deres opstilling direkte. Mens runden kører,
 * laver vi selv foreløbige automatiske udskiftninger efter FPL's regler.
 */
export function buildLineup(picksData, live, players) {
  const fixtures = live?.fixtures ?? [];
  const squad = [...picksData.picks]
    .sort((a, b) => a.position - b.position)
    .map((p) => {
      const player = players.get(p.element);
      const stats = liveStats(live, p.element);
      return {
        element: p.element,
        position: p.position,
        player,
        type: player?.element_type,
        points: stats?.total_points ?? 0,
        minutes: stats?.minutes ?? 0,
        stats,
        pointsByStat: pointsByStat(live, p.element),
        status: player ? clubStatus(fixtures, player.team) : "none",
        subIn: false,
        subOut: false,
      };
    });

  const officialSubs = picksData.subs ?? [];
  let starters = squad.filter((s) => s.position <= 11);
  let bench = squad.filter((s) => s.position > 11);

  if (officialSubs.length) {
    const ins = new Set(officialSubs.map((s) => s.element_in));
    const outs = new Set(officialSubs.map((s) => s.element_out));
    for (const s of squad) {
      s.subIn = ins.has(s.element);
      s.subOut = outs.has(s.element);
    }
  } else {
    ({ starters, bench } = provisionalAutoSubs(starters, bench));
  }

  const total = starters.reduce((sum, s) => sum + s.points, 0);
  const toPlay = starters.filter((s) => s.status === "upcoming" || s.status === "live").length;
  return { starters, bench, total, toPlay, provisional: !officialSubs.length && starters.some((s) => s.subIn) };
}

function formationOk(players) {
  const count = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const p of players) count[p.type]++;
  return Object.keys(FORMATION_MIN).every((t) => count[t] >= FORMATION_MIN[t] && count[t] <= FORMATION_MAX[t]);
}

/**
 * En startspiller, der ikke har spillet, og hvis kamp er færdig, skiftes ud med
 * den første spiller på bænken, der har spillet, så længe formationen holder.
 * Målmand kan kun erstattes af målmand.
 */
export function provisionalAutoSubs(starters, bench) {
  starters = [...starters];
  bench = [...bench];
  const finishedWithoutMinutes = (s) => s.minutes === 0 && (s.status === "done" || s.status === "none");

  for (let i = 0; i < starters.length; i++) {
    const out = starters[i];
    if (!finishedWithoutMinutes(out)) continue;

    for (let j = 0; j < bench.length; j++) {
      const cand = bench[j];
      if (cand.subOut || cand.minutes === 0) continue;
      const gkSwap = out.type === POS.GKP || cand.type === POS.GKP;
      if (gkSwap && out.type !== cand.type) continue;

      const trial = starters.map((s, k) => (k === i ? cand : s));
      if (!formationOk(trial)) continue;

      starters[i] = { ...cand, subIn: true };
      bench[j] = { ...out, subOut: true };
      break;
    }
  }
  return { starters, bench };
}

/** Del startspillerne op i rækker til banevisningen (målmand øverst). */
export function lineupRows(starters) {
  return [POS.GKP, POS.DEF, POS.MID, POS.FWD].map((t) => starters.filter((s) => s.type === t));
}
