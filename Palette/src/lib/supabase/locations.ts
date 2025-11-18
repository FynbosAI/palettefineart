import { supabase } from './client';
import { Database } from './types';

// Types for clarity
type LocationRow = Database['public']['Tables']['locations']['Row'];
type LocationInsert = Database['public']['Tables']['locations']['Insert'];

/**
 * Service helpers for working with the `locations` table.
 */
export class LocationService {
  /**
   * Look for a location with the same (case-insensitive) name.
   * If none exists, create it. Always returns the row that should be used.
   */
  static async findOrCreateLocation(name: string, addressFull: string, orgId: string): Promise<LocationRow> {
    const normalizedOrgId = orgId?.trim();
    if (!normalizedOrgId) {
      throw new Error('Missing organization context for location creation');
    }

    const normalizedAddress = addressFull.trim();
    const searchName = name.trim();

    const { data: existingByAddress, error: addressError } = await supabase
      .from('locations')
      .select('*')
      .eq('org_id', normalizedOrgId)
      .ilike('address_full', normalizedAddress)
      .maybeSingle();

    if (addressError && addressError.code !== 'PGRST116') {
      throw new Error(addressError.message);
    }

    if (existingByAddress) {
      return existingByAddress;
    }

    const { data: existingByName, error: nameError } = await supabase
      .from('locations')
      .select('*')
      .eq('org_id', normalizedOrgId)
      .ilike('name', searchName)
      .maybeSingle();

    if (nameError && nameError.code !== 'PGRST116') {
      throw new Error(nameError.message);
    }

    if (existingByName) {
      return existingByName;
    }

    const locationInsert: LocationInsert = {
      name: searchName,
      address_full: normalizedAddress,
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      org_id: normalizedOrgId,
    };

    const { data: created, error: insertError } = await supabase
      .from('locations')
      .insert(locationInsert)
      .select()
      .single();

    if (insertError || !created) {
      throw new Error(insertError?.message ?? 'Failed to insert location');
    }

    return created;
  }
}
