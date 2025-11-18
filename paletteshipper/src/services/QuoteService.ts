import { supabase } from '../lib/supabase';
import { getArtworkImageViewUrl } from '../../../shared/api/artworkImagesClient';

// Types
interface Quote {
  id: string;
  title: string;
  type: 'requested' | 'open' | 'direct';
  status: 'draft' | 'active' | 'closed' | 'archived' | 'completed' | 'cancelled';
  route?: string;
  origin_id?: string;
  destination_id?: string;
  target_date?: string;
  target_date_start?: string;
  target_date_end?: string;
  value?: number;
  description?: string;
  requirements?: any;
  owner_org_id: string;
  shipment_id?: string;
  created_at: string;
  updated_at: string;
  bidding_deadline?: string;
  auto_close_bidding?: boolean;
  delivery_specifics?: any;
  notes?: string;
  client_reference?: string;
  origin_contact_name?: string | null;
  origin_contact_phone?: string | null;
  origin_contact_email?: string | null;
  destination_contact_name?: string | null;
  destination_contact_phone?: string | null;
  destination_contact_email?: string | null;
}

interface Location {
  id: string;
  name: string;
  address_full: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
}

interface QuoteArtwork {
  id: string;
  quote_id: string;
  name: string;
  artist_name?: string;
  year_completed?: number;
  medium?: string;
  dimensions?: string;
  weight?: string;
  weight_value?: number | null;
  weight_unit?: string | null;
  volumetric_weight_value?: number | null;
  volumetric_weight_unit?: string | null;
  declared_value?: number;
  crating?: string;
  has_existing_crate?: boolean | null;
  category?: string | null;
  item_type?: string | null;
  period?: string | null;
  description?: string;
  image_url?: string;
  tariff_code?: string;
  country_of_origin?: string;
  export_license_required?: boolean;
  special_requirements?: any;
}

interface Organization {
  id: string;
  name: string;
  type: 'client' | 'partner';
  created_at: string;
  img_url?: string;
  parent_org_id?: string | null;
  branch_name?: string | null;
  branch_location_id?: string | null;
  company_id?: string | null;
  company?: Organization | null;
}

interface QuoteWithDetails extends Quote {
  origin?: Location;
  destination?: Location;
  quote_artworks?: QuoteArtwork[];
  owner_org?: Organization;
  bids?: any[];
}

export class QuoteService {
  private static async loadOrganizations(orgIds: string[]): Promise<Map<string, Organization>> {
    const uniqueOrgIds = Array.from(new Set((orgIds || []).filter((id): id is string => Boolean(id))));
    if (uniqueOrgIds.length === 0) {
      return new Map();
    }

    const { data: branchRows, error: branchError } = await supabase
      .from('organizations')
      .select('*')
      .in('id', uniqueOrgIds);

    if (branchError || !branchRows) {
      if (branchError) {
        console.warn('QuoteService.loadOrganizations branch fetch error:', branchError);
      }
      return new Map();
    }

    const parentIds = Array.from(
      new Set(
        branchRows
          .map((row: any) => row.parent_org_id)
          .filter((id: string | null | undefined): id is string => Boolean(id))
      )
    );

    const companyMap = new Map<string, Organization>();
    if (parentIds.length > 0) {
      const { data: companyRows, error: companyError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', parentIds);

      if (companyError) {
        console.warn('QuoteService.loadOrganizations company fetch error:', companyError);
      } else if (companyRows) {
        companyRows.forEach((row: any) => {
          companyMap.set(row.id, {
            id: row.id,
            name: row.name,
            type: row.type,
            created_at: row.created_at,
            img_url: row.img_url ?? undefined,
            parent_org_id: row.parent_org_id ?? null,
            branch_name: row.branch_name ?? null,
            branch_location_id: row.branch_location_id ?? null,
            company_id: null,
            company: null,
          });
        });
      }
    }

    const result = new Map<string, Organization>();
    branchRows.forEach((row: any) => {
      const company = row.parent_org_id ? companyMap.get(row.parent_org_id) || null : null;
      result.set(row.id, {
        id: row.id,
        name: row.name,
        type: row.type,
        created_at: row.created_at,
        img_url: row.img_url ?? undefined,
        parent_org_id: row.parent_org_id ?? null,
        branch_name: row.branch_name ?? null,
        branch_location_id: row.branch_location_id ?? null,
        company_id: row.parent_org_id ?? null,
        company,
      });
    });

    return result;
  }

  private static async attachOrganizationMetadata<T extends { owner_org_id?: string | null; owner_org?: Organization | null }>(items: T[]): Promise<T[]> {
    if (!items || items.length === 0) {
      return items;
    }

    const candidateOrgIds = items
      .map((item) => item.owner_org?.id ?? item.owner_org_id)
      .filter((id): id is string => Boolean(id));

    if (candidateOrgIds.length === 0) {
      return items;
    }

    const orgMap = await this.loadOrganizations(candidateOrgIds);

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

  /**
   * Get quotes available for a logistics partner to bid on
   */
  static async getAvailableQuotes(partnerId: string, branchOrgId?: string | null): Promise<{ 
    data: QuoteWithDetails[] | null; 
    error: any 
  }> {
    try {
      console.log('🔍 QuoteService.getAvailableQuotes - Starting with partnerId:', partnerId, 'branchOrgId:', branchOrgId);
      
      // First, get invited quote IDs for this partner
      const inviteQuery = supabase
        .from('quote_invites')
        .select(`
          quote_id,
          branch_org_id,
          quote:quotes (
            *,
            origin:locations!quotes_origin_id_fkey(*),
            destination:locations!quotes_destination_id_fkey(*),
            quote_artworks(*)
          )
        `)
        .eq('logistics_partner_id', partnerId);

      const inviteResult = branchOrgId
        ? await inviteQuery.eq('branch_org_id', branchOrgId)
        : await inviteQuery;

      const inviteError = inviteResult.error;
      const inviteRows = (inviteResult.data || []) as Array<{
        quote_id: string;
        branch_org_id: string | null;
        quote: QuoteWithDetails | null;
      }>;

      if (inviteError) {
        console.error('❌ Error fetching quote invites:', inviteError);
      }

      const invitedQuoteIds = inviteRows.map((inv) => inv.quote_id).filter(Boolean);
      const invitedQuoteIdSet = new Set(invitedQuoteIds);
      console.log('📋 Invited quote IDs:', invitedQuoteIds);

      const quotesById = new Map<string, QuoteWithDetails>();
      const missingHydrationIds: string[] = [];

      inviteRows.forEach((row) => {
        if (row.quote) {
          quotesById.set(row.quote.id, {
            ...row.quote,
            origin: row.quote.origin || undefined,
            destination: row.quote.destination || undefined,
            quote_artworks: row.quote.quote_artworks || [],
            owner_org: row.quote.owner_org || undefined,
          });
          if (!row.quote.quote_artworks || row.quote.quote_artworks.length === 0) {
            missingHydrationIds.push(row.quote.id);
          }
        } else if (row.quote_id) {
          missingHydrationIds.push(row.quote_id);
        }
      });

      const hydrateQuotes = async (ids: string[]) => {
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 50) {
          chunks.push(ids.slice(i, i + 50));
        }

        for (const chunk of chunks) {
          const { data, error } = await supabase
            .from('quotes')
            .select(`
              *,
              origin:locations!quotes_origin_id_fkey(*),
              destination:locations!quotes_destination_id_fkey(*),
              quote_artworks(*)
            `)
            .in('id', chunk);

          if (error) {
            console.error('❌ Error hydrating invited quotes:', error);
            throw error;
          }

          (data || []).forEach((quote: any) => {
            quotesById.set(quote.id, {
              ...quote,
              origin: quote.origin || undefined,
              destination: quote.destination || undefined,
              quote_artworks: quote.quote_artworks || [],
              owner_org: quote.owner_org || undefined,
            });
          });
        }
      };

      if (missingHydrationIds.length > 0) {
        console.log('💧 Hydrating quotes missing artwork metadata:', missingHydrationIds);
        await hydrateQuotes(missingHydrationIds);
      }

      const invitedQuotes = Array.from(quotesById.values()).filter(Boolean);

      const now = new Date();
      const eligibleQuotes = invitedQuotes.filter((quote) => {
        const status = quote.status as string | undefined;
        const type = quote.type as string | undefined;
        const invited = invitedQuoteIdSet.has(quote.id);
        const statusAllowed = status === 'draft' || status === 'active';
        const deadlineOk = !quote.bidding_deadline || new Date(quote.bidding_deadline) > now;
        const canBid = invited && statusAllowed;

        if (!canBid || !deadlineOk) {
          console.log('🛑 Filtering out quote not eligible under bids RLS:', {
            id: quote.id,
            status,
            type,
            invited,
            deadline: quote.bidding_deadline,
          });
          return false;
        }

        return true;
      });

      const sortedQuotes = eligibleQuotes.sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bDate - aDate;
      });

      const quotesWithOrg = await this.attachOrganizationMetadata(sortedQuotes);

      // Transform the data to match expected format
      const transformedData = quotesWithOrg.map(quote => ({
        ...quote,
        origin: quote.origin || undefined,
        destination: quote.destination || undefined,
        quote_artworks: quote.quote_artworks || [],
        owner_org: quote.owner_org || undefined,
      })) as QuoteWithDetails[];
      
      console.log('✅ QuoteService.getAvailableQuotes - Transformed data:', {
        count: transformedData.length,
        firstItem: transformedData[0]
      });
      
      // Enhanced debugging for organization data
      if (transformedData.length > 0) {
        const firstQuote = transformedData[0];
        console.log('🔍 QuoteService - Detailed first quote analysis:', {
          id: firstQuote.id,
          title: firstQuote.title,
          owner_org_id: firstQuote.owner_org_id,
          owner_org: firstQuote.owner_org,
          hasOwnerOrg: !!firstQuote.owner_org,
          ownerOrgKeys: firstQuote.owner_org ? Object.keys(firstQuote.owner_org) : 'N/A'
        });
      }
      
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('❌ QuoteService.getAvailableQuotes - Exception:', error);
      return { data: null, error };
    }
  }

  /**
   * Get detailed quote information including artworks
   */
  static async getQuoteDetails(quoteId: string): Promise<{ 
    data: QuoteWithDetails | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          quote_artworks(*),
          origin:locations!quotes_origin_id_fkey(*),
          destination:locations!quotes_destination_id_fkey(*),
          owner_org:organizations!quotes_owner_org_id_fkey(*),
          bids(
            id,
            status,
            amount,
            logistics_partner_id
          )
        `)
        .eq('id', quoteId)
        .single();

      if (error) throw error;
      
      const [quoteWithOrg] = await this.attachOrganizationMetadata(data ? [data] : []);

      // Transform the data
      const transformedData = quoteWithOrg ? {
        ...quoteWithOrg,
        origin: quoteWithOrg.origin || undefined,
        destination: quoteWithOrg.destination || undefined,
        quote_artworks: quoteWithOrg.quote_artworks || [],
        owner_org: quoteWithOrg.owner_org || undefined,
        bids: quoteWithOrg.bids || [],
      } as QuoteWithDetails : null;
      
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('QuoteService.getQuoteDetails error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get quotes by status
   */
  static async getQuotesByStatus(status: string, partnerId?: string): Promise<{ 
    data: QuoteWithDetails[] | null; 
    error: any 
  }> {
    try {
      let query = supabase
        .from('quotes')
        .select(`
          *,
          origin:locations!quotes_origin_id_fkey(*),
          destination:locations!quotes_destination_id_fkey(*),
          owner_org:organizations!quotes_owner_org_id_fkey(*),
          quote_artworks(count)
        `)
        .eq('status', status);

      // If partner ID provided, filter for visibility
      if (partnerId) {
        // Get invited quote IDs for this partner
        const { data: invitedQuotes } = await supabase
          .from('quote_invites')
          .select('quote_id')
          .eq('logistics_partner_id', partnerId);
        
        const invitedQuoteIds = invitedQuotes?.map(inv => inv.quote_id) || [];
        
        if (invitedQuoteIds.length > 0) {
          query = query.or(`type.eq.open,id.in.(${invitedQuoteIds.join(',')})`);
        } else {
          query = query.eq('type', 'open');
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const quotesWithOrg = await this.attachOrganizationMetadata(data || []);

      const transformedData = quotesWithOrg.map(quote => ({
        ...quote,
        origin: quote.origin || undefined,
        destination: quote.destination || undefined,
        quote_artworks: quote.quote_artworks || [],
        owner_org: quote.owner_org || undefined,
      })) as QuoteWithDetails[];
      
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('QuoteService.getQuotesByStatus error:', error);
      return { data: null, error };
    }
  }

  /**
   * Search quotes by various criteria
   */
  static async searchQuotes(searchTerm: string, partnerId?: string): Promise<{ 
    data: QuoteWithDetails[] | null; 
    error: any 
  }> {
    try {
      let query = supabase
        .from('quotes')
        .select(`
          *,
          origin:locations!quotes_origin_id_fkey(*),
          destination:locations!quotes_destination_id_fkey(*),
          owner_org:organizations!quotes_owner_org_id_fkey(*),
          quote_artworks(count)
        `)
        .or(`title.ilike.%${searchTerm}%,route.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);

      // If partner ID provided, filter for visibility
      if (partnerId) {
        // Get invited quote IDs for this partner
        const { data: invitedQuotes } = await supabase
          .from('quote_invites')
          .select('quote_id')
          .eq('logistics_partner_id', partnerId);
        
        const invitedQuoteIds = invitedQuotes?.map(inv => inv.quote_id) || [];
        
        if (invitedQuoteIds.length > 0) {
          query = query.or(`type.eq.open,id.in.(${invitedQuoteIds.join(',')})`);
        } else {
          query = query.eq('type', 'open');
        }
      }

      const { data, error } = await query
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const quotesWithOrg = await this.attachOrganizationMetadata(data || []);

      const transformedData = quotesWithOrg.map(quote => ({
        ...quote,
        origin: quote.origin || undefined,
        destination: quote.destination || undefined,
        quote_artworks: quote.quote_artworks || [],
        owner_org: quote.owner_org || undefined,
      })) as QuoteWithDetails[];
      
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('QuoteService.searchQuotes error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get quotes with upcoming deadlines
   */
  static async getUpcomingDeadlines(partnerId: string, daysAhead: number = 7): Promise<{ 
    data: QuoteWithDetails[] | null; 
    error: any 
  }> {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      
      // Get invited quote IDs for this partner
      const { data: invitedQuotes } = await supabase
        .from('quote_invites')
        .select('quote_id')
        .eq('logistics_partner_id', partnerId);
      
      const invitedQuoteIds = invitedQuotes?.map(inv => inv.quote_id) || [];
      
      let query = supabase
        .from('quotes')
        .select(`
          *,
          origin:locations!quotes_origin_id_fkey(*),
          destination:locations!quotes_destination_id_fkey(*),
          owner_org:organizations!quotes_owner_org_id_fkey(*),
          quote_artworks(count)
        `)
        .eq('status', 'active')
        .lte('bidding_deadline', futureDate.toISOString())
        .gte('bidding_deadline', new Date().toISOString());
      
      if (invitedQuoteIds.length > 0) {
        query = query.or(`type.eq.open,id.in.(${invitedQuoteIds.join(',')})`);
      } else {
        query = query.eq('type', 'open');
      }
      
      const { data, error } = await query.order('bidding_deadline', { ascending: true });

      if (error) throw error;

      const quotesWithOrg = await this.attachOrganizationMetadata(data || []);

      const transformedData = quotesWithOrg.map(quote => ({
        ...quote,
        origin: quote.origin || undefined,
        destination: quote.destination || undefined,
        quote_artworks: quote.quote_artworks || [],
        owner_org: quote.owner_org || undefined,
      })) as QuoteWithDetails[];
      
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('QuoteService.getUpcomingDeadlines error:', error);
      return { data: null, error };
    }
  }

  static async getArtworkImageViewUrl(artworkId: string, accessToken?: string) {
    let token = accessToken;

    if (!token) {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }
      token = data.session?.access_token || '';
    }

    if (!token) {
      throw new Error('Not authenticated');
    }

    return getArtworkImageViewUrl({ artworkId, accessToken: token });
  }
}
