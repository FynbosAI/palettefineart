import React, { useState, useEffect, useRef, useMemo } from 'react';

// Extend Window interface to include Leaflet
declare global {
  interface Window {
    L: any;
  }
}

// Type definitions
interface Coordinates {
  lat: number;
  lng: number;
  name: string;
}

interface RouteCoordinateInput {
  lat: number | string;
  lng: number | string;
  name?: string | null;
}

interface RouteMapProps {
  origin?: string;
  destination?: string;
  originCoordinates?: RouteCoordinateInput | null;
  destinationCoordinates?: RouteCoordinateInput | null;
  allowGeocoding?: boolean;
}

const normalizeCoordinateInput = (
  input: RouteCoordinateInput | null | undefined,
  fallbackLabel: string,
  defaultLabel: string
): Coordinates | null => {
  if (!input) {
    return null;
  }

  const parse = (value: number | string): number => {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const lat = parse(input.lat);
  const lng = parse(input.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const label = (input.name || fallbackLabel || defaultLabel || '').toString().trim();

  return {
    lat,
    lng,
    name: label || defaultLabel,
  };
};

const RouteMap: React.FC<RouteMapProps> = ({
  origin = '',
  destination = '',
  originCoordinates = null,
  destinationCoordinates = null,
  allowGeocoding = true,
}) => {
  const [map, setMap] = useState<any>(null);
  const [startCoords, setStartCoords] = useState<Coordinates | null>(null);
  const [destCoords, setDestCoords] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string>('');
  
  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const routeRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(false);

  // Initialize Leaflet
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    let isMounted = true;
    
    const loadLeaflet = async () => {
      // Load CSS first
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      cssLink.crossOrigin = '';
      document.head.appendChild(cssLink);

      // Wait for CSS to load
      await new Promise(resolve => {
        cssLink.onload = resolve;
        cssLink.onerror = resolve;
      });

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      
      script.onload = () => {
        if (isMounted) {
          setLeafletLoaded(true);
        }
      };
      
      script.onerror = () => {
        if (isMounted) {
          setError('Failed to load map library. Please refresh the page.');
        }
      };
      
      document.head.appendChild(script);
    };

    loadLeaflet();

    return () => {
      isMounted = false;
      if (map) {
        try {
          map.remove();
        } catch (e) {
          console.warn('Error removing map:', e);
        }
      }
    };
  }, []);

  // Initialize map when Leaflet is loaded
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    if (leafletLoaded && window.L && mapRef.current && !map) {
      try {
        // Fix Leaflet default marker icons
        delete window.L.Icon.Default.prototype._getIconUrl;
        window.L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        // Default to New York
        const leafletMap = window.L.map(mapRef.current, {
          center: [40.7128, -74.0060], // New York coordinates
          zoom: 10,
          maxZoom: 18,
          minZoom: 2,
          zoomControl: true,
          scrollWheelZoom: true
        });
        
        // Use CartoDB Light for a clean, minimal look
        window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap contributors © CARTO',
          maxZoom: 19,
          subdomains: 'abcd'
        }).addTo(leafletMap);

        setMap(leafletMap);
      } catch (error) {
        console.error('Error initializing map:', error);
        setError('Failed to initialize map. Please refresh the page.');
      }
    }
  }, [leafletLoaded, map]);

  // Fallback coordinates for common locations
  const commonLocations: Record<string, Coordinates> = {
    'new york': { lat: 40.7128, lng: -74.0060, name: 'New York, NY, USA' },
    'los angeles': { lat: 34.0522, lng: -118.2437, name: 'Los Angeles, CA, USA' },
    'chicago': { lat: 41.8781, lng: -87.6298, name: 'Chicago, IL, USA' },
    'houston': { lat: 29.7604, lng: -95.3698, name: 'Houston, TX, USA' },
    'philadelphia': { lat: 39.9526, lng: -75.1652, name: 'Philadelphia, PA, USA' },
    'phoenix': { lat: 33.4484, lng: -112.0740, name: 'Phoenix, AZ, USA' },
    'san antonio': { lat: 29.4241, lng: -98.4936, name: 'San Antonio, TX, USA' },
    'san diego': { lat: 32.7157, lng: -117.1611, name: 'San Diego, CA, USA' },
    'dallas': { lat: 32.7767, lng: -96.7970, name: 'Dallas, TX, USA' },
    'san jose': { lat: 37.3382, lng: -121.8863, name: 'San Jose, CA, USA' },
    'london': { lat: 51.5074, lng: -0.1278, name: 'London, UK' },
    'paris': { lat: 48.8566, lng: 2.3522, name: 'Paris, France' },
    'tokyo': { lat: 35.6762, lng: 139.6503, name: 'Tokyo, Japan' },
    'sydney': { lat: -33.8688, lng: 151.2093, name: 'Sydney, Australia' },
    'berlin': { lat: 52.5200, lng: 13.4050, name: 'Berlin, Germany' },
    'moscow': { lat: 55.7558, lng: 37.6176, name: 'Moscow, Russia' },
    'beijing': { lat: 39.9042, lng: 116.4074, name: 'Beijing, China' }
  };

  const validateCoordinates = (coords: Coordinates | null): coords is Coordinates => {
    return coords !== null && 
           typeof coords.lat === 'number' && 
           typeof coords.lng === 'number' && 
           !isNaN(coords.lat) && 
           !isNaN(coords.lng) &&
           coords.lat >= -90 && coords.lat <= 90 &&
           coords.lng >= -180 && coords.lng <= 180;
  };

  const geocodeLocation = async (location: string): Promise<Coordinates> => {
    const searchTerm = location.toLowerCase().trim();
    
    if (commonLocations[searchTerm]) {
      console.log('Using built-in coordinates for:', searchTerm);
      return commonLocations[searchTerm];
    }
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
        {
          // No custom headers; browsers forbid overriding User-Agent
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const coords: Coordinates = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          name: data[0].display_name
        };
        
        if (validateCoordinates(coords)) {
          return coords;
        }
      }
    } catch (err) {
      console.warn('Geocoding failed:', err);
    }
    
    throw new Error(`Could not find "${location}". Try common city names like: ${Object.keys(commonLocations).slice(0, 5).join(', ')}`);
  };

  const addMarker = (coords: Coordinates, title: string, popupText: string) => {
    if (!map || !validateCoordinates(coords)) return null;
    
    try {
      // Create custom icons for origin and destination
      const isOrigin = title === 'start';
      const iconColor = isOrigin ? '#10B981' : '#EF4444'; // Green for origin, Red for destination
      const iconHtml = `
        <div style="
          background-color: ${iconColor};
          width: 24px;
          height: 24px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            color: white;
            font-weight: bold;
            font-size: 12px;
            transform: rotate(45deg);
          ">${isOrigin ? 'A' : 'B'}</div>
        </div>
      `;
      
      const customIcon = window.L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24]
      });

      const marker = window.L.marker([coords.lat, coords.lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(popupText, {
          className: 'custom-popup'
        });
      
      (marker as any)._customTitle = title;
      return marker;
    } catch (error) {
      console.error('Error adding marker:', error);
      return null;
    }
  };

  const removeMarkerByTitle = (title: string) => {
    markersRef.current = markersRef.current.filter(marker => {
      if ((marker as any)._customTitle === title) {
        try {
          if (map) {
            map.removeLayer(marker);
          }
        } catch (e) {
          console.warn('Error removing marker:', e);
        }
        return false;
      }
      return true;
    });
  };

  const geocodeAndSetLocation = async (location: string, isDestination = false) => {
    if (!location.trim() || !map) return;
    
    setError('');
    
    try {
      const coords = await geocodeLocation(location);
      
      if (!validateCoordinates(coords)) {
        throw new Error('Invalid coordinates received');
      }
      
      if (isDestination) {
        setDestCoords(coords);
        removeMarkerByTitle('destination');
        const marker = addMarker(coords, 'destination', `Destination: ${coords.name}`);
        if (marker) {
          markersRef.current.push(marker);
        }
      } else {
        setStartCoords(coords);
        removeMarkerByTitle('start');
        const marker = addMarker(coords, 'start', `Start: ${coords.name}`);
        if (marker) {
          markersRef.current.push(marker);
        }
      }
      
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createRoute = () => {
    if (!map || !validateCoordinates(startCoords) || !validateCoordinates(destCoords)) {
      return;
    }
    
    try {
      if (routeRef.current) {
        map.removeLayer(routeRef.current);
        routeRef.current = null;
      }
      
      const latlngs = [
        [startCoords.lat, startCoords.lng],
        [destCoords.lat, destCoords.lng]
      ];
      
      // Create a gradient-style trip line
      const polyline = window.L.polyline(latlngs, {
        color: '#6366F1', // Modern indigo color
        weight: 5,
        opacity: 0.9,
        smoothFactor: 1,
        dashArray: '10, 5', // Dashed line for better visual appeal
        lineCap: 'round',
        lineJoin: 'round'
      });
      
      polyline.addTo(map);
      routeRef.current = polyline;
      
      // Improve auto-zoom with better padding and constraints
      setTimeout(() => {
        try {
          const group = window.L.featureGroup([...markersRef.current, polyline]);
          const bounds = group.getBounds();
          
          // Calculate padding based on map size for better responsive behavior
          const mapSize = map.getSize();
          const paddingX = Math.max(mapSize.x * 0.15, 40); // 15% padding or minimum 40px
          const paddingY = Math.max(mapSize.y * 0.15, 40);
          
          map.fitBounds(bounds, { 
            padding: [paddingX, paddingY],
            maxZoom: 12, // Increased max zoom for better detail
            animate: true,
            duration: 1.0
          });
        } catch (e) {
          console.warn('Error fitting bounds:', e);
        }
      }, 300);
      
    } catch (error) {
      console.error('Error creating route:', error);
    }
  };

  const normalizedOrigin = useMemo(
    () => normalizeCoordinateInput(originCoordinates, origin, 'Origin'),
    [originCoordinates, origin]
  );

  const normalizedDestination = useMemo(
    () => normalizeCoordinateInput(destinationCoordinates, destination, 'Destination'),
    [destinationCoordinates, destination]
  );

  useEffect(() => {
    if (!allowGeocoding) {
      const hasOrigin = typeof origin === 'string' && origin.trim().length > 0;
      const hasDestination = typeof destination === 'string' && destination.trim().length > 0;
      const missingOrigin = hasOrigin && !normalizedOrigin;
      const missingDestination = hasDestination && !normalizedDestination;

      if (missingOrigin || missingDestination) {
        const parts = [];
        if (missingOrigin) parts.push('origin');
        if (missingDestination) parts.push('destination');
        setError(`Map unavailable: missing ${parts.join(' and ')} coordinates.`);
      } else {
        setError('');
      }
    }
  }, [allowGeocoding, normalizedOrigin, normalizedDestination, origin, destination]);

  useEffect(() => {
    if (!map) {
      return;
    }

    if (normalizedOrigin) {
      setStartCoords(normalizedOrigin);
      removeMarkerByTitle('start');
      const marker = addMarker(normalizedOrigin, 'start', `Start: ${normalizedOrigin.name}`);
      if (marker) {
        markersRef.current.push(marker);
      }
      if (!allowGeocoding) {
        setError('');
      }
    } else {
      removeMarkerByTitle('start');
      setStartCoords(null);
      if (allowGeocoding && origin) {
        geocodeAndSetLocation(origin, false);
      }
    }
  }, [map, normalizedOrigin, origin, allowGeocoding]);

  useEffect(() => {
    if (!map) {
      return;
    }

    if (normalizedDestination) {
      setDestCoords(normalizedDestination);
      removeMarkerByTitle('destination');
      const marker = addMarker(normalizedDestination, 'destination', `Destination: ${normalizedDestination.name}`);
      if (marker) {
        markersRef.current.push(marker);
      }
      if (!allowGeocoding) {
        setError('');
      }
    } else {
      removeMarkerByTitle('destination');
      setDestCoords(null);
      if (allowGeocoding && destination) {
        geocodeAndSetLocation(destination, true);
      }
    }
  }, [map, normalizedDestination, destination, allowGeocoding]);

  // Create route when both locations are set
  useEffect(() => {
    if (validateCoordinates(startCoords) && validateCoordinates(destCoords) && map) {
      const timer = setTimeout(createRoute, 300);
      return () => clearTimeout(timer);
    }
  }, [startCoords, destCoords, map]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {/* Clean map container */}
      <div 
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          borderRadius: '10px',
          overflow: 'hidden'
        }}
      />
      
      {/* Loading overlay */}
      {!map && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: '10px'
          }}
        >
          <div style={{ textAlign: 'center', color: '#6b7280' }}>
            <div style={{ 
              width: '32px', 
              height: '32px', 
              border: '3px solid #e5e7eb',
              borderTop: '3px solid #6366f1',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 12px'
            }} />
            <div style={{ 
              fontSize: '14px', 
              fontWeight: '500',
              fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
            }}>
              {leafletLoaded ? 'Initializing map...' : 'Loading map...'}
            </div>
          </div>
        </div>
      )}
      
      {/* Error display - minimal and clean */}
      {error && (
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          right: '12px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '12px',
          color: '#dc2626',
          zIndex: 1000
        }}>
          {error}
        </div>
      )}
      
      {/* Route info - seamless with card styling */}
      {startCoords && destCoords && !error && (
        <div style={{
          position: 'absolute',
          bottom: '0px',
          left: '0px',
          right: '0px',
          backgroundColor: '#ffffff',
          borderRadius: '0 0 10px 10px',
          padding: '8px 16px',
          fontSize: '11px',
          fontWeight: '500',
          color: '#374151',
          zIndex: 1001,
          textAlign: 'center',
          fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
          <span style={{ color: '#10B981' }}>A</span> {startCoords.name.split(',')[0]} → <span style={{ color: '#EF4444' }}>B</span> {destCoords.name.split(',')[0]}
        </div>
      )}
      
      <style>{`
        @font-face {
          font-family: 'Fractul';
          src: url('/Web/Fractul/Fractul-Medium.woff2') format('woff2'),
               url('/Web/Fractul/Fractul-Medium.woff') format('woff');
          font-weight: 500;
          font-style: normal;
          font-display: swap;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .custom-marker {
          border: none !important;
          background: none !important;
          font-family: 'Fractul', -apple-system, BlinkMacSystemFont, sans-serif !important;
        }
        
        .custom-popup .leaflet-popup-content-wrapper {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(8px);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.2);
          font-family: 'Fractul', -apple-system, BlinkMacSystemFont, sans-serif !important;
        }
        
        .custom-popup .leaflet-popup-content {
          margin: 12px 16px;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          font-family: 'Fractul', -apple-system, BlinkMacSystemFont, sans-serif !important;
        }
        
        .custom-popup .leaflet-popup-tip {
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-top: none;
          border-right: none;
        }
        
        /* Hide Leaflet attribution to keep clean look */
        .leaflet-control-attribution {
          display: none !important;
        }
        
        /* Apply Fractul font to all map controls and text */
        .leaflet-container {
          font-family: 'Fractul', -apple-system, BlinkMacSystemFont, sans-serif !important;
        }
        
        .leaflet-control-zoom a {
          font-family: 'Fractul', -apple-system, BlinkMacSystemFont, sans-serif !important;
        }
      `}</style>
    </div>
  );
};

export default RouteMap;
