import { expect, test } from '@playwright/test';
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

test('opens at the initial location without the old header label or starting panel', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith('http://127.0.0.1') && !response.ok()) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('./');
  await expect(page).toHaveTitle('Connect Map');
  await expect(
    page.getByRole('region', { name: 'Interactive map' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'All connects', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Newington, NSW', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('.map-details')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset view' })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'OpenStreetMap' }),
  ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
  const view = await readMapView(page);
  expect(view?.latitude).toBeCloseTo(-33.83309432488723, 3);
  expect(view?.longitude).toBeCloseTo(151.0593508934678, 3);
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Holker');
  expect(failures).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('zooms and pans without requiring the removed starting panel', async ({
  page,
}) => {
  await page.goto('./');
  await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await readMapView(page))?.zoom).toBe(13);
  await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
  const initialView = await readMapView(page);
  const map = page.getByRole('region', { name: 'Interactive map' });
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error('Map has no visible bounds');
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + 180, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Math.abs(
        ((await readMapView(page))?.longitude ?? 0) -
          (initialView?.longitude ?? 0),
      ),
    )
    .toBeGreaterThan(0.001);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
});

test('explains the JavaScript requirement when scripting is disabled', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  await page.goto('./');
  const message = page.locator('noscript p');
  await expect(message).toBeVisible();
  await expect(message).toHaveText(
    'Enable JavaScript to explore the interactive map.',
  );
  await context.close();
});
