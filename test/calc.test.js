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
