import { supabase } from './client';
import { Database } from './types';
import { BranchNetworkClient, BranchNetworkEntry, BranchNetworkAuthError } from '../api/branch-network';

type QuoteRow = Database['public']['Tables']['quotes']['Row'];
type QuoteInsert = Database['public']['Tables']['quotes']['Insert'];
type QuoteUpdate = Database['public']['Tables']['quotes']['Update'];
type BidRow = Database['public']['Tables']['bids']['Row'];
type BidInsert = Database['public']['Tables']['bids']['Insert'];
type BidUpdate = Database['public']['Tables']['bids']['Update'];
type QuoteInviteRow = Database['public']['Tables']['quote_invites']['Row'];
type LogisticsPartnerRow = Database['public']['Tables']['logistics_partners']['Row'];
type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type LocationRow = Database['public']['Tables']['locations']['Row'];
type ShipmentRow = Database['public']['Tables']['shipments']['Row'];
type QuoteArtworkRow = Database['public']['Tables']['quote_artworks']['Row'];

export interface LogisticsPartnerWithOrg extends LogisticsPartnerRow {
  organization?: OrganizationRow;
}

export interface QuoteInviteWithPartner extends QuoteInviteRow {
  logistics_partner?: LogisticsPartnerWithOrg;
  branch_org?: BranchOrganization | null;
}

export interface QuoteWithDetails extends QuoteRow {
  origin?: LocationRow;
  destination?: LocationRow;
  shipment?: ShipmentRow;
  bids: BidWithPartner[];
  quote_artworks?: QuoteArtworkRow[];
  owner_org?: BranchOrganization;
  invites?: QuoteInviteWithPartner[];
}

export interface BidLineItemRow {
  id: string;
  bid_id: string;
  category: string;
  description: string; // Palette schema uses text (not ARRAY)
  quantity: number | null;
  unit_price: number;
  total_amount: number | null;
  is_optional: boolean | null;
  notes: string | null;
  sort_order: number | null;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean | null;
  supersedes_id?: string | null;
  superseded_by?: string | null;
}

export interface BidWithPartner extends BidRow {
  logistics_partner?: LogisticsPartnerWithOrg;
  branch_org?: BranchOrganization | null;
  line_items?: BidLineItemRow[]; // alias for bid_line_items(*) in select
}

type BranchOrganization = OrganizationRow & {
  company_id?: string | null;
  company?: OrganizationRow | null;
};

type LogisticsPartnerQueryRow = LogisticsPartnerRow & {
  root: OrganizationRow | null;
};

export interface LogisticsPartnerBranchRecord {
  partner: LogisticsPartnerRow;
  branch: OrganizationRow;
  company: OrganizationRow | null;
  branchNetwork?: BranchNetworkEntry | null;
}

export interface LogisticsPartnerBranchCandidate {
  partner: LogisticsPartnerRow;
  branch: OrganizationRow;
  company: OrganizationRow | null;
}

export interface LogisticsPartnerFilterMeta {
  branchFilterApplied: boolean;
  branchNetworkCount: number;
  filteredOutBranches: LogisticsPartnerBranchRecord[];
  branchNetworkAuthError: boolean;
  branchNetworkErrorMessage: string | null;
}

export function filterBranchesByNetwork(
  candidates: LogisticsPartnerBranchCandidate[],
  branchNetworkMap: Map<string, BranchNetworkEntry>,
  enforceFilter: boolean
): {
  included: LogisticsPartnerBranchRecord[];
  filteredOut: LogisticsPartnerBranchCandidate[];
} {
  if (!enforceFilter) {
    return {
      included: candidates.map(candidate => ({
        ...candidate,
        branchNetwork: branchNetworkMap.get(candidate.branch.id) ?? null,
      })),
      filteredOut: [],
    };
  }

  const included: LogisticsPartnerBranchRecord[] = [];
  const filteredOut: LogisticsPartnerBranchCandidate[] = [];

  candidates.forEach(candidate => {
    const branchId = candidate.branch.id;
    const branchEntry = branchId ? branchNetworkMap.get(branchId) ?? null : null;
    if (branchEntry) {
      included.push({ ...candidate, branchNetwork: branchEntry });
    } else {
      filteredOut.push(candidate);
    }
  });

  return { included, filteredOut };
}

export interface QuoteInviteTarget {
  logisticsPartnerId: string;
  branchOrgId: string;
  companyOrgId: string | null;
}

export class QuoteService {
  private static async loadOrganizations(orgIds: string[]): Promise<Map<string, BranchOrganization>> {
    const uniqueIds = Array.from(new Set((orgIds || []).filter((id): id is string => Boolean(id))));
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const { data: branchRows, error: branchError } = await supabase
      .from('organizations')
      .select('*')
      .in('id', uniqueIds);

    if (branchError || !branchRows) {
      if (branchError) {
        console.warn('QuoteService.loadOrganizations branch fetch error:', branchError);
      }
      return new Map();
    }

    const parentIds = Array.from(
      new Set(
        branchRows
          .map((row: OrganizationRow) => row.parent_org_id || null)
          .filter((id): id is string => Boolean(id))
      )
    );

    const companyMap = new Map<string, OrganizationRow>();
    if (parentIds.length > 0) {
      const { data: companyRows, error: companyError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', parentIds);

      if (companyError) {
        console.warn('QuoteService.loadOrganizations company fetch error:', companyError);
      } else if (companyRows) {
        companyRows.forEach((row: OrganizationRow) => {
          companyMap.set(row.id, {
            ...row,
            parent_org_id: row.parent_org_id ?? null,
            branch_name: row.branch_name ?? null,
            branch_location_id: row.branch_location_id ?? null,
          });
        });
      }
    }

    const result = new Map<string, BranchOrganization>();
    branchRows.forEach((row: OrganizationRow) => {
      const parentId = row.parent_org_id ?? null;
      const sanitizedCompany = parentId ? companyMap.get(parentId) || null : null;
      const company = sanitizedCompany
        ? {
            ...sanitizedCompany,
            company: null,
            company_id: null,
          }
        : null;

      result.set(row.id, {
        ...row,
        parent_org_id: row.parent_org_id ?? null,
        branch_name: row.branch_name ?? null,
        branch_location_id: row.branch_location_id ?? null,
        company_id: parentId,
        company,
      });
    });

    return result;
  }

  private static async attachOrganizationMetadata<T extends { owner_org_id?: string | null; owner_org?: BranchOrganization | null }>(items: T[]): Promise<T[]> {
    if (!items || items.length === 0) {
      return items;
    }

    const orgIds = items
      .map((item) => item.owner_org?.id ?? item.owner_org_id)
      .filter((id): id is string => Boolean(id));

    if (orgIds.length === 0) {
      return items;
    }

    const orgMap = await this.loadOrganizations(orgIds);

    return items.map((item) => {
      const orgId = item.owner_org?.id ?? item.owner_org_id;
      if (!orgId) {
        return item;
      }
      const enriched = orgMap.get(orgId);
      if (!enriched) {
        return item;
      }
      return {
        ...item,
        owner_org: enriched,
      };
    });
  }

  // Get all quotes with related data and artwork counts
  static async getQuotes(orgId: string): Promise<{ data: QuoteWithDetails[] | null; error: any }> {
    console.log('🚀 QuoteService.getQuotes - Starting fetch with organization join...');

    const { data, error } = await supabase
      .from('quotes')
      .select(`
        *,
        origin:locations!quotes_origin_id_fkey(*),
        destination:locations!quotes_destination_id_fkey(*),
        shipment:shipments!quotes_shipment_id_fkey(*),
        quote_artworks(*),
        owner_org:organizations!quotes_owner_org_id_fkey(*),
        quote_invites(
          *,
          logistics_partner:logistics_partners(
            *,
            organization:organizations!logistics_partners_org_fk(*)
          ),
          branch_org:organizations!quote_invites_branch_fk(*)
        ),
        bids(
          *,
          logistics_partner:logistics_partners(
            *,
            organization:organizations!logistics_partners_org_fk(*)
          ),
          branch_org:organizations!bids_branch_org_fk(*),
          line_items:bid_line_items(*)
        )
      `)
      .eq('owner_org_id', orgId)
      .order('created_at', { ascending: false });
      
    console.log('📡 QuoteService.getQuotes - Supabase response:', { data, error });

    if (error) {
      return { data: null, error };
    }

    const quotesWithOrg = await this.attachOrganizationMetadata(data || []);

    const collectBranchOrgIds = (quotes: typeof quotesWithOrg) => {
      const ids = new Set<string>();
      quotes.forEach((quote: any) => {
        (quote?.quote_invites || []).forEach((invite: any) => {
          const branchId = invite?.branch_org_id || invite?.branch_org?.id || null;
          if (branchId) ids.add(branchId);
        });
        (quote?.bids || []).forEach((bid: any) => {
          const branchId = bid?.branch_org_id || bid?.branch_org?.id || null;
          if (branchId) ids.add(branchId);
        });
      });
      return ids;
    };

    const branchOrgIds = collectBranchOrgIds(quotesWithOrg);
    let branchNetworkMap: Map<string, BranchNetworkEntry> | null = null;
    if (branchOrgIds.size > 0) {
      try {
        const { data: branchEntries, error: branchError } = await BranchNetworkClient.getBranchNetwork();
        if (branchError) {
          console.warn('QuoteService.getQuotes: branch network lookup failed; proceeding without enhanced logos', branchError);
        } else if (Array.isArray(branchEntries) && branchEntries.length > 0) {
          branchNetworkMap = new Map<string, BranchNetworkEntry>(
            branchEntries.map(entry => [entry.branchOrgId, entry])
          );
        }
      } catch (branchError) {
        console.warn('QuoteService.getQuotes: branch network request threw, continuing without branch metadata', branchError);
      }
    }

    const lookupBranchNetwork = (branchOrgId?: string | null) => {
      if (!branchOrgId || !branchNetworkMap) return null;
      return branchNetworkMap.get(branchOrgId) ?? null;
    };

    // Transform data to match interface
    const transformedQuotes: QuoteWithDetails[] = quotesWithOrg.map(quote => {
      console.log('📋 QuoteService.getQuotes - Raw quote data:', {
        quoteId: quote.id,
        quoteTitle: quote.title,
        bidsCount: quote.bids?.length || 0,
        rawBids: quote.bids
      });

      const invites = (quote.quote_invites || []).map((invite: any) => ({
        ...invite,
        logistics_partner: invite.logistics_partner || undefined,
        branch_org: invite.branch_org || null,
        branch_network: lookupBranchNetwork(invite?.branch_org_id || invite?.branch_org?.id || null),
      }));

      const transformedQuote = {
        ...quote,
        origin: quote.origin || undefined,
        destination: quote.destination || undefined,
        shipment: quote.shipment || undefined,
        owner_org: quote.owner_org || undefined,
        invites,
        bids: (quote.bids || []).map((bid: any) => {
          console.log('🎯 QuoteService - Processing bid:', {
            bidId: bid.id,
            logisticsPartnerId: bid.logistics_partner_id,
            logisticsPartner: bid.logistics_partner,
            hasOrganization: !!bid.logistics_partner?.organization,
            organization: bid.logistics_partner?.organization,
            branchOrg: bid.branch_org
          });
          
          return {
            ...bid,
            logistics_partner: bid.logistics_partner || undefined,
            branch_org: bid.branch_org || null,
            branch_network: lookupBranchNetwork(bid?.branch_org_id || bid?.branch_org?.id || null),
            line_items: bid.line_items || []
          };
        })
      };

      console.log('📨 QuoteService.getQuotes - Enriched quote summary:', {
        quoteId: transformedQuote.id,
        ownerOrgId: transformedQuote.owner_org?.id || null,
        invitesCount: transformedQuote.invites?.length || 0,
        invitePartnerIds: (transformedQuote.invites || []).map((invite: any) => invite.logistics_partner_id),
      });

      return transformedQuote;
    });

    return { data: transformedQuotes, error: null };
  }

  // Get a single quote with details
  static async getQuote(id: string, orgId: string): Promise<{ data: QuoteWithDetails | null; error: any }> {
    console.log('🚀 QuoteService.getQuote - Starting single quote fetch with organization join for ID:', id);

    const { data, error } = await supabase
      .from('quotes')
      .select(`
        *,
        origin:locations!quotes_origin_id_fkey(*),
        destination:locations!quotes_destination_id_fkey(*),
        shipment:shipments!quotes_shipment_id_fkey(*),
        quote_artworks(*),
        owner_org:organizations!quotes_owner_org_id_fkey(*),
        quote_invites(
          *,
          logistics_partner:logistics_partners(
            *,
            organization:organizations!logistics_partners_org_fk(*)
          ),
          branch_org:organizations!quote_invites_branch_fk(*)
        ),
        bids(
          *,
          logistics_partner:logistics_partners(
            *,
            organization:organizations!logistics_partners_org_fk(*)
          ),
          branch_org:organizations!bids_branch_org_fk(*),
          line_items:bid_line_items(*)
        )
      `)
      .eq('id', id)
      .eq('owner_org_id', orgId)
      .single();
      
    console.log('📡 QuoteService.getQuote - Supabase single quote response:', { data, error });

    if (error) {
      return { data: null, error };
    }

    console.log('📋 QuoteService.getQuote - Raw single quote data:', {
      quoteId: data.id,
      quoteTitle: data.title,
      bidsCount: data.bids?.length || 0,
      rawBids: data.bids
    });

    const [quoteWithOrg] = await this.attachOrganizationMetadata(data ? [data] : []);

    if (!quoteWithOrg) {
      return { data: null, error: new Error('Quote not found for organization') };
    }

    // Transform data to match interface
    const branchOrgIds = new Set<string>();
    (quoteWithOrg.quote_invites || []).forEach((invite: any) => {
      const branchId = invite?.branch_org_id || invite?.branch_org?.id || null;
      if (branchId) branchOrgIds.add(branchId);
    });
    (quoteWithOrg.bids || []).forEach((bid: any) => {
      const branchId = bid?.branch_org_id || bid?.branch_org?.id || null;
      if (branchId) branchOrgIds.add(branchId);
    });

    let branchNetworkMap: Map<string, BranchNetworkEntry> | null = null;
    if (branchOrgIds.size > 0) {
      try {
        const { data: branchEntries, error: branchError } = await BranchNetworkClient.getBranchNetwork();
        if (branchError) {
          console.warn('QuoteService.getQuote: branch network lookup failed; continuing without enhanced logos', branchError);
        } else if (Array.isArray(branchEntries) && branchEntries.length > 0) {
          branchNetworkMap = new Map<string, BranchNetworkEntry>(
            branchEntries.map(entry => [entry.branchOrgId, entry])
          );
        }
      } catch (branchError) {
        console.warn('QuoteService.getQuote: branch network request threw, continuing without branch metadata', branchError);
      }
    }

    const lookupBranchNetwork = (branchOrgId?: string | null) => {
      if (!branchOrgId || !branchNetworkMap) return null;
      return branchNetworkMap.get(branchOrgId) ?? null;
    };

    const transformedQuote: QuoteWithDetails = {
      ...quoteWithOrg,
      origin: quoteWithOrg.origin || undefined,
      destination: quoteWithOrg.destination || undefined,
      shipment: quoteWithOrg.shipment || undefined,
      owner_org: quoteWithOrg.owner_org || undefined,
      invites: (quoteWithOrg.quote_invites || []).map((invite: any) => ({
        ...invite,
        logistics_partner: invite.logistics_partner || undefined,
        branch_org: invite.branch_org || null,
        branch_network: lookupBranchNetwork(invite?.branch_org_id || invite?.branch_org?.id || null),
      })),
      bids: (quoteWithOrg.bids || []).map((bid: any) => {
        console.log('🎯 QuoteService.getQuote - Processing single quote bid:', {
          bidId: bid.id,
          logisticsPartnerId: bid.logistics_partner_id,
          logisticsPartner: bid.logistics_partner,
          hasOrganization: !!bid.logistics_partner?.organization,
          organization: bid.logistics_partner?.organization,
          branchOrg: bid.branch_org
        });
        
        return {
          ...bid,
          logistics_partner: bid.logistics_partner || undefined,
          branch_org: bid.branch_org || null,
          branch_network: lookupBranchNetwork(bid?.branch_org_id || bid?.branch_org?.id || null),
          line_items: bid.line_items || []
        };
      })
    };

    console.log('📨 QuoteService.getQuote - Enriched single quote summary:', {
      quoteId: transformedQuote.id,
      ownerOrgId: transformedQuote.owner_org?.id || null,
      invitesCount: transformedQuote.invites?.length || 0,
      invitePartnerIds: (transformedQuote.invites || []).map((invite: any) => invite.logistics_partner_id),
    });

    return { data: transformedQuote, error: null };
  }

  // Create a new quote
  static async createQuote(quote: QuoteInsert) {
    const { data, error } = await supabase
      .from('quotes')
      .insert(quote)
      .select()
      .single();

    return { data, error };
  }

  // Update a quote
  static async updateQuote(id: string, updates: QuoteUpdate) {
    const { data, error } = await supabase
      .from('quotes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  // Delete a quote
  static async deleteQuote(id: string) {
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', id);

    return { error };
  }

  // Get bids for a specific quote
  static async getBidsForQuote(quoteId: string): Promise<{ data: BidWithPartner[] | null; error: any }> {
    const { data, error } = await supabase
      .from('bids')
      .select(`
        *,
        logistics_partner:logistics_partners(*),
        branch_org:organizations!bids_branch_org_fk(*)
      `)
      .eq('quote_id', quoteId)
      .order('amount', { ascending: true });

    if (error) {
      return { data: null, error };
    }

    const transformedBids: BidWithPartner[] = (data || []).map(bid => ({
      ...bid,
      logistics_partner: bid.logistics_partner || undefined,
      branch_org: bid.branch_org || null
    }));

    return { data: transformedBids, error: null };
  }

  // Create a new bid
  static async createBid(bid: BidInsert) {
    const { data, error } = await supabase
      .from('bids')
      .insert(bid)
      .select()
      .single();

    return { data, error };
  }

  // Update a bid
  static async updateBid(id: string, updates: BidUpdate) {
    const { data, error } = await supabase
      .from('bids')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  // Delete a bid
  static async deleteBid(id: string) {
    const { error } = await supabase
      .from('bids')
      .delete()
      .eq('id', id);

    return { error };
  }

  // Accept a bid – secure backend endpoint with fallback to direct RPC
  static async acceptBid(bidId: string, branchOrgId: string) {
    try {
      // Fetch bid to get quote_id
      const { data: bid, error: bidError } = await supabase
        .from('bids')
        .select('id, quote_id, branch_org_id')
        .eq('id', bidId)
        .single();
      if (bidError || !bid) throw bidError || new Error('Bid not found');

      if (!branchOrgId) {
        throw new Error('Branch org id required to accept bid');
      }

      if (!bid.branch_org_id) {
        throw new Error('Bid is missing branch_org_id');
      }

      if (bid.branch_org_id !== branchOrgId) {
        throw new Error('Branch mismatch for bid acceptance');
      }

      // Try backend endpoint first
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('No auth session');

      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
      const resp = await fetch(`${API_BASE_URL}/api/accept-bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ p_quote_id: bid.quote_id, p_bid_id: bidId, p_branch_org_id: branchOrgId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json?.ok) {
        console.log('✅ Bid accepted via backend endpoint');
        return { error: null };
      }

      // Fallback to RPC (direct)
      const { error } = await supabase.rpc('accept_bid_with_compliance', {
        p_quote_id: bid.quote_id,
        p_bid_id: bidId,
        p_branch_org_id: branchOrgId,
      } as any);
      if (error) throw error;
      console.log('✅ Bid accepted via direct RPC');
      return { error: null };
    } catch (err) {
      console.error('Error accepting bid:', err);
      return { error: err };
    }
  }
}

export class LogisticsPartnerService {
  // Get all active logistics partners with branch + company context
  static async getLogisticsPartners(): Promise<{
    data: LogisticsPartnerBranchRecord[] | null;
    error: any;
    meta: LogisticsPartnerFilterMeta;
  }> {
    const baseMeta: LogisticsPartnerFilterMeta = {
      branchFilterApplied: false,
      branchNetworkCount: 0,
      filteredOutBranches: [],
      branchNetworkAuthError: false,
      branchNetworkErrorMessage: null,
    };

    try {
      const { data, error } = await supabase
        .from('logistics_partners')
        .select(`
          *,
          root:organizations!logistics_partners_org_fk(
            id,
            name,
            parent_org_id,
            branch_name,
            branch_location_id,
            img_url,
            created_at
          )
        `)
        .eq('active', true)
        .order('name', { ascending: true });

      if (error) {
        return { data: null, error, meta: baseMeta };
      }

      const partnerRows: LogisticsPartnerQueryRow[] = (data as LogisticsPartnerQueryRow[]) || [];

      if (partnerRows.length === 0) {
        return { data: [], error: null, meta: baseMeta };
      }

      const rootOrgIds = Array.from(
        new Set(
          partnerRows
            .map(row => row.root?.id || row.org_id || null)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (rootOrgIds.length === 0) {
        console.warn('LogisticsPartnerService: no root organizations linked to partners');
        return { data: [], error: null, meta: baseMeta };
      }

      const { data: branchRows, error: branchError } = await supabase
        .from('organizations')
        .select('*')
        .in('parent_org_id', rootOrgIds);

      if (branchError) {
        console.warn('LogisticsPartnerService: failed to fetch branches for partners', branchError);
      }

      const branchesByParent = new Map<string, OrganizationRow[]>();
      (branchRows || []).forEach(branch => {
        if (!branch.parent_org_id) {
          return;
        }
        const normalized: OrganizationRow = {
          ...branch,
          parent_org_id: branch.parent_org_id ?? null,
          branch_name: branch.branch_name ?? null,
          branch_location_id: branch.branch_location_id ?? null,
        };
        const list = branchesByParent.get(branch.parent_org_id) || [];
        list.push(normalized);
        branchesByParent.set(branch.parent_org_id, list);
      });

      const shouldLoadBranchNetwork = Array.from(branchesByParent.values()).some(list => list.length > 0);

      let branchNetworkResult: { data: BranchNetworkEntry[]; error: Error | null } = {
        data: [],
        error: null,
      };
      let branchNetworkAuthError = false;
      let branchNetworkErrorMessage: string | null = null;

      if (shouldLoadBranchNetwork) {
        branchNetworkResult = await BranchNetworkClient.getBranchNetwork();
        if (branchNetworkResult.error) {
          if (branchNetworkResult.error instanceof BranchNetworkAuthError) {
            branchNetworkAuthError = true;
            branchNetworkErrorMessage = branchNetworkResult.error.message || null;
            console.warn(
              'LogisticsPartnerService: branch network auth error; continuing without filter',
              branchNetworkResult.error
            );
          } else {
            console.warn(
              'LogisticsPartnerService: branch network lookup failed; falling back to unfiltered partner list',
              branchNetworkResult.error
            );
          }
        }
      }

      const branchNetworkEntries = branchNetworkResult.data || [];
      const branchNetworkMap = new Map<string, BranchNetworkEntry>(
        branchNetworkEntries.map(entry => [entry.branchOrgId, entry])
      );
      const enforceFilter = !branchNetworkResult.error;

      const candidates: LogisticsPartnerBranchCandidate[] = [];

      partnerRows.forEach(row => {
        const rootOrg = row.root;
        const rootOrgId = rootOrg?.id || row.org_id || null;

        if (!rootOrgId) {
          console.warn('LogisticsPartnerService: skipping partner without identifiable root organization', {
            partnerId: row.id,
          });
          return;
        }

        const branchList = branchesByParent.get(rootOrgId);
        if (!branchList || branchList.length === 0) {
          console.warn('LogisticsPartnerService: partner has no branch organizations', {
            partnerId: row.id,
            rootOrgId,
          });
          return;
        }

        branchList.forEach(branch => {
          candidates.push({
            partner: row as LogisticsPartnerRow,
            branch,
            company: rootOrg || null,
          });
        });
      });

      if (candidates.length === 0) {
        const meta: LogisticsPartnerFilterMeta = {
          branchFilterApplied: enforceFilter,
          branchNetworkCount: branchNetworkEntries.length,
          filteredOutBranches: [],
          branchNetworkAuthError,
          branchNetworkErrorMessage,
        };
        return { data: [], error: null, meta };
      }

      const { included, filteredOut } = filterBranchesByNetwork(candidates, branchNetworkMap, enforceFilter);

      const meta: LogisticsPartnerFilterMeta = {
        branchFilterApplied: enforceFilter,
        branchNetworkCount: branchNetworkEntries.length,
        filteredOutBranches: filteredOut.map(candidate => ({
          ...candidate,
          branchNetwork: null,
        })),
        branchNetworkAuthError,
        branchNetworkErrorMessage,
      };

      return { data: included, error: null, meta };
    } catch (err) {
      console.error('LogisticsPartnerService.getLogisticsPartners unexpected error:', err);
      return { data: null, error: err, meta: baseMeta };
    }
  }

  // Get a single logistics partner
  static async getLogisticsPartner(id: string): Promise<{ data: LogisticsPartnerRow | null; error: any }> {
    const { data, error } = await supabase
      .from('logistics_partners')
      .select('*')
      .eq('id', id)
      .single();

    return { data, error };
  }

  // Create a new logistics partner
  static async createLogisticsPartner(partner: Omit<LogisticsPartnerRow, 'id' | 'created_at'>) {
    const { data, error } = await supabase
      .from('logistics_partners')
      .insert(partner)
      .select()
      .single();

    return { data, error };
  }

  // Update a logistics partner
  static async updateLogisticsPartner(id: string, updates: Partial<LogisticsPartnerRow>) {
    const { data, error } = await supabase
      .from('logistics_partners')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  // Deactivate a logistics partner
  static async deactivateLogisticsPartner(id: string) {
    const { error } = await supabase
      .from('logistics_partners')
      .update({ active: false })
      .eq('id', id);

    return { error };
  }
}

export class QuoteInviteService {
  // Create quote invites for selected logistics partners
  static async createQuoteInvites(quoteId: string, targets: QuoteInviteTarget[]) {
    const sanitizedTargets = (targets || []).filter((target) => Boolean(target?.logisticsPartnerId));
    if (sanitizedTargets.length === 0) {
      return { error: null };
    }

    const partnerIds = sanitizedTargets.map(target => target.logisticsPartnerId);
    const branchIds = sanitizedTargets.map(target => target.branchOrgId);

    const invalidSelections = new Set<string>();

    const { data: partnerRows, error: partnerError } = await supabase
      .from('logistics_partners')
      .select('id, org_id')
      .in('id', partnerIds);

    if (partnerError) {
      console.warn('QuoteInviteService.createQuoteInvites: unable to load partners for verification', partnerError);
    }

    const partnerOrgMap = new Map<string, string | null>();
    (partnerRows || []).forEach(row => {
      partnerOrgMap.set(row.id, row.org_id ?? null);
    });

    const { data: branchRows, error: branchError } = await supabase
      .from('organizations')
      .select('id, parent_org_id')
      .in('id', branchIds);

    if (branchError) {
      console.warn('QuoteInviteService.createQuoteInvites: unable to load branches for verification', branchError);
    }

    const branchParentMap = new Map<string, string | null>();
    (branchRows || []).forEach(row => {
      branchParentMap.set(row.id, row.parent_org_id ?? null);
    });

    sanitizedTargets.forEach(target => {
      const partnerRootOrgId = partnerOrgMap.get(target.logisticsPartnerId);
      if (!partnerRootOrgId) {
        console.warn('QuoteInviteService.createQuoteInvites: partner missing root organization; skipping', {
          quoteId,
          partnerId: target.logisticsPartnerId,
        });
        invalidSelections.add(target.branchOrgId);
        return;
      }

      const branchParentOrgId = branchParentMap.get(target.branchOrgId);
      if (!branchParentOrgId) {
        console.warn('QuoteInviteService.createQuoteInvites: branch not found; skipping', {
          quoteId,
          partnerId: target.logisticsPartnerId,
          branchOrgId: target.branchOrgId,
        });
        invalidSelections.add(target.branchOrgId);
        return;
      }

      if (branchParentOrgId !== partnerRootOrgId) {
        console.warn('QuoteInviteService.createQuoteInvites: branch does not belong to partner root; skipping', {
          quoteId,
          partnerId: target.logisticsPartnerId,
          branchOrgId: target.branchOrgId,
          expectedRootOrgId: partnerRootOrgId,
          actualParentOrgId: branchParentOrgId,
        });
        invalidSelections.add(target.branchOrgId);
      }
    });

    const validTargets = sanitizedTargets.filter(target => !invalidSelections.has(target.branchOrgId));
    if (validTargets.length === 0) {
      return { error: null };
    }

    const invites = validTargets.map(target => ({
      quote_id: quoteId,
      logistics_partner_id: target.logisticsPartnerId,
      branch_org_id: target.branchOrgId,
    }));

    const { error } = await supabase
      .from('quote_invites')
      .insert(invites);

    return { error };
  }

  // Update quote invites - remove old ones and add new ones
  static async updateQuoteInvites(quoteId: string, targets: QuoteInviteTarget[]) {
    try {
      // First, remove existing invites for this quote
      const { error: deleteError } = await supabase
        .from('quote_invites')
        .delete()
        .eq('quote_id', quoteId);

      if (deleteError) {
        return { error: deleteError };
      }

      // Then create new invites if any partners are selected
      if (targets.length > 0) {
        return await this.createQuoteInvites(quoteId, targets);
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  }

  // Get invited logistics partners for a quote
  static async getQuoteInvites(quoteId: string) {
    const { data, error } = await supabase
      .from('quote_invites')
      .select(`
        *,
        logistics_partner:logistics_partners(*)
      `)
      .eq('quote_id', quoteId);

    return { data, error };
  }

  // Get quotes that a logistics partner was invited to
  static async getInvitedQuotes(logisticsPartnerId: string) {
    const { data, error } = await supabase
      .from('quote_invites')
      .select(`
        *,
        quote:quotes(
          *,
          origin:locations!quotes_origin_id_fkey(*),
          destination:locations!quotes_destination_id_fkey(*)
        )
      `)
      .eq('logistics_partner_id', logisticsPartnerId)
      .order('invited_at', { ascending: false });

    return { data, error };
  }
} 
