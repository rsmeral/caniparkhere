# Can I park here?

https://canipark.smeral.net

<img src="web/public/icons/icon.png" alt="caniparkhere logo" width="96">

Tells you whether you can park at your current location in Prague —
no server, no backend, your location data stays in your browser. 

All zone data ships as static JSON baked from Prague's open data and queried entirely in the browser.

## Layout

- `pipeline/` — Node/TS scripts that fetch the source datasets from Prague's open data
  (TSK summer block cleaning, paid parking zones), clean and shrink them, and write the
  result to `web/public/data/`.
- `web/` — Preact + TypeScript + Vite PWA. Loads the data bundle once, caches it in
  IndexedDB, builds an in-memory R-tree spatial index, and answers "can I park here" from
  geolocation with zero network calls after first load.

## Data pipeline

```
cd pipeline
npm install
npm run build   # fetches sources, cleans/simplifies, writes web/public/data/*.json
```

Output is committed to the repo (`web/public/data/*.json`) — GitHub Pages serves it as
static files, there's no build-time fetch in CI. `.forgejo/workflows/refresh-data.yaml`
runs this daily on the self-hosted Forgejo runner, and only commits + pushes (to both
Forgejo and GitHub) when `manifest.json`'s `version` actually changes — a rebuild against
unchanged source data is a no-op, not a spurious commit.

`manifest.json` also carries `bounds`: a padded bounding box (envelope) over every feature
in both datasets, computed in the pipeline (`bboxOfGeometry`/`mergeBbox`/`padBbox` in
`lib/geo.ts`). The app uses it as a coarse "are you anywhere near Prague" check before
querying zones — deliberately a loose rectangle, not a precise administrative boundary,
since our zone data doesn't cover Prague's outer districts and a tighter check would
incorrectly flag real Prague locations that just have no nearby zones.

Current datasets and what's actually usable in them:

- **`zps`** (paid parking zones) — polygon per zone, with `category` (`RES`/`MIX`/`VIS`)
  and a `tariffId` into a shared `tariffs` table. Tariff text (days/hours/price/cap) is
  parsed from TSK's `tariftext` field directly on the source polygons — no separate price
  list needed. One known source quirk: the ArcGIS `tariftext` field truncates at a fixed
  length, so a handful of the longest multi-clause tariffs lose their trailing `(max. N
Kč)` cap. The parser recovers price/hours and just drops the cap in that case (logged
  as a warning during the build).
- **`letni`** (summer block-cleaning zones) — polygon per street segment with a `datesId`
  into a shared `dates` table of specific closure days (not ranges) for the year. This
  dataset is inherently annual — it needs refreshing at least once a year to stay correct.

### Why there's no winter-maintenance dataset

TSK also publishes [Zimní údržba komunikací](https://lkod.cz/catalog/praha/datasets/https%3A%2F%2Fapi.lkod.cz%2Flod%2F03bdf7d6-a255-4e22-83f9-4b17b6822602%2Fcatalog%2F336cda94-b4d1-47a4-abbf-50d9e1d956a4),
and an earlier revision of this pipeline ingested it. It was dropped deliberately:
**winter maintenance is not a parking restriction.** Unlike blokové čištění (the `letni`
dataset), which posts portable no-stopping signs ≥7 days ahead and tows offenders, snow
clearing just plows around parked cars — no sign, no ban, no tow. So the dataset can't
answer this app's question; at best it answers "how fast does this street get plowed",
which doesn't change any parking decision.

Recording what was worked out, in case it's ever wanted: the data is `MultiLineString`
road centerlines with an `idt_level` field (alias "Pořadí údržby"). No coded-value domain
is published anywhere — not in the ArcGIS Hub metadata, not on the
[FeatureServer](https://mp.iprpraha.cz/arcgis/rest/services/Hosted/DOP_CUR_DOP_TSK_ZIMNIUDRZBA_L/FeatureServer/0)
— but the levels can be matched empirically against the km-per-priority figures TSK
publishes in its annual winter maintenance plan:

| `idt_level`               | Measured | TSK published                    | Meaning                                                                                          |
| ------------------------- | -------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1 + 2                     | 1400 km  | I. pořadí — 1378 km              | Roads, cleared within 2 resp. 4 h (the two sub-tiers are likely why it splits across two levels) |
| 3                         | 530 km   | II. pořadí — 500 km              | Roads, within 12 h                                                                               |
| 4                         | 314 km   | III. pořadí — 313 km             | Roads, within 48 h                                                                               |
| 1–4 total                 | 2245 km  | motorized total — 2192 km        | —                                                                                                |
| 0, 5, 7–11, 40, 41, 52–54 | 1448 km  | chodníky/non-motorized — 1753 km | Pavements and other non-motorized, looser match                                                  |

That mapping is inference from correlation, not documentation — confirm with TSK
(`tsk@tsk-praha.cz`) before relying on it. Wiring it up would also need point-to-line
distance rather than point-in-polygon, which is meaningfully error-prone at street scale:
GPS is ±5–20 m in a city, centerlines sit ~5–10 m off the curb, and parallel streets can
be ~15 m apart.

## Web app

```
cd web
npm install
npm run dev       # local dev server
npm run build     # production build to web/dist
npm run preview   # serve the production build locally
npm run test      # unit tests (vitest)
```

`pipeline/` has its own `npm run test` too. Tests are colocated as `<module>.test.ts` next
to what they cover; nothing imports them from app/pipeline entry points, so they never end
up in `web/dist` or affect the pipeline's output (verified after every refactor above).

Formatting is Prettier, configured once at the repo root and covering both `pipeline/` and
`web/`:

```
npm install        # at the repo root
npm run format       # write
npm run format:check # CI-style check
```

## Hosting

`.github/workflows/deploy.yml` builds `web/` and deploys `web/dist` to GitHub Pages on
every push to `main`. Live at [canipark.smeral.net](https://canipark.smeral.net) — set via
`web/public/CNAME` (copied into `web/dist` on build) plus a `canipark.smeral.net` → CNAME →
`rsmeral.github.io` DNS record.

## Icons

The app icon (`web/public/icons/icon.png`) is the original 2017 project's logo, recovered
from the `old` branch — a single 400×400 PNG used for the favicon, apple-touch-icon, and
PWA manifest icon.

The status emoji (`web/public/emoji/*.svg`) are [Twemoji](https://github.com/jdecked/twemoji)
graphics (CC-BY 4.0), rendered as `<img>` rather than the literal Unicode character — native
emoji fonts render blurry at the size this app displays them, since most only ship bitmap
strikes up to ~160px.

## Known gaps / next steps

- The app icon is only one size — a maskable/multi-size set is worth revisiting if
  home-screen icons look off on some devices.
