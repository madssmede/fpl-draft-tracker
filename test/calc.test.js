// Tester beregningerne mod ligaens rigtige data (runde 1-9, sæson 26/27).
// Kør med:  npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as calc from "../public/js/calc.js";

const details = JSON.parse(readFileSync(new URL("./fixtures/details.json", import.meta.url)));

test("tabellen matcher FPL's egen tabel efter runde 9", () => {
  const rows = calc.computeStandings(details);
  const simple = rows.map((r) => [r.entry.entry_name, r.pts, r.won, r.drawn, r.lost, r.pf, r.pa]);
  assert.deepEqual(simple, [
    ["Up the Spurs", 18, 6, 0, 3, 497, 442],
    ["Kjøge United", 15, 5, 0, 4, 495, 432],
    ["Schillefars Krigere", 15, 5, 0, 4, 380, 386],
    ["Davies FC", 12, 4, 0, 5, 386, 439],
    ["Sørgelige rester", 12, 4, 0, 5, 373, 400],
    ["The Gunners", 9, 3, 0, 6, 408, 440],
  ]);
  assert.equal(rows[0].played, 9); // FPL's eget felt siger forkert 38
});

test("heldtabellen (alle mod alle)", () => {
  const rows = calc.allPlayTable(details);
  const spurs = rows.find((r) => r.entry.entry_name === "Up the Spurs");
  assert.equal(rows[0], spurs);
  assert.deepEqual([spurs.won, spurs.drawn, spurs.lost, spurs.tops], [34, 0, 11, 5]);
});

test("rekorder", () => {
  const rec = calc.seasonRecords(details);
  assert.equal(rec.highest.points, 71);
  assert.equal(rec.lowest.points, 14);
});

test("tidligere runder: nyeste først og kun afsluttede runder", () => {
  const rounds = calc.pastRounds(details);
  assert.deepEqual(rounds.map((r) => r.event), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.ok(rounds.every((r) => r.matches.length === 3));
  assert.equal(Math.max(...rounds.map((r) => r.topPoints)), 71); // sæsonens højeste score

  // En runde, hvor én kamp ikke er færdig, må ikke være med.
  const halfDone = { ...details, matches: details.matches.map((m, i) => (m.event === 9 && i % 2 ? { ...m, finished: false } : m)) };
  const finishedFlags = calc.matchesForEvent(halfDone, 9).map((m) => m.finished);
  assert.ok(finishedFlags.includes(false) && finishedFlags.includes(true));
  assert.equal(calc.pastRounds(halfDone)[0].event, 8);
});

test("tidligere runder: delt højeste score giver flere hold", () => {
  const entries = details.league_entries.slice(0, 4);
  const match = (a, b, pa, pb) => ({ event: 1, finished: true, league_entry_1: a.id, league_entry_2: b.id, league_entry_1_points: pa, league_entry_2_points: pb });
  const tied = { league_entries: entries, matches: [match(entries[0], entries[1], 50, 40), match(entries[2], entries[3], 30, 50)] };
  const [round] = calc.pastRounds(tied);
  assert.equal(round.topPoints, 50);
  assert.deepEqual(round.topIds, [entries[0].id, entries[3].id]);
});

test("holdside: resultater og nøgletal for Up the Spurs", () => {
  const spurs = details.league_entries.find((e) => e.entry_name === "Up the Spurs");
  const kjoge = details.league_entries.find((e) => e.entry_name === "Kjøge United");
  const profile = calc.teamProfile(details, spurs.id);

  assert.equal(profile.standing.rank, 1);
  assert.deepEqual(profile.history.map((h) => h.event), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(profile.history[0], { event: 9, opponentId: kjoge.id, own: 52, other: 50, res: "V" });
  assert.equal(profile.average, 497 / 9);
  assert.deepEqual([profile.best.own, profile.best.event], [71, 4]);
  const lowest = Math.min(...profile.history.map((h) => h.own));
  assert.equal(profile.worst.own, lowest);
});

test("holdside: ukendt hold og hold uden spillede kampe", () => {
  assert.equal(calc.teamProfile(details, 123), null);
  const noGames = { ...details, matches: [] };
  const profile = calc.teamProfile(noGames, details.league_entries[0].id);
  assert.deepEqual(profile.history, []);
  assert.deepEqual([profile.average, profile.best, profile.worst], [null, null, null]);
});

test("holdside: trup efter position med flest point øverst", () => {
  const mk = (id, element_type, total_points) => [id, { id, element_type, total_points }];
  const squadPlayers = new Map([mk(1, 1, 30), mk(2, 3, 10), mk(3, 3, 50), mk(4, 4, 20)]);
  const status = [
    { element: 1, owner: 111 },
    { element: 2, owner: 111 },
    { element: 3, owner: 111 },
    { element: 4, owner: 222 }, // andet hold
    { element: 99, owner: 111 }, // findes ikke i spillerlisten
  ];
  const groups = calc.squadByPosition(status, 111, squadPlayers);
  assert.deepEqual(groups.map((g) => [g.type, g.players.map((p) => p.id)]), [[1, [1]], [2, []], [3, [3, 2]], [4, []]]);
});

test("spillerliste: alle spillere, filtre og sortering", () => {
  const mk = (id, web_name, element_type, total_points, goals_scored, form) => [id, { id, web_name, element_type, total_points, goals_scored, form, assists: 0, minutes: 0 }];
  const ps = new Map([
    mk(1, "Bo", 3, 40, 5, "2.0"),
    mk(2, "Ali", 3, 40, 1, "6.5"),
    mk(3, "Cee", 4, 60, 2, "1.0"),
    mk(4, "Fri", 3, 99, 9, "9.9"), // fri spiller
    mk(6, "Ny", 2, 10, 0, "0.0"), // står ikke i element-status: tæller som fri
  ]);
  const status = [
    { element: 1, owner: 111 },
    { element: 2, owner: 222 },
    { element: 3, owner: 111 },
    { element: 4, owner: null },
    { element: 5, owner: 111 }, // findes ikke i spillerlisten
  ];
  const ids = (opts) => calc.playerList(ps, status, opts).map((r) => r.player.id);

  assert.deepEqual(ids(), [4, 3, 2, 1, 6]); // point, ved lighed navn (Ali før Bo)
  assert.deepEqual(ids({ sort: "mal" }), [4, 1, 3, 2, 6]);
  assert.deepEqual(ids({ sort: "form" }), [4, 2, 1, 3, 6]); // form kommer som tekst fra FPL
  assert.deepEqual(ids({ position: 3 }), [4, 2, 1]);
  assert.deepEqual(ids({ owner: 111 }), [3, 1]);
  assert.deepEqual(ids({ owner: "fri" }), [4, 6]);
  assert.deepEqual(ids({ owner: "fri", position: 2 }), [6]);
  assert.deepEqual(ids({ sort: "findes-ikke" }), [4, 3, 2, 1, 6]);
  const rows = calc.playerList(ps, status);
  assert.deepEqual(rows.map((r) => r.owner), [null, 111, 222, 111, null]);
});

test("bedste opstilling: vælger formationen med flest point", () => {
  let id = 0;
  const make = (element_type, points) => points.map((total_points) => ({ id: ++id, web_name: `S${id}`, element_type, total_points }));
  const players = [
    ...make(1, [50, 40]),
    ...make(2, [60, 55, 50, 45, 10, 5]),
    ...make(3, [70, 65, 60, 20, 15, 1]),
    ...make(4, [80, 75, 12, 2]),
  ];
  const best = calc.bestLineup(players);
  // 4-4-2 giver 50 + (60+55+50+45) + (70+65+60+20) + (80+75) = 630, mere end alle andre formationer
  assert.equal(best.formation, "4-4-2");
  assert.equal(best.total, 630);
  assert.deepEqual(best.rows.map((r) => r.length), [1, 4, 4, 2]);
  assert.deepEqual(best.rows[0].map((p) => p.total_points), [50]);
  assert.equal(best.rows.flat().length, 11);
});

test("bedste opstilling: følger reglerne og giver null, hvis det ikke kan lade sig gøre", () => {
  let id = 0;
  const make = (element_type, points) => points.map((total_points) => ({ id: ++id, web_name: `S${id}`, element_type, total_points }));
  // Mange gode angribere, men højst 3 må spille. Midtbanen skal have mindst 3.
  const players = [...make(1, [10]), ...make(2, [1, 1, 1, 1, 1]), ...make(3, [1, 1, 1, 1, 1]), ...make(4, [99, 99, 99, 99, 99])];
  const best = calc.bestLineup(players);
  assert.equal(best.formation, "3-4-3");
  assert.equal(best.rows[3].length, 3);
  assert.ok(best.rows[2].length >= 3);

  assert.equal(calc.bestLineup(make(2, [5, 5, 5])), null); // ingen målmand
  assert.equal(calc.bestLineup([]), null);
});

test("point pr. ting fra FPL's explain, også ved dobbeltrunde", () => {
  const live = {
    elements: {
      7: {
        stats: { total_points: 12 },
        explain: [
          [[{ stat: "minutes", value: 90, points: 2 }, { stat: "goals_scored", value: 1, points: 5 }], 101],
          [[{ stat: "minutes", value: 30, points: 1 }, { stat: "assists", value: 1, points: 3 }, { stat: "yellow_cards", value: 1, points: -1 }], 102],
        ],
      },
      8: { stats: { total_points: 0 }, explain: [] },
    },
  };
  assert.deepEqual(calc.pointsByStat(live, 7), { minutes: 3, goals_scored: 5, assists: 3, yellow_cards: -1 });
  assert.equal(Object.values(calc.pointsByStat(live, 7)).reduce((a, b) => a + b), 10);
  assert.deepEqual(calc.pointsByStat(live, 8), {});
  assert.deepEqual(calc.pointsByStat(live, 999), {}); // spiller uden data
  assert.deepEqual(calc.pointsByStat(null, 7), {});
});

test("kommende runder: kun runder efter den aktuelle, uden færdige kampe", () => {
  // Testdataene har kampe til og med runde 11, og runde 1-9 er spillet.
  const rounds = calc.upcomingRounds(details, 9);
  assert.deepEqual(rounds.map((r) => r.event), [10, 11]);
  assert.ok(rounds.every((r) => r.matches.length === 3 && r.matches.every((m) => !m.finished)));
  assert.deepEqual(calc.upcomingRounds(details, 10).map((r) => r.event), [11]);
  assert.deepEqual(calc.upcomingRounds(details, 11), []);
  assert.deepEqual(calc.upcomingRounds(details, 5).map((r) => r.event), [10, 11]); // runde 6-9 er spillet
});

test("Kampe-fanen: runden bliver stående til midnat dagen efter sidste kamp", () => {
  // Runde 10's sidste kamp: søndag 8. nov. kl. 17.30 dansk tid -> rykker ved midnat mellem mandag og tirsdag
  const base = { current: 10, finished: true, lastKickoff: "2026-11-08T16:30:00Z", lastEvent: 38 };
  assert.equal(calc.featuredEvent({ ...base, now: new Date("2026-11-08T20:00:00Z") }), 10); // søndag aften
  assert.equal(calc.featuredEvent({ ...base, now: new Date("2026-11-09T12:00:00Z") }), 10); // mandag
  assert.equal(calc.featuredEvent({ ...base, now: new Date("2026-11-09T22:59:00Z") }), 10); // mandag 23.59 dansk tid
  assert.equal(calc.featuredEvent({ ...base, now: new Date("2026-11-09T23:00:00Z") }), 11); // midnat dansk tid
  assert.equal(calc.featuredEvent({ ...base, now: new Date("2026-11-12T12:00:00Z") }), 11);

  // Ikke afgjort af FPL endnu: bliver stående, også flere dage efter
  assert.equal(calc.featuredEvent({ ...base, finished: false, now: new Date("2026-11-12T12:00:00Z") }), 10);
  // Sen kamp kl. 23.30 dansk tid: dagen efter er stadig mandag
  const late = { ...base, lastKickoff: "2026-11-08T22:30:00Z" };
  assert.equal(calc.featuredEvent({ ...late, now: new Date("2026-11-09T22:59:00Z") }), 10);
  assert.equal(calc.featuredEvent({ ...late, now: new Date("2026-11-09T23:00:00Z") }), 11);
  // Månedsskifte: sidste kamp 30. november -> rykker ved midnat efter 1. december
  const monthEnd = { ...base, lastKickoff: "2026-11-30T20:00:00Z" };
  assert.equal(calc.featuredEvent({ ...monthEnd, now: new Date("2026-12-01T22:59:00Z") }), 10);
  assert.equal(calc.featuredEvent({ ...monthEnd, now: new Date("2026-12-01T23:00:00Z") }), 11);
  // Sommertid: kamp 20. april kl. 21.00 dansk tid, midnat efter 21. april er 22.00 UTC
  const summer = { ...base, lastKickoff: "2027-04-20T19:00:00Z" };
  assert.equal(calc.featuredEvent({ ...summer, now: new Date("2027-04-21T21:59:00Z") }), 10);
  assert.equal(calc.featuredEvent({ ...summer, now: new Date("2027-04-21T22:00:00Z") }), 11);
  // Sidste runde i sæsonen bliver stående
  assert.equal(calc.featuredEvent({ ...base, current: 38, now: new Date("2027-06-01T12:00:00Z") }), 38);
  // Uden kamptidspunkt rykkes videre, når runden er afgjort
  assert.equal(calc.featuredEvent({ ...base, lastKickoff: null, now: new Date("2026-11-08T20:00:00Z") }), 11);
});

test("næste draft: den første, der ikke er holdt endnu", () => {
  const league = {
    drafts: [
      { event: 1, draft_dt: "2026-08-20T12:45:00Z", draft_started: true, draft_completed: "2026-08-20T13:04:26Z", order_method: "random" },
      { event: 21, draft_dt: "2027-01-14T13:45:00Z", draft_started: false, draft_completed: null, order_method: "rank" },
    ],
  };
  assert.deepEqual(calc.nextDraft(league), { event: 21, time: "2027-01-14T13:45:00Z", orderMethod: "rank" });
  assert.equal(calc.nextDraft({ drafts: [league.drafts[0]] }), null);
  assert.equal(calc.nextDraft({}), null);
  assert.equal(calc.nextDraft(undefined), null);
});

test("waivers: godkendt, afvist og hvorfor", () => {
  const w = (id, entry, event, element_in, element_out, result, index) => ({ id, kind: "w", entry, event, element_in, element_out, result, index });
  const tx = [
    w(1, 111, 9, 45, 12, "a", 2), // 111 får spiller 45
    w(2, 222, 9, 45, 30, "di", 4), // 222 ville også have 45
    w(3, 111, 9, 70, 12, "do", 5), // 12 er allerede skiftet ud af waiver 1
    w(4, 333, 9, 99, 31, "di", 6), // ingen andre fik 99
    w(5, 222, 10, 45, 30, "di", 1), // anden runde: waiver 1 tæller ikke her
    { id: 6, kind: "f", entry: 111, event: 9, element_in: 5, element_out: 6, result: "a" }, // fri spiller: ikke en waiver
  ];
  const o = calc.waiverOutcomes(tx);
  assert.deepEqual(o.get(1), { accepted: true, reason: null, byEntry: null });
  assert.deepEqual(o.get(2), { accepted: false, reason: "taken", byEntry: 111 });
  assert.deepEqual(o.get(3), { accepted: false, reason: "out", byEntry: null });
  assert.deepEqual(o.get(4), { accepted: false, reason: "unavailable", byEntry: null });
  assert.deepEqual(o.get(5), { accepted: false, reason: "unavailable", byEntry: null });
  assert.equal(o.has(6), false);
});

// --- Up the Spurs, runde 9 (rigtige data) ---------------------------------
const P = (id, web_name, element_type, team) => [id, { id, web_name, element_type, team, code: 0 }];
const players = new Map([
  P(496, "Kinsky", 1, 19), P(229, "Tarkowski", 2, 9), P(502, "Robertson", 2, 19), P(330, "Bogle", 2, 13),
  P(67, "Rayan", 3, 3), P(480, "Gibbs-White", 3, 18), P(94, "Schade", 3, 4), P(591, "Enciso", 3, 12),
  P(236, "Dewsbury-Hall", 3, 9), P(411, "Haaland", 4, 15), P(249, "Barry", 4, 9), P(385, "Trafford", 1, 13),
  P(165, "João Pedro", 4, 6), P(10, "White", 2, 1), P(504, "Vuskovic", 2, 5),
]);
const stat = (total_points, minutes) => ({ stats: { total_points, minutes } });
const fixture = (id, team_h, team_a, done = true) => ({ id, team_h, team_a, started: done, finished: done, finished_provisional: done });
const live = (overrides = {}) => ({
  elements: {
    496: stat(6, 90), 229: stat(6, 90), 502: stat(8, 76), 330: stat(1, 90), 67: stat(3, 87), 480: stat(2, 90),
    94: stat(3, 83), 591: stat(8, 90), 236: stat(4, 90), 411: stat(2, 90), 249: stat(9, 79), 385: stat(2, 90),
    504: stat(6, 90), ...overrides.elements,
  },
  fixtures: overrides.fixtures ?? [
    fixture(90, 19, 8), fixture(89, 17, 9), fixture(82, 3, 13), fixture(83, 4, 18),
    fixture(86, 11, 12), fixture(88, 15, 5), fixture(84, 6, 16), fixture(87, 14, 1),
  ],
});
const picks = (order, subs = []) => ({ picks: order.map((element, i) => ({ element, position: i + 1 })), subs });

test("afgjort runde: FPL's opstilling giver 52 point ligesom i kampen", () => {
  const data = picks([496, 229, 502, 330, 67, 480, 94, 591, 236, 411, 249, 385, 165, 10, 504], [{ element_in: 236, element_out: 165, event: 9 }]);
  const l = calc.buildLineup(data, live(), players);
  assert.equal(l.total, 52);
  assert.equal(l.toPlay, 0);
  assert.ok(l.starters.find((s) => s.element === 236).subIn);
});

test("under runden: vi laver selv den samme automatiske udskiftning", () => {
  // Original opstilling: João Pedro starter, Dewsbury-Hall på bænken
  const data = picks([496, 229, 502, 330, 67, 480, 94, 591, 165, 411, 249, 385, 236, 10, 504]);
  const l = calc.buildLineup(data, live(), players);
  assert.equal(l.total, 52);
  assert.ok(l.provisional);
  assert.ok(l.bench.find((s) => s.element === 165).subOut);
});

test("ingen udskiftning før spillerens kamp er spillet", () => {
  const data = picks([496, 229, 502, 330, 67, 480, 94, 591, 165, 411, 249, 385, 236, 10, 504]);
  const fixtures = live().fixtures.map((f) => (f.id === 84 ? fixture(84, 6, 16, false) : f));
  const l = calc.buildLineup(data, live({ fixtures }), players);
  assert.equal(l.total, 48);
  assert.equal(l.toPlay, 1);
  assert.ok(!l.provisional);
});

test("målmand erstattes kun af målmand", () => {
  const data = picks([496, 229, 502, 330, 67, 480, 94, 591, 236, 411, 249, 385, 165, 10, 504]);
  const l = calc.buildLineup(data, live({ elements: { 496: stat(0, 0) } }), players);
  const gk = l.starters.find((s) => s.type === 1);
  assert.equal(gk.element, 385);
  assert.equal(l.total, 52 - 6 + 2);
});
