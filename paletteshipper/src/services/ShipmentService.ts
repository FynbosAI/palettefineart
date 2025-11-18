import { supabase } from '../lib/supabase';
import { AuthService } from './AuthService';
import useShipperStore from '../store/useShipperStore';

// Types
interface Organization {
  id: string;
  name?: string;
  img_url?: string | null;
  branch_name?: string | null;
  company?: Organization | null;
}

interface Shipment {
  id: string;
  code: string;
  name: string;
  status: string;
  ship_date?: string;
  estimated_arrival?: string;
  transit_time?: string;
  total_value?: number;
  transport_method?: string;
  logistics_partner_id?: string;
  logistics_partner?: string;
  special_services?: string[];
  insurance_type?: string;
  insurance_provider?: string;
  security_level?: string;
  security_measures?: string;
  condition_report?: string;
  origin_id?: string;
  destination_id?: string;
  owner_org_id?: string;
  created_at: string;
  updated_at: string;
  carbon_estimate?: number;
  carbon_offset?: boolean;
  carbon_details?: any;
  delivery_requirements?: string[];
  packing_requirements?: string;
  access_requirements?: string[];
  safety_security_requirements?: string[];
  condition_check_requirements?: string[];
  client_reference?: string;
  quote_id?: string;
  owner_org?: Organization | null;
}

interface Location {
  id: string;
  name: string;
  address_full: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
}

interface TrackingEvent {
  id?: string;
  shipment_id: string;
  status: string;
  location?: string;
  event_time: string;
  notes?: string;
}

interface ShipmentWithDetails extends Shipment {
  origin?: Location;
  destination?: Location;
  artworks?: any[];
  tracking_events?: TrackingEvent[];
  documents?: any[];
  branch_org_id?: string | null;
  owner_org?: Organization | null;
}

export interface CounterChangeRequestLineItem {
  id: string;
  category?: string;
  description?: string[];
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
  is_optional?: boolean;
  notes?: string;
  sort_order?: number;
}

export class ShipmentService {
  private static deletableDocCache = new Map<string, string[]>();

  private static getApiBaseUrl(): string {
    // Default to same-origin if not provided
    const base = (import.meta as any).env?.VITE_API_BASE_URL || '';
    return String(base || '');
  }

  private static async getAuthToken(): Promise<string | null> {
    try {
      const session = await AuthService.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  }

  private static async postApi<T>(path: string, body: Record<string, any>): Promise<{ data: T | null; error: any }>{
    try {
      const token = await this.getAuthToken();
      const base = this.getApiBaseUrl();
      const url = `${base}${path}`;
      const { organization } = useShipperStore.getState();
      const branchOrgId = organization?.id ?? null;
      const companyOrgId = organization?.company_id
        ?? organization?.company?.id
        ?? organization?.parent_org_id
        ?? null;
      const payload = {
        ...body,
        ...(branchOrgId && body.branch_org_id === undefined ? { branch_org_id: branchOrgId } : {}),
        ...(companyOrgId && body.company_org_id === undefined ? { company_org_id: companyOrgId } : {}),
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.ok === false) {
        const rawError = json?.error || { message: `Request failed (${res.status})` };
        const normalizedError =
          rawError && typeof rawError === 'object'
            ? { ...rawError, status: res.status }
            : { message: String(rawError), status: res.status };
        return { data: null, error: normalizedError };
      }
      return { data: (json.result as T) ?? null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  // Storage bucket used for shipment documents; must match backend
  private static getDocsBucket(): string {
    // Optional FE env override; falls back to backend default
    const b = (import.meta as any).env?.VITE_STORAGE_SHIPMENT_DOCS_BUCKET || 'shipment-docs';
    return String(b);
  }

  private static getActiveBranchOrgId(): string | null {
    const { organization } = useShipperStore.getState();
    return organization?.id ?? null;
  }

  private static requireBranchOrgId(): string {
    const branchOrgId = this.getActiveBranchOrgId();
    if (!branchOrgId) {
      throw new Error('Switch to an invited branch to respond to this request.');
    }
    return branchOrgId;
  }

  /**
   * Create a signed upload URL via backend for a given shipment and file.
   */
  static async createSignedUpload(
    shipmentId: string,
    file: File,
    opts?: { kind?: string | null }
  ): Promise<{ path: string; token: string } | null> {
    const { data, error } = await this.postApi<{ path: string; token: string }>(
      '/api/documents/create-upload',
      {
        shipment_id: shipmentId,
        original_filename: file.name,
        kind: opts?.kind ?? null,
        content_type: file.type || null,
        branch_org_id: this.getActiveBranchOrgId(),
      }
    );
    if (error || !data) return null;
    return data;
  }

  /**
   * Confirm a previously uploaded file by inserting a row into documents.
   */
  static async confirmUpload(
    shipmentId: string,
    path: string,
    originalFilename: string,
    opts?: { kind?: string | null }
  ): Promise<string | null> {
    const { data, error } = await this.postApi<{ id: string }>(
      '/api/documents/confirm-upload',
      {
        shipment_id: shipmentId,
        path,
        original_filename: originalFilename,
        kind: opts?.kind ?? null,
        branch_org_id: this.getActiveBranchOrgId(),
      }
    );
    if (error || !data) return null;
    return data.id;
  }

  /**
   * Delete a document by id via backend (removes storage + DB row).
   */
  static async deleteDocument(id: string): Promise<boolean> {
    const { data, error } = await this.postApi<{ id: string }>('/api/documents/delete', {
      id,
      branch_org_id: this.getActiveBranchOrgId(),
    });
    return !error && !!data?.id;
  }

  static clearDeletableDocumentCache(shipmentId?: string) {
    if (shipmentId) {
      this.deletableDocCache.delete(shipmentId);
      return;
    }
    this.deletableDocCache.clear();
  }

  static async getDeletableDocumentIds(
    shipmentId: string,
    opts?: { force?: boolean }
  ): Promise<string[]> {
    const force = Boolean(opts?.force);
    if (!force && this.deletableDocCache.has(shipmentId)) {
      return this.deletableDocCache.get(shipmentId) || [];
    }

    const { data, error } = await this.postApi<{ deletableIds: string[] }>(
      '/api/documents/delete-permissions',
      {
        shipment_id: shipmentId,
        branch_org_id: this.getActiveBranchOrgId(),
      }
    );

    if (error || !data) {
      console.error('[ShipmentService] getDeletableDocumentIds failed', error);
      return [];
    }

    const ids = Array.isArray(data.deletableIds) ? data.deletableIds : [];
    this.deletableDocCache.set(shipmentId, ids);
    return ids;
  }

  /**
   * Uploads a file using a signed upload token returned by backend.
   */
  static async uploadFileToSignedUrl(path: string, token: string, file: File): Promise<boolean> {
    try {
      const bucket = this.getDocsBucket();
      const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, {
        contentType: file.type || undefined,
        upsert: false,
      } as any);
      return !error;
    } catch (e) {
      return false;
    }
  }
  /**
   * Get shipments assigned to a logistics partner
   */
  static async getAssignedShipments(
    partnerId: string,
    branchOrgId?: string | null
  ): Promise<{ 
    data: ShipmentWithDetails[] | null; 
    error: any 
  }> {
    try {
      console.log('🔍 ShipmentService.getAssignedShipments - Starting', {
        partnerId,
        branchOrgId
      });

      const { data, error } = await supabase
        .from('shipments')
        .select(`
          *,
          origin:locations!shipments_origin_id_fkey(*),
          destination:locations!shipments_destination_id_fkey(*),
          tracking_events(*),
          documents(*),
          owner_org:organizations!shipments_owner_org_id_fkey(*)
        `)
        .eq('logistics_partner_id', partnerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ ShipmentService.getAssignedShipments - Database error:', error);
        throw error;
      }

      const shipments = Array.isArray(data) ? data : [];
      const scopedShipments = await this.filterShipmentsByBranch(
        shipments,
        partnerId,
        branchOrgId
      );

      if (branchOrgId && scopedShipments.length === 0) {
        console.log('ℹ️ ShipmentService.getAssignedShipments - No shipments for branch scope', {
          partnerId,
          branchOrgId
        });
      }

      let quoteIdToArtworks = new Map<string, any[]>();
      const quoteIds = scopedShipments
        .map((s: any) => s.quote_id)
        .filter((id: string | null | undefined): id is string => Boolean(id));

      if (quoteIds.length > 0) {
        const { data: qa, error: qaError } = await supabase
          .from('quote_artworks')
          .select('*')
          .in('quote_id', quoteIds);
        if (!qaError && qa) {
          for (const artwork of qa) {
            const list = quoteIdToArtworks.get(artwork.quote_id) || [];
            list.push(artwork);
            quoteIdToArtworks.set(artwork.quote_id, list);
          }
        } else if (qaError) {
          console.warn('⚠️ Unable to fetch quote_artworks for shipments:', qaError);
        }
      }

      const transformedShipments: ShipmentWithDetails[] = scopedShipments.map((shipment: any) => ({
        ...shipment,
        origin: shipment.origin || undefined,
        destination: shipment.destination || undefined,
        artworks: shipment.quote_id ? (quoteIdToArtworks.get(shipment.quote_id) || []) : [],
        tracking_events: (shipment.tracking_events || []).sort((a: TrackingEvent, b: TrackingEvent) => 
          new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
        ),
        documents: shipment.documents || []
      }));

      console.log('✅ ShipmentService.getAssignedShipments - Transformed data:', {
        partnerId,
        branchOrgId,
        count: transformedShipments.length
      });

      return { data: transformedShipments, error: null };
    } catch (error) {
      console.error('❌ ShipmentService.getAssignedShipments - Exception:', error);
      return { data: null, error };
    }
  }

  private static async filterShipmentsByBranch(
    shipments: any[],
    partnerId: string,
    branchOrgId?: string | null
  ): Promise<any[]> {
    if (!branchOrgId) {
      return shipments;
    }

    const shipmentsWithQuote = shipments.filter((shipment) => Boolean(shipment.quote_id));
    if (shipmentsWithQuote.length === 0) {
      return [];
    }

    const quoteIds = Array.from(new Set<string>(
      shipmentsWithQuote
        .map((shipment) => shipment.quote_id as string)
        .filter(Boolean)
    ));

    try {
      const [inviteResult, bidResult] = await Promise.all([
        supabase
          .from('quote_invites')
          .select('quote_id, branch_org_id')
          .eq('logistics_partner_id', partnerId)
          .eq('branch_org_id', branchOrgId)
          .in('quote_id', quoteIds),
        supabase
          .from('bids')
          .select('quote_id, branch_org_id, status')
          .eq('logistics_partner_id', partnerId)
          .eq('branch_org_id', branchOrgId)
          .not('status', 'eq', 'draft')
          .in('quote_id', quoteIds)
      ]);

      const quoteIdToBranch = new Map<string, string>();

      if (inviteResult.data) {
        for (const row of inviteResult.data) {
          if (row?.quote_id && row?.branch_org_id) {
            quoteIdToBranch.set(row.quote_id, row.branch_org_id);
          }
        }
      }

      if (bidResult.data) {
        for (const row of bidResult.data) {
          if (row?.quote_id && row?.branch_org_id) {
            quoteIdToBranch.set(row.quote_id, row.branch_org_id);
          }
        }
      }

      const filtered = shipmentsWithQuote
        .filter((shipment) => {
          const branchMatch = shipment.quote_id ? quoteIdToBranch.get(shipment.quote_id) : null;
          return branchMatch === branchOrgId;
        })
        .map((shipment) => ({
          ...shipment,
          branch_org_id: shipment.quote_id ? quoteIdToBranch.get(shipment.quote_id) || null : null
        }));

      console.log('📦 ShipmentService.filterShipmentsByBranch - Summary', {
        partnerId,
        branchOrgId,
        shippedCount: shipments.length,
        filteredCount: filtered.length
      });

      return filtered;
    } catch (error) {
      console.error('❌ ShipmentService.filterShipmentsByBranch - Error:', error);
      return [];
    }
  }

  /**
   * Get shipments by owner organization
   */
  static async getShipmentsByOwnerOrg(orgId: string): Promise<{ 
    data: ShipmentWithDetails[] | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          *,
          origin:locations!shipments_origin_id_fkey(*),
          destination:locations!shipments_destination_id_fkey(*),
          tracking_events(*),
          documents(*),
          owner_org:organizations!shipments_owner_org_id_fkey(*)
        `)
        .eq('owner_org_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Hydrate artworks from quote_artworks
      let quoteIdToArtworks = new Map<string, any[]>();
      const quoteIds = (data || [])
        .map((s: any) => s.quote_id)
        .filter((id: string | null | undefined): id is string => !!id);

      if (quoteIds.length > 0) {
        const { data: qa, error: qaError } = await supabase
          .from('quote_artworks')
          .select('*')
          .in('quote_id', quoteIds);
        if (!qaError && qa) {
          for (const a of qa) {
            const list = quoteIdToArtworks.get(a.quote_id) || [];
            list.push(a);
            quoteIdToArtworks.set(a.quote_id, list);
          }
        } else if (qaError) {
          console.warn('⚠️ Unable to fetch quote_artworks for owner org shipments:', qaError);
        }
      }

      const transformedShipments: ShipmentWithDetails[] = (data || []).map((shipment: any) => ({
        ...shipment,
        origin: shipment.origin || undefined,
        destination: shipment.destination || undefined,
        artworks: shipment.quote_id ? (quoteIdToArtworks.get(shipment.quote_id) || []) : [],
        tracking_events: (shipment.tracking_events || []).sort((a: TrackingEvent, b: TrackingEvent) => 
          new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
        ),
        documents: shipment.documents || []
      }));
      
      return { data: transformedShipments, error: null };
    } catch (error) {
      console.error('ShipmentService.getShipmentsByOwnerOrg error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get active shipments for a partner
   */
  static async getActiveShipments(partnerId: string): Promise<{ 
    data: ShipmentWithDetails[] | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          *,
          origin:locations!shipments_origin_id_fkey(*),
          destination:locations!shipments_destination_id_fkey(*),
          tracking_events(*),
          documents(*),
          owner_org:organizations!shipments_owner_org_id_fkey(*)
        `)
        .eq('logistics_partner_id', partnerId)
        .in('status', ['in_transit', 'pending', 'checking', 'collected', 'customs_clearance', 'local_delivery'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Hydrate artworks from quote_artworks
      let quoteIdToArtworks = new Map<string, any[]>();
      const quoteIds = (data || [])
        .map((s: any) => s.quote_id)
        .filter((id: string | null | undefined): id is string => !!id);

      if (quoteIds.length > 0) {
        const { data: qa, error: qaError } = await supabase
          .from('quote_artworks')
          .select('*')
          .in('quote_id', quoteIds);
        if (!qaError && qa) {
          for (const a of qa) {
            const list = quoteIdToArtworks.get(a.quote_id) || [];
            list.push(a);
            quoteIdToArtworks.set(a.quote_id, list);
          }
        } else if (qaError) {
          console.warn('⚠️ Unable to fetch quote_artworks for active shipments:', qaError);
        }
      }

      const transformedShipments: ShipmentWithDetails[] = (data || []).map((shipment: any) => ({
        ...shipment,
        origin: shipment.origin || undefined,
        destination: shipment.destination || undefined,
        artworks: shipment.quote_id ? (quoteIdToArtworks.get(shipment.quote_id) || []) : [],
        tracking_events: (shipment.tracking_events || []).sort((a: TrackingEvent, b: TrackingEvent) => 
          new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
        ),
        documents: shipment.documents || []
      }));
      
      return { data: transformedShipments, error: null };
    } catch (error) {
      console.error('ShipmentService.getActiveShipments error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get shipment details by ID
   */
  static async getShipmentDetails(shipmentId: string): Promise<{ 
    data: ShipmentWithDetails | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          *,
          origin:locations!shipments_origin_id_fkey(*),
          destination:locations!shipments_destination_id_fkey(*),
          tracking_events(*),
          documents(*),
          quote:quotes(*)
        `)
        .eq('id', shipmentId)
        .single();

      if (error) throw error;

      // Hydrate artworks from quote_artworks for this shipment's quote
      let artworks: any[] = [];
      if (data?.quote_id) {
        const { data: qa, error: qaError } = await supabase
          .from('quote_artworks')
          .select('*')
          .eq('quote_id', data.quote_id);
        if (!qaError && qa) {
          artworks = qa;
        } else if (qaError) {
          console.warn('⚠️ Unable to fetch quote_artworks for shipment details:', qaError);
        }
      }

      const transformedShipment: ShipmentWithDetails = {
        ...data,
        origin: data.origin || undefined,
        destination: data.destination || undefined,
        artworks,
        tracking_events: (data.tracking_events || []).sort((a: TrackingEvent, b: TrackingEvent) => 
          new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
        ),
        documents: data.documents || []
      };
      
      return { data: transformedShipment, error: null };
    } catch (error) {
      console.error('ShipmentService.getShipmentDetails error:', error);
      return { data: null, error };
    }
  }

  /**
   * Update shipment status
   */
  static async updateShipmentStatus(
    shipmentId: string, 
    status: string,
    notes?: string,
    location?: string
  ): Promise<{ data: Shipment | null; error: any }> {
    try {
      // Update shipment
      const { data: shipment, error: shipmentError } = await supabase
        .from('shipments')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', shipmentId)
        .select()
        .single();

      if (shipmentError) throw shipmentError;

      // Create tracking event
      const { error: trackingError } = await supabase
        .from('tracking_events')
        .insert({
          shipment_id: shipmentId,
          status,
          event_time: new Date().toISOString(),
          notes,
          location
        });

      if (trackingError) throw trackingError;

      return { data: shipment, error: null };
    } catch (error) {
      console.error('ShipmentService.updateShipmentStatus error:', error);
      return { data: null, error };
    }
  }

  /**
   * Add tracking event
   */
  static async addTrackingEvent(event: TrackingEvent): Promise<{ 
    data: TrackingEvent | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('tracking_events')
        .insert({
          ...event,
          event_time: event.event_time || new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('ShipmentService.addTrackingEvent error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get shipment statistics for a partner
   */
  static async getPartnerShipmentStats(partnerId: string): Promise<{ 
    data: {
      total: number;
      active: number;
      delivered: number;
      inTransit: number;
      pending: number;
      totalValue: number;
      averageTransitTime?: number;
    } | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('status, total_value, ship_date, estimated_arrival')
        .eq('logistics_partner_id', partnerId);

      if (error) throw error;

      const stats: any = {
        total: data?.length || 0,
        active: data?.filter(s => ['in_transit', 'pending', 'checking', 'collected'].includes(s.status)).length || 0,
        delivered: data?.filter(s => s.status === 'delivered').length || 0,
        inTransit: data?.filter(s => s.status === 'in_transit').length || 0,
        pending: data?.filter(s => s.status === 'pending').length || 0,
        totalValue: data?.reduce((sum, s) => sum + (s.total_value || 0), 0) || 0,
      };

      // Calculate average transit time for delivered shipments
      const deliveredWithDates = data?.filter(s => 
        s.status === 'delivered' && s.ship_date && s.estimated_arrival
      );
      
      if (deliveredWithDates && deliveredWithDates.length > 0) {
        const totalDays = deliveredWithDates.reduce((sum, s) => {
          const shipDate = new Date(s.ship_date!);
          const arrivalDate = new Date(s.estimated_arrival!);
          const days = Math.ceil((arrivalDate.getTime() - shipDate.getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0);
        stats.averageTransitTime = totalDays / deliveredWithDates.length;
      }

      return { data: stats, error: null };
    } catch (error) {
      console.error('ShipmentService.getPartnerShipmentStats error:', error);
      return { data: null, error };
    }
  }

  /**
   * Mark a shipment as delivered via backend RPC.
   */
  static async completeShipment(shipmentId: string): Promise<{ data: any | null; error: any }> {
    return this.postApi<any>('/api/mark-delivered', { p_shipment_id: shipmentId });
  }

  /**
   * Search shipments by various criteria
   */
  static async searchShipments(
    searchTerm: string, 
    partnerId?: string
  ): Promise<{ 
    data: ShipmentWithDetails[] | null; 
    error: any 
  }> {
    try {
      let query = supabase
        .from('shipments')
        .select(`
          *,
          origin:locations!shipments_origin_id_fkey(*),
          destination:locations!shipments_destination_id_fkey(*),
          tracking_events(*),
          documents(*)
        `)
        .or(`code.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,client_reference.ilike.%${searchTerm}%`);

      if (partnerId) {
        query = query.eq('logistics_partner_id', partnerId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Hydrate artworks from quote_artworks
      let quoteIdToArtworks = new Map<string, any[]>();
      const quoteIds = (data || [])
        .map((s: any) => s.quote_id)
        .filter((id: string | null | undefined): id is string => !!id);

      if (quoteIds.length > 0) {
        const { data: qa, error: qaError } = await supabase
          .from('quote_artworks')
          .select('*')
          .in('quote_id', quoteIds);
        if (!qaError && qa) {
          for (const a of qa) {
            const list = quoteIdToArtworks.get(a.quote_id) || [];
            list.push(a);
            quoteIdToArtworks.set(a.quote_id, list);
          }
        } else if (qaError) {
          console.warn('⚠️ Unable to fetch quote_artworks for searchShipments:', qaError);
        }
      }

      const transformedShipments: ShipmentWithDetails[] = (data || []).map((shipment: any) => ({
        ...shipment,
        origin: shipment.origin || undefined,
        destination: shipment.destination || undefined,
        artworks: shipment.quote_id ? (quoteIdToArtworks.get(shipment.quote_id) || []) : [],
        tracking_events: (shipment.tracking_events || []).sort((a: TrackingEvent, b: TrackingEvent) => 
          new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
        ),
        documents: shipment.documents || []
      }));
      
      return { data: transformedShipments, error: null };
    } catch (error) {
      console.error('ShipmentService.searchShipments error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get carbon footprint data for shipments
   */
  static async getPartnerCarbonData(partnerId: string): Promise<{ 
    data: {
      totalEmissions: number;
      offsetEmissions: number;
      averagePerShipment: number;
      shipmentCount: number;
    } | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('carbon_estimate, carbon_offset')
        .eq('logistics_partner_id', partnerId)
        .not('carbon_estimate', 'is', null);

      if (error) throw error;

      const totalEmissions = data?.reduce((sum, s) => sum + (s.carbon_estimate || 0), 0) || 0;
      const offsetEmissions = data?.filter(s => s.carbon_offset).reduce((sum, s) => sum + (s.carbon_estimate || 0), 0) || 0;
      const shipmentCount = data?.length || 0;

      return { 
        data: {
          totalEmissions,
          offsetEmissions,
          averagePerShipment: shipmentCount > 0 ? totalEmissions / shipmentCount : 0,
          shipmentCount
        }, 
        error: null 
      };
    } catch (error) {
      console.error('ShipmentService.getPartnerCarbonData error:', error);
      return { data: null, error };
    }
  }

  /**
   * Change Request Operations
   */
  static async getChangeRequests(shipmentId: string): Promise<{ data: any[] | null; error: any }> {
    try {
      // Fetch latest pending or countered change request for this shipment
      const { data, error } = await supabase
        .from('shipment_change_requests')
        .select('*')
        .eq('shipment_id', shipmentId)
        .in('status', ['pending', 'countered'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const list = (data || []) as any[];

      // Hydrate proposed origin/destination if present in proposal.modified_fields
      const originIds: string[] = [];
      const destinationIds: string[] = [];
      for (const cr of list) {
        const modified = (cr?.proposal?.modified_fields ?? {}) as Record<string, any>;
        const origId = modified.origin_id as string | undefined;
        const destId = modified.destination_id as string | undefined;
        if (origId) originIds.push(origId);
        if (destId) destinationIds.push(destId);
      }

      const toFetch = Array.from(new Set([...originIds, ...destinationIds]));
      let locationMap = new Map<string, any>();
      if (toFetch.length > 0) {
        const { data: locs, error: locErr } = await supabase
          .from('locations')
          .select('*')
          .in('id', toFetch);
        if (!locErr && locs) {
          for (const l of locs as any[]) locationMap.set(l.id, l);
        }
      }

      const hydrated = list.map((cr) => {
        const modified = (cr?.proposal?.modified_fields ?? {}) as Record<string, any>;
        const proposed_origin = modified.origin_id ? locationMap.get(modified.origin_id) : undefined;
        const proposed_destination = modified.destination_id ? locationMap.get(modified.destination_id) : undefined;
        return { ...cr, proposed_origin, proposed_destination };
      });

      return { data: hydrated, error: null };
    } catch (error) {
      console.error('ShipmentService.getChangeRequests error:', error);
      return { data: null, error };
    }
  }

  static async createChangeRequest(
    shipmentId: string,
    type: 'scope' | 'withdrawal',
    params: { proposedAmount?: number; proposedShipDate?: string; proposedDeliveryDate?: string; reason?: string } = {}
  ): Promise<{ data: any | null; error: any }> {
    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      const payload: any = {
        shipment_id: shipmentId,
        initiated_by: user?.id,
        change_type: type,
        status: 'pending',
      };
      if (type === 'scope') {
        payload.proposal = params.reason ? { reason: params.reason } : {};
        if (params.proposedAmount !== undefined) payload.proposed_amount = params.proposedAmount;
        if (params.proposedShipDate) payload.proposed_ship_date = params.proposedShipDate;
        if (params.proposedDeliveryDate) payload.proposed_delivery_date = params.proposedDeliveryDate;
      }
      if (type === 'withdrawal' && params.reason) {
        payload.proposal = { reason: params.reason };
      }

      const { data, error } = await supabase
        .from('shipment_change_requests')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('ShipmentService.createChangeRequest error:', error);
      return { data: null, error };
    }
  }

  static async approveChangeRequest(
    requestId: string,
    branchOrgId?: string,
    responseNotes?: string
  ): Promise<{ data: any | null; error: any }> {
    const resolvedBranch = branchOrgId ?? this.requireBranchOrgId();
    return this.postApi('/api/approve-change-request', {
      p_change_request_id: requestId,
      p_response_notes: responseNotes,
      p_branch_org_id: resolvedBranch,
    });
  }

  static async counterChangeRequest(
    requestId: string,
    params: {
      amount: number;
      lineItems: CounterChangeRequestLineItem[];
      removeIds?: string[];
      branchOrgId?: string;
      notes?: string;
    }
  ): Promise<{ data: any | null; error: any }> {
    const resolvedBranch = params.branchOrgId ?? this.requireBranchOrgId();
    return this.postApi('/api/counter-change-request', {
      p_change_request_id: requestId,
      p_new_amount: params.amount,
      p_notes: params.notes,
      p_branch_org_id: resolvedBranch,
      line_items: params.lineItems ?? [],
      remove_ids: params.removeIds ?? [],
    });
  }

  static async rejectChangeRequest(
    requestId: string,
    branchOrgId?: string,
    responseNotes?: string
  ): Promise<{ data: any | null; error: any }> {
    const resolvedBranch = branchOrgId ?? this.requireBranchOrgId();
    return this.postApi('/api/reject-change-request', {
      p_change_request_id: requestId,
      p_response_notes: responseNotes,
      p_branch_org_id: resolvedBranch,
    });
  }

  static async withdrawChangeRequestAndShipment(shipmentId: string, requestId?: string): Promise<{ error: any }> {
    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();
      if (userError) throw userError;

      if (requestId) {
        const { error: updateError } = await supabase
          .from('shipment_change_requests')
          .update({
            status: 'withdrawn',
            responded_by: user?.id,
            responded_at: new Date().toISOString(),
            response_notes: 'Partner requested withdrawal'
          })
          .eq('id', requestId);
        if (updateError) throw updateError;
      }

      const { error: insertError } = await supabase
        .from('shipment_change_requests')
        .insert({
          shipment_id: shipmentId,
          initiated_by: user?.id,
          change_type: 'withdrawal',
          status: 'pending'
        });
      if (insertError) throw insertError;
      return { error: null };
    } catch (error) {
      console.error('ShipmentService.withdrawChangeRequestAndShipment error:', error);
      return { error };
    }
  }
}
