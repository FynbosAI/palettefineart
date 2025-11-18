// Organization Standards System
// Modular, scalable system for applying organization-specific shipping standards

export * from './types';
export { OrganizationStandardsService, organizationStandardsService } from './OrganizationStandardsService';
export { ORG_IDS, type OrganizationId, isKnownOrganizationId, getOrgNameById } from './OrganizationIds';

// Individual providers (for direct access if needed)
export { ChristiesStandards } from './providers/ChristiesStandards';

// Re-export the singleton service for easy access
export { organizationStandardsService as standards } from './OrganizationStandardsService'; 