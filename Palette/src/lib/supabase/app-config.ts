import { supabase } from './client';

export interface AppConfig {
  key: string;
  value: any;
  category: string;
}

interface CacheItem {
  value: any;
  timestamp: number;
}

export class AppConfigService {
  private static cache: Map<string, CacheItem> = new Map();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL
  
  static async getConfig(key: string): Promise<any> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }
    
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .single();
    
    if (error) {
      console.error('Error fetching config:', error);
      return null;
    }
    
    // Cache the result with timestamp
    this.cache.set(key, {
      value: data.value,
      timestamp: Date.now()
    });
    return data.value;
  }
  
  static async getConfigByCategory(category: string): Promise<Record<string, any>> {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .eq('category', category);
    
    if (error) {
      console.error('Error fetching configs by category:', error);
      return {};
    }
    
    const configs: Record<string, any> = {};
    data.forEach(item => {
      configs[item.key] = item.value;
      // Cache individual items with timestamp
      this.cache.set(item.key, {
        value: item.value,
        timestamp: Date.now()
      });
    });
    
    return configs;
  }
  
  static async getAllConfigs(): Promise<Record<string, any>> {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value');
    
    if (error) {
      console.error('Error fetching all configs:', error);
      return {};
    }
    
    const configs: Record<string, any> = {};
    data.forEach(item => {
      configs[item.key] = item.value;
      // Cache individual items with timestamp
      this.cache.set(item.key, {
        value: item.value,
        timestamp: Date.now()
      });
    });
    
    return configs;
  }
  
  // Specific getters for common configs
  static async getThemeColors() {
    return this.getConfig('theme_colors');
  }
  
  static async getStatusColors() {
    return this.getConfig('status_colors');
  }
  
  static async getDeliveryRequirements() {
    return this.getConfig('delivery_requirements');
  }
  
  static async getPackingRequirements() {
    return this.getConfig('packing_requirements');
  }
  
  static async getAccessRequirements() {
    return this.getConfig('access_requirements');
  }
  
  static async getSafetySecurityRequirements() {
    return this.getConfig('safety_security_requirements');
  }
  
  static async getConditionCheckRequirements() {
    return this.getConfig('condition_check_requirements');
  }
  
  static async getTransportModes() {
    return this.getConfig('transport_modes');
  }
  
  static async getTransportTypes() {
    return this.getConfig('transport_types');
  }
  
  static async getChristiesStandards() {
    return this.getConfig('christies_shipper_standards');
  }
  
  // Clear cache when needed
  static clearCache() {
    this.cache.clear();
  }
  
  // Invalidate specific cache entry
  static invalidateCache(key: string) {
    this.cache.delete(key);
  }
  
  // Check if cache item is still valid
  static isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    return !!(cached && Date.now() - cached.timestamp < this.CACHE_TTL);
  }

  // Setup default app config data if missing
  static async setupDefaultConfigs() {
    console.log('🔧 Setting up default app configurations...');
    
    const defaultConfigs = [
      {
        key: 'delivery_requirements',
        value: {
          options: [
            "Ground Floor/Curbside Delivery",
            "Dock-to-Dock Delivery", 
            "Unpacking Service",
            "Installation Service",
            "Condition Checking",
            "Debris Removal",
            "White Glove Service"
          ]
        },
        category: 'delivery'
      },
      {
        key: 'packing_requirements',
        value: {
          options: [
            "Existing Crate (Reuse)",
            "Soft Wrap/Blanket Wrap",
            "Standard Crate", 
            "Double-Wall Crate",
            "Museum-Quality Crate",
            "Climate-Controlled Crate",
            "T-Frame (Paintings)",
            "Pre-Packed (No Service Needed)"
          ]
        },
        category: 'delivery'
      },
      {
        key: 'access_requirements',
        value: {
          options: [
            "Ground Floor - Unrestricted Access",
            "Freight Elevator Available", 
            "Stairs Only",
            "Special Equipment Required",
            "Loading Dock Available"
          ]
        },
        category: 'delivery'
      },
      {
        key: 'safety_security_requirements',
        value: {
          options: [
            "Climate-Controlled Container",
            "Two-Person Delivery Team",
            "Air-Ride Suspension Vehicle", 
            "GPS Tracking",
            "Security Escort Vehicle",
            "Signature on Delivery",
            "Fixed Delivery Address",
            "No Redirection Allowed",
            "Airport Security Supervision"
          ]
        },
        category: 'safety'
      },
      {
        key: 'condition_check_requirements',
        value: {
          options: [
            "Basic Condition Notes",
            "Pre-Collection Inspection",
            "Photo Documentation (2+ photos)",
            "Comprehensive Photo Set (3+ photos)",
            "Professional Condition Report", 
            "Detailed Report with Commentary"
          ]
        },
        category: 'condition'
      }
    ];

    try {
      for (const config of defaultConfigs) {
        const { error } = await supabase
          .from('app_config')
          .upsert(config, { 
            onConflict: 'key',
            ignoreDuplicates: false 
          });
        
        if (error) {
          console.error(`Error setting up config ${config.key}:`, error);
        } else {
          console.log(`✅ Setup config: ${config.key}`);
        }
      }
      
      // Clear cache after setup
      this.clearCache();
      console.log('✅ Default app configurations setup complete');
      return true;
    } catch (error) {
      console.error('🚨 Error setting up default configs:', error);
      return false;
    }
  }

  // Check if all required configs exist
  static async verifyConfigs(): Promise<boolean> {
    const requiredKeys = [
      'delivery_requirements',
      'packing_requirements', 
      'access_requirements',
      'safety_security_requirements',
      'condition_check_requirements'
    ];

    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('key')
        .in('key', requiredKeys);

      if (error) {
        console.error('Error verifying configs:', error);
        return false;
      }

      const existingKeys = data.map(item => item.key);
      const missingKeys = requiredKeys.filter(key => !existingKeys.includes(key));
      
      if (missingKeys.length > 0) {
        console.log('🔧 Missing app config keys:', missingKeys);
        return false;
      }

      console.log('✅ All required app configs exist');
      return true;
    } catch (error) {
      console.error('Error checking configs:', error);
      return false;
    }
  }
} 