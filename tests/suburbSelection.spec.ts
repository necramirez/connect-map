import { expect, test, type Page } from '@playwright/test';
import type { Feature, FeatureCollection } from 'geojson';
import {
  calculateSuburbCentroid,
  type SuburbCentroid,
} from '../src/lib/suburbCentroid';
import { readMapView } from './helpers/mapView';
import { readRadiusCanvas } from './helpers/radiusCanvas';

const transparentTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DeUAAAAASUVORK5CYII=',
  'base64',
);

const features: Feature[] = [
  {
    type: 'Feature',
    properties: {
      suburbname: 'ALPHA',
      locationCount: 1,
      connects: [{ name: 'Alpha connect', demographics: ['Adults'] }],
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [151.04, -33.838],
          [151.06, -33.838],
          [151.04, -33.823],
          [151.04, -33.838],
        ],
      ],
    },
  },
  {
    type: 'Feature',
    properties: { suburbname: 'BETA', locationCount: 0, connects: [] },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [151.08, -33.82],
          [151.1, -33.82],
          [151.1, -33.81],
          [151.08, -33.81],
          [151.08, -33.82],
        ],
      ],
    },
  },
];

function centroidFor(name: string): SuburbCentroid {
  const feature = features.find(
    (feature) => feature.properties?.suburbname === name,
  );
  const centroid = feature ? calculateSuburbCentroid(feature) : null;
  if (!centroid) throw new Error('Missing test centroid');
  return centroid;
}

function project(centroid: SuburbCentroid, zoom: number) {
  const size = 256 * 2 ** zoom;
  const sine = Math.sin((centroid.latitude * Math.PI) / 180);
  return {
    horizontal: ((centroid.longitude + 180) / 360) * size,
    vertical: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

async function coordinatesOnMap(page: Page, centroid: SuburbCentroid) {
  const view = await readMapView(page);
  const bounds = await page.locator('.leaflet-container').boundingBox();
  if (!view || !bounds) throw new Error('Map view is not ready');
  const center = project(view, view.zoom);
  const target = project(centroid, view.zoom);
  return {
    x: bounds.x + bounds.width / 2 + target.horizontal - center.horizontal,
    y: bounds.y + bounds.height / 2 + target.vertical - center.vertical,
  };
}

async function selectOnMap(page: Page, name: string, hasTouch: boolean) {
  const point = await coordinatesOnMap(page, centroidFor(name));
  if (hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function expectRadius(page: Page, name: string, centered = true) {
  const centroid = centroidFor(name);
  await expect(page.getByLabel('Selected suburb')).toContainText(name);
  await expect(page.getByLabel('Selected suburb')).toContainText(
    '10 km radius around centroid',
  );
  if (centered) {
    await expect
      .poll(async () =>
        Math.abs(
          ((await readMapView(page))?.longitude ?? 0) - centroid.longitude,
        ),
      )
      .toBeLessThan(0.0005);
    await expect
      .poll(async () =>
        Math.abs(
          ((await readMapView(page))?.latitude ?? 0) - centroid.latitude,
        ),
      )
      .toBeLessThan(0.0005);
  }
  await expect
    .poll(async () => (await readRadiusCanvas(page)) !== null)
    .toBe(true);
  const drawing = await readRadiusCanvas(page);
  const view = await readMapView(page);
  if (!drawing || !view) throw new Error('Radius was not drawn');
  const expectedCenter = await coordinatesOnMap(page, centroid);
  if (centered)
    expect(Math.abs(drawing.centerX - expectedCenter.x)).toBeLessThan(3);
  expect(Math.abs(drawing.centerY - expectedCenter.y)).toBeLessThan(3);
  const centerPainted = await page
    .locator('.leaflet-suburb-radius-pane canvas')
    .evaluate((element, point) => {
      const canvas = element as HTMLCanvasElement;
      const bounds = canvas.getBoundingClientRect();
      const context = canvas.getContext('2d');
      if (!context) return false;
      const scale = canvas.width / bounds.width;
      const pixel = context.getImageData(
        Math.floor((point.x - bounds.left) * scale),
        Math.floor((point.y - bounds.top) * scale),
        1,
        1,
      ).data;
      return (
        (pixel[3] ?? 0) >= 180 &&
        Math.abs((pixel[0] ?? 0) - 37) <= 7 &&
        Math.abs((pixel[1] ?? 0) - 99) <= 7 &&
        Math.abs((pixel[2] ?? 0) - 235) <= 7
      );
    }, expectedCenter);
  expect(centerPainted).toBe(true);
  const metresPerPixel =
    (2 * Math.PI * 6371000 * Math.cos((centroid.latitude * Math.PI) / 180)) /
    (256 * 2 ** view.zoom);
  const radiusMetres =
    (centered ? drawing.radiusPixels : drawing.verticalRadiusPixels) *
    metresPerPixel;
  expect(radiusMetres).toBeGreaterThan(9700);
  expect(radiusMetres).toBeLessThan(10300);
}

test.beforeEach(async ({ page }) => {
  const collection: FeatureCollection = { type: 'FeatureCollection', features };
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: transparentTile }),
  );
  await page.route('**/suburbs.geojson', (route) =>
    route.fulfill({
      contentType: 'application/geo+json',
      body: JSON.stringify(collection),
    }),
  );
  await page.goto('./');
  await expect(
    page.getByRole('combobox', { name: 'Search suburbs' }),
  ).toBeVisible();
  await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
});

test('map selection preserves center and zoom while showing its radius and details', async ({
  page,
  hasTouch,
}) => {
  await expect(page.getByLabel('Selected suburb')).toHaveCount(0);
  const initialView = await readMapView(page);
  await selectOnMap(page, 'ALPHA', hasTouch);
  await expectRadius(page, 'ALPHA', false);
  expect(await readMapView(page)).toEqual(initialView);
  await expect(page.locator('.leaflet-popup-content strong')).toHaveText(
    'ALPHA',
  );
  await expect(page.locator('.leaflet-popup:visible')).toHaveCount(1);
  await expect(page.locator('.leaflet-popup-content .connect-name')).toHaveText(
    'Alpha connect',
  );
  await expect(
    page.getByRole('combobox', { name: 'Search suburbs' }),
  ).toHaveValue('ALPHA');
  if (hasTouch) await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);
});

test('radius does not block selecting another suburb and both inputs share selection', async ({
  page,
  hasTouch,
}) => {
  const input = page.getByRole('combobox', { name: 'Search suburbs' });
  await input.fill('alpha');
  await input.press('Enter');
  await expectRadius(page, 'ALPHA');
  const initialView = await readMapView(page);
  await selectOnMap(page, 'BETA', hasTouch);
  await expectRadius(page, 'BETA', false);
  expect(await readMapView(page)).toEqual(initialView);
  await expect(input).toHaveValue('BETA');
  await expect(page.locator('.leaflet-popup-content strong')).toHaveText(
    'BETA',
  );
  await expect(page.locator('.leaflet-suburb-radius-pane canvas')).toHaveCount(
    1,
  );
  await expect(page.locator('.leaflet-suburb-radius-pane')).toHaveCSS(
    'pointer-events',
    'none',
  );
});

test('clears the radius without moving the map and can select again', async ({
  page,
  hasTouch,
}) => {
  const input = page.getByRole('combobox', { name: 'Search suburbs' });
  await input.fill('alpha');
  const option = page.getByRole('option', { name: 'ALPHA', exact: true });
  if (hasTouch) await option.tap();
  else await option.click();
  await expectRadius(page, 'ALPHA');
  const view = await readMapView(page);
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(page.getByLabel('Selected suburb')).toHaveCount(0);
  await expect.poll(() => readRadiusCanvas(page)).toBeNull();
  expect(await readMapView(page)).toEqual(view);
  await expect(input).toHaveValue('');
  await input.fill('beta');
  await input.press('Enter');
  await expectRadius(page, 'BETA');
});
