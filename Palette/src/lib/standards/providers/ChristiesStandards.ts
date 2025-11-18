import { 
  OrganizationStandardsProvider, 
  OrganizationStandardsConfig, 
  AppliedStandards,
  TransportModeStandards
} from '../types';
import { ORG_IDS } from '../OrganizationIds';

export class ChristiesStandards implements OrganizationStandardsProvider {
  private config: OrganizationStandardsConfig = {
    // Primary identification by org ID (most reliable)
    // Uses environment variable if available, falls back to hardcoded value
    organizationId: ORG_IDS.CHRISTIES,
    
    // Fallback name patterns for backwards compatibility
    organizationNames: [
      'christie\'s',
      'christies',
      'christie'
    ],
    displayName: 'Christie\'s',
    standards: [
      {
        transportMethod: 'Sea',
        valueRanges: [
          {
            min: 0,
            max: 1000000, // Up to $1 Million
            requirements: {
              packingGuidelines: [
                'Up to $250K / £180K - Tri Wall Cardboard',
                'Over $250K / £180K or Fragile - Standard Crate',
                'Up to $1M Rokbox (preferred for 2D)'
              ],
              deliveryRequirements: [
                'Ground Floor/Curbside Delivery'
              ],
              safetySecurityRequirements: [
                'Climate-Controlled Container', // Reefer Container
                'Two-Person Delivery Team', // 2 x Drivers
                'Air-Ride Suspension Vehicle', // Air-Ride
                'GPS Tracking' // GPS for collection & delivery
              ],
              conditionCheckRequirements: [
                'Pre-Collection Inspection',
                'Photo Documentation (2+ photos)'
              ]
            }
          }
        ]
      },
      {
        transportMethod: 'Ground',
        transportType: 'Dedicated',
        valueRanges: [
          {
            min: 0,
            max: 200000000, // Up to $200 Million
            requirements: {
              packingGuidelines: [
                'Up to $250K / £180K - Soft Wrapped',
                'Over $250K / £180K or Fragile - Standard Crate',
                'Over $1M - Higher Spec Crate with Tilt and Impact Detectors',
                'Over $5 Million Sub Museum or higher with Tilt & Impact Detectors',
                'Up to $5M Rokbox'
              ],
              deliveryRequirements: [
                'Ground Floor/Curbside Delivery'
              ],
              safetySecurityRequirements: [
                'Two-Person Delivery Team',
                'Air-Ride Suspension Vehicle',
                'GPS Tracking'
              ],
              conditionCheckRequirements: [
                'Pre-Collection Inspection',
                'Photo Documentation (2+ photos)'
              ]
            }
          }
        ]
      },
      {
        transportMethod: 'Ground',
        transportType: 'Consolidated',
        valueRanges: [
          {
            min: 0,
            max: 20000000, // Up to $20 Million
            requirements: {
              packingGuidelines: [
                'Up to $250K / £180K - Soft Wrapped',
                'Over $250K / £180K or Fragile - Standard Crate',
                'Over $1M - Higher Spec Crate with Tilt and Impact Detectors',
                'Over $5 Million Sub Museum or higher with Tilt & Impact Detectors',
                'Up to $5M Rokbox'
              ],
              deliveryRequirements: [
                'Ground Floor/Curbside Delivery'
              ],
              safetySecurityRequirements: [
                'Two-Person Delivery Team',
                'Air-Ride Suspension Vehicle',
                'GPS Tracking'
              ],
              conditionCheckRequirements: [
                'Pre-Collection Inspection',
                'Photo Documentation (2+ photos)'
              ]
            }
          }
        ]
      },
      {
        transportMethod: 'Courier',
        valueRanges: [
          {
            min: 0,
            max: 250000, // Up to $250K
            requirements: {
              packingGuidelines: [
                'Up to $250K / £180K - Tri Wall Cardboard',
                'Fragile - Standard Crate'
              ],
              deliveryRequirements: [
                'Signature on Delivery'
              ],
              safetySecurityRequirements: [
                'Fixed Delivery Address',
                'No Redirection Allowed'
              ],
              conditionCheckRequirements: [
                'Basic Condition Notes'
              ]
            }
          }
        ]
      },
      {
        transportMethod: 'FedEx Freight',
        valueRanges: [
          {
            min: 0,
            max: 1000000, // Up to $1 Million
            requirements: {
              packingGuidelines: [
                'Standard Crate'
              ],
              deliveryRequirements: [
                'Ground Floor/Curbside Delivery'
              ],
              safetySecurityRequirements: [
                'Two-Person Delivery Team'
              ],
              conditionCheckRequirements: [
                'Pre-Collection Inspection',
                'Photo Documentation (2+ photos)'
              ]
            }
          }
        ]
      },
      {
        transportMethod: 'Air',
        valueRanges: [
          {
            min: 0,
            max: 200000000, // Up to $200 Million
            requirements: {
              packingGuidelines: [
                'Over $1M - Higher Spec Crate with Tilt and Impact Detectors',
                'Over $5 Million Sub Museum or higher with Tilt & Impact Detectors',
                'Up to $5M Rokbox'
              ],
              deliveryRequirements: [
                'Ground Floor/Curbside Delivery'
              ],
              safetySecurityRequirements: [
                'Two-Person Delivery Team',
                'Air-Ride Suspension Vehicle',
                'GPS Tracking',
                'Airport Security Supervision'
              ],
              conditionCheckRequirements: [
                'Pre-Collection Inspection',
                'Photo Documentation (2+ photos)'
              ]
            }
          }
        ]
      }
    ]
  };

  getConfig(): OrganizationStandardsConfig {
    return this.config;
  }

  isApplicableToOrganization(orgName?: string, orgId?: string): boolean {
    // PRIMARY: Check by organization ID first (most reliable)
    if (orgId && this.config.organizationId === orgId) {
      console.log(`✅ ${this.config.displayName} organization matched by ID: ${orgId}`);
      return true;
    }
    
    // FALLBACK: Name pattern matching for backwards compatibility
    if (!orgName) return false;
    
    const orgNameLower = orgName.toLowerCase();
    const nameMatch = this.config.organizationNames.some(name => 
      orgNameLower.includes(name) || orgNameLower === name
    );
    
    if (nameMatch) {
      console.log(`✅ ${this.config.displayName} organization matched by name pattern: ${orgName}`);
      return true;
    }
    
    return false;
  }

  getApplicableStandards(
    transportMode: string,
    transportType: string | undefined,
    totalValue: number,
    isFragile?: boolean
  ): AppliedStandards | null {
    // Normalize transport type - map "standard" to "Dedicated" for Ground transport
    let normalizedTransportType = transportType;
    if (transportMode.toLowerCase() === 'ground' && transportType?.toLowerCase() === 'standard') {
      normalizedTransportType = 'Dedicated';
      console.log(`🔄 Mapping Ground - standard to Ground - Dedicated for Christie's standards`);
    }
    
    // Find matching transport mode and type
    const modeStandards = this.config.standards.find(standard => {
      const modeMatch = standard.transportMethod.toLowerCase() === transportMode.toLowerCase();
      const typeMatch = !standard.transportType || 
                       !normalizedTransportType || 
                       standard.transportType.toLowerCase() === normalizedTransportType.toLowerCase();
      return modeMatch && typeMatch;
    });

    if (!modeStandards) {
      console.log(`No Christie's standards found for transport mode: ${transportMode}${transportType ? ` - ${transportType}` : ''}`);
      return null;
    }

    // Find matching value range
    const valueRange = modeStandards.valueRanges.find(range => {
      const minValue = range.min || 0;
      const maxValue = range.max || Infinity;
      return totalValue >= minValue && totalValue <= maxValue;
    });

    if (!valueRange) {
      console.log(`No Christie's standards found for value: $${totalValue}`);
      return null;
    }

    const requirements = valueRange.requirements;
    
    // Convert to the format expected by the component
    const appliedStandards: AppliedStandards = {
      source: this.config.displayName
    };

    // Initialize sets for requirements
    appliedStandards.deliveryRequirements = new Set(requirements.deliveryRequirements || []);
    appliedStandards.safetySecurityRequirements = new Set(requirements.safetySecurityRequirements || []);
    appliedStandards.conditionCheckRequirements = new Set(requirements.conditionCheckRequirements || []);

    // Set packing requirement based on exact Christie's standards rules
    appliedStandards.packingRequirements = this.getPackingRequirement(transportMode, totalValue, isFragile);
    
    // Add value-based enhancements according to Christie's standards
    
    // Add "Unpacking Service" for values over $1M per Christie's Sea/Road/Air Freight rules
    if (totalValue > 1000000 && ['Sea', 'Ground', 'Air'].includes(transportMode)) {
      appliedStandards.deliveryRequirements.add('Unpacking Service');
    }
    
    // Add "Security Escort Vehicle" (Follow Car) for values over $20M per Christie's standards
    if (totalValue > 20000000 && ['Ground', 'Air', 'Sea'].includes(transportMode)) {
      appliedStandards.safetySecurityRequirements.add('Security Escort Vehicle');
    }
    
    // Upgrade condition check requirements for higher values per Universal Rules
    if (totalValue > 500000) {
      // Values over $500K get full detailed condition report (e.g., Articheck)
      appliedStandards.conditionCheckRequirements.delete('Photo Documentation (2+ photos)');
      appliedStandards.conditionCheckRequirements.delete('Basic Condition Notes');
      appliedStandards.conditionCheckRequirements.add('Professional Condition Report');
      appliedStandards.conditionCheckRequirements.add('Detailed Report with Commentary');
      appliedStandards.conditionCheckRequirements.add('Comprehensive Photo Set (3+ photos)');
    }

    if (requirements.serviceInclusions) {
      appliedStandards.serviceInclusions = requirements.serviceInclusions;
    }

    console.log(`Applied Christie's standards for ${transportMode}${normalizedTransportType ? ` - ${normalizedTransportType}` : ''}, value: $${totalValue}`, appliedStandards);
    
    return appliedStandards;
  }

  private getPackingRequirement(transportMode: string, totalValue: number, isFragile?: boolean): string {
    // Sea Freight rules
    if (transportMode === 'Sea') {
      if (totalValue <= 250000) {
        // Up to $250K → Tri-Wall Cardboard (but reusable crate is default)
        return 'Existing Crate (Reuse)'; // Default per Christie's rules
      } else if (totalValue <= 1000000) {
        // Over $250K up to $1M → Standard Crate or Rokbox
        return isFragile ? 'Standard Crate' : 'Existing Crate (Reuse)';
      } else {
        return 'Museum-Quality Crate';
      }
    }
    
    // Ground (Road) Freight rules
    else if (transportMode === 'Ground') {
      if (totalValue <= 250000) {
        // Up to $250K → Soft-Wrapped
        return isFragile ? 'Standard Crate' : 'Soft Wrap/Blanket Wrap';
      } else if (totalValue <= 1000000) {
        // Over $250K up to $1M → Standard Crate
        return 'Standard Crate';
      } else if (totalValue <= 5000000) {
        // Over $1M up to $5M → Higher-Spec Crate with Tilt & Impact Detectors
        return 'Museum-Quality Crate';
      } else {
        // Over $5M → Sub-Museum-spec or higher
        return 'Museum-Quality Crate';
      }
    }
    
    // Courier rules
    else if (transportMode === 'Courier') {
      if (totalValue <= 250000) {
        // Up to $250K → Tri-Wall Cardboard, but fragile gets Standard Crate
        return isFragile ? 'Standard Crate' : 'Soft Wrap/Blanket Wrap';
      } else {
        return 'Standard Crate';
      }
    }
    
    // FedEx Freight rules
    else if (transportMode === 'FedEx Freight') {
      // Always Standard Crate
      return 'Standard Crate';
    }
    
    // Air Freight rules
    else if (transportMode === 'Air') {
      if (totalValue <= 1000000) {
        // Under $1M - basic protection
        return 'Standard Crate';
      } else if (totalValue <= 5000000) {
        // Over $1M up to $5M → Higher-Spec Crate with Tilt & Impact Detectors
        return 'Museum-Quality Crate';
      } else {
        // Over $5M → Sub-Museum-spec or higher
        return 'Museum-Quality Crate';
      }
    }
    
    // Default fallback
    return 'Standard Crate';
  }

  getDisplayName(): string {
    return this.config.displayName;
  }

  getNotificationMessage(
    transportMode: string,
    transportType: string | undefined,
    totalValue: number,
    formattedTotalValue?: string
  ): string {
    // Use same normalization as getApplicableStandards for consistency
    let normalizedTransportType = transportType;
    if (transportMode.toLowerCase() === 'ground' && transportType?.toLowerCase() === 'standard') {
      normalizedTransportType = 'Dedicated';
    }
    
    const appliedStandards = this.getApplicableStandards(transportMode, transportType, totalValue);
    const displayValue = formattedTotalValue ?? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(totalValue);
    let message = `Christie's standards have been automatically applied for ${transportMode}${normalizedTransportType ? ` - ${normalizedTransportType}` : ''} transport with total value ${displayValue}.\n\n`;
    
    if (appliedStandards) {
      message += "Auto-selected requirements:\n";
      
      if (appliedStandards.packingRequirements) {
        message += `• Packing: ${appliedStandards.packingRequirements}\n`;
      }
      
      if (appliedStandards.deliveryRequirements && appliedStandards.deliveryRequirements.size > 0) {
        message += `• Delivery: ${Array.from(appliedStandards.deliveryRequirements).join(', ')}\n`;
      }
      
      if (appliedStandards.safetySecurityRequirements && appliedStandards.safetySecurityRequirements.size > 0) {
        message += `• Safety & Security: ${Array.from(appliedStandards.safetySecurityRequirements).join(', ')}\n`;
      }
      
      if (appliedStandards.conditionCheckRequirements && appliedStandards.conditionCheckRequirements.size > 0) {
        message += `• Condition Check: ${Array.from(appliedStandards.conditionCheckRequirements).join(', ')}\n`;
      }
      
      message += "\nYou can adjust these selections if needed.";
    }
    
    return message;
  }
} 
