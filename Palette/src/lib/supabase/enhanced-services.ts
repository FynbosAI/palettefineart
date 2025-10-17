// Enhanced service layer for working with the new schema
import { SupabaseClient } from '@supabase/supabase-js';
import { 
  EnhancedQuote, 
  QuoteArtwork, 
  EnhancedShipment,
  EnhancedBid,
  AcceptBidParams,
  ConsolidateQuotesParams,
  QuoteWithCounts
} from '../../types/database-enhanced';
import { API_BASE_URL } from '../../config';

// Quote Artwork Services
export class QuoteArtworkService {
  constructor(private supabase: SupabaseClient) {}

  async createQuoteArtworks(quoteId: string, artworks: Partial<QuoteArtwork>[]) {
    const user = await this.supabase.auth.getUser();
    const userId = user.data?.user?.id;
    
    const { data, error } = await this.supabase
      .from('quote_artworks')
      .insert(
        artworks.map(artwork => ({
          ...artwork,
          quote_id: quoteId,
          created_by: userId
        }))
      )
      .select();

    if (error) throw error;
    return data;
  }

  async getQuoteArtworks(quoteId: string) {
    const { data, error } = await this.supabase
      .from('quote_artworks')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at');

    if (error) throw error;
    return data as QuoteArtwork[];
  }

  async updateQuoteArtwork(artworkId: string, updates: Partial<QuoteArtwork>) {
    const { data, error } = await this.supabase
      .from('quote_artworks')
      .update(updates)
      .eq('id', artworkId)
      .is('locked_at', null) // Can only update if not locked
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteQuoteArtwork(artworkId: string) {
    const { error } = await this.supabase
      .from('quote_artworks')
      .delete()
      .eq('id', artworkId)
      .is('locked_at', null); // Can only delete if not locked

    if (error) throw error;
  }

  async lockQuoteArtworks(quoteId: string) {
    const user = await this.supabase.auth.getUser();
    const userId = user.data?.user?.id;
    
    const { data, error } = await this.supabase
      .from('quote_artworks')
      .update({
        locked_at: new Date().toISOString(),
        locked_by: userId
      })
      .eq('quote_id', quoteId)
      .is('locked_at', null)
      .select();

    if (error) throw error;
    return data;
  }
}

// Enhanced Quote Service
export class EnhancedQuoteService {
  constructor(private supabase: SupabaseClient) {}

  async createQuoteWithArtworks(
    quoteData: Partial<EnhancedQuote>, 
    artworks: Partial<QuoteArtwork>[]
  ) {
    // Start a transaction-like operation
    const { data: quote, error: quoteError } = await this.supabase
      .from('quotes')
      .insert(quoteData)
      .select()
      .single();

    if (quoteError) throw quoteError;

    // Add artworks if provided
    if (artworks.length > 0) {
      const artworkService = new QuoteArtworkService(this.supabase);
      const createdArtworks = await artworkService.createQuoteArtworks(quote.id, artworks);
      
      return {
        ...quote,
        quote_artworks: createdArtworks
      };
    }

    return quote;
  }

  async getQuoteWithDetails(quoteId: string): Promise<EnhancedQuote> {
    const { data, error } = await this.supabase
      .from('quotes')
      .select(`
        *,
        origin:locations!quotes_origin_id_fkey(*),
        destination:locations!quotes_destination_id_fkey(*),
        owner_org:organizations!quotes_owner_org_id_fkey(*),
        quote_artworks(*),
        bids(
          *,
          logistics_partner:logistics_partners(*),
          line_items:bid_line_items(*)
        )
      `)
      .eq('id', quoteId)
      .single();

    if (error) throw error;
    return data;
  }

  async getQuotesWithCounts(organizationId: string): Promise<QuoteWithCounts[]> {
    // Use the view for efficient counts
    const { data, error } = await this.supabase
      .from('quotes_with_counts')
      .select('*')
      .eq('owner_org_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async submitQuote(quoteId: string) {
    const userId = (await this.supabase.auth.getUser()).data?.user?.id;

    // Update quote status and lock it
    const { error: quoteError } = await this.supabase
      .from('quotes')
      .update({
        status: 'active',
        submitted_at: new Date().toISOString(),
        submitted_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', quoteId)
      .eq('status', 'draft');

    if (quoteError) throw quoteError;

    // Lock the artworks
    const artworkService = new QuoteArtworkService(this.supabase);
    await artworkService.lockQuoteArtworks(quoteId);

    // Log audit event
    await this.logQuoteEvent(quoteId, 'submitted');
  }

  async acceptBid(params: AcceptBidParams): Promise<string> {
    if (!params.p_branch_org_id) {
      throw new Error('Cannot accept bid without branch_org_id');
    }

    const session = (await this.supabase.auth.getSession()).data.session;
    const token = session?.access_token;
    if (!token) throw new Error('No auth session');

    const resp = await fetch(`${API_BASE_URL}/api/accept-bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    const json = await resp.json();
    if (!resp.ok || !json?.ok) {
      throw new Error(json?.error || 'Backend accept-bid failed');
    }
    return json.shipment_id as string;
  }

  async consolidateQuotes(params: ConsolidateQuotesParams): Promise<string> {
    const { data, error } = await this.supabase
      .rpc('consolidate_quotes_to_shipment', params);

    if (error) throw error;
    return data; // Returns consolidated shipment_id
  }

  private async logQuoteEvent(quoteId: string, eventType: string, eventData?: any) {
    const user = (await this.supabase.auth.getUser()).data?.user;
    
    // Get quote organization
    const { data: quote } = await this.supabase
      .from('quotes')
      .select('owner_org_id')
      .eq('id', quoteId)
      .single();

    if (quote) {
      await this.supabase
        .from('quote_audit_events')
        .insert({
          quote_id: quoteId,
          event_type: eventType,
          event_data: eventData,
          user_id: user?.id,
          organization_id: quote.owner_org_id
        });
    }
  }
}

// Enhanced Bid Service
export class EnhancedBidService {
  constructor(private supabase: SupabaseClient) {}

  async upsertBid(bidData: Partial<EnhancedBid>) {
    const { data, error } = await this.supabase
      .from('bids')
      .upsert(bidData, {
        onConflict: 'quote_id,logistics_partner_id,branch_org_id',
        ignoreDuplicates: false
      })
      .select(`
        *,
        logistics_partner:logistics_partners(*),
        line_items:bid_line_items(*)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  async submitBid(bidId: string) {
    const { data, error } = await this.supabase
      .from('bids')
      .update({
        is_draft: false,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', bidId)
      .eq('is_draft', true)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getBidForQuote(quoteId: string, logisticsPartnerId: string) {
    const { data, error } = await this.supabase
      .from('bids')
      .select(`
        *,
        logistics_partner:logistics_partners(*),
        line_items:bid_line_items(*)
      `)
      .eq('quote_id', quoteId)
      .eq('logistics_partner_id', logisticsPartnerId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return data;
  }
}

// Audit Service for compliance
export class AuditService {
  constructor(private supabase: SupabaseClient) {}

  async getQuoteAuditEvents(quoteId: string, limit = 50) {
    const { data, error } = await this.supabase
      .from('quote_audit_events')
      .select('*')
      .eq('quote_id', quoteId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getOrganizationAuditEvents(organizationId: string, limit = 100) {
    const { data, error } = await this.supabase
      .from('quote_audit_events')
      .select('*')
      .eq('organization_id', organizationId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getAuditLog(tableName: string, recordId: string) {
    const { data, error } = await this.supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data;
  }
}

// Real-time subscription helper
export class RealtimeService {
  constructor(private supabase: SupabaseClient) {}

  subscribeToQuoteArtworks(quoteId: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`quote-artworks:${quoteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quote_artworks',
          filter: `quote_id=eq.${quoteId}`
        },
        callback
      )
      .subscribe();
  }

  subscribeToQuoteAuditEvents(quoteId: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`quote-audit:${quoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quote_audit_events',
          filter: `quote_id=eq.${quoteId}`
        },
        callback
      )
      .subscribe();
  }

  subscribeToBidsForQuote(quoteId: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`quote-bids:${quoteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bids',
          filter: `quote_id=eq.${quoteId}`
        },
        callback
      )
      .subscribe();
  }
}

// Change Request Service (gallery/partner flows)
export class ChangeRequestService {
  constructor(private supabase: SupabaseClient) {}

  async getChangeRequests(shipmentId: string) {
    const { data, error } = await this.supabase
      .from('shipment_change_requests')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('created_at', { ascending: false });
    return { data, error };
  }

  async approveChangeRequest(requestId: string, responseNotes?: string) {
    const { error } = await this.supabase.rpc('approve_change_request', {
      p_request_id: requestId,
      p_response_notes: responseNotes || 'Approved by gallery'
    } as any);
    return { error };
  }

  async counterChangeRequest(requestId: string, counterAmount: number) {
    const userId = (await this.supabase.auth.getUser()).data.user?.id;
    const { error } = await this.supabase
      .from('shipment_change_requests')
      .update({
        status: 'countered',
        responded_by: userId,
        responded_at: new Date().toISOString(),
        proposed_amount: counterAmount
      })
      .eq('id', requestId);
    return { error };
  }
}
