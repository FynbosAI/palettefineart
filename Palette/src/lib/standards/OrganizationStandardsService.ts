import { OrganizationStandardsProvider, AppliedStandards } from './types';
import { ChristiesStandards } from './providers/ChristiesStandards';

export class OrganizationStandardsService {
  private providers: OrganizationStandardsProvider[] = [];

  constructor() {
    // Register all available providers
    this.registerProvider(new ChristiesStandards());
    
    // Future providers can be registered here:
    // this.registerProvider(new MoMAStandards());
    // this.registerProvider(new TateStandards());
    // this.registerProvider(new SothebyStandards());
  }

  /**
   * Register a new organization standards provider
   */
  private registerProvider(provider: OrganizationStandardsProvider): void {
    this.providers.push(provider);
    console.log(`Registered standards provider: ${provider.getDisplayName()}`);
  }

  /**
   * Find the appropriate provider for the given organization
   */
  private findProviderForOrganization(orgName?: string, orgId?: string): OrganizationStandardsProvider | null {
    if (!orgName && !orgId) return null;
    
    const provider = this.providers.find(p => p.isApplicableToOrganization(orgName, orgId));
    
    if (provider) {
      console.log(`Found standards provider for organization: ${provider.getDisplayName()}`);
    } else {
      console.log(`No standards provider found for organization: ${orgName || orgId}`);
    }
    
    return provider || null;
  }

  /**
   * Check if an organization has custom standards
   */
  hasStandardsForOrganization(orgName?: string, orgId?: string): boolean {
    return this.findProviderForOrganization(orgName, orgId) !== null;
  }

  /**
   * Get applied standards for an organization based on transport details
   */
  getAppliedStandards(
    orgName?: string,
    orgId?: string,
    transportMode?: string,
    transportType?: string,
    totalValue: number = 0,
    isFragile?: boolean
  ): AppliedStandards | null {
    const provider = this.findProviderForOrganization(orgName, orgId);
    
    if (!provider || !transportMode) {
      return null;
    }

    return provider.getApplicableStandards(
      transportMode,
      transportType,
      totalValue,
      isFragile
    );
  }

  /**
   * Get notification message for applied standards
   */
  getNotificationMessage(
    orgName?: string,
    orgId?: string,
    transportMode?: string,
    transportType?: string,
    totalValue: number = 0,
    formattedTotalValue?: string
  ): string | null {
    const provider = this.findProviderForOrganization(orgName, orgId);
    
    if (!provider || !transportMode) {
      return null;
    }

    return provider.getNotificationMessage(transportMode, transportType, totalValue, formattedTotalValue);
  }

  /**
   * Get display name for the organization's standards
   */
  getStandardsDisplayName(orgName?: string, orgId?: string): string | null {
    const provider = this.findProviderForOrganization(orgName, orgId);
    return provider ? provider.getDisplayName() : null;
  }

  /**
   * Get all registered providers (for debugging/admin purposes)
   */
  getAllProviders(): OrganizationStandardsProvider[] {
    return [...this.providers];
  }

  /**
   * Get provider configurations (for debugging/admin purposes)
   */
  getProviderConfigs() {
    return this.providers.map(provider => ({
      displayName: provider.getDisplayName(),
      config: provider.getConfig()
    }));
  }
}

// Singleton instance
export const organizationStandardsService = new OrganizationStandardsService(); 
