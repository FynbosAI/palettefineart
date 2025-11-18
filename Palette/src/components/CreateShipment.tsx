import React, { useState, useRef, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  Button, 
  TextField, 
  IconButton,
  Divider,
  CircularProgress,
  LinearProgress,
  List,
  ListItem,
  Autocomplete
} from '@mui/material';
import { 
  ArrowBack as ArrowBackIcon,
  CloudUpload as UploadIcon,
  LocalShipping as ShippingIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
// Add imports for PDF to PNG conversion
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

// Import shared types
import { GeminiArtwork, ExtractedData } from '../types/legacy';
import { useShipmentForm } from '../hooks/useShipmentForm';
import { getDefaultArrivalDate, getTodayIsoDate } from '../lib/dateDefaults';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const popularCities = [
  'New York, United States',
  'London, United Kingdom',
  'Paris, France',
  'Tokyo, Japan',
  'Hong Kong, China',
];

const MotionPaper = motion(Paper);
const MotionBox = motion(Box);

const normalizeIsoDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().split('T')[0];
};

const sanitizeArrivalDate = (candidate?: string | null, fallback?: string | null) => {
  const defaultDate = getDefaultArrivalDate();
  const normalizedCandidate = normalizeIsoDate(candidate);
  if (normalizedCandidate) {
    const todayIso = getTodayIsoDate();
    if (normalizedCandidate > todayIso) {
      return normalizedCandidate;
    }
  }

  const normalizedFallback = normalizeIsoDate(fallback);
  if (normalizedFallback) {
    const todayIso = getTodayIsoDate();
    if (normalizedFallback > todayIso) {
      return normalizedFallback;
    }
  }

  return defaultDate;
};

// Helper function to render a PDF page to a PNG blob directly and resize it
async function renderPdfPageToPng(pdfPage: any) {
  const PIXEL_TARGET = 1536; // Reduced from 2048 to 1536 for faster processing
  const viewport = pdfPage.getViewport({ scale: 1.0 });

  let newWidth, newHeight;
  if (viewport.width > viewport.height) {
    newWidth = PIXEL_TARGET;
    newHeight = (viewport.height / viewport.width) * PIXEL_TARGET;
  } else {
    newHeight = PIXEL_TARGET;
    newWidth = (viewport.width / viewport.height) * PIXEL_TARGET;
  }
  newWidth = Math.round(newWidth);
  newHeight = Math.round(newHeight);

  console.log(`Rendering PDF page to PNG: ${newWidth}x${newHeight}`);

  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to get 2D context from canvas');
  }

  // Clear canvas with white background
  context.fillStyle = 'white';
  context.fillRect(0, 0, newWidth, newHeight);

  const renderViewport = pdfPage.getViewport({ scale: newWidth / viewport.width });

  console.log('Starting PDF page render...');
  await pdfPage.render({ canvasContext: context, viewport: renderViewport }).promise;
  console.log('PDF page render completed');

  // Use canvas.toBlob() with improved error handling and timeout
  const blob = await new Promise<Blob>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
    
    // Set timeout for blob creation
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Blob creation timeout after 10 seconds'));
    }, 10000);
    
    try {
      canvas.toBlob((blob) => {
        cleanup();
        if (blob && blob.size > 0) {
          console.log('Canvas toBlob completed, blob size:', blob.size);
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas or blob has zero size'));
        }
      }, 'image/png'); // PNG format
    } catch (error) {
      cleanup();
      reject(new Error(`Canvas toBlob failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });

  // Additional blob validation
  if (blob.size === 0) {
    throw new Error('Generated PNG blob has zero size');
  }

  if (blob.size > 10 * 1024 * 1024) { // 10 MB limit per image (PNGs are larger than JPEGs)
    throw new Error(`Generated PNG blob is too large: ${blob.size} bytes`);
  }

  if (blob.type !== 'image/png') {
    console.warn('Blob type mismatch:', blob.type);
  }

  // Test blob readability immediately
  try {
    const testSlice = blob.slice(0, 100);
    await testSlice.arrayBuffer();
  } catch (testError) {
    throw new Error('Generated blob is not readable - corrupted data');
  }

  return { 
    blob,
    width: newWidth,
    height: newHeight
  };
}

const CreateShipment = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ===== Progress UI enhancements =====
  // Ref to store interval used for simulated backend progress
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Human-readable progress message shown below the progress bar
  const [progressMessage, setProgressMessage] = useState<string>('Processing files…');
  
  // Store mapping of artwork IDs to their image blobs for later upload
  const artworkImageBlobsRef = useRef<Map<string, Blob>>(new Map());
  
  // Use centralized form state from Zustand
  const {
    uploadState,
    geminiArtworkData,
    shipmentForm,
    updateUploadState,
    setGeminiArtworkData,
    updateShipmentForm,
    setUploadProgress,
    setProcessingStatus,
    setProcessingComplete,
    addUploadedFile,
    removeUploadedFile,
    addExtractedData,
    addUploadedFiles,
    setExtractedData,
    setShipmentData,
    resetUploadState,
  } = useShipmentForm();
  
  const [isDragging, setIsDragging] = useState(false);

  /**
   * Gradually increments the overall progress while we wait for the backend.
   * The progress will smoothly reach `targetValue` in approximately `expectedSeconds` seconds.
   */
  const startSimulatedBackendProgress = (
    expectedSeconds: number,
    startValue: number,
    targetValue: number,
  ) => {
    // Clear any existing timer first
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    const UPDATE_INTERVAL_MS = 500; // how often to tick the progress bar
    const totalSteps = Math.max(1, Math.round((expectedSeconds * 1000) / UPDATE_INTERVAL_MS));
    const increment = (targetValue - startValue) / totalSteps;

    let current = startValue;
    progressTimerRef.current = setInterval(() => {
      current = Math.min(targetValue, current + increment);
      setUploadProgress(current);
      // Stop the timer once we reach the target value
      if (current >= targetValue && progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, UPDATE_INTERVAL_MS);
  };

  /** Stops the simulated backend progress timer if it is running. */
  const stopSimulatedBackendProgress = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  // Clear any outstanding timer when the component unmounts to prevent memory leaks
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      // Clear blob references to free memory
      artworkImageBlobsRef.current.clear();
    };
  }, []);

  const {
    uploadedFiles,
    isProcessing,
    processingComplete,
    extractedData,
    overallProgress,
    shipmentData
  } = uploadState;

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const handleProcessFiles = async () => {
    // Only process PDF files
    const pdfFiles = uploadedFiles.filter(file => getFileExtension(file.name) === 'pdf');
    
    if (pdfFiles.length === 0) {
      alert('Please upload at least one PDF file to process.');
      return;
    }

    setProcessingStatus(true, false);
    setUploadProgress(0);
    
    try {
      // Process each PDF file
      const allArtworkData: GeminiArtwork[] = [];
      let shipmentDetails = null;

      for (let i = 0; i < pdfFiles.length; i++) {
        const uploadableFile = pdfFiles[i];
        
        try {
          // Update progress
          const progressPerFile = 100 / pdfFiles.length;
          const baseProgress = i * progressPerFile;
          setUploadProgress(baseProgress + progressPerFile * 0.1);

          // Convert PDF to PNG images
          console.log('Processing PDF:', uploadableFile.name);
          
          // Check if worker is properly set up
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            console.error('PDF.js worker not found. Worker source:', pdfjsLib.GlobalWorkerOptions.workerSrc);
            throw new Error('PDF.js worker not properly configured');
          }
          
          console.log('Loading PDF document...');
          let arrayBuffer;
          try {
            arrayBuffer = await uploadableFile.arrayBuffer();
            console.log('PDF ArrayBuffer size:', arrayBuffer.byteLength);
            
            if (arrayBuffer.byteLength === 0) {
              throw new Error('PDF file is empty or corrupted');
            }
            
            if (arrayBuffer.byteLength > 50 * 1024 * 1024) { // 50MB limit
              throw new Error(`PDF file is too large: ${arrayBuffer.byteLength} bytes (max 50MB)`);
            }
          } catch (bufferError) {
            console.error('Failed to read PDF file:', bufferError);
            throw new Error(`Failed to read PDF file: ${bufferError instanceof Error ? bufferError.message : 'Unknown error'}`);
          }
          
          let pdf;
          try {
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            pdf = await loadingTask.promise;
            console.log('PDF loaded successfully, pages:', pdf.numPages);
            
            if (pdf.numPages === 0) {
              throw new Error('PDF has no pages');
            }
            
            if (pdf.numPages > 20) { // Limit to 20 pages to prevent large uploads
              throw new Error(`PDF has too many pages: ${pdf.numPages} (max 20)`);
            }
          } catch (pdfError) {
            console.error('Failed to load PDF:', pdfError);
            throw new Error(`Failed to load PDF: ${pdfError instanceof Error ? pdfError.message : 'PDF file may be corrupted'}`);
          }
          
                      setUploadProgress(baseProgress + progressPerFile * 0.2);

          const pageImages: { blob: Blob; filename: string }[] = [];
          
          // Process each page with improved error handling
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            console.log(`Processing page ${pageNum} of ${pdf.numPages}...`);
            
            try {
              const page = await pdf.getPage(pageNum);
              const { blob } = await renderPdfPageToPng(page);
              
              // Validate blob before adding to the collection
              const filename = `${uploadableFile.name}_page_${pageNum}.png`;
              
              // Additional blob validation
              if (!blob || blob.size === 0) {
                throw new Error(`Failed to create valid blob for page ${pageNum}: blob is empty`);
              }
              
              if (blob.type !== 'image/png') {
                console.warn(`Page ${pageNum} blob type mismatch: expected 'image/png', got '${blob.type}'`);
              }
              
              // Test blob readability
              try {
                const testSlice = blob.slice(0, 1000); // Test first 1KB
                const testArrayBuffer = await testSlice.arrayBuffer();
                if (testArrayBuffer.byteLength === 0) {
                  throw new Error('Blob slice is empty');
                }
              } catch (readError) {
                console.error(`Page ${pageNum} blob is not readable:`, readError);
                throw new Error(`Page ${pageNum} blob is corrupted and cannot be read`);
              }
              
              console.log(`Page ${pageNum} converted to PNG: ${filename}, size: ${blob.size} bytes, type: ${blob.type}`);
              pageImages.push({ blob, filename });
              
            } catch (pageError) {
              console.error(`Failed to process page ${pageNum}:`, pageError);
              throw new Error(`Failed to process page ${pageNum}: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`);
            }
          }

                        setUploadProgress(baseProgress + progressPerFile * 0.5);

          // Send PNG images to backend
          console.log(`Uploading ${pageImages.length} PNG images from ${uploadableFile.name} (will be processed in parallel batches)`);
          
          // Create FormData with error handling
          const formData = new FormData();
          
          try {
            // Add all PNG images from this PDF
            for (let j = 0; j < pageImages.length; j++) {
              const pngImage = pageImages[j];
              console.log(`Adding image ${j + 1} to FormData: ${pngImage.filename}, size: ${pngImage.blob.size} bytes`);
              
              // Create a new File object from the blob for better compatibility
              const file = new File([pngImage.blob], pngImage.filename, { 
                type: 'image/png',
                lastModified: Date.now() 
              });
              
              // Validate file before adding to FormData
              if (file.size !== pngImage.blob.size) {
                throw new Error(`File size mismatch: File=${file.size}, Blob=${pngImage.blob.size}`);
              }
              
              console.log(`Adding file to FormData: ${file.name}, size: ${file.size}, type: ${file.type}`);
              formData.append('images', file);
            }
            
            // Add original PDF filename for reference
            formData.append('originalPdfName', uploadableFile.name);
            
            // Inform the user that we're about to start the long-running backend work
            setProgressMessage('Uploading images to server…');
            
          } catch (formDataError) {
            console.error('FormData construction failed:', formDataError);
            throw new Error(`Failed to create FormData: ${formDataError instanceof Error ? formDataError.message : 'Unknown error'}`);
          }

                        setUploadProgress(baseProgress + progressPerFile * 0.6);

          // Begin simulated backend processing progress (covers the long-running server work)
          const numBatches = Math.ceil(pageImages.length / 5);
          const expectedBackendSeconds = numBatches * 25; // Rough estimate based on backend logs
          startSimulatedBackendProgress(
            expectedBackendSeconds,
            baseProgress + progressPerFile * 0.6,
            baseProgress + progressPerFile * 0.95,
          );
          setProgressMessage('Processing images on server…');

          console.log('Sending request to backend...');
          console.log('Request URL:', `${API_BASE_URL}/api/process-images`);
          
          // Add request timeout and retry logic
          const MAX_RETRIES = 2;
          const TIMEOUT_MS = 120000; // 2 minutes timeout
          
          let response: Response;
          let lastError: Error | null = null;
          
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              console.log(`Upload attempt ${attempt} of ${MAX_RETRIES}`);
              
              let timedOut = false;
              const timeoutId = setTimeout(() => {
                timedOut = true;
                console.error('Upload request timed out');
              }, TIMEOUT_MS);

              try {
                response = await fetch(`${API_BASE_URL}/api/process-images`, {
                  method: 'POST',
                  body: formData,
                  headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                  }
                });
              } finally {
                clearTimeout(timeoutId);
              }

              if (timedOut) {
                throw new Error('Upload request exceeded timeout but still completed.');
              }
              
              console.log('Response received:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok
              });
              
              // If we get a response, break out of retry loop
              break;
              
            } catch (fetchError) {
              lastError = fetchError instanceof Error ? fetchError : new Error('Unknown fetch error');
              console.error(`Upload attempt ${attempt} failed:`, lastError);
              
              if (attempt === MAX_RETRIES) {
                throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
              }
              
              // Wait before retry (exponential backoff)
              const waitTime = 1000 * Math.pow(2, attempt - 1);
              console.log(`Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }

          const responseText = await response!.text();

          if (!response!.ok) {
            console.error(`Backend error for ${uploadableFile.name}:`, {
              status: response!.status,
              statusText: response!.statusText,
              errorText: responseText || 'Empty response body'
            });
            throw new Error(`Failed to process ${uploadableFile.name}: ${response!.status} ${response!.statusText} - ${responseText || 'Empty response body'}`);
          }

          if (!responseText || responseText.trim().length === 0) {
            throw new Error('Backend returned an empty response.');
          }

          // Backend responded – stop the simulated progress and jump closer to 100 %
          stopSimulatedBackendProgress();
          setProgressMessage('Parsing server response…');

          setUploadProgress(baseProgress + progressPerFile * 0.8);

          console.log('Backend response received, parsing JSON...');
          let result;
          try {
            result = JSON.parse(responseText);
            console.log('Backend result:', result);
            console.log('[CREATE_SHIPMENT] Extracted shipment details:', {
              title: result.shipmentDetails?.title || 'No title',
              clientReference: result.shipmentDetails?.clientReference || 'No reference'
            });
          } catch (jsonError) {
            console.error('Failed to parse JSON response:', jsonError);
            throw new Error(`Backend returned invalid JSON response: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
          }
          
          if (result.success) {
            // Add artwork data from this PDF
            if (result.artworkData) {
              // Convert base64 cropped images to blobs for each artwork
              const artworkDataWithBlobs = await Promise.all(
                result.artworkData.map(async (artwork: GeminiArtwork) => {
                  let imageBlob: Blob | null = null;
                  
                  // Convert base64 cropped image to blob if available
                  if (artwork.croppedImageUrl && artwork.croppedImageUrl.startsWith('data:image')) {
                    try {
                      const response = await fetch(artwork.croppedImageUrl);
                      imageBlob = await response.blob();
                      console.log(`Converted cropped image to blob for ${artwork.id}:`, {
                        blobSize: imageBlob.size,
                        blobType: imageBlob.type
                      });
                      
                      // Store blob in ref map for later upload
                      artworkImageBlobsRef.current.set(artwork.id, imageBlob);
                    } catch (conversionError) {
                      console.error(`Failed to convert cropped image for ${artwork.id}:`, conversionError);
                    }
                  }
                  
                  return {
                    ...artwork,
                    imageBlob: imageBlob
                  };
                })
              );
              
              allArtworkData.push(...artworkDataWithBlobs);
            }
            
            // Store shipment details (from the first PDF that has them)
            if (result.shipmentDetails && !shipmentDetails) {
              shipmentDetails = result.shipmentDetails;
            }

            // Update extracted data for this file
            addExtractedData({
              originalFileName: uploadableFile.name,
              artworks: result.artworkData ? result.artworkData.length : 0,
              error: null
            });
          } else {
            throw new Error(result.error || 'Processing failed');
          }

                      setUploadProgress(baseProgress + progressPerFile);
          setProgressMessage('Finalising data…');
          
        } catch (pdfError) {
          console.error(`Error processing PDF ${uploadableFile.name}:`, pdfError);
          // Stop any ongoing simulated progress for this file
          stopSimulatedBackendProgress();
          
          // Update extracted data for this file with error
          addExtractedData({
            originalFileName: uploadableFile.name,
            artworks: 0,
            error: pdfError instanceof Error ? pdfError.message : 'Unknown error'
          });
        }
      }

      // Update store with processed data
      setGeminiArtworkData(allArtworkData);
      if (shipmentDetails) {
        const sanitizedArrival = sanitizeArrivalDate(
          shipmentDetails.arrivalDate,
          shipmentData.arrivalDate
        );

        if (typeof window !== 'undefined') {
          console.log('[SHIPMENT_DEBUG] sanitizeArrivalDate applied', {
            extractedArrival: shipmentDetails.arrivalDate,
            storedArrival: shipmentData.arrivalDate,
            sanitizedArrival,
          });
        }

        console.log('[CREATE_SHIPMENT] Updating shipment form with extracted details:', shipmentDetails);
        updateShipmentForm({
          origin: shipmentDetails.origin || shipmentData.origin,
          destination: shipmentDetails.destination || shipmentData.destination,
          arrivalDate: sanitizedArrival,
          title: shipmentDetails.title || '',           // NEW
          clientReference: shipmentDetails.clientReference || '', // NEW
          originContactName: shipmentDetails.originContactName || '',
          originContactPhone: shipmentDetails.originContactPhone || '',
          originContactEmail: shipmentDetails.originContactEmail || '',
          destinationContactName: shipmentDetails.destinationContactName || '',
          destinationContactPhone: shipmentDetails.destinationContactPhone || '',
          destinationContactEmail: shipmentDetails.destinationContactEmail || '',
        });
        
        // Also update the shipmentData in upload state so form fields show extracted data
        // and the View Details button becomes enabled
        setShipmentData({
          origin: shipmentDetails.origin || shipmentData.origin,
          destination: shipmentDetails.destination || shipmentData.destination,
          arrivalDate: sanitizedArrival,
          title: shipmentDetails.title || '',           // NEW
          clientReference: shipmentDetails.clientReference || '', // NEW
          originContactName: shipmentDetails.originContactName || '',
          originContactPhone: shipmentDetails.originContactPhone || '',
          originContactEmail: shipmentDetails.originContactEmail || '',
          destinationContactName: shipmentDetails.destinationContactName || '',
          destinationContactPhone: shipmentDetails.destinationContactPhone || '',
          destinationContactEmail: shipmentDetails.destinationContactEmail || '',
        });
      }

              setProcessingStatus(false, true);
        setUploadProgress(100);
      setProgressMessage('Processing complete');

      console.log('Processing complete:', { 
        artworks: allArtworkData.length, 
        shipmentDetails 
      });

      // Auto-navigate to detail page if we have the required data
      if (shipmentDetails && (shipmentDetails.origin || shipmentDetails.destination)) {
        console.log('Auto-navigating to detail page after successful processing');
        navigate('/estimates/new/detail');
      }

    } catch (error) {
      console.error('Error processing files:', error);
      alert(`Error processing files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Mark files as having errors
      pdfFiles.forEach(file => {
        addExtractedData({
          originalFileName: file.name,
          artworks: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    } finally {
      // Ensure any running timer is stopped
      stopSimulatedBackendProgress();
      setProcessingStatus(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addUploadedFiles(Array.from(event.target.files));
    }
  };

  const handleRemoveFile = (fileName: string) => {
    removeUploadedFile(fileName);
  };
  
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addUploadedFiles(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  };

  const handleShipmentInputChange = (field: string, value: string | null) => {
    updateShipmentForm({ [field]: value || '' });
  };

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <div className="header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate('/estimates')}
                sx={{
                  color: '#58517E',
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': {
                    background: 'rgba(132, 18, 255, 0.04)',
                  },
                }}
              >
                Back to estimates
              </Button>
              <h1 className="header-title">Create New Shipment</h1>
            </div>
          </div>
        </header>
        <div className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Box sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            borderRadius: '12px',
            background: '#F0FAFA',
            maxWidth: '800px',
            width: '80%',
          }}>
            {/* File Upload Section */}
            <Box>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <UploadIcon sx={{ mr: 1, color: 'primary.main' }} />
                Upload Shipment Details
              </Typography>
              
              <MotionPaper
                onClick={() => uploadedFiles.length === 0 && fileInputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                elevation={0}
                sx={{
                  p: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  borderRadius: '12px',
                  border: '2px dashed',
                  borderColor: isDragging ? 'primary.main' : 'primary.light',
                  backgroundColor: isDragging ? alpha(theme.palette.primary.light, 0.3) : '#FFFFFF',
                  cursor: uploadedFiles.length === 0 ? 'pointer' : 'default',
                  transition: 'all 0.3s ease',
                  boxShadow: isDragging ? '0 8px 20px rgba(0, 0, 0, 0.15)' : 'none',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.1)',
                    transform: uploadedFiles.length === 0 ? 'translateY(-2px)' : 'none'
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.xls,.xlsx,.csv"
                  multiple
                  style={{ display: 'none' }}
                />

                {uploadedFiles.length === 0 ? (
                  <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    py: 6,
                    px: 3
                  }}>
                    <div className="file-drop-zone-content">
                      <div className="file-drop-zone-icon-container">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M12 16.5V3M12 16.5L8.5 13M12 16.5L15.5 13M5 21H19"
                            stroke="#8412FF"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            transform="matrix(1, 0, 0, -1, 0, 24)"
                          />
                        </svg>
                      </div>
                      <div className="file-drop-zone-text-container">
                        <div className="file-drop-zone-action-text">
                          <span className="upload-link" onClick={() => fileInputRef.current?.click()}>
                            Click to upload
                          </span>{' '}
                          or drag and drop
                        </div>
                        <div className="file-drop-zone-supporting-text">
                          XLS, CSV, or other supported file types
                        </div>
                      </div>
                    </div>
                  </Box>
                ) : (
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ mb: 2, textAlign: 'center' }}>
                      Uploaded Files ({uploadedFiles.length})
                    </Typography>
                    
                    <List sx={{
                      width: '100%',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      border: '1px solid',
                      borderColor: 'grey.200',
                      borderRadius: '8px',
                      mb: 2,
                      background: '#FFFFFF'
                    }}>
                      {uploadedFiles.map((file, index) => {
                        const fileData = extractedData.find(d => d.originalFileName === file.name);
                        return (
                          <ListItem
                            key={`${file.name}-${index}`}
                            secondaryAction={
                              <IconButton edge="end" aria-label="delete" onClick={() => handleRemoveFile(file.name)}>
                                <DeleteIcon color="error" />
                              </IconButton>
                            }
                            sx={{
                              borderBottom: index < uploadedFiles.length - 1 ? '1px solid' : 'none',
                              borderColor: 'grey.200',
                              py: 1,
                              position: 'relative'
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                              {isProcessing && !processingComplete && (
                                <CircularProgress size={16} sx={{ mr: 1 }} />
                              )}
                              
                              {processingComplete && (
                                fileData?.error ?
                                  <ClearIcon color="error" sx={{ mr: 1, fontSize: 16 }} /> :
                                  (fileData && fileData.artworks > 0 ?
                                    <CheckIcon color="success" sx={{ mr: 1, fontSize: 16 }} /> : <Box sx={{ mr: 1, width: 16 }}/> // Placeholder for alignment
                                  )
                              )}
                              
                              <Typography
                                variant="body2"
                                noWrap
                                sx={{
                                  maxWidth: '300px',
                                  color: processingComplete ?
                                      (fileData?.error ? 'error.main' :
                                        (fileData && fileData.artworks > 0 ? 'success.main' : 'text.primary')
                                      ) : 'text.primary'
                                }}
                              >
                                {file.name}
                              </Typography>
                            </Box>
                          </ListItem>
                        );
                      })}
                    </List>
                    
                    <AnimatePresence initial={false}>
                      {isProcessing && (
                        <MotionBox
                          key="processing-status"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                          sx={{
                            width: '100%',
                            mt: 2,
                            mb: 2,
                            overflow: 'hidden'
                          }}
                        >
                          <LinearProgress
                            variant="determinate"
                            value={overallProgress}
                            sx={{ height: 8, borderRadius: 4 }}
                          />
                          <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                            {progressMessage} {Math.round(overallProgress)}% Complete
                          </Typography>
                        </MotionBox>
                      )}
                    </AnimatePresence>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                      <Button
                        variant="outlined"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessing}
                      >
                        Add More
                      </Button>
                      
                      <Button
                        variant="contained"
                        onClick={handleProcessFiles}
                        disabled={isProcessing || uploadedFiles.length === 0}
                        startIcon={isProcessing ? <CircularProgress size={20} color="inherit" /> : null}
                      >
                        {isProcessing ? 'Processing...' : 'Process Files'}
                      </Button>
                    </Box>
                  </Box>
                )}
              </MotionPaper>
            </Box>

            {/* <Divider>
              <Typography variant="body2" color="text.secondary">
                OR FILL MANUALLY
              </Typography>
            </Divider> */}

            {/* Manual Entry Section */}
            {/* <Box>
              <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                <ShippingIcon sx={{ mr: 1, color: 'primary.main' }} />
                Shipment Information
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    freeSolo
                    options={popularCities}
                    value={shipmentData.origin}
                    onChange={(e, v) => handleShipmentInputChange('origin', v)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        label="Origin"
                        variant="outlined"
                        sx={{ background: '#FFFFFF' }}
                      />
                    )}
                  />
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    freeSolo
                    options={popularCities}
                    value={shipmentData.destination}
                    onChange={(e, v) => handleShipmentInputChange('destination', v)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        label="Destination"
                        variant="outlined"
                        sx={{ background: '#FFFFFF' }}
                      />
                    )}
                  />
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Arrival Date"
                    name="arrivalDate"
                    value={shipmentData.arrivalDate}
                    onChange={(e) => handleShipmentInputChange(e.target.name, e.target.value)}
                    type="date"
                    variant="outlined"
                    InputLabelProps={{
                      shrink: true,
                    }}
                    sx={{ background: '#FFFFFF' }}
                  />
                </Grid>
              </Grid>
            </Box> */}

            {/* Action Buttons */}
            {/* <Box sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 2,
              mt: 1, // Adjusted margin
              pt: 3,
              borderTop: '1px solid',
              borderColor: 'divider'
            }}>
              <Button
                onClick={() => navigate('/estimates')}
                variant="outlined"
              >
                Cancel
              </Button>
              <Button
                onClick={() => navigate('/estimates/new/detail')}
                variant="contained"
                disabled={
                  !shipmentData.origin ||
                  !shipmentData.destination ||
                  !shipmentData.arrivalDate
                }
              >
                View Details
              </Button>
            </Box> */}
          </Box>
        </div>
      </div>
    </div>
  );
};

export default CreateShipment; 
