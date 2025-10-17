/**
 * Geocoding utility for converting city names to coordinates
 */

export interface GeocodedLocation {
  lat: number;
  lng: number;
  displayName: string;
  city?: string;
  country?: string;
  countryCode?: string;
}

// Cache for geocoded results to avoid repeated API calls
const geocodeCache = new Map<string, GeocodedLocation>();

// Common locations with pre-defined coordinates for better performance
const commonLocations: Record<string, GeocodedLocation> = {
  'new york': { lat: 40.7128, lng: -74.0060, displayName: 'New York, NY, USA', city: 'New York', country: 'United States', countryCode: 'US' },
  'los angeles': { lat: 34.0522, lng: -118.2437, displayName: 'Los Angeles, CA, USA', city: 'Los Angeles', country: 'United States', countryCode: 'US' },
  'chicago': { lat: 41.8781, lng: -87.6298, displayName: 'Chicago, IL, USA', city: 'Chicago', country: 'United States', countryCode: 'US' },
  'houston': { lat: 29.7604, lng: -95.3698, displayName: 'Houston, TX, USA', city: 'Houston', country: 'United States', countryCode: 'US' },
  'philadelphia': { lat: 39.9526, lng: -75.1652, displayName: 'Philadelphia, PA, USA', city: 'Philadelphia', country: 'United States', countryCode: 'US' },
  'phoenix': { lat: 33.4484, lng: -112.0740, displayName: 'Phoenix, AZ, USA', city: 'Phoenix', country: 'United States', countryCode: 'US' },
  'san antonio': { lat: 29.4241, lng: -98.4936, displayName: 'San Antonio, TX, USA', city: 'San Antonio', country: 'United States', countryCode: 'US' },
  'san diego': { lat: 32.7157, lng: -117.1611, displayName: 'San Diego, CA, USA', city: 'San Diego', country: 'United States', countryCode: 'US' },
  'dallas': { lat: 32.7767, lng: -96.7970, displayName: 'Dallas, TX, USA', city: 'Dallas', country: 'United States', countryCode: 'US' },
  'san jose': { lat: 37.3382, lng: -121.8863, displayName: 'San Jose, CA, USA', city: 'San Jose', country: 'United States', countryCode: 'US' },
  'san francisco': { lat: 37.7749, lng: -122.4194, displayName: 'San Francisco, CA, USA', city: 'San Francisco', country: 'United States', countryCode: 'US' },
  'boston': { lat: 42.3601, lng: -71.0589, displayName: 'Boston, MA, USA', city: 'Boston', country: 'United States', countryCode: 'US' },
  'miami': { lat: 25.7617, lng: -80.1918, displayName: 'Miami, FL, USA', city: 'Miami', country: 'United States', countryCode: 'US' },
  'washington': { lat: 38.9072, lng: -77.0369, displayName: 'Washington, DC, USA', city: 'Washington', country: 'United States', countryCode: 'US' },
  'seattle': { lat: 47.6062, lng: -122.3321, displayName: 'Seattle, WA, USA', city: 'Seattle', country: 'United States', countryCode: 'US' },
  'london': { lat: 51.5074, lng: -0.1278, displayName: 'London, UK', city: 'London', country: 'United Kingdom', countryCode: 'GB' },
  'paris': { lat: 48.8566, lng: 2.3522, displayName: 'Paris, France', city: 'Paris', country: 'France', countryCode: 'FR' },
  'tokyo': { lat: 35.6762, lng: 139.6503, displayName: 'Tokyo, Japan', city: 'Tokyo', country: 'Japan', countryCode: 'JP' },
  'sydney': { lat: -33.8688, lng: 151.2093, displayName: 'Sydney, Australia', city: 'Sydney', country: 'Australia', countryCode: 'AU' },
  'berlin': { lat: 52.5200, lng: 13.4050, displayName: 'Berlin, Germany', city: 'Berlin', country: 'Germany', countryCode: 'DE' },
  'moscow': { lat: 55.7558, lng: 37.6176, displayName: 'Moscow, Russia', city: 'Moscow', country: 'Russia', countryCode: 'RU' },
  'beijing': { lat: 39.9042, lng: 116.4074, displayName: 'Beijing, China', city: 'Beijing', country: 'China', countryCode: 'CN' },
  'hong kong': { lat: 22.3193, lng: 114.1694, displayName: 'Hong Kong', city: 'Hong Kong', country: 'Hong Kong', countryCode: 'HK' },
  'zurich': { lat: 47.3769, lng: 8.5417, displayName: 'Zurich, Switzerland', city: 'Zurich', country: 'Switzerland', countryCode: 'CH' },
  'geneva': { lat: 46.2044, lng: 6.1432, displayName: 'Geneva, Switzerland', city: 'Geneva', country: 'Switzerland', countryCode: 'CH' },
  'amsterdam': { lat: 52.3676, lng: 4.9041, displayName: 'Amsterdam, Netherlands', city: 'Amsterdam', country: 'Netherlands', countryCode: 'NL' },
  'brussels': { lat: 50.8503, lng: 4.3517, displayName: 'Brussels, Belgium', city: 'Brussels', country: 'Belgium', countryCode: 'BE' },
  'vienna': { lat: 48.2082, lng: 16.3738, displayName: 'Vienna, Austria', city: 'Vienna', country: 'Austria', countryCode: 'AT' },
  'dubai': { lat: 25.2048, lng: 55.2708, displayName: 'Dubai, UAE', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE' },
  'singapore': { lat: 1.3521, lng: 103.8198, displayName: 'Singapore', city: 'Singapore', country: 'Singapore', countryCode: 'SG' },
  'shanghai': { lat: 31.2304, lng: 121.4737, displayName: 'Shanghai, China', city: 'Shanghai', country: 'China', countryCode: 'CN' },
  'mumbai': { lat: 19.0760, lng: 72.8777, displayName: 'Mumbai, India', city: 'Mumbai', country: 'India', countryCode: 'IN' },
  'toronto': { lat: 43.6532, lng: -79.3832, displayName: 'Toronto, Canada', city: 'Toronto', country: 'Canada', countryCode: 'CA' },
  'montreal': { lat: 45.5017, lng: -73.5673, displayName: 'Montreal, Canada', city: 'Montreal', country: 'Canada', countryCode: 'CA' },
  'vancouver': { lat: 49.2827, lng: -123.1207, displayName: 'Vancouver, Canada', city: 'Vancouver', country: 'Canada', countryCode: 'CA' },
  'mexico city': { lat: 19.4326, lng: -99.1332, displayName: 'Mexico City, Mexico', city: 'Mexico City', country: 'Mexico', countryCode: 'MX' },
  'buenos aires': { lat: -34.6037, lng: -58.3816, displayName: 'Buenos Aires, Argentina', city: 'Buenos Aires', country: 'Argentina', countryCode: 'AR' },
  'sao paulo': { lat: -23.5505, lng: -46.6333, displayName: 'São Paulo, Brazil', city: 'São Paulo', country: 'Brazil', countryCode: 'BR' },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729, displayName: 'Rio de Janeiro, Brazil', city: 'Rio de Janeiro', country: 'Brazil', countryCode: 'BR' },
  'madrid': { lat: 40.4168, lng: -3.7038, displayName: 'Madrid, Spain', city: 'Madrid', country: 'Spain', countryCode: 'ES' },
  'barcelona': { lat: 41.3851, lng: 2.1734, displayName: 'Barcelona, Spain', city: 'Barcelona', country: 'Spain', countryCode: 'ES' },
  'rome': { lat: 41.9028, lng: 12.4964, displayName: 'Rome, Italy', city: 'Rome', country: 'Italy', countryCode: 'IT' },
  'milan': { lat: 45.4642, lng: 9.1900, displayName: 'Milan, Italy', city: 'Milan', country: 'Italy', countryCode: 'IT' },
  'florence': { lat: 43.7696, lng: 11.2558, displayName: 'Florence, Italy', city: 'Florence', country: 'Italy', countryCode: 'IT' },
  'venice': { lat: 45.4408, lng: 12.3155, displayName: 'Venice, Italy', city: 'Venice', country: 'Italy', countryCode: 'IT' }
};

/**
 * Validate coordinates to ensure they're within valid ranges
 */
export function validateCoordinates(coords: { lat: number; lng: number }): boolean {
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    !isNaN(coords.lat) &&
    !isNaN(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

/**
 * Geocode a location string to coordinates
 * @param location - City name or address to geocode
 * @returns Promise with geocoded location or null if failed
 */
export async function geocodeLocation(location: string): Promise<GeocodedLocation | null> {
  if (!location || typeof location !== 'string') {
    console.warn('Invalid location provided to geocode:', location);
    return null;
  }

  const searchTerm = location.toLowerCase().trim();

  // Check cache first
  if (geocodeCache.has(searchTerm)) {
    return geocodeCache.get(searchTerm)!;
  }

  // Check common locations
  if (commonLocations[searchTerm]) {
    const result = commonLocations[searchTerm];
    geocodeCache.set(searchTerm, result);
    return result;
  }

  try {
    // Use Nominatim OpenStreetMap API
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1&addressdetails=1`
    );

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      const geocoded: GeocodedLocation = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        city: result.address?.city || result.address?.town || result.address?.village || location,
        country: result.address?.country || '',
        countryCode: result.address?.country_code?.toUpperCase() || 'XX'
      };

      // Validate coordinates
      if (!validateCoordinates(geocoded)) {
        console.error('Invalid coordinates received from geocoding:', geocoded);
        return null;
      }

      // Cache the result
      geocodeCache.set(searchTerm, geocoded);
      return geocoded;
    }
  } catch (error) {
    console.error('Geocoding error for location:', location, error);
  }

  return null;
}

/**
 * Batch geocode multiple locations
 * @param locations - Array of location strings
 * @returns Promise with array of geocoded locations (null for failed ones)
 */
export async function batchGeocodeLocations(
  locations: string[]
): Promise<(GeocodedLocation | null)[]> {
  // Process in batches to avoid overwhelming the API
  const batchSize = 5;
  const results: (GeocodedLocation | null)[] = [];

  for (let i = 0; i < locations.length; i += batchSize) {
    const batch = locations.slice(i, i + batchSize);
    const batchPromises = batch.map(location => geocodeLocation(location));
    
    // Add a small delay between batches to respect API rate limits
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Clear the geocoding cache
 */
export function clearGeocodeCache(): void {
  geocodeCache.clear();
}
