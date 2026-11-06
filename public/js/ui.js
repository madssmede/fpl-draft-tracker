// Små hjælpefunktioner til at bygge HTML.

/** Gør tekst sikker at sætte ind i HTML (holdnavne kommer fra brugerne). */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const TZ = "Europe/Copenhagen";
export const fmtDate = (iso) =>
  new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
export const fmtShortDate = (iso) =>
  new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));

/** Fast farve pr. hold, så hvert hold har sit eget "klubmærke". */
const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
export function teamColor(entry) {
  return COLORS[Math.abs(entry.id) % COLORS.length];
}

export function crest(entry, size = "md") {
  return `<span class="crest crest-${size}" style="--crest:${teamColor(entry)}">${esc(entry.short_name)}</span>`;
}

export const managerName = (entry) => `${entry.player_first_name} ${entry.player_last_name}`.trim();

export function playerPhoto(player) {
  if (!player) return `<span class="photo" data-initials="?"></span>`;
  // Initialerne ligger bag billedet og ses, hvis billedet ikke kan hentes.
  return `<span class="photo" data-initials="${esc(player.web_name.slice(0, 2))}"><img loading="lazy" alt="" src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.code}.png" onerror="this.remove()"></span>`;
}

export function clubBadge(club) {
  if (!club) return "";
  return `<img class="badge" loading="lazy" alt="" title="${esc(club.name)}" src="https://resources.premierleague.com/premierleague/badges/70/t${club.code}.png" onerror="this.remove()">`;
}

export function formPills(form, n = 5) {
  return form
    .slice(-n)
    .map((f) => `<span class="pill pill-${f.res}" title="Runde ${f.event}: ${f.own}–${f.other}">${f.res}</span>`)
    .join("");
}

export const loading = () => `<div class="loading"><span class="spinner"></span>Henter data…</div>`;
export const errorBox = (msg) => `<div class="card error">😕 ${esc(msg)}<br><button class="btn" onclick="location.reload()">Prøv igen</button></div>`;
