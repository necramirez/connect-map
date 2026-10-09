import {
  getKnownDemographics,
  summarizeConnect,
  type LocationRecord,
} from './suburbConnections';

export interface ConnectDetails {
  name: string;
  suburb: string;
  state: string;
  postcode: string;
  demographics: string[];
  schedule: string;
}

function displayValue(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).trim();
  return text && !['??', 'unknown'].includes(text.toLowerCase()) ? text : '';
}

export function summarizeConnectDetails(
  location: LocationRecord,
): ConnectDetails {
  const summary = summarizeConnect(location);
  const schedule = Array.isArray(location.schedule)
    ? location.schedule
    : [location.schedule];
  return {
    name: summary.name,
    suburb: displayValue(location.suburb),
    state: displayValue(location.state),
    postcode: displayValue(location.postcode),
    demographics: getKnownDemographics(summary.demographics),
    schedule: schedule.map(displayValue).filter(Boolean).join(' · '),
  };
}
