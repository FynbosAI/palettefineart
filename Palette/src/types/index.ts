export interface Artwork {
  id: string;
  title: string;
  artist: string;
  year: string;
  description: string;
  imageUrl: string;
  value: number;
  dimensions: string;
  medium: string;
  countryOfOrigin: string;
  currentCustomsStatus: string;
  isFragile?: boolean; // Added for Christie's requirements
  weight?: string;
  category?: string;
  itemType?: string;
  period?: string;
  weightValue?: number;
  weightUnit?: string;
  volumetricWeightValue?: number;
  volumetricWeightUnit?: string;
  hasExistingCrate?: boolean;
}

export enum TransportMode {
  Ground = 'Ground',
  Air = 'Air',
  Sea = 'Sea',
  Courier = 'Courier',
  FedExFreight = 'FedEx Freight'
}

export enum TransportType {
  Dedicated = 'Dedicated',
  Shuttle = 'Shuttle',
  Consolidated = 'Consolidated'
}

export interface SelectedShipperContext {
  logisticsPartnerId: string;
  branchOrgId: string;
  companyOrgId: string | null;
}

export interface Shipper {
  logisticsPartnerId: string;
  branchOrgId: string;
  companyOrgId: string | null;
  companyName: string;
  branchName: string;
  displayName: string;
  abbreviation?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
}

export interface ChristiesAutoSelection {
  packingRequirements: string[];
  safetySecurityRequirements: string[];
  serviceInclusions: string[];
  conditionCheckRequirements: string[];
}

export interface ShipmentDetails {
  transportMode: TransportMode;
  transportType: TransportType | null;
  arrivalDate: string;
  selectedShippers: Set<string>;
  selectedShipperContexts: Map<string, SelectedShipperContext>;
  christiesAutoSelection?: ChristiesAutoSelection;
}
