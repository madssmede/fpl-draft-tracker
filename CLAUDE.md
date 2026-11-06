# FPL Draft Tracker

FotMob-agtig hjemmeside til en privat FPL Draft-liga med 6 hold (ligaen "SPORT 24 INDKØB", liga-ID 67616, sæson 2026/27, head-to-head).

Live: https://fpl-draft-tracker.onrender.com (Render, gratis-plan, Frankfurt). Render deployer automatisk ved push til `main`.

## Arbejdsform

- Svar og forklar på **dansk**. Al tekst på siden er også på dansk.
- Ejeren er ikke vant til webudvikling. Forklar ændringer kort og i almindeligt sprog, og hold koden let at læse.
- Bevidst valg: **almindelig HTML, CSS og JavaScript (ES-moduler) uden framework og uden build-trin.** Serveren bruger kun Node's indbyggede moduler, så der er ingen afhængigheder i `package.json`. Tilføj ikke frameworks eller npm-pakker uden at spørge først.
- Kør `npm test` efter ændringer i `public/js/calc.js`.

## Kør lokalt

```bash
npm start            # http://localhost:3000, henter rigtige data fra FPL
npm test             # tests af beregningerne mod ligaens rigtige data (runde 1-9)
MOCK_DIR=<mappe> npm start   # kør uden internet; filnavne = upstream-sti med / erstattet af _, fx event_10_live.json
```

Miljøvariabler: `PORT` (sættes af Render), `LEAGUE_ID` (standard 67616), `MOCK_DIR`.

## Struktur

| Fil | Ansvar |
|---|---|
| `server.js` | Serverer `public/` og proxyer whitelistede FPL-endpoints under `/api/fpl/...` med cache i hukommelsen (60–600 s). Viser gamle data, hvis FPL fejler. `/healthz` til oppetidstjek. |
| `public/index.html` | Skelet: top, faner, `<dialog>` til spillerdetaljer |
| `public/styles.css` | Alt design. Mørkt tema som standard, lyst via `prefers-color-scheme`. Farver som CSS-variabler i `:root`. |
| `public/js/main.js` | Hash-router (`#/kampe/10`, `#/kamp/10/<id>-<id>`, `#/runder`, `#/tabel`, `#/statistik`, `#/aktivitet`), auto-opdatering hvert 60. sekund mens runden er live |
| `public/js/views.js` | Én funktion pr. side, returnerer HTML-strenge |
| `public/js/calc.js` | Rene beregninger uden DOM eller fetch: tabel, heldtabel, rekorder, livepoint, automatiske udskiftninger |
| `public/js/api.js` | Kald til `/api/fpl/...` med memo, `playerIndex()` med opslagstabeller |
| `public/js/ui.js` | Byggeklodser: `esc()` (brug altid på tekst fra API'et), klubmærker, spillerbilleder, formpiller |
| `test/` | `node --test` med ligaens rigtige kampdata i `fixtures/details.json` |

## FPL Draft-API'et (uofficielt, verificeret november 2026)

Base: `https://draft.premierleague.com/api/`. Ingen login, **ingen CORS-header**, derfor proxyen. Kald fra sandboxed miljøer kan være blokeret; ejerens browser kan bruges til at undersøge svar.

- `league/{id}/details`: `league`, `league_entries`, `matches`, `standings`.
  - Kampe refererer til `league_entries[].id` (fx 360413), **ikke** `entry_id` (fx 356446). `entry_id` bruges til `entry/{entry_id}/event/{gw}`.
  - Kampenes point opdateres **kun når runden er afgjort**. Under runden står de 0–0, så livepoint beregnes selv fra opstilling og live-data.
  - `standings[].matches_played` er forkert (viser 38), så tabellen beregnes selv i `calc.computeStandings`.
- `bootstrap-static`: `elements` (spillere: `id`, `web_name`, `element_type` 1–4, `team`, `code`), `teams` (`id`, `short_name`, `code`), `element_types`, `events` = **objekt** `{current, next, data: [...]}`, og `settings.league.h2h_win/draw/lose` (3/1/0).
- `game`: `current_event`, `current_event_finished`.
- `event/{gw}/live`: `elements` er et **objekt med id som nøgle** → `{stats: {total_points, minutes, ...}, explain}`. `fixtures[]` har `team_h`, `team_a`, `started`, `finished`, `finished_provisional`.
- `entry/{entry_id}/event/{gw}`: `picks[]` (`element`, `position` 1–15, 12–15 er bænk) og `subs[]`. `subs` udfyldes først, når runden er afgjort. Captain er slået fra i draft.
- `draft/league/{id}/transactions`: `transactions[]` med `kind` (`w` waiver, `f` fri spiller), `result` (`a` gennemført), `element_in`, `element_out`, `entry` (= entry_id).
- `draft/league/{id}/trades`: `trades[]` med `state` (`p` gennemført), `offered_entry`, `received_entry`, `tradeitem_set[]`. Det hold, der tilbyder handlen, **modtager** `element_in` og **afgiver** `element_out`. Bekræftet mod holdenes opstillinger.
- `league/{id}/element-status`: ejerskab pr. spiller (`owner`). Bruges endnu ikke.
- `draft/{id}/choices`: draftvalg. Bruges endnu ikke. Ligaen har en ny draft planlagt til runde 21 (14. januar 2027), hvor rækkefølgen sættes efter placering.

Billeder (virker fra browseren):
- Spillerfoto: `https://resources.premierleague.com/premierleague/photos/players/110x140/p{code}.png`
- Klubmærke: `https://resources.premierleague.com/premierleague/badges/70/t{team.code}.png`

## Livepoint og automatiske udskiftninger

`calc.buildLineup`: Hvis `subs` er udfyldt (runden er afgjort), bruges FPL's opstilling. Ellers laver `provisionalAutoSubs` foreløbige udskiftninger. En startspiller med 0 minutter, hvis kamp er færdig, skiftes ud med den første bænkspiller med minutter, hvis formationen holder (1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD). Målmand kan kun erstattes af målmand. Testet mod runde 9, hvor resultatet rammer FPL's 52 point.

## Idéer, der er nævnt, men ikke bygget

- Side for draften i runde 21 (draftrækkefølge og valg)
- Holdside pr. manager med trup og historik
- Ejerskab: hvilket hold ejer hvilken spiller (`element-status`)
- Oppetidstjek mod `/healthz`, fx med UptimeRobot, så gratis-planen ikke går i dvale (ejeren har valgt det fra indtil videre)
