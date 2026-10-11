import type { Feature } from 'geojson';
import { normalizeSuburbName } from './suburbConnections';

export function getSuburbName(feature: Feature): string {
  return typeof feature.properties?.suburbname === 'string'
    ? feature.properties.suburbname.trim()
    : '';
}

export function findMatchingSuburbs(
  features: readonly Feature[],
  query: string,
): Feature[] {
  const normalized = normalizeSuburbName(query) ?? '';
  if (!normalized) return [];

  function priority(feature: Feature): number {
    const name = normalizeSuburbName(getSuburbName(feature)) ?? '';
    return name === normalized ? 0 : name.startsWith(normalized) ? 1 : 2;
  }

  return features
    .filter((feature) =>
      normalizeSuburbName(getSuburbName(feature))?.includes(normalized),
    )
    .sort(
      (first, second) =>
        priority(first) - priority(second) ||
        getSuburbName(first).localeCompare(getSuburbName(second)),
    );
}
