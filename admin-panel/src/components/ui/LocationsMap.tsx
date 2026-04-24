"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Location } from "@/lib/api";

const JORDAN_CENTER: [number, number] = [31.18, 36.8];
const JORDAN_ZOOM = 7;

// Hard bounds — user cannot pan outside Jordan
const JORDAN_BOUNDS: LatLngBoundsExpression = [
  [29.0, 34.8],   // SW
  [33.4, 39.4],   // NE
];

function FitBounds({ locations, isFiltered }: { locations: Location[]; isFiltered: boolean }) {
  const map = useMap();
  useEffect(() => {
    // Default view — show all of Jordan
    if (!isFiltered || locations.length === 0) {
      map.fitBounds(JORDAN_BOUNDS, { animate: true });
      return;
    }
    // Filtered — zoom to matching pins
    const latlngs = locations
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((l) => [l.latitude, l.longitude] as [number, number]);
    if (latlngs.length > 0) {
      map.fitBounds(latlngs, { padding: [56, 56], maxZoom: 14, animate: true });
    }
  }, [locations, isFiltered, map]);
  return null;
}

interface LocationsMapProps {
  locations: Location[];
  isFiltered: boolean;
  theme: "dark" | "light";
}

export function LocationsMap({ locations, isFiltered, theme }: LocationsMapProps) {
  const tileUrl = theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  return (
    <MapContainer
      center={JORDAN_CENTER}
      zoom={JORDAN_ZOOM}
      minZoom={6}
      maxZoom={18}
      maxBounds={JORDAN_BOUNDS}
      maxBoundsViscosity={1.0}
      scrollWheelZoom
      style={{ height: 380, width: "100%", borderRadius: 12 }}
    >
      <TileLayer
        key={tileUrl}
        url={tileUrl}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <FitBounds locations={locations} isFiltered={isFiltered} />
      {locations.map((loc) => (
        <CircleMarker
          key={loc.id}
          center={[loc.latitude, loc.longitude]}
          radius={7}
          pathOptions={{
            fillColor: loc.is_verified ? "#800000" : "#B33838",
            fillOpacity: 0.9,
            color: "#fff",
            weight: 1.5,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={1}>
            <span style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 600 }}>
              {loc.name}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
