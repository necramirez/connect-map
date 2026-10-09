# Connect Map

A toy single-page map application built with Astro, React, TypeScript, and Leaflet.
Astro generates the static HTML shell; React runs the interactive map entirely in the
browser. The initial view is in Newington, NSW
(`-33.83309432488723, 151.0593508934678`, zoom `12`).

## Run locally

Use Node.js 24 and pnpm 11.5.2. Run all commands from the repository root:

```sh
pnpm install
pnpm dev
```

Open <http://localhost:4321/connect-map/>. Pan or zoom the map. The header location
label and starting-location panel are not displayed. Suburbs with no locations
have gray borders. Suburbs
with a name matching a location's `suburb` in `data/connects.json` are highlighted
in amber. On devices with a mouse/fine pointer and hover support, hover for the
suburb name and location count. Touch/mobile devices do not show hover tooltips.
Click or tap a suburb for its name and each connect's name and known demographics.
Location counts appear only in desktop tooltips, not popups. Postcodes, schedules, street addresses, and individual
location markers are not displayed on the map. Missing names show **Unnamed
connect**; unknown or missing demographic labels are omitted from popups.

Select **All connects** in the header for a searchable table of every connect's
name, suburb, state, postcode, known demographics, and schedule, including connects
that do not match a map feature. Exact addresses are excluded. Unknown fields
show a dash. Close the dialog with **Close** or Escape; focus returns to the
button. The table scrolls within the dialog on smaller screens.

Matching is case-insensitive and ignores all whitespace: `Melrose Park`,
`MELROSEPARK`, and `melrose  park` match the same suburb. Each input location row
counts once for its matching suburb name. Postcodes do not affect matching;
neighbouring suburbs that share a postcode are not highlighted unless their own
names match.

## Verify

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test
```

Playwright runs against the production build under `/connect-map/`, on desktop and
mobile Chromium. Tests cover the initial center, zooming, panning, removed location
labels, attribution, layout, suburb boundaries, name matching, counts, tooltips
and popups, the searchable directory, keyboard closing, address privacy, load
failures, and the JavaScript-disabled fallback. Tests stub map tiles to avoid relying on a third-party network service; manually check
real map tiles with `pnpm dev`.

To inspect the production build yourself:

```sh
pnpm preview
```

## GitHub Pages

The site is configured for <https://necramirez.github.io/connect-map/>.
`/connect-map/` is the published URL base, not a local filesystem path. Project
commands and workflow paths are relative to the repository root.

In repository **Settings → Pages**, select **GitHub Actions** as the source.
The Pages workflow checks, builds, and tests pull requests. Pushes to `main`
publish the generated `dist/` directory with GitHub's built-in token; no personal
access token is required. Keep the `github-pages` environment restricted to `main`
for deployment.

If the repository name or hosting domain changes, update `site` and `base` in
`astro.config.ts` and the preview URL in `playwright.config.ts`. For a custom domain
hosted at its root, remove the project-name base.

## Acquiring and simplifying suburb boundaries

### Export from Spatial NSW

1. Open Spatial NSW's [Suburb - NSW Administrative Boundaries Theme - GDA2020 Service](https://portal.spatial.nsw.gov.au/portal/home/item.html?id=56651906158a416e94fd244201782464).
2. Select **Export Data**.
3. When selecting layers/tables to export, select **Suburb**.
4. Draw a polygon around the **Sydney metropolitan area** to define the export region.
5. Export as **GeoJSON WGS84**, with datum **GDA2020** and coordinate system
   **Geographic**. Save the downloaded JSON as `data/Suburb_EPSG4326.json`.

The export is a large JSON file containing the GeoJSON FeatureCollection under a
`Suburb` property, rather than a standalone GeoJSON file. Extract that collection
before simplifying it.

### Extract and simplify

Run these commands from the repository root:

1. Extract the `Suburb` collection into `data/suburbs_raw.geojson`:

   ```sh
   node --input-type=module <<'NODE'
   import { readFile, writeFile } from 'node:fs/promises';
   const exported = JSON.parse(await readFile('data/Suburb_EPSG4326.json', 'utf8'));
   if (exported.Suburb?.type !== 'FeatureCollection') {
     throw new Error('Export must contain a Suburb FeatureCollection.');
   }
   await writeFile('data/suburbs_raw.geojson', JSON.stringify(exported.Suburb));
   NODE
   ```

2. Simplify the collection with [Mapshaper](https://mapshaper.org/):

   ```sh
   npx mapshaper data/suburbs_raw.geojson -simplify interval=100m -o data/suburbs.geojson
   ```

Mapshaper is a **topology-aware shape editor**. Simplifying the suburb collection
as a whole keeps shared boundaries aligned, unlike simplifying each polygon
independently. The command uses a **100 m simplification interval** to reduce the
geometry size.

The application reads the resulting `data/suburbs.geojson`. Keep the original
export and raw extracted GeoJSON local; both are ignored by Git. Review the output
on the map and run `pnpm build` and `pnpm test` before committing a refreshed
simplified dataset.

## Map tiles and local data

The interactive map requires JavaScript and an internet connection for
OpenStreetMap tiles. OpenStreetMap attribution stays visible on the map. Follow
the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
and choose an appropriate tile provider before significant traffic or offline use.

`data/suburbs.geojson` contains the simplified GeoJSON FeatureCollection of
522 suburb polygons in EPSG:4326 (longitude/latitude), about 700 KB. Astro reads
that collection directly at build time and generates `dist/suburbs.geojson`
(about 710 KB), published with the site.
Suburb-level `locationCount` values and a `connects` list containing only names
and demographics from `data/connects.json` are added to suburb properties.
Demographic labels are trimmed and deduplicated per connect. Other location
fields, including addresses and schedules, are not copied into the published
suburb asset. A separate `dist/connect-directory.json` file contains only the
approved directory fields: name, suburb, state, postcode, known demographics, and
schedule. It loads when the directory is first opened and includes all input
rows, not just mapped suburbs. The raw connections file is not sent to the browser.
The browser fetches it separately from the JavaScript bundle and renders it with
Leaflet's canvas renderer without changing the starting view. Loading and failure
messages appear on the map; the base map remains usable if the overlay fails.

Both input files are left untouched. The original JSON, raw GeoJSON backup, and
ZIP stay local and are not committed or published. Both inputs must be available
when GitHub Actions builds the
overlay. Do not commit private addresses to a public repository; provide private
input data through an appropriate private CI source instead. Review the suburb
data's redistribution terms before publishing the site.
