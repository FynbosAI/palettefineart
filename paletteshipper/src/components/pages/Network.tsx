import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import { CircularProgress, Alert, Button, Box, Typography } from '@mui/material';
import { motion } from 'motion/react';
import { easeStandard, slideInLeft } from '../../lib/motion';
import { useBranchNetwork, useAuth } from '../../hooks/useStoreSelectors';
import type { GeocodedLocation } from '../../lib/geocoding';
import { findOrganizationLogoUrl } from '../../lib/organizationLogos';
import type { BranchLocation, BranchNetworkEntry } from '../../services/BranchNetworkService';
import { useNavigate } from 'react-router-dom';
import useChatStore from '../../store/chatStore';
import {
  ClusterMemberInfo,
  createClusterIconHtml,
  createLogoMarkerHtml,
  computeJitterVector,
  sanitizeHtmlAttribute,
} from './networkMapIcons';

const DEFAULT_LOGO_URL = '/logo.png';
const MARKER_SIZE = 40;

interface BranchMarker {
  entry: BranchNetworkEntry;
  location: GeocodedLocation;
  logoUrl: string;
}

const Network: React.FC = () => {
  const { branchNetwork, branchNetworkLoading, branchNetworkError, fetchBranchNetwork } = useBranchNetwork();
  const { logisticsPartner, organization } = useAuth();
  const openPeerThread = useChatStore((state) => state.openPeerThread);
  const navigate = useNavigate();

  
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [refreshingLocations, setRefreshingLocations] = useState(false);
  const hasAnimatedRef = useRef(false);
  const [peerMessagingBranchId, setPeerMessagingBranchId] = useState<string | null>(null);

  const motionInitial = hasAnimatedRef.current ? false : 'hidden';

  const slideInDown = {
    hidden: { opacity: 0, y: -24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeStandard } },
  } as const;

  useEffect(() => {
    fetchBranchNetwork();
  }, [fetchBranchNetwork]);

  const extractCoordinates = useCallback((location: BranchLocation | null): GeocodedLocation | null => {
    if (!location) {
      return null;
    }

    const toNumber = (value: unknown): number | null => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const latCandidates: unknown[] = [
      location.latitude,
      (location as any).lat,
      (location as any).geo_latitude,
      (location as any).geo_lat,
      (location as any).geocode_latitude,
      (location as any).geocode_lat,
    ];
    const lngCandidates: unknown[] = [
      location.longitude,
      (location as any).lng,
      (location as any).lon,
      (location as any).geo_longitude,
      (location as any).geo_lon,
      (location as any).geocode_longitude,
      (location as any).geocode_lon,
    ];

    let lat = latCandidates.map(toNumber).find((value): value is number => value !== null) ?? null;
    let lng = lngCandidates.map(toNumber).find((value): value is number => value !== null) ?? null;

    if ((lat === null || lng === null) && Array.isArray((location as any).coordinates)) {
      const coords = (location as any).coordinates as unknown[];
      if (coords.length >= 2) {
        const lonCandidate = toNumber(coords[0]);
        const latCandidate = toNumber(coords[1]);
        if (latCandidate !== null && lonCandidate !== null) {
          lat = lat ?? latCandidate;
          lng = lng ?? lonCandidate;
        }
      }
    }

    if (lat === null || lng === null) {
      return null;
    }

    return {
      lat,
      lng,
      displayName: location.address_full || location.name || 'Branch location',
    };
  }, []);

  const handleRefreshLocations = useCallback(async () => {
    setRefreshingLocations(true);
    try {
      await fetchBranchNetwork();
    } finally {
      setRefreshingLocations(false);
    }
  }, [fetchBranchNetwork]);

  const handleMessageBranch = useCallback(async (branchOrgId: string) => {
    if (!organization?.id) {
      alert('Select your active branch before messaging a partner shipper.');
      return;
    }

    try {
      setPeerMessagingBranchId(branchOrgId);
      const threadId = await openPeerThread({ peerShipperOrgId: branchOrgId });
      setPeerMessagingBranchId(null);
      setSelectedBranchId(null);
      navigate(`/messages?threadId=${threadId}`);
    } catch (error: any) {
      console.error('[Network] failed to open peer conversation', error);
      setPeerMessagingBranchId(null);
      alert(error?.message || 'Unable to start conversation. Please try again.');
    }
  }, [openPeerThread, organization?.id, navigate]);

  const sortedBranches = useMemo(() => (
    [...branchNetwork].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
  ), [branchNetwork]);

  const branchLogos = useMemo(() => {
    const logos: Record<string, string> = {};

    branchNetwork.forEach((branch) => {
      const matchedLogo =
        findOrganizationLogoUrl(branch.companyName) ||
        findOrganizationLogoUrl(branch.branchName) ||
        findOrganizationLogoUrl(branch.displayName);

      const fallbackLogo = branch.logoUrl ?? DEFAULT_LOGO_URL;
      logos[branch.branchOrgId] = matchedLogo ?? fallbackLogo;
    });

    return logos;
  }, [branchNetwork]);

  const branchesWithGeo = useMemo(() => (
    branchNetwork.reduce<BranchMarker[]>((acc, entry) => {
      const coordinates = extractCoordinates(entry.location);
      if (coordinates) {
        const logoUrl = branchLogos[entry.branchOrgId] ?? DEFAULT_LOGO_URL;
        acc.push({ entry, location: coordinates, logoUrl });
      }
      return acc;
    }, [])
  ), [branchNetwork, branchLogos, extractCoordinates]);

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

  const showLoader = branchNetworkLoading && branchNetwork.length === 0;

  if (showLoader) {
    return (
      <div className="main-wrap">
        <div className="main-panel main-panel--suppress-footer">
          <div className="full-height-center">
            <CircularProgress sx={{ color: '#00AAAB' }} />
            <p className="helper-text">Loading branch locations…</p>
          </div>
        </div>
      </div>
    );
  }

  if (branchNetworkError) {
    return (
      <div className="main-wrap">
        <div className="main-panel main-panel--suppress-footer">
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
                disabled={branchNetworkLoading || refreshingLocations}
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
            {(branchNetworkLoading || refreshingLocations) && (
              <div className="helper-text" style={{ marginTop: '12px' }}>
                {branchNetworkLoading ? 'Refreshing branch network…' : 'Refreshing branch locations…'}
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

          <Box
            sx={{
              mt: 3,
              border: '1px solid #E9EAEB',
              borderRadius: '14px',
              boxShadow: '0 10px 30px rgba(10, 13, 18, 0.08)',
              overflow: 'hidden',
              background: '#FFFFFF',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 3,
                py: 2,
                borderBottom: '1px solid #E9EAEB',
                background: 'linear-gradient(180deg, rgba(132,18,255,0.04) 0%, rgba(132,18,255,0.02) 100%)',
              }}
            >
              <BusinessOutlinedIcon sx={{ color: '#8412FF', fontSize: 22 }} />
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#170849' }}>
                Shippers & branches
              </Typography>
              <Typography variant="body2" sx={{ color: '#58517E', marginLeft: 'auto', fontWeight: 600 }}>
                {sortedBranches.length} entries
              </Typography>
            </Box>

            <Box component="div" sx={{ overflowX: 'auto' }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1.3fr 1fr 1.4fr 1fr 0.9fr 0.9fr',
                  px: 3,
                  py: 1.25,
                  background: 'rgba(132, 18, 255, 0.05)',
                  color: '#170849',
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid #E9EAEB',
                }}
              >
                <span>Company</span>
                <span>Branch</span>
                <span>Location</span>
                <span>Primary Contact</span>
                <span>Email</span>
                <span>Phone</span>
              </Box>

              {sortedBranches.map((branch, idx) => {
                const contact = branch.contact;
                const background = idx % 2 === 0 ? '#FFFFFF' : '#F9F9FB';
                return (
                  <Box
                    key={branch.branchOrgId}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1.3fr 1fr 1.4fr 1fr 0.9fr 0.9fr',
                      px: 3,
                      py: 1.35,
                      alignItems: 'center',
                      background,
                      borderBottom: '1px solid #E9EAEB',
                      color: '#1a153b',
                      fontSize: 14,
                      cursor: 'pointer',
                      '&:hover': {
                        background: 'rgba(132, 18, 255, 0.06)',
                      },
                    }}
                    onClick={() => handleBranchSelect(branch.branchOrgId)}
                  >
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#170849' }}>
                      {branch.companyName || branch.displayName || 'Organization'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#3f475a' }}>
                      {branch.branchName || branch.displayName || 'Branch'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#3f475a' }}>
                      {branch.location?.address_full || branch.location?.name || 'Location details unavailable'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#3f475a' }}>
                      {contact?.name || contact?.phone || contact?.email || '—'}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: contact?.email ? '#3f475a' : '#9AA3B2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {contact?.email || '—'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: contact?.phone ? '#3f475a' : '#9AA3B2' }}>
                      {contact?.phone || '—'}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* <div className="network-branches">
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
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={
                              peerMessagingBranchId === branch.branchOrgId ? (
                                <CircularProgress size={14} sx={{ color: '#008a8b' }} />
                              ) : (
                                <MessageOutlinedIcon sx={{ fontSize: 16 }} />
                              )
                            }
                            disabled={peerMessagingBranchId !== null}
                            sx={{
                              textTransform: 'none',
                              borderRadius: '999px',
                              borderColor: '#008a8b',
                              color: '#008a8b',
                              fontSize: '12px',
                              fontWeight: 600,
                              padding: '4px 14px',
                              '&:hover': {
                                borderColor: '#006d6e',
                                color: '#006d6e',
                                backgroundColor: 'rgba(0, 170, 171, 0.08)',
                              },
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMessageBranch(branch.branchOrgId);
                            }}
                          >
                            Message
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div> */}

        </motion.div>

        {selectedBranch && (
          <div className="modal-overlay" onClick={() => setSelectedBranchId(null)}>
            <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{selectedBranch.displayName}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={
                      peerMessagingBranchId === selectedBranch.branchOrgId ? (
                        <CircularProgress size={14} sx={{ color: '#008a8b' }} />
                      ) : (
                        <MessageOutlinedIcon sx={{ fontSize: 16 }} />
                      )
                    }
                    disabled={peerMessagingBranchId !== null}
                    sx={{
                      textTransform: 'none',
                      borderRadius: '999px',
                      borderColor: '#008a8b',
                      color: '#008a8b',
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 14px',
                      '&:hover': {
                        borderColor: '#006d6e',
                        color: '#006d6e',
                        backgroundColor: 'rgba(0, 170, 171, 0.08)',
                      },
                    }}
                    onClick={() => handleMessageBranch(selectedBranch.branchOrgId)}
                  >
                    Message
                  </Button>
                  <button className="close-btn" onClick={() => setSelectedBranchId(null)}>
                    <CloseOutlinedIcon />
                  </button>
                </div>
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

const MAX_CLUSTER_ZOOM = 16;
const HIGH_ZOOM_FOR_JITTER = 15;
const CLUSTER_ICON_SIZE = 56;

interface MarkerMeta {
  marker: any;
  branch: BranchMarker;
}

const buildClusterTooltip = (members: ClusterMemberInfo[], totalCount: number): string => {
  const slice = members.slice(0, Math.min(4, members.length));
  const remaining = totalCount - slice.length;

  const listItems = slice
    .map((member) => `
      <li style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <span style="width:24px;height:24px;border-radius:50%;overflow:hidden;border:1px solid #E5E7EB;flex-shrink:0;background:#fff;">
          <img src="${sanitizeHtmlAttribute(member.logoUrl)}" alt="${sanitizeHtmlAttribute(member.name)} logo" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />
        </span>
        <span style="font-size:12px;color:#111827;">${sanitizeHtmlAttribute(member.name)}</span>
      </li>
    `)
    .join('');

  const remainingHtml = remaining > 0
    ? `<div style="margin-top:6px;font-size:12px;color:#4b5563;">+${remaining} more</div>`
    : '';

  return `
    <div style="padding:10px 12px;border-radius:10px;background:#fff;box-shadow:0 10px 20px rgba(15,23,42,0.2);">
      <div style="font-weight:600;font-size:13px;color:#111827;">${totalCount} organizations</div>
      <ul style="list-style:none;padding:0;margin:8px 0 0;">
        ${listItems}
      </ul>
      ${remainingHtml}
    </div>
  `;
};

const NetworkMap: React.FC<NetworkMapProps> = ({ branches, selectedBranchId, onBranchClick }) => {
  const [map, setMap] = useState<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState<boolean>(false);
  const [clusterLibraryLoaded, setClusterLibraryLoaded] = useState<boolean>(false);
  const [clusterReady, setClusterReady] = useState<boolean>(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const clusterGroupRef = useRef<any>(null);
  const markersRef = useRef<Record<string, MarkerMeta>>({});
  const hasFitBoundsRef = useRef(false);
  const previousBranchIdsRef = useRef<string>('');

  const applyJitter = useCallback(
    (zoom: number) => {
      const clusterGroup = clusterGroupRef.current;
      if (!clusterGroup) return;
      const shouldJitter = zoom >= HIGH_ZOOM_FOR_JITTER;

      clusterGroup.eachLayer((layer: any) => {
        if (typeof layer.getChildCount === 'function') {
          return;
        }
        const element = layer.getElement?.();
        if (!element) return;
        const inner = element.querySelector('.logo-marker-inner') as HTMLElement | null;
        if (!inner) return;
        if (shouldJitter) {
          const branchId = layer.options?.branchId || layer.options?.branchMeta?.id;
          if (!branchId) return;
          const { x, y } = computeJitterVector(branchId);
          inner.style.transform = `translate(${x}px, ${y}px)`;
        } else {
          inner.style.transform = 'translate(0px, 0px)';
        }
      });
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;
    const cssHref = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    const jsSrc = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

    const ensureLeaflet = async () => {
      if (window.L) {
        setLeafletLoaded(true);
        return;
      }

      if (!document.querySelector(`link[href="${cssHref}"]`)) {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = cssHref;
        cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        cssLink.crossOrigin = '';
        document.head.appendChild(cssLink);
      }

      const existingScript = document.querySelector(`script[src="${jsSrc}"]`) as HTMLScriptElement | null;
      if (existingScript) {
        if (window.L) {
          setLeafletLoaded(true);
          return;
        }
        existingScript.addEventListener(
          'load',
          () => {
            if (isMounted) {
              setLeafletLoaded(true);
            }
          },
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.src = jsSrc;
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      script.onload = () => {
        if (isMounted) {
          setLeafletLoaded(true);
        }
      };
      script.onerror = () => {
        console.error('Failed to load Leaflet library.');
      };
      document.head.appendChild(script);
    };

    ensureLeaflet();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !leafletLoaded || !window.L || map) return;
    if (!mapRef.current) return;

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
  }, [leafletLoaded, map]);

  useEffect(() => {
    if (!leafletLoaded || typeof window === 'undefined' || !window.L) return;
    if (window.L.markerClusterGroup) {
      setClusterLibraryLoaded(true);
      return;
    }

    let isMounted = true;
    const cssHref = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
    const cssDefaultHref = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
    const scriptSrc = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';

    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = cssHref;
      document.head.appendChild(cssLink);
    }
    if (!document.querySelector(`link[href="${cssDefaultHref}"]`)) {
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = cssDefaultHref;
      document.head.appendChild(cssLink);
    }

    if (window.L.markerClusterGroup) {
      setClusterLibraryLoaded(true);
      return;
    }

    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener(
        'load',
        () => {
          if (isMounted) {
            setClusterLibraryLoaded(true);
          }
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = scriptSrc;
    script.onload = () => {
      if (isMounted) {
        setClusterLibraryLoaded(true);
      }
    };
    script.onerror = () => {
      console.error('Failed to load Leaflet.markercluster library.');
    };
    document.head.appendChild(script);

    return () => {
      isMounted = false;
    };
  }, [leafletLoaded]);

  useEffect(() => {
    if (!map || !clusterLibraryLoaded || !window.L?.markerClusterGroup || clusterGroupRef.current) return;

    const clusterGroup = window.L.markerClusterGroup({
      maxClusterRadius: 40,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.1,
      disableClusteringAtZoom: MAX_CLUSTER_ZOOM,
      iconCreateFunction: (cluster: any) => {
        const childMarkers = cluster.getAllChildMarkers() as any[];
        const members: ClusterMemberInfo[] = childMarkers
          .map((marker) => marker.options?.branchMeta as ClusterMemberInfo | undefined)
          .filter((meta): meta is ClusterMemberInfo => Boolean(meta));
        const sortedMembers = members.slice().sort((a, b) => a.name.localeCompare(b.name));
        const { html } = createClusterIconHtml(sortedMembers, cluster.getChildCount(), CLUSTER_ICON_SIZE, `${cluster._leaflet_id}`);
        return window.L.divIcon({
          html,
          className: 'branch-cluster-marker',
          iconSize: [CLUSTER_ICON_SIZE, CLUSTER_ICON_SIZE],
          iconAnchor: [CLUSTER_ICON_SIZE / 2, CLUSTER_ICON_SIZE / 2],
          popupAnchor: [0, -CLUSTER_ICON_SIZE / 2],
        });
      },
    });

    const handleClusterClick = (event: any) => {
      event.layer.spiderfy();
    };

    const handleSpiderfied = () => {
      applyJitter(map.getZoom());
    };

    const handleUnspiderfied = () => {
      applyJitter(map.getZoom());
    };

    const handleClusterMouseOver = (event: any) => {
      const layer = event.layer;
      const childMarkers = layer.getAllChildMarkers() as any[];
      const members: ClusterMemberInfo[] = childMarkers
        .map((marker) => marker.options?.branchMeta as ClusterMemberInfo | undefined)
        .filter((meta): meta is ClusterMemberInfo => Boolean(meta))
        .sort((a, b) => a.name.localeCompare(b.name));
      const tooltipHtml = buildClusterTooltip(members, layer.getChildCount());
      layer.bindTooltip(tooltipHtml, {
        direction: 'top',
        sticky: true,
        opacity: 1,
        interactive: false,
      }).openTooltip();
    };

    const handleClusterMouseOut = (event: any) => {
      event.layer.closeTooltip();
    };

    const attachKeyboard = (layer: any) => {
      const assign = () => {
        const element = layer.getElement?.();
        if (!element) {
          return;
        }
        element.setAttribute('tabindex', '0');
        const handler = (ev: KeyboardEvent) => {
          if (ev.key === 'Escape') {
            clusterGroup.unspiderfy();
            return;
          }
          if (ev.key !== 'Enter' && ev.key !== ' ') {
            return;
          }
          ev.preventDefault();
          if (typeof layer.getChildCount === 'function') {
            layer.spiderfy();
          } else {
            const branchId = layer.options?.branchId;
            if (branchId) {
              onBranchClick(branchId);
            }
          }
        };
        element.addEventListener('keydown', handler);
        layer.__keyboardHandler = handler;
      };
      requestAnimationFrame(assign);
    };

    const detachKeyboard = (layer: any) => {
      const element = layer.getElement?.();
      const handler = layer.__keyboardHandler as ((event: KeyboardEvent) => void) | undefined;
      if (element && handler) {
        element.removeEventListener('keydown', handler);
        delete layer.__keyboardHandler;
      }
    };

    const handleLayerAdd = (event: any) => {
      attachKeyboard(event.layer);
    };

    const handleLayerRemove = (event: any) => {
      detachKeyboard(event.layer);
    };

    clusterGroup.on('clusterclick', handleClusterClick);
    clusterGroup.on('spiderfied', handleSpiderfied);
    clusterGroup.on('unspiderfied', handleUnspiderfied);
    clusterGroup.on('clustermouseover', handleClusterMouseOver);
    clusterGroup.on('clustermouseout', handleClusterMouseOut);
    clusterGroup.on('layeradd', handleLayerAdd);
    clusterGroup.on('layerremove', handleLayerRemove);

    const collapseSpiderfy = () => {
      clusterGroup.unspiderfy();
    };

    map.addLayer(clusterGroup);
    map.on('click', collapseSpiderfy);
    map.on('zoomstart', collapseSpiderfy);
    map.on('movestart', collapseSpiderfy);

    clusterGroupRef.current = clusterGroup;
    setClusterReady(true);

    return () => {
      map.off('click', collapseSpiderfy);
      map.off('zoomstart', collapseSpiderfy);
      map.off('movestart', collapseSpiderfy);
      clusterGroup.off('clusterclick', handleClusterClick);
      clusterGroup.off('spiderfied', handleSpiderfied);
      clusterGroup.off('unspiderfied', handleUnspiderfied);
      clusterGroup.off('clustermouseover', handleClusterMouseOver);
      clusterGroup.off('clustermouseout', handleClusterMouseOut);
      clusterGroup.off('layeradd', handleLayerAdd);
      clusterGroup.off('layerremove', handleLayerRemove);
      map.removeLayer(clusterGroup);
      clusterGroupRef.current = null;
      setClusterReady(false);
    };
  }, [applyJitter, clusterLibraryLoaded, map, onBranchClick]);

  useEffect(() => {
    if (!map || !clusterReady || !clusterGroupRef.current || !window.L) return;

    const clusterGroup = clusterGroupRef.current;
    clusterGroup.clearLayers();
    markersRef.current = {};

    const markerRecords: MarkerMeta[] = branches.map((branch) => {
      const { entry, location, logoUrl } = branch;
      // Prefer the parent organization name for hover/tooltip; fall back to branch display if missing.
      const companyName = entry.companyName || entry.displayName || 'Organization';
      const markerHtml = createLogoMarkerHtml({
        logoUrl: logoUrl || DEFAULT_LOGO_URL,
        companyName,
        size: MARKER_SIZE,
        isSelected: entry.branchOrgId === selectedBranchId,
        ariaLabel: `${companyName} branch marker`,
        branchId: entry.branchOrgId,
      });

      const icon = window.L.divIcon({
        html: markerHtml,
        className: 'branch-marker',
        iconSize: [MARKER_SIZE, MARKER_SIZE],
        iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
        popupAnchor: [0, -MARKER_SIZE / 2],
      });

      const branchMeta: ClusterMemberInfo = {
        id: entry.branchOrgId,
        name: companyName,
        logoUrl: logoUrl || DEFAULT_LOGO_URL,
      };

      const marker = window.L.marker([location.lat, location.lng], {
        icon,
        branchId: entry.branchOrgId,
        branchMeta,
        zIndexOffset: entry.branchOrgId === selectedBranchId ? 1000 : 0,
      })
        .bindTooltip(companyName, {
          permanent: false,
          direction: 'top',
          className: 'region-tooltip',
        })
        .on('click', () => {
          onBranchClick(entry.branchOrgId);
        });

      markersRef.current[entry.branchOrgId] = { marker, branch };
      return { marker, branch };
    });

    markerRecords.forEach(({ marker }) => {
      clusterGroup.addLayer(marker);
    });

    clusterGroup.refreshClusters();
    applyJitter(map.getZoom());

    if (branches.length > 0) {
      const nextIds = branches
        .map((branch) => branch.entry.branchOrgId)
        .sort()
        .join('|');
      if (!hasFitBoundsRef.current || previousBranchIdsRef.current !== nextIds) {
        const bounds = window.L.latLngBounds(
          branches.map((branch) => [branch.location.lat, branch.location.lng])
        );
        map.fitBounds(bounds.pad(0.2));
        hasFitBoundsRef.current = true;
        previousBranchIdsRef.current = nextIds;
      }
    }
  }, [applyJitter, branches, clusterReady, map, onBranchClick, selectedBranchId]);

  useEffect(() => {
    if (!map) return;
    const handleZoom = () => {
      applyJitter(map.getZoom());
    };
    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [applyJitter, map]);

  useEffect(() => {
    return () => {
      if (map) {
        map.remove();
      }
    };
  }, [map]);

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
    </div>
  );
};

export default Network;
