import { supabase } from './client';

export interface DeliverySpecificsData {
  shipment_id: string;
  delivery_requirements: string[];
  packing_requirements: string;
  access_requirements: string[];
  safety_security_requirements: string[];
  condition_check_requirements: string[];
}

export class DeliverySpecificsService {
  
  /**
   * Save delivery specifics to the database
   * Uses the simple approach of adding columns to shipments table
   */
  static async saveToShipment(shipmentId: string, specifics: Partial<DeliverySpecificsData>) {
    console.log('💾 Saving delivery specifics to shipment:', shipmentId, specifics);
    
    const updateData: any = {};
    
    if (specifics.delivery_requirements) {
      updateData.delivery_requirements = Array.from(specifics.delivery_requirements);
    }
    
    if (specifics.packing_requirements !== undefined) {
      updateData.packing_requirements = specifics.packing_requirements;
    }
    
    if (specifics.access_requirements) {
      updateData.access_requirements = Array.from(specifics.access_requirements);
    }
    
    if (specifics.safety_security_requirements) {
      updateData.safety_security_requirements = Array.from(specifics.safety_security_requirements);
    }
    
    if (specifics.condition_check_requirements) {
      updateData.condition_check_requirements = Array.from(specifics.condition_check_requirements);
    }
    
    const { data, error } = await supabase
      .from('shipments')
      .update(updateData)
      .eq('id', shipmentId)
      .select();
    
    if (error) {
      console.error('❌ Error saving delivery specifics:', error);
      throw error;
    }
    
    console.log('✅ Delivery specifics saved successfully:', data);
    return data;
  }
  
  /**
   * Save delivery specifics to quotes table
   */
  static async saveToQuote(quoteId: string, specifics: Partial<DeliverySpecificsData>) {
    console.log('💾 Saving delivery specifics to quote:', quoteId, specifics);
    
    const deliverySpecificsData = {
      delivery_requirements: specifics.delivery_requirements ? Array.from(specifics.delivery_requirements) : [],
      packing_requirements: specifics.packing_requirements || '',
      access_requirements: specifics.access_requirements ? Array.from(specifics.access_requirements) : [],
      safety_security_requirements: specifics.safety_security_requirements ? Array.from(specifics.safety_security_requirements) : [],
      condition_check_requirements: specifics.condition_check_requirements ? Array.from(specifics.condition_check_requirements) : []
    };
    
    const { data, error } = await supabase
      .from('quotes')
      .update({ 
        delivery_specifics: deliverySpecificsData 
      })
      .eq('id', quoteId)
      .select();
    
    if (error) {
      console.error('❌ Error saving delivery specifics to quote:', error);
      throw error;
    }
    
    console.log('✅ Delivery specifics saved to quote successfully:', data);
    return data;
  }
  
  /**
   * Get delivery specifics from shipment
   */
  static async getFromShipment(shipmentId: string): Promise<DeliverySpecificsData | null> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        id,
        delivery_requirements,
        packing_requirements,
        access_requirements,
        safety_security_requirements,
        condition_check_requirements
      `)
      .eq('id', shipmentId)
      .single();
    
    if (error) {
      console.error('❌ Error fetching delivery specifics:', error);
      return null;
    }
    
    return {
      shipment_id: data.id,
      delivery_requirements: data.delivery_requirements || [],
      packing_requirements: data.packing_requirements || '',
      access_requirements: data.access_requirements || [],
      safety_security_requirements: data.safety_security_requirements || [],
      condition_check_requirements: data.condition_check_requirements || []
    };
  }
  
  /**
   * Get delivery specifics from quote
   */
  static async getFromQuote(quoteId: string): Promise<DeliverySpecificsData | null> {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, delivery_specifics')
      .eq('id', quoteId)
      .single();
    
    if (error) {
      console.error('❌ Error fetching delivery specifics from quote:', error);
      return null;
    }
    
    const specifics = data.delivery_specifics as any;
    if (!specifics) return null;
    
    return {
      shipment_id: '', // Not applicable for quotes
      delivery_requirements: specifics.delivery_requirements || [],
      packing_requirements: specifics.packing_requirements || '',
      access_requirements: specifics.access_requirements || [],
      safety_security_requirements: specifics.safety_security_requirements || [],
      condition_check_requirements: specifics.condition_check_requirements || []
    };
  }
  
  /**
   * Convert Set objects to arrays for database storage
   */
  static convertSetsToArrays(deliveryDetails: any): DeliverySpecificsData {
    return {
      shipment_id: '', // Will be set by calling function
      delivery_requirements: deliveryDetails.deliveryRequirements ? 
        Array.from(deliveryDetails.deliveryRequirements) : [],
      packing_requirements: deliveryDetails.packingRequirements || '',
      access_requirements: deliveryDetails.accessAtDelivery ? 
        Array.from(deliveryDetails.accessAtDelivery) : [],
      safety_security_requirements: deliveryDetails.safetySecurityRequirements ? 
        Array.from(deliveryDetails.safetySecurityRequirements) : [],
      condition_check_requirements: deliveryDetails.conditionCheckRequirements ? 
        Array.from(deliveryDetails.conditionCheckRequirements) : []
    };
  }
} 