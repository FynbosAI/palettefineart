export interface LocationCoordinates {
  lat: number;
  lng: number;
  name?: string;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

/**
 * Attempt to extract latitude/longitude information from a Supabase location record.
 * Mirrors the graceful fallback strategy used in the Shipper app's Network page.
 */
export const extractLocationCoordinates = (location: any): LocationCoordinates | null => {
  if (!location) {
    return null;
  }

  const latCandidates: unknown[] = [
    location.latitude,
    location.lat,
    location.geo_latitude,
    location.geo_lat,
    location.geocode_latitude,
    location.geocode_lat,
  ];

  const lngCandidates: unknown[] = [
    location.longitude,
    location.lng,
    location.lon,
    location.geo_longitude,
    location.geo_lon,
    location.geocode_longitude,
    location.geocode_lon,
  ];

  let lat = latCandidates.map(toNumber).find((value): value is number => value !== null) ?? null;
  let lng = lngCandidates.map(toNumber).find((value): value is number => value !== null) ?? null;

  if ((lat === null || lng === null) && Array.isArray(location.coordinates)) {
    const [rawLng, rawLat] = location.coordinates;
    const arrayLat = toNumber(rawLat);
    const arrayLng = toNumber(rawLng);
    if (arrayLat !== null && lat === null) {
      lat = arrayLat;
    }
    if (arrayLng !== null && lng === null) {
      lng = arrayLng;
    }
  }

  if (lat === null || lng === null) {
    return null;
  }

  const name =
    location.address_full ||
    location.name ||
    location.display_name ||
    undefined;

  return { lat, lng, name };
};
