import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Select,
  MenuItem,
  FormControl,
  Checkbox,
  FormControlLabel,
  Grid,
  SelectChangeEvent,
  OutlinedInput,
  InputAdornment
} from '@mui/material';
import Slider from 'react-slick';
import "slick-carousel/slick/slick.css"; 
import "slick-carousel/slick/slick-theme.css";
import { GeminiArtwork } from '../types/legacy';

interface ArtworkDetailsFormProps {
  artworkData: GeminiArtwork[];
}

const ArtworkDetailsForm: React.FC<ArtworkDetailsFormProps> = ({ artworkData }) => {
  const [selectedArtworkIndex, setSelectedArtworkIndex] = useState<number>(0);
  const [formData, setFormData] = useState({
    artworkName: '',
    description: '',
    year: '',
    artistName: '',
    locationCreated: '',
    medium: '',
    dimensions: '',
    declaredValue: '',
    currentCustomsStatus: '',
    crating: 'No Crate',
    specialRequirements: {
      lightSensitive: false,
      temperatureSensitive: false,
      humiditySensitive: false,
    },
  });

  // Set initial form data to first artwork if available
  React.useEffect(() => {
    if (artworkData && artworkData.length > 0) {
      const firstArtwork = artworkData[0];
      setFormData({
        artworkName: firstArtwork.artworkName,
        description: firstArtwork.description,
        year: firstArtwork.year,
        artistName: firstArtwork.artistName,
        locationCreated: firstArtwork.locationCreated,
        medium: firstArtwork.medium,
        dimensions: firstArtwork.dimensions,
        declaredValue: firstArtwork.declaredValue,
        currentCustomsStatus: firstArtwork.currentCustomsStatus,
        crating: firstArtwork.crating,
        specialRequirements: firstArtwork.specialRequirements,
      });
    }
  }, [artworkData]);

  const handleArtworkClick = (index: number) => {
    setSelectedArtworkIndex(index);
    const artwork = artworkData[index];
    setFormData({
      artworkName: artwork.artworkName,
      description: artwork.description,
      year: artwork.year,
      artistName: artwork.artistName,
      locationCreated: artwork.locationCreated,
      medium: artwork.medium,
      dimensions: artwork.dimensions,
      declaredValue: artwork.declaredValue,
      currentCustomsStatus: artwork.currentCustomsStatus,
      crating: artwork.crating,
      specialRequirements: artwork.specialRequirements,
    });
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setFormData((prev) => ({
      ...prev,
      specialRequirements: { ...prev.specialRequirements, [name]: checked },
    }));
  };

  const sliderSettings = {
    dots: true,
    infinite: false,
    speed: 500,
    slidesToShow: Math.min(3, artworkData.length),
    slidesToScroll: 1,
    arrows: true,
  };

  return (
    <div className="file-upload-container">
      <div className="file-upload-header">
        <h2>Ready to Ship your Artworks?</h2>
        <p>Fill in the details for the artwork shipment. Click on an artwork image to edit its details.</p>
      </div>
      <Box sx={{ width: '100%', mb: 4 }}>
        <Slider {...sliderSettings}>
          {artworkData.map((artwork, index) => (
            <Box key={artwork.id} sx={{ p: 1 }}>
              <Paper 
                elevation={selectedArtworkIndex === index ? 4 : 2} 
                sx={{ 
                  p: 2, 
                  textAlign: 'center', 
                  position: 'relative',
                  cursor: 'pointer',
                  border: selectedArtworkIndex === index ? '2px solid #B3A1FF' : '2px solid transparent',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    boxShadow: 6,
                    border: '2px solid #B3A1FF',
                  }
                }}
                onClick={() => handleArtworkClick(index)}
              >
                {artwork.croppedImageUrl ? (
                  <Box
                    component="img"
                    src={`http://localhost:3000${artwork.croppedImageUrl}`}
                    alt={artwork.artworkName || `Artwork ${index + 1}`}
                    sx={{
                      height: '150px',
                      width: '100%',
                      objectFit: 'cover',
                      borderRadius: '8px',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      height: '150px',
                      width: '100%',
                      borderRadius: '8px',
                      backgroundColor: '#f5f5f5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#666',
                    }}
                  >
                    No Image Available
                  </Box>
                )}
                <Typography variant="caption" sx={{ mt: 1, display: 'block', fontWeight: 'medium' }}>
                  {artwork.artworkName || `Artwork ${index + 1}`}
                </Typography>
              </Paper>
            </Box>
          ))}
        </Slider>
      </Box>
      <div className="file-drop-zone">
        <Grid container spacing={3} sx={{ p: 2 }}>
          {/* Display current artwork indicator */}
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mb: 2, color: '#B3A1FF', fontWeight: 'bold' }}>
              Editing: {formData.artworkName || `Artwork ${selectedArtworkIndex + 1}`}
            </Typography>
          </Grid>

          {/* Artwork Title */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Artwork Title*</Typography>
            <TextField
              fullWidth
              placeholder="Enter artwork name"
              name="artworkName"
              value={formData.artworkName}
              onChange={handleChange}
            />
          </Grid>
          
          {/* Artist Name */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Artist Name</Typography>
            <TextField
              fullWidth
              placeholder="Enter artist name"
              name="artistName"
              value={formData.artistName}
              onChange={handleChange}
            />
          </Grid>

          {/* Year Created */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Year Created</Typography>
            <TextField
              fullWidth
              placeholder="Enter year of creation"
              name="year"
              value={formData.year}
              onChange={handleChange}
            />
          </Grid>

          {/* Location Created */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Location Created</Typography>
            <TextField
              fullWidth
              placeholder="Enter location of creation"
              name="locationCreated"
              value={formData.locationCreated}
              onChange={handleChange}
            />
          </Grid>

          {/* Medium */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Medium</Typography>
            <TextField
              fullWidth
              placeholder="e.g., Oil on canvas"
              name="medium"
              value={formData.medium}
              onChange={handleChange}
            />
          </Grid>

          {/* Dimensions */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Dimensions</Typography>
            <TextField
              fullWidth
              placeholder="e.g. 24 x 36 in"
              name="dimensions"
              value={formData.dimensions}
              onChange={handleChange}
            />
          </Grid>

          {/* Declared Value */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Declared Value*</Typography>
            <FormControl fullWidth>
                <OutlinedInput
                    name="declaredValue"
                    value={formData.declaredValue}
                    onChange={handleChange}
                    startAdornment={<InputAdornment position="start">$</InputAdornment>}
                    placeholder='0,000'
                />
            </FormControl>
          </Grid>

          {/* Current Customs Status */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Current Customs Status</Typography>
            <FormControl fullWidth>
              <Select
                name="currentCustomsStatus"
                value={formData.currentCustomsStatus}
                onChange={handleChange}
                displayEmpty
              >
                <MenuItem value="">Select status</MenuItem>
                <MenuItem value="cleared">Cleared</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="in_transit">In Transit</MenuItem>
                <MenuItem value="held">Held</MenuItem>
                <MenuItem value="inspection_required">Inspection Required</MenuItem>
                <MenuItem value="not_applicable">Not Applicable</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Crating */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Crating</Typography>
            <FormControl fullWidth>
              <Select
                name="crating"
                value={formData.crating}
                onChange={handleChange}
              >
                <MenuItem value="No Crate">No Crate</MenuItem>
                <MenuItem value="Standard Crate">Standard Crate</MenuItem>
                <MenuItem value="Custom Crate">Custom Crate</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          {/* Description */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Description</Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              placeholder="Enter notes about the artwork..."
              name="description"
              value={formData.description}
              onChange={handleChange}
            />
          </Grid>

          {/* Special Requirements */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>Special Requirements</Typography>
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.specialRequirements.lightSensitive}
                    onChange={handleCheckboxChange}
                    name="lightSensitive"
                  />
                }
                label="Light Sensitive"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.specialRequirements.temperatureSensitive}
                    onChange={handleCheckboxChange}
                    name="temperatureSensitive"
                  />
                }
                label="Temperature Sensitive"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.specialRequirements.humiditySensitive}
                    onChange={handleCheckboxChange}
                    name="humiditySensitive"
                  />
                }
                label="Humidity Sensitive"
              />
            </Box>
          </Grid>

          <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Button
              variant="contained"
              sx={{
                background: '#B3A1FF',
                color: 'white',
                borderRadius: '10px',
                textTransform: 'none',
                fontSize: '16px',
                fontWeight: 500,
                padding: '10px 28px',
                height: '44px',
                '&:hover': {
                  background: '#9e8be0',
                },
              }}
            >
              View details
            </Button>
          </Grid>
        </Grid>
      </div>
    </div>
  );
};

export default ArtworkDetailsForm; 