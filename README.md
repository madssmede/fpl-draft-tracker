# FPL Draft Tracker

En FotMob-agtig side til vores FPL Draft-liga (SPORT 24 INDKØB).

- **Kampe:** rundens H2H-kampe med livepoint, der opdateres hvert minut
- **Kampside:** begge holds opstilling på en bane, point pr. spiller og indbyrdes opgør
- **Runder:** alle afsluttede runder med resultater og rundens højeste score
- **Tabel:** stilling, form og pile for op- og nedrykning
- **Statistik:** heldtabel (alle mod alle), rekorder og point pr. runde
- **Transfers:** waivers, frie spillere og byttehandler

Siden er skrevet i almindelig HTML, CSS og JavaScript. Serveren er én fil uden eksterne pakker.

## Sådan hænger det sammen

```
Browser  →  server.js (Render)  →  draft.premierleague.com/api
            ↑ gemmer svar i 1-10 minutter
```

FPL tillader ikke, at en browser henter deres data direkte fra en anden adresse. Derfor går alle kald gennem `server.js`, som henter dataene og sender dem videre.

| Fil | Hvad den gør |
|---|---|
| `server.js` | Viser siden og henter data fra FPL med cache |
| `public/index.html` | Sidens skelet: top, faner og pop-up |
| `public/styles.css` | Alt design: farver, kort, bane osv. |
| `public/js/main.js` | Skifter mellem sider og opdaterer automatisk |
| `public/js/views.js` | Bygger hver side (kampe, tabel, statistik, transfers) |
| `public/js/calc.js` | Alle beregninger: tabel, heldtabel, livepoint, udskiftninger |
| `public/js/api.js` | Henter data fra vores egen server |
| `public/js/ui.js` | Små byggeklodser: klubmærker, spillerbilleder, datoer |
| `test/` | Tests af beregningerne med ligaens rigtige data |

## Kør siden på din egen computer

Kræver [Node.js](https://nodejs.org) version 18 eller nyere.

```bash
npm start
```

Åbn derefter http://localhost:3000. Tests køres med `npm test`.

## Læg den på nettet

### 1. GitHub

1. Opret et nyt repository på github.com, fx `fpl-draft-tracker`.
2. Vælg **Add file → Upload files**, og træk alle filer og mapper fra denne mappe ind.
3. Tryk **Commit changes**.

### 2. Render

1. Log ind på render.com, og vælg **New → Web Service**.
2. Forbind din GitHub-konto, og vælg repoet.
3. Udfyld:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Under **Environment** tilføjer du `LEAGUE_ID` = `67616`.
5. Tryk **Create Web Service**. Efter et par minutter får I en adresse som `https://fpl-draft-tracker.onrender.com`.

Hver gang du ændrer noget på GitHub, bygger Render siden igen af sig selv.

**Gratis-planen går i dvale** efter 15 minutter uden besøg, og så tager første besøg cirka et minut. Vil I undgå det, kan en gratis tjeneste som UptimeRobot kalde `https://<jeres-adresse>/healthz` hvert 10. minut.

## Kendte begrænsninger

- **Livepoint er foreløbige:** Automatiske udskiftninger beregnes af siden selv, indtil FPL har afgjort runden. Derefter bruges FPL's egne tal.
- **Uofficielt API:** FPL kan ændre det uden varsel. Alle kald ligger i `server.js` og `public/js/api.js`, så der er kun to steder at rette.
