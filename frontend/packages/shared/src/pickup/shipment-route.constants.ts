/** WeYell Sandton warehouse — default SA origin for corridor maps. */
export const WEYELL_SA_ORIGIN = { lat: -26.1076, lng: 28.0567, label: 'Sandton, South Africa' };

/** Default Eswatini destination when customer pickup branch is unknown. */
export const WEYELL_SZ_DESTINATION = {
  lat: -26.3197,
  lng: 31.1345,
  label: 'Mbabane, Eswatini',
};

export interface MapLatLng {
  lat: number;
  lng: number;
  label?: string;
}

/** Linear interpolate a point along the origin→destination corridor. */
export function corridorPoint(
  origin: MapLatLng,
  destination: MapLatLng,
  progress: number,
): MapLatLng {
  const t = Math.min(1, Math.max(0, progress));
  return {
    lat: origin.lat + (destination.lat - origin.lat) * t,
    lng: origin.lng + (destination.lng - origin.lng) * t,
  };
}
