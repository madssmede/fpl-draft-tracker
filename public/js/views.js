// Hver funktion her bygger én side. De henter data, regner via calc.js
// og returnerer HTML som tekst.

import { api, playerIndex } from "./api.js";
import * as calc from "./calc.js";
import { esc, fmtDate, fmtShortDate, crest, managerName, playerPhoto, clubBadge, formPills, teamLink, teamLinkInCard } from "./ui.js";

// ---------------------------------------------------------------------------
// Fælles: hvilken runde er vi i?
// ---------------------------------------------------------------------------

export async function currentEvent() {
  const game = await api.game();
  return game.current_event || 1;
}

function eventState(matches) {
  if (matches.length && matches.every((m) => m.finished)) return "done";
  if (matches.some((m) => m.started)) return "live";
  return "upcoming";
}

/** Livepoint for alle hold i en runde: Map(league_entry-id -> lineup). */
async function liveLineups(details, gw, idx) {
  const [live, ...picks] = await Promise.all([
    api.live(gw),
    ...details.league_entries.map((e) => api.picks(e.entry_id, gw).catch(() => null)),
  ]);
  const out = new Map();
  details.league_entries.forEach((e, i) => {
    if (picks[i]) out.set(e.id, calc.buildLineup(picks[i], live, idx.players));
  });
  return { live, lineups: out };
}

// ---------------------------------------------------------------------------
// Kampe
// ---------------------------------------------------------------------------

export async function matchesView(gwParam) {
  const [details, idx, current] = await Promise.all([api.details(), playerIndex(), currentEvent()]);
  const entries = calc.entryMap(details);
  const lastEvent = Math.max(...details.matches.map((m) => m.event));
  const gw = Math.min(Math.max(Number(gwParam) || current, 1), lastEvent);
  const matches = calc.matchesForEvent(details, gw);
  const state = eventState(matches);
  const event = idx.events.get(gw);

  let lineups = new Map();
  if (state === "live") ({ lineups } = await liveLineups(details, gw, idx));

  const scoreOf = (m, side) => {
    const id = m[`league_entry_${side}`];
    if (m.finished) return m[`league_entry_${side}_points`];
    return lineups.get(id)?.total ?? m[`league_entry_${side}_points`];
  };

  const subtitle = {
    done: "Afsluttet",
    live: `<span class="live-dot"></span>Live · opdateres automatisk`,
    upcoming: event ? `Deadline ${fmtDate(event.deadline_time)}` : "Kommende runde",
  }[state];

  const cards = matches
    .map((m) => {
      const a = entries.get(m.league_entry_1);
      const b = entries.get(m.league_entry_2);
      if (!a || !b) return "";
      const sa = scoreOf(m, 1);
      const sb = scoreOf(m, 2);
      const showScore = state !== "upcoming";
      const winA = showScore && state === "done" && sa > sb;
      const winB = showScore && state === "done" && sb > sa;
      const la = lineups.get(a.id);
      const lb = lineups.get(b.id);
      const toPlay = state === "live" && la && lb ? `<div class="to-play">${la.toPlay} · tilbage at spille · ${lb.toPlay}</div>` : "";
      return `
        <a class="card match-card" href="#/kamp/${gw}/${a.id}-${b.id}">
          <div class="side home ${winB ? "lost" : ""}">
            ${crest(a)}
            <div class="names"><strong>${teamLinkInCard(a)}</strong><small>${esc(managerName(a))}</small></div>
          </div>
          <div class="score ${state}">
            ${showScore ? `<span>${sa}</span><i>–</i><span>${sb}</span>` : `<span class="vs">vs</span>`}
          </div>
          <div class="side away ${winA ? "lost" : ""}">
            <div class="names"><strong>${teamLinkInCard(b)}</strong><small>${esc(managerName(b))}</small></div>
            ${crest(b)}
          </div>
          ${toPlay}
        </a>`;
    })
    .join("");

  return `
    <section class="gw-header">
      <a class="gw-arrow ${gw <= 1 ? "disabled" : ""}" href="#/kampe/${gw - 1}" aria-label="Forrige runde">‹</a>
      <div><h2>Runde ${gw}</h2><p class="muted">${subtitle}</p></div>
      <a class="gw-arrow ${gw >= lastEvent ? "disabled" : ""}" href="#/kampe/${gw + 1}" aria-label="Næste runde">›</a>
    </section>
    ${gw !== current ? `<p class="center"><a class="link" href="#/kampe/${current}">Gå til aktuel runde (${current})</a></p>` : ""}
    <div class="stack">${cards}</div>
    ${state === "live" && [...lineups.values()].some((l) => l.provisional) ? `<p class="note">Point er foreløbige og inkluderer forventede automatiske udskiftninger.</p>` : ""}
  `;
}

// ---------------------------------------------------------------------------
// Runder: alle afsluttede runder og deres resultater
// ---------------------------------------------------------------------------

export async function roundsView() {
  const [details, idx] = await Promise.all([api.details(), playerIndex()]);
  const entries = calc.entryMap(details);
  const rounds = calc.pastRounds(details);
  if (!rounds.length) return `<div class="card">Resultaterne dukker op efter første runde.</div>`;

  const resultRow = (m, event) => {
    const a = entries.get(m.league_entry_1);
    const b = entries.get(m.league_entry_2);
    if (!a || !b) return ""; // fri runde
    const sa = m.league_entry_1_points;
    const sb = m.league_entry_2_points;
    return `
      <a class="result-row" href="#/kamp/${event}/${a.id}-${b.id}">
        <span class="result-team home ${sb > sa ? "lost" : ""}"><strong>${teamLinkInCard(a)}</strong>${crest(a, "sm")}</span>
        <span class="result-score">${sa}<i>–</i>${sb}</span>
        <span class="result-team ${sa > sb ? "lost" : ""}">${crest(b, "sm")}<strong>${teamLinkInCard(b)}</strong></span>
      </a>`;
  };

  const cards = rounds
    .map((r) => {
      const started = idx.events.get(r.event)?.deadline_time;
      const topNames = r.topIds.map((id) => teamLink(entries.get(id))).join(" og ");
      return `
        <section class="card round-card">
          <div class="round-head">
            <h2>Runde ${r.event}</h2>
            ${started ? `<span class="muted">${fmtShortDate(started)}</span>` : ""}
          </div>
          <div>${r.matches.map((m) => resultRow(m, r.event)).join("")}</div>
          <p class="round-top muted">Højeste score: <strong>${r.topPoints}</strong> · ${topNames}</p>
        </section>`;
    })
    .join("");

  return `<div class="stack">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Holdside: nøgletal, trup og resultater for ét hold
// ---------------------------------------------------------------------------

/**
 * Én spiller på en bane med point for hele sæsonen.
 * popup: et tryk åbner pop-up'en med sæsontal. owner: holdet, der ejer spilleren (vises som et lille mærke).
 */
function squadPlayer(p, { popup = false, owner = null } = {}) {
  return `
    <div class="player squad-player" ${popup ? `data-season-player="${p.id}"` : ""}>
      <span class="player-photo">${playerPhoto(p)}${owner ? `<span class="pitch-owner">${crest(owner, "xs")}</span>` : ""}</span>
      <span class="player-name">${esc(p.web_name)}</span>
      <span class="pts">${p.total_points}</span>
    </div>`;
}

export async function teamView(idParam) {
  const id = Number(idParam);
  const [details, idx, status] = await Promise.all([api.details(), playerIndex(), api.elementStatus()]);
  const entries = calc.entryMap(details);
  const entry = entries.get(id);
  if (!entry) return `<div class="card">Holdet blev ikke fundet.</div>`;

  const { standing, history, average, best, worst } = calc.teamProfile(details, id, idx.points);

  const tile = (title, value, sub) => `<div class="card record"><small>${title}</small><strong>${value}</strong><span>${sub}</span></div>`;
  const tiles = history.length
    ? `<div class="records">
        ${tile("Placering", `${standing.rank}.`, `${standing.pts} point · ${standing.won}-${standing.drawn}-${standing.lost}`)}
        ${tile("Snit pr. runde", average.toFixed(1).replace(".", ","), `${standing.pf} scorede point`)}
        ${tile("Bedste runde", best.own, `Runde ${best.event}`)}
        ${tile("Dårligste runde", worst.own, `Runde ${worst.event}`)}
      </div>`
    : "";

  // Hele truppen på banen: keeperne foran målet og hver position på sin egen linje.
  const squad = calc
    .squadByPosition(status.element_status ?? [], entry.entry_id, idx.players)
    .filter((group) => group.players.length)
    .map((group) => `<div class="pitch-row">${group.players.map((p) => squadPlayer(p)).join("")}</div>`)
    .join("");

  const results = history
    .map((h) => {
      const opponent = entries.get(h.opponentId);
      return `
        <a class="history-row" href="#/kamp/${h.event}/${id}-${h.opponentId}">
          <span class="muted">R${h.event}</span>
          <span class="pill pill-${h.res}">${h.res}</span>
          <span class="history-opponent">${teamLinkInCard(opponent)}</span>
          <strong>${h.own}–${h.other}</strong>
        </a>`;
    })
    .join("");

  return `
    <a class="back" href="#/tabel">‹ Tabel</a>
    <section class="card team-head">
      ${crest(entry, "lg")}
      <div class="names"><h2>${esc(entry.entry_name)}</h2><small>${esc(managerName(entry))}</small></div>
      <div class="form hide-xs">${formPills(standing.form)}</div>
    </section>
    ${tiles}
    <div class="team-columns">
      <section class="card pitch-card">
        <header class="pitch-head"><strong>Trup</strong><span class="muted squad-note">point i sæsonen</span></header>
        ${squad ? `<div class="pitch squad-pitch">${squad}</div>` : `<p class="muted squad-empty">Truppen kunne ikke findes.</p>`}
      </section>
      <section class="card">
        <h2 class="card-title">Resultater</h2>
        ${results || `<p class="muted">Holdet har ikke spillet endnu.</p>`}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Spillere: alle spillere med sæsontal, ejer, filtre og sortering
// ---------------------------------------------------------------------------

const POSITION_FILTERS = [
  [null, "Alle"],
  [1, "Målmænd"],
  [2, "Forsvar"],
  [3, "Midtbane"],
  [4, "Angreb"],
];

/** Adressen husker valgene: #/spillere/<sortering>/<position>/<hold>, fx #/spillere/mal/4/alle */
function playersUrl({ sort, position, team }) {
  return `#/spillere/${sort}/${position ?? "alle"}/${team ?? "alle"}`;
}

export async function playersView(sortParam, positionParam, teamParam) {
  const [details, idx, status] = await Promise.all([api.details(), playerIndex(), api.elementStatus()]);
  const entries = calc.entryMap(details);
  const byEntryId = new Map(details.league_entries.map((e) => [e.entry_id, e]));

  const sort = calc.PLAYER_SORTS[sortParam] ? sortParam : "point";
  const position = [1, 2, 3, 4].includes(Number(positionParam)) ? Number(positionParam) : null;
  // Ejer-filteret: et hold, "fri" (spillere uden ejer) eller alle
  const team = entries.get(Number(teamParam)) ?? null;
  const freeOnly = !team && teamParam === "fri";
  const state = { sort, position, team: team?.id ?? (freeOnly ? "fri" : null) };

  const owner = team ? team.entry_id : freeOnly ? "fri" : null;
  const rows = calc.playerList(idx.players, status.element_status ?? [], { position, owner, sort });

  const chips = POSITION_FILTERS.map(
    ([value, label]) => `<a class="chip ${value === position ? "active" : ""}" href="${playersUrl({ ...state, position: value })}">${label}</a>`
  ).join("");
  const teamOptions = [
    `<option value="${playersUrl({ ...state, team: null })}">Alle spillere</option>`,
    `<option value="${playersUrl({ ...state, team: "fri" })}" ${freeOnly ? "selected" : ""}>Frie spillere</option>`,
  ]
    .concat(
      details.league_entries.map(
        (e) => `<option value="${playersUrl({ ...state, team: e.id })}" ${e.id === team?.id ? "selected" : ""}>${esc(e.entry_name)}</option>`
      )
    )
    .join("");

  // Kolonneoverskrift, der sorterer listen, når man trykker på den.
  const sortHead = (key, label, cls = "") =>
    `<th class="num ${cls}"><a class="sort-link ${key === sort ? "active" : ""}" href="${playersUrl({ ...state, sort: key })}">${label}</a></th>`;

  const body = rows
    .map(({ player: p, owner }, i) => {
      const club = idx.clubs.get(p.team);
      const ownerEntry = byEntryId.get(owner);
      return `
        <tr class="player-row" data-season-player="${p.id}">
          <td class="rank muted hide-sm">${i + 1}</td>
          <td><div class="team-cell">${playerPhoto(p)}<div class="names"><strong>${esc(p.web_name)}</strong><small>${clubBadge(club)} ${esc(club?.short_name ?? "")} · ${esc(idx.types.get(p.element_type)?.singular_name_short ?? "")}</small></div></div></td>
          <td>${ownerEntry ? `<span class="owner-cell">${crest(ownerEntry, "sm")}<span class="hide-sm">${teamLinkInCard(ownerEntry)}</span></span>` : `<span class="muted free">Fri</span>`}</td>
          <td class="num total">${p.total_points}</td>
          <td class="num hide-xs">${esc(String(p.form).replace(".", ","))}</td>
          <td class="num">${p.goals_scored}</td>
          <td class="num">${p.assists}</td>
          <td class="num hide-sm">${p.minutes}</td>
        </tr>`;
    })
    .join("");

  // Bedste opstilling ud fra holdfilteret (alle, frie eller ét hold). Positionsfilteret bruges ikke her.
  const pool = calc.playerList(idx.players, status.element_status ?? [], { owner }).map((r) => r.player);
  const best = calc.bestLineup(pool);
  const ownerOf = new Map((status.element_status ?? []).map((s) => [s.element, byEntryId.get(s.owner)]));
  const scope = team ? `for ${esc(team.entry_name)}` : freeOnly ? "blandt frie spillere" : "blandt alle spillere";
  const bestPitch = best
    ? `<div class="pitch squad-pitch">${best.rows
        .map((row) => `<div class="pitch-row">${row.map((p) => squadPlayer(p, { popup: true, owner: team ? null : ownerOf.get(p.id) })).join("")}</div>`)
        .join("")}</div>`
    : `<p class="muted squad-empty">Der er ikke spillere nok til en opstilling.</p>`;

  return `
    <section class="card pitch-card best-card">
      <header class="pitch-head">
        <div class="names"><strong>Bedste opstilling</strong><small>${scope} · point i sæsonen</small></div>
        ${best ? `<span class="pitch-total"><small class="muted">${best.formation}</small> ${best.total}</span>` : ""}
      </header>
      ${bestPitch}
    </section>
    <section class="card filters">
      <div class="chips">${chips}</div>
      <select class="team-select" data-nav aria-label="Vælg hold">${teamOptions}</select>
    </section>
    <section class="card table-card">
      <h2 class="card-title">Spillere <span class="muted">${rows.length} spillere · tryk på en kolonne for at sortere</span></h2>
      ${
        rows.length
          ? `<table class="league-table players-table">
              <thead><tr><th class="hide-sm">#</th><th>Spiller</th><th>Ejer</th>${sortHead("point", "P")}${sortHead("form", "Form", "hide-xs")}${sortHead("mal", "M")}${sortHead("assists", "A")}${sortHead("minutter", "Min", "hide-sm")}</tr></thead>
              <tbody>${body}</tbody>
            </table>`
          : `<p class="muted card-intro">Ingen spillere passer til filteret.</p>`
      }
    </section>
    <p class="note">P = point i sæsonen · M = mål · A = assists. Tallene gælder hele sæsonen, også fra før holdet fik spilleren.</p>`;
}

const SEASON_STATS = [
  ["total_points", "Point"],
  ["points_per_game", "Point pr. kamp"],
  ["form", "Form"],
  ["minutes", "Minutter"],
  ["starts", "Startet inde"],
  ["goals_scored", "Mål"],
  ["assists", "Assists"],
  ["expected_goals", "Forventede mål (xG)"],
  ["expected_assists", "Forventede assists (xA)"],
  ["clean_sheets", "Clean sheets"],
  ["goals_conceded", "Mål imod"],
  ["saves", "Redninger"],
  ["defensive_contribution", "Defensive aktioner"],
  ["bonus", "Bonus"],
  ["yellow_cards", "Gule kort"],
  ["red_cards", "Røde kort"],
];

/** Pop-up med en spillers tal for hele sæsonen. */
export async function seasonPlayerDetail(elementId) {
  const [details, idx, status] = await Promise.all([api.details(), playerIndex(), api.elementStatus()]);
  const p = idx.players.get(Number(elementId));
  if (!p) return "";
  const club = idx.clubs.get(p.team);
  const type = idx.types.get(p.element_type);
  const owner = (status.element_status ?? []).find((s) => s.element === p.id)?.owner;
  const ownerEntry = details.league_entries.find((e) => e.entry_id === owner);
  const rows = SEASON_STATS.filter(([key]) => p[key] != null)
    .map(([key, label]) => `<tr><td>${label}</td><td>${esc(String(p[key]).replace(".", ","))}</td></tr>`)
    .join("");
  return `
    <div class="sheet-head">
      ${playerPhoto(p)}
      <div><h3>${esc(p.first_name)} ${esc(p.second_name)}</h3>
      <p class="muted">${clubBadge(club)} ${esc(club?.name ?? "")} · ${esc(type?.singular_name_short ?? "")}</p></div>
      <span class="sheet-pts">${p.total_points}<small>point</small></span>
    </div>
    ${ownerEntry ? `<p class="sheet-owner">${crest(ownerEntry, "sm")}<span>Ejes af ${teamLink(ownerEntry)}</span></p>` : ""}
    ${p.news ? `<p class="sheet-news">⚠️ ${esc(p.news)}</p>` : ""}
    <table class="stat-table">${rows}</table>`;
}

// ---------------------------------------------------------------------------
// Kampside med opstillinger
// ---------------------------------------------------------------------------

export async function matchView(gw, pair) {
  gw = Number(gw);
  const [idA, idB] = pair.split("-").map(Number);
  const [details, idx] = await Promise.all([api.details(), playerIndex()]);
  const entries = calc.entryMap(details);
  const a = entries.get(idA);
  const b = entries.get(idB);
  const match = details.matches.find(
    (m) => m.event === gw && [m.league_entry_1, m.league_entry_2].includes(idA) && [m.league_entry_1, m.league_entry_2].includes(idB)
  );
  if (!a || !b || !match) return `<div class="card">Kampen blev ikke fundet.</div>`;

  const back = `<a class="back" href="#/kampe/${gw}">‹ Runde ${gw}</a>`;

  if (!match.started) {
    return `${back}
      <section class="card scoreboard">
        ${scoreSide(a)}<div class="big-score upcoming"><span class="vs">vs</span><small>Runde ${gw}</small></div>${scoreSide(b)}
      </section>
      <p class="note">Opstillingerne vises, når runden starter.</p>
      ${headToHead(details, idA, idB, entries)}`;
  }

  const [live, pa, pb] = await Promise.all([api.live(gw), api.picks(a.entry_id, gw), api.picks(b.entry_id, gw)]);
  const la = calc.buildLineup(pa, live, idx.players);
  const lb = calc.buildLineup(pb, live, idx.players);
  const scoreA = match.finished ? match[match.league_entry_1 === idA ? "league_entry_1_points" : "league_entry_2_points"] : la.total;
  const scoreB = match.finished ? match[match.league_entry_1 === idB ? "league_entry_1_points" : "league_entry_2_points"] : lb.total;
  const status = match.finished ? "Slut" : `<span class="live-dot"></span>Live`;

  // Gem opstillingerne, så et klik på en spiller kan vise detaljer.
  window.__lineupPlayers = new Map([...la.starters, ...la.bench, ...lb.starters, ...lb.bench].map((s) => [s.element, s]));

  return `${back}
    <section class="card scoreboard">
      ${scoreSide(a)}
      <div class="big-score ${match.finished ? "done" : "live"}"><span>${scoreA} – ${scoreB}</span><small>${status}</small></div>
      ${scoreSide(b)}
    </section>
    <div class="pitches">
      ${pitch(a, la, live, idx)}
      ${pitch(b, lb, live, idx)}
    </div>
    ${la.provisional || lb.provisional ? `<p class="note">Pilene viser forventede automatiske udskiftninger. De bliver endelige, når runden er afgjort.</p>` : ""}
    ${headToHead(details, idA, idB, entries)}
  `;
}

function scoreSide(entry) {
  return `<div class="score-side">${crest(entry, "lg")}<strong>${teamLink(entry)}</strong><small>${esc(managerName(entry))}</small></div>`;
}

function pitch(entry, lineup, live, idx) {
  const rows = calc
    .lineupRows(lineup.starters)
    .map((row) => `<div class="pitch-row">${row.map((s) => playerChip(s, live, idx)).join("")}</div>`)
    .join("");
  const bench = lineup.bench.map((s) => playerChip(s, live, idx, true)).join("");
  return `
    <section class="card pitch-card">
      <header class="pitch-head">${crest(entry, "sm")}<strong>${teamLink(entry)}</strong><span class="pitch-total">${lineup.total}</span></header>
      <div class="pitch">${rows}</div>
      <div class="bench"><span class="bench-label">Bænk</span><div class="bench-row">${bench}</div></div>
    </section>`;
}

function opponentFor(player, live, idx) {
  const f = (live?.fixtures ?? []).find((x) => x.team_h === player.team || x.team_a === player.team);
  if (!f) return "Ingen kamp";
  const home = f.team_h === player.team;
  const opp = idx.clubs.get(home ? f.team_a : f.team_h);
  return `${opp?.short_name ?? "?"} (${home ? "H" : "U"})`;
}

function playerChip(s, live, idx, onBench = false) {
  const p = s.player;
  const badge =
    s.status === "upcoming"
      ? `<span class="pts pts-upcoming">${esc(p ? opponentFor(p, live, idx) : "")}</span>`
      : `<span class="pts ${s.points >= 10 ? "pts-hot" : ""}">${s.points}</span>`;
  const marks = `${s.subIn ? `<span class="sub sub-in" title="Skiftet ind">↑</span>` : ""}${s.subOut ? `<span class="sub sub-out" title="Skiftet ud">↓</span>` : ""}`;
  return `
    <button class="player ${onBench ? "on-bench" : ""} status-${s.status}" data-element="${s.element}">
      <span class="player-photo">${playerPhoto(p)}${marks}${s.status === "live" ? `<span class="live-dot small"></span>` : ""}</span>
      <span class="player-name">${esc(p?.web_name ?? "Ukendt")}</span>
      ${badge}
    </button>`;
}

const STAT_LABELS = [
  ["minutes", "Minutter"],
  ["goals_scored", "Mål"],
  ["assists", "Assists"],
  ["clean_sheets", "Clean sheet"],
  ["goals_conceded", "Mål imod"],
  ["saves", "Redninger"],
  ["defensive_contribution", "Defensive aktioner"],
  ["bonus", "Bonus"],
  ["bps", "BPS"],
  ["yellow_cards", "Gule kort"],
  ["red_cards", "Røde kort"],
  ["own_goals", "Selvmål"],
  ["penalties_saved", "Straffe reddet"],
  ["penalties_missed", "Straffe brændt"],
];

/** Indhold til pop-up'en, når man klikker på en spiller. */
export async function playerDetail(elementId) {
  const s = window.__lineupPlayers?.get(Number(elementId));
  if (!s?.player) return "";
  const idx = await playerIndex();
  const club = idx.clubs.get(s.player.team);
  const type = idx.types.get(s.player.element_type);
  // Hver linje: hvad spilleren har gjort, og hvor mange point det gav (fx "Minutter 90 +2").
  const pts = s.pointsByStat ?? {};
  const fmtPts = (p) => (p == null ? "" : p > 0 ? `+${p}` : p < 0 ? `−${Math.abs(p)}` : "0");
  const rows = STAT_LABELS.filter(([key]) => s.stats && (s.stats[key] || key === "minutes" || pts[key]))
    .map(([key, label]) => `<tr><td>${label}</td><td class="stat-val">${s.stats[key]}</td><td class="stat-pts">${fmtPts(pts[key])}</td></tr>`)
    .join("");
  const table = rows
    ? `<table class="stat-table points-table">
        <thead><tr><th></th><th class="stat-val">Antal</th><th class="stat-pts">Point</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>I alt</td><td></td><td class="stat-pts">${s.points}</td></tr></tfoot>
      </table>`
    : "";
  return `
    <div class="sheet-head">
      ${playerPhoto(s.player)}
      <div><h3>${esc(s.player.first_name)} ${esc(s.player.second_name)}</h3>
      <p class="muted">${clubBadge(club)} ${esc(club?.name ?? "")} · ${esc(type?.singular_name_short ?? "")}</p></div>
      <span class="sheet-pts">${s.points}<small>point</small></span>
    </div>
    ${table || `<p class="muted">Har ikke spillet endnu i denne runde.</p>`}`;
}

function headToHead(details, idA, idB, entries) {
  const games = details.matches.filter(
    (m) => m.finished && [m.league_entry_1, m.league_entry_2].includes(idA) && [m.league_entry_1, m.league_entry_2].includes(idB)
  );
  if (!games.length) return "";
  const rows = games
    .map((m) => {
      const one = entries.get(m.league_entry_1);
      const two = entries.get(m.league_entry_2);
      return `<a class="h2h-row" href="#/kamp/${m.event}/${one.id}-${two.id}"><span class="muted">R${m.event}</span><span>${teamLinkInCard(one)}</span><strong>${m.league_entry_1_points} – ${m.league_entry_2_points}</strong><span>${teamLinkInCard(two)}</span></a>`;
    })
    .join("");
  return `<section class="card"><h3 class="card-title">Indbyrdes opgør</h3>${rows}</section>`;
}

// ---------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------

export async function tableView() {
  const [details, idx] = await Promise.all([api.details(), playerIndex()]);
  const rows = calc.standingsWithMovement(details, idx.points);
  const last = calc.lastFinishedEvent(details);

  const body = rows
    .map((r) => {
      const move = r.movement > 0 ? `<span class="move up">▲</span>` : r.movement < 0 ? `<span class="move down">▼</span>` : `<span class="move"></span>`;
      return `
      <tr>
        <td class="rank rank-${r.rank}">${r.rank}${move}</td>
        <td><div class="team-cell">${crest(r.entry, "sm")}<div class="names"><strong>${teamLink(r.entry)}</strong><small>${esc(managerName(r.entry))}</small></div></div></td>
        <td class="num hide-sm">${r.played}</td>
        <td class="num hide-sm">${r.won}-${r.drawn}-${r.lost}</td>
        <td class="num">${r.pf}</td>
        <td class="num hide-sm">${r.pa}</td>
        <td class="form hide-xs">${formPills(r.form)}</td>
        <td class="num total">${r.pts}</td>
      </tr>`;
    })
    .join("");

  return `
    <section class="card table-card">
      <h2 class="card-title">Tabel <span class="muted">efter runde ${last}</span></h2>
      <table class="league-table">
        <thead><tr><th>#</th><th>Hold</th><th class="num hide-sm">K</th><th class="num hide-sm">V-U-T</th><th class="num" title="Scorede point">+</th><th class="num hide-sm" title="Point imod">−</th><th class="hide-xs">Form</th><th class="num">P</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>
    <p class="note">Sejr giver ${idx.points.win} point og uafgjort ${idx.points.draw}. Ved pointlighed afgør scorede point.</p>`;
}

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------

export async function statsView() {
  const [details, idx] = await Promise.all([api.details(), playerIndex()]);
  const entries = calc.entryMap(details);
  const real = new Map(calc.computeStandings(details, Infinity, idx.points).map((r) => [r.entry.id, r.rank]));
  const allPlay = calc.allPlayTable(details, idx.points);
  const rec = calc.seasonRecords(details);
  if (!rec) return `<div class="card">Statistikken dukker op efter første runde.</div>`;

  const luckRows = allPlay
    .map((r) => {
      const diff = r.rank - real.get(r.entry.id); // positiv = ligger bedre i virkeligheden end fortjent
      const label =
        diff > 0
          ? `<span class="luck lucky">+${diff}<span class="hide-sm"> heldig</span></span>`
          : diff < 0
            ? `<span class="luck unlucky">${diff}<span class="hide-sm"> uheldig</span></span>`
            : `<span class="luck">✓<span class="hide-sm"> fortjent</span></span>`;
      return `
        <tr>
          <td class="rank">${r.rank}</td>
          <td><div class="team-cell">${crest(r.entry, "sm")}<div class="names"><strong>${teamLink(r.entry)}</strong><small>Nr. ${real.get(r.entry.id)} i tabellen</small></div></div></td>
          <td class="num hide-xs">${r.won}-${r.drawn}-${r.lost}</td>
          <td class="num">${Math.round(r.winPct * 100)}%</td>
          <td class="num hide-xs">${r.tops}</td>
          <td>${label}</td>
        </tr>`;
    })
    .join("");

  const name = (id) => teamLinkInCard(entries.get(id));
  const matchLine = (m) =>
    `${name(m.league_entry_1)} ${m.league_entry_1_points}–${m.league_entry_2_points} ${name(m.league_entry_2)}`;
  const record = (title, value, sub, href) =>
    `<a class="card record" ${href ? `href="${href}"` : ""}><small>${title}</small><strong>${value}</strong><span>${sub}</span></a>`;

  const scores = calc.scoresByEvent(details);
  const events = [...scores.keys()].sort((x, y) => x - y);
  const all = [...scores.values()].flatMap((s) => [...s.values()]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const heatRows = details.league_entries
    .map((e) => {
      const cells = events
        .map((ev) => {
          const p = scores.get(ev).get(e.id);
          const t = max === min ? 0.5 : (p - min) / (max - min);
          const isTop = p === Math.max(...scores.get(ev).values());
          return `<td class="heat ${isTop ? "top" : ""}" style="--t:${t.toFixed(2)}" title="Runde ${ev}: ${p} point">${p}</td>`;
        })
        .join("");
      return `<tr><th><div class="team-cell">${crest(e, "sm")}<span class="hide-xs">${teamLink(e)}</span></div></th>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="records">
      ${record("Højeste score", rec.highest.points, `${name(rec.highest.id)} · R${rec.highest.event}`)}
      ${record("Laveste score", rec.lowest.points, `${name(rec.lowest.id)} · R${rec.lowest.event}`)}
      ${record("Største sejr", Math.abs(rec.biggestWin.league_entry_1_points - rec.biggestWin.league_entry_2_points), `${matchLine(rec.biggestWin)} · R${rec.biggestWin.event}`, `#/kamp/${rec.biggestWin.event}/${rec.biggestWin.league_entry_1}-${rec.biggestWin.league_entry_2}`)}
      ${record("Mest uheldige nederlag", rec.unluckiest.points, `${name(rec.unluckiest.id)} tabte alligevel · R${rec.unluckiest.event}`, `#/kamp/${rec.unluckiest.event}/${rec.unluckiest.match.league_entry_1}-${rec.unluckiest.match.league_entry_2}`)}
    </div>

    <section class="card table-card">
      <h2 class="card-title">Heldtabel</h2>
      <p class="muted card-intro">Hvad hvis alle mødte alle hver runde? Så afgør pointene alene. Plus betyder, at holdet ligger højere i den rigtige tabel, end pointene berettiger.</p>
      <table class="league-table">
        <thead><tr><th>#</th><th>Hold</th><th class="num hide-xs">V-U-T</th><th class="num">Sejr%</th><th class="num hide-xs" title="Antal gange med rundens højeste score">👑</th><th>Held</th></tr></thead>
        <tbody>${luckRows}</tbody>
      </table>
    </section>

    <section class="card table-card">
      <h2 class="card-title">Point pr. runde</h2>
      <p class="muted card-intro">Jo grønnere, jo bedre runde. Rammen markerer rundens højeste score.</p>
      <div class="scroll-x">
        <table class="heat-table">
          <thead><tr><th></th>${events.map((ev) => `<th>R${ev}</th>`).join("")}</tr></thead>
          <tbody>${heatRows}</tbody>
        </table>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Aktivitet: waivers, frie spillere og byttehandler
// ---------------------------------------------------------------------------

export async function activityView() {
  const [details, idx, tx, tr] = await Promise.all([api.details(), playerIndex(), api.transactions(), api.trades()]);
  const byEntryId = new Map(details.league_entries.map((e) => [e.entry_id, e]));
  const pName = (id) => esc(idx.players.get(id)?.web_name ?? "Ukendt");
  const pClub = (id) => idx.clubs.get(idx.players.get(id)?.team);

  const items = [];
  for (const t of tx.transactions ?? []) {
    if (t.result !== "a") continue; // kun gennemførte
    items.push({
      time: t.added,
      event: t.event,
      html: `
        <div class="act-head">${crest(byEntryId.get(t.entry) ?? { id: 0, short_name: "?" }, "sm")}<strong>${teamLink(byEntryId.get(t.entry))}</strong>
          <span class="tag">${t.kind === "w" ? "Waiver" : "Fri spiller"}</span><span class="muted act-time">${fmtShortDate(t.added)}</span></div>
        <div class="swap"><span class="in">↑ ${clubBadge(pClub(t.element_in))} ${pName(t.element_in)}</span><span class="out">↓ ${clubBadge(pClub(t.element_out))} ${pName(t.element_out)}</span></div>`,
    });
  }
  for (const t of tr.trades ?? []) {
    if (t.state !== "p") continue; // kun gennemførte byttehandler
    const from = byEntryId.get(t.offered_entry);
    const to = byEntryId.get(t.received_entry);
    const lines = (t.tradeitem_set ?? [])
      .map((i) => `<div class="swap"><span class="out">${esc(from?.short_name)} giver ${clubBadge(pClub(i.element_out))} ${pName(i.element_out)}</span><span class="in">${esc(to?.short_name)} giver ${clubBadge(pClub(i.element_in))} ${pName(i.element_in)}</span></div>`)
      .join("");
    items.push({
      time: t.response_time ?? t.offer_time,
      event: t.event,
      html: `
        <div class="act-head"><strong>${teamLink(from)} ⇄ ${teamLink(to)}</strong>
          <span class="tag tag-trade">Byttehandel</span><span class="muted act-time">${fmtShortDate(t.response_time ?? t.offer_time)}</span></div>${lines}`,
    });
  }
  items.sort((a, b) => b.event - a.event || new Date(b.time) - new Date(a.time));
  if (!items.length) return `<div class="card">Ingen transfers endnu.</div>`;

  let lastEvent = null;
  const out = items
    .map((i) => {
      const header = i.event !== lastEvent ? `<h3 class="group-title">Runde ${i.event}</h3>` : "";
      lastEvent = i.event;
      return `${header}<div class="card activity">${i.html}</div>`;
    })
    .join("");
  return `<div class="stack">${out}</div>`;
}
