import React, { useMemo, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Button, Alert } from '@mui/material';

export interface ChangeRequestFormValues {
  proposed_ship_date?: string | null;
  proposed_delivery_date?: string | null;
  notes?: string | null;
  reason?: string | null;
  proposal: {
    origin_location?: {
      name?: string | null;
      address_full?: string | null;
      contact_name?: string | null;
      contact_phone?: string | null;
      contact_email?: string | null;
    } | null;
    destination_location?: {
      name?: string | null;
      address_full?: string | null;
      contact_name?: string | null;
      contact_phone?: string | null;
      contact_email?: string | null;
    } | null;
    modified_fields: string[];
  };
}

interface ChangeRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: ChangeRequestFormValues) => Promise<void> | void;
  submitting?: boolean;
}

const isNonEmpty = (v?: string | null) => Boolean(v && v.trim().length > 0);

const ChangeRequestModal: React.FC<ChangeRequestModalProps> = ({ open, onClose, onSubmit, submitting }) => {
  const [proposedShipDate, setProposedShipDate] = useState<string>('');
  const [proposedDeliveryDate, setProposedDeliveryDate] = useState<string>('');
  const [originName, setOriginName] = useState<string>('');
  const [originAddress, setOriginAddress] = useState<string>('');
  const [originContactName, setOriginContactName] = useState<string>('');
  const [originContactPhone, setOriginContactPhone] = useState<string>('');
  const [originContactEmail, setOriginContactEmail] = useState<string>('');
  const [destName, setDestName] = useState<string>('');
  const [destAddress, setDestAddress] = useState<string>('');
  const [destContactName, setDestContactName] = useState<string>('');
  const [destContactPhone, setDestContactPhone] = useState<string>('');
  const [destContactEmail, setDestContactEmail] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const [error, setError] = useState<string | null>(null);

  const modifiedFields = useMemo(() => {
    const fields: string[] = [];
    if (isNonEmpty(proposedShipDate)) fields.push('proposed_ship_date');
    if (isNonEmpty(proposedDeliveryDate)) fields.push('proposed_delivery_date');
    const originChanged = [originName, originAddress, originContactName, originContactPhone, originContactEmail].some(isNonEmpty);
    if (originChanged) fields.push('origin_location');
    const destChanged = [destName, destAddress, destContactName, destContactPhone, destContactEmail].some(isNonEmpty);
    if (destChanged) fields.push('destination_location');
    if (isNonEmpty(notes)) fields.push('notes');
    if (isNonEmpty(reason)) fields.push('reason');
    return fields;
  }, [proposedShipDate, proposedDeliveryDate, originName, originAddress, originContactName, originContactPhone, originContactEmail, destName, destAddress, destContactName, destContactPhone, destContactEmail, notes, reason]);

  const handleSubmit = async () => {
    setError(null);
    // Validation: at least one field changed
    if (modifiedFields.length === 0) {
      setError('Please change at least one field before submitting.');
      return;
    }
    // Validation: notes length
    if (notes.length > 500) {
      setError('Notes must be 500 characters or less.');
      return;
    }
    // Validation: date ordering if both provided
    if (isNonEmpty(proposedShipDate) && isNonEmpty(proposedDeliveryDate)) {
      const ship = new Date(proposedShipDate);
      const del = new Date(proposedDeliveryDate);
      if (ship > del) {
        setError('Ship date must be before or on the delivery date.');
        return;
      }
    }

    const origin_location = [originName, originAddress, originContactName, originContactPhone, originContactEmail].some(isNonEmpty)
      ? {
          name: isNonEmpty(originName) ? originName : null,
          address_full: isNonEmpty(originAddress) ? originAddress : null,
          contact_name: isNonEmpty(originContactName) ? originContactName : null,
          contact_phone: isNonEmpty(originContactPhone) ? originContactPhone : null,
          contact_email: isNonEmpty(originContactEmail) ? originContactEmail : null,
        }
      : null;

    const destination_location = [destName, destAddress, destContactName, destContactPhone, destContactEmail].some(isNonEmpty)
      ? {
          name: isNonEmpty(destName) ? destName : null,
          address_full: isNonEmpty(destAddress) ? destAddress : null,
          contact_name: isNonEmpty(destContactName) ? destContactName : null,
          contact_phone: isNonEmpty(destContactPhone) ? destContactPhone : null,
          contact_email: isNonEmpty(destContactEmail) ? destContactEmail : null,
        }
      : null;

    const values: ChangeRequestFormValues = {
      proposed_ship_date: isNonEmpty(proposedShipDate) ? proposedShipDate : null,
      proposed_delivery_date: isNonEmpty(proposedDeliveryDate) ? proposedDeliveryDate : null,
      notes: isNonEmpty(notes) ? notes : null,
      reason: isNonEmpty(reason) ? reason : null,
      proposal: {
        origin_location,
        destination_location,
        modified_fields: modifiedFields,
      },
    };

    await onSubmit(values);
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Request Shipment Change</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Proposed Ship Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={proposedShipDate}
              onChange={(e) => setProposedShipDate(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Proposed Delivery Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={proposedDeliveryDate}
              onChange={(e) => setProposedDeliveryDate(e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <Alert severity="info">Origin and destination fields are optional; provide only what changed.</Alert>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField label="Origin Name" fullWidth value={originName} onChange={(e) => setOriginName(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label="Origin Address (full)" fullWidth value={originAddress} onChange={(e) => setOriginAddress(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Origin Contact Name" fullWidth value={originContactName} onChange={(e) => setOriginContactName(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Origin Contact Phone" fullWidth value={originContactPhone} onChange={(e) => setOriginContactPhone(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Origin Contact Email" fullWidth value={originContactEmail} onChange={(e) => setOriginContactEmail(e.target.value)} />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField label="Destination Name" fullWidth value={destName} onChange={(e) => setDestName(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label="Destination Address (full)" fullWidth value={destAddress} onChange={(e) => setDestAddress(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Destination Contact Name" fullWidth value={destContactName} onChange={(e) => setDestContactName(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Destination Contact Phone" fullWidth value={destContactPhone} onChange={(e) => setDestContactPhone(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Destination Contact Email" fullWidth value={destContactEmail} onChange={(e) => setDestContactEmail(e.target.value)} />
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Notes for shipper (max 500 chars)"
              fullWidth
              multiline
              minRows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              inputProps={{ maxLength: 500 }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Reason (optional)" fullWidth value={reason} onChange={(e) => setReason(e.target.value)} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={Boolean(submitting)}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={Boolean(submitting)}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ChangeRequestModal;


