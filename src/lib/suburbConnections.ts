import type { FeatureCollection } from 'geojson';

export interface LocationRecord {
  suburb?: unknown;
  name?: unknown;
  demographic?: unknown;
  state?: unknown;
  postcode?: unknown;
  schedule?: unknown;
}

export interface ConnectSummary {
  name: string;
  demographics: string[];
}

export function getKnownDemographics(labels: readonly string[]): string[] {
  return labels.filter((label) => {
    const normalized = label.trim().toLowerCase();
    return (
      normalized.length > 0 && normalized !== 'unknown' && normalized !== '??'
    );
  });
}

export function normalizeSuburbName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.toLowerCase().replace(/\s+/g, '');
  return name || null;
}

export function summarizeConnect(location: LocationRecord): ConnectSummary {
  const name = typeof location.name === 'string' ? location.name.trim() : '';
  const values = Array.isArray(location.demographic)
    ? location.demographic
    : [location.demographic];
  const demographics = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const label = value.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    const display = label === '??' ? 'Unknown' : label;
    if (!demographics.has(display.toLowerCase())) {
      demographics.set(display.toLowerCase(), display);
    }
  }

  return {
    name: name && name !== '??' ? name : 'Unnamed connect',
    demographics: demographics.size ? [...demographics.values()] : ['Unknown'],
  };
}

export function addLocationCounts(
  collection: FeatureCollection,
  locations: readonly LocationRecord[],
): FeatureCollection {
  const summaries = new Map<string, ConnectSummary[]>();
  for (const location of locations) {
    const name = normalizeSuburbName(location?.suburb);
    if (!name) continue;
    const connects = summaries.get(name) ?? [];
    connects.push(summarizeConnect(location));
    summaries.set(name, connects);
  }

  return {
    ...collection,
    features: collection.features.map((feature) => {
      const name = normalizeSuburbName(feature.properties?.suburbname);
      const connects = name ? (summaries.get(name) ?? []) : [];
      return {
        ...feature,
        properties: {
          ...feature.properties,
          locationCount: connects.length,
          connects,
        },
      };
    }),
  };
}
