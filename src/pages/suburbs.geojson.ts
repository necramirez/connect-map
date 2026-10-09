import { readFile } from 'node:fs/promises';
import type { APIRoute } from 'astro';
import type { FeatureCollection } from 'geojson';
import { addLocationCounts } from '../lib/suburbConnections';
import { readConnects } from '../lib/readConnects';

export const GET: APIRoute = async () => {
  const source = await readFile('data/suburbs.geojson', 'utf8');
  const collection = JSON.parse(source) as FeatureCollection;

  if (
    collection?.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features)
  ) {
    throw new Error('Suburb data must contain a GeoJSON FeatureCollection.');
  }

  const locations = await readConnects();
  const suburbs = addLocationCounts(collection, locations);
  return new Response(JSON.stringify(suburbs), {
    headers: { 'Content-Type': 'application/geo+json; charset=utf-8' },
  });
};
