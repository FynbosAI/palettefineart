import React, { useState } from 'react';
import { Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button, Alert, Chip, Divider } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import useCurrency from '../../hooks/useCurrency';
import useShipperStore from '../../store/useShipperStore';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  CURRENCY_LABELS,
  type SupportedCurrency
} from '../../lib/currency';

const Profile: React.FC = () => {
  const {
    preferredCurrency,
    currencyRates,
    currencyRatesLoading,
    currencyRatesError,
    refreshCurrencyRates
  } = useCurrency();
  const user = useShipperStore((state) => state.user);
  const profile = useShipperStore((state) => state.profile);
  const organization = useShipperStore((state) => state.organization);
  const logisticsPartner = useShipperStore((state) => state.logisticsPartner);
  const memberships = useShipperStore((state) => state.memberships);
  const updateCurrencyPreference = useShipperStore((state) => state.updateCurrencyPreference);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const handleCurrencyChange = async (event: SelectChangeEvent<SupportedCurrency>) => {
    const next = event.target.value as SupportedCurrency;
    if (next === preferredCurrency) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      await updateCurrencyPreference(next);
      setFeedback({
        message: `Display currency updated to ${CURRENCY_LABELS[next]}.`,
        severity: 'success'
      });
    } catch (error) {
      setFeedback({
        message: (error as Error).message || 'Failed to update currency preference.',
        severity: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshRates = async () => {
    setFeedback(null);
    try {
      await refreshCurrencyRates(true);
      setFeedback({
        message: 'Exchange rates refreshed successfully.',
        severity: 'success'
      });
    } catch (error) {
      setFeedback({
        message: (error as Error).message || 'Unable to refresh exchange rates.',
        severity: 'error'
      });
    }
  };

  const lastUpdated = currencyRates.fetchedAt ? new Date(currencyRates.fetchedAt).toLocaleString() : null;

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <div className="header-row">
            <h1 className="header-title">Profile</h1>
          </div>
        </header>
        <div className="main-content" style={{ flexDirection: 'column', gap: '24px', maxWidth: 720 }}>
          <Card sx={{ borderRadius: '16px', border: '1px solid rgba(0, 170, 171, 0.12)', backgroundColor: '#FFFFFF' }}>
            <CardContent sx={{ padding: '24px' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0e122b', marginBottom: '16px' }}>
                Account Details
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#5b6070', textTransform: 'uppercase', fontWeight: 600 }}>
                    Name
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#0e122b', marginTop: '4px' }}>
                    {profile?.full_name || user?.email || '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#5b6070', textTransform: 'uppercase', fontWeight: 600 }}>
                    Email
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#0e122b', marginTop: '4px' }}>
                    {user?.email || '—'}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle2" sx={{ color: '#5b6070', fontWeight: 600, marginBottom: '12px' }}>
                Organization & Branch
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#5b6070', textTransform: 'uppercase', fontWeight: 600 }}>
                    Organization
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#0e122b', marginTop: '4px' }}>
                    {organization?.name || logisticsPartner?.name || '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#5b6070', textTransform: 'uppercase', fontWeight: 600 }}>
                    Branch
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#0e122b', marginTop: '4px' }}>
                    {organization?.branch_name || logisticsPartner?.abbreviation || '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#5b6070', textTransform: 'uppercase', fontWeight: 600 }}>
                    Membership
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#0e122b', marginTop: '4px' }}>
                    {memberships.find((m) => m.org_id === organization?.id)?.role || '—'}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: '16px', border: '1px solid rgba(0, 170, 171, 0.18)', backgroundColor: '#FFFFFF' }}>
            <CardContent sx={{ padding: '24px' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0e122b', marginBottom: '16px' }}>
                Currency Preference
              </Typography>
              <Typography variant="body2" sx={{ color: '#5b6070', marginBottom: '16px' }}>
                Choose how we display monetary values across the shipper portal. Amounts are converted from USD using the latest published exchange rates.
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <FormControl fullWidth>
                  <InputLabel id="currency-preference-label">Preferred currency</InputLabel>
                  <Select
                    labelId="currency-preference-label"
                    value={preferredCurrency}
                    label="Preferred currency"
                    onChange={handleCurrencyChange}
                    disabled={saving}
                    sx={{ borderRadius: '12px' }}
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <MenuItem key={currency} value={currency} sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            backgroundColor: 'rgba(0, 170, 171, 0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            color: '#00AAAB'
                          }}
                        >
                          {CURRENCY_SYMBOLS[currency]}
                        </Box>
                        <Typography sx={{ fontSize: 15 }}>{CURRENCY_LABELS[currency]}</Typography>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    onClick={handleRefreshRates}
                    disabled={currencyRatesLoading}
                    sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
                  >
                    {currencyRatesLoading ? 'Refreshing…' : 'Refresh exchange rates'}
                  </Button>
                  <Chip
                    label={lastUpdated ? `Last updated ${lastUpdated}` : 'Rates not loaded yet'}
                    sx={{ backgroundColor: 'rgba(0, 170, 171, 0.08)', color: '#00AAAB', fontWeight: 600 }}
                  />
                </Box>

                {feedback && (
                  <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ borderRadius: '12px' }}>
                    {feedback.message}
                  </Alert>
                )}

                {currencyRatesError && (
                  <Alert severity="warning" sx={{ borderRadius: '12px' }}>
                    {currencyRatesError}
                  </Alert>
                )}

                <Typography variant="caption" sx={{ color: '#606472' }}>
                  Current conversion: 1 USD → {CURRENCY_SYMBOLS[preferredCurrency]}{currencyRates.rates[preferredCurrency].toFixed(4)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
