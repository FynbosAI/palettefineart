import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { CircularProgress, Alert, Button } from '@mui/material';
import { motion } from 'motion/react';
import { easeStandard, slideInLeft } from '../../lib/motion';
import { useBranchNetwork, useAuth } from '../../hooks/useStoreSelectors';
import { geocodeLocation, type GeocodedLocation } from '../../lib/geocoding';
import type { BranchNetworkEntry } from '../../services/BranchNetworkService';
import { useGeocodeSessionStore } from '../../store/useGeocodeSessionStore';
import { addressKeyFromBranch, buildBranchAddress } from '../../lib/address';

interface BranchMarker {
  entry: BranchNetworkEntry;
  location: GeocodedLocation;
}

const Network: React.FC = () => {
  const { branchNetwork, branchNetworkLoading, branchNetworkError, fetchBranchNetwork } = useBranchNetwork();
  const { logisticsPartner } = useAuth();

  const geocodesByOrgId = useGeocodeSessionStore((state) => state.geocodesByOrgId);
  const setGeocode = useGeocodeSessionStore((state) => state.setGeocode);
  const clearOrgGeocodes = useGeocodeSessionStore((state) => state.clearOrg);
  const cacheHydrated = useGeocodeSessionStore((state) => state.hydrated);
  const sessionOrgId = useMemo(() => {
    if (logisticsPartner?.id) {
      return logisticsPartner.id;
    }
    if (branchNetwork.length > 0) {
      return branchNetwork[0].companyOrgId;
    }
    return null;
  }, [logisticsPartner?.id, branchNetwork]);

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [geocodingMessage, setGeocodingMessage] = useState<string | null>(null);
  const [geocodes, setGeocodes] = useState<Record<string, GeocodedLocation>>({});
  const hasAnimatedRef = useRef(false);

  const motionInitial = hasAnimatedRef.current ? false : 'hidden';

  const slideInDown = {
    hidden: { opacity: 0, y: -24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeStandard } },
  } as const;

  useEffect(() => {
    fetchBranchNetwork();
  }, [fetchBranchNetwork]);

  useEffect(() => {
    if (!cacheHydrated || !sessionOrgId || branchNetwork.length === 0) {
      return;
    }

    const cachedEntries = geocodesByOrgId[sessionOrgId];
    if (!cachedEntries) {
      return;
    }

    const initial: Record<string, GeocodedLocation> = {};
    branchNetwork.forEach((branch) => {
      const cached = cachedEntries[branch.branchOrgId];
      if (cached && cached.status === 'success' && cached.location) {
        initial[branch.branchOrgId] = cached.location;
      }
    });

    if (Object.keys(initial).length > 0) {
      setGeocodes((prev) => ({ ...initial, ...prev }));
    }
  }, [branchNetwork, geocodesByOrgId, sessionOrgId, cacheHydrated]);

  const pendingBranches = useMemo(() => {
    if (!cacheHydrated || !sessionOrgId) {
      return [] as BranchNetworkEntry[];
    }

    const cached = geocodesByOrgId[sessionOrgId] ?? {};
    return branchNetwork.filter((branch) => {
      const address = buildBranchAddress(branch);
      if (!address) {
        return false;
      }
      const key = addressKeyFromBranch(branch);
      const cachedEntry = cached[branch.branchOrgId];
      return !cachedEntry || cachedEntry.addressKey !== key;
    });
  }, [branchNetwork, geocodesByOrgId, sessionOrgId, cacheHydrated]);

  useEffect(() => {
    if (!cacheHydrated || !sessionOrgId) {
      return;
    }

    if (pendingBranches.length === 0) {
      setGeocodingMessage(null);
      return;
    }

    let isCancelled = false;

    const run = async () => {
      setGeocodingMessage(`Geocoding branches: 0/${pendingBranches.length}`);

      for (let i = 0; i < pendingBranches.length; i += 1) {
        const branch = pendingBranches[i];
        const address = buildBranchAddress(branch);
        if (!address) {
          if (!isCancelled) {
            setGeocodingMessage(`Geocoding branches: ${i + 1}/${pendingBranches.length}`);
          }
          continue;
        }

        try {
          const geocode = await geocodeLocation(address);
          if (isCancelled) {
            return;
          }
          if (geocode) {
            setGeocodes((prev) => ({ ...prev, [branch.branchOrgId]: geocode }));
            setGeocode(sessionOrgId, branch.branchOrgId, {
              addressKey: addressKeyFromBranch(branch),
              location: geocode,
              status: 'success',
              cachedAt: Date.now(),
            });
          } else {
            setGeocode(sessionOrgId, branch.branchOrgId, {
              addressKey: addressKeyFromBranch(branch),
              location: null,
              status: 'failed',
              cachedAt: Date.now(),
            });
          }
        } catch (error) {
          console.warn('Failed to geocode branch address', address, error);
          setGeocode(sessionOrgId, branch.branchOrgId, {
            addressKey: addressKeyFromBranch(branch),
            location: null,
            status: 'failed',
            cachedAt: Date.now(),
          });
        }

        if (!isCancelled) {
          setGeocodingMessage(`Geocoding branches: ${i + 1}/${pendingBranches.length}`);
        }
      }

      if (!isCancelled) {
        setGeocodingMessage(null);
      }
    };

    run();

    return () => {
      isCancelled = true;
    };
  }, [pendingBranches, sessionOrgId, setGeocode, cacheHydrated]);

  const handleRefreshLocations = useCallback(() => {
    if (!sessionOrgId) {
      return;
    }

    clearOrgGeocodes(sessionOrgId);
    setGeocodes((prev) => {
      const next = { ...prev };
      branchNetwork.forEach((branch) => {
        if (next[branch.branchOrgId]) {
          delete next[branch.branchOrgId];
        }
      });
      return next;
    });
    setGeocodingMessage('Refreshing branch locations...');
  }, [branchNetwork, clearOrgGeocodes, sessionOrgId]);

  const sortedBranches = useMemo(() => (
    [...branchNetwork].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
  ), [branchNetwork]);

  const branchesWithGeo = useMemo(() => (
    branchNetwork.reduce<BranchMarker[]>((acc, entry) => {
      const location = geocodes[entry.branchOrgId];
      if (location) {
        acc.push({ entry, location });
      }
      return acc;
    }, [])
  ), [branchNetwork, geocodes]);

  const selectedBranch = useMemo(
    () => branchNetwork.find((branch) => branch.branchOrgId === selectedBranchId) || null,
    [branchNetwork, selectedBranchId]
  );

  const totalMembers = useMemo(
    () => branchNetwork.reduce((sum, branch) => sum + branch.members.length, 0),
    [branchNetwork]
  );

  const contactCount = useMemo(
    () => branchNetwork.filter((branch) => !!branch.contact).length,
    [branchNetwork]
  );

  const partnerWebsite = useMemo(() => {
    const website = logisticsPartner?.website;
    if (!website) return null;
    return website.startsWith('http://') || website.startsWith('https://')
      ? website
      : `https://${website}`;
  }, [logisticsPartner?.website]);

  const partnerWebsiteLabel = useMemo(() => {
    const website = logisticsPartner?.website;
    if (!website) return null;
    return website.replace(/^https?:\/\//i, '');
  }, [logisticsPartner?.website]);

  const coverageCount = useMemo(() => {
    const coverage = new Set<string>();
    branchNetwork.forEach((branch) => {
      const location = branch.location;
      if (location?.address_full) {
        const parts = location.address_full.split(',').map((part) => part.trim()).filter(Boolean);
        if (parts.length > 0) {
          coverage.add(parts[parts.length - 1].toLowerCase());
        }
      } else if (location?.name) {
        coverage.add(location.name.toLowerCase());
      }
    });
    return coverage.size;
  }, [branchNetwork]);

  const handleBranchSelect = useCallback((branchId: string) => {
    setSelectedBranchId(branchId);
  }, []);

  const showLoader = (branchNetworkLoading && branchNetwork.length === 0) || (branchNetwork.length > 0 && branchesWithGeo.length === 0 && geocodingMessage !== null);

  if (showLoader) {
    return (
      <div className="main-wrap">
        <div className="main-panel">
          <div className="full-height-center">
            <CircularProgress sx={{ color: '#00AAAB' }} />
            {geocodingMessage && (
              <p className="helper-text">{geocodingMessage}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (branchNetworkError) {
    return (
      <div className="main-wrap">
        <div className="main-panel">
          <Alert severity="error" className="panel-alert">
            {branchNetworkError}
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <motion.div
          className="header"
          initial={motionInitial as any}
          animate="show"
          variants={slideInLeft}
          style={{ willChange: 'transform' }}
          onAnimationComplete={() => { hasAnimatedRef.current = true; }}
        >
          <div className="header-row">
            <h1 className="header-title">Network</h1>
          </div>
          <p className="header-subtitle">
            {logisticsPartner?.name
              ? `Explore ${logisticsPartner.name}'s branch contacts`
              : 'Explore your branch network contacts'}
          </p>
        </motion.div>

        <motion.div
          className="network-container"
          initial={motionInitial as any}
          animate="show"
          variants={slideInDown}
          style={{ willChange: 'transform' }}
          onAnimationComplete={() => { hasAnimatedRef.current = true; }}
        >
          <div className="network-map-card">
            <div className="map-header">
              <PublicOutlinedIcon sx={{ color: '#6366F1', fontSize: 20 }} />
              <h3>Branch Coverage</h3>
              <Button
                variant="outlined"
                size="small"
                sx={{ marginLeft: 'auto' }}
                onClick={handleRefreshLocations}
                disabled={!sessionOrgId}
              >
                Refresh locations
              </Button>
            </div>
            <div className="map-container">
              <NetworkMap
                branches={branchesWithGeo}
                selectedBranchId={selectedBranchId}
                onBranchClick={handleBranchSelect}
              />
            </div>
            {(geocodingMessage || branchNetworkLoading) && (
              <div className="helper-text" style={{ marginTop: '12px' }}>
                {geocodingMessage || 'Refreshing branch network…'}
              </div>
            )}
            <div className="map-legend">
              <div className="legend-item">
                <div className="legend-dot active"></div>
                <span>Branches with location data</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot"></div>
                <span>Click a marker to view branch details</span>
              </div>
            </div>
          </div>

          <div className="network-stats">
            <div className="stat-card">
              <BusinessOutlinedIcon sx={{ color: '#6366F1', fontSize: 32 }} />
              <div className="stat-content">
                <h4>{branchNetwork.length}</h4>
                <p>Total Branches</p>
              </div>
            </div>
            <div className="stat-card">
              <VerifiedOutlinedIcon sx={{ color: '#10B981', fontSize: 32 }} />
              <div className="stat-content">
                <h4>{contactCount}</h4>
                <p>Primary Contacts</p>
              </div>
            </div>
            <div className="stat-card">
              <PublicOutlinedIcon sx={{ color: '#F59E0B', fontSize: 32 }} />
              <div className="stat-content">
                <h4>{coverageCount}</h4>
                <p>Regions Covered</p>
              </div>
            </div>
            <div className="stat-card">
              <VerifiedOutlinedIcon sx={{ color: '#8412FF', fontSize: 32 }} />
              <div className="stat-content">
                <h4>{totalMembers}</h4>
                <p>Shipper Team Members</p>
              </div>
            </div>
          </div>

          <div className="network-branches">
            <h3 className="section-title">Branches</h3>
            {sortedBranches.length === 0 ? (
              <Alert severity="info">No branches available yet for this logistics partner.</Alert>
            ) : (
              <div className="shippers-list branch-list">
                {sortedBranches.map((branch) => {
                  const isSelected = branch.branchOrgId === selectedBranchId;
                  return (
                    <div
                      key={branch.branchOrgId}
                      className={`branch-card shipper-card${isSelected ? ' active' : ''}`}
                      onClick={() => handleBranchSelect(branch.branchOrgId)}
                    >
                      <div className="branch-card-header shipper-header">
                        <h4>{branch.displayName}</h4>
                      </div>
                      <div className="branch-card-body">
                        <div className="branch-info-row">
                          <LocationOnOutlinedIcon sx={{ color: '#6366F1', fontSize: 18 }} />
                          <span>{branch.location?.address_full || branch.location?.name || 'Location details unavailable'}</span>
                        </div>
                        {branch.contact && (
                          <div className="branch-info-row">
                            <PhoneOutlinedIcon sx={{ color: '#6366F1', fontSize: 18 }} />
                            <span>
                              {branch.contact.type === 'member'
                                ? branch.contact.name
                                : branch.contact.phone || branch.contact.email || branch.contact.name}
                            </span>
                          </div>
                        )}
                        {branch.members.length > 0 && (
                          <div className="branch-members-chip">
                            {branch.members.length} team member{branch.members.length === 1 ? '' : 's'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </motion.div>

        {selectedBranch && (
          <div className="modal-overlay" onClick={() => setSelectedBranchId(null)}>
            <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{selectedBranch.displayName}</h3>
                <button className="close-btn" onClick={() => setSelectedBranchId(null)}>
                  <CloseOutlinedIcon />
                </button>
              </div>
              <div className="shipper-detail">
                <div className="detail-section">
                  <h4>Location</h4>
                  <div className="contact-info">
                    <div className="contact-item">
                      <LocationOnOutlinedIcon sx={{ color: '#6366F1', fontSize: 18 }} />
                      <span>{selectedBranch.location?.address_full || selectedBranch.location?.name || 'Not provided'}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>Primary Contact</h4>
                  {selectedBranch.contact ? (
                    <div className="contact-info">
                      <div className="contact-item">
                        <PhoneOutlinedIcon sx={{ color: '#6366F1', fontSize: 18 }} />
                        <span>{selectedBranch.contact.name}</span>
                      </div>
                      {selectedBranch.contact.type === 'location' && selectedBranch.contact.phone && (
                        <div className="contact-item">
                          <PhoneOutlinedIcon sx={{ color: '#6366F1', fontSize: 18 }} />
                          <span>{selectedBranch.contact.phone}</span>
                        </div>
                      )}
                      {selectedBranch.contact.type === 'location' && selectedBranch.contact.email && (
                        <div className="contact-item">
                          <EmailOutlinedIcon sx={{ color: '#6366F1', fontSize: 18 }} />
                          <a href={`mailto:${selectedBranch.contact.email}`}>{selectedBranch.contact.email}</a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="helper-text">No primary contact assigned yet.</p>
                  )}
                </div>

                <div className="detail-section">
                  <h4>Branch Team</h4>
                  {selectedBranch.members.length === 0 ? (
                    <p className="helper-text">No team members listed for this branch.</p>
                  ) : (
                    <div className="tags-container">
                      {selectedBranch.members.map((member) => (
                        <span key={member.userId} className="service-tag">
                          {member.fullName || 'Unnamed member'} • {member.role}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {partnerWebsite && (
                  <div className="detail-section">
                    <h4>Partner Website</h4>
                    <div className="contact-item">
                      <LanguageOutlinedIcon sx={{ color: '#6366F1', fontSize: 18 }} />
                      <a href={partnerWebsite} target="_blank" rel="noopener noreferrer">
                        {partnerWebsiteLabel}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface NetworkMapProps {
  branches: BranchMarker[];
  selectedBranchId: string | null;
  onBranchClick: (branchId: string) => void;
}

const NetworkMap: React.FC<NetworkMapProps> = ({ branches, selectedBranchId, onBranchClick }) => {
  const [map, setMap] = useState<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;

    const loadLeaflet = async () => {
      if (window.L) {
        setLeafletLoaded(true);
        return;
      }

      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      cssLink.crossOrigin = '';
      document.head.appendChild(cssLink);

      await new Promise((resolve) => {
        cssLink.onload = resolve;
        cssLink.onerror = resolve;
      });

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';

      script.onload = () => {
        if (isMounted) {
          setLeafletLoaded(true);
        }
      };

      document.head.appendChild(script);
    };

    loadLeaflet();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (leafletLoaded && window.L && mapRef.current && !map) {
      try {
        delete window.L.Icon.Default.prototype._getIconUrl;
        window.L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        const leafletMap = window.L.map(mapRef.current, {
          center: [30, 0],
          zoom: 2,
          maxZoom: 18,
          minZoom: 2,
          zoomControl: true,
          scrollWheelZoom: true,
          attributionControl: false,
        });

        window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '',
          maxZoom: 19,
          subdomains: 'abcd',
        }).addTo(leafletMap);

        setMap(leafletMap);
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }
  }, [leafletLoaded, map]);

  useEffect(() => {
    if (!map || !window.L) return;

    markersRef.current.forEach((marker) => {
      map.removeLayer(marker);
    });
    markersRef.current = [];

    branches.forEach((branch, index) => {
      const { entry, location } = branch;
      const isSelected = entry.branchOrgId === selectedBranchId;
      const markerHtml = `
        <div style="
          background-color: ${isSelected ? '#10B981' : '#6366F1'};
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
          <div style="
            color: white;
            font-weight: bold;
            font-size: 14px;
          ">${index + 1}</div>
        </div>
      `;

      const customIcon = window.L.divIcon({
        html: markerHtml,
        className: 'branch-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });

      const marker = window.L.marker([location.lat, location.lng], { icon: customIcon })
        .addTo(map)
        .bindTooltip(entry.displayName, {
          permanent: false,
          direction: 'top',
          className: 'region-tooltip',
        })
        .on('click', () => {
          onBranchClick(entry.branchOrgId);
        });

      markersRef.current.push(marker);
    });

    if (branches.length > 0) {
      const bounds = window.L.latLngBounds(branches.map((branch) => [branch.location.lat, branch.location.lng]));
      map.fitBounds(bounds.pad(0.2));
    }
  }, [branches, map, onBranchClick, selectedBranchId]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      />
      {!map && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: '10px',
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
              margin: '0 auto 12px',
            }} />
            <div style={{ fontSize: '14px', fontWeight: '500' }}>
              Loading network map...
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Network;
