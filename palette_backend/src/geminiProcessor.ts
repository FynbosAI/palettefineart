import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import sharp from 'sharp';
// import { GoogleGenerativeAI } from '@google/generative-ai';
import { VertexAI } from '@google-cloud/vertexai';

// Types for returned data
interface ArtworkAIResult {
  artworkName: string;
  artistName: string;
  year: string;
  medium: string;
  dimensions: string;
  description: string;
  locationCreated: string;
  declaredValue: string;
  currentCustomsStatus: string;
  imageCoordinates?: number[]; // [ymin,xmin,ymax,xmax] in 0-1000 range
}

interface ShipmentAIResult {
  origin: string;
  destination: string;
  requiredByDate: string;
  artworks: ArtworkAIResult[];
  shipmentTitle?: string;      // NEW
  clientReference?: string;    // NEW
}

interface CsvRow {
  origin: string;
  destination: string;
  requiredByDate: string;
  artworkName: string;
  artistName: string;
  year: string;
  description: string;
  medium: string;
  dimensions: string;
  locationCreated: string;
  declaredValue: string;
  currentCustomsStatus: string;
  croppedImagePath: string | null;
}

interface ProcessedImageInfo {
  imagePath: string;            // Original page image
  croppedImages: string[];      // Cropped artwork image paths
  csvRows: Record<string, string>[]; // Rows for CSV output
}

interface BatchProcessingResult {
  imagePath: string;
  success: boolean;
  error?: string;
  csvRows?: CsvRow[];
  croppedPaths?: string[];
  shipmentDetails?: {
    origin: string;
    destination: string;
    arrivalDate: string;
    title?: string;          // NEW
    clientReference?: string; // NEW
  };
}

/**
 * Utility – converts an arbitrary string for inclusion in a CSV cell.
 */
function escapeCsvCell(value: string): string {
  const v = value ?? '';
  if (/[",\n]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

/**
 * Produce CSV text from an array of objects (all objects should have same keys).
 */
function objectsToCsv(rows: Record<string, string | null>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(escapeCsvCell).join(',');
  const lines = rows.map(r => headers.map(h => escapeCsvCell(r[h] ?? '')).join(','));
  return [headerLine, ...lines].join('\n');
}

/**
 * Generate Gemini prompt describing expected JSON schema (simplified from Dashboard).
 */
function buildSystemPrompt(): string {
  return `You will be provided with an image of a document page. Extract shipment and artwork information from this page.
Respond ONLY with a single JSON object that adheres to the following schema (JavaScript notation):
{
  origin: string,              // use empty string if not found
  destination: string,         // use empty string if not found
  requiredByDate: string,      // use empty string if not found
  shipmentTitle: string,       // NEW: Create a descriptive title (max 7 words) combining artwork types and destination (e.g., "3 Paintings to Paris", "Mixed Media Collection to Tokyo"). Empty string if not enough info.
  clientReference: string,     // NEW: Look for any reference number, quote number, job number, or similar identifier (usually formatted as REF#, Reference:, Quote#, Job#, or similar). Empty string if not found.
  artworks: Array<{
    artworkName: string,       // keep short; empty string if not found
    artistName: string,
    year: string,
    medium: string,
    dimensions: string,
    description: string,
    locationCreated: string, Hint: Look for "Country of Origin" text next to it; 
    declaredValue: string,
    currentCustomsStatus: string, // e.g., 'cleared', 'pending', 'in transit', empty string if not found
    imageCoordinates?: [number, number, number, number] // [ymin,xmin,ymax,xmax] on 0-1000 scale – omit if not available
  }>
}`;
}

/**
 * Process a set of page images through Gemini, crop detected artworks and build CSV output.
 * @param images Absolute paths to page PNGs (high-resolution, produced by pdfProcessor).
 * @param outputRoot Directory where cropped images & csv will be written.
 * @returns Object containing list of all cropped image paths and path to generated csv.
 */
export async function processImagesWithGemini(images: string[], outputRoot: string) {
  // const GOOGLE_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  // if (!GOOGLE_API_KEY) {
  //   throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set.');
  // }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set.');
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GCP_SERVICE_ACCOUNT_KEY) {
    const tmpPath = path.join(os.tmpdir(), 'vertex-service-account.json');
    await fs.writeFile(tmpPath, process.env.GCP_SERVICE_ACCOUNT_KEY, 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
  }

  const vertexAI = new VertexAI({
    project: projectId,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'europe-west4',
  });
  const geminiModel = vertexAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const cropsDir = path.join(outputRoot, 'cropped');
  await fs.mkdir(cropsDir, { recursive: true });

  const allCsvRows: CsvRow[] = [];
  const allCroppedPaths: string[] = [];

  // Process images in parallel batches of 5 for optimal throughput
  // Using Gemini 2.5 Flash with 1,000 RPM limit allows ~16 req/sec
  // Batch size of 5 gives us good parallelism while staying within rate limits
  const BATCH_SIZE = 5;
  const processingBatches = [];
  
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE);
    processingBatches.push(batch);
  }

  // Process each batch in parallel
  console.log(`Processing ${images.length} images in ${processingBatches.length} parallel batches of ${BATCH_SIZE}`);
  const startTime = Date.now();
  
  // Collect all batch results for later use
  const allBatchResults: BatchProcessingResult[] = [];
  
  for (let batchIndex = 0; batchIndex < processingBatches.length; batchIndex++) {
    const batch = processingBatches[batchIndex];
    console.log(`Processing batch ${batchIndex + 1}/${processingBatches.length} with ${batch.length} images`);
    const batchStartTime = Date.now();
    
    const batchPromises = batch.map(async (imagePath): Promise<BatchProcessingResult> => {
      const imageStartTime = Date.now();
      console.log(`Starting processing for ${path.basename(imagePath)}`);
      try {
        const baseImageBuffer = await fs.readFile(imagePath);
        const base64Data = baseImageBuffer.toString('base64');

        // Determine MIME type based on file extension
        const ext = path.extname(imagePath).toLowerCase();
        const mimeType = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png';

        const parts = [
          { inlineData: { mimeType, data: base64Data } },
          { text: 'Extract artwork details and coordinates from this page image.' },
        ];
        const systemPrompt = buildSystemPrompt();
        console.log(`[GEMINI_PROCESSOR] System prompt includes title and reference extraction`);
        console.log(`Sending ${path.basename(imagePath)} to Gemini API...`);
        const geminiStartTime = Date.now();
        const result = await geminiModel.generateContent({
          contents: [{ role: 'user', parts }],
          systemInstruction: { role: 'model', parts: [{ text: systemPrompt }] },
        });
        const geminiTime = Date.now() - geminiStartTime;
        console.log(`Gemini API responded for ${path.basename(imagePath)} in ${geminiTime}ms`);

        // const responseText = (result.response && typeof result.response.text === 'function')
        //   ? result.response.text()
        //   : result.response?.text;
        const candidate = result.response?.candidates?.[0];
        const responseText = candidate?.content?.parts
          ?.map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
          .join('')
          .trim();

        if (!responseText) {
          console.warn('Gemini returned empty response for', imagePath);
          return { imagePath, success: false, error: 'Empty response' };
        }

        let aiData: ShipmentAIResult;
        try {
          aiData = JSON.parse(responseText as string) as ShipmentAIResult;
          console.log(`[GEMINI_PROCESSOR] Extracted data for ${path.basename(imagePath)}:`, {
            title: aiData.shipmentTitle || 'No title extracted',
            clientReference: aiData.clientReference || 'No reference extracted',
            artworkCount: aiData.artworks?.length || 0
          });
        } catch (err) {
          console.error('Failed to parse Gemini JSON for', imagePath, err);
          return { imagePath, success: false, error: 'JSON parse error' };
        }

        // Obtain original image dimensions via sharp metadata
        const meta = await sharp(baseImageBuffer).metadata();
        const imgWidth = meta.width ?? 0;
        const imgHeight = meta.height ?? 0;
        if (!imgWidth || !imgHeight) {
          console.warn('Unable to determine image dimensions for', imagePath);
          return { imagePath, success: false, error: 'Invalid image dimensions' };
        }

        const csvRows: CsvRow[] = [];
        const croppedPaths: string[] = [];

        // Process each artwork
        if (Array.isArray(aiData.artworks)) {
          for (let i = 0; i < aiData.artworks.length; i++) {
            const art = aiData.artworks[i];
            let cropFullPath: string | null = null;
            if (art.imageCoordinates && art.imageCoordinates.length === 4) {
              const [ymin, xmin, ymax, xmax] = art.imageCoordinates;
              const left = Math.round((xmin / 1000) * imgWidth);
              const top = Math.round((ymin / 1000) * imgHeight);
              const width = Math.round(((xmax - xmin) / 1000) * imgWidth);
              const height = Math.round(((ymax - ymin) / 1000) * imgHeight);
              if (width > 0 && height > 0) {
                const cropFilename = `${path.basename(imagePath, '.png')}_art_${i + 1}.png`;
                cropFullPath = path.join(cropsDir, cropFilename);
    
                try {
                  await sharp(baseImageBuffer)
                    .extract({ left, top, width, height })
                    .toFile(cropFullPath);
                  croppedPaths.push(cropFullPath);
                } catch (cropErr) {
                  console.error('Error cropping image', cropErr);
                  cropFullPath = null; // Don't associate on failure
                }
              } else {
                  console.warn('Invalid crop dimensions for artwork', art.artworkName);
              }
            }

            // Build CSV row regardless of coordinates
            csvRows.push({
              origin: aiData.origin ?? '',
              destination: aiData.destination ?? '',
              requiredByDate: aiData.requiredByDate ?? '',
              artworkName: art.artworkName ?? '',
              artistName: art.artistName ?? '',
              year: art.year ?? '',
              description: art.description ?? '',
              medium: art.medium ?? '',
              dimensions: art.dimensions ?? '',
              locationCreated: art.locationCreated ?? '',
              declaredValue: art.declaredValue ?? '',
              currentCustomsStatus: art.currentCustomsStatus ?? '',
              croppedImagePath: cropFullPath, // Associate correct path
            });
          }
        }

        const imageTime = Date.now() - imageStartTime;
        console.log(`Completed processing ${path.basename(imagePath)} in ${imageTime}ms`);
        
        return { 
          imagePath, 
          success: true, 
          csvRows, 
          croppedPaths,
          shipmentDetails: {
            origin: aiData.origin ?? '',
            destination: aiData.destination ?? '',
            arrivalDate: aiData.requiredByDate ?? '',
            title: aiData.shipmentTitle ?? '',           // NEW
            clientReference: aiData.clientReference ?? '' // NEW
          }
        };
      } catch (err) {
        const imageTime = Date.now() - imageStartTime;
        console.error(`Failed processing ${path.basename(imagePath)} after ${imageTime}ms:`, err);
        return { imagePath, success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    });

    // Wait for the current batch to complete before processing the next batch
    console.log(`Waiting for ${batch.length} parallel Gemini API calls to complete...`);
    const batchResults = await Promise.allSettled(batchPromises);
    console.log(`All ${batch.length} API calls in batch completed`);
    
    // Process batch results
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        const { csvRows, croppedPaths } = result.value;
        allBatchResults.push(result.value); // Store the full result
        if (csvRows) {
          allCsvRows.push(...csvRows);
        }
        if (croppedPaths) {
          allCroppedPaths.push(...croppedPaths);
        }
      } else if (result.status === 'rejected') {
        console.error('Batch processing failed:', result.reason);
      } else if (result.status === 'fulfilled' && !result.value.success) {
        console.error('Image processing failed:', result.value.imagePath, result.value.error);
      }
    });

    // Add a small delay between batches to respect rate limits
    if (batchIndex < processingBatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const batchTime = Date.now() - batchStartTime;
    console.log(`Completed batch ${batchIndex + 1}/${processingBatches.length} in ${batchTime}ms`);
  }
  
  const totalTime = Date.now() - startTime;
  console.log(`Completed all ${images.length} images in ${totalTime}ms (${(totalTime / images.length).toFixed(2)}ms per image)`);
  console.log(`Processing rate: ${(images.length / (totalTime / 1000)).toFixed(2)} images/second`);

  // Write combined CSV
  const csvText = objectsToCsv(allCsvRows.map(row => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { croppedImagePath, ...csvRow } = row;
    return csvRow as Record<string, string>;
  }));
  const csvPath = path.join(outputRoot, 'gemini_output.csv');
  await fs.writeFile(csvPath, csvText, 'utf8');

  // Extract shipment details (assuming they are consistent across all rows)
  const firstValidResult = allCsvRows[0];
    
  // Get the first successful batch result for shipment details
  let extractedShipmentDetails = {
    origin: firstValidResult?.origin || 'Unknown Origin',
    destination: firstValidResult?.destination || 'Unknown Destination',
    arrivalDate: firstValidResult?.requiredByDate || new Date().toISOString().split('T')[0],
    title: '',
    clientReference: ''
  };

  // Find the first batch result that has shipment details with title/reference
  for (const batchResult of allBatchResults) {
    if (batchResult.shipmentDetails) {
      const details = batchResult.shipmentDetails;
      if (details.title || details.clientReference) {
        extractedShipmentDetails = {
          ...extractedShipmentDetails,
          title: details.title || '',
          clientReference: details.clientReference || ''
        };
        console.log('[GEMINI_PROCESSOR] Found shipment details with title/reference:', extractedShipmentDetails);
        break;
      }
    }
  }

  return { 
    shipmentDetails: extractedShipmentDetails,
    croppedImages: allCroppedPaths, 
    csvPath,
    artworkData: allCsvRows.map((row, index) => ({
      id: `artwork_${index + 1}`,
      artworkName: row.artworkName || '',
      artistName: row.artistName || '',
      year: row.year || '',
      medium: row.medium || '',
      dimensions: row.dimensions || '',
      description: row.description || '',
      locationCreated: row.locationCreated || '',
      declaredValue: row.declaredValue || '',
      currentCustomsStatus: row.currentCustomsStatus || '',
      croppedImagePath: row.croppedImagePath || null,
      crating: 'No Crate', // Default value
      specialRequirements: {
        lightSensitive: false,
        temperatureSensitive: false,
        humiditySensitive: false,
      }
    }))
  };
} 
