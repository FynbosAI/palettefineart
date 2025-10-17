import { StateCreator } from 'zustand';
import logger from '../../lib/utils/logger';

// Define what state should be persisted
interface PersistableState {
  forms: {
    shipment: any;
    quote: any;
    geminiArtworkData: any;
    uploadState: any;
  };
  selectedShipmentId: string | null;
  selectedQuoteId: string | null;
  selectedItemId: string | null;
  selectedItemType: 'shipment' | 'estimate' | null;
}

// Storage keys
const STORAGE_KEYS = {
  FORM_STATE: 'palette_form_state',
  SELECTIONS: 'palette_selections',
  LAST_SAVE: 'palette_last_save',
};

const globalScope = typeof globalThis !== 'undefined' ? (globalThis as any) : {};
const hasWebStorage =
  typeof globalScope.localStorage !== 'undefined' &&
  globalScope.localStorage !== null;

// Storage utilities
const storage = {
  getItem: (key: string): string | null => {
    if (!hasWebStorage) {
      return null;
    }
    try {
      return globalScope.localStorage.getItem(key);
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!hasWebStorage) {
      return;
    }
    try {
      globalScope.localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to write to localStorage:', error);
    }
  },
  removeItem: (key: string): void => {
    if (!hasWebStorage) {
      return;
    }
    try {
      globalScope.localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  },
};

// Serialize/deserialize with support for complex objects like Sets and Maps
const serialize = (obj: any): string => {
  return JSON.stringify(obj, (key, value) => {
    if (value instanceof Set) {
      return { __type: 'Set', values: Array.from(value) };
    }
    if (value instanceof Map) {
      return { __type: 'Map', entries: Array.from(value.entries()) };
    }
    return value;
  });
};

const deserialize = (str: string): any => {
  return JSON.parse(str, (key, value) => {
    if (value && typeof value === 'object') {
      if (value.__type === 'Set') {
        return new Set(value.values);
      }
      if (value.__type === 'Map') {
        return new Map(value.entries);
      }
    }
    return value;
  });
};

// Save state to localStorage
export const saveState = (state: Partial<PersistableState>): void => {
  try {
    const formState = {
      forms: state.forms,
      timestamp: Date.now(),
    };
    
    const selections = {
      selectedShipmentId: state.selectedShipmentId,
      selectedQuoteId: state.selectedQuoteId,
      selectedItemId: state.selectedItemId,
      selectedItemType: state.selectedItemType,
      timestamp: Date.now(),
    };
    
    storage.setItem(STORAGE_KEYS.FORM_STATE, serialize(formState));
    storage.setItem(STORAGE_KEYS.SELECTIONS, serialize(selections));
    storage.setItem(STORAGE_KEYS.LAST_SAVE, Date.now().toString());
    
    logger.debug('Persistence', 'State saved to localStorage');
  } catch (error) {
    console.error('Failed to save state:', error);
  }
};

// Load state from localStorage
export const loadState = (): Partial<PersistableState> => {
  try {
    const formStateStr = storage.getItem(STORAGE_KEYS.FORM_STATE);
    const selectionsStr = storage.getItem(STORAGE_KEYS.SELECTIONS);
    
    let state: Partial<PersistableState> = {};
    
    if (formStateStr) {
      const formData = deserialize(formStateStr);
      if (formData && isRecentSave(formData.timestamp)) {
        state.forms = formData.forms;
      }
    }
    
    if (selectionsStr) {
      const selectionData = deserialize(selectionsStr);
      if (selectionData && isRecentSave(selectionData.timestamp)) {
        state.selectedShipmentId = selectionData.selectedShipmentId;
        state.selectedQuoteId = selectionData.selectedQuoteId;
        state.selectedItemId = selectionData.selectedItemId;
        state.selectedItemType = selectionData.selectedItemType;
      }
    }
    
    if (Object.keys(state).length > 0) {
      logger.debug('Persistence', 'State loaded from localStorage');
    }
    
    return state;
  } catch (error) {
    console.error('Failed to load state:', error);
    return {};
  }
};

// Check if the save is recent enough to be valid (e.g., within 24 hours)
const isRecentSave = (timestamp: number): boolean => {
  const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  return Date.now() - timestamp < MAX_AGE;
};

// Clear saved state
export const clearSavedState = (): void => {
  storage.removeItem(STORAGE_KEYS.FORM_STATE);
  storage.removeItem(STORAGE_KEYS.SELECTIONS);
  storage.removeItem(STORAGE_KEYS.LAST_SAVE);
  console.log('🗑️ Saved state cleared');
};

// Create a timeout holder that can be shared
let saveTimeout: NodeJS.Timeout | null = null;

// Middleware for auto-saving state changes
export const persistenceMiddleware = <T extends PersistableState>(
  config: StateCreator<T>
) => (set: any, get: any, api: any) => {
  const setState = (...args: any[]) => {
    const result = set(...args);
    
    // Debounce saves to avoid excessive localStorage writes
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(() => {
      const currentState = get();
      saveState({
        forms: currentState.forms,
        selectedShipmentId: currentState.selectedShipmentId,
        selectedQuoteId: currentState.selectedQuoteId,
        selectedItemId: currentState.selectedItemId,
        selectedItemType: currentState.selectedItemType,
      });
    }, 1000); // Save after 1 second of inactivity
    
    return result;
  };
  
  return config(setState, get, api);
};

// Hook for components to manually save/load state
export const usePersistence = () => {
  return {
    saveState,
    loadState,
    clearSavedState,
    getLastSaveTime: () => {
      const lastSave = storage.getItem(STORAGE_KEYS.LAST_SAVE);
      return lastSave ? new Date(parseInt(lastSave)) : null;
    },
  };
}; 
