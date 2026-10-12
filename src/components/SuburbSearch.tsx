import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import { DomEvent, Tooltip } from 'leaflet';
import { useMap } from 'react-leaflet';
import { findMatchingSuburbs, getSuburbName } from '../lib/suburbSearch';
import type { SuburbSelection } from '../lib/suburbPoint';

export default function SuburbSearch({
  collection,
  selection,
  onSelect,
  onClear,
}: {
  collection: FeatureCollection;
  selection: SuburbSelection | null;
  onSelect: (feature: Feature) => boolean;
  onClear: () => void;
}) {
  const map = useMap();
  const container = useRef<HTMLDivElement>(null);
  const identifier = useId();
  const inputIdentifier = `${identifier}-input`;
  const resultsIdentifier = `${identifier}-results`;
  const [queryState, setQueryState] = useState<{
    value: string;
    selection: SuburbSelection | null;
  }>({
    value: '',
    selection: null,
  });
  const query =
    queryState.selection === selection
      ? queryState.value
      : selection
        ? getSuburbName(selection.feature)
        : '';
  function setQuery(value: string) {
    setQueryState({ value, selection });
  }
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [message, setMessage] = useState('');
  const matches = findMatchingSuburbs(collection.features, query);
  const expanded = open && query.trim().length > 0;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    DomEvent.disableClickPropagation(element);
    DomEvent.disableScrollPropagation(element);
    return () => {
      DomEvent.off(element);
    };
  }, []);

  useEffect(() => {
    if (expanded && activeIndex >= 0) {
      document
        .getElementById(`${resultsIdentifier}-${activeIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, expanded, resultsIdentifier]);

  function selectSuburb(feature: Feature) {
    const name = getSuburbName(feature);
    if (!onSelect(feature)) {
      setMessage(`No map boundary is available for ${name}.`);
      return;
    }
    map.closePopup();
    map.eachLayer((layer) => {
      if (layer instanceof Tooltip) map.closeTooltip(layer);
    });
    setQuery(name);
    setOpen(false);
    setActiveIndex(-1);
    setMessage('');
    map.getContainer().focus({ preventScroll: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    } else if (matches.length && event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        current < matches.length - 1 ? current + 1 : 0,
      );
    } else if (matches.length && event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        current > 0 ? current - 1 : matches.length - 1,
      );
    } else if (expanded && event.key === 'Enter') {
      event.preventDefault();
      const feature = matches[activeIndex] ?? matches[0];
      if (feature) selectSuburb(feature);
    }
  }

  return (
    <div
      ref={container}
      className="suburb-search"
      role="search"
      aria-label="Suburb search"
      onKeyDown={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={inputIdentifier}>Search suburbs</label>
      <input
        id={inputIdentifier}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? resultsIdentifier : undefined}
        aria-activedescendant={
          expanded && activeIndex >= 0
            ? `${resultsIdentifier}-${activeIndex}`
            : undefined
        }
        autoComplete="off"
        placeholder="Enter a suburb name…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
          setMessage('');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {expanded && (
        <div className="suburb-search-dropdown">
          <ul
            id={resultsIdentifier}
            role="listbox"
            aria-label="Matching suburbs"
          >
            {matches.map((feature, index) => (
              <li key={getSuburbName(feature)} role="presentation">
                <button
                  id={`${resultsIdentifier}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  onClick={() => selectSuburb(feature)}
                >
                  {getSuburbName(feature)}
                </button>
              </li>
            ))}
          </ul>
          {!matches.length && <p role="status">No matching suburbs.</p>}
        </div>
      )}
      {selection && (
        <div
          className="selected-suburb"
          aria-label="Selected suburb"
          role="status"
        >
          <span>
            <strong>{getSuburbName(selection.feature)}</strong>
            <span className="selected-suburb-radius">
              10 km radius around suburb point
            </span>
          </span>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => {
              onClear();
              setQuery('');
              setOpen(false);
              setActiveIndex(-1);
              setMessage('Selection cleared.');
            }}
          >
            Clear
          </button>
        </div>
      )}
      {message && (
        <p className="suburb-search-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
