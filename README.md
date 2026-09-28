# Can I park here?

https://canipark.smeral.net

<img src="web/public/icons/icon.png" alt="caniparkhere logo" width="96">

Tells you whether you can park at your current location in Prague. There is no server and
no backend: your location stays on your phone.

For the spot you're standing on, the app shows:

- whether it's in a paid parking zone, and if so which kind (visitors, mixed or residents)
- the price and paid hours right now, with a button to pay for that zone
- whether the street is closed for street cleaning today or soon
- the street name and zone code, so you can check them against the signs

GPS is only accurate to a few metres, so the app looks at every zone and street-cleaning
section within that distance of you. Each one gets a card with its street and zone. When
they all have the same rules (price, hours, time limit, cleaning), the app answers plainly.
When they differ, it says it can't tell which one you're in, and each card shows what
applies there.

"Live" in the top left corner shows that the answer follows your location, with bars for how
accurate it is. Tap it to pause: the answer stays with the spot you paused at, for example
the car's, while you walk away.

In a shared car (pick "Shared car" in the top right corner), it tells you whether you can
end the rental there instead. Cars from carsharing services registered with the city can
be left in any blue or purple zone for free, with no time limit, but not in orange zones.

On a motorbike (pick "Motorbike"), every zone is free, with no time limit: motorbikes park
without a permit in blue, purple and orange zones alike.

The app's icon in the top right corner opens the About page, with a link to the source and,
where the browser can install the app from a button, Install (the Web Install API, or
Chromium's own install prompt).

## Data sources

From Prague's open data catalog, [LKOD](https://lkod.cz/):

- [Zóny placeného stání vymezené tarifem](https://lkod.cz/catalog/praha/datasets/https%3A%2F%2Fapi.lkod.cz%2Flod%2F03bdf7d6-a255-4e22-83f9-4b17b6822602%2Fcatalog%2F1f8589e3-7cd1-4267-b3ba-292e375e708d)
  – paid parking zones: their shapes and codes, and a text copy of their tariffs
- [Letní údržba komunikací TSK](https://lkod.cz/catalog/praha/datasets/https%3A%2F%2Fapi.lkod.cz%2Flod%2F03bdf7d6-a255-4e22-83f9-4b17b6822602%2Fcatalog%2Fc6363a9e-9e46-4bec-ae26-b6149c1e8dd8)
  – summer street cleaning (blokové čištění), with the cleaning dates for each street

From ČÚZK, the Czech land survey office:

- [RÚIAN – Ulice](https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/4) – street
  centre lines and names from RÚIAN, the national address register

From [Golemio](https://api.golemio.cz/docs/public-openapi/), Prague's data platform:

- Parking tariffs from TSK (`/v3/parking` and `/v3/parking-tariffs`, source `tsk_v2`) –
  each zone's prices, paid hours, caps, and how long a visitor may stay

## How it works

1. Once a day, a script downloads the data, keeps only what the app needs, makes it
   smaller, and saves it as JSON files in this repo.
2. The first time you open the app, your phone downloads these files and stores them.
3. After that, the app looks up your location on the phone itself. It only goes online to
   check whether newer data is available, and it works offline too.

---

## Project layout

- `pipeline/` – Node + TypeScript scripts that download and clean the data, then write it
  to `web/public/data/`.
- `web/` – the app: Preact + TypeScript + Vite, installable as a PWA.

## Data pipeline

```
cd pipeline
npm install
npm run build   # downloads the sources and writes web/public/data/*.json
```

Golemio needs an API key. The build reads it from `GOLEMIO_API_KEY`, which it takes from
the environment or from a `.env` file at the repo root (git ignores it):

```
GOLEMIO_API_KEY=...
```

What `npm run build` does:

1. Downloads each source: the LKOD and RÚIAN layers as GeoJSON, and TSK's zones and tariffs
   from Golemio.
2. Rounds and simplifies the shapes, and keeps only the fields the app uses.
3. Stores repeated values (tariffs, cleaning dates, street names) once, in a shared table,
   and points to them from each shape.
4. Writes one file per dataset, plus `manifest.json` with:
   - `version` – a hash of the dataset sizes, so it only changes when the data does
   - `bounds` – a rough box around all the data, which the app uses to tell whether you're
     anywhere near Prague

The output files are committed to the repo. Nothing is downloaded when the app is built or
deployed.

The datasets:

- **`zps`** – paid parking zones. One shape per zone from LKOD, with its category (`RES`,
  `MIX` or `VIS`) and a tariff. The tariff comes from TSK's tariffs in Golemio, matched by
  zone code:
  - Each paid window becomes a rule with its days, hours and hourly price. Golemio charges
    by the minute, so the price is the per-minute charge × 60.
  - A Golemio "maximum" becomes the rule's daily cap only when it actually limits what a
    stay would cost. Most maximums are just the price × the longest allowed stay.
  - On a public holiday, a tariff works as on any other day, except that one stay may cost
    no more than its holiday cap (`holidayCapCzk`, 20 or 40 Kč). That's Golemio's
    holiday-only maximum. Most purple and orange zones have one; blue zones and the rest
    have none, and their holidays are ordinary days. The app works out the holidays itself
    (`web/src/holidays.ts`): the fixed dates, plus Good Friday and Easter Monday from Easter.
  - Windows never run past midnight. "Po-Pá 08:00-05:59" means 00:00–05:59 and 08:00–23:59
    on each of Monday to Friday, so a Friday night into Saturday is free.
  - For a zone Golemio doesn't have, the tariff is parsed from the LKOD `tariftext` field.
    That field is cut off at a fixed length, so a few long tariffs lose their daily cap;
    the build logs a warning for each one and keeps the rest of the tariff.
  - The build logs how many zones got their tariff from each place.
  - Resident zones also get `maxStayMinutes`, the longest a visitor may stay, from Golemio,
    matched by zone code. It's `null` for a section Golemio doesn't have, and the build logs
    how many those are.
- **`letni`** – summer street cleaning. One shape per street section, with its list of
  cleaning days. The source only covers the current year, so this needs a refresh at least
  once a year.
- **`streets`** – street centre lines with their names, used to show which street you're
  on.

### Daily refresh

`.forgejo/workflows/refresh-data.yaml` runs the pipeline every night on the Forgejo runner,
with the Golemio key from the repo's `GOLEMIO_API_KEY` secret:

1. Runs `npm run build`.
2. Compares the new `manifest.json` version with the old one.
3. If it changed, commits the new data and pushes it to both Forgejo and GitHub. If not, it
   does nothing.

## Web app

```
cd web
npm install
npm run dev       # local dev server
npm run build     # production build to web/dist
npm run preview   # serve the production build locally
npm run test      # unit tests (vitest)
```

How the app uses the data:

- On each start it fetches `manifest.json`. If the version matches what it already has, it
  uses its stored copy (in IndexedDB). If not, it downloads the datasets again.
- If it can't reach the network, it uses the stored copy.
- The lookups run in a web worker, using an R-tree index built from the data.

### Jig

A test page for the app that runs it without real GPS. It shows the app in a phone-sized
frame, next to a map with a pin:

```
cd web
npm run jig       # opens http://localhost:5173/jig/
```

- Click the map or drag the pin to move the location. The slider sets the accuracy radius,
  as if it came from a GPS fix.
- Time is either Now, which follows the real clock, or Custom, a date and time you pick,
  to see prices and paid hours at other times. Times are in your computer's time zone,
  which is also the one the app reads tariff hours in.
- The Location menu switches to the other states the GPS can be in: still searching, gave
  up, permission denied, or no geolocation at all.
- The map draws the app's own data under the pin: paid zones in their category colours
  with their codes, and, when switched on, street-cleaning sections. These are coloured by
  when they're next cleaned, counted from the jig's day: red on that day (the app says
  not to park), amber within the app's warning window (it gives a heads-up), grey later.
- "Street cleaning everywhere that day" makes the app treat every street-cleaning section
  as cleaned on the chosen day, to see its closure screen anywhere with a section.
- The Screen menu sets the frame to a few common phone sizes. The frame shrinks to fit a
  shorter window, but the app still lays out at the phone's real size.
- The pin, accuracy and custom time are kept in the URL (`#lat,lon,accuracy[,time]`), so a
  spot can be bookmarked or shared.

How it works:

- `App` takes the location as a prop, and optionally the time and the street-cleaning
  simulation. The real app passes it the browser's GPS and leaves the rest to their
  defaults (`src/main.tsx`). The jig runs the same `App` in an iframe (`jig/frame.tsx`) and
  sends it the jig's settings with `postMessage`.
- The iframe gives the app its own viewport, so it lays out the same as on a phone.
- The jig lives in `web/jig/` and is only served by the dev server. It is not part of
  `npm run build`, and its map library (MapLibre) is a dev dependency.
- The map tiles come from [OpenFreeMap](https://openfreemap.org/), which is free, needs no
  API key and has no usage limits. The map data is © OpenStreetMap contributors.

## Tests and formatting

- `pipeline/` and `web/` each have `npm run test`.
- Tests sit next to the code they cover, as `<module>.test.ts`. They are not part of the
  app build or the pipeline output.
- Formatting is Prettier, set up once at the repo root for both folders:

```
npm install            # at the repo root
npm run format         # fix formatting
npm run format:check   # check only
```

## Hosting

- `.github/workflows/deploy.yml` builds `web/` and deploys `web/dist` to GitHub Pages on
  every push to `main`.
- The domain `canipark.smeral.net` is set in `web/public/CNAME`, with a DNS CNAME record
  pointing to `rsmeral.github.io`.

## Icons

- The app icon (`web/public/icons/icon.png`) is the logo of the original 2017 project,
  taken from the `old` branch. `icon-maskable.png` is the same logo filling the whole
  square, for launchers that crop icons into their own shape.
- The status emoji (`web/public/emoji/*.svg`) are [Twemoji](https://github.com/jdecked/twemoji)
  (CC-BY 4.0). They are shown as images because the phone's own emoji look blurry at this
  size.
