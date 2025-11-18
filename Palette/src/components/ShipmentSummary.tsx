import React from 'react';
import { ShipmentDetails } from '../types';
import { Button, Stack, CircularProgress } from '@mui/material';
import { DeliverySpecificsDetails } from '../types/legacy';
import useCurrency from '../hooks/useCurrency';

interface SummaryData {
    artworkCount: number;
    totalValue: number;
    selectedShipperNames: string[];
}

interface ShipmentSummaryProps {
    summary: SummaryData;
    details: ShipmentDetails;
    deliveryDetails?: DeliverySpecificsDetails | null;
    clientReference?: string | null;
    disabled?: boolean;
    isSubmitting?: boolean;
    onSubmit: () => void;
    onSaveDraft: () => void;
}

const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: '500', color: '#170849', textAlign: 'right' }}>{value}</span>
    </div>
);

const ShipmentSummary: React.FC<ShipmentSummaryProps> = ({ summary, details, deliveryDetails, clientReference, disabled = false, isSubmitting = false, onSubmit, onSaveDraft }) => {
  const { formatCurrency } = useCurrency();
  
  // Check if any delivery specifics are selected
  const hasDeliverySelections = deliveryDetails && (
    deliveryDetails.deliveryRequirements.size > 0 || 
    deliveryDetails.packingRequirements !== '' ||
    deliveryDetails.accessAtDelivery.size > 0 ||
    (deliveryDetails.safetySecurityRequirements && deliveryDetails.safetySecurityRequirements.size > 0) ||
    (deliveryDetails.conditionCheckRequirements && deliveryDetails.conditionCheckRequirements.size > 0)
  );
  return (
    <div style={{ position: 'sticky', top: '32px' }}>
        <div className="detail-card">
            <h2>Estimate Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <SummaryRow label="Total Artworks" value={summary.artworkCount} />
                <SummaryRow 
                    label="Total Declared Value" 
                    value={formatCurrency(summary.totalValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                />
                {clientReference && clientReference.trim().length > 0 && (
                  <SummaryRow label="Client Reference" value={clientReference.trim()} />
                )}
            </div>
            
            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #E1E5EA' }} />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 <SummaryRow label="Transport Mode" value={details.transportMode} />
                 <SummaryRow label="Transport Type" value={details.transportType} />
                 <SummaryRow 
                    label="Arrival Date" 
                    value={
                        details.arrivalDate && details.arrivalDate.trim() !== ''
                            ? (() => {
            try {
              const date = new Date(details.arrivalDate);
              if (isNaN(date.getTime())) {
                console.warn('⚠️ Invalid arrival date in ShipmentSummary:', details.arrivalDate);
                return 'TBD';
              }
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } catch (error) {
              console.error('❌ Date parsing error in ShipmentSummary:', error);
              return 'TBD';
            }
          })()
                            : 'Not specified'
                    }
                />
            </div>

            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #E1E5EA' }} />
            
            <div>
                 <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '8px' }}>
                    Selected Carriers
                 </div>
                 {summary.selectedShipperNames.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {summary.selectedShipperNames.map(name => (
                            <span 
                                key={name} 
                                className="tag purple"
                            >
                                {name}
                            </span>
                        ))}
                    </div>
                 ) : (
                    <p style={{ 
                        fontSize: '12px', 
                        color: 'rgba(23, 8, 73, 0.7)'
                    }}>
                        No carriers selected.
                    </p>
                 )}
            </div>

            {hasDeliverySelections && (
              <>
                <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #E1E5EA' }} />
                
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '8px' }}>
                    Delivery Specifics
                  </div>
                  
                  {deliveryDetails!.deliveryRequirements.size > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(23, 8, 73, 0.5)', marginBottom: '4px' }}>
                        Delivery Requirements:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Array.from(deliveryDetails!.deliveryRequirements).map(req => (
                          <span key={req} className="tag purple" style={{ fontSize: '10px' }}>
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {deliveryDetails!.packingRequirements && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(23, 8, 73, 0.5)', marginBottom: '4px' }}>
                        Packing:
                      </div>
                      <span className="tag purple" style={{ fontSize: '10px' }}>
                        {deliveryDetails!.packingRequirements}
                      </span>
                    </div>
                  )}
                  
                  {deliveryDetails!.accessAtDelivery.size > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(23, 8, 73, 0.5)', marginBottom: '4px' }}>
                        Access Requirements:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Array.from(deliveryDetails!.accessAtDelivery).map(access => (
                          <span key={access} className="tag purple" style={{ fontSize: '10px' }}>
                            {access}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {deliveryDetails!.safetySecurityRequirements && deliveryDetails!.safetySecurityRequirements.size > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(23, 8, 73, 0.5)', marginBottom: '4px' }}>
                        Safety & Security:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Array.from(deliveryDetails!.safetySecurityRequirements).map(req => (
                          <span key={req} className="tag purple" style={{ fontSize: '10px' }}>
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {deliveryDetails!.conditionCheckRequirements && deliveryDetails!.conditionCheckRequirements.size > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'rgba(23, 8, 73, 0.5)', marginBottom: '4px' }}>
                        Condition Checks:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Array.from(deliveryDetails!.conditionCheckRequirements).map(req => (
                          <span key={req} className="tag purple" style={{ fontSize: '10px' }}>
                            {req.length > 50 ? req.substring(0, 50) + '...' : req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
        </div>
        <Stack direction="row" spacing={2} sx={{ marginTop: '16px', justifyContent: 'center' }}>
          <Button
            variant="text"
            onClick={onSaveDraft}
            disabled={isSubmitting}
            sx={{
              py: 1,
              px: 2.5,
              borderRadius: '8px',
              color: '#58517E',
              '&:hover': {
                background: 'rgba(88, 81, 126, 0.04)',
              },
            }}
          >
            Save As Draft
          </Button>
          <Button
            type="button"
            variant="contained"
            disabled={disabled || isSubmitting}
            onClick={onSubmit}
            sx={{
              py: 1.5,
              px: 3,
              borderRadius: '8px',
            }}
          >
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Submit Request'}
          </Button>
        </Stack>
    </div>
  );
};

export default ShipmentSummary;
