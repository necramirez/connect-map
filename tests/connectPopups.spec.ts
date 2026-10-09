import { expect, test, type Page } from '@playwright/test';
import type { FeatureCollection } from 'geojson';
import {
  addLocationCounts,
  type LocationRecord,
} from '../src/lib/suburbConnections';
import { findSuburbPoint } from './helpers/suburbCanvas';

const transparentTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DeUAAAAASUVORK5CYII=',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: transparentTile }),
  );
});

async function openPopup(page: Page, locations: readonly LocationRecord[]) {
  const source: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { suburbname: 'TEST SUBURB', postcode: 2114 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [151.02, -33.8],
              [151.1, -33.8],
              [151.1, -33.827],
              [151.02, -33.827],
              [151.02, -33.8],
            ],
          ],
        },
      },
    ],
  };
  await page.route('**/suburbs.geojson', (route) =>
    route.fulfill({
      contentType: 'application/geo+json',
      body: JSON.stringify(addLocationCounts(source, locations)),
    }),
  );
  await page.goto('./');
  await expect(page.getByLabel('Suburb boundaries')).toHaveText(
    '1 suburbs loaded',
  );
  await expect(page.locator('.leaflet-overlay-pane canvas')).toBeVisible();
  const point = await findSuburbPoint(page, true);
  if (!point) throw new Error('Test suburb was not rendered.');
  await page.mouse.click(point.x, point.y);
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toBeVisible();
  return popup;
}

test('lists connect names and demographics without postcodes or private fields', async ({
  page,
}) => {
  const locations = [
    {
      suburb: 'testsuburb',
      name: 'Families Group',
      demographic: ['Young Families', '??', 'Adults'],
      address1: 'Private address',
      schedule: 'Private schedule',
    },
    { suburb: ' Test Suburb ', name: '', demographic: ['??'] },
  ];
  const popup = await openPopup(page, locations);
  await expect(popup.getByRole('list', { name: 'Connects' })).toBeVisible();
  await expect(popup.locator('.connect-name')).toHaveText([
    'Families Group',
    'Unnamed connect',
  ]);
  await expect(popup.locator('.connect-demographics')).toHaveText([
    'Young Families, Adults',
  ]);
  await expect(popup).not.toContainText('Unknown');
  await expect(popup).not.toContainText(/\b\d+ locations?\b/);
  await expect(popup).not.toContainText('Postcode');
  await expect(popup).not.toContainText('2114');
  await expect(popup).not.toContainText('Private address');
  await expect(popup).not.toContainText('Private schedule');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('keeps connect names but omits all unknown or missing demographics', async ({
  page,
}) => {
  const popup = await openPopup(page, [
    { suburb: 'TEST SUBURB', name: 'First group', demographic: ['??'] },
    { suburb: 'TEST SUBURB', name: 'Second group', demographic: [' unknown '] },
    { suburb: 'TEST SUBURB', name: 'Third group' },
  ]);
  await expect(popup.locator('.connect-name')).toHaveText([
    'First group',
    'Second group',
    'Third group',
  ]);
  await expect(popup.locator('.connect-demographics')).toHaveCount(0);
  await expect(popup).not.toContainText(/\b\d+ locations?\b/);
});

test('renders connect names and demographics as literal text, not HTML', async ({
  page,
}) => {
  const name = '<img src=x onerror="window.popupInjected=true">';
  const demographic = '<script>window.popupInjected=true</script>';
  const popup = await openPopup(page, [
    { suburb: 'TEST SUBURB', name, demographic: [demographic] },
  ]);
  await expect(popup.locator('.connect-name')).toHaveText(name);
  await expect(popup.locator('.connect-demographics')).toHaveText(demographic);
  await expect(popup.locator('img, script')).toHaveCount(0);
  expect(await page.evaluate(() => 'popupInjected' in window)).toBe(false);
});
