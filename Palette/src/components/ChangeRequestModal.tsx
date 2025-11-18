import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Button,
  Alert,
  Box,
  Typography,
  Divider,
  Chip,
} from '@mui/material';

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
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '18px',
          overflow: 'hidden',
          boxShadow: '0 35px 80px rgba(23, 8, 73, 0.25)',
          border: '1px solid #E9EAEB',
        },
      }}
    >
      <DialogTitle sx={{ pb: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip
            label="Shipment change"
            sx={{
              backgroundColor: 'rgba(132, 18, 255, 0.12)',
              color: '#8412FF',
              fontWeight: 700,
              borderRadius: '999px',
              height: 26,
            }}
          />
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#170849' }}>
            Request updates
          </Typography>
          <Typography variant="body2" sx={{ color: '#58517E' }}>
            Share what changed so your shipper can re-confirm.
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 2.5, pb: 1.5 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '12px' }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}
        >
          <Box
            sx={{
              border: '1px solid #E9EAEB',
              background: '#FCFCFD',
              borderRadius: '14px',
              boxShadow: '0 20px 40px rgba(10, 13, 18, 0.08)',
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#170849', mb: 1, fontWeight: 700 }}>
              Schedule
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Proposed Ship Date"
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={proposedShipDate}
                  onChange={(e) => setProposedShipDate(e.target.value)}
                  sx={{ background: '#FFFFFF', borderRadius: '10px' }}
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
                  sx={{ background: '#FFFFFF', borderRadius: '10px' }}
                />
              </Grid>
            </Grid>
          </Box>

          <Box
            sx={{
              border: '1px solid #E9EAEB',
              background: '#FCFCFD',
              borderRadius: '14px',
              boxShadow: '0 20px 40px rgba(10, 13, 18, 0.08)',
              p: { xs: 2, sm: 2.5 },
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ color: '#170849', fontWeight: 700 }}>
                Locations
              </Typography>
              <Divider flexItem orientation="horizontal" sx={{ flex: 1, borderColor: '#E9EAEB' }} />
              <Typography variant="caption" sx={{ color: '#58517E' }}>
                Only fill what changed
              </Typography>
            </Box>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <Typography variant="overline" sx={{ color: '#58517E', letterSpacing: 0.6 }}>
                  Origin
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: 0.75 }}>
                  <TextField label="Origin Name" fullWidth value={originName} onChange={(e) => setOriginName(e.target.value)} />
                  <TextField label="Origin Address (full)" fullWidth value={originAddress} onChange={(e) => setOriginAddress(e.target.value)} />
                  <Grid container spacing={1}>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Contact Name" fullWidth value={originContactName} onChange={(e) => setOriginContactName(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Contact Phone" fullWidth value={originContactPhone} onChange={(e) => setOriginContactPhone(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Contact Email" fullWidth value={originContactEmail} onChange={(e) => setOriginContactEmail(e.target.value)} />
                    </Grid>
                  </Grid>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="overline" sx={{ color: '#58517E', letterSpacing: 0.6 }}>
                  Destination
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: 0.75 }}>
                  <TextField label="Destination Name" fullWidth value={destName} onChange={(e) => setDestName(e.target.value)} />
                  <TextField label="Destination Address (full)" fullWidth value={destAddress} onChange={(e) => setDestAddress(e.target.value)} />
                  <Grid container spacing={1}>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Contact Name" fullWidth value={destContactName} onChange={(e) => setDestContactName(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Contact Phone" fullWidth value={destContactPhone} onChange={(e) => setDestContactPhone(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Contact Email" fullWidth value={destContactEmail} onChange={(e) => setDestContactEmail(e.target.value)} />
                    </Grid>
                  </Grid>
                </Box>
              </Grid>
            </Grid>
          </Box>

          <Box
            sx={{
              border: '1px solid #E9EAEB',
              background: '#FCFCFD',
              borderRadius: '14px',
              boxShadow: '0 20px 40px rgba(10, 13, 18, 0.08)',
              p: { xs: 2, sm: 2.5 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#170849', fontWeight: 700 }}>
              Notes & rationale
            </Typography>
            <Alert
              severity="info"
              sx={{
                borderRadius: '12px',
                backgroundColor: 'rgba(132, 18, 255, 0.05)',
                color: '#170849',
              }}
            >
              Origin and destination fields are optional; provide only what changed. Notes help your shipper validate the request faster.
            </Alert>
            <TextField
              label="Notes for shipper (max 500 chars)"
              fullWidth
              multiline
              minRows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              inputProps={{ maxLength: 500 }}
            />
            <TextField
              label="Reason (optional)"
              fullWidth
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleClose}
          disabled={Boolean(submitting)}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            color: '#170849',
            px: 2,
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={Boolean(submitting)}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: '999px',
            background: '#8412ff',
            color: '#ffffff',
            px: 3.5,
            boxShadow: '0 14px 30px rgba(132, 18, 255, 0.25)',
            '&:hover': {
              background: '#730add',
              boxShadow: '0 18px 32px rgba(115, 10, 221, 0.35)',
            },
            '&.Mui-disabled': {
              background: 'rgba(23, 8, 73, 0.12)',
              color: 'rgba(23, 8, 73, 0.45)',
            },
          }}
        >
          {submitting ? 'Submitting…' : 'Submit Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ChangeRequestModal;
