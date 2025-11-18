const organizationLogoAssets = import.meta.glob<string>('/logos/*.{png,svg}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

type OrganizationLogoEntry = {
  svg?: string;
  png?: string;
};

const organizationLogoMap = new Map<string, OrganizationLogoEntry>();

Object.entries(organizationLogoAssets).forEach(([path, url]) => {
  const fileName = path.split('/').pop();
  if (!fileName) return;

  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return;

  const baseName = fileName.slice(0, dotIndex).trim().toLowerCase();
  if (!baseName) return;

  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  const entry = organizationLogoMap.get(baseName) ?? {};

  if (extension === 'svg' && !entry.svg) {
    entry.svg = url;
  } else if (extension === 'png' && !entry.png) {
    entry.png = url;
  }

  organizationLogoMap.set(baseName, entry);
});

const encodePublicPath = (path: string) => encodeURI(path);

const staticLogoOverrides: Record<string, string> = {
  "christie's": encodePublicPath(`/logos/Christie's.svg`),
  constantine: encodePublicPath('/logos/Constantine.svg'),
  'crown fine art': encodePublicPath('/logos/Crown Fine Art.png'),
  'crozier fine arts': encodePublicPath('/logos/Crozier Fine Arts.svg'),
  'dietl international': encodePublicPath('/logos/Dietl International.svg'),
  'gander & white': encodePublicPath('/logos/Gander and White.svg'),
  'gander and white': encodePublicPath('/logos/Gander and White.svg'),
  "hedley's": encodePublicPath(`/logos/Hedley's.png`),
  hedleys: encodePublicPath(`/logos/Hedley's.png`),
  momart: encodePublicPath('/logos/Momart.png'),
};

Object.entries(staticLogoOverrides).forEach(([normalizedName, url]) => {
  const entry = organizationLogoMap.get(normalizedName) ?? {};
  const extension = url.split('.').pop()?.toLowerCase();
  if (extension === 'svg') {
    entry.svg = url;
  } else if (extension === 'png') {
    entry.png = url;
  }
  organizationLogoMap.set(normalizedName, entry);
});

export type LogoPreferenceOrder = Array<'svg' | 'png'>;

const defaultPreferenceOrder: LogoPreferenceOrder = ['svg', 'png'];

export const findOrganizationLogoUrl = (
  organizationName: string | null | undefined,
  preferenceOrder: LogoPreferenceOrder = defaultPreferenceOrder
): string | null => {
  if (!organizationName) return null;

  const normalized = organizationName.trim().toLowerCase();
  if (!normalized) return null;

  const entry = organizationLogoMap.get(normalized);
  if (!entry) return null;

  for (const format of preferenceOrder) {
    if (format === 'svg' && entry.svg) return entry.svg;
    if (format === 'png' && entry.png) return entry.png;
  }

  return entry.svg ?? entry.png ?? null;
};

export const findFirstAvailableLogoUrl = (
  organizationNames: Array<string | null | undefined>,
  preferenceOrder: LogoPreferenceOrder = defaultPreferenceOrder
): string | null => {
  for (const name of organizationNames) {
    const url = findOrganizationLogoUrl(name, preferenceOrder);
    if (url) return url;
  }
  return null;
};

export const resolveOrganizationLogo = (
  organizationNames: Array<string | null | undefined>,
  remoteUrl?: string | null,
  preferenceOrder: LogoPreferenceOrder = defaultPreferenceOrder
) => {
  const localUrl = findFirstAvailableLogoUrl(organizationNames, preferenceOrder);
  const normalizedRemote = remoteUrl?.trim() ? remoteUrl : null;

  if (localUrl) {
    return {
      primaryUrl: localUrl,
      localUrl,
      remoteUrl: normalizedRemote,
    };
  }

  return {
    primaryUrl: normalizedRemote,
    localUrl: null,
    remoteUrl: normalizedRemote,
  };
};

export const listOrganizationLogoKeys = (): string[] => Array.from(organizationLogoMap.keys());
