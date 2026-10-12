import type { Feature } from 'geojson';
import polylabel from 'polylabel';

export interface SuburbPoint {
  latitude: number;
  longitude: number;
}

export interface SuburbSelection {
  feature: Feature;
  point: SuburbPoint;
  fitCircle: boolean;
}

export const selectionRadiusMetres = 10_000;

export function calculateSuburbPoint(feature: Feature): SuburbPoint | null {
  const geometry = feature.geometry;
  if (
    !geometry ||
    (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')
  )
    return null;
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let bestPoint: SuburbPoint | null = null;
  let bestDistance = 0;
  for (const polygon of polygons) {
    if (!polygon[0] || polygon[0].length < 3) continue;
    const point = polylabel(
      polygon as Parameters<typeof polylabel>[0],
      0.00001,
    );
    if (
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      Number.isFinite(point.distance) &&
      point.distance > bestDistance
    ) {
      bestPoint = { longitude: point[0], latitude: point[1] };
      bestDistance = point.distance;
    }
  }
  return bestPoint;
}
