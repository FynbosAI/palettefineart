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
  static async findOrCreateLocation(name: string, addressFull: string): Promise<LocationRow> {
    // 1. Try to find existing
    const { data: existing, error: selectError } = await supabase
      .from('locations')
      .select('*')
      .ilike('name', name)
      .single();

    if (existing && !selectError) {
      return existing;
    }

    // 2. Insert new location
    const locationInsert: LocationInsert = {
      name,
      address_full: addressFull,
      contact_name: null,
      contact_phone: null,
      contact_email: null,
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