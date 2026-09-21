# caniparkhere

<img src="web/public/icons/icon.png" alt="caniparkhere logo" width="96">

Local-only PWA that tells you whether you can park at your current location in Prague —
no server, no backend. All zone data ships as static JSON baked from Prague's open data
and queried entirely in the browser.

## Layout

- `pipeline/` — Node/TS scripts that fetch the source datasets from Prague's open data
  (TSK winter/summer road maintenance, paid parking zones), clean and shrink them, and
  write the result to `web/public/data/`.
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
in all three datasets, computed in the pipeline (`bboxOfGeometry`/`mergeBbox`/`padBbox` in
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
- **`zimni`** (winter maintenance) — `MultiLineString` road centerlines (not polygons)
  with a numeric `idt_level` priority class. **Not wired into the app's query logic yet**:
  the 16 distinct level values (0-11, 40, 41, 52-54) don't map to a documented scale, and
  matching a point against lines needs point-to-line distance instead of point-in-polygon.
  Left out of v1 rather than guessing at the semantics.

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

- Winter maintenance (`zimni`) data is cleaned but not queried yet.
- The app icon is only one size — a maskable/multi-size set is worth revisiting if
  home-screen icons look off on some devices.
