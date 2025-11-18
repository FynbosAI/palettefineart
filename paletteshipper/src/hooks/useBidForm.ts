import { useCallback, useEffect, useState } from 'react';
import useShipperStore from '../store/useShipperStore';
import { useBidForm as useBidFormSelector } from './useStoreSelectors';
import { BidService } from '../services/BidService';
import type { BidLineItem } from '../services/BidService';
import { createDefaultLineItems, SUB_LINE_ITEMS, type EstimateLineItemId } from '../constants/estimateLineItems';

// Local type for form data that matches what the store expects
interface BidLineItemFormData {
  category: string;
  description: string[];  
  quantity: number;
  unit_price: number;
  total_amount: number;
  is_optional: boolean;
  sort_order?: number;
}

interface UseBidFormProps {
  quoteId: string;
}

interface SubItem {
  id: string;
  name: string;
  defaultCost: number;
}

interface LineItem {
  id: EstimateLineItemId;
  name: string;
  category: string;
  subItems?: SubItem[];
  cost: string;
}

type BidHydrationInput = {
  id?: string;
  amount?: number | null;
  bid_line_items?: BidLineItem[] | null;
  notes?: string | null;
  insurance_included?: boolean | null;
  special_services?: string[] | null;
  valid_until?: string | null;
  estimated_transit_time?: string | null;
  updated_at?: string | null;
};

export const useBidForm = ({ quoteId }: UseBidFormProps) => {
  const { bidForm, updateBidForm } = useBidFormSelector();
  const { saveBidDraft, submitBid } = useShipperStore();
  
  // Local state for UI-specific form management
  const [lineItems, setLineItems] = useState<LineItem[]>(createDefaultLineItems());
  
  const [selectedSubItems, setSelectedSubItems] = useState<{ [key: string]: string[] }>({});
  const [customLineItems, setCustomLineItems] = useState<Array<{ id: string; name: string; cost: string }>>([]);
  const [insuranceIncluded, setInsuranceIncluded] = useState(false);
  const [specialServices, setSpecialServices] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState<string>('');
  const [estimatedTransitTime, setEstimatedTransitTime] = useState<string>('');
  
  // Initialize form with quote ID
  useEffect(() => {
    if (quoteId && bidForm.quote_id !== quoteId) {
      updateBidForm({ quote_id: quoteId });
    }
  }, [quoteId, bidForm.quote_id, updateBidForm]);
  
  // Line item management
  const addLineItem = useCallback(() => {
    const newItem: BidLineItemFormData = {
      category: '',
      description: [],  // Changed to empty array
      quantity: 1,
      unit_price: 0,
      total_amount: 0,
      is_optional: false,
    };
    
    updateBidForm({
      line_items: [...bidForm.line_items, newItem],
    });
  }, [bidForm.line_items, updateBidForm]);
  
  const updateLineItem = useCallback((index: number, updates: Partial<BidLineItemFormData>) => {
    const updatedItems = [...bidForm.line_items];
    updatedItems[index] = {
      ...updatedItems[index],
      ...updates,
      // Auto-calculate total
      total_amount: (updates.quantity || updatedItems[index].quantity) * 
                   (updates.unit_price || updatedItems[index].unit_price),
    };
    
    updateBidForm({ line_items: updatedItems });
  }, [bidForm.line_items, updateBidForm]);
  
  const removeLineItem = useCallback((index: number) => {
    updateBidForm({
      line_items: bidForm.line_items.filter((_, i) => i !== index),
    });
  }, [bidForm.line_items, updateBidForm]);
  
  // Handle UI line item cost changes
  const handleLineItemCostChange = useCallback((itemId: string, cost: string) => {
    setLineItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, cost } : item
    ));
  }, []);
  
  // Handle sub-item selection
  const handleSubItemToggle = useCallback((lineItemId: string, subItemId: string) => {
    setSelectedSubItems(prev => {
      const currentSelected = prev[lineItemId] || [];
      const newSelected = currentSelected.includes(subItemId)
        ? currentSelected.filter(id => id !== subItemId)
        : [...currentSelected, subItemId];
      
      return {
        ...prev,
        [lineItemId]: newSelected
      };
    });
  }, []);
  
  // Add custom line item
  const addCustomLineItem = useCallback((name: string) => {
    if (name.trim()) {
      const newItem = {
        id: Date.now().toString(),
        name: name.trim(),
        cost: ''
      };
      setCustomLineItems(prev => [...prev, newItem]);
    }
  }, []);
  
  const removeCustomLineItem = useCallback((id: string) => {
    setCustomLineItems(prev => prev.filter(item => item.id !== id));
  }, []);
  
  const updateCustomLineItemCost = useCallback((id: string, cost: string) => {
    setCustomLineItems(prev => prev.map(item => 
      item.id === id ? { ...item, cost } : item
    ));
  }, []);
  
  // Calculate total amount from UI state
  const calculateTotal = useCallback(() => {
    const standardTotal = lineItems.reduce((sum, item) => {
      const cost = parseFloat(item.cost) || 0;
      return sum + cost;
    }, 0);
    
    const customTotal = customLineItems.reduce((sum, item) => {
      const cost = parseFloat(item.cost) || 0;
      return sum + cost;
    }, 0);
    
    return standardTotal + customTotal;
  }, [lineItems, customLineItems]);
  
  // Auto-calculate total when line items change
  useEffect(() => {
    const total = calculateTotal();
    if (total !== bidForm.amount) {
      updateBidForm({ amount: total });
    }
  }, [calculateTotal, bidForm.amount, updateBidForm]);
  
  // Convert UI state to bid line items for submission
  const convertToBidLineItems = useCallback((): BidLineItemFormData[] => {
    const items: BidLineItemFormData[] = [];
    let sortOrder = 0;
    
    // Add standard line items with selected sub-items
    lineItems.forEach((item, index) => {
      const cost = parseFloat(item.cost) || 0;
      if (cost > 0) {
        const selectedSubs = selectedSubItems[item.id] || [];
        items.push({
          category: item.id, // Use the item ID as category (transport, collection, packing, documentation)
          description: selectedSubs.length > 0 ? selectedSubs : [item.name], // Array of selected sub-items or default name
          quantity: 1,
          unit_price: cost,
          total_amount: cost,
          is_optional: false,
          sort_order: sortOrder++,
        });
      }
    });
    
    // Add custom line items
    customLineItems.forEach(item => {
      const cost = parseFloat(item.cost) || 0;
      if (cost > 0) {
        items.push({
          category: 'custom',
          description: [item.name], // Store as array for consistency
          quantity: 1,
          unit_price: cost,
          total_amount: cost,
          is_optional: true, // Custom items are optional
          sort_order: sortOrder++,
        });
      }
    });
    
    return items;
  }, [lineItems, customLineItems, selectedSubItems]);
  
  // Form validation
  const validateForm = useCallback(() => {
    const errors: string[] = [];
    
    if (!bidForm.quote_id) errors.push('Quote ID is required');
    if (calculateTotal() <= 0) errors.push('Total amount must be greater than 0');
    if (!validUntil) errors.push('Valid until date is required');
    
    const lineItems = convertToBidLineItems();
    if (lineItems.length === 0) errors.push('At least one line item is required');
    
    return errors;
  }, [bidForm.quote_id, calculateTotal, validUntil, convertToBidLineItems]);
  
  // Save and submit functions
  const handleSaveDraft = useCallback(async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    // Update form with all data before saving
    updateBidForm({
      line_items: convertToBidLineItems(),
      insurance_included: insuranceIncluded,
      special_services: specialServices,
      notes,
      valid_until: validUntil,
      estimated_transit_time: estimatedTransitTime,
    });
    
    const result = await saveBidDraft();
    
    if (result.data && !result.error) {
      // Save line items to database - convert to BidLineItem type
      const lineItemsForDb: BidLineItem[] = convertToBidLineItems().map(item => ({
        ...item,
        bid_id: result.data!.id,
      }));
      const upsertResult = await BidService.upsertBidLineItems(result.data.id, lineItemsForDb);
      if (upsertResult.error) {
        console.error('❌ upsertBidLineItems failed (save draft):', upsertResult.error, { bidId: result.data.id, lineItems: lineItemsForDb });
        alert('Failed to save line items for draft: ' + (upsertResult.error.message || String(upsertResult.error)));
      } else {
        console.log('✅ Line items saved (draft):', upsertResult.data);
      }
    }
    
    return {
      success: !result.error,
      errors: result.error ? [result.error.message] : [],
      data: result.data,
    };
  }, [validateForm, convertToBidLineItems, insuranceIncluded, specialServices, notes, validUntil, estimatedTransitTime, updateBidForm, saveBidDraft]);
  
  const handleSubmit = useCallback(async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    // Update form with all data before submitting
    updateBidForm({
      line_items: convertToBidLineItems(),
      insurance_included: insuranceIncluded,
      special_services: specialServices,
      notes,
      valid_until: validUntil,
      estimated_transit_time: estimatedTransitTime,
    });
    
    const result = await submitBid();

    if (result.data && !result.error) {
      // Save line items to database - convert to BidLineItem type
      const lineItemsForDb: BidLineItem[] = convertToBidLineItems().map(item => ({
        ...item,
        bid_id: result.data!.id,
      }));
      const upsertResult = await BidService.upsertBidLineItems(result.data.id, lineItemsForDb);
      if (upsertResult.error) {
        console.error('❌ upsertBidLineItems failed (submit):', upsertResult.error, { bidId: result.data.id, lineItems: lineItemsForDb });
        alert('Failed to save line items: ' + (upsertResult.error.message || String(upsertResult.error)));
      } else {
        console.log('✅ Line items saved (submit):', upsertResult.data);
      }
    }

    const warnings = Array.isArray(result.emissionsWarnings)
      ? Array.from(new Set(result.emissionsWarnings.filter(Boolean)))
      : [];

    return {
      success: !result.error,
      errors: result.error ? [result.error.message] : [],
      data: result.data,
      warnings,
    };
  }, [validateForm, convertToBidLineItems, insuranceIncluded, specialServices, notes, validUntil, estimatedTransitTime, updateBidForm, submitBid]);
  
  // Reset form
  const resetForm = useCallback(() => {
    updateBidForm({
      quote_id: quoteId,
      amount: 0,
      line_items: [],
      notes: '',
      is_draft: true,
      insurance_included: false,
      special_services: [],
      co2_estimate: null,
    });
    
    setLineItems(createDefaultLineItems());
    setSelectedSubItems({});
    setCustomLineItems([]);
    setInsuranceIncluded(false);
    setSpecialServices([]);
    setNotes('');
    setValidUntil('');
    setEstimatedTransitTime('');
  }, [quoteId, updateBidForm]);

  const hydrateFromBid = useCallback((bid?: BidHydrationInput | null) => {
    if (!bid) return;

    const nextLineItems = createDefaultLineItems().map((item) => {
      const match = (bid.bid_line_items || []).find((entry) => entry.category === item.id);
      if (!match) return item;
      const unitPrice =
        typeof match.unit_price === 'number'
          ? match.unit_price
          : typeof match.total_amount === 'number'
            ? match.total_amount
            : 0;
      return {
        ...item,
        cost: unitPrice ? unitPrice.toString() : '',
      };
    });
    setLineItems(nextLineItems);

    const nextSelections: Record<string, string[]> = {};
    (bid.bid_line_items || []).forEach((item) => {
      const subItems = SUB_LINE_ITEMS[item.category as EstimateLineItemId];
      if (!subItems?.length) return;
      const validIds = new Set(subItems.map((sub) => sub.id));
      const rawDescriptions = Array.isArray(item.description) ? item.description : [];
      const matched = rawDescriptions.filter((value): value is string => validIds.has(value));
      if (matched.length) {
        nextSelections[item.category] = matched;
      }
    });
    setSelectedSubItems(nextSelections);

    const normalizedSpecialServices = Array.isArray(bid.special_services) ? bid.special_services : [];

    setInsuranceIncluded(!!bid.insurance_included);
    setSpecialServices(normalizedSpecialServices);
    setNotes(bid.notes || '');
    setValidUntil(bid.valid_until || '');
    setEstimatedTransitTime(bid.estimated_transit_time || '');

    const convertedLineItems: BidLineItemFormData[] = (bid.bid_line_items || []).map((item) => ({
      category: item.category,
      description: Array.isArray(item.description) ? item.description : [],
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? 0,
      total_amount: item.total_amount ?? item.unit_price ?? 0,
      is_optional: !!item.is_optional,
      sort_order: item.sort_order,
    }));

    const derivedAmount =
      typeof bid.amount === 'number'
        ? bid.amount
        : convertedLineItems.reduce((sum, item) => sum + (item.unit_price ?? 0), 0);

    updateBidForm({
      quote_id: quoteId,
      amount: derivedAmount,
      insurance_included: !!bid.insurance_included,
      special_services: normalizedSpecialServices,
      notes: bid.notes || '',
      valid_until: bid.valid_until || undefined,
      estimated_transit_time: bid.estimated_transit_time || undefined,
      line_items: convertedLineItems,
    });
  }, [quoteId, setLineItems, setSelectedSubItems, setInsuranceIncluded, setSpecialServices, setNotes, setValidUntil, setEstimatedTransitTime, updateBidForm]);
  
  return {
    // Form data
    bidForm,
    lineItems,
    selectedSubItems,
    customLineItems,
    insuranceIncluded,
    specialServices,
    notes,
    validUntil,
    estimatedTransitTime,
    
    // Actions
    updateBidForm,
    addLineItem,
    updateLineItem,
    removeLineItem,
    handleLineItemCostChange,
    handleSubItemToggle,
    addCustomLineItem,
    removeCustomLineItem,
    updateCustomLineItemCost,
    setInsuranceIncluded,
    setSpecialServices,
    setNotes,
    setValidUntil,
    setEstimatedTransitTime,
    setLineItemsState: setLineItems,
    setSelectedSubItemsState: setSelectedSubItems,
    setCustomLineItemsState: setCustomLineItems,
    
    // Utilities
    calculateTotal,
    validateForm,
    handleSaveDraft,
    handleSubmit,
    resetForm,
    hydrateFromBid,
  };
};
