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
in amber. Hover for the suburb name and location count; click for the suburb name
and each connect's name and known demographics. Location counts appear only in
tooltips, not popups. Postcodes, schedules, street addresses, and individual
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
