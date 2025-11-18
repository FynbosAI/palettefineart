// Base types for organization-specific standards

export interface TransportRequirements {
  packingGuidelines?: string[];
  deliveryRequirements?: string[];
  safetySecurityRequirements?: string[];
  conditionCheckRequirements?: string[];
  serviceInclusions?: string[];
}

export interface ValueRange {
  min: number;
  max: number;
  requirements: TransportRequirements;
}

export interface TransportModeStandards {
  transportMethod: string;
  transportType?: string;
  valueRanges: ValueRange[];
}

export interface OrganizationStandardsConfig {
  organizationId?: string;
  organizationNames: string[]; // Multiple names/patterns to match
  displayName: string;
  standards: TransportModeStandards[];
}

export interface AppliedStandards {
  packingRequirements?: string;
  deliveryRequirements?: Set<string>;
  safetySecurityRequirements?: Set<string>;
  conditionCheckRequirements?: Set<string>;
  serviceInclusions?: string[];
  source: string; // Which organization's standards were applied
}

export interface OrganizationStandardsProvider {
  // Core identification
  getConfig(): OrganizationStandardsConfig;
  isApplicableToOrganization(orgName?: string, orgId?: string): boolean;
  
  // Standards application
  getApplicableStandards(
    transportMode: string,
    transportType: string | undefined,
    totalValue: number,
    isFragile?: boolean
  ): AppliedStandards | null;
  
  // Display helpers
  getDisplayName(): string;
  getNotificationMessage(
    transportMode: string,
    transportType: string | undefined,
    totalValue: number,
    formattedTotalValue?: string
  ): string;
}
