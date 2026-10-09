import { readFile } from 'node:fs/promises';
import type { LocationRecord } from './suburbConnections';

export async function readConnects(): Promise<LocationRecord[]> {
  const data = JSON.parse(await readFile('data/connects.json', 'utf8')) as {
    locations?: LocationRecord[];
  };
  if (
    !Array.isArray(data?.locations) ||
    data.locations.some(
      (location) =>
        !location || typeof location !== 'object' || Array.isArray(location),
    )
  ) {
    throw new Error(
      'Connection data must contain a locations array of objects.',
    );
  }
  return data.locations;
}
