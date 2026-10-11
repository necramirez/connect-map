import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Feature, FeatureCollection, Position } from 'geojson';
import {
  calculateSuburbCentroid,
  selectionRadiusMetres,
} from '../src/lib/suburbCentroid';

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

test('uses an area centroid rather than the bounding-box center', () => {
  expect(selectionRadiusMetres).toBe(10_000);
  expect(
    calculateSuburbCentroid(
      polygon([
        [
          [0, 0],
          [6, 0],
          [0, 3],
          [0, 0],
        ],
      ]),
    ),
  ).toEqual({ longitude: 2, latitude: 1 });
});

test('handles either ring winding and missing repeated closing vertices', () => {
  const ring = rectangle(0, 0, 4, 2);
  for (const coordinates of [ring, [...ring].reverse(), ring.slice(0, -1)]) {
    expect(calculateSuburbCentroid(polygon([coordinates]))).toEqual({
      longitude: 2,
      latitude: 1,
    });
  }
});

test('subtracts off-center holes regardless of their winding', () => {
  const outer = rectangle(0, 0, 4, 4);
  const hole = rectangle(0.5, 0.5, 1.5, 1.5);
  for (const coordinates of [hole, [...hole].reverse()]) {
    const centroid = calculateSuburbCentroid(polygon([outer, coordinates]));
    expect(centroid?.longitude).toBeCloseTo(31 / 15, 12);
    expect(centroid?.latitude).toBeCloseTo(31 / 15, 12);
  }
});

test('weights all MultiPolygon parts by their areas', () => {
  const feature: Feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[rectangle(0, 0, 2, 2)], [rectangle(4, 0, 8, 2)]],
    },
  };
  const centroid = calculateSuburbCentroid(feature);
  expect(centroid?.longitude).toBeCloseTo(13 / 3, 12);
  expect(centroid?.latitude).toBe(1);
});

test('rejects empty, degenerate, and unsupported geometries', () => {
  expect(calculateSuburbCentroid(polygon([]))).toBeNull();
  expect(
    calculateSuburbCentroid(
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
    calculateSuburbCentroid({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [151, -33] },
    }),
  ).toBeNull();
});

test('keeps precision for small polygons at Sydney coordinates', () => {
  const centroid = calculateSuburbCentroid(
    polygon([rectangle(151.05, -33.84, 151.05001, -33.83998)]),
  );
  expect(centroid?.longitude).toBeCloseTo(151.050005, 10);
  expect(centroid?.latitude).toBeCloseTo(-33.83999, 10);
});

test('calculates a valid centroid for every real suburb', async () => {
  const collection = JSON.parse(
    await readFile('data/suburbs.geojson', 'utf8'),
  ) as FeatureCollection;
  const invalid = collection.features
    .filter((feature) => calculateSuburbCentroid(feature) === null)
    .map((feature) => feature.properties?.suburbname);
  expect(invalid).toEqual([]);
});
