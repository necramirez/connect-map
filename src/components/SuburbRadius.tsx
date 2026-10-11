import { useEffect } from 'react';
import { latLng, Tooltip } from 'leaflet';
import { Circle, CircleMarker, Pane, useMap } from 'react-leaflet';
import {
  selectionRadiusMetres,
  type SuburbSelection,
} from '../lib/suburbCentroid';

export default function SuburbRadius({
  selection,
}: {
  selection: SuburbSelection | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selection) return;
    map.eachLayer((layer) => {
      if (layer instanceof Tooltip) map.closeTooltip(layer);
    });
    if (!selection.fitCircle) return;
    const { latitude, longitude } = selection.centroid;
    map.fitBounds(
      latLng(latitude, longitude).toBounds(selectionRadiusMetres * 2),
      {
        padding: [32, 32],
        maxZoom: 13,
        animate: false,
      },
    );
  }, [map, selection]);

  const center = selection
    ? latLng(selection.centroid.latitude, selection.centroid.longitude)
    : null;
  return (
    <Pane name="suburb-radius" style={{ zIndex: 450, pointerEvents: 'none' }}>
      {center && (
        <>
          <Circle
            center={center}
            radius={selectionRadiusMetres}
            interactive={false}
            pathOptions={{
              color: '#2563eb',
              fillColor: '#60a5fa',
              fillOpacity: 0.06,
              weight: 2,
              dashArray: '8 6',
            }}
          />
          <CircleMarker
            center={center}
            radius={4}
            interactive={false}
            pathOptions={{
              color: '#2563eb',
              fillColor: '#2563eb',
              fillOpacity: 1,
              weight: 1,
            }}
          />
        </>
      )}
    </Pane>
  );
}
