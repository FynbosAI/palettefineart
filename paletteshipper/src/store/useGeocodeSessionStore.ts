import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { GeocodedLocation } from '../lib/geocoding';

export type CachedGeocodeStatus = 'success' | 'failed';

export interface CachedBranchGeocode {
  addressKey: string;
  location: GeocodedLocation | null;
  status: CachedGeocodeStatus;
  cachedAt: number;
}

export type BranchGeocodeMap = Record<string, CachedBranchGeocode>;

interface GeocodeSessionState {
  geocodesByOrgId: Record<string, BranchGeocodeMap>;
  setGeocode: (orgId: string, branchId: string, entry: CachedBranchGeocode) => void;
  clearOrg: (orgId: string) => void;
  clearAll: () => void;
  setHydrated: (value: boolean) => void;
  hydrated: boolean;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const storageFactory = () => (typeof window === 'undefined' ? noopStorage : sessionStorage);

export const useGeocodeSessionStore = create<GeocodeSessionState>()(
  persist(
    (set) => ({
      geocodesByOrgId: {},
      hydrated: typeof window === 'undefined',
      setGeocode: (orgId, branchId, entry) => {
        if (!orgId || !branchId) {
          return;
        }

        set((state) => {
          const existing = state.geocodesByOrgId[orgId] ?? {};
          return {
            geocodesByOrgId: {
              ...state.geocodesByOrgId,
              [orgId]: {
                ...existing,
                [branchId]: entry,
              },
            },
          };
        });
      },
      clearOrg: (orgId) => {
        if (!orgId) {
          return;
        }

        set((state) => {
          if (!state.geocodesByOrgId[orgId]) {
            return state;
          }
          const next = { ...state.geocodesByOrgId };
          delete next[orgId];
          return { geocodesByOrgId: next };
        });
      },
      clearAll: () => set({ geocodesByOrgId: {} }),
      setHydrated: (value) => set({ hydrated: value }),
    }),
    {
      name: 'shipper-geocode-session',
      storage: createJSONStorage(storageFactory),
      partialize: (state) => ({ geocodesByOrgId: state.geocodesByOrgId }),
      onRehydrateStorage: () => (state, error) => {
        if (!error) {
          state?.setHydrated(true);
        }
      },
    }
  )
);
