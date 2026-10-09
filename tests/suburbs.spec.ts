import { expect, test } from '@playwright/test';
import type { FeatureCollection } from 'geojson';
import { findSuburbPoint } from './helpers/suburbCanvas';
import { readMapView } from './helpers/mapView';

const transparentTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DeUAAAAASUVORK5CYII=',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: transparentTile }),
  );
});

test('loads the real suburb collection and draws interactive boundaries', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = page.waitForResponse((result) =>
    result.url().endsWith('/connect-map/suburbs.geojson'),
  );
  await page.goto('./');
  const asset = await response;
  expect(asset.ok()).toBe(true);
  const collection = (await asset.json()) as FeatureCollection;
  expect(collection.type).toBe('FeatureCollection');
  expect(collection.features).toHaveLength(522);
  expect(
    collection.features.some(
      (feature) => feature.properties?.suburbname === 'NEWINGTON',
    ),
  ).toBe(true);
  await expect(page.getByLabel('Suburb boundaries')).toHaveText(
    '522 suburbs loaded',
  );
  await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
  const view = await readMapView(page);
  expect(view?.latitude).toBeCloseTo(-33.83309432488723, 3);
  expect(view?.longitude).toBeCloseTo(151.0593508934678, 3);

  const canvas = page.locator('.leaflet-overlay-pane canvas');
  await expect(canvas).toBeVisible();
  const hasGrayBorder = await canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Suburb canvas is unavailable.');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        (pixels[index + 3] ?? 0) >= 240 &&
        Math.abs((pixels[index] ?? 0) - 156) <= 2 &&
        Math.abs((pixels[index + 1] ?? 0) - 163) <= 2 &&
        Math.abs((pixels[index + 2] ?? 0) - 175) <= 2
      )
        return true;
    }
    return false;
  });
  expect(hasGrayBorder, 'Suburbs without locations have gray borders').toBe(
    true,
  );
  const point = await findSuburbPoint(page);
  expect(
    point,
    'At least one suburb interior should be painted',
  ).not.toBeNull();
  if (!point) throw new Error('No rendered suburb interior found.');
  await page.mouse.click(point.x, point.y);
  const name = page.locator('.leaflet-popup-content strong');
  await expect(name).toBeVisible();
  expect(
    collection.features.map((feature) => feature.properties?.suburbname),
  ).toContain(await name.innerText());
  const popupName = await name.innerText();
  const feature = collection.features.find(
    (feature) => feature.properties?.suburbname === popupName,
  );
  const count = Number(feature?.properties?.locationCount ?? 0);
  expect(count).toBe(0);
  await expect(page.locator('.leaflet-popup-content')).not.toContainText(
    'Postcode',
  );
  await expect(
    page.locator('.leaflet-popup-content .connect-list'),
  ).toHaveCount(0);
  await expect(page.locator('.leaflet-popup-content')).toContainText(
    'No connects in this suburb.',
  );
  await expect(
    page.locator('.leaflet-popup-content p').filter({ hasText: /locations?/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const failure of ['request', 'invalid data'] as const) {
  test(`keeps the map usable after a suburb ${failure} failure`, async ({
    page,
  }) => {
    await page.route('**/suburbs.geojson', (route) =>
      route.fulfill(
        failure === 'request'
          ? { status: 503, body: 'Unavailable' }
          : { contentType: 'application/json', body: '{"type":"invalid"}' },
      ),
    );
    await page.goto('./');
    await expect(
      page.getByRole('alert', { name: 'Suburb boundaries' }),
    ).toHaveText('Suburb boundaries unavailable. Refresh to retry.');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(async () => (await readMapView(page))?.zoom).toBe(13);
    await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
  });
}
