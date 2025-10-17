import useSupabaseStore from '../store/useSupabaseStore';
import type { QuoteWithDetails } from '../lib/supabase/quotes';

/**
 * Custom hook for selecting quote-related state from the store
 * Provides easy access to quotes and selected quote details
 */
export const useQuoteSelector = () => {
  const {
    quotes,
    selectedQuoteId,
    selectedQuoteDetails,
    loading,
    error,
    fetchQuoteDetails,
    selectQuote,
    updateSelectedQuoteDetails,
    clearSelectedQuote,
  } = useSupabaseStore();

  // Get the selected quote from the store or details
  const selectedQuote = selectedQuoteDetails || quotes.find(q => q.id === selectedQuoteId);

  // Helper to select and fetch quote details if needed
  const selectAndFetchQuote = async (quoteId: string | null) => {
    if (!quoteId) {
      clearSelectedQuote();
      return null;
    }

    selectQuote(quoteId);

    // Check if we already have the details
    const existingQuote = quotes.find(q => q.id === quoteId);
    if (existingQuote && existingQuote.bids && existingQuote.bids.length >= 0) {
      updateSelectedQuoteDetails(existingQuote);
      return existingQuote;
    }

    // Fetch fresh details
    const details = await fetchQuoteDetails(quoteId);
    if (details) {
      updateSelectedQuoteDetails(details);
    }
    return details;
  };

  return {
    quotes,
    selectedQuoteId,
    selectedQuote,
    selectedQuoteDetails,
    loading,
    error,
    selectQuote,
    selectAndFetchQuote,
    clearSelectedQuote,
    updateSelectedQuoteDetails,
  };
};