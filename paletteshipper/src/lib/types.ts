import type { DeadlineState } from './deadline';
export interface Quote {
  id: string;
  title: string;
  status: 'draft' | 'open' | 'closed' | 'cancelled' | 'closing_soon';
  type: 'requested' | 'auction' | 'direct';
  route: string | null;
  target_date_start: string | null;
  target_date_end: string | null;
  target_date: string | null;
  value: number | null;
  description: string | null;
  bidding_deadline: string | null;
  auto_close_bidding?: boolean;
  created_at: string;
  updated_at: string;
  origin?: {
    name: string;
  }[] | null;
  destination?: {
    name: string;
  }[] | null;
  owner_org?: {
    name: string;
  }[] | null;
  bids?: {
    count: number;
  }[];
  shipments?: {
    artworks: {
      count: number;
    }[];
  }[];
  origin_contact_name?: string | null;
  origin_contact_phone?: string | null;
  origin_contact_email?: string | null;
  destination_contact_name?: string | null;
  destination_contact_phone?: string | null;
  destination_contact_email?: string | null;
}

export interface QuoteRequest {
  id: string;
  title: string;
  status: 'draft' | 'open' | 'closed' | 'cancelled' | 'closing_soon';
  type: 'requested' | 'auction' | 'direct';
  gallery: string;
  pickupDate: string;
  auctionDeadline: string;
  artworkCount: number;
  totalValue: number;
  specialRequirements: string[];
  currentBids: number;
  timeLeft: string;
  deadlineState: DeadlineState;
  autoCloseBidding: boolean;
  targetDate: string;
  origin: string;
  destination: string;
  route: string;
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupContactEmail?: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  deliveryContactEmail?: string;
} 
