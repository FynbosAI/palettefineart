import { Quote, QuoteRequest } from './types';
import { computeDeadlineState } from './deadline';

export function transformQuoteToRequest(quote: Quote): QuoteRequest {
  const manualClose = quote.auto_close_bidding === false;
  const deadlineState = computeDeadlineState(quote.bidding_deadline, { manualClose });

  const getTargetDateRange = (targetQuote: Quote) => {
    if (targetQuote.target_date_start && targetQuote.target_date_end) {
      const start = new Date(targetQuote.target_date_start);
      const end = new Date(targetQuote.target_date_end);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (targetQuote.target_date) {
      const date = new Date(targetQuote.target_date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return 'TBD';
  };

  const getStatus = (targetQuote: Quote) => {
    if (targetQuote.type === 'direct') return 'open';
    if (targetQuote.status === 'closed' || targetQuote.status === 'cancelled') {
      return targetQuote.status;
    }

    if (deadlineState.isExpired) {
      return 'closed';
    }

    if (deadlineState.urgency === 'warning' || deadlineState.urgency === 'critical') {
      return 'closing_soon';
    }

    return 'open';
  };

  const artworkCount = quote.shipments?.[0]?.artworks?.[0]?.count || 0;
  const bidCount = quote.bids?.[0]?.count || 0;
  const originName = quote.origin?.[0]?.name || 'Origin TBD';
  const destinationName = quote.destination?.[0]?.name || 'Destination TBD';
  const ownerOrgName = quote.owner_org?.[0]?.name || 'Unknown Gallery';

  return {
    ...quote,
    gallery: ownerOrgName,
    pickupDate: quote.target_date_start || quote.target_date || 'TBD',
    auctionDeadline: quote.bidding_deadline || '',
    artworkCount,
    totalValue: quote.value || 0,
    specialRequirements: [],
    currentBids: bidCount,
    timeLeft: deadlineState.label,
    deadlineState,
    autoCloseBidding: quote.auto_close_bidding !== false,
    targetDate: getTargetDateRange(quote),
    origin: originName,
    destination: destinationName,
    route: quote.route || `${originName} → ${destinationName}`,
    status: getStatus(quote)
  };
}
