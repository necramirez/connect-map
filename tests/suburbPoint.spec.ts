import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Feature, FeatureCollection, Position } from 'geojson';
import polylabel from 'polylabel';
import {
  calculateSuburbPoint,
  selectionRadiusMetres,
} from '../src/lib/suburbPoint';

function polygon(rings: Position[][]): Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: rings },
  };
}

function rectangle(
  west: number,
  south: number,
  east: number,
  north: number,
): Position[] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

test('places the point using polylabel rather than a triangle centroid', () => {
  const coordinates: Parameters<typeof polylabel>[0] = [
    [
      [0, 0],
      [6, 0],
      [0, 3],
      [0, 0],
    ],
  ];
  const expected = polylabel(coordinates, 0.00001);
  expect(selectionRadiusMetres).toBe(10_000);
  expect(calculateSuburbPoint(polygon(coordinates))).toEqual({
    longitude: expected[0],
    latitude: expected[1],
  });
  expect(expected[0]).toBeCloseTo(1.1459, 4);
  expect(expected[1]).toBeCloseTo(1.1459, 4);
});

test('handles either ring winding and unclosed rings', () => {
  const ring = rectangle(0, 0, 4, 2);
  for (const coordinates of [ring, [...ring].reverse(), ring.slice(0, -1)]) {
    expect(calculateSuburbPoint(polygon([coordinates]))).toEqual({
      longitude: 2,
      latitude: 1,
    });
  }
});

test('keeps the point inside the polygon and outside its hole', () => {
  const coordinates = [rectangle(0, 0, 10, 10), rectangle(4, 4, 6, 6)];
  const point = calculateSuburbPoint(polygon(coordinates));
  const expected = polylabel(
    coordinates as Parameters<typeof polylabel>[0],
    0.00001,
  );
  expect(point).toEqual({ longitude: expected[0], latitude: expected[1] });
  if (!point) throw new Error('Point was not calculated');
  expect(point.longitude).toBeGreaterThan(0);
  expect(point.longitude).toBeLessThan(10);
  expect(point.latitude).toBeGreaterThan(0);
  expect(point.latitude).toBeLessThan(10);
  expect(
    point.longitude > 4 &&
      point.longitude < 6 &&
      point.latitude > 4 &&
      point.latitude < 6,
  ).toBe(false);
});

test('chooses the MultiPolygon component with the greatest interior clearance', () => {
  const feature: Feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[rectangle(0, 0, 20, 1)], [rectangle(30, 0, 34, 4)]],
    },
  };
  expect(calculateSuburbPoint(feature)).toEqual({ longitude: 32, latitude: 2 });
});

test('rejects empty, degenerate, and unsupported geometries', () => {
  expect(calculateSuburbPoint(polygon([]))).toBeNull();
  expect(
    calculateSuburbPoint(
      polygon([
        [
          [0, 0],
          [1, 1],
          [2, 2],
          [0, 0],
        ],
      ]),
    ),
  ).toBeNull();
  expect(
    calculateSuburbPoint({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [151, -33] },
    }),
  ).toBeNull();
});

test('supports small polygons above the search precision at Sydney coordinates', () => {
  const coordinates = [rectangle(151.05, -33.84, 151.0501, -33.8398)];
  const expected = polylabel(
    coordinates as Parameters<typeof polylabel>[0],
    0.00001,
  );
  expect(calculateSuburbPoint(polygon(coordinates))).toEqual({
    longitude: expected[0],
    latitude: expected[1],
  });
  expect(expected.distance).toBeGreaterThan(0);
});

test('calculates an interior point for every real suburb', async () => {
  const collection = JSON.parse(
    await readFile('data/suburbs.geojson', 'utf8'),
  ) as FeatureCollection;
  const invalid = collection.features
    .filter((feature) => calculateSuburbPoint(feature) === null)
    .map((feature) => feature.properties?.suburbname);
  expect(invalid).toEqual([]);
});
