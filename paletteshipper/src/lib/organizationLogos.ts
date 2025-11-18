const organizationLogoAssets = import.meta.glob(
  '../../public/logos/*.{png,svg}',
  { eager: true, import: 'default', query: '?url' }
) as Record<string, string>;

type OrganizationLogoEntry = {
  png?: string;
  svg?: string;
};

const organizationLogoMap = new Map<string, OrganizationLogoEntry>();

Object.entries(organizationLogoAssets).forEach(([path, url]) => {
  const fileName = path.split('/').pop();
  if (!fileName) return;

  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return;

  const baseName = fileName.slice(0, lastDotIndex).trim().toLowerCase();
  if (!baseName) return;

  const extension = fileName.slice(lastDotIndex + 1).toLowerCase();
  const entry = organizationLogoMap.get(baseName) ?? {};

  if (extension === 'png' && !entry.png) {
    entry.png = url;
  } else if (extension === 'svg' && !entry.svg) {
    entry.svg = url;
  }

  organizationLogoMap.set(baseName, entry);
});

export type LogoPreferenceOrder = Array<'png' | 'svg'>;

const defaultPreferenceOrder: LogoPreferenceOrder = ['png', 'svg'];

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
    if (format === 'png' && entry.png) return entry.png;
    if (format === 'svg' && entry.svg) return entry.svg;
  }

  return entry.png ?? entry.svg ?? null;
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
