import { expect, test } from '@playwright/test';
import type { Feature, FeatureCollection } from 'geojson';

const transparentTile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DeUAAAAASUVORK5CYII=',
  'base64',
);

function collectionWithCounts(counts: unknown[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: counts.map((count, index): Feature => ({
      type: 'Feature',
      properties: { suburbname: `TEST SUBURB ${index}`, locationCount: count },
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
    })),
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: transparentTile }),
  );
});

const scenarios = [
  {
    name: 'counts suburbs once and ignores missing or invalid location counts',
    counts: [4, 2, 0, undefined, -1, 0.5, '3'],
    expected: 2,
  },
  {
    name: 'shows zero when no suburbs have locations',
    counts: [0, undefined],
    expected: 0,
  },
  { name: 'shows zero for an empty collection', counts: [], expected: 0 },
  {
    name: 'uses singular wording for one suburb with multiple locations',
    counts: [5, 0],
    expected: 1,
  },
];

for (const scenario of scenarios) {
  test(scenario.name, async ({ page }) => {
    await page.route('**/suburbs.geojson', (route) =>
      route.fulfill({
        contentType: 'application/geo+json',
        body: JSON.stringify(collectionWithCounts(scenario.counts)),
      }),
    );
    await page.goto('./');
    await expect(page.getByLabel('Suburb boundaries')).toHaveText(
      `${scenario.counts.length} suburbs loaded`,
    );
    await expect(page.getByLabel('Suburbs with locations')).toHaveText(
      `${scenario.expected} ${scenario.expected === 1 ? 'suburb' : 'suburbs'} with locations`,
    );
  });
}
