import { supabase } from './client';
import { Database } from './types';
import { AuthService } from './auth';

type ShipmentRow = Database['public']['Tables']['shipments']['Row'];
type ShipmentInsert = Database['public']['Tables']['shipments']['Insert'];
type ShipmentUpdate = Database['public']['Tables']['shipments']['Update'];
type ArtworkRow = Database['public']['Tables']['artworks']['Row'];
type LocationRow = Database['public']['Tables']['locations']['Row'];
type TrackingEventRow = Database['public']['Tables']['tracking_events']['Row'];
type DocumentRow = Database['public']['Tables']['documents']['Row'];

export interface ShipmentWithDetails extends ShipmentRow {
  origin?: LocationRow;
  destination?: LocationRow;
  artworks: ArtworkRow[];
  tracking_events: TrackingEventRow[];
  documents: DocumentRow[];
}

export class ShipmentService {
  private static deletableDocCache = new Map<string, string[]>();

  private static getApiBaseUrl(): string {
    const base = (import.meta as any).env?.VITE_API_BASE_URL || '';
    return String(base || '');
  }

  private static async getAuthToken(): Promise<string | null> {
    try {
      const { session } = await AuthService.getSession();
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
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.ok === false) {
        const err = json?.error || { message: `Request failed (${res.status})` };
        return { data: null, error: err };
      }
      return { data: (json.result as T) ?? null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  private static getDocsBucket(): string {
    const bucket = (import.meta as any).env?.VITE_STORAGE_SHIPMENT_DOCS_BUCKET || 'shipment-docs';
    return String(bucket);
  }

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
      }
    );
    if (error || !data) {
      console.error('[ShipmentService] createSignedUpload failed', error);
      return null;
    }
    return data;
  }

  static async uploadFileToSignedUrl(path: string, token: string, file: File): Promise<boolean> {
    try {
      const bucket = this.getDocsBucket();
      const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, {
        contentType: file.type || undefined,
        upsert: false,
      } as any);
      if (error) {
        console.error('[ShipmentService] uploadFileToSignedUrl storage error', error);
      }
      return !error;
    } catch (e) {
      console.error('[ShipmentService] uploadFileToSignedUrl threw', e);
      return false;
    }
  }

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
      }
    );
    if (error || !data) {
      console.error('[ShipmentService] confirmUpload failed', error);
      return null;
    }
    return data.id;
  }

  static async deleteDocument(id: string): Promise<boolean> {
    const { data, error } = await this.postApi<{ id: string }>('/api/documents/delete', { id });
    if (error || !data?.id) {
      console.error('[ShipmentService] deleteDocument failed', error);
      return false;
    }
    return true;
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

  // Get all shipments with related data
  static async getShipments(orgId: string): Promise<{ data: ShipmentWithDetails[] | null; error: any }> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        origin:locations!shipments_origin_id_fkey(*),
        destination:locations!shipments_destination_id_fkey(*),
        artworks(*),
        tracking_events(*),
        documents(*)
      `)
      .eq('owner_org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error };
    }

    // Transform data to match interface
    const transformedShipments: ShipmentWithDetails[] = (data || []).map(shipment => ({
      ...shipment,
      origin: shipment.origin || undefined,
      destination: shipment.destination || undefined,
      artworks: shipment.artworks || [],
      tracking_events: (shipment.tracking_events || []).sort((a: any, b: any) => 
        new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
      ),
      documents: shipment.documents || []
    }));

    return { data: transformedShipments, error: null };
  }

  // Get single shipment with details
  static async getShipment(id: string, orgId: string): Promise<{ data: ShipmentWithDetails | null; error: any }> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        origin:locations!shipments_origin_id_fkey(*),
        destination:locations!shipments_destination_id_fkey(*),
        artworks(*),
        tracking_events(*),
        documents(*)
      `)
      .eq('id', id)
      .eq('owner_org_id', orgId)
      .single();

    if (error && (error as any).code === 'PGRST116') {
      return { data: null, error: null };
    }

    if (error) {
      return { data: null, error };
    }

    if (!data) {
      return { data: null, error: null };
    }

    const transformedShipment: ShipmentWithDetails = {
      ...data,
      origin: data.origin || undefined,
      destination: data.destination || undefined,
      artworks: data.artworks || [],
      tracking_events: (data.tracking_events || []).sort((a: any, b: any) => 
        new Date(b.event_time).getTime() - new Date(a.event_time).getTime()
      ),
      documents: data.documents || []
    };

    return { data: transformedShipment, error: null };
  }

  // Create new shipment
  static async createShipment(shipment: ShipmentInsert) {
    const { data, error } = await supabase
      .from('shipments')
      .insert(shipment)
      .select()
      .single();

    return { data, error };
  }

  // Update shipment
  static async updateShipment(id: string, updates: ShipmentUpdate) {
    const { data, error } = await supabase
      .from('shipments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  // Delete shipment
  static async deleteShipment(id: string) {
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id);

    return { error };
  }

  // Add tracking event
  static async addTrackingEvent(shipmentId: string, event: {
    status?: string;
    location?: string;
    notes?: string;
    event_time?: string;
  }) {
    const { data, error } = await supabase
      .from('tracking_events')
      .insert({
        shipment_id: shipmentId,
        ...event
      })
      .select()
      .single();

    return { data, error };
  }

  // Add artwork to shipment
  static async addArtwork(shipmentId: string, artwork: Omit<ArtworkRow, 'id' | 'created_at' | 'shipment_id'>) {
    const { data, error } = await supabase
      .from('artworks')
      .insert({
        shipment_id: shipmentId,
        ...artwork
      })
      .select()
      .single();

    return { data, error };
  }

  // Update artwork
  static async updateArtwork(id: string, updates: Partial<ArtworkRow>) {
    const { data, error } = await supabase
      .from('artworks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  // Delete artwork
  static async deleteArtwork(id: string) {
    const { error } = await supabase
      .from('artworks')
      .delete()
      .eq('id', id);

    return { error };
  }

  // Add document
  static async addDocument(shipmentId: string, document: {
    file_url: string;
    kind?: string;
    uploaded_by?: string;
  }) {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        shipment_id: shipmentId,
        ...document
      })
      .select()
      .single();

    return { data, error };
  }

  // Cancel shipment via RPC (if available in backend)
  static async cancelShipment(shipmentId: string, reason: string) {
    const { error } = await supabase.rpc('cancel_shipment', {
      p_shipment_id: shipmentId,
      p_reason: reason
    } as any);
    return { error };
  }
} 
