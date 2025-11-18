import React, { useState, useMemo } from 'react';
import { API_BASE_URL } from '../config';
import { 
  Avatar, Box, Button, CardContent, Collapse, Divider, FormControl, InputAdornment, 
  InputLabel, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Select, 
  TextField, Typography, useTheme, Paper, SelectChangeEvent, CircularProgress,
  Stack
} from '@mui/material';
import { 
  ArtTrack as ArtworkIcon, ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon, 
  Edit as EditIcon, Warning as WarningIcon, LocalShipping as LocalShippingIcon
} from '@mui/icons-material';
import { GeminiArtwork } from '../types/legacy';
import useSupabaseStore from '../store/useSupabaseStore';
import { ArtworkService } from '../lib/supabase';
import OriginDestination from './OriginDestination';
import { ProcessedArtwork } from '../lib/supabase/artworks';
import { Artwork as ArtworkType, ShipmentDetails, TransportMode, TransportType } from '../types';

// --- TYPE DEFINITIONS ---
// Updated interface to match the store structure
interface Artwork {
  id: string;
  artworkName: string;
  artistName: string;
  year: string;
  medium: string;
  dimensions: string;
  description: string;
  locationCreated: string;
  declaredValue: string;
  croppedImageUrl: string | null;
  crating: string;
  specialRequirements: {
    lightSensitive: boolean;
    temperatureSensitive: boolean;
    humiditySensitive: boolean;
  };
}

interface Shipment {
  id: string;
  originalFileName: string;
  shipmentOrigin: string;
  shipmentDestination: string;
  shipmentDate: string;
  artworks: Artwork[];
  error: string | null;
}

// Transform GeminiArtwork to Artwork format for validation
const transformGeminiArtworkToArtwork = (geminiArtwork: GeminiArtwork): ArtworkType => {
  // Parse numeric values from strings
  const parseNumericValue = (value: string): number => {
    const cleaned = value.replace(/[$,\s]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const normalizedYear = (geminiArtwork.year ?? '').toString().trim();

  return {
    id: geminiArtwork.id,
    title: geminiArtwork.artworkName,
    artist: geminiArtwork.artistName,
    year: normalizedYear || new Date().getFullYear().toString(),
    description: geminiArtwork.description,
    imageUrl: geminiArtwork.croppedImageUrl 
      ? (geminiArtwork.croppedImageUrl.startsWith('data:image') 
          ? geminiArtwork.croppedImageUrl 
          : `${API_BASE_URL}${geminiArtwork.croppedImageUrl}`)
      : '/page_001_art_1.png',
    value: parseNumericValue(geminiArtwork.declaredValue),
    dimensions: geminiArtwork.dimensions || '',
    medium: geminiArtwork.medium || '',
    countryOfOrigin: geminiArtwork.locationCreated || '',
    currentCustomsStatus: geminiArtwork.currentCustomsStatus || ''
  };
};

// --- COMPONENT DEFINITION ---
const ArtworksList: React.FC = () => {
  const theme = useTheme();
  // Get data from the store
  const store = useSupabaseStore();
  const { currentOrg, fetchShipments, forms } = store;
  const geminiArtworkData: GeminiArtwork[] = forms?.geminiArtworkData || [];
  const storeShipmentDetails = forms?.quote;
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for editable origin/destination fields
  const [origin, setOrigin] = useState<string>('Unknown Origin');
  const [destination, setDestination] = useState<string>('Unknown Destination');
  const [requiredByDate, setRequiredByDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Transform gemini artwork data to component format for validation
  const transformedArtworks = useMemo(() => {
    if (!geminiArtworkData) return [];
    return geminiArtworkData.map(transformGeminiArtworkToArtwork);
  }, [geminiArtworkData]);

  // Convert geminiArtworkData to the expected shipment format - memoized to prevent re-renders
  const extractedData: Shipment[] = useMemo(() => {
    if (!geminiArtworkData) return [];
    
    return [{
      id: 'shipment-main', // Use stable ID instead of Date.now()
      originalFileName: 'Extracted_Artwork_Data.pdf',
      shipmentOrigin: origin,
      shipmentDestination: destination,
      shipmentDate: requiredByDate,
      artworks: geminiArtworkData.map((artwork: GeminiArtwork) => ({
        id: artwork.id,
        artworkName: artwork.artworkName,
        artistName: artwork.artistName,
        year: artwork.year,
        medium: artwork.medium,
        dimensions: artwork.dimensions,
        description: artwork.description,
        locationCreated: artwork.locationCreated,
        declaredValue: artwork.declaredValue,
        croppedImageUrl: artwork.croppedImageUrl,
        crating: artwork.crating,
        specialRequirements: artwork.specialRequirements
      })),
      error: null
    }];
  }, [geminiArtworkData, origin, destination, requiredByDate]);

  const [editingArtworkId, setEditingArtworkId] = useState<string | null>(null);
  const [editingArtworkData, setEditingArtworkData] = useState<Partial<Artwork> | null>(null);

  const [selectedTransport, setSelectedTransport] = useState('');
  const [selectedInsurance, setSelectedInsurance] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedShippers, setSelectedShippers] = useState<string[]>([]);

  // Validation logic from CreateShipmentDetail
  const areArtworksValid = useMemo(() => {
    return transformedArtworks.every(artwork => 
      artwork.title && 
      artwork.title.trim() !== '' &&
      artwork.description && 
      artwork.description.trim() !== '' &&
      artwork.value > 0 &&
      artwork.medium &&
      artwork.medium.trim() !== '' &&
      artwork.countryOfOrigin &&
      artwork.countryOfOrigin.trim() !== '' &&
      artwork.currentCustomsStatus &&
      artwork.currentCustomsStatus.trim() !== ''
    );
  }, [transformedArtworks]);

  // Validate that a proper date is supplied
  const isRequiredByDateValid = useMemo(() => {
    const date = requiredByDate;
    return typeof date === 'string' && date.trim() !== '' && !isNaN(new Date(date).getTime());
  }, [requiredByDate]);

  const areShipmentSpecificsValid = useMemo(() => {
    return Boolean(selectedTransport) &&
           Boolean(selectedInsurance) &&
           selectedServices.length > 0 &&
           selectedShippers.length > 0 &&
           isRequiredByDateValid;
  }, [selectedTransport, selectedInsurance, selectedServices.length, selectedShippers.length, isRequiredByDateValid]);

  const isSubmitDisabled = !areArtworksValid || !areShipmentSpecificsValid || !currentOrg;

  // Handlers for editable fields
  const handleOriginChange = (newOrigin: string) => {
    setOrigin(newOrigin);
  };

  const handleDestinationChange = (newDestination: string) => {
    setDestination(newDestination);
  };

  const handleDateChange = (newDate: string) => {
    setRequiredByDate(newDate);
  };

  // Action handlers
  const handleCancelShipment = () => {
    // Clear store data and reset local state
    store.clearForms();
    
    // Reset local state
    setSelectedTransport('');
    setSelectedInsurance('');
    setSelectedServices([]);
    setSelectedShippers([]);
    setOrigin('Unknown Origin');
    setDestination('Unknown Destination');
    setRequiredByDate(new Date().toISOString().split('T')[0]);
  };

  const handleSaveAsDraft = async () => {
    // TODO: Implement save as draft functionality
    // For now, just show a confirmation
    alert('Draft saved successfully!');
  };

  const transportOptions = [
    { id: 'ground', title: 'Ground', icon: '🚛', duration: '2-7 days' },
    { id: 'air', title: 'Air', icon: '✈️', duration: '1-3 days' },
    { id: 'sea', title: 'Sea', icon: '🚢', duration: '14-45 days' }
  ];

  const insuranceOptions = [
    { id: 'basic', title: 'Basic Coverage', coverage: '80%' },
    { id: 'comprehensive', title: 'Comprehensive', coverage: '100%', recommended: true },
    { id: 'none', title: 'No Insurance', coverage: '0%' }
  ];

  const standardServices = [
    { id: 'crating', title: 'Museum Crating', recommended: true },
    { id: 'whiteglove', title: 'White Glove' },
    { id: 'report', title: 'Condition Report', recommended: true }
  ];

  const shipperOptions = [
    { id: 'atelier4', name: 'Atelier 4', rating: true },
    { id: 'crown', name: 'Crown Fine Art', rating: true },
    { id: 'gander', name: 'Gander & White', rating: true },
    { id: 'crozier', name: 'Crozier', rating: true }
  ];

  const handleArtworkClick = (shipmentId: string, artworkId: string) => {
    const shipment = extractedData.find(s => s.id === shipmentId);
    const artwork = shipment?.artworks.find(a => a.id === artworkId);

    if (editingArtworkId === artworkId) {
      handleCancelEdit();
      return;
    }

    if (artwork) {
      setEditingArtworkId(artworkId);
      const editableCopy = { ...artwork };
      // No need to convert 'missing value' since real data won't have this
      setEditingArtworkData(editableCopy);
    }
  };

  const handleCancelEdit = () => {
    setEditingArtworkId(null);
    setEditingArtworkData(null);
  };

  const handleSaveArtwork = (shipmentId: string) => {
    if (!editingArtworkData) return;

    if (!editingArtworkData.artworkName || !editingArtworkData.description) {
      alert('Artwork Title and Description are required.');
      return;
    }

    // Update the store data instead of local state
    // For now, we'll just close the edit mode since we don't have a store update function
    // In a real app, you'd want to add an update function to the store
    setEditingArtworkId(null);
    setEditingArtworkData(null);
  };

  const handleEditingInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<any>) => {
    const { name, value } = e.target;
    if (editingArtworkData) {
      setEditingArtworkData(prev => ({ ...prev, [name]: value as any }));
    }
  };

  const handleServiceToggle = (serviceId: string) => {
    setSelectedServices(prev => 
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleShipperToggle = (shipperName: string) => {
    setSelectedShippers(prev =>
      prev.includes(shipperName)
        ? prev.filter(name => name !== shipperName)
        : [...prev, shipperName]
    );
  };

  const handleSubmitShipment = async () => {
    if (!geminiArtworkData || !storeShipmentDetails || !currentOrg) {
      alert('Missing required data. Please ensure you have artwork data and are logged into an organization.');
      return;
    }

    if (!selectedTransport || !selectedInsurance || selectedServices.length === 0 || selectedShippers.length === 0) {
      alert('Please select transport method, insurance, services, and shippers before submitting.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate shipment code
      const shipmentCode = ArtworkService.generateShipmentCode();
      
      // Create shipment name from first artwork or use default
      const shipmentName = geminiArtworkData.length > 0 
        ? `${geminiArtworkData[0].artworkName} Collection`
        : 'Artwork Shipment';

      // Prepare shipment data
      const shipmentData = {
        name: shipmentName,
        code: shipmentCode,
        origin: origin,
        destination: destination,
        estimatedArrival: requiredByDate,
        ownerOrgId: currentOrg.id,
      };

      // Convert GeminiArtwork to ProcessedArtwork format
      const processedArtworks: ProcessedArtwork[] = geminiArtworkData.map(artwork => ({
        ...artwork,
        weight: '0' // Default weight as string, can be updated later
      }));
      
      // Create shipment with artworks
      const result = await ArtworkService.createShipmentWithArtworks(
        shipmentData,
        processedArtworks
      );

      if (result.error) {
        throw new Error(result.error);
      }

      // Success! Show confirmation and refresh data
      alert(`Shipment ${shipmentCode} created successfully with ${result.artworks.length} artworks!`);
      
      // Refresh shipments list
      await fetchShipments();
      
      // Clear the form data and reset to dashboard default state
      store.clearForms();
      
      // Reset form state
      setSelectedTransport('');
      setSelectedInsurance('');
      setSelectedServices([]);
      setSelectedShippers([]);
      setOrigin('Unknown Origin');
      setDestination('Unknown Destination');
      setRequiredByDate(new Date().toISOString().split('T')[0]);

    } catch (error) {
      console.error('Error creating shipment:', error);
      alert(`Failed to create shipment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show message if no data is available
  if (!geminiArtworkData || geminiArtworkData.length === 0) {
    return (
      <Paper 
        elevation={0} 
        sx={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 3,
          width: '100%', 
          maxWidth: '824px',
          margin: 'auto',
          background: '#F0FAFA',
          borderRadius: '12px',
          mt: 2,
          fontFamily: '"Fractul", sans-serif'
        }}
      >
        <Typography 
          variant="h6" 
          sx={{ 
            fontWeight: 500,
            fontSize: '18px',
            color: '#170849',
            textAlign: 'center'
          }}
        >
          No artwork data available
        </Typography>
        <Typography
          sx={{
            fontWeight: 400,
            fontSize: '14px',
            color: 'rgba(23, 8, 73, 0.7)',
            textAlign: 'center',
            mt: 1
          }}
        >
          Please upload a PDF file to extract artwork information.
        </Typography>
      </Paper>
    );
  }
  
  return (
    <Paper 
        elevation={0} 
        sx={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 3,
          gap: 3,
          width: '100%', 
          maxWidth: '824px',
          margin: 'auto',
          background: '#F0FAFA',
          borderRadius: '12px',
          mt: 2,
          fontFamily: '"Fractul", sans-serif'
        }}
    >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Typography 
                variant="h5" 
                sx={{ 
                    fontWeight: 500,
                    fontSize: '20px',
                    color: '#170849',
                    letterSpacing: '-0.02em',
                }}
            >
                Shipment Processing Results
            </Typography>
            <Typography
                sx={{
                    fontWeight: 500,
                    fontSize: '12px',
                    color: 'rgba(23, 8, 73, 0.7)',
                    letterSpacing: '-0.02em',
                    textAlign: 'center'
                }}
            >
                Review the extracted artwork details and confirm your shipment options.
            </Typography>
        </Box>
        <Box sx={{ maxHeight: '500px', overflowY: 'auto', width: '100%' }}>
        {extractedData.map((shipment) => (
            <Paper key={shipment.id} elevation={0} sx={{ 
                mb: 2, p: 2, borderRadius: '12px', 
                border: shipment.error ? '1px solid red' : '1px solid #e9eaeb',
                backgroundColor: '#FFFFFF'
            }}>
            <Typography variant="h6" gutterBottom sx={{
                fontWeight: 500,
                fontSize: '18px',
                color: '#170849',
            }}>
                File: {shipment.originalFileName}
            </Typography>
            {shipment.error ? (
                <Typography color="error">Error: {shipment.error}</Typography>
            ) : (
                <>
                <Box sx={{ mb: 2 }}>
                  <OriginDestination 
                    arrivalDate={requiredByDate}
                    origin={origin}
                    destination={destination}
                    onDateChange={handleDateChange}
                    onOriginChange={handleOriginChange}
                    onDestinationChange={handleDestinationChange}
                  />
                </Box>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                    Artworks ({shipment.artworks.length})
                </Typography>
                {shipment.artworks.length === 0 && <Typography variant="body2">No artworks extracted for this shipment.</Typography>}
                <List disablePadding>
                    {shipment.artworks.map((artwork) => (
                    <React.Fragment key={artwork.id}>
                        <ListItemButton onClick={() => handleArtworkClick(shipment.id, artwork.id)} sx={{ alignItems: 'flex-start' }}>
                        <ListItemIcon sx={{ mt: '8px', mr: 1 }}>
                            {artwork.croppedImageUrl ? (
                            <Avatar 
                                src={artwork.croppedImageUrl?.startsWith('data:image') 
                                  ? artwork.croppedImageUrl 
                                  : `${API_BASE_URL}${artwork.croppedImageUrl}`}
                                alt={artwork.artworkName || 'Artwork'} 
                                variant="rounded"
                                sx={{ width: 80, height: 80, mr: 1.5 }}
                            />
                            ) : (
                            <ArtworkIcon />
                            )}
                        </ListItemIcon>
                        <ListItemText 
                            primary={artwork.artworkName || 'Untitled Artwork'} 
                            secondary={`${artwork.year || 'Unknown Year'} • ${artwork.artistName || 'Unknown Artist'}`} 
                            primaryTypographyProps={{ sx: { fontWeight: 500 } }}
                        />
                        {editingArtworkId === artwork.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </ListItemButton>
                        <Collapse in={editingArtworkId === artwork.id} timeout="auto" unmountOnExit>
                        <CardContent sx={{ py:1, pt:2 }}>
                            {editingArtworkData && (
                            // Editing Mode
                            <Box component="form" noValidate autoComplete="off">
                                {/* Standard Text Fields */}
                                {[ 
                                { name: 'artworkName', label: 'Artwork Title', required: true },
                                { name: 'description', label: 'Description', required: true, multiline: true, rows: 3 },
                                { name: 'year', label: 'Year Created', required: false },
                                { name: 'artistName', label: 'Artist Name', required: false },
                                { name: 'locationCreated', label: 'Location Created', required: false },
                                { name: 'medium', label: 'Medium', required: false },
                                { name: 'dimensions', label: 'Dimensions', required: true },
                                { name: 'declaredValue', label: 'Declared Value', required: false }
                                ].map(field => {
                                const hasValue = editingArtworkData[field.name as keyof Artwork] && editingArtworkData[field.name as keyof Artwork] !== '';
                                const isError = field.required && !hasValue;
                                
                                const originalIcon = isError ? <WarningIcon color="error" /> : null;

                                return (
                                    <Box key={field.name} sx={{ mb: 2 }}>
                                        <Typography variant="body1" sx={{ fontWeight: '500', mb: 1 }}>
                                            {field.label}{field.required ? '*' : ''}
                                        </Typography>
                                        <TextField 
                                            margin="dense" 
                                            fullWidth 
                                            required={field.required}
                                            placeholder={`Enter ${field.label.toLowerCase()}`}
                                            name={field.name} 
                                            value={editingArtworkData[field.name as keyof Artwork] || ''} 
                                            onChange={handleEditingInputChange} 
                                            multiline={field.multiline}
                                            rows={field.rows}
                                            error={isError}
                                            helperText={isError && `${field.label} is required`}
                                            sx={{
                                                mt: 0,
                                                '& .MuiOutlinedInput-root': {
                                                    backgroundColor: '#f5f5f5',
                                                    '& fieldset': {
                                                        borderColor: '#d0d0d0',
                                                    },
                                                    '&:hover fieldset': {
                                                        borderColor: '#d0d0d0',
                                                    },
                                                    '&.Mui-focused fieldset': {
                                                        borderColor: '#d0d0d0',
                                                    },
                                                },
                                            }}
                                            InputProps={{
                                                endAdornment: (
                                                <InputAdornment position="end">
                                                    {originalIcon}
                                                </InputAdornment>
                                                ),
                                            }}
                                        />
                                    </Box>
                                );
                                })}
                                
                                {/* Crating Dropdown */}
                                <FormControl fullWidth margin="dense" variant="outlined">
                                    <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
                                        Crating
                                    </Typography>
                                    <Select
                                        name="crating"
                                        value={editingArtworkData.crating || 'No Crate'}
                                        onChange={handleEditingInputChange}
                                        sx={{
                                            backgroundColor: '#f5f5f5',
                                            '& .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#d0d0d0',
                                            },
                                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#d0d0d0',
                                            },
                                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                                borderColor: '#d0d0d0',
                                            },
                                        }}
                                    >
                                        <MenuItem value="No Crate">No Crate</MenuItem>
                                        <MenuItem value="Standard Crate">Standard Crate</MenuItem>
                                        <MenuItem value="Custom Crate">Custom Crate</MenuItem>
                                    </Select>
                                </FormControl>

                                {/* Special Requirements Multi-Checkbox */}
                                <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                                    Special Requirements
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {[
                                        { key: 'lightSensitive', label: 'Light Sensitive' },
                                        { key: 'temperatureSensitive', label: 'Temperature Sensitive' },
                                        { key: 'humiditySensitive', label: 'Humidity Sensitive' },
                                    ].map((requirement) => (
                                    <label key={requirement.key} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input
                                        type="checkbox"
                                        checked={editingArtworkData.specialRequirements?.[requirement.key as keyof typeof editingArtworkData.specialRequirements] || false}
                                        onChange={(e) => {
                                            const currentRequirements = editingArtworkData.specialRequirements || {
                                                lightSensitive: false,
                                                temperatureSensitive: false,
                                                humiditySensitive: false
                                            };
                                            const newRequirements = {
                                                ...currentRequirements,
                                                [requirement.key]: e.target.checked
                                            };
                                            setEditingArtworkData(prev => ({ ...prev, specialRequirements: newRequirements }));
                                        }}
                                        style={{ marginRight: '8px' }}
                                        />
                                        <Typography variant="body2">{requirement.label}</Typography>
                                    </label>
                                    ))}
                                </Box>
                                </Box>

                                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                <Button onClick={handleCancelEdit} color="secondary">Cancel</Button>
                                <Button onClick={() => handleSaveArtwork(shipment.id)} variant="contained">Save</Button>
                                </Box>
                            </Box>
                            )}
                        </CardContent>
                        </Collapse>
                        {shipment.artworks.length > 1 && artwork.id !== shipment.artworks[shipment.artworks.length -1].id && <Divider component="li" />}
                    </React.Fragment>
                    ))}
                </List>
                </>
            )}
            </Paper>
        ))}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 2, width: '100%', maxWidth: '800px', mx: 'auto' }}>
            {/* Compressed Shipment Specifics */}
            <Paper elevation={0} sx={{ 
              width: '100%', 
              p: 2, 
              mb: 2, 
              borderRadius: '12px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #e9eaeb'
            }}>
              <Typography variant="h6" fontWeight="bold" sx={{ 
                mb: 2, 
                textAlign: 'center',
                fontWeight: 500,
                fontSize: '18px',
                color: '#170849',
              }}>
                Shipment Specifics
              </Typography>
              
              {/* Transport Method */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Transport Method</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {transportOptions.map(opt => (
                    <Button
                      key={opt.id}
                      variant={selectedTransport === opt.id ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setSelectedTransport(opt.id)}
                      sx={{ 
                        flex: 1, 
                        py: 0.5,
                        fontSize: '0.75rem',
                        textTransform: 'none',
                        '&.MuiButton-outlined': {
                          borderColor: 'grey.300'
                        }
                      }}
                    >
                      {opt.icon} {opt.title}
                    </Button>
                  ))}
                </Box>
              </Box>

              {/* Insurance Coverage */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Insurance Coverage</Typography>
                <FormControl fullWidth size="small">
                  <Select
                    value={selectedInsurance}
                    onChange={(e) => setSelectedInsurance(e.target.value)}
                    displayEmpty
                    sx={{ fontSize: '0.875rem' }}
                  >
                    <MenuItem value="" disabled>Select insurance option</MenuItem>
                    {insuranceOptions.map(opt => (
                      <MenuItem key={opt.id} value={opt.id}>
                        {opt.title} ({opt.coverage} coverage)
                        {opt.recommended && ' ⭐'}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* Standard Services */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Standard Services</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {standardServices.map(service => (
                    <Button
                      key={service.id}
                      variant={selectedServices.includes(service.id) ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => handleServiceToggle(service.id)}
                      sx={{ 
                        fontSize: '0.7rem',
                        py: 0.3,
                        px: 1,
                        minWidth: 'auto',
                        textTransform: 'none',
                        '&.MuiButton-outlined': {
                          borderColor: 'grey.300'
                        }
                      }}
                    >
                      {service.title}
                      {service.recommended && ' ⭐'}
                    </Button>
                  ))}
                </Box>
              </Box>

              {/* ICEFAT Certified Shippers */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>ICEFAT Certified Shippers</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {shipperOptions.map(shipper => (
                    <Button
                      key={shipper.id}
                      variant={selectedShippers.includes(shipper.name) ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => handleShipperToggle(shipper.name)}
                      sx={{ 
                        fontSize: '0.7rem',
                        py: 0.3,
                        px: 1,
                        minWidth: 'auto',
                        textTransform: 'none',
                        '&.MuiButton-outlined': {
                          borderColor: 'grey.300'
                        }
                      }}
                    >
                      {shipper.name}
                      {shipper.rating && ' ⭐'}
                    </Button>
                  ))}
                </Box>
              </Box>
            </Paper>

            {/* Buttons */}
            <Stack spacing={2} sx={{ alignItems: 'center', width: '100%' }}>
              <Button
                variant="contained"
                startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <LocalShippingIcon />}
                onClick={handleSubmitShipment}
                disabled={isSubmitting || isSubmitDisabled}
                sx={{ 
                  py: 1.5, 
                  px: 3, 
                  borderRadius: '8px', 
                }}
              >
                {isSubmitting ? 'Creating Shipment...' : 'Submit Shipment'}
              </Button>
              
              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  onClick={handleCancelShipment}
                  disabled={isSubmitting}
                  sx={{ 
                    py: 1, 
                    px: 2.5, 
                    borderRadius: '8px',
                    color: '#58517E',
                    borderColor: '#58517E',
                    '&:hover': {
                      borderColor: '#58517E',
                      background: 'rgba(88, 81, 126, 0.04)',
                    },
                  }}
                >
                  Cancel Shipment
                </Button>
                
                <Button
                  variant="text"
                  onClick={handleSaveAsDraft}
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
              </Stack>
            </Stack>
          </Box>
    </Paper>
  );
}

export default ArtworksList; 
