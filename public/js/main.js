// Starter siden: læser adressen (#/kampe, #/kamp/10/... osv.), viser den rigtige side
// og opdaterer automatisk hvert minut, mens en runde er i gang.

import { api, forgetLiveData } from "./api.js";
import * as views from "./views.js";
import { loading, errorBox } from "./ui.js";

const app = document.getElementById("app");
const REFRESH_MS = 60_000;

const routes = {
  kampe: () => views.matchesView(), // gamle adresser som #/kampe/10 viser bare Kampe
  kamp: (gw, pair) => views.matchView(gw, pair),
  runder: () => views.roundsView(),
  tabel: () => views.tableView(),
  statistik: () => views.statsView(),
  spillere: (sort, position, team) => views.playersView(sort, position, team),
  aktivitet: (team) => views.activityView(team),
  hold: (id) => views.teamView(id), // har ingen fane, man kommer hertil via holdnavne
};

function parseHash() {
  const [name, ...args] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { name: routes[name] ? name : "kampe", args };
}

let renderId = 0;
async function render({ quiet = false } = {}) {
  const { name, args } = parseHash();
  const id = ++renderId;
  document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === (name === "kamp" ? "kampe" : name)));
  if (!quiet) app.innerHTML = loading();
  try {
    const html = await routes[name](...args);
    if (id !== renderId) return; // brugeren har klikket videre i mellemtiden
    const scroll = window.scrollY;
    app.innerHTML = html;
    if (quiet) window.scrollTo(0, scroll);
  } catch (err) {
    console.error(err);
    if (id === renderId && !quiet) app.innerHTML = errorBox("Kunne ikke hente data fra FPL lige nu.");
  }
}

// Ligaens navn i toppen
api
  .details()
  .then((d) => {
    document.getElementById("league-name").textContent = d.league.name;
    document.title = `${d.league.name} · FPL Draft`;
  })
  .catch(() => {});

// Klik på et holdnavn inde i et kampkort -> holdets side i stedet for kampen
app.addEventListener("click", (e) => {
  const team = e.target.closest("[data-team]");
  if (!team) return;
  e.preventDefault();
  location.hash = `#/hold/${team.dataset.team}`;
});

// Klik på en spiller -> pop-up med detaljer
const dialog = document.getElementById("player-dialog");
app.addEventListener("click", async (e) => {
  const btn = e.target.closest(".player[data-element]");
  if (!btn) return;
  const html = await views.playerDetail(btn.dataset.element);
  if (!html) return;
  dialog.querySelector(".sheet-body").innerHTML = html;
  dialog.showModal();
});

// Klik på en spiller i spillerlisten -> pop-up med hans tal for hele sæsonen
app.addEventListener("click", async (e) => {
  const row = e.target.closest("[data-season-player]");
  if (!row || e.target.closest("[data-team]")) return; // holdnavnet fører til holdet
  const html = await views.seasonPlayerDetail(row.dataset.seasonPlayer);
  if (!html) return;
  dialog.querySelector(".sheet-body").innerHTML = html;
  dialog.showModal();
});

// Rullemenuer, hvor hvert valg er en adresse (fx holdfilteret på Spillere)
app.addEventListener("change", (e) => {
  if (e.target.matches("select[data-nav]")) location.hash = e.target.value;
});

dialog.addEventListener("click", (e) => {
  if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
});

// Automatisk opdatering, mens en runde er live
setInterval(async () => {
  if (document.hidden || dialog.open) return;
  const { name } = parseHash();
  if (name !== "kampe" && name !== "kamp" && name !== "tabel") return;
  try {
    forgetLiveData();
    const game = await api.game();
    if (!game.current_event_finished) render({ quiet: true });
  } catch {}
}, REFRESH_MS);

window.addEventListener("hashchange", () => {
  if (dialog.open) dialog.close(); // fx efter klik på holdnavnet i pop-up'en
  render();
  window.scrollTo(0, 0);
});
render();
