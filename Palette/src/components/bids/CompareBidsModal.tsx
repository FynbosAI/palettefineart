import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton, Chip, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { AnimatePresence, motion } from 'motion/react';
import type { BidLineItemDisplay } from './BidLineItemsCard';
import { normalizeToken } from './BidLineItemsCard';
import useCurrency from '../../hooks/useCurrency';

export interface ComparableBid {
  id: string;
  shipper: {
    name: string;
    abbreviation: string;
    brandColor: string;
  };
  price: number;
  deliveryTime: string;
  co2Tonnes: number;
  status: string;
  isWinning?: boolean;
  line_items?: BidLineItemDisplay[];
}

type ComparisonRowEntry = {
  bidId: string;
  present: boolean;
  amount?: number;
  isOptional: boolean;
  notes?: string | null;
};

type ComparisonRow = {
  key: string;
  category: string;
  description: string;
  order: number;
  entries: ComparisonRowEntry[];
};

interface CompareBidsModalProps {
  open: boolean;
  bids: ComparableBid[];
  onClose: () => void;
  onClearSelection?: () => void;
}

const toDisplayText = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map(normalizeToken)
      .join(' • ')
      .trim();
  }

  return normalizeToken(value);
};

const computeAmount = (item: BidLineItemDisplay): number => {
  const quantity = Number(item.quantity ?? 1) || 1;
  const unit = Number(item.unit_price ?? 0) || 0;
  const fallbackTotal = quantity * unit;
  const raw = Number(item.total_amount ?? fallbackTotal);
  return Number.isFinite(raw) ? raw : fallbackTotal;
};

const deriveComparisonRows = (bids: ComparableBid[]): ComparisonRow[] => {
  const rowMap = new Map<string, {
    key: string;
    category: string;
    description: string;
    order: number;
    entries: Record<string, ComparisonRowEntry>;
  }>();

  bids.forEach((bid, columnIndex) => {
    const items = [...(bid.line_items ?? [])].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));

    items.forEach((item, itemIndex) => {
      const categoryText = normalizeToken(item.category) || 'Additional';
      const descriptionText = toDisplayText(item.description);
      const sortOrder = (item.sort_order ?? 9999) + itemIndex / 100 + columnIndex / 1000;
      const normalizedKey = `${categoryText.toLowerCase()}|${descriptionText.toLowerCase()}`;

      const existing = rowMap.get(normalizedKey);
      if (!existing) {
        rowMap.set(normalizedKey, {
          key: normalizedKey,
          category: categoryText,
          description: descriptionText || 'Details unavailable',
          order: sortOrder,
          entries: {}
        });
      } else {
        existing.order = Math.min(existing.order, sortOrder);
      }

      rowMap.get(normalizedKey)!.entries[bid.id] = {
        bidId: bid.id,
        present: true,
        amount: computeAmount(item),
        isOptional: Boolean(item.is_optional),
        notes: item.notes
      };
    });
  });

  const rows = Array.from(rowMap.values())
    .map(row => ({
      key: row.key,
      category: row.category,
      description: row.description,
      order: row.order,
      entries: bids.map(bid => row.entries[bid.id] ?? {
        bidId: bid.id,
        present: false,
        isOptional: false
      })
    }))
    .sort((a, b) => a.order - b.order || a.category.localeCompare(b.category) || a.description.localeCompare(b.description));

  return rows;
};

const CompareBidsModal: React.FC<CompareBidsModalProps> = ({ open, bids, onClose, onClearSelection }) => {
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);
  const [includeOptional, setIncludeOptional] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { formatCurrency: formatAmount } = useCurrency();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const columnTemplate = useMemo(() => `260px repeat(${bids.length}, minmax(220px, 1fr))`, [bids.length]);

  const summaryStats = useMemo(() => {
    return bids.map(bid => {
      const services = bid.line_items ?? [];
      const optionalCount = services.filter(item => item.is_optional).length;
      return {
        bidId: bid.id,
        totalServices: services.length,
        optionalCount
      };
    });
  }, [bids]);

  const baseRows = useMemo(() => deriveComparisonRows(bids), [bids]);

  const filteredRows = useMemo(() => {
    let rows = baseRows;

    if (!includeOptional) {
      rows = rows.filter(row => row.entries.some(entry => entry.present && !entry.isOptional));
    }

    if (showOnlyDifferences) {
      rows = rows.filter(row => {
        const reference = row.entries[0];
        return row.entries.some(entry => {
          if (entry.present !== reference.present) return true;
          if (entry.isOptional !== reference.isOptional) return true;
          if (entry.present && reference.present && entry.amount !== reference.amount) return true;
          const refNotes = (reference.notes || '').trim();
          const entryNotes = (entry.notes || '').trim();
          if (refNotes !== entryNotes) return true;
          return false;
        });
      });
    }

    return rows;
  }, [baseRows, includeOptional, showOnlyDifferences]);

  const displayRows = useMemo(() => {
    if (!groupByCategory) {
      return filteredRows.map(row => ({ kind: 'item' as const, row, key: row.key }));
    }

    const result: Array<{ kind: 'category'; category: string; key: string } | { kind: 'item'; row: ComparisonRow; key: string }> = [];
    let lastCategory = '';

    filteredRows.forEach(row => {
      if (row.category !== lastCategory) {
        lastCategory = row.category;
        result.push({ kind: 'category', category: row.category, key: `category-${row.category}-${row.order}` });
      }
      result.push({ kind: 'item', row, key: row.key });
    });

    return result;
  }, [filteredRows, groupByCategory]);

  const renderToggleButton = (label: string, active: boolean, onClick: () => void) => (
    <Button
      variant={active ? 'contained' : 'outlined'}
      onClick={onClick}
      sx={{
        textTransform: 'none',
        fontWeight: 600,
        borderRadius: '999px',
        padding: '8px 18px',
        color: active ? '#FFFFFF' : 'var(--color-primary)',
        background: active ? 'var(--color-primary)' : '#FFFFFF',
        '&:hover': {
          background: active ? 'var(--color-primary-dark)' : 'rgba(132, 18, 255, 0.08)'
        }
      }}
    >
      {label}
    </Button>
  );
  
  if (!isMounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="compare-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: '#170849',
              zIndex: 49
            }}
          />
          <motion.div
            key="compare-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              height: '100%',
              width: 'min(1160px, 94vw)',
              maxWidth: '1160px',
              background: '#FCFCFD',
              borderRadius: '0 24px 24px 0',
              boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              gap: '24px',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Compare estimates"
          >
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#170849' }}>
                  Compare Estimates
                </h2>
                <Chip
                  label={`${bids.length} selected`}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600, letterSpacing: '0.2px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {onClearSelection && (
                  <Button
                    variant="text"
                    onClick={onClearSelection}
                    sx={{ textTransform: 'none', fontWeight: 600, color: '#58517E' }}
                  >
                    Clear selection
                  </Button>
                )}
                <IconButton onClick={onClose} aria-label="Close compare view">
                  <CloseIcon />
                </IconButton>
              </div>
            </header>

            <section
              style={{
                display: 'grid',
                gridTemplateColumns: columnTemplate,
                gap: '16px',
                padding: '20px',
                background: '#FFFFFF',
                border: '1px solid #E9EAEB',
                borderRadius: '16px'
              }}
            >
          <div style={{ fontSize: '14px', color: '#58517E', fontWeight: 600 }}>Estimator</div>
          {bids.map(bid => (
            <div key={bid.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#170849' }}>{bid.shipper.name}</span>
                {bid.isWinning && (
                  <Chip
                    label="Winning"
                    size="small"
                    sx={{ background: 'rgba(13, 171, 113, 0.12)', color: '#0DAB71', fontWeight: 600 }}
                  />
                )}
              </div>
              <span style={{ fontSize: '13px', color: 'rgba(23, 8, 73, 0.7)' }}>
                {formatAmount(bid.price)}
              </span>
            </div>
          ))}

          <div style={{ fontSize: '14px', color: '#58517E', fontWeight: 600 }}>Delivery</div>
          {bids.map(bid => (
            <div key={`${bid.id}-delivery`} style={{ fontSize: '13px', color: '#170849' }}>
              {bid.deliveryTime}
            </div>
          ))}

          <div style={{ fontSize: '14px', color: '#58517E', fontWeight: 600 }}>CO₂</div>
          {bids.map(bid => (
            <div key={`${bid.id}-co2`} style={{ fontSize: '13px', color: '#170849' }}>
              {bid.co2Tonnes > 0 ? `${bid.co2Tonnes} kg CO₂e` : 'Not provided'}
            </div>
          ))}

          <div style={{ fontSize: '14px', color: '#58517E', fontWeight: 600 }}>Services</div>
          {summaryStats.map(stat => (
            <div key={`${stat.bidId}-services`} style={{ fontSize: '13px', color: '#170849' }}>
              {stat.totalServices} total
              {stat.optionalCount > 0 && (
                <span style={{ color: '#008A8B', marginLeft: '6px' }}>
                  • {stat.optionalCount} optional
                </span>
              )}
            </div>
          ))}
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#58517E', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              Filters
            </span>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {renderToggleButton('Show only differences', showOnlyDifferences, () => setShowOnlyDifferences(v => !v))}
              {renderToggleButton('Include optional', includeOptional, () => setIncludeOptional(v => !v))}
              {renderToggleButton('Group by category', groupByCategory, () => setGroupByCategory(v => !v))}
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', border: '1px solid #E9EAEB', borderRadius: '16px', background: '#FFFFFF' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: columnTemplate,
                columnGap: '16px',
                rowGap: '8px',
                padding: '20px'
              }}
            >
              {displayRows.length === 0 && (
                <div style={{ gridColumn: `1 / span ${bids.length + 1}`, textAlign: 'center', color: 'rgba(23, 8, 73, 0.6)', padding: '32px 0' }}>
                  No services match the current filters.
                </div>
              )}

              {displayRows.map(item => {
                if (item.kind === 'category') {
                  return (
                    <div
                      key={item.key}
                      style={{
                        gridColumn: `1 / span ${bids.length + 1}`,
                        marginTop: '12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.6px',
                        textTransform: 'uppercase',
                        color: '#58517E'
                      }}
                    >
                      {item.category}
                    </div>
                  );
                }

                const row = item.row;
                const background = hoverKey === row.key ? 'rgba(132, 18, 255, 0.05)' : '#FFFFFF';

                return (
                  <React.Fragment key={item.key}>
                    <div
                      onMouseEnter={() => setHoverKey(row.key)}
                      onMouseLeave={() => setHoverKey(null)}
                      style={{
                        background,
                        padding: '12px 16px',
                        borderRadius: '12px',
                        color: '#170849',
                        fontWeight: 600,
                        fontSize: '14px'
                      }}
                    >
                      <div>{row.description}</div>
                    </div>
                    {row.entries.map((entry, columnIdx) => (
                      <div
                        key={`${row.key}-${entry.bidId}`}
                        onMouseEnter={() => setHoverKey(row.key)}
                        onMouseLeave={() => setHoverKey(null)}
                        style={{
                          background,
                          padding: '12px 16px',
                          borderRadius: columnIdx === bids.length - 1 ? '0 12px 12px 0' : '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        {entry.present ? (
                          <>
                            <span style={{ fontFamily: 'Space Grotesk, monospace', fontSize: '15px', fontWeight: 600, color: '#170849' }}>
                              {formatAmount(entry.amount ?? 0)}
                            </span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {entry.isOptional && (
                                <Chip
                                  size="small"
                                  label="Optional"
                                  sx={{
                                    background: 'rgba(0, 170, 171, 0.12)',
                                    color: '#008A8B',
                                    fontWeight: 600
                                  }}
                                />
                              )}
                              {entry.notes && (
                                <span style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)' }}>
                                  {entry.notes}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span style={{ fontSize: '14px', color: 'rgba(23, 8, 73, 0.5)' }}>—</span>
                        )}
                      </div>
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </section>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default CompareBidsModal;
