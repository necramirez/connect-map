import type { LatLngTuple } from 'leaflet';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import SuburbLayer from './SuburbLayer';

const initialCenter: LatLngTuple = [-33.83309432488723, 151.0593508934678];
const initialZoom = 12;

export default function MapView() {
  return (
    <section className="map-frame" aria-label="Interactive map">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="map"
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <SuburbLayer />
      </MapContainer>
    </section>
  );
}
