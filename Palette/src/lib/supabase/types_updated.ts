// This file shows the TypeScript type updates needed after the migration
// Copy the relevant changes to your existing types.ts file

// Update the artworks table types to include quote_id
export type ArtworkUpdate = {
  artworks: {
    Row: {
      id: string;
      shipment_id: string | null;  // Now nullable since artwork can belong to quote
      quote_id: string | null;      // NEW: Reference to quote
      name: string;
      artist_name: string | null;
      year_completed: number | null;
      medium: string | null;
      dimensions: string | null;
      weight: string | null;
      weight_value: number | null;             // NEW
      weight_unit: string | null;              // NEW
      volumetric_weight_value: number | null;  // NEW
      volumetric_weight_unit: string | null;   // NEW
      declared_value: number | null;
      crating: string | null;
      has_existing_crate: boolean | null;      // NEW
      category: string | null;                // NEW
      item_type: string | null;               // NEW
      period: string | null;                  // NEW
      description: string | null;
      image_url: string | null;
      tariff_code: string | null;
      country_of_origin: string | null;
      export_license_required: boolean;
      special_requirements: any | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      shipment_id?: string | null;  // Optional in insert
      quote_id?: string | null;      // NEW: Optional in insert
      name: string;
      artist_name?: string | null;
      year_completed?: number | null;
      medium?: string | null;
      dimensions?: string | null;
      weight?: string | null;
      weight_value?: number | null;            // NEW
      weight_unit?: string | null;             // NEW
      volumetric_weight_value?: number | null; // NEW
      volumetric_weight_unit?: string | null;  // NEW
      declared_value?: number | null;
      crating?: string | null;
      has_existing_crate?: boolean | null;     // NEW
      category?: string | null;               // NEW
      item_type?: string | null;              // NEW
      period?: string | null;                 // NEW
      description?: string | null;
      image_url?: string | null;
      tariff_code?: string | null;
      country_of_origin?: string | null;
      export_license_required?: boolean;
      special_requirements?: any | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      shipment_id?: string | null;
      quote_id?: string | null;      // NEW: Can update quote_id
      name?: string;
      artist_name?: string | null;
      year_completed?: number | null;
      medium?: string | null;
      dimensions?: string | null;
      weight?: string | null;
      weight_value?: number | null;            // NEW
      weight_unit?: string | null;             // NEW
      volumetric_weight_value?: number | null; // NEW
      volumetric_weight_unit?: string | null;  // NEW
      declared_value?: number | null;
      crating?: string | null;
      has_existing_crate?: boolean | null;     // NEW
      category?: string | null;               // NEW
      item_type?: string | null;              // NEW
      period?: string | null;                 // NEW
      description?: string | null;
      image_url?: string | null;
      tariff_code?: string | null;
      country_of_origin?: string | null;
      export_license_required?: boolean;
      special_requirements?: any | null;
      created_at?: string;
    };
  };
};

// Update the shipments table types to include quote_id
export type ShipmentUpdate = {
  shipments: {
    Row: {
      id: string;
      code: string;
      name: string;
      quote_id: string | null;  // NEW: Reference to original quote
      status: 'checking' | 'pending' | 'in_transit' | 'artwork_collected' | 'security_check' | 'local_delivery' | 'delivered' | 'cancelled';
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
      carbon_estimate: number | null;
      carbon_offset: boolean;
      carbon_details: any | null;
      delivery_requirements: string[] | null;
      packing_requirements: string | null;
      access_requirements: string[] | null;
      safety_security_requirements: string[] | null;
      condition_check_requirements: string[] | null;
      client_reference: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      code: string;
      name: string;
      quote_id?: string | null;  // NEW: Optional in insert
      status?: 'checking' | 'pending' | 'in_transit' | 'artwork_collected' | 'security_check' | 'local_delivery' | 'delivered' | 'cancelled';
      ship_date?: string | null;
      estimated_arrival?: string | null;
      transit_time?: string | null;
      total_value?: number | null;
      transport_method?: 'ground' | 'air' | 'sea' | null;
      logistics_partner?: string | null;
      logistics_partner_id?: string | null;
      special_services?: string[] | null;
      insurance_type?: 'none' | 'basic' | 'comprehensive' | null;
      insurance_provider?: string | null;
      security_level?: 'standard' | 'high' | 'maximum' | null;
      security_measures?: string | null;
      condition_report?: string | null;
      origin_id?: string | null;
      destination_id?: string | null;
      owner_org_id: string;
      carbon_estimate?: number | null;
      carbon_offset?: boolean;
      carbon_details?: any | null;
      delivery_requirements?: string[] | null;
      packing_requirements?: string | null;
      access_requirements?: string[] | null;
      safety_security_requirements?: string[] | null;
      condition_check_requirements?: string[] | null;
      client_reference?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      code?: string;
      name?: string;
      quote_id?: string | null;  // NEW: Can update quote_id
      status?: 'checking' | 'pending' | 'in_transit' | 'artwork_collected' | 'security_check' | 'local_delivery' | 'delivered' | 'cancelled';
      ship_date?: string | null;
      estimated_arrival?: string | null;
      transit_time?: string | null;
      total_value?: number | null;
      transport_method?: 'ground' | 'air' | 'sea' | null;
      logistics_partner?: string | null;
      logistics_partner_id?: string | null;
      special_services?: string[] | null;
      insurance_type?: 'none' | 'basic' | 'comprehensive' | null;
      insurance_provider?: string | null;
      security_level?: 'standard' | 'high' | 'maximum' | null;
      security_measures?: string | null;
      condition_report?: string | null;
      origin_id?: string | null;
      destination_id?: string | null;
      owner_org_id?: string;
      carbon_estimate?: number | null;
      carbon_offset?: boolean;
      carbon_details?: any | null;
      delivery_requirements?: string[] | null;
      packing_requirements?: string | null;
      access_requirements?: string[] | null;
      safety_security_requirements?: string[] | null;
      condition_check_requirements?: string[] | null;
      client_reference?: string | null;
      created_at?: string;
      updated_at?: string;
    };
  };
};

// Update the bids table types to include accepted_at
export type BidUpdate = {
  bids: {
    Row: {
      id: string;
      quote_id: string;
      logistics_partner_id: string;
      amount: number;
      status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled_by_shipper';
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
      accepted_at: string | null;  // NEW: Timestamp when bid was accepted
      show_breakdown: boolean;
      breakdown_notes: string | null;
      co2_estimate: number | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      quote_id: string;
      logistics_partner_id: string;
      amount: number;
      status?: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled_by_shipper';
      notes?: string | null;
      estimated_transit_time?: string | null;
      insurance_included?: boolean;
      special_services?: string[] | null;
      valid_until?: string | null;
      is_draft?: boolean;
      submitted_at?: string | null;
      last_modified_by?: string | null;
      rejection_reason?: string | null;
      rejected_at?: string | null;
      accepted_at?: string | null;  // NEW: Optional in insert
      show_breakdown?: boolean;
      breakdown_notes?: string | null;
      co2_estimate?: number | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      quote_id?: string;
      logistics_partner_id?: string;
      amount?: number;
      status?: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled_by_shipper';
      notes?: string | null;
      estimated_transit_time?: string | null;
      insurance_included?: boolean;
      special_services?: string[] | null;
      valid_until?: string | null;
      is_draft?: boolean;
      submitted_at?: string | null;
      last_modified_by?: string | null;
      rejection_reason?: string | null;
      rejected_at?: string | null;
      accepted_at?: string | null;  // NEW: Can update accepted_at
      show_breakdown?: boolean;
      breakdown_notes?: string | null;
      co2_estimate?: number | null;
      created_at?: string;
      updated_at?: string;
    };
  };
};

// Add new function types for RPC calls
export type DatabaseFunctions = {
  accept_bid: {
    Args: {
      p_quote_id: string;
      p_bid_id: string;
    };
    Returns: string;  // Returns shipment_id
  };
  can_accept_bid: {
    Args: {
      p_quote_id: string;
      p_user_id: string;
    };
    Returns: boolean;
  };
};

// Helper types for common queries
export type QuoteWithCounts = {
  id: string;
  title: string;
  status: string;
  artwork_count: number;
  bid_count: number;
  submitted_bid_count: number;
  // ... other quote fields
};

export type QuoteWithArtworks = {
  id: string;
  title: string;
  artworks: Array<{
    id: string;
    name: string;
    artist_name: string | null;
    declared_value: number | null;
    // ... other artwork fields
  }>;
  // ... other quote fields
};

export type ArtworkParentType = 'quote' | 'shipment';

// Utility function to determine artwork parent
export function getArtworkParent(artwork: { quote_id: string | null; shipment_id: string | null }): {
  type: ArtworkParentType;
  id: string;
} | null {
  if (artwork.quote_id) {
    return { type: 'quote', id: artwork.quote_id };
  }
  if (artwork.shipment_id) {
    return { type: 'shipment', id: artwork.shipment_id };
  }
  return null;
}
