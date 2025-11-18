import type {
  BidEmissionsContext,
  BidEmissionsRequestPayload,
  TransportMode,
  WeightBreakdownEntry,
  WeightSource,
} from '../../../../shared/emissions/types';

export interface MovementLineItemSnapshot {
  category: string;
  description: string[];
}

export interface QuoteLocationLike {
  address_full?: string | null;
  name?: string | null;
}

export interface QuoteArtworkWeightLike {
  id: string;
  name?: string | null;
  weight?: string | null;
  weight_value?: number | null;
  weight_unit?: string | null;
  volumetric_weight_value?: number | null;
  volumetric_weight_unit?: string | null;
}

export interface QuoteLike {
  id: string;
  origin?: QuoteLocationLike | null;
  destination?: QuoteLocationLike | null;
  quote_artworks?: QuoteArtworkWeightLike[] | null;
}

export interface WeightComputation {
  totalKilograms: number;
  source: WeightSource;
  breakdown: WeightBreakdownEntry[];
  warnings: string[];
}

export interface ModeComputation {
  primaryMode: TransportMode;
  selectedModes: TransportMode[];
  recognizedSubItemIds: string[];
  sourceLineItemCategories: string[];
  unknownSubItemIds: string[];
  warnings: string[];
}

export interface BuildBidEmissionsParams {
  bidId: string;
  quoteId: string;
  lineItems: MovementLineItemSnapshot[];
  quote: QuoteLike | null;
  userId?: string | null;
}

export interface BuildBidEmissionsResult {
  payload: BidEmissionsRequestPayload | null;
  warnings: string[];
  modeComputation: ModeComputation;
  weightComputation: WeightComputation;
  originText?: string;
  destinationText?: string;
}

const MOVEMENT_CATEGORY_PREFIX = 'movement_routing';

const SUBITEM_MODE_MAP: Record<string, TransportMode> = {
  // Air
  export_air: 'air',
  export_air_mib: 'air',
  cross_trade_air: 'air',
  import_air: 'air',
  import_air_mib: 'air',
  // Courier (assume air express, but retain option to revisit)
  export_courier: 'air',
  import_courier: 'air',

  // Sea
  export_fcl: 'sea',
  export_lcl: 'sea',
  cross_trade_fcl: 'sea',
  cross_trade_sea_lcl: 'sea',
  import_fcl: 'sea',
  import_lcl: 'sea',

  // Truck / Road
  domestic_move: 'truck',
  domestic_move_into_storage: 'truck',
  domestic_move_out_of_storage: 'truck',
  emergency_art_evacuation: 'truck',
  export_road_dedicated: 'truck',
  export_road_groupage: 'truck',
  export_road_agent: 'truck',
  cross_trade_road: 'truck',
  import_road_dedicated: 'truck',
  import_road_groupage: 'truck',
  import_road_agent: 'truck',
};

const FALLBACK_MODE: TransportMode = 'truck';
const DEFAULT_WEIGHT_KG = 20;
const LB_TO_KG = 0.45359237;

export function deriveTransportMode(lineItems: MovementLineItemSnapshot[]): ModeComputation {
  const recognized: string[] = [];
  const lineItemCategories: string[] = [];
  const unknown: string[] = [];
  const warnings: string[] = [];

  for (const item of lineItems) {
    if (!item || typeof item.category !== 'string') continue;
    if (!item.category.startsWith(MOVEMENT_CATEGORY_PREFIX)) continue;

    const descriptions = Array.isArray(item.description) ? item.description : [];
    let anyRecognized = false;

    for (const raw of descriptions) {
      const subId = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (!subId) continue;
      const mapped = SUBITEM_MODE_MAP[subId];
      if (mapped) {
        recognized.push(subId);
        anyRecognized = true;
      } else {
        unknown.push(subId);
      }
    }

    if (anyRecognized && !lineItemCategories.includes(item.category)) {
      lineItemCategories.push(item.category);
    }
  }

  const uniqueModes: TransportMode[] = Array.from(
    new Set(recognized.map((subId) => SUBITEM_MODE_MAP[subId]))
  ) as TransportMode[];

  if (uniqueModes.length === 0) {
    warnings.push('No recognized transport sub-items selected; defaulting emissions mode to truck.');
  }
  if (uniqueModes.length > 1) {
    warnings.push(`Multiple transport modes selected (${uniqueModes.join(', ')}); using the first option.`);
  }
  if (unknown.length > 0) {
    const sample = unknown.slice(0, 6).join(', ');
    warnings.push(`Unrecognized transport sub-items ignored for emissions: ${sample}${unknown.length > 6 ? '…' : ''}`);
  }

  const primaryMode = uniqueModes.length > 0 ? uniqueModes[0] : FALLBACK_MODE;

  return {
    primaryMode,
    selectedModes: uniqueModes.length > 0 ? uniqueModes : [primaryMode],
    recognizedSubItemIds: Array.from(new Set(recognized)),
    sourceLineItemCategories: lineItemCategories,
    unknownSubItemIds: Array.from(new Set(unknown)),
    warnings,
  };
}

export function computeWeightFromArtworks(quote: QuoteLike | null): WeightComputation {
  const breakdown: WeightBreakdownEntry[] = [];

  const convertToKg = (value: number, unit?: string | null) => {
    if (!Number.isFinite(value)) return null;
    const normalizedUnit = (unit || 'kg').toLowerCase();
    if (normalizedUnit === 'lb' || normalizedUnit === 'lbs' || normalizedUnit === 'pound' || normalizedUnit === 'pounds') {
      return value * LB_TO_KG;
    }
    return value;
  };

  const parseLegacyWeight = (value?: string | null) => {
    if (!value) return { parsed: null as number | null, interpretedUnit: null as WeightSource | null };
    const numericMatch = value.replace(/,/g, '').match(/([\d.]+)/);
    if (!numericMatch) return { parsed: null, interpretedUnit: null };
    const numericVal = parseFloat(numericMatch[1]);
    if (!Number.isFinite(numericVal)) return { parsed: null, interpretedUnit: null };
    const lowered = value.toLowerCase();
    let unit: WeightSource | null = null;
    let parsedKg: number | null = null;
    if (lowered.includes('lb')) {
      parsedKg = convertToKg(numericVal, 'lb');
      unit = 'imperial';
    } else if (lowered.includes('kg')) {
      parsedKg = convertToKg(numericVal, 'kg');
      unit = 'metric';
    }
    return { parsed: parsedKg, interpretedUnit: unit };
  };

  if (quote?.quote_artworks && quote.quote_artworks.length > 0) {
    for (const artwork of quote.quote_artworks) {
      let parsedKilograms: number | null = null;
      let interpretedUnit: WeightSource | null = null;

      if (typeof artwork.weight_value === 'number') {
        parsedKilograms = convertToKg(artwork.weight_value, artwork.weight_unit || 'kg');
        interpretedUnit = (artwork.weight_unit?.toLowerCase().includes('lb') ? 'imperial' : 'metric');
      } else if (typeof artwork.volumetric_weight_value === 'number') {
        parsedKilograms = convertToKg(artwork.volumetric_weight_value, artwork.volumetric_weight_unit || 'kg');
        interpretedUnit = 'volumetric';
      } else {
        const legacy = parseLegacyWeight(artwork.weight || null);
        parsedKilograms = legacy.parsed;
        interpretedUnit = legacy.interpretedUnit;
      }

      breakdown.push({
        artworkId: artwork.id,
        artworkName: artwork.name,
        rawWeight: artwork.weight ?? null,
        parsedKilograms,
        interpretedUnit,
      });
    }
  }

  const recognized = breakdown.filter(entry => typeof entry.parsedKilograms === 'number' && Number.isFinite(entry.parsedKilograms));
  const totalKilograms = recognized.length > 0
    ? recognized.reduce((sum, entry) => sum + (entry.parsedKilograms || 0), 0)
    : DEFAULT_WEIGHT_KG;

  const warnings: string[] = [];
  if (recognized.length === 0) {
    warnings.push('No artwork weights provided; using default 20 kg baseline for emissions.');
  }

  return {
    totalKilograms,
    source: recognized.length > 0 ? 'artwork_sum' : 'fallback',
    breakdown,
    warnings,
  };
}

function pickLocationText(location?: QuoteLocationLike | null): string | undefined {
  if (!location) return undefined;
  if (location.address_full && location.address_full.trim().length > 0) {
    return location.address_full.trim();
  }
  if (location.name && location.name.trim().length > 0) {
    return location.name.trim();
  }
  return undefined;
}

export function buildBidEmissionsPayload(params: BuildBidEmissionsParams): BuildBidEmissionsResult {
  const { bidId, quoteId, lineItems, quote, userId } = params;
  const modeComputation = deriveTransportMode(lineItems);
  const weightComputation = computeWeightFromArtworks(quote);
  const warnings = [...modeComputation.warnings, ...weightComputation.warnings];

  const originText = pickLocationText(quote?.origin);
  const destinationText = pickLocationText(quote?.destination);

  if (!quote) {
    warnings.push('Quote details unavailable; skipping emissions calculation.');
  }
  if (!originText) {
    warnings.push('Quote origin missing; skipping emissions calculation.');
  }
  if (!destinationText) {
    warnings.push('Quote destination missing; skipping emissions calculation.');
  }

  const hasRequiredInputs = Boolean(quote && originText && destinationText);

  if (!hasRequiredInputs) {
    return {
      payload: null,
      warnings,
      modeComputation,
      weightComputation,
      originText,
      destinationText,
    };
  }

  const sanitizedWeight = weightComputation.totalKilograms > 0
    ? Number(weightComputation.totalKilograms.toFixed(3))
    : DEFAULT_WEIGHT_KG;

  const mergedWarnings = Array.from(new Set(warnings));

  const metadata: BidEmissionsContext = {
    bidId,
    quoteId,
    calculatedByUserId: userId || undefined,
    selectedModes: modeComputation.selectedModes,
    recognizedSubItemIds: modeComputation.recognizedSubItemIds,
    sourceLineItemCategories: modeComputation.sourceLineItemCategories,
    unknownSubItemIds: modeComputation.unknownSubItemIds,
    weightSource: weightComputation.source,
    weightTotalKilograms: sanitizedWeight,
    weightBreakdown: weightComputation.breakdown,
    warnings: mergedWarnings,
    requestedAt: new Date().toISOString(),
  };

  return {
    payload: {
      mode: modeComputation.primaryMode,
      weightKg: sanitizedWeight,
      originText: originText!,
      destinationText: destinationText!,
      context: metadata,
    },
    warnings: mergedWarnings,
    modeComputation,
    weightComputation,
    originText,
    destinationText,
  };
}

export const __testing = {
  SUBITEM_MODE_MAP,
  MOVEMENT_CATEGORY_PREFIX,
  FALLBACK_MODE,
  DEFAULT_WEIGHT_KG,
};
