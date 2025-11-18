import type { BranchNetworkEntry } from '../services/BranchNetworkService';

export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) {
    return '';
  }

  return raw
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildBranchAddress(entry: BranchNetworkEntry): string {
  if (!entry) {
    return '';
  }

  const location = entry.location;
  if (location?.address_full) {
    return location.address_full;
  }

  if (location?.name) {
    return location.name;
  }

  if (entry.branchName) {
    return entry.branchName;
  }

  return entry.displayName;
}

export function addressKeyFromBranch(entry: BranchNetworkEntry): string {
  return normalizeAddress(buildBranchAddress(entry));
}
