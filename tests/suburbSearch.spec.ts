import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { Feature, FeatureCollection } from 'geojson';
import { findMatchingSuburbs, getSuburbName } from '../src/lib/suburbSearch';
import { readMapView } from './helpers/mapView';

const transparentTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DeUAAAAASUVORK5CYII=',
  'base64',
);

function namedFeature(name: unknown): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [151, -33] },
    properties: { suburbname: name },
  };
}

test('finds case-insensitive partial names, ignores whitespace, and prioritizes exact matches', () => {
  const features = ['WEST RYDE', 'RYDE', 'NORTH RYDE', 'EAST RYDE'].map(
    namedFeature,
  );
  expect(findMatchingSuburbs(features, 'rYdE').map(getSuburbName)).toEqual([
    'RYDE',
    'EAST RYDE',
    'NORTH RYDE',
    'WEST RYDE',
  ]);
  expect(
    findMatchingSuburbs(features, ' west  RYDE ').map(getSuburbName),
  ).toEqual(['WEST RYDE']);
  expect(features.map(getSuburbName)).toEqual([
    'WEST RYDE',
    'RYDE',
    'NORTH RYDE',
    'EAST RYDE',
  ]);
});

test('returns no results for empty or unknown searches and ignores invalid names', () => {
  const features = [
    namedFeature('RYDE'),
    namedFeature(null),
    namedFeature(123),
  ];
  for (const query of ['', ' \t ', 'no-such-suburb'])
    expect(findMatchingSuburbs(features, query)).toEqual([]);
  expect(findMatchingSuburbs(features, 'ryde')).toHaveLength(1);
});

async function expectedCenter(name: string) {
  const collection = JSON.parse(
    await readFile('data/suburbs.geojson', 'utf8'),
  ) as FeatureCollection;
  const feature = collection.features.find(
    (feature) => getSuburbName(feature) === name,
  );
  if (!feature?.geometry || !('coordinates' in feature.geometry))
    throw new Error(`Missing boundary for ${name}`);
  let minimumLongitude = Infinity;
  let maximumLongitude = -Infinity;
  let minimumLatitude = Infinity;
  let maximumLatitude = -Infinity;
  function visit(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      minimumLongitude = Math.min(minimumLongitude, value[0]);
      maximumLongitude = Math.max(maximumLongitude, value[0]);
      minimumLatitude = Math.min(minimumLatitude, value[1]);
      maximumLatitude = Math.max(maximumLatitude, value[1]);
    } else value.forEach(visit);
  }
  visit(feature.geometry.coordinates);
  return {
    longitude: (minimumLongitude + maximumLongitude) / 2,
    latitude: (minimumLatitude + maximumLatitude) / 2,
  };
}

async function expectCentered(page: Page, name: string) {
  const expected = await expectedCenter(name);
  await expect(
    page.getByText(`Centered on ${name}.`, { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Math.abs(
        ((await readMapView(page))?.longitude ?? 0) - expected.longitude,
      ),
    )
    .toBeLessThan(0.0005);
  await expect
    .poll(async () =>
      Math.abs(((await readMapView(page))?.latitude ?? 0) - expected.latitude),
    )
    .toBeLessThan(0.0005);
  const view = await readMapView(page);
  expect(view?.zoom).toBeLessThanOrEqual(15);
  expect(view?.zoom).toBeGreaterThanOrEqual(12);
  await expect(
    page.getByRole('listbox', { name: 'Matching suburbs' }),
  ).toHaveCount(0);
  await expect(page.locator('.leaflet-popup:visible')).toHaveCount(0);
}

test.describe('map suburb search', () => {
  const runtimeErrors = new WeakMap<Page, string[]>();

  test.afterEach(async ({ page }) => {
    expect(runtimeErrors.get(page) ?? []).toEqual([]);
  });

  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    runtimeErrors.set(page, errors);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: transparentTile }),
    );
  });

  test('selects a suburb by click or tap and recenters the map', async ({
    page,
    hasTouch,
  }) => {
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/suburbs.geojson')) requests++;
    });
    await page.goto('./');
    const search = page.getByRole('combobox', { name: 'Search suburbs' });
    await expect(search).toBeVisible();
    await search.fill('parramatta');
    const result = page.getByRole('option', {
      name: 'PARRAMATTA',
      exact: true,
    });
    await expect(result).toBeVisible();
    if (hasTouch) await result.tap();
    else await result.click();
    await expect(search).toHaveValue('PARRAMATTA');
    await expectCentered(page, 'PARRAMATTA');
    expect(requests).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

  test('navigates ambiguous results by keyboard and Escape does not move the map', async ({
    page,
  }) => {
    await page.goto('./');
    const search = page.getByRole('combobox', { name: 'Search suburbs' });
    await expect(search).toBeVisible();
    await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
    const initial = await readMapView(page);
    await search.fill('ryde');
    await expect(page.getByRole('option')).toHaveText([
      'RYDE',
      'EAST RYDE',
      'NORTH RYDE',
      'WEST RYDE',
    ]);
    await search.press('ArrowDown');
    await expect(
      page.getByRole('option', { name: 'RYDE', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await search.press('Escape');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(await readMapView(page)).toEqual(initial);
    for (let index = 0; index < 4; index++) await search.press('ArrowDown');
    await expect(
      page.getByRole('option', { name: 'WEST RYDE', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await search.press('Enter');
    await expectCentered(page, 'WEST RYDE');
    await expect(page.locator('.leaflet-container')).toBeFocused();
  });

  test('centers an exact match with mixed case and extra whitespace on Enter', async ({
    page,
  }) => {
    await page.goto('./');
    const search = page.getByRole('combobox', { name: 'Search suburbs' });
    await expect(search).toBeVisible();
    await search.fill('  paR raMATTA  ');
    await expect(page.getByRole('option').first()).toHaveText('PARRAMATTA');
    await search.press('Enter');
    await expectCentered(page, 'PARRAMATTA');
  });

  test('shows no matches without moving the map and clears results for empty input', async ({
    page,
  }) => {
    await page.goto('./');
    const search = page.getByRole('combobox', { name: 'Search suburbs' });
    await expect(search).toBeVisible();
    await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
    const initial = await readMapView(page);
    await search.fill('no-such-suburb-xyz');
    await expect(
      page.getByText('No matching suburbs.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(0);
    await search.press('Enter');
    expect(await readMapView(page)).toEqual(initial);
    await search.fill('');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  test('does not recenter a suburb with no usable boundary', async ({
    page,
  }) => {
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { suburbname: 'EMPTY BOUNDARY' },
          geometry: { type: 'GeometryCollection', geometries: [] },
        },
      ],
    };
    await page.route('**/suburbs.geojson', (route) =>
      route.fulfill({
        contentType: 'application/geo+json',
        body: JSON.stringify(collection),
      }),
    );
    await page.goto('./');
    const search = page.getByRole('combobox', { name: 'Search suburbs' });
    await expect(search).toBeVisible();
    await expect.poll(async () => (await readMapView(page))?.zoom).toBe(12);
    const initial = await readMapView(page);
    await search.fill('empty');
    await page.getByRole('option', { name: 'EMPTY BOUNDARY' }).click();
    await expect(
      page.getByText('No map boundary is available for EMPTY BOUNDARY.'),
    ).toBeVisible();
    expect(await readMapView(page)).toEqual(initial);
  });
});
