import type { Feature, Position } from 'geojson';

export interface SuburbCentroid {
  latitude: number;
  longitude: number;
}

export interface SuburbSelection {
  feature: Feature;
  centroid: SuburbCentroid;
  fitCircle: boolean;
}

export const selectionRadiusMetres = 10_000;

interface RingCentroid extends SuburbCentroid {
  area: number;
}

function calculateRingCentroid(
  ring: Position[],
  origin: SuburbCentroid,
): RingCentroid | null {
  if (ring.length < 3) return null;
  let crossSum = 0;
  let longitudeMoment = 0;
  let latitudeMoment = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const currentLongitude = current?.[0];
    const currentLatitude = current?.[1];
    const nextLongitude = next?.[0];
    const nextLatitude = next?.[1];
    if (
      typeof currentLongitude !== 'number' ||
      typeof currentLatitude !== 'number' ||
      typeof nextLongitude !== 'number' ||
      typeof nextLatitude !== 'number' ||
      ![currentLongitude, currentLatitude, nextLongitude, nextLatitude].every(
        Number.isFinite,
      )
    )
      return null;

    const firstLongitude = currentLongitude - origin.longitude;
    const firstLatitude = currentLatitude - origin.latitude;
    const secondLongitude = nextLongitude - origin.longitude;
    const secondLatitude = nextLatitude - origin.latitude;
    const cross =
      firstLongitude * secondLatitude - secondLongitude * firstLatitude;
    crossSum += cross;
    longitudeMoment += (firstLongitude + secondLongitude) * cross;
    latitudeMoment += (firstLatitude + secondLatitude) * cross;
  }
  if (Math.abs(crossSum) <= Number.EPSILON) return null;
  return {
    area: Math.abs(crossSum) / 2,
    longitude: longitudeMoment / (3 * crossSum),
    latitude: latitudeMoment / (3 * crossSum),
  };
}

export function calculateSuburbCentroid(
  feature: Feature,
): SuburbCentroid | null {
  const geometry = feature.geometry;
  if (
    !geometry ||
    (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')
  )
    return null;
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const first = polygons[0]?.[0]?.[0];
  const longitude = first?.[0];
  const latitude = first?.[1];
  if (typeof longitude !== 'number' || typeof latitude !== 'number')
    return null;
  const origin = { longitude, latitude };
  let totalArea = 0;
  let longitudeMoment = 0;
  let latitudeMoment = 0;

  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index++) {
      const ring = polygon[index];
      if (!ring) continue;
      const centroid = calculateRingCentroid(ring, origin);
      if (!centroid) {
        if (index === 0) break;
        continue;
      }
      const area = index === 0 ? centroid.area : -centroid.area;
      totalArea += area;
      longitudeMoment += centroid.longitude * area;
      latitudeMoment += centroid.latitude * area;
    }
  }
  if (totalArea <= Number.EPSILON) return null;
  const result = {
    longitude: origin.longitude + longitudeMoment / totalArea,
    latitude: origin.latitude + latitudeMoment / totalArea,
  };
  return Number.isFinite(result.longitude) &&
    Number.isFinite(result.latitude) &&
    Math.abs(result.longitude) <= 180 &&
    Math.abs(result.latitude) <= 90
    ? result
    : null;
}
