import type { Database } from '../lib/supabase/types';

type BidStatus = Database['public']['Enums']['bid_status'];

export interface GalleryBidEvent {
  id: string;
  quote_id: string;
  gallery_org_id: string;
  amount: number;
  status: BidStatus;
  updated_at: string | null;
}
