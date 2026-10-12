import { useEffect, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import { GeoJSON, useMap } from 'react-leaflet';
import SuburbSearch from './SuburbSearch';
import SuburbRadius from './SuburbRadius';
import {
  calculateSuburbPoint,
  type SuburbPoint,
  type SuburbSelection,
} from '../lib/suburbPoint';
import {
  getKnownDemographics,
  type ConnectSummary,
} from '../lib/suburbConnections';

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; collection: FeatureCollection }
  | { status: 'error' };

function getLocationCount(feature?: Feature): number {
  const count = feature?.properties?.locationCount;
  return typeof count === 'number' && Number.isInteger(count) && count > 0
    ? count
    : 0;
}

function getSuburbStyle(feature?: Feature): PathOptions {
  return getLocationCount(feature) > 0
    ? { color: '#c77d1b', weight: 3, fillOpacity: 0.32 }
    : { color: '#9ca3af', weight: 2, fillOpacity: 0.08 };
}

function bindSuburbDetails(
  feature: Feature,
  layer: Layer,
  selectSuburb: (feature: Feature) => SuburbPoint | null,
) {
  const name = document.createElement('strong');
  name.textContent = String(feature.properties?.suburbname ?? 'Unnamed suburb');
  const count = getLocationCount(feature);
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const locations = document.createElement('p');
    locations.textContent = `${count} ${count === 1 ? 'location' : 'locations'}`;
    const tooltip = document.createElement('div');
    tooltip.append(name.cloneNode(true), locations);
    layer.bindTooltip(tooltip, { sticky: true });
  }

  const popup = document.createElement('div');
  popup.append(name);

  const connects = Array.isArray(feature.properties?.connects)
    ? (feature.properties.connects as ConnectSummary[])
    : [];
  if (connects.length) {
    const list = document.createElement('ul');
    list.className = 'connect-list';
    list.setAttribute('aria-label', 'Connects');
    for (const connect of connects) {
      const item = document.createElement('li');
      const connectName = document.createElement('span');
      connectName.className = 'connect-name';
      connectName.textContent = connect.name;
      item.append(connectName);
      const knownDemographics = getKnownDemographics(connect.demographics);
      if (knownDemographics.length) {
        const demographics = document.createElement('span');
        demographics.className = 'connect-demographics';
        demographics.textContent = knownDemographics.join(', ');
        item.append(demographics);
      }
      list.append(item);
    }
    popup.append(list);
  } else if (count === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = 'No connects in this suburb.';
    popup.append(emptyMessage);
  }

  layer.bindPopup(popup, {
    minWidth: 240,
    maxWidth: 300,
    maxHeight: 260,
    autoPan: false,
  });
  layer.on('click', () => {
    const point = selectSuburb(feature);
    if (point) layer.getPopup()?.setLatLng([point.latitude, point.longitude]);
  });
}

export default function SuburbLayer() {
  const map = useMap();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selection, setSelection] = useState<SuburbSelection | null>(null);

  function selectSuburb(
    feature: Feature,
    fitCircle = false,
  ): SuburbPoint | null {
    const point = calculateSuburbPoint(feature);
    if (!point) return null;
    setSelection({ feature, point, fitCircle });
    return point;
  }

  function clearSelection() {
    setSelection(null);
    map.closePopup();
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadSuburbs() {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL.replace(/\/$/, '')}/suburbs.geojson`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Suburb request failed.');

        const collection = (await response.json()) as FeatureCollection;
        if (
          collection.type !== 'FeatureCollection' ||
          !Array.isArray(collection.features)
        ) {
          throw new Error('Invalid suburb collection.');
        }

        if (!controller.signal.aborted) {
          setState({ status: 'loaded', collection });
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    }

    void loadSuburbs();
    return () => controller.abort();
  }, []);

  const suburbsWithLocations =
    state.status === 'loaded'
      ? state.collection.features.filter(
          (feature) => getLocationCount(feature) > 0,
        ).length
      : 0;

  return (
    <>
      {state.status === 'loaded' && (
        <>
          <GeoJSON
            data={state.collection}
            style={getSuburbStyle}
            onEachFeature={(feature, layer) =>
              bindSuburbDetails(feature, layer, selectSuburb)
            }
          />
          <SuburbRadius selection={selection} />
          <SuburbSearch
            collection={state.collection}
            selection={selection}
            onSelect={(feature) => selectSuburb(feature, true) !== null}
            onClear={clearSelection}
          />
        </>
      )}
      <div className="suburb-status">
        <div
          role={state.status === 'error' ? 'alert' : 'status'}
          aria-label="Suburb boundaries"
        >
          {state.status === 'loading' && 'Loading suburb boundaries…'}
          {state.status === 'loaded' &&
            `${state.collection.features.length} suburbs loaded`}
          {state.status === 'error' &&
            'Suburb boundaries unavailable. Refresh to retry.'}
        </div>
        {state.status === 'loaded' && (
          <>
            <p
              className="suburb-location-count"
              aria-label="Suburbs with locations"
            >
              {suburbsWithLocations}{' '}
              {suburbsWithLocations === 1 ? 'suburb' : 'suburbs'} with locations
            </p>
            <p className="suburb-legend">
              <span aria-hidden="true" /> Amber: has locations
            </p>
          </>
        )}
      </div>
    </>
  );
}
