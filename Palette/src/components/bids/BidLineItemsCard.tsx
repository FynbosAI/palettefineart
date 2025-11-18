import React, { useMemo } from 'react';
import { Chip, Tooltip } from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import useCurrency from '../../hooks/useCurrency';

export interface BidLineItemDisplay {
  id: string;
  category: string;
  description: string | string[] | null;
  quantity: number | null;
  unit_price: number;
  total_amount: number | null;
  is_optional: boolean | null;
  notes: string | null;
  sort_order: number | null;
  is_active?: boolean | null;
  supersedes_id?: string | null;
}

interface BidLineItemsCardProps {
  lineItems?: BidLineItemDisplay[];
  bidTotal: number;
  isLocked?: boolean;
  lockedReason?: string;
}

export const normalizeToken = (token: unknown): string => {
  if (token === null || token === undefined) return '';
  return String(token).replace(/_/g, ' ').trim();
};

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

const computeAmount = (item: BidLineItemDisplay) => {
  const quantity = Number(item.quantity ?? 1) || 1;
  const unit = Number(item.unit_price ?? 0) || 0;
  const fallbackTotal = quantity * unit;
  const rawTotal = Number(item.total_amount ?? fallbackTotal);
  return Number.isFinite(rawTotal) ? rawTotal : fallbackTotal;
};

const BidLineItemsCard: React.FC<BidLineItemsCardProps> = ({
  lineItems,
  bidTotal,
  isLocked,
  lockedReason
}) => {
  const { formatCurrency: formatAmount } = useCurrency();
  const sortedItems = useMemo(() => {
    if (!Array.isArray(lineItems)) return [];
    return lineItems
      .filter((item) => item && item.is_active !== false)
      .map((item) => ({ ...item }))
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
      .map(item => ({
        ...item,
        description: toDisplayText(item.description),
        category: toDisplayText(item.category)
      }));
  }, [lineItems]);

  const optionalCount = useMemo(() => sortedItems.filter(item => item.is_optional).length, [sortedItems]);

  const derivedTotal = useMemo(() => {
    if (!sortedItems.length) return bidTotal;
    const accumulated = sortedItems.reduce((sum, item) => sum + computeAmount(item), 0);
    return accumulated > 0 ? accumulated : bidTotal;
  }, [sortedItems, bidTotal]);

  if (isLocked) {
    return (
      <section
        style={{
          border: '1px dashed rgba(132, 18, 255, 0.4)',
          borderRadius: '16px',
          padding: '24px',
          background: 'rgba(132, 18, 255, 0.04)',
          color: 'rgba(23, 8, 73, 0.8)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}
        aria-label="Estimate breakdown locked"
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#ffffff',
            border: '1px solid rgba(132, 18, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-primary)'
          }}
        >
          <LockOutlinedIcon fontSize="small" />
        </div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: '#170849' }}>
            Itemized breakdown hidden
          </div>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
            {lockedReason || 'The shipper has chosen not to share individual line items for this estimate.'}
          </p>
        </div>
      </section>
    );
  }

  if (!sortedItems.length) {
    return (
      <section
        style={{
          border: '1px dashed #E9EAEB',
          borderRadius: '16px',
          padding: '24px',
          background: 'rgba(224, 222, 226, 0.24)',
          color: 'rgba(23, 8, 73, 0.7)',
          fontSize: '14px'
        }}
        aria-label="Estimate breakdown unavailable"
      >
        No itemized breakdown provided.
      </section>
    );
  }

  return (
    <section
      style={{
        background: '#FFFFFF',
        border: '1px solid #E9EAEB',
        borderRadius: '16px',
        boxShadow: '0 12px 40px rgba(10, 13, 18, 0.06)',
        overflow: 'hidden'
      }}
      aria-label="Detailed estimate line items"
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '20px 24px',
          borderBottom: '1px solid #F1F1F3',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'rgba(132, 18, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary)'
            }}
          >
            <Inventory2OutlinedIcon fontSize="medium" />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#170849', letterSpacing: '0.2px' }}>Itemized cost breakdown</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <Chip
            label={`${sortedItems.length} ${sortedItems.length === 1 ? 'service' : 'services'}`}
            size="medium"
            sx={{
              fontWeight: 600,
              fontSize: '14px',
              letterSpacing: '0.2px',
              background: 'rgba(132, 18, 255, 0.12)',
              color: 'var(--color-primary)',
              height: 36,
              borderRadius: '999px',
              px: 2.5
            }}
          />
          {optionalCount > 0 && (
            <Chip
              icon={<AddCircleOutlineIcon fontSize="small" />}
              label={`${optionalCount} optional`}
              size="medium"
              sx={{
                fontWeight: 600,
                fontSize: '13px',
                background: '#FFFFFF',
                border: '1px solid rgba(0, 170, 171, 0.4)',
                color: '#008A8B'
              }}
            />
          )}
          <Chip
            label={`Total ${formatAmount(derivedTotal)}`}
            size="medium"
            sx={{
              fontWeight: 700,
              fontSize: '14px',
              letterSpacing: '0.3px',
              background: '#170849',
              color: '#FFFFFF',
              height: 36,
              borderRadius: '999px',
              px: 2.75
            }}
          />
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {sortedItems.map((item, index) => {
          const amount = computeAmount(item);
          const showDivider = index !== sortedItems.length - 1;
          return (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 2fr) minmax(auto, 1fr)',
                gap: '16px',
                padding: '20px 24px',
                borderBottom: showDivider ? '1px solid #F1F1F3' : 'none'
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '12px',
                    background: 'rgba(132, 18, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#8412FF'
                  }}
                  aria-hidden="true"
                >
                  <TaskAltOutlinedIcon fontSize="small" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#58517E' }}>
                      {item.category || 'General'}
                    </span>
                    {item.is_optional && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label="Optional"
                        sx={{
                          fontSize: '11px',
                          height: '22px',
                          borderColor: 'rgba(0, 170, 171, 0.4)',
                          color: '#008A8B'
                        }}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: '15px', color: '#170849', fontWeight: 600, lineHeight: 1.45 }}>
                    {item.description || 'Details unavailable'}
                  </div>
                  {item.notes && (
                    <Tooltip title="Additional notes" arrow>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', color: 'rgba(23, 8, 73, 0.7)', fontSize: '13px' }}>
                        <NotesOutlinedIcon sx={{ fontSize: '16px', marginTop: '2px' }} />
                        <span style={{ lineHeight: 1.5 }}>{item.notes}</span>
                      </div>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'Space Grotesk, monospace',
                  color: '#170849',
                  fontSize: '16px',
                  fontWeight: 700,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                {formatAmount(amount)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default BidLineItemsCard;
