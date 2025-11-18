import { 
  OrganizationStandardsProvider, 
  OrganizationStandardsConfig, 
  AppliedStandards
} from '../types';
import { ORG_IDS } from '../OrganizationIds';

/**
 * Example template for creating new organization standards
 * 
 * To add a new organization:
 * 1. Copy this file and rename it (e.g., MoMAStandards.ts)
 * 2. Update the class name and config with the correct org ID from ORG_IDS
 * 3. Define the organization's specific standards
 * 4. Register it in OrganizationStandardsService.ts
 * 
 * This example shows how to add MoMA (Museum of Modern Art) standards
 * using the actual organization ID from the database
 */
export class ExampleOrgStandards implements OrganizationStandardsProvider {
  private config: OrganizationStandardsConfig = {
    // PRIMARY: Use the specific organization ID from ORG_IDS constants
    organizationId: ORG_IDS.MOMA,
    
    // FALLBACK: Name patterns for backwards compatibility
    // (Only used if org ID doesn't match)
    organizationNames: [
      'museum of modern art',
      'moma',
      'moma ny',
      'moma ps1'
    ],
    
    // Display name for notifications
    displayName: 'MoMA',
    
    // Organization-specific standards by transport method
    standards: [
      {
        transportMethod: 'Ground',
        transportType: 'Dedicated',
        valueRanges: [
          {
            min: 0,
            max: 500000,
            requirements: {
              packingGuidelines: [
                'Museum-grade crates required for all items',
                'Climate-controlled environment mandatory',
                'Shock-absorbing materials for fragile pieces'
              ],
              deliveryRequirements: [
                'White glove service',
                'Museum loading dock access',
                'Appointment required'
              ],
              safetySecurityRequirements: [
                'Background-checked drivers',
                'GPS tracking',
                'Insurance verification'
              ],
              conditionCheckRequirements: [
                'Pre-transport condition report',
                'Photo documentation',
                'Post-delivery inspection'
              ]
            }
          },
          {
            min: 500000,
            max: Infinity,
            requirements: {
              packingGuidelines: [
                'Custom museum crates with climate monitoring',
                'Vibration dampening systems',
                'Security seals required'
              ],
              deliveryRequirements: [
                'White glove service',
                'Museum curator present',
                'Dedicated time slot'
              ],
              safetySecurityRequirements: [
                'Two-person crew minimum',
                'Real-time GPS tracking',
                'Security escort if over $5M',
                'Full insurance coverage'
              ],
              conditionCheckRequirements: [
                'Detailed condition report',
                'High-resolution photography',
                'Conservator inspection',
                'Environmental monitoring logs'
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
            max: Infinity,
            requirements: {
              packingGuidelines: [
                'IATA-approved art shipping cases',
                'Climate control documentation',
                'Pressure-sensitive items identified'
              ],
              deliveryRequirements: [
                'Airport fine art facility',
                'Customs broker coordination',
                'Temperature controlled transport'
              ],
              safetySecurityRequirements: [
                'Security screening exemption process',
                'Chain of custody documentation',
                'Insurance for international transit'
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
    // Find matching transport mode and type
    const modeStandards = this.config.standards.find(standard => {
      const modeMatch = standard.transportMethod.toLowerCase() === transportMode.toLowerCase();
      const typeMatch = !standard.transportType || 
                       !transportType || 
                       standard.transportType.toLowerCase() === transportType.toLowerCase();
      return modeMatch && typeMatch;
    });

    if (!modeStandards) {
      console.log(`No ${this.config.displayName} standards found for transport mode: ${transportMode}${transportType ? ` - ${transportType}` : ''}`);
      return null;
    }

    // Find matching value range
    const valueRange = modeStandards.valueRanges.find(range => {
      const minValue = range.min || 0;
      const maxValue = range.max || Infinity;
      return totalValue >= minValue && totalValue <= maxValue;
    });

    if (!valueRange) {
      console.log(`No ${this.config.displayName} standards found for value: $${totalValue}`);
      return null;
    }

    const requirements = valueRange.requirements;
    
    // Convert to the format expected by the component
    const appliedStandards: AppliedStandards = {
      source: this.config.displayName
    };

    if (requirements.deliveryRequirements) {
      appliedStandards.deliveryRequirements = new Set(requirements.deliveryRequirements);
    }

    if (requirements.safetySecurityRequirements) {
      appliedStandards.safetySecurityRequirements = new Set(requirements.safetySecurityRequirements);
    }

    if (requirements.conditionCheckRequirements) {
      appliedStandards.conditionCheckRequirements = new Set(requirements.conditionCheckRequirements);
    }

    if (requirements.serviceInclusions) {
      appliedStandards.serviceInclusions = requirements.serviceInclusions;
    }

    // Handle packing requirements
    if (requirements.packingGuidelines) {
      appliedStandards.packingRequirements = requirements.packingGuidelines.join('\n• ');
    }

    // Additional logic for fragile items
    if (isFragile && requirements.packingGuidelines) {
      console.log(`Applying enhanced packing for fragile items from ${this.config.displayName}`);
      // Could add fragile-specific requirements here
    }

    console.log(`Applied ${this.config.displayName} standards for ${transportMode}${transportType ? ` - ${transportType}` : ''}, value: $${totalValue}`, appliedStandards);
    
    return appliedStandards;
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
    const displayValue = formattedTotalValue ?? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(totalValue);
    return `${this.config.displayName} museum standards have been automatically applied based on your transport method ` +
           `(${transportMode}${transportType ? ` - ${transportType}` : ''}) and total artwork value ` +
           `(${displayValue}). ` +
           `These standards ensure compliance with museum-grade handling requirements. ` +
           `You can adjust these selections if needed.`;
  }
}

// To activate this provider, uncomment the registration line in OrganizationStandardsService.ts:
// this.registerProvider(new ExampleOrgStandards()); 
