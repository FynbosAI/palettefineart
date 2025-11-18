/**
 * Organization IDs Reference
 * 
 * Quick reference for organization IDs when creating new standards providers.
 * These IDs come from the database organizations table.
 * 
 * Use these exact IDs in your standards providers for reliable organization matching.
 */

const importMetaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env)
  ? (import.meta as any).env
  : undefined;
const processEnv = (typeof globalThis !== 'undefined' && (globalThis as any)?.process?.env)
  ? (globalThis as any).process.env
  : undefined;

const getEnvVar = (key: string, fallback: string): string => {
  const value = importMetaEnv?.[key] ?? processEnv?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};

// Client Organizations (Museums, Galleries, etc.)
export const ORG_IDS = {
  // Major Museums
  // Use environment variables when available, fallback to hardcoded values
  CHRISTIES: getEnvVar('VITE_CHRISTIES_ORG_ID', 'b9790dcb-dfe7-40cd-9b7a-34806568d91f'),
  TATE_MODERN: getEnvVar('VITE_TATE_MODERN_ORG_ID', '33333333-3333-3333-3333-333333333333'),
  MOMA: getEnvVar('VITE_MOMA_ORG_ID', '44444444-4444-4444-4444-444444444444'), // MoMA - Museum of Modern Art
  METROPOLITAN_MUSEUM: getEnvVar('VITE_METROPOLITAN_MUSEUM_ORG_ID', '11111111-1111-1111-1111-111111111111'),
  LOUVRE_MUSEUM: getEnvVar('VITE_LOUVRE_MUSEUM_ORG_ID', '22222222-2222-2222-2222-222222222222'),
  GUGGENHEIM: getEnvVar('VITE_GUGGENHEIM_ORG_ID', '55555555-5555-5555-5555-555555555555'),
  NATIONAL_GALLERY_LONDON: '66666666-6666-6666-6666-666666666666',
  RIJKSMUSEUM: '77777777-7777-7777-7777-777777777777',
  ART_INSTITUTE_CHICAGO: '88888888-8888-8888-8888-888888888888',
  HERMITAGE: '99999999-9999-9999-9999-999999999999',
  VAN_GOGH_MUSEUM: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  
  // Additional Museums & Galleries
  DEMO_GALLERY: '00000000-0000-0000-0000-000000000001',
  THE_LOUVRE: '35a9afba-7b14-4c6f-81a8-7d50b16e1db1', // Different from Louvre Museum
  MUSEE_DORSAY: '73d35e3e-c39d-4094-9afb-b2d0a7ed018d',
  
  // Logistics Partners (for reference)
  CROZIER_FINE_ARTS: '002c791a-f45b-4c1e-bf7a-6c038e237d6f',
  CROWN_FINE_ART: '0056d300-9f1d-407d-a121-9d91582c210e',
  ATELIER_4: '16cbea06-6afb-4339-af72-d2be1be90f37',
  HASENKAMP: '315feb1a-119b-4a34-8388-21ea3576d6e5',
  GANDER_WHITE: '52b1d28f-b05d-428f-899e-ff2743ff999c',
  DHL_EXPRESS: '63ed4e57-797b-4cab-9993-33317c56d4fb',
  UPS_ART: '995d2c84-fdfd-4c8b-990d-398081c56aab',
  MOMART: 'f8c25e71-6c05-4bd0-8ef6-ad0a9a3b334f',
  FEDEX_ART: 'faa7df1b-32aa-4068-b896-c34fb017c895'
} as const;

// Type for better TypeScript support
export type OrganizationId = typeof ORG_IDS[keyof typeof ORG_IDS];

// Helper function to check if an ID is a known organization
export function isKnownOrganizationId(id: string): id is OrganizationId {
  return Object.values(ORG_IDS).includes(id as OrganizationId);
}

// Helper to get organization name by ID (for debugging)
export function getOrgNameById(id: string): string | null {
  const orgMap: Record<string, string> = {
    [ORG_IDS.CHRISTIES]: 'Christie\'s',
    [ORG_IDS.TATE_MODERN]: 'Tate Modern',
    [ORG_IDS.MOMA]: 'MoMA - Museum of Modern Art',
    [ORG_IDS.METROPOLITAN_MUSEUM]: 'Metropolitan Museum of Art',
    [ORG_IDS.LOUVRE_MUSEUM]: 'Louvre Museum',
    [ORG_IDS.GUGGENHEIM]: 'Guggenheim Museum',
    [ORG_IDS.NATIONAL_GALLERY_LONDON]: 'National Gallery London',
    [ORG_IDS.RIJKSMUSEUM]: 'Rijksmuseum',
    [ORG_IDS.ART_INSTITUTE_CHICAGO]: 'Art Institute of Chicago',
    [ORG_IDS.HERMITAGE]: 'Hermitage Museum',
    [ORG_IDS.VAN_GOGH_MUSEUM]: 'Van Gogh Museum',
    [ORG_IDS.DEMO_GALLERY]: 'Demo Gallery LLC',
    [ORG_IDS.THE_LOUVRE]: 'The Louvre',
    [ORG_IDS.MUSEE_DORSAY]: 'Musée d\'Orsay'
  };
  
  return orgMap[id] || null;
} 
