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
static files, there's no build-time fetch in CI. Re-run this manually whenever the source
data should be refreshed; eventually this should run on a schedule against Prague's open
data and push the updated files.

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
every push to `main`. One-time setup in the repo settings: **Settings → Pages → Source →
GitHub Actions**.

For a custom domain, either set it under **Settings → Pages → Custom domain** (GitHub
will commit a `CNAME` for you), or add `web/public/CNAME` yourself containing the domain
— it gets copied into `web/dist` on build.

## Known gaps / next steps

- Winter maintenance (`zimni`) data is cleaned but not queried yet.
- The app icon (`web/public/icons/icon.png`) is the original 2017 project's logo, recovered
  from the `old` branch. It's a single 400×400 PNG used for the favicon, apple-touch-icon,
  and PWA manifest icon — fine for now, but only one size, so a maskable/multi-size set is
  worth revisiting if home-screen icons look off on some devices.
- The data pipeline runs manually; the plan is to schedule it on external infra and have
  it push refreshed `web/public/data/*.json` on a recurring basis.
