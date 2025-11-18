import React, { useState, useEffect, type ChangeEvent, type DragEvent } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  IconButton,
  Stack,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  Slider
} from '@mui/material';
import {
  EditOutlined,
  SaveOutlined,
  CancelOutlined,
  BusinessOutlined,
  PersonOutlined,
  SettingsOutlined,
  CheckCircleOutlined,
  PhotoCameraOutlined
} from '@mui/icons-material';
import useSupabaseStore from '../../store/useSupabaseStore';
import { AuthService } from '../../lib/supabase';
import logger from '../../lib/utils/logger';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  CURRENCY_LABELS,
  type SupportedCurrency
} from '../../lib/currency';
import {
  PROFILE_IMAGE_ACCEPT,
  PROFILE_IMAGE_MAX_BYTES,
  validateProfileImageFile
} from '../../../../shared/profile/profileImage';

interface AccountPageProps {}

const AccountPage: React.FC<AccountPageProps> = () => {
  const {
    user,
    profile,
    profileImageUrl,
    profileImageRefreshing,
    profileImageUploading,
    currentOrg,
    memberships,
    loading,
    error,
    setProfile,
    switchOrganization,
    setError,
    currencyPreference,
    currencyRates,
    currencyRatesLoading,
    currencyRatesError,
    updateCurrencyPreference,
    fetchCurrencyRates,
    uiPreferences,
    setPaperTextureEnabled,
    setPaperTextureOpacity,
    refreshProfileImageUrl,
    uploadProfileImage
  } = useSupabaseStore();

  // Edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedFullName, setEditedFullName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [orgSwitchLoading, setOrgSwitchLoading] = useState(false);
  const [showOrgSwitchDialog, setShowOrgSwitchDialog] = useState(false);
  const [selectedOrgForSwitch, setSelectedOrgForSwitch] = useState('');
  const [currencyUpdating, setCurrencyUpdating] = useState(false);
  const [currencyFeedback, setCurrencyFeedback] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const companyName = currentOrg?.company?.name || currentOrg?.name || null;
  const branchName = currentOrg?.branch_name || null;
  const selectedRate = currencyRates?.rates?.[currencyPreference] ?? 1;
  const lastFetchedAt = currencyRates?.fetchedAt ? new Date(currencyRates.fetchedAt).toLocaleString() : null;
  const paperTextureEnabled = uiPreferences?.paperTextureEnabled ?? false;
  const paperTextureOpacity = uiPreferences?.paperTextureOpacity ?? 0.24;
  const avatarSizeLimitMb = Math.round(PROFILE_IMAGE_MAX_BYTES / (1024 * 1024));
  const avatarInputId = 'gallery-account-profile-image-input';

  const handlePaperTextureToggle = (event: ChangeEvent<HTMLInputElement>) => {
    setPaperTextureEnabled(event.target.checked);
  };

  const handlePaperTextureOpacity = (_: Event, value: number | number[]) => {
    if (Array.isArray(value)) {
      return;
    }
    setPaperTextureOpacity(value);
  };

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
      setAvatarError((error as Error).message || 'Select a supported image format.');
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
      setAvatarError((error as Error).message || 'Failed to upload profile photo.');
    }
  };

  // Initialize edit form when profile loads
  useEffect(() => {
    if (profile?.full_name) {
      setEditedFullName(profile.full_name);
    }
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    if (profile?.profile_image_path) {
      refreshProfileImageUrl().catch((err) => {
        if (!cancelled) {
          console.warn('[AccountPage] Failed to load profile image', err);
        }
      });
    }
    if (!profile?.profile_image_path && !avatarDialogOpen) {
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

  // Handle profile edit
  const handleSaveProfile = async () => {
    if (!user || !editedFullName.trim()) return;

    setProfileLoading(true);
    setError(null);

    try {
      const { data: updatedProfile, error: updateError } = await AuthService.updateProfile(user.id, {
        full_name: editedFullName.trim()
      });

      if (updateError) {
        throw updateError;
      }

      setProfile(updatedProfile);
      setIsEditingProfile(false);
      logger.success('Account', 'Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      setError((error as Error).message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedFullName(profile?.full_name || '');
    setIsEditingProfile(false);
  };

  // Handle organization switch
  const handleSwitchOrganization = async () => {
    if (!selectedOrgForSwitch) return;

    setOrgSwitchLoading(true);
    try {
      await switchOrganization(selectedOrgForSwitch);
      setShowOrgSwitchDialog(false);
      setSelectedOrgForSwitch('');
      logger.success('Account', 'Organization switched successfully');
    } catch (error) {
      console.error('Error switching organization:', error);
      setError((error as Error).message);
    } finally {
      setOrgSwitchLoading(false);
    }
  };

  const handleCurrencyChange = async (event: SelectChangeEvent<SupportedCurrency>) => {
    const nextCurrency = event.target.value as SupportedCurrency;
    if (nextCurrency === currencyPreference) {
      return;
    }

    setCurrencyFeedback(null);
    setCurrencyUpdating(true);

    try {
      await updateCurrencyPreference(nextCurrency);
      logger.success('Account', `Currency preference updated to ${nextCurrency}`);
      setCurrencyFeedback({
        message: `Display currency set to ${CURRENCY_LABELS[nextCurrency]}.`,
        severity: 'success'
      });
    } catch (err) {
      const message = (err as Error).message || 'Failed to update currency preference.';
      logger.error('Account', 'Failed to update currency preference', err);
      setCurrencyFeedback({
        message,
        severity: 'error'
      });
    } finally {
      setCurrencyUpdating(false);
    }
  };

  const handleRefreshRates = async () => {
    setCurrencyFeedback(null);
    try {
      await fetchCurrencyRates(true);
      setCurrencyFeedback({
        message: 'Exchange rates refreshed successfully.',
        severity: 'success'
      });
    } catch (err) {
      const message = (err as Error).message || 'Unable to refresh exchange rates.';
      setCurrencyFeedback({
        message,
        severity: 'error'
      });
    }
  };

  // Get role display name
  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrator';
      case 'editor': return 'Editor';
      case 'viewer': return 'Viewer';
      default: return role;
    }
  };

  // Get role color based on role
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return '#8412FF'; // Primary purple
      case 'editor': return '#00AAAB'; // Secondary teal
      case 'viewer': return '#E9932D'; // Warning orange
      default: return '#666666';
    }
  };

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <div className="header-row">
            <h1 className="header-title">Account</h1>
          </div>
        </header>

        <div className="main-content" style={{ flexDirection: 'column', gap: '32px', maxWidth: '800px' }}>
          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                borderRadius: '10px',
                border: 'none',
                backgroundColor: 'rgba(217, 78, 69, 0.1)',
                color: '#D94E45',
                '& .MuiAlert-icon': { color: '#D94E45' }
              }}
            >
              {error}
            </Alert>
          )}

          {/* Profile Section */}
          <Card 
            elevation={0}
            sx={{
              border: '1px solid rgba(233, 234, 235, 0.6)',
              borderRadius: '16px',
              backgroundColor: '#FFFFFF',
              overflow: 'visible'
            }}
          >
            <CardContent sx={{ padding: '32px' }}>
              <Typography 
                variant="h5" 
                sx={{
                  fontFamily: 'Fractul',
                  fontWeight: 500,
                  fontSize: '24px',
                  color: '#170849',
                  marginBottom: '32px',
                  letterSpacing: '-0.02em'
                }}
              >
                Profile
              </Typography>

              <Stack spacing={4}>
                {/* Avatar and basic info */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <Box sx={{ position: 'relative' }}>
                      <Avatar 
                        src={profileImageUrl || undefined}
                        alt={profile?.full_name || user?.email || 'Account avatar'}
                        sx={{ 
                          width: 88, 
                          height: 88, 
                          backgroundColor: profileImageUrl ? '#FFFFFF' : 'rgba(132, 18, 255, 0.08)',
                          color: '#8412FF',
                          fontSize: '28px',
                          fontWeight: 600,
                          border: profileImageUrl ? '2px solid rgba(0, 0, 0, 0.04)' : '2px solid rgba(132, 18, 255, 0.1)',
                          boxShadow: profileImageUrl ? '0 12px 24px rgba(23, 8, 73, 0.12)' : 'none',
                          '& img': {
                            objectFit: 'cover'
                          }
                        }}
                      >
                        {!profileImageUrl ? profile?.full_name?.charAt(0).toUpperCase() || 'U' : null}
                      </Avatar>
                      {(profileImageRefreshing || profileImageUploading) && (
                        <Box
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(255,255,255,0.68)',
                            borderRadius: '50%'
                          }}
                        >
                          <CircularProgress size={28} sx={{ color: '#8412FF' }} />
                        </Box>
                      )}
                    </Box>
                    <Box>
                      <Typography 
                        sx={{
                          fontFamily: 'Fractul',
                          fontWeight: 500,
                          fontSize: '20px',
                          color: '#170849',
                          marginBottom: '4px'
                        }}
                      >
                        {profile?.full_name || 'No name set'}
                      </Typography>
                      <Typography 
                        sx={{
                          fontFamily: 'Fractul',
                          fontSize: '14px',
                          color: 'rgba(24, 29, 39, 0.6)',
                          letterSpacing: '0.01em'
                        }}
                      >
                        {user?.email}
                      </Typography>
                      <Typography 
                        sx={{
                          fontFamily: 'Fractul',
                          fontSize: '12px',
                          color: 'rgba(23, 8, 73, 0.5)',
                          marginTop: '6px'
                        }}
                      >
                        PNG, JPG, WebP up to {avatarSizeLimitMb} MB
                      </Typography>
                    </Box>
                  </Box>
                  <Button
                    variant="outlined"
                    size="medium"
                    startIcon={<PhotoCameraOutlined />}
                    onClick={() => {
                      setAvatarDialogOpen(true);
                      setAvatarError(null);
                    }}
                    sx={{
                      borderRadius: '999px',
                      borderColor: 'rgba(132, 18, 255, 0.4)',
                      color: '#8412FF',
                      fontWeight: 600,
                      textTransform: 'none',
                      paddingX: '18px',
                      height: 44,
                      '&:hover': {
                        borderColor: '#8412FF',
                        backgroundColor: 'rgba(132, 18, 255, 0.08)'
                      }
                    }}
                  >
                    Update photo
                  </Button>
                </Box>
                <Divider sx={{ borderColor: 'rgba(233, 234, 235, 0.8)', marginY: '28px' }} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '13px',
                      color: 'rgba(23, 8, 73, 0.7)',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Display Currency
                  </Typography>
                  <FormControl fullWidth>
                    <InputLabel id="preferred-currency-label">Preferred currency</InputLabel>
                    <Select
                      labelId="preferred-currency-label"
                      value={currencyPreference}
                      onChange={handleCurrencyChange}
                      label="Preferred currency"
                      disabled={currencyUpdating}
                      sx={{
                        borderRadius: '12px',
                        fontFamily: 'Fractul',
                        '& .MuiSelect-select': {
                          paddingY: '12px'
                        }
                      }}
                    >
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <MenuItem key={currency} value={currency} sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Box
                            sx={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '10px',
                              backgroundColor: 'rgba(132, 18, 255, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600,
                              color: '#8412FF'
                            }}
                          >
                            {CURRENCY_SYMBOLS[currency]}
                          </Box>
                          <Typography
                            sx={{
                              fontFamily: 'Fractul',
                              fontSize: '15px',
                              color: '#181D27'
                            }}
                          >
                            {CURRENCY_LABELS[currency]}
                          </Typography>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Typography
                      sx={{
                        fontFamily: 'Fractul',
                        fontSize: '13px',
                        color: 'rgba(24, 29, 39, 0.6)'
                      }}
                    >
                      All monetary values across Palette will convert from USD and display as {CURRENCY_SYMBOLS[currencyPreference]} based on the latest rate. Current conversion: 1 USD → {CURRENCY_SYMBOLS[currencyPreference]}{selectedRate.toFixed(4)}.
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleRefreshRates}
                        disabled={currencyRatesLoading}
                        sx={{
                          textTransform: 'none',
                          borderRadius: '999px',
                          fontSize: '13px',
                          paddingX: '16px'
                        }}
                      >
                        {currencyRatesLoading ? 'Refreshing…' : 'Refresh exchange rates'}
                      </Button>
                      <Chip
                        label={lastFetchedAt ? `Last updated ${lastFetchedAt}` : 'Rates not loaded yet'}
                        sx={{
                          backgroundColor: 'rgba(132, 18, 255, 0.08)',
                          color: '#8412FF',
                          fontWeight: 500
                        }}
                      />
                    </Box>
                    {currencyFeedback && (
                      <Alert severity={currencyFeedback.severity} sx={{ borderRadius: '12px' }}>
                        {currencyFeedback.message}
                      </Alert>
                    )}
                    {currencyRatesError && (
                      <Alert severity="warning" sx={{ borderRadius: '12px' }}>
                        {currencyRatesError}
                      </Alert>
                    )}
                  </Box>
                </Box>

                {/* Editable full name */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography 
                      sx={{
                        fontFamily: 'Fractul',
                        fontSize: '13px',
                        color: 'rgba(23, 8, 73, 0.7)',
                        marginBottom: '12px',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}
                    >
                      Full Name
                    </Typography>
                    {isEditingProfile ? (
                      <TextField
                        fullWidth
                        value={editedFullName}
                        onChange={(e) => setEditedFullName(e.target.value)}
                        placeholder="Enter your full name"
                        variant="outlined"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                            fontFamily: 'Fractul',
                            fontSize: '16px',
                            backgroundColor: 'rgba(234, 217, 249, 0.3)',
                            border: '1px solid rgba(132, 18, 255, 0.2)',
                            '&:hover': {
                              border: '1px solid rgba(132, 18, 255, 0.3)',
                            },
                            '&.Mui-focused': {
                              border: '2px solid #8412FF',
                              backgroundColor: '#FFFFFF'
                            }
                          },
                          '& .MuiOutlinedInput-notchedOutline': {
                            border: 'none'
                          }
                        }}
                      />
                    ) : (
                      <Typography 
                        sx={{
                          fontFamily: 'Fractul',
                          fontSize: '16px',
                          color: '#181D27',
                          padding: '16px 0',
                          minHeight: '24px'
                        }}
                      >
                        {profile?.full_name || 'No name set'}
                      </Typography>
                    )}
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: '8px' }}>
                    {isEditingProfile ? (
                      <>
                        <IconButton
                          onClick={handleSaveProfile}
                          disabled={profileLoading || !editedFullName.trim()}
                          sx={{
                            backgroundColor: '#8412FF',
                            color: '#FFFFFF',
                            width: '40px',
                            height: '40px',
                            '&:hover': { backgroundColor: '#730ADD', transform: 'translateY(-1px)' },
                            '&:disabled': { backgroundColor: 'rgba(233, 234, 235, 0.5)' },
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {profileLoading ? <CircularProgress size={16} color="inherit" /> : <SaveOutlined sx={{ fontSize: '18px' }} />}
                        </IconButton>
                        <IconButton
                          onClick={handleCancelEdit}
                          disabled={profileLoading}
                          sx={{
                            backgroundColor: 'rgba(233, 234, 235, 0.5)',
                            color: 'rgba(24, 29, 39, 0.6)',
                            width: '40px',
                            height: '40px',
                            '&:hover': { backgroundColor: 'rgba(213, 214, 215, 0.7)' },
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <CancelOutlined sx={{ fontSize: '18px' }} />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton
                        onClick={() => setIsEditingProfile(true)}
                        sx={{
                          backgroundColor: 'rgba(132, 18, 255, 0.1)',
                          color: '#8412FF',
                          width: '40px',
                          height: '40px',
                          '&:hover': { 
                            backgroundColor: 'rgba(132, 18, 255, 0.15)',
                            transform: 'translateY(-1px)'
                          },
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <EditOutlined sx={{ fontSize: '18px' }} />
                      </IconButton>
                    )}
                  </Box>
                </Box>

                {/* Email (read-only) */}
                <Box>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '13px',
                      color: 'rgba(23, 8, 73, 0.7)',
                      marginBottom: '12px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Email Address
                  </Typography>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '16px',
                      color: 'rgba(24, 29, 39, 0.8)',
                      padding: '16px 0',
                      marginBottom: '8px'
                    }}
                  >
                    {user?.email}
                  </Typography>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '12px',
                      color: 'rgba(24, 29, 39, 0.4)',
                      lineHeight: 1.4
                    }}
                  >
                    Email cannot be changed. Contact support if you need to update this.
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Organization Memberships Section */}
          <Card 
            elevation={0}
            sx={{
              border: '1px solid rgba(233, 234, 235, 0.6)',
              borderRadius: '16px',
              backgroundColor: '#FFFFFF',
              overflow: 'visible'
            }}
          >
            <CardContent sx={{ padding: '32px' }}>
              <Typography 
                variant="h5" 
                sx={{
                  fontFamily: 'Fractul',
                  fontWeight: 500,
                  fontSize: '24px',
                  color: '#170849',
                  marginBottom: '32px',
                  letterSpacing: '-0.02em'
                }}
              >
                Organizations
              </Typography>

              <Stack spacing={3}>
                <Box>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '13px',
                      color: 'rgba(23, 8, 73, 0.7)',
                      marginBottom: '16px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Current Organization
                  </Typography>
                  {currentOrg ? (
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '20px',
                      backgroundColor: 'rgba(132, 18, 255, 0.04)',
                      borderRadius: '12px',
                      border: '1px solid rgba(132, 18, 255, 0.15)'
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Box
                          sx={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#0DAB71'
                          }}
                        />
                        <Box>
                          <Typography 
                            sx={{
                              fontFamily: 'Fractul',
                              fontSize: '16px',
                              color: '#170849',
                              fontWeight: 500,
                              marginBottom: '2px'
                            }}
                          >
                            {companyName}
                          </Typography>
                          {branchName ? (
                            <Typography 
                              sx={{
                                fontFamily: 'Fractul',
                                fontSize: '13px',
                                color: 'rgba(24, 29, 39, 0.6)'
                              }}
                            >
                              {branchName}
                            </Typography>
                          ) : null}
                          <Typography 
                            sx={{
                              fontFamily: 'Fractul',
                              fontSize: '12px',
                              color: 'rgba(24, 29, 39, 0.5)'
                            }}
                          >
                            Active organization
                          </Typography>
                        </Box>
                      </Box>
                      {memberships.length > 1 && (
                        <Button
                          variant="outlined"
                          onClick={() => setShowOrgSwitchDialog(true)}
                          sx={{
                            borderColor: 'rgba(132, 18, 255, 0.3)',
                            color: '#8412FF',
                            backgroundColor: 'transparent',
                            '&:hover': {
                              borderColor: '#8412FF',
                              backgroundColor: 'rgba(132, 18, 255, 0.08)'
                            },
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontFamily: 'Fractul',
                            fontWeight: 500,
                            fontSize: '14px',
                            padding: '8px 16px'
                          }}
                        >
                          Switch
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <Typography sx={{ color: 'rgba(24, 29, 39, 0.6)', fontStyle: 'italic', padding: '20px 0' }}>
                      No current organization set
                    </Typography>
                  )}
                </Box>

                <Box>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '13px',
                      color: 'rgba(23, 8, 73, 0.7)',
                      marginBottom: '16px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    All Memberships ({memberships.length})
                  </Typography>

                  <Stack spacing={2}>
                    {memberships.length > 0 ? (
                      memberships.map((membership: any) => (
                        <Box
                          key={membership.org_id}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '18px',
                            backgroundColor: membership.org_id === currentOrg?.id ? 'rgba(132, 18, 255, 0.04)' : 'rgba(248, 249, 250, 0.8)',
                            borderRadius: '12px',
                            border: membership.org_id === currentOrg?.id ? '1px solid rgba(132, 18, 255, 0.15)' : '1px solid rgba(233, 234, 235, 0.6)',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              backgroundColor: membership.org_id === currentOrg?.id ? 'rgba(132, 18, 255, 0.06)' : 'rgba(248, 249, 250, 1)',
                              transform: 'translateY(-1px)'
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {membership.org_id === currentOrg?.id && (
                              <Box
                                sx={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  backgroundColor: '#8412FF'
                                }}
                              />
                            )}
                            <Box>
                              <Typography 
                                sx={{
                                  fontFamily: 'Fractul',
                                  fontSize: '16px',
                                  color: '#170849',
                                  fontWeight: membership.org_id === currentOrg?.id ? 500 : 400,
                                  marginBottom: '2px'
                                }}
                              >
                                {membership.organization?.company?.name || membership.organization?.name || 'Unknown Organization'}
                              </Typography>
                              {membership.organization?.branch_name ? (
                                <Typography 
                                  sx={{
                                    fontFamily: 'Fractul',
                                    fontSize: '12px',
                                    color: 'rgba(24, 29, 39, 0.5)'
                                  }}
                                >
                                  {membership.organization.branch_name}
                                </Typography>
                              ) : null}
                              <Typography 
                                sx={{
                                  fontFamily: 'Fractul',
                                  fontSize: '12px',
                                  color: 'rgba(24, 29, 39, 0.5)'
                                }}
                              >
                                Joined {new Date(membership.organization?.created_at || '').toLocaleDateString()}
                              </Typography>
                            </Box>
                          </Box>
                          <Chip
                            label={getRoleDisplayName(membership.role)}
                            sx={{
                              backgroundColor: 'rgba(255, 255, 255, 0.9)',
                              color: getRoleColor(membership.role),
                              border: `1px solid ${getRoleColor(membership.role)}30`,
                              fontFamily: 'Fractul',
                              fontWeight: 500,
                              fontSize: '12px',
                              height: '28px'
                            }}
                          />
                        </Box>
                      ))
                    ) : (
                      <Typography sx={{ color: 'rgba(24, 29, 39, 0.6)', fontStyle: 'italic', textAlign: 'center', padding: '40px 20px' }}>
                        No organization memberships found
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Account Settings Section */}
          <Card 
            elevation={0}
            sx={{
              border: '1px solid rgba(233, 234, 235, 0.6)',
              borderRadius: '16px',
              backgroundColor: '#FFFFFF',
              overflow: 'visible'
            }}
          >
            <CardContent sx={{ padding: '32px' }}>
              <Typography 
                variant="h5" 
                sx={{
                  fontFamily: 'Fractul',
                  fontWeight: 500,
                  fontSize: '24px',
                  color: '#170849',
                  marginBottom: '32px',
                  letterSpacing: '-0.02em'
                }}
              >
                Settings
              </Typography>

              <Stack spacing={4}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography 
                      sx={{
                        fontFamily: 'Fractul',
                        fontSize: '13px',
                        color: 'rgba(23, 8, 73, 0.7)',
                        marginBottom: '8px',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}
                    >
                      Account Status
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircleOutlined sx={{ color: '#0DAB71', fontSize: '20px' }} />
                      <Typography 
                        sx={{
                          fontFamily: 'Fractul',
                          fontSize: '16px',
                          color: '#0DAB71',
                          fontWeight: 500
                        }}
                      >
                        Active
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '13px',
                      color: 'rgba(23, 8, 73, 0.7)',
                      marginBottom: '12px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Member Since
                  </Typography>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '16px',
                      color: '#181D27',
                      padding: '8px 0'
                    }}
                  >
                    {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'Unknown'}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    padding: '24px',
                    backgroundColor: 'rgba(132, 18, 255, 0.04)',
                    borderRadius: '12px',
                    border: '1px solid rgba(132, 18, 255, 0.16)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <Box sx={{ flex: '1 1 260px' }}>
                      <Typography
                        sx={{
                          fontFamily: 'Fractul',
                          fontSize: '13px',
                          color: 'rgba(23, 8, 73, 0.7)',
                          marginBottom: '8px',
                          fontWeight: 500,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}
                      >
                        Interface Texture
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: 'Fractul',
                          fontSize: '14px',
                          color: 'rgba(24, 29, 39, 0.7)',
                          lineHeight: 1.5
                        }}
                      >
                        Blend Palette&apos;s paper texture across dashboard surfaces for a tactile feel while keeping colors intact.
                      </Typography>
                    </Box>
                    <FormControlLabel
                      control={<Switch checked={paperTextureEnabled} onChange={handlePaperTextureToggle} color="primary" />}
                      label={paperTextureEnabled ? 'Enabled' : 'Disabled'}
                      labelPlacement="start"
                      sx={{
                        margin: 0,
                        '.MuiFormControlLabel-label': {
                          fontFamily: 'Fractul',
                          fontWeight: 600,
                          color: '#170849'
                        }
                      }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: paperTextureEnabled ? 1 : 0.4 }}>
                    <Typography
                      sx={{
                        fontFamily: 'Fractul',
                        fontSize: '13px',
                        color: 'rgba(23, 8, 73, 0.7)',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}
                    >
                      Texture intensity ({Math.round(paperTextureOpacity * 100)}%)
                    </Typography>
                    <Slider
                      min={0.1}
                      max={1}
                      step={0.01}
                      value={paperTextureOpacity}
                      onChange={handlePaperTextureOpacity}
                      disabled={!paperTextureEnabled}
                      sx={{ maxWidth: 320 }}
                    />
                  </Box>
                </Box>

                <Box sx={{ 
                  padding: '24px', 
                  backgroundColor: 'rgba(0, 170, 171, 0.04)', 
                  borderRadius: '12px',
                  border: '1px solid rgba(0, 170, 171, 0.15)'
                }}>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '16px',
                      color: '#170849',
                      marginBottom: '8px',
                      fontWeight: 500
                    }}
                  >
                    Need Help?
                  </Typography>
                  <Typography 
                    sx={{
                      fontFamily: 'Fractul',
                      fontSize: '14px',
                      color: 'rgba(24, 29, 39, 0.7)',
                      marginBottom: '16px',
                      lineHeight: 1.5
                    }}
                  >
                    Our support team is here to help with any questions about your account.
                  </Typography>
                  <Button
                    variant="outlined"
                    sx={{
                      borderColor: 'rgba(0, 170, 171, 0.3)',
                      color: '#00AAAB',
                      backgroundColor: 'transparent',
                      '&:hover': {
                        borderColor: '#00AAAB',
                        backgroundColor: 'rgba(0, 170, 171, 0.08)'
                      },
                      borderRadius: '8px',
                      textTransform: 'none',
                      fontFamily: 'Fractul',
                      fontWeight: 500,
                      fontSize: '14px',
                      padding: '10px 20px'
                    }}
                  >
                    Contact Support
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Organization Switch Dialog */}
          <Dialog
            open={showOrgSwitchDialog}
            onClose={() => !orgSwitchLoading && setShowOrgSwitchDialog(false)}
            maxWidth="sm"
            fullWidth
            PaperProps={{
              sx: {
                borderRadius: '16px',
                border: '1px solid rgba(233, 234, 235, 0.6)',
                boxShadow: '0 20px 60px rgba(10, 13, 18, 0.15)'
              }
            }}
          >
            <DialogTitle sx={{ 
              fontFamily: 'Fractul', 
              fontWeight: 500,
              fontSize: '20px',
              color: '#170849',
              padding: '24px 24px 16px'
            }}>
              Switch Organization
            </DialogTitle>
            <DialogContent sx={{ padding: '0 24px 24px' }}>
              <Typography sx={{ 
                marginBottom: '20px', 
                fontFamily: 'Fractul',
                color: 'rgba(24, 29, 39, 0.7)',
                fontSize: '14px'
              }}>
                Select the organization you want to switch to:
              </Typography>
              <FormControl fullWidth>
                <InputLabel sx={{ fontFamily: 'Fractul' }}>Organization</InputLabel>
                <Select
                  value={selectedOrgForSwitch}
                  onChange={(e) => setSelectedOrgForSwitch(e.target.value)}
                  label="Organization"
                  sx={{
                    borderRadius: '12px',
                    fontFamily: 'Fractul',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(233, 234, 235, 0.8)'
                    }
                  }}
                >
                  {memberships
                    .filter((m: any) => m.org_id !== currentOrg?.id)
                    .map((membership: any) => (
                      <MenuItem 
                        key={membership.org_id} 
                        value={membership.org_id}
                        sx={{ fontFamily: 'Fractul' }}
                      >
                        {membership.organization?.name || 'Unknown Organization'} ({getRoleDisplayName(membership.role)})
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </DialogContent>
            <DialogActions sx={{ padding: '16px 24px 24px', gap: '8px' }}>
              <Button 
                onClick={() => setShowOrgSwitchDialog(false)}
                disabled={orgSwitchLoading}
                sx={{ 
                  fontFamily: 'Fractul',
                  color: 'rgba(24, 29, 39, 0.6)',
                  '&:hover': { backgroundColor: 'rgba(233, 234, 235, 0.3)' },
                  borderRadius: '8px',
                  textTransform: 'none'
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSwitchOrganization}
                disabled={!selectedOrgForSwitch || orgSwitchLoading}
                variant="contained"
                sx={{
                  backgroundColor: '#8412FF',
                  '&:hover': { 
                    backgroundColor: '#730ADD',
                    boxShadow: 'none'
                  },
                  '&:disabled': { backgroundColor: 'rgba(233, 234, 235, 0.5)' },
                  fontFamily: 'Fractul',
                  fontWeight: 500,
                  borderRadius: '8px',
                  textTransform: 'none',
                  boxShadow: 'none'
                }}
              >
                {orgSwitchLoading ? <CircularProgress size={18} color="inherit" /> : 'Switch Organization'}
              </Button>
            </DialogActions>
          </Dialog>

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
                borderRadius: '20px',
                border: '1px solid rgba(132, 18, 255, 0.12)',
                boxShadow: '0 30px 60px rgba(23, 8, 73, 0.2)'
              }
            }}
          >
            <DialogTitle
              sx={{
                fontFamily: 'Fractul',
                fontWeight: 600,
                fontSize: '20px',
                color: '#170849',
                padding: '28px 28px 8px'
              }}
            >
              Update profile photo
            </DialogTitle>
            <DialogContent sx={{ padding: '0 28px 28px' }}>
              <Box
                component="label"
                htmlFor={avatarInputId}
                onDragOver={handleAvatarDragOver}
                onDrop={handleAvatarDrop}
                sx={{
                  border: '1px dashed rgba(132, 18, 255, 0.4)',
                  background: 'rgba(132, 18, 255, 0.04)',
                  borderRadius: '16px',
                  padding: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  cursor: profileImageUploading ? 'not-allowed' : 'pointer',
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                  gap: '12px',
                  '&:hover': {
                    borderColor: '#8412FF',
                    background: 'rgba(132, 18, 255, 0.08)'
                  }
                }}
              >
                {avatarPreviewUrl ? (
                  <Box
                    component="img"
                    src={avatarPreviewUrl}
                    alt="Profile preview"
                    sx={{
                      width: 140,
                      height: 140,
                      borderRadius: '16px',
                      objectFit: 'cover',
                      boxShadow: '0 18px 32px rgba(23, 8, 73, 0.25)'
                    }}
                  />
                ) : (
                  <>
                    <Box
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 10px 20px rgba(23, 8, 73, 0.1)'
                      }}
                    >
                      <PhotoCameraOutlined sx={{ color: '#8412FF', fontSize: '32px' }} />
                    </Box>
                    <Typography sx={{ fontFamily: 'Fractul', fontSize: '16px', fontWeight: 500, color: '#170849' }}>
                      Drag & drop a new profile photo
                    </Typography>
                    <Typography sx={{ fontFamily: 'Fractul', fontSize: '13px', color: 'rgba(24, 29, 39, 0.65)' }}>
                      or click to browse files
                    </Typography>
                  </>
                )}
                <Button
                  component="span"
                  variant="contained"
                  disabled={profileImageUploading}
                  sx={{
                    mt: 1,
                    backgroundColor: '#8412FF',
                    borderRadius: '999px',
                    textTransform: 'none',
                    paddingX: '24px',
                    fontFamily: 'Fractul',
                    '&:hover': { backgroundColor: '#730ADD' }
                  }}
                >
                  Choose file
                </Button>
                <Typography
                  sx={{
                    fontFamily: 'Fractul',
                    fontSize: '12px',
                    color: 'rgba(23, 8, 73, 0.55)'
                  }}
                >
                  Supports JPG, PNG, WebP – up to {avatarSizeLimitMb} MB.
                </Typography>
              </Box>

              {avatarFile && (
                <Box
                  sx={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(132, 18, 255, 0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <Typography sx={{ fontFamily: 'Fractul', fontSize: '14px', color: '#170849', fontWeight: 500 }}>
                    {avatarFile.name}
                  </Typography>
                  <Typography sx={{ fontFamily: 'Fractul', fontSize: '13px', color: 'rgba(23, 8, 73, 0.65)' }}>
                    {(avatarFile.size / (1024 * 1024)).toFixed(2)} MB
                  </Typography>
                </Box>
              )}

              {avatarError && (
                <Alert severity="error" sx={{ marginTop: '16px' }}>
                  {avatarError}
                </Alert>
              )}
            </DialogContent>
            <DialogActions sx={{ padding: '0 28px 28px', gap: '12px' }}>
              <Button
                onClick={handleAvatarDialogClose}
                disabled={profileImageUploading}
                sx={{
                  textTransform: 'none',
                  fontFamily: 'Fractul',
                  color: 'rgba(24, 29, 39, 0.65)',
                  borderRadius: '10px'
                }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleAvatarUpload}
                disabled={!avatarFile || profileImageUploading}
                sx={{
                  backgroundColor: '#8412FF',
                  textTransform: 'none',
                  fontFamily: 'Fractul',
                  fontWeight: 600,
                  paddingX: '28px',
                  borderRadius: '10px',
                  '&:hover': { backgroundColor: '#730ADD' }
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

export default AccountPage;
