import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FeatureCollection } from 'geojson';
import {
  addLocationCounts,
  normalizeSuburbName,
  summarizeConnect,
  type ConnectSummary,
  type LocationRecord,
} from '../src/lib/suburbConnections';
import { findSuburbPoint } from './helpers/suburbCanvas';

const transparentTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DeUAAAAASUVORK5CYII=',
  'base64',
);

test('normalizes suburb case and whitespace and rejects empty or invalid names', () => {
  expect(normalizeSuburbName('Melrose Park')).toBe('melrosepark');
  expect(normalizeSuburbName('MELROSEPARK')).toBe('melrosepark');
  expect(normalizeSuburbName(' melrose  PARK ')).toBe('melrosepark');
  expect(normalizeSuburbName('Melrose\t\nPark')).toBe('melrosepark');
  for (const value of [null, undefined, '', '   ', 2114, {}]) {
    expect(normalizeSuburbName(value)).toBeNull();
  }
});

test('counts matching names without postcode matching or copying addresses', () => {
  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: ['Melrose Park', 'MEL ROSE PARK', 'West Ryde', null].map(
      (suburbname) => ({
        type: 'Feature',
        geometry: { type: 'Point' as const, coordinates: [151, -33] },
        properties: { suburbname, postcode: 2114 },
      }),
    ),
  };
  const locations = [
    { suburb: 'melrosepark', postcode: 9999, address1: 'Private test address' },
    {
      suburb: ' MeLroSe PaRk ',
      postcode: null,
      address1: 'Another private address',
    },
    { suburb: null, postcode: 2114 },
    { suburb: '   ', postcode: 2114 },
  ];
  const enriched = addLocationCounts(collection, locations);
  expect(
    enriched.features.map((feature) => feature.properties?.locationCount),
  ).toEqual([2, 2, 0, 0]);
  expect(collection.features[0]?.properties?.locationCount).toBeUndefined();
  expect(JSON.stringify(enriched).includes('Private test address')).toBe(false);
  expect(JSON.stringify(enriched).includes('address1')).toBe(false);
});

test('summarizes only names and distinct demographic labels', () => {
  const location = {
    name: ' Families Group ',
    demographic: [
      'Adults',
      ' adults ',
      'Young  Families',
      '??',
      'Unknown',
      '',
      null,
    ],
    address1: 'Private address',
    schedule: 'Private schedule',
  };
  expect(summarizeConnect(location)).toEqual({
    name: 'Families Group',
    demographics: ['Adults', 'Young Families', 'Unknown'],
  });
});

test('uses safe labels for unnamed connects and missing or invalid demographics', () => {
  for (const name of [undefined, null, '', '   ', '??', 123]) {
    for (const demographic of [undefined, null, [], [null, 123, ' '], '??']) {
      expect(summarizeConnect({ name, demographic })).toEqual({
        name: 'Unnamed connect',
        demographics: ['Unknown'],
      });
    }
  }
});

test('published assets contain safe connect summaries but no private connection fields', async () => {
  const connections = JSON.parse(
    await readFile('data/connects.json', 'utf8'),
  ) as {
    locations: (LocationRecord & { address1?: string })[];
  };
  const counts = new Map<string, number>();
  for (const location of connections.locations) {
    const name = normalizeSuburbName(location.suburb);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const collection = JSON.parse(
    await readFile('dist/suburbs.geojson', 'utf8'),
  ) as FeatureCollection;
  const source = JSON.parse(
    await readFile('data/suburbs.geojson', 'utf8'),
  ) as FeatureCollection;
  expect(collection.features.length).toBe(source.features.length);
  expect(
    collection.features.every(
      (feature, index) =>
        JSON.stringify(feature.geometry) ===
        JSON.stringify(source.features[index]?.geometry),
    ),
  ).toBe(true);
  for (const feature of collection.features) {
    const name = normalizeSuburbName(feature.properties?.suburbname);
    expect(feature.properties?.locationCount).toBe(
      name ? (counts.get(name) ?? 0) : 0,
    );
    const expectedConnects = name
      ? connections.locations
          .filter((location) => normalizeSuburbName(location.suburb) === name)
          .map(summarizeConnect)
      : [];
    expect(feature.properties?.connects).toEqual(expectedConnects);
    for (const connect of feature.properties?.connects as ConnectSummary[]) {
      expect(Object.keys(connect).sort()).toEqual(['demographics', 'name']);
    }
    expect(feature.properties?.address1).toBeUndefined();
    expect(feature.properties?.schedule).toBeUndefined();
  }

  async function inspect(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await inspect(path);
      } else {
        expect(entry.name === 'connects.json').toBe(false);
        if (/\.(js|html|json|geojson|css|map)$/.test(entry.name)) {
          const content = await readFile(path, 'utf8');
          const exposesAddress = connections.locations.some(
            (location) =>
              location.address1 && content.includes(location.address1),
          );
          expect(exposesAddress).toBe(false);
          expect(content.includes('Holker')).toBe(false);
        }
      }
    }
  }
  await inspect('dist');
});

test('keeps desktop hover details and mobile tap details for matching suburbs', async ({
  page,
  hasTouch,
}) => {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: transparentTile }),
  );
  const response = page.waitForResponse((result) =>
    result.url().endsWith('/suburbs.geojson'),
  );
  await page.goto('./');
  const collection = (await (await response).json()) as FeatureCollection;
  await expect(page.getByLabel('Suburb boundaries')).toHaveText(
    '522 suburbs loaded',
  );
  await expect(page.getByText('Amber: has locations')).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane canvas')).toBeVisible();
  const point = await findSuburbPoint(page, true);
  expect(point, 'A matching suburb should be painted amber').not.toBeNull();
  if (!point) throw new Error('No highlighted suburb found.');
  const supportsHover = await page.evaluate(
    () => window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  expect(supportsHover).toBe(!hasTouch);
  await page.mouse.move(point.x, point.y);
  const tooltipText = supportsHover
    ? await page.locator('.leaflet-tooltip').innerText()
    : null;
  if (!supportsHover)
    await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);
  if (hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toBeVisible();
  const suburbName = await popup.locator('strong').innerText();
  const feature = collection.features.find(
    (feature) => feature.properties?.suburbname === suburbName,
  );
  const count = Number(feature?.properties?.locationCount ?? 0);
  expect(count).toBeGreaterThan(0);
  const countLabel = `${count} ${count === 1 ? 'location' : 'locations'}`;
  if (supportsHover) expect(tooltipText).toContain(countLabel);
  else await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);
  await expect(popup).not.toContainText(countLabel);
  await expect(popup).not.toContainText('Postcode');
  const connects = feature?.properties?.connects as ConnectSummary[];
  await expect(popup.locator('.connect-name')).toHaveText(
    connects.map((connect) => connect.name),
  );
  await expect(popup.locator('.connect-demographics')).toHaveText(
    connects.flatMap((connect) => {
      const labels = connect.demographics.filter(
        (label) => !['unknown', '??'].includes(label.trim().toLowerCase()),
      );
      return labels.length ? [labels.join(', ')] : [];
    }),
  );
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);
});

test('shows hover counts only on hover-capable devices and preserves touch popups', async ({
  page,
  hasTouch,
}) => {
  const fixture: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          suburbname: 'TEST SUBURB',
          postcode: 2114,
          locationCount: 2,
        },
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
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: transparentTile }),
  );
  await page.route('**/suburbs.geojson', (route) =>
    route.fulfill({
      contentType: 'application/geo+json',
      body: JSON.stringify(fixture),
    }),
  );
  for (const count of [2, 0]) {
    if (fixture.features[0]?.properties) {
      fixture.features[0].properties.locationCount = count;
      fixture.features[0].properties.connects = Array.from(
        { length: count },
        (_, index) => ({
          name: `Connect ${index + 1}`,
          demographics: [],
        }),
      );
    }
    await page.goto('./');
    await expect(page.getByLabel('Suburb boundaries')).toHaveText(
      '1 suburbs loaded',
    );
    await expect(page.locator('.leaflet-overlay-pane canvas')).toBeVisible();
    const point = await findSuburbPoint(page, count > 0);
    if (!point)
      throw new Error('Test suburb was not rendered with the expected style.');
    await page.mouse.move(point.x, point.y);
    if (hasTouch) {
      await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);
      await page.touchscreen.tap(point.x, point.y);
    } else {
      await expect(page.locator('.leaflet-tooltip')).toContainText(
        `${count} locations`,
      );
      await page.mouse.click(point.x, point.y);
    }
    const popup = page.locator('.leaflet-popup-content');
    await expect(popup.locator('strong')).toHaveText('TEST SUBURB');
    await expect(popup.locator('.connect-name')).toHaveCount(count);
    if (hasTouch) await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);
  }
});
