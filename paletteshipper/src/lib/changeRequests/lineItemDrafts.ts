import type { BidLineItem } from '../../services/BidService';

export interface CounterLineItemDraft extends BidLineItem {
  total_amount: number;
  removed?: boolean;
}

export interface LineItemDiffField {
  field: 'quantity' | 'unit_price' | 'total_amount' | 'notes' | 'is_optional';
  previous: string | number | boolean | null;
  current: string | number | boolean | null;
}

export interface LineItemDiff {
  id: string;
  category?: string;
  description?: string[];
  fields: LineItemDiffField[];
  totalDelta: number;
  hasChanges: boolean;
}

export const roundCurrency = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const normalizeBidLineItems = (lineItems: BidLineItem[] = []): CounterLineItemDraft[] => {
  return lineItems
    .filter((item): item is BidLineItem & { id: string } => Boolean(item?.id))
    .map((item) => {
      const quantity = Number(item.quantity ?? 0) || 0;
      const unitPrice = Number(item.unit_price ?? 0) || 0;
      const derivedTotal = quantity * unitPrice;
      const providedTotal = Number(item.total_amount ?? derivedTotal) || derivedTotal;

      return {
        ...item,
        description: Array.isArray(item.description) ? [...item.description] : [],
        quantity,
        unit_price: unitPrice,
        total_amount: roundCurrency(providedTotal),
      };
    });
};

export const calculateDraftTotal = (drafts: CounterLineItemDraft[]): number => {
  const sum = drafts.reduce((acc, item) => {
    if (item.is_optional === true || item.removed) return acc; // excluded optional or removed line
    return acc + Number(item.total_amount ?? 0);
  }, 0);
  return roundCurrency(sum);
};

const hasDifferentValue = (
  previous: string | number | boolean | null | undefined,
  current: string | number | boolean | null | undefined
): boolean => {
  if (previous === current) return false;
  if (typeof previous === 'number' || typeof current === 'number') {
    return roundCurrency(Number(previous ?? 0)) !== roundCurrency(Number(current ?? 0));
  }
  return (previous ?? null) !== (current ?? null);
};

export const diffLineItems = (
  original: CounterLineItemDraft[],
  drafts: CounterLineItemDraft[]
): LineItemDiff[] => {
  const originalMap = new Map<string, CounterLineItemDraft>();
  original.forEach((item) => {
    if (item.id) {
      originalMap.set(item.id, item);
    }
  });

  return drafts.map((draft, index) => {
    const previous = draft.id ? originalMap.get(draft.id) : undefined;
    const fields: LineItemDiffField[] = [];

    if (hasDifferentValue(previous?.quantity, draft.quantity)) {
      fields.push({
        field: 'quantity',
        previous: previous?.quantity ?? null,
        current: draft.quantity ?? null,
      });
    }

    if (hasDifferentValue(previous?.unit_price, draft.unit_price)) {
      fields.push({
        field: 'unit_price',
        previous: previous?.unit_price ?? null,
        current: draft.unit_price ?? null,
      });
    }

    if (hasDifferentValue(previous?.total_amount, draft.total_amount)) {
      fields.push({
        field: 'total_amount',
        previous: previous?.total_amount ?? null,
        current: draft.total_amount ?? null,
      });
    }

    if (hasDifferentValue(previous?.notes ?? null, draft.notes ?? null)) {
      fields.push({
        field: 'notes',
        previous: previous?.notes ?? null,
        current: draft.notes ?? null,
      });
    }

    if (hasDifferentValue(previous?.is_optional ?? false, draft.is_optional ?? false)) {
      fields.push({
        field: 'is_optional',
        previous: previous?.is_optional ?? false,
        current: draft.is_optional ?? false,
      });
    }

    const removedChanged = previous && draft.removed;

    return {
      id: draft.id ?? `draft-${index}`,
      category: draft.category,
      description: draft.description,
      fields,
      totalDelta: roundCurrency((draft.total_amount ?? 0) - (previous?.total_amount ?? 0)),
      hasChanges: fields.length > 0 || removedChanged || !previous,
    };
  });
};
