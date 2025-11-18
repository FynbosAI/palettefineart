import { supabase } from '../lib/supabase';

// Types
interface LogisticsPartner {
  id: string;
  name: string;
  abbreviation: string;
  brand_color?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_name?: string;
  website?: string;
  specialties?: string[];
  regions?: string[];
  active?: boolean;
  org_id?: string;
  branch_org_id?: string;
  branch_name?: string | null;
  company_org_id?: string | null;
  company_name?: string | null;
  rating?: number;
  created_at?: string;
}

interface Organization {
  id: string;
  name: string;
  type: 'client' | 'partner';
  created_at: string;
}

interface PartnerWithDetails extends LogisticsPartner {
  total_shipments?: number;
  total_bids?: number;
  success_rate?: number;
}

export class PartnerService {
  /**
   * Get all active logistics partners
   */
  static async getAllPartners(): Promise<{ 
    data: LogisticsPartner[] | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('logistics_partners')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      return { data: (data as LogisticsPartner[]) || [], error: null };
    } catch (error) {
      console.error('PartnerService.getAllPartners error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get partner details by ID
   */
  static async getPartnerDetails(partnerId: string): Promise<{ 
    data: PartnerWithDetails | null; 
    error: any 
  }> {
    try {
      const { data: partner, error: partnerError } = await supabase
        .from('logistics_partners')
        .select('*')
        .eq('id', partnerId)
        .single();

      if (partnerError) throw partnerError;

      // Get additional statistics
      const { data: bids } = await supabase
        .from('bids')
        .select('status')
        .eq('logistics_partner_id', partnerId);

      const { data: shipments } = await supabase
        .from('shipments')
        .select('id')
        .eq('logistics_partner_id', partnerId);

      const totalBids = bids?.length || 0;
      const acceptedBids = bids?.filter(b => b.status === 'accepted').length || 0;
      const rejectedBids = bids?.filter(b => b.status === 'rejected').length || 0;

      const partnerWithDetails: PartnerWithDetails = {
        ...partner,
        total_shipments: shipments?.length || 0,
        total_bids: totalBids,
        success_rate: totalBids > 0 
          ? ((acceptedBids / (acceptedBids + rejectedBids)) * 100) || 0
          : 0
      };

      return { data: partnerWithDetails, error: null };
    } catch (error) {
      console.error('PartnerService.getPartnerDetails error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get partners by region
   */
  static async getPartnersByRegion(region: string): Promise<{ 
    data: LogisticsPartner[] | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('logistics_partners')
        .select('*')
        .contains('regions', [region])
        .eq('active', true)
        .order('rating', { ascending: false });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('PartnerService.getPartnersByRegion error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get partners by specialty
   */
  static async getPartnersBySpecialty(specialty: string): Promise<{ 
    data: LogisticsPartner[] | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('logistics_partners')
        .select('*')
        .contains('specialties', [specialty])
        .eq('active', true)
        .order('rating', { ascending: false });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('PartnerService.getPartnersBySpecialty error:', error);
      return { data: null, error };
    }
  }

  /**
   * Search partners by name or abbreviation
   */
  static async searchPartners(searchTerm: string): Promise<{ 
    data: LogisticsPartner[] | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('logistics_partners')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,abbreviation.ilike.%${searchTerm}%`)
        .eq('active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('PartnerService.searchPartners error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get partner statistics
   */
  static async getPartnerStatistics(partnerId: string): Promise<{ 
    data: {
      totalShipments: number;
      activeShipments: number;
      deliveredShipments: number;
      totalBids: number;
      acceptedBids: number;
      pendingBids: number;
      successRate: number;
      averageRating: number;
      totalValue: number;
      regions: string[];
      specialties: string[];
    } | null; 
    error: any 
  }> {
    try {
      // Get partner details
      const { data: partner, error: partnerError } = await supabase
        .from('logistics_partners')
        .select('*')
        .eq('id', partnerId)
        .single();

      if (partnerError) throw partnerError;

      // Get shipment statistics
      const { data: shipments } = await supabase
        .from('shipments')
        .select('status, total_value')
        .eq('logistics_partner_id', partnerId);

      // Get bid statistics
      const { data: bids } = await supabase
        .from('bids')
        .select('status, amount')
        .eq('logistics_partner_id', partnerId);

      const totalShipments = shipments?.length || 0;
      const activeShipments = shipments?.filter(s => 
        ['in_transit', 'pending', 'checking', 'collected'].includes(s.status)
      ).length || 0;
      const deliveredShipments = shipments?.filter(s => s.status === 'delivered').length || 0;

      const totalBids = bids?.length || 0;
      const acceptedBids = bids?.filter(b => b.status === 'accepted').length || 0;
      const pendingBids = bids?.filter(b => b.status === 'pending').length || 0;
      const rejectedBids = bids?.filter(b => b.status === 'rejected').length || 0;

      const successRate = (acceptedBids + rejectedBids) > 0
        ? (acceptedBids / (acceptedBids + rejectedBids)) * 100
        : 0;

      const totalValue = shipments?.reduce((sum, s) => sum + (s.total_value || 0), 0) || 0;

      return { 
        data: {
          totalShipments,
          activeShipments,
          deliveredShipments,
          totalBids,
          acceptedBids,
          pendingBids,
          successRate,
          averageRating: partner.rating || 0,
          totalValue,
          regions: partner.regions || [],
          specialties: partner.specialties || []
        }, 
        error: null 
      };
    } catch (error) {
      console.error('PartnerService.getPartnerStatistics error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get top partners by rating
   */
  static async getTopPartners(limit: number = 10): Promise<{ 
    data: LogisticsPartner[] | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('logistics_partners')
        .select('*')
        .eq('active', true)
        .order('rating', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('PartnerService.getTopPartners error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get partners with specific capabilities for a quote
   */
  static async getPartnersForQuote(
    regions: string[], 
    specialRequirements: string[]
  ): Promise<{ 
    data: LogisticsPartner[] | null; 
    error: any 
  }> {
    try {
      let query = supabase
        .from('logistics_partners')
        .select('*')
        .eq('active', true);

      // Filter by regions if provided
      if (regions && regions.length > 0) {
        query = query.overlaps('regions', regions);
      }

      // Filter by specialties if special requirements provided
      if (specialRequirements && specialRequirements.length > 0) {
        const specialtyMapping: { [key: string]: string } = {
          'climate_control': 'climate_controlled',
          'high_security': 'high_value',
          'white_glove': 'white_glove',
          'oversized': 'oversized_cargo',
          'fragile': 'fragile_items'
        };

        const requiredSpecialties = specialRequirements
          .map(req => specialtyMapping[req])
          .filter(Boolean);

        if (requiredSpecialties.length > 0) {
          query = query.overlaps('specialties', requiredSpecialties);
        }
      }

      const { data, error } = await query.order('rating', { ascending: false });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('PartnerService.getPartnersForQuote error:', error);
      return { data: null, error };
    }
  }

  /**
   * Update partner profile
   */
  static async updatePartnerProfile(
    partnerId: string,
    updates: Partial<LogisticsPartner>
  ): Promise<{ 
    data: LogisticsPartner | null; 
    error: any 
  }> {
    try {
      const { data, error } = await supabase
        .from('logistics_partners')
        .update(updates)
        .eq('id', partnerId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('PartnerService.updatePartnerProfile error:', error);
      return { data: null, error };
    }
  }
}
