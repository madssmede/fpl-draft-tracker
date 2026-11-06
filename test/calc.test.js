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
