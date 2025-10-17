import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useNavigate } from 'react-router-dom';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import { IconButton, CircularProgress } from '@mui/material';
import { GeminiArtwork } from '../types/legacy';
import logger from '../lib/utils/logger';

import { API_BASE_URL } from '../config';
// Add imports for PDF to PNG conversion
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface UploadableFile {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'complete' | 'error' | 'processing';
}

// Helper function to render a PDF page to a PNG blob directly and resize it
async function renderPdfPageToPng(pdfPage: any) {
  const PIXEL_TARGET = 2048; // Target size for PNGs
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

// Note: dataURLtoBlob function removed - now using canvas.toBlob() directly for better reliability

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getFileExtension = (filename: string) => {
  return filename.split('.').pop()?.toLowerCase() || '';
}

const FileUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadableFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const uploadIntervals = useRef<Record<string, NodeJS.Timeout>>({});
  // Intervals used to simulate backend processing progress
  const processingIntervals = useRef<Record<string, NodeJS.Timeout>>({});
          // Update store with extracted data
  const setGeminiArtworkData = (data: GeminiArtwork[]) => {
    console.log('TODO: Handle gemini artwork data:', data);
  };
  const setShipmentDetails = (details: any) => {
    console.log('TODO: Handle shipment details:', details);
  };

  useEffect(() => {
    return () => {
      // Clear all intervals on unmount
      Object.values(uploadIntervals.current).forEach(clearInterval);
      Object.values(processingIntervals.current).forEach(clearInterval);
    };
  }, []);

  /**
   * Starts a simulated progress increment for a given file while the backend is processing.
   * It will smoothly animate the progress bar from `startValue` to `targetValue` over `expectedSeconds`.
   */
  const startSimulatedBackendProgress = (
    fileId: string,
    expectedSeconds: number,
    startValue: number,
    targetValue: number,
  ) => {
    // Clear any existing interval for this file
    if (processingIntervals.current[fileId]) {
      clearInterval(processingIntervals.current[fileId]);
      delete processingIntervals.current[fileId];
    }

    const UPDATE_INTERVAL_MS = 500;
    const totalSteps = Math.max(1, Math.round((expectedSeconds * 1000) / UPDATE_INTERVAL_MS));
    const increment = (targetValue - startValue) / totalSteps;

    let current = startValue;

    // Ensure initial value is set
    setUploadingFiles(prev => prev.map(f => f.id === fileId ? { ...f, progress: current } : f));

    processingIntervals.current[fileId] = setInterval(() => {
      current = Math.min(targetValue, current + increment);
      setUploadingFiles(prev => prev.map(f => f.id === fileId ? { ...f, progress: current } : f));

      if (current >= targetValue && processingIntervals.current[fileId]) {
        clearInterval(processingIntervals.current[fileId]);
        delete processingIntervals.current[fileId];
      }
    }, UPDATE_INTERVAL_MS);
  };

  const stopSimulatedBackendProgress = (fileId: string) => {
    if (processingIntervals.current[fileId]) {
      clearInterval(processingIntervals.current[fileId]);
      delete processingIntervals.current[fileId];
    }
  };

  const handleCreateShipment = async () => {
    // Navigate to the create shipment page
    navigate('/estimates/new');
  };

  const handleProcessFiles = async () => {
    // Only process PDF files
    const pdfFiles = uploadingFiles.filter(f => f.status === 'complete' && getFileExtension(f.file.name) === 'pdf');
    
    if (pdfFiles.length === 0) {
      alert('Please upload at least one PDF file to process.');
      return;
    }

    setIsProcessing(true);
    
    // Reset progress to 0 and mark files as processing
    setUploadingFiles(prev => 
      prev.map(f => 
        pdfFiles.some(pdf => pdf.id === f.id) 
          ? { ...f, status: 'processing' as const, progress: 0 }
          : f
      )
    );

    try {
      // Process each PDF file
      const allArtworkData: GeminiArtwork[] = [];
      let shipmentDetails = null;

      for (const uploadableFile of pdfFiles) {
        try {
          // Convert PDF to PNG images
          console.log('Processing PDF:', uploadableFile.file.name);
          
          // Check if worker is properly set up
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            console.error('PDF.js worker not found. Worker source:', pdfjsLib.GlobalWorkerOptions.workerSrc);
            throw new Error('PDF.js worker not properly configured');
          }
          
          console.log('Loading PDF document...');
          let arrayBuffer;
          try {
            arrayBuffer = await uploadableFile.file.arrayBuffer();
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
          
          const pageImages: { blob: Blob; filename: string }[] = [];
          
          // Process each page with improved error handling
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            console.log(`Processing page ${pageNum} of ${pdf.numPages}...`);
            
            try {
              const page = await pdf.getPage(pageNum);
              const { blob } = await renderPdfPageToPng(page);
              
              // Validate blob before adding to the collection
              const filename = `${uploadableFile.file.name}_page_${pageNum}.png`;
              
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

          // Send PNG images to backend
          console.log(`Uploading ${pageImages.length} PNG images from ${uploadableFile.file.name}`);
          
          // Validate all blobs before adding to FormData
          let totalSize = 0;
          let hasInvalidBlobs = false;
          
                      // Enhanced validation with async blob testing
            for (let i = 0; i < pageImages.length; i++) {
              const pngImage = pageImages[i]; // variable reused for minimal change
              logger.debug('FileUpload', `Validating image ${i + 1} - Size: ${pngImage.blob.size} bytes, Type: ${pngImage.blob.type}`);
              
              if (pngImage.blob.size === 0) {
                logger.error('FileUpload', `Image ${i + 1} has zero size`);
                hasInvalidBlobs = true;
              }
              
              // Test blob readability again before FormData construction
              try {
                const testBuffer = await pngImage.blob.arrayBuffer();
                if (testBuffer.byteLength !== pngImage.blob.size) {
                  console.error(`ERROR: Image ${pngImage.filename} has size mismatch`);
                  hasInvalidBlobs = true;
                }
                
                // Basic PNG signature check (0x89504E47)
                const pngSig = new Uint8Array(testBuffer.slice(0, 4));
                if (!(pngSig[0] === 0x89 && pngSig[1] === 0x50 && pngSig[2] === 0x4E && pngSig[3] === 0x47)) {
                  console.error(`ERROR: Image ${pngImage.filename} has invalid PNG signature`);
                  hasInvalidBlobs = true;
                }
                
              } catch (testError) {
                console.error(`ERROR: Image ${pngImage.filename} is not readable:`, testError);
                hasInvalidBlobs = true;
              }
              
              totalSize += pngImage.blob.size;
            }
          
          console.log(`Total FormData size will be approximately: ${totalSize} bytes`);
          
          if (hasInvalidBlobs) {
            throw new Error('Some PNG images are invalid or corrupted - cannot proceed with upload');
          }
          
          if (totalSize > 50 * 1024 * 1024) { // 50MB total limit
            throw new Error(`Total upload size too large: ${totalSize} bytes (max 50MB)`);
          }
          
          // Create FormData with error handling
          const formData = new FormData();
          
          try {
            // Add all PNG images from this PDF
            for (let i = 0; i < pageImages.length; i++) {
              const pngImage = pageImages[i];
              console.log(`Adding image ${i + 1} to FormData: ${pngImage.filename}, size: ${pngImage.blob.size} bytes`);
              
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
            formData.append('originalPdfName', uploadableFile.file.name);

            // Begin simulated backend processing progress after payload prepared
            const numBatches = Math.ceil(pageImages.length / 5);
            const expectedBackendSeconds = numBatches * 25; // Rough estimate
            startSimulatedBackendProgress(
              uploadableFile.id,
              expectedBackendSeconds,
              5,
              95,
            );
            
            // Validate FormData construction
            const formDataEntries = Array.from(formData.entries());
            console.log(`FormData created with ${formDataEntries.length} entries`);
            
            // Test FormData by checking all entries
            let totalFormDataSize = 0;
            for (const [key, value] of formDataEntries) {
              console.log(`FormData entry: ${key}, type: ${typeof value}`);
              if (value instanceof File) {
                console.log(`  - File: ${value.name}, size: ${value.size}, type: ${value.type}`);
                totalFormDataSize += value.size;
              } else {
                console.log(`  - Value: ${value}`);
              }
            }
            
            console.log(`Total FormData payload size: ${totalFormDataSize} bytes`);
            
            // Test FormData by checking first entry
            if (formDataEntries.length > 0) {
              const firstEntry = formDataEntries[0];
              if (firstEntry[0] === 'images' && firstEntry[1] instanceof File) {
                console.log('FormData validation passed - first image entry is valid');
              } else {
                throw new Error('FormData validation failed - first entry is not a valid image file');
              }
            }
            
            // Additional FormData integrity test
            try {
              // Test that FormData can be iterated properly
              const entries = Array.from(formData.entries());
              console.log(`FormData integrity test: checking ${entries.length} entries`);
              
              for (let i = 0; i < entries.length; i++) {
                const [key, value] = entries[i];
                if (value instanceof File) {
                  // Test that each file can be read
                  const slice = value.slice(0, 100);
                  if (slice.size === 0) {
                    throw new Error(`File ${value.name} appears to be empty or corrupted`);
                  }
                }
              }
              console.log(`FormData integrity test passed: ${entries.length} entries validated successfully`);
            } catch (integrityError) {
              console.error('FormData integrity test failed:', integrityError);
              throw new Error(`FormData is corrupted: ${integrityError instanceof Error ? integrityError.message : 'Unknown error'}`);
            }
            
          } catch (formDataError) {
            console.error('FormData construction failed:', formDataError);
            throw new Error(`Failed to create FormData: ${formDataError instanceof Error ? formDataError.message : 'Unknown error'}`);
          }

          console.log('Sending request to backend...');
          console.log('Request URL:', `${API_BASE_URL}/api/process-images`);
          console.log('Request method: POST');
          console.log('FormData ready for transmission');
          
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
              
              // Add more detailed logging before fetch
              console.log('Fetch request details:', {
                url: `${API_BASE_URL}/api/process-images`,
                method: 'POST',
                hasFormData: formData instanceof FormData,
                formDataEntries: Array.from(formData.entries()).length,
                abortSignal: 'configured'
              });
              
              // DEBUG — dump the complete multipart body (truncated) -------------------
              if (process.env.NODE_ENV !== 'production') {
                const rawBody = await new Response(formData).arrayBuffer();
                const rawText = new TextDecoder().decode(rawBody);
                console.log('---- MULTIPART START ----');
                console.log(rawText.slice(0, 1000));            // first 1 KB
                console.log('…');
                console.log(rawText.slice(-1000));              // last 1 KB – should end with --boundary--\r\n
                console.log(`Total bytes: ${rawBody.byteLength}`);
                console.log('---- MULTIPART END ----');
              }
              
              try {
                response = await fetch(`${API_BASE_URL}/api/process-images`, {
                  method: 'POST',
                  body: formData,
                  // Don't set Content-Type header - let the browser set it with boundary
                  headers: {
                    // Explicitly avoid setting Content-Type to let browser handle multipart boundary
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                  }
                });
              } finally {
                clearTimeout(timeoutId);
              }

              if (timedOut) {
                throw new Error('Upload request exceeded the timeout but still completed.');
              }
              
              console.log('Response received:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                ok: response.ok,
                url: response.url
              });
              
              // If we get a response, break out of retry loop
              break;
              
            } catch (fetchError) {
              lastError = fetchError instanceof Error ? fetchError : new Error('Unknown fetch error');
              console.error(`Upload attempt ${attempt} failed:`, lastError);
              console.error('Fetch error details:', {
                name: lastError.name,
                message: lastError.message,
                stack: lastError.stack
              });
              
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
            // Error – stop simulated progress for this file
            stopSimulatedBackendProgress(uploadableFile.id);

            console.error(`Backend error for ${uploadableFile.file.name}:`, {
              status: response!.status,
              statusText: response!.statusText,
              errorText: responseText || 'Empty response body'
            });
            throw new Error(`Failed to process ${uploadableFile.file.name}: ${response!.status} ${response!.statusText} - ${responseText || 'Empty response body'}`);
          }

          if (!responseText || responseText.trim().length === 0) {
            throw new Error('Backend returned an empty response.');
          }

          // Backend responded – stop the simulated progress and push progress close to completion
          stopSimulatedBackendProgress(uploadableFile.id);
          setUploadingFiles(prev => prev.map(f => f.id === uploadableFile.id ? { ...f, progress: 98 } : f));

          console.log('Backend response received, parsing JSON...');
          let result;
          try {
            result = JSON.parse(responseText);
            console.log('Backend result:', result);
          } catch (jsonError) {
            console.error('Failed to parse JSON response:', jsonError);
            throw new Error(`Backend returned invalid JSON response: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`);
          }
          
          if (result.success) {
            // Add artwork data from this PDF
            if (result.artworkData) {
              allArtworkData.push(...result.artworkData);
            }
            
            // Store shipment details (from the first PDF that has them)
            if (result.shipmentDetails && !shipmentDetails) {
              shipmentDetails = result.shipmentDetails;
            }
          }
          
        } catch (pdfError) {
          console.error(`Error processing PDF ${uploadableFile.file.name}:`, pdfError);
          console.error('PDF processing error details:', {
            name: pdfError instanceof Error ? pdfError.name : 'Unknown',
            message: pdfError instanceof Error ? pdfError.message : 'Unknown error',
            stack: pdfError instanceof Error ? pdfError.stack : undefined
          });
          throw new Error(`Failed to process PDF ${uploadableFile.file.name}: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`);
        }
      }

      // Update store with processed data
      setGeminiArtworkData(allArtworkData);
      if (shipmentDetails) {
        setShipmentDetails(shipmentDetails);
      }

      // Update file status to complete and progress to 100
      setUploadingFiles(prev => 
        prev.map(f => 
          pdfFiles.some(pdf => pdf.id === f.id) 
            ? { ...f, status: 'complete' as const, progress: 100 }
            : f
        )
      );

      console.log('Processing complete:', { 
        artworks: allArtworkData.length, 
        shipmentDetails 
      });

    } catch (error) {
      console.error('Error processing files:', error);
      alert(`Error processing files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Update file status to error
      setUploadingFiles(prev => 
        prev.map(f => 
          pdfFiles.some(pdf => pdf.id === f.id) 
            ? { ...f, status: 'error' as const }
            : f
        )
      );
    } finally {
      // Ensure any running simulated backend intervals are cleared
      pdfFiles.forEach(f => stopSimulatedBackendProgress(f.id));
      setIsProcessing(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFiles = (files: FileList) => {
    if (files && files.length > 0) {
      const newFiles: UploadableFile[] = Array.from(files).map((file) => ({
        id: `${file.name}-${file.lastModified}-${file.size}`,
        file,
        progress: 0,
        status: 'uploading',
      }));

      setUploadingFiles((prevFiles) => [...prevFiles, ...newFiles]);

      newFiles.forEach((newFile) => {
        const interval = setInterval(() => {
          setUploadingFiles((prev) =>
            prev.map((f) => {
              if (f.id === newFile.id && f.status === 'uploading') {
                const newProgress = f.progress + 10;
                if (newProgress >= 100) {
                  clearInterval(interval);
                  delete uploadIntervals.current[newFile.id];
                  return { ...f, progress: 100, status: 'complete' };
                }
                return { ...f, progress: newProgress };
              }
              return f;
            })
          );
        }, 200);
        uploadIntervals.current[newFile.id] = interval;
      });
    }
  };

  const handleRemoveFile = (fileId: string) => {
    if (uploadIntervals.current[fileId]) {
      clearInterval(uploadIntervals.current[fileId]);
      delete uploadIntervals.current[fileId];
    }
    setUploadingFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      handleFiles(files);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFiles(files);
      e.dataTransfer.clearData();
    }
  };

  return (
    <div
      className="file-upload-container"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        multiple
        accept=".pdf,.xls,.xlsx,.csv"
      />
      <div className="file-upload-header">
        <h2>Upload shipment details</h2>
        <p>Upload a file with your shipment details to create a new shipment.</p>
      </div>
      {uploadingFiles.length === 0 ? (
        <div
          className="file-drop-zone"
          style={
            dragging
              ? {
                  backgroundColor: '#f0fafa',
                  border: '1px dashed #8412ff',
                }
              : {}
          }
        >
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
                <span className="upload-link" onClick={handleUploadClick}>
                  Click to upload
                </span>{' '}
                or drag and drop
              </div>
              <div className="file-drop-zone-supporting-text">
                XLS, CSV, or other supported file types
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="upload-progress-list">
          {uploadingFiles.map((uploadableFile) => {
            const ext = getFileExtension(uploadableFile.file.name);
            const isComplete = uploadableFile.status === 'complete';
            const isProcessing = uploadableFile.status === 'processing';
            const hasError = uploadableFile.status === 'error';

            return (
              <div key={uploadableFile.id} className="upload-progress-item">
                <div className="item-content">
                  <div className="file-icon-visual">
                    <div className={`file-icon-tag ${ext}`}>{ext}</div>
                  </div>
                  <div className="file-info">
                    <div className="file-name">{uploadableFile.file.name}</div>
                    <div className="upload-status-details">
                      <span className="size-info">
                        {isComplete || isProcessing || hasError
                          ? formatBytes(uploadableFile.file.size)
                          : `${formatBytes(
                              (uploadableFile.file.size *
                                uploadableFile.progress) /
                                100
                            )} of ${formatBytes(uploadableFile.file.size)}`}
                      </span>
                      <span className="status-text">
                        {isProcessing ? (
                          <>
                            <CircularProgress
                              size={16}
                              sx={{ color: '#8412ff' }}
                            />{' '}
                            Processing...
                          </>
                        ) : hasError ? (
                          <>
                            <DeleteIcon
                              sx={{ color: '#ff4444', fontSize: 16 }}
                            />{' '}
                            Error
                          </>
                        ) : isComplete ? (
                          <>
                            <CheckCircleIcon
                              sx={{ color: '#0B8A74', fontSize: 16 }}
                            />{' '}
                            Complete
                          </>
                        ) : (
                          <>
                            <UploadFileIcon
                              sx={{ color: '#58517E', fontSize: 16 }}
                            />{' '}
                            Uploading...
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="delete-button-container">
                    <IconButton
                      onClick={() => handleRemoveFile(uploadableFile.id)}
                      size="small"
                      disabled={isProcessing}
                    >
                      <DeleteIcon sx={{ color: '#58517E' }} />
                    </IconButton>
                  </div>
                </div>
                <div className="progress-row">
                  <div className="progress-bar-background">
                    <div
                      className={`progress-bar-foreground ${
                        isComplete ? 'complete' : ''
                      }`}
                      style={{ width: `${uploadableFile.progress}%` }}
                    ></div>
                  </div>
                  <span className="progress-percent-text">
                    {Math.round(uploadableFile.progress)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="file-upload-actions"
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '1rem',
          marginTop: '1rem',
        }}
      >
        <Button
          variant="contained"
          startIcon={
            uploadingFiles.length > 0 
              ? (isProcessing ? <CircularProgress size={20} color="inherit" /> : undefined)
              : <AddIcon />
          }
          onClick={uploadingFiles.length > 0 ? handleProcessFiles : handleCreateShipment}
          disabled={isProcessing || (uploadingFiles.length > 0 && !uploadingFiles.some(f => f.status === 'complete'))}
          sx={{
            background: '#8412ff',
            color: '#ead9f9',
            borderRadius: '10px',
            textTransform: 'none',
            fontSize: '16px',
            fontWeight: 500,
            padding: '0 28px',
            height: '44px',
            '&:hover': {
              background: '#730add',
            },
            '&:disabled': {
              background: '#ccc',
              color: '#666',
            },
          }}
        >
          {uploadingFiles.length > 0 
            ? (isProcessing ? 'Processing...' : 'Process Files')
            : 'Create Shipment'
          }
        </Button>
        <Button
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={handleUploadClick}
          disabled={isProcessing}
          sx={{
            borderColor: '#8412ff',
            color: '#8412ff',
            borderRadius: '10px',
            textTransform: 'none',
            fontSize: '16px',
            fontWeight: 500,
            padding: '0 28px',
            height: '44px',
            '&:hover': {
              borderColor: '#730add',
              background: 'rgba(132, 18, 255, 0.04)',
            },
            '&:disabled': {
              borderColor: '#ccc',
              color: '#666',
            },
          }}
        >
          {uploadingFiles.length > 0 ? 'Upload more' : 'Upload Shipment'}
        </Button>
      </div>
    </div>
  );
};

export default FileUpload; 
