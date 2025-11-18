// Enhanced database types for the new schema with compliance and consolidation support

// Quote Artwork type (for immutable quote records)
export interface QuoteArtwork {
  id: string;
  quote_id: string;
  name: string;
  artist_name: string | null;
  year_completed: number | null;
  medium: string | null;
  dimensions: string | null;
  weight: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  volumetric_weight_value: number | null;
  volumetric_weight_unit: string | null;
  declared_value: number | null;
  crating: string | null;
  has_existing_crate: boolean | null;
  category: string | null;
  item_type: string | null;
  period: string | null;
  description: string | null;
  image_url: string | null;
  tariff_code: string | null;
  country_of_origin: string | null;
  export_license_required: boolean;
  special_requirements: any | null;
  created_at: string;
  created_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
}

// Enhanced Artwork type (can belong to quote OR shipment)
export interface EnhancedArtwork {
  id: string;
  shipment_id: string | null;
  quote_id: string | null;
  quote_artwork_id: string | null; // Reference to original quote artwork
  name: string;
  artist_name: string | null;
  year_completed: number | null;
  medium: string | null;
  dimensions: string | null;
  weight: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  volumetric_weight_value: number | null;
  volumetric_weight_unit: string | null;
  declared_value: number | null;
  crating: string | null;
  has_existing_crate: boolean | null;
  category: string | null;
  item_type: string | null;
  period: string | null;
  description: string | null;
  image_url: string | null;
  tariff_code: string | null;
  country_of_origin: string | null;
  export_license_required: boolean;
  special_requirements: any | null;
  verified_condition: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
}

// Quote Shipment Map for consolidation support
export interface QuoteShipmentMap {
  id: string;
  quote_id: string;
  shipment_id: string;
  bid_id: string | null;
  relationship_type: 'primary' | 'consolidated' | 'split' | 'partial';
  included_artwork_ids: string[];
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

// Enhanced Quote type with new fields
export interface EnhancedQuote {
  id: string;
  title: string;
  type: 'requested' | 'auction';
  status: 'draft' | 'active' | 'closed' | 'expired' | 'cancelled';
  route: string | null;
  origin_id: string | null;
  destination_id: string | null;
  target_date: string | null;
  target_date_start: string | null;
  target_date_end: string | null;
  value: number | null;
  description: string | null;
  requirements: any | null;
  owner_org_id: string;
  shipment_id: string | null;
  bidding_deadline: string | null;
  auto_close_bidding: boolean;
  delivery_specifics: any | null;
  notes: string | null;
  client_reference: string | null;
  origin_contact_name: string | null;
  origin_contact_phone: string | null;
  origin_contact_email: string | null;
  destination_contact_name: string | null;
  destination_contact_phone: string | null;
  destination_contact_email: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  locked_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  quote_artworks?: QuoteArtwork[];
  bids?: EnhancedBid[];
  origin?: Location;
  destination?: Location;
  owner_org?: Organization;
}

// Enhanced Shipment type with consolidation fields
export interface EnhancedShipment {
  id: string;
  code: string;
  name: string;
  quote_id: string | null; // Reference to original quote
  status: 'checking' | 'pending' | 'pending_approval' | 'in_transit' | 'artwork_collected' | 'security_check' | 'local_delivery' | 'delivered' | 'cancelled';
  ship_date: string | null;
  estimated_arrival: string | null;
  transit_time: string | null;
  total_value: number | null;
  transport_method: 'ground' | 'air' | 'sea' | null;
  logistics_partner: string | null;
  logistics_partner_id: string | null;
  special_services: string[] | null;
  insurance_type: 'none' | 'basic' | 'comprehensive' | null;
  insurance_provider: string | null;
  security_level: 'standard' | 'high' | 'maximum' | null;
  security_measures: string | null;
  condition_report: string | null;
  origin_id: string | null;
  destination_id: string | null;
  owner_org_id: string;
  is_consolidated: boolean;
  consolidation_notes: string | null;
  parent_shipment_id: string | null;
  carbon_estimate: number | null;
  carbon_offset: boolean;
  carbon_details: any | null;
  delivery_requirements: string[] | null;
  packing_requirements: string | null;
  access_requirements: string[] | null;
  safety_security_requirements: string[] | null;
  condition_check_requirements: string[] | null;
  client_reference: string | null;
  origin_contact_name: string | null;
  origin_contact_phone: string | null;
  origin_contact_email: string | null;
  destination_contact_name: string | null;
  destination_contact_phone: string | null;
  destination_contact_email: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  artworks?: EnhancedArtwork[];
  quote_shipment_maps?: QuoteShipmentMap[];
  origin?: Location;
  destination?: Location;
  logistics_partner_details?: LogisticsPartner;
}

// Enhanced Bid type with acceptance tracking
export interface EnhancedBid {
  id: string;
  quote_id: string;
  logistics_partner_id: string;
  branch_org_id: string | null;
  amount: number;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled_by_shipper' | 'needs_confirmation';
  notes: string | null;
  estimated_transit_time: string | null;
  insurance_included: boolean;
  special_services: string[] | null;
  valid_until: string | null;
  is_draft: boolean;
  submitted_at: string | null;
  last_modified_by: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  needs_confirmation_at?: string | null;
  confirmed_at?: string | null;
  show_breakdown: boolean;
  breakdown_notes: string | null;
  co2_estimate: number | null;
  created_at: string;
  updated_at: string;
  // Relations
  logistics_partner?: LogisticsPartner;
  line_items?: BidLineItem[];
}

// Audit Log for compliance
export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_values: any | null;
  new_values: any | null;
  changed_fields: string[] | null;
  user_id: string | null;
  user_ip: string | null;
  user_agent: string | null;
  session_id: string | null;
  timestamp: string;
  retention_until: string;
}

// Quote Audit Events for business-level tracking
export interface QuoteAuditEvent {
  id: string;
  quote_id: string;
  event_type: 'created' | 'submitted' | 'artwork_added' | 'artwork_removed' | 'bid_received' | 'bid_accepted' | 'shipment_created' | 'cancelled';
  event_data: any | null;
  user_id: string | null;
  organization_id: string | null;
  timestamp: string;
  retention_until: string;
}

// Supporting types
export interface Location {
  id: string;
  name: string;
  address_full: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  org_id: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  type: 'client' | 'partner';
  created_at: string;
  parent_org_id?: string | null;
  branch_name?: string | null;
  branch_location_id?: string | null;
  company_id?: string | null;
}

export interface LogisticsPartner {
  id: string;
  name: string;
  abbreviation: string;
  brand_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  website: string | null;
  specialties: string[] | null;
  regions: string[] | null;
  active: boolean;
  org_id: string | null;
  rating: number | null;
  created_at: string;
}

export interface BidLineItem {
  id: string;
  bid_id: string;
  category: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  is_optional: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// RPC function types
export interface AcceptBidParams {
  p_quote_id: string;
  p_bid_id: string;
  p_branch_org_id: string;
  terms_document_path?: string;
  terms_document_bucket?: string;
  terms_document_name?: string;
  terms_company_name?: string | null;
  terms_branch_name?: string | null;
  terms_acknowledged_at?: string;
}

export interface ConsolidateQuotesParams {
  p_quote_ids: string[];
  p_primary_bid_id: string;
}

// Helper type for quotes with counts
export interface QuoteWithCounts extends EnhancedQuote {
  artwork_count: number;
  bid_count: number;
  submitted_bid_count: number;
}
