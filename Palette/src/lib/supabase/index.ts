// Barrel exports for all Supabase services
export { supabase } from './client';
export { AuthService } from './auth';
export { OrganizationService } from './organizations';
export { OrganizationRequestService } from './organization-requests';
export { ShipmentService } from './shipments';
export { ArtworkService } from './artworks';
export { QuoteService, LogisticsPartnerService, QuoteInviteService } from './quotes';
export { LocationService } from './locations';
export { AppConfigService } from './app-config';
export { ChangeRequestService } from './enhanced-services';
export {
  getFreshSupabaseSession,
  getFreshAccessToken,
  MissingSupabaseSessionError,
} from './session';

// Export types
export type { Database } from './types';
export type { ShipmentWithDetails } from './shipments';
export type { ProcessedArtwork, ShipmentDetails } from './artworks';
export type {
  QuoteWithDetails,
  BidWithPartner,
  QuoteInviteWithPartner,
  LogisticsPartnerBranchRecord,
  LogisticsPartnerFilterMeta,
  QuoteInviteTarget,
} from './quotes';
