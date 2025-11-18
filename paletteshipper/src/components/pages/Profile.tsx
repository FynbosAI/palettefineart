import React, { useState, useEffect, type ChangeEvent, type DragEvent } from 'react';
import { Box, Card, CardContent, Typography, FormControl, InputLabel, Select, MenuItem, Button, Alert, Chip, Divider, Switch, FormControlLabel, Slider, Avatar, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import useCurrency from '../../hooks/useCurrency';
import useShipperStore from '../../store/useShipperStore';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  CURRENCY_LABELS,
  type SupportedCurrency
} from '../../lib/currency';
import { PhotoCameraOutlined } from '@mui/icons-material';
import {
  PROFILE_IMAGE_ACCEPT,
  PROFILE_IMAGE_MAX_BYTES,
  validateProfileImageFile
} from '../../../../shared/profile/profileImage';

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
  const profileImageUrl = useShipperStore((state) => state.profileImageUrl);
  const profileImageRefreshing = useShipperStore((state) => state.profileImageRefreshing);
  const profileImageUploading = useShipperStore((state) => state.profileImageUploading);
  const refreshProfileImageUrl = useShipperStore((state) => state.refreshProfileImageUrl);
  const uploadProfileImage = useShipperStore((state) => state.uploadProfileImage);
  const organization = useShipperStore((state) => state.organization);
  const logisticsPartner = useShipperStore((state) => state.logisticsPartner);
  const memberships = useShipperStore((state) => state.memberships);
  const updateCurrencyPreference = useShipperStore((state) => state.updateCurrencyPreference);
  const paperTextureEnabled = useShipperStore((state) => state.uiPreferences.paperTextureEnabled);
  const paperTextureOpacity = useShipperStore((state) => state.uiPreferences.paperTextureOpacity);
  const setPaperTextureEnabled = useShipperStore((state) => state.setPaperTextureEnabled);
  const setPaperTextureOpacity = useShipperStore((state) => state.setPaperTextureOpacity);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarSizeLimitMb = Math.round(PROFILE_IMAGE_MAX_BYTES / (1024 * 1024));
  const avatarInputId = 'shipper-profile-image-input';

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
  const handlePaperTextureToggle = (event: ChangeEvent<HTMLInputElement>) => {
    setPaperTextureEnabled(event.target.checked);
  };

  const handlePaperTextureOpacity = (_: Event, value: number | number[]) => {
    if (Array.isArray(value)) {
      return;
    }
    setPaperTextureOpacity(value);
  };

  useEffect(() => {
    let cancelled = false;
    if (profile?.profile_image_path) {
      refreshProfileImageUrl().catch((err) => {
        if (!cancelled) {
          console.warn('[ShipperProfile] Failed to refresh profile image', err);
        }
      });
    } else if (!avatarDialogOpen) {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarPreviewUrl(null);
      setAvatarFile(null);
    }
    return () => {
      cancelled = true;
    };
  }, [profile?.profile_image_path, refreshProfileImageUrl, avatarDialogOpen]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const resetAvatarSelection = () => {
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl(null);
    setAvatarFile(null);
  };

  const assignAvatarFile = (file: File) => {
    try {
      validateProfileImageFile(file);
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarFile(file);
      setAvatarPreviewUrl(URL.createObjectURL(file));
      setAvatarError(null);
    } catch (error) {
      resetAvatarSelection();
      setAvatarError((error as Error).message || 'Please choose a supported image file.');
    }
  };

  const handleAvatarInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      assignAvatarFile(file);
    }
    event.target.value = '';
  };

  const handleAvatarDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (profileImageUploading) {
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) {
      assignAvatarFile(file);
    }
  };

  const handleAvatarDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleAvatarDialogClose = () => {
    if (profileImageUploading) {
      return;
    }
    setAvatarDialogOpen(false);
    setAvatarError(null);
    resetAvatarSelection();
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) {
      setAvatarError('Select an image to upload.');
      return;
    }

    setAvatarError(null);
    try {
      await uploadProfileImage(avatarFile);
      setAvatarDialogOpen(false);
      resetAvatarSelection();
    } catch (error) {
      setAvatarError((error as Error).message || 'Unable to upload profile photo.');
    }
  };

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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Box sx={{ position: 'relative' }}>
                    <Avatar
                      src={profileImageUrl || undefined}
                      alt={profile?.full_name || user?.email || 'Profile photo'}
                      sx={{
                        width: 76,
                        height: 76,
                        borderRadius: '18px',
                        backgroundColor: profileImageUrl ? '#FFFFFF' : 'rgba(0, 170, 171, 0.08)',
                        color: '#00AAAB',
                        fontWeight: 700,
                        fontSize: '24px',
                        border: profileImageUrl ? '1px solid rgba(0, 170, 171, 0.18)' : '1px solid rgba(0, 170, 171, 0.2)',
                        boxShadow: profileImageUrl ? '0 14px 24px rgba(0, 170, 171, 0.18)' : 'none',
                        '& img': {
                          objectFit: 'cover'
                        }
                      }}
                    >
                      {!profileImageUrl ? (profile?.full_name?.charAt(0).toUpperCase() || 'U') : null}
                    </Avatar>
                    {(profileImageRefreshing || profileImageUploading) && (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(255,255,255,0.7)',
                          borderRadius: '18px'
                        }}
                      >
                        <CircularProgress size={26} sx={{ color: '#00AAAB' }} />
                      </Box>
                    )}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 600, color: '#0e122b', fontSize: '18px' }}>
                      {profile?.full_name || user?.email || 'No name set'}
                    </Typography>
                    <Typography sx={{ color: '#5b6070', fontSize: '14px', marginTop: '4px' }}>
                      {user?.email || '—'}
                    </Typography>
                    <Typography sx={{ color: 'rgba(0, 170, 171, 0.9)', fontSize: '12px', marginTop: '8px' }}>
                      Accepted: JPG, PNG, WebP up to {avatarSizeLimitMb} MB
                    </Typography>
                  </Box>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<PhotoCameraOutlined />}
                  onClick={() => {
                    setAvatarDialogOpen(true);
                    setAvatarError(null);
                  }}
                  sx={{
                    borderColor: 'rgba(0, 170, 171, 0.4)',
                    color: '#00AAAB',
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '999px',
                    paddingX: '18px',
                    height: 42,
                    '&:hover': {
                      borderColor: '#00AAAB',
                      backgroundColor: 'rgba(0, 170, 171, 0.08)'
                    }
                  }}
                >
                  Update photo
                </Button>
              </Box>
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

          <Card sx={{ borderRadius: '16px', border: '1px solid rgba(0, 170, 171, 0.18)', backgroundColor: '#FFFFFF' }}>
            <CardContent sx={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0e122b' }}>
                Interface
              </Typography>
              <Typography variant="body2" sx={{ color: '#5b6070' }}>
                Blend Palette&apos;s paper texture into primary panels and cards for a tactile feel while keeping the existing color palette.
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(0, 170, 171, 0.06)'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0e122b' }}>
                      Paper texture overlay
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#5b6070' }}>
                      Applies a subtle grain across white surfaces in the shipper portal.
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={<Switch checked={paperTextureEnabled} onChange={handlePaperTextureToggle} color="primary" />}
                    label={paperTextureEnabled ? 'Enabled' : 'Disabled'}
                    labelPlacement="start"
                    sx={{
                      margin: 0,
                      '.MuiFormControlLabel-label': { fontWeight: 600, color: '#0e122b' }
                    }}
                  />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: paperTextureEnabled ? 1 : 0.4 }}>
                  <Typography variant="caption" sx={{ color: '#5b6070', fontWeight: 600 }}>
                    Texture intensity ({Math.round(paperTextureOpacity * 100)}%)
                  </Typography>
                  <Slider
                    min={0.1}
                    max={1}
                    step={0.01}
                    value={paperTextureOpacity}
                    onChange={handlePaperTextureOpacity}
                    disabled={!paperTextureEnabled}
                    sx={{ maxWidth: 300 }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>

          <input
            id={avatarInputId}
            type="file"
            accept={PROFILE_IMAGE_ACCEPT}
            onChange={handleAvatarInputChange}
            hidden
          />

          <Dialog
            open={avatarDialogOpen}
            onClose={profileImageUploading ? undefined : handleAvatarDialogClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
              sx: {
                borderRadius: '18px',
                border: '1px solid rgba(0, 170, 171, 0.18)',
                boxShadow: '0 24px 48px rgba(0, 29, 45, 0.22)'
              }
            }}
          >
            <DialogTitle sx={{ fontWeight: 600, color: '#0e122b', padding: '24px 24px 8px' }}>
              Update profile photo
            </DialogTitle>
            <DialogContent sx={{ padding: '0 24px 24px' }}>
              <Box
                component="label"
                htmlFor={avatarInputId}
                onDragOver={handleAvatarDragOver}
                onDrop={handleAvatarDrop}
                sx={{
                  border: '1px dashed rgba(0, 170, 171, 0.45)',
                  borderRadius: '16px',
                  backgroundColor: 'rgba(0, 170, 171, 0.05)',
                  padding: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '12px',
                  cursor: profileImageUploading ? 'not-allowed' : 'pointer',
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                  '&:hover': {
                    borderColor: '#00AAAB',
                    backgroundColor: 'rgba(0, 170, 171, 0.08)'
                  }
                }}
              >
                {avatarPreviewUrl ? (
                  <Box
                    component="img"
                    src={avatarPreviewUrl}
                    alt="Profile preview"
                    sx={{
                      width: 132,
                      height: 132,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      boxShadow: '0 16px 32px rgba(0, 29, 45, 0.25)'
                    }}
                  />
                ) : (
                  <>
                    <Box
                      sx={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 10px 20px rgba(0, 170, 171, 0.18)'
                      }}
                    >
                      <PhotoCameraOutlined sx={{ color: '#00AAAB', fontSize: '30px' }} />
                    </Box>
                    <Typography sx={{ fontWeight: 600, color: '#0e122b' }}>
                      Drag & drop a profile photo
                    </Typography>
                    <Typography sx={{ color: '#5b6070', fontSize: '14px' }}>
                      or click below to browse
                    </Typography>
                  </>
                )}
                <Button
                  component="span"
                  variant="contained"
                  disabled={profileImageUploading}
                  sx={{
                    backgroundColor: '#00AAAB',
                    '&:hover': { backgroundColor: '#008A8B' },
                    textTransform: 'none',
                    borderRadius: '999px',
                    paddingX: '24px',
                    fontWeight: 600
                  }}
                >
                  Choose file
                </Button>
                <Typography sx={{ color: '#5b6070', fontSize: '12px' }}>
                  JPG, PNG, WebP up to {avatarSizeLimitMb} MB
                </Typography>
              </Box>

              {avatarFile && (
                <Box
                  sx={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(0, 170, 171, 0.07)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <Typography sx={{ fontWeight: 600, color: '#0e122b', fontSize: '14px' }}>
                    {avatarFile.name}
                  </Typography>
                  <Typography sx={{ color: '#5b6070', fontSize: '13px' }}>
                    {(avatarFile.size / (1024 * 1024)).toFixed(2)} MB
                  </Typography>
                </Box>
              )}

              {avatarError && (
                <Alert severity="error" sx={{ marginTop: '16px', borderRadius: '12px' }}>
                  {avatarError}
                </Alert>
              )}
            </DialogContent>
            <DialogActions sx={{ padding: '0 24px 24px', gap: '10px' }}>
              <Button
                onClick={handleAvatarDialogClose}
                disabled={profileImageUploading}
                sx={{ textTransform: 'none', color: '#5b6070', borderRadius: '10px' }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleAvatarUpload}
                disabled={!avatarFile || profileImageUploading}
                sx={{
                  backgroundColor: '#00AAAB',
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: '10px',
                  paddingX: '28px',
                  '&:hover': { backgroundColor: '#008A8B' }
                }}
              >
                {profileImageUploading ? 'Uploading…' : 'Save photo'}
              </Button>
            </DialogActions>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default Profile;
