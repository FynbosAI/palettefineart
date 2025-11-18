import { supabase } from '../lib/supabase';

// Types
interface Bid {
  id: string;
  quote_id: string;
  logistics_partner_id: string;
  branch_org_id: string | null;
  amount: number;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn' | 'draft' | 'needs_confirmation';
  notes?: string;
  estimated_transit_time?: string;
  insurance_included?: boolean;
  special_services?: string[];
  valid_until?: string;
  created_at: string;
  updated_at: string;
  is_draft?: boolean;
  submitted_at?: string;
  last_modified_by?: string;
  rejection_reason?: string;
  rejected_at?: string;
  show_breakdown?: boolean;
  breakdown_notes?: string;
  co2_estimate?: number;
  needs_confirmation_at?: string;
  confirmed_at?: string;
  accepted_at?: string;
  withdrawn_at?: string;
  revision?: number;
}

export interface BidLineItem {
  id?: string;
  bid_id?: string;
  category: string;
  description: string[];  // Changed to array to match database ARRAY type
  quantity: number;
  unit_price: number;
  total_amount: number;
  is_optional: boolean;
  notes?: string;
  sort_order?: number;
  is_active?: boolean | null;
  supersedes_id?: string | null;
  superseded_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface BidWithDetails extends Bid {
  bid_line_items?: BidLineItem[];
  quote?: any;
}

const filterActiveLineItems = (lineItems?: BidLineItem[] | null): BidLineItem[] => {
  return (lineItems || []).filter((item) => item && item.is_active !== false);
};

interface BidInsert {
  quote_id: string;
  logistics_partner_id: string;
  branch_org_id: string;
  amount: number;
  status?: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn' | 'draft';
  notes?: string;
  estimated_transit_time?: string;
  insurance_included?: boolean;
  special_services?: string[];
  valid_until?: string;
  is_draft?: boolean;
  show_breakdown?: boolean;
  breakdown_notes?: string;
  co2_estimate?: number;
}

function isBidRlsViolation(error: any): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as any).code as string | undefined;
  const message = ((error as any).message as string | undefined)?.toLowerCase() || '';
  return code === '42501' || message.includes('violates row-level security policy');
}

function createBidRlsError(original: any): Error {
  const friendlyMessage = 'You are not authorized to bid on this quote. It may require an invite or the bidding window has closed.';
  const friendlyError = new Error(friendlyMessage);
  (friendlyError as any).code = 'BID_RLS_VIOLATION';
  (friendlyError as any).cause = original;
  return friendlyError;
}

export class BidService {
  /**
   * Get all bids for a logistics partner
   */
  static async getPartnerBids(partnerId: string, branchOrgId?: string | null): Promise<{ 
    data: BidWithDetails[] | null; 
    error: any 
  }> {
    try {
      let query = supabase
        .from('bids')
        .select(`
          *,
          quote:quotes(*),
          bid_line_items(*)
        `)
        .eq('logistics_partner_id', partnerId);

      if (branchOrgId) {
        query = query.eq('branch_org_id', branchOrgId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform data to ensure proper typing
      const transformedData = (data || []).map(bid => ({
        ...bid,
        bid_line_items: filterActiveLineItems(bid.bid_line_items),
        quote: bid.quote || undefined,
      })) as BidWithDetails[];
      
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('BidService.getPartnerBids error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get a single bid with details
   */
  static async getBidDetails(bidId: string): Promise<{ 
    data: BidWithDetails | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('bids')
        .select(`
          *,
          quote:quotes(*),
          bid_line_items(*)
        `)
        .eq('id', bidId)
        .single();

      if (error) throw error;
      
      const transformedData = data ? {
        ...data,
        bid_line_items: filterActiveLineItems(data.bid_line_items),
        quote: data.quote || undefined,
      } as BidWithDetails : null;
      
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('BidService.getBidDetails error:', error);
      return { data: null, error };
    }
  }

  /**
   * Create or update a bid (upsert)
   */
  static async upsertBid(bid: Partial<BidInsert>): Promise<{ 
    data: Bid | null; 
    error: any 
  }> {
    try {
      // Set default values
      const branchOrgId = bid.branch_org_id;
      if (!branchOrgId) {
        throw new Error('Missing branch scope for bid upsert. Please select a branch and try again.');
      }

      const bidData = {
        ...bid,
        branch_org_id: branchOrgId,
        status: bid.status || 'draft',
        is_draft: bid.is_draft !== undefined ? bid.is_draft : true,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('bids')
        .upsert(bidData, {
          onConflict: 'quote_id,logistics_partner_id,branch_org_id',
        })
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('BidService.upsertBid error:', error);
      if (isBidRlsViolation(error)) {
        return { data: null, error: createBidRlsError(error) };
      }
      return { data: null, error };
    }
  }

  /**
   * Submit a draft bid
   */
  static async submitBid(bidId: string, userId?: string): Promise<{ 
    data: Bid | null; 
    error: any 
  }> {
    try {
      // Get the current user if not provided
      const currentUserId = userId || (await supabase.auth.getUser()).data?.user?.id;
      
      const { data, error } = await supabase
        .from('bids')
        .update({ 
          status: 'pending',
          is_draft: false,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_modified_by: currentUserId,
        })
        .eq('id', bidId)
        .select()
        .single();

      if (error) throw error;
      
      // Note: Bid history is now handled in the store to avoid duplication
      
      return { data, error: null };
    } catch (error) {
      console.error('BidService.submitBid error:', error);
      return { data: null, error };
    }
  }

  /**
   * Withdraw a bid
   */
  static async withdrawBid(
    bidId: string,
    branchOrgId?: string | null,
    options?: { note?: string }
  ): Promise<{ error: any }> {
    try {
      const note = options?.note ?? 'Bid withdrawn by shipper';
      const { error } = await supabase.rpc('withdraw_bid', {
        p_bid_id: bidId,
        p_note: note,
      });

      if (error) throw error;

      if (branchOrgId) {
        console.debug('BidService.withdrawBid branch context', { bidId, branchOrgId });
      }

      return { error: null };
    } catch (error) {
      console.error('BidService.withdrawBid error:', error);
      return { error };
    }
  }

  /**
   * Add or update line items for a bid
   */
  static async upsertBidLineItems(
    bidId: string, 
    lineItems: BidLineItem[]
  ): Promise<{ data: BidLineItem[] | null; error: any }> {
    try {
      // Delete existing line items
      const { error: deleteError } = await supabase
        .from('bid_line_items')
        .delete()
        .eq('bid_id', bidId);

      if (deleteError) throw deleteError;

      // Insert new line items
      if (lineItems.length === 0) {
        return { data: [], error: null };
      }

      // Build insert payload explicitly to avoid writing generated columns like total_amount
      const itemsToInsert = lineItems.map((item, index) => ({
        bid_id: bidId,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        is_optional: item.is_optional,
        notes: item.notes,
        sort_order: item.sort_order || index,
      }));

      const { data, error } = await supabase
        .from('bid_line_items')
        .insert(itemsToInsert)
        .select();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('BidService.upsertBidLineItems error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get bids for a specific quote
   */
  static async getBidsByQuote(quoteId: string): Promise<{ 
    data: BidWithDetails[] | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('bids')
        .select(`
          *,
          bid_line_items(*),
          logistics_partner:logistics_partners(*)
        `)
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const transformedData = (data || []).map(bid => ({
        ...bid,
        bid_line_items: filterActiveLineItems(bid.bid_line_items),
      })) as BidWithDetails[];
      
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('BidService.getBidsByQuote error:', error);
      return { data: null, error };
    }
  }

  /**
   * Update bid status
   */
  static async updateBidStatus(
    bidId: string, 
    status: Bid['status'],
    reason?: string
  ): Promise<{ data: Bid | null; error: any }> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'rejected' && reason) {
        updateData.rejection_reason = reason;
        updateData.rejected_at = new Date().toISOString();
      }

      if (status === 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('bids')
        .update(updateData)
        .eq('id', bidId)
        .select()
        .single();

      if (error) throw error;
      
      // Create bid history entry
      await supabase
        .from('bid_history')
        .insert({
          bid_id: bidId,
          action: status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'updated',
          new_status: status,
          notes: reason,
          timestamp: new Date().toISOString(),
        });
      
      return { data, error: null };
    } catch (error) {
      console.error('BidService.updateBidStatus error:', error);
      return { data: null, error };
    }
  }

  /**
   * Confirm a bid that is in needs_confirmation status
   */
  static async confirmBid(bidId: string): Promise<{ data: Bid | null; error: any }> {
    try {
      const { data, error } = await supabase
        .rpc('confirm_bid', { p_bid_id: bidId });
      if (error) throw error;
      // Some Supabase setups return null for void RPC; fetch the bid to ensure latest state
      let currentBid: Bid | null = null;
      if (!data) {
        const refreshed = await supabase
          .from('bids')
          .select('*')
          .eq('id', bidId)
          .single();
        if (refreshed.error) throw refreshed.error;
        currentBid = refreshed.data as unknown as Bid;
      } else {
        currentBid = data as unknown as Bid;
      }

      // Increment revision on resubmission (Confirm & Resubmit flow)
      const nextRevision = ((currentBid?.revision ?? 1) + 1);
      const { data: updatedBid, error: revisionError } = await supabase
        .from('bids')
        .update({ revision: nextRevision, updated_at: new Date().toISOString() })
        .eq('id', bidId)
        .select()
        .single();
      if (revisionError) throw revisionError;

      return { data: updatedBid as unknown as Bid, error: null };
    } catch (error) {
      console.error('BidService.confirmBid error:', error);
      return { data: null, error };
    }
  }

  /**
   * Increment revision for a bid (used on re-submission flows)
   */
  static async incrementRevision(bidId: string): Promise<{ data: Bid | null; error: any }> {
    try {
      // Fetch current revision
      const { data: current, error: fetchError } = await supabase
        .from('bids')
        .select('revision')
        .eq('id', bidId)
        .single();
      if (fetchError) throw fetchError;

      const nextRevision = ((current?.revision ?? 1) + 1);
      const { data: updated, error: updateError } = await supabase
        .from('bids')
        .update({ revision: nextRevision, updated_at: new Date().toISOString() })
        .eq('id', bidId)
        .select()
        .single();
      if (updateError) throw updateError;
      return { data: updated as unknown as Bid, error: null };
    } catch (error) {
      console.error('BidService.incrementRevision error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get bid statistics for a partner
   */
  static async getPartnerBidStats(partnerId: string, branchOrgId?: string | null): Promise<{ 
    data: {
      total: number;
      pending: number;
      accepted: number;
      rejected: number;
      withdrawn: number;
      successRate: number;
    } | null; 
    error: any 
  }> {
    try {
      let query = supabase
        .from('bids')
        .select('status')
        .eq('logistics_partner_id', partnerId);

      if (branchOrgId) {
        query = query.eq('branch_org_id', branchOrgId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        pending: data?.filter(b => b.status === 'pending').length || 0,
        accepted: data?.filter(b => b.status === 'accepted').length || 0,
        rejected: data?.filter(b => b.status === 'rejected').length || 0,
        withdrawn: data?.filter(b => b.status === 'withdrawn').length || 0,
        successRate: 0,
      };

      if (stats.total > 0) {
        stats.successRate = (stats.accepted / (stats.accepted + stats.rejected)) * 100 || 0;
      }

      return { data: stats, error: null };
    } catch (error) {
      console.error('BidService.getPartnerBidStats error:', error);
      return { data: null, error };
    }
  }
}
