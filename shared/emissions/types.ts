export type TransportMode = 'air' | 'sea' | 'truck';

export type WeightSource = 'artwork_sum' | 'fallback';

export interface WeightBreakdownEntry {
  artworkId?: string;
  artworkName?: string | null;
  rawWeight?: string | null;
  parsedKilograms?: number | null;
  interpretedUnit?: string | null;
}

export interface BidEmissionsContext {
  bidId?: string;
  quoteId?: string;
  calculatedByUserId?: string;
  selectedModes?: TransportMode[];
  recognizedSubItemIds?: string[];
  sourceLineItemCategories?: string[];
  unknownSubItemIds?: string[];
  weightSource?: WeightSource;
  weightTotalKilograms?: number;
  weightBreakdown?: WeightBreakdownEntry[];
  warnings?: string[];
  requestedAt?: string;
}

export interface BidEmissionsRequestPayload {
  mode: TransportMode;
  weightKg: number;
  originText: string;
  destinationText: string;
  context?: BidEmissionsContext;
}

export interface BidEmissionsResultPayload {
  km?: number;
  tkm?: number;
  emissionsKg?: {
    tot?: number;
    ops?: number;
    ene?: number;
    totEiGrPerTkm?: number;
  };
  raw?: unknown;
}

export interface BidEmissionsSuccessResponse {
  ok: true;
  mode: TransportMode;
  calculationId?: string | null;
  co2Estimate?: number | null;
  warnings?: string[];
  inputs?: unknown;
  result?: BidEmissionsResultPayload;
}

export interface BidEmissionsErrorResponse {
  ok: false;
  error: string;
  details?: string;
}

export type BidEmissionsBackendResponse =
  | BidEmissionsSuccessResponse
  | BidEmissionsErrorResponse;
