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

## Data sources

All data comes from Prague's open data catalog, [LKOD](https://lkod.cz/):

- [Zóny placeného stání vymezené tarifem](https://lkod.cz/catalog/praha/datasets/https%3A%2F%2Fapi.lkod.cz%2Flod%2F03bdf7d6-a255-4e22-83f9-4b17b6822602%2Fcatalog%2F1f8589e3-7cd1-4267-b3ba-292e375e708d)
  – paid parking zones, with their prices and hours
- [Letní údržba komunikací TSK](https://lkod.cz/catalog/praha/datasets/https%3A%2F%2Fapi.lkod.cz%2Flod%2F03bdf7d6-a255-4e22-83f9-4b17b6822602%2Fcatalog%2Fc6363a9e-9e46-4bec-ae26-b6149c1e8dd8)
  – summer street cleaning (blokové čištění), with the cleaning dates for each street

Street names come from [RÚIAN](https://cuzk.gov.cz/ruian/RUIAN.aspx), the Czech national
address register.

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

What `npm run build` does:

1. Downloads each source as GeoJSON.
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

- **`zps`** – paid parking zones. One shape per zone, with its category (`RES`, `MIX` or
  `VIS`) and a tariff. The price, hours and daily cap are read from the source's
  `tariftext` field.
  - The source cuts `tariftext` off at a fixed length, so a few long tariffs lose their
    daily cap. The build logs a warning for each one and keeps the rest of the tariff.
- **`letni`** – summer street cleaning. One shape per street section, with its list of
  cleaning days. The source only covers the current year, so this needs a refresh at least
  once a year.
- **`streets`** – street centre lines with their names, used to show which street you're
  on.

### Daily refresh

`.forgejo/workflows/refresh-data.yaml` runs the pipeline every night on the Forgejo runner:

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
