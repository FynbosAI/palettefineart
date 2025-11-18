import type { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { processImagesWithGemini } from '../src/geminiProcessor.js';
import { setCorsHeaders } from '../src/utils/cors.js';

// Type definitions for the artwork data
interface ArtworkData {
  id: string;
  artworkName: string;
  artistName: string;
  year: string;
  medium: string;
  dimensions: string;
  description: string;
  locationCreated: string;
  declaredValue: string;
  croppedImagePath: string | null;
  crating: string;
  specialRequirements: {
    lightSensitive: boolean;
    temperatureSensitive: boolean;
    humiditySensitive: boolean;
  };
}

// CORS handled via shared util; methods extended for uploads

// Configure multer – use in-memory storage to eliminate any chance
// of filesystem write problems (we’ll persist to /tmp later manually).
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    console.log('Multer fileFilter called:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    if (
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'application/octet-stream'
    ) {
      console.log('File accepted by filter');
      cb(null, true);
    } else {
      console.log('File rejected by filter');
      cb(new Error(`Only PNG or JPEG image files are allowed. Received: ${file.mimetype}`));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // Increased to 100MB limit
    files: 50, // Allow up to 50 files
    fieldSize: 100 * 1024 * 1024, // Increase field size limit
    fieldNameSize: 100, // Increase field name size limit
    headerPairs: 2000 // Increase header pairs limit
  }
});

// Helper function to save debug information
async function saveDebugInfo(debugInfo: any) {
  try {
    const uploadsDir = path.join('/tmp', 'uploads', 'debug');
    await fs.mkdir(uploadsDir, { recursive: true });
    
    const debugFile = path.join(uploadsDir, `debug_${Date.now()}.json`);
    await fs.writeFile(debugFile, JSON.stringify(debugInfo, null, 2));
    console.log('Debug info saved to:', debugFile);
  } catch (error) {
    console.error('Failed to save debug info:', error);
  }
}

// Helper function to save PNG files for debugging
async function savePngFiles(files: any[]) {
  try {
    const uploadsDir = path.join('/tmp', 'uploads', 'debug_pngs');
    await fs.mkdir(uploadsDir, { recursive: true });
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = `${Date.now()}_${i + 1}_${file.originalname || `page_${i + 1}.png`}`;
      const filepath = path.join(uploadsDir, filename);
      
      await fs.writeFile(filepath, file.buffer);
      console.log(`Debug PNG saved to: ${filepath}`);
    }
  } catch (error) {
    console.error('Failed to save debug PNG files:', error);
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  setCorsHeaders(res, req.headers.origin as string, 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Debug: log incoming headers and method
  console.log('[process-images] Incoming request', {
    method: req.method,
    url: req.url,
    headers: req.headers['content-type'],
    length: req.headers['content-length']
  });

  // -----------------------------------------------------------------
  // Extra low-level debug: track how many bytes actually arrive.
  // -----------------------------------------------------------------
  const expectedContentLength = Number(req.headers['content-length'] || 0);
  let receivedBytes = 0;
  (req as any).on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length;
  });
  (req as any).on('end', () => {
    console.log(`[process-images] Stream end – received ${receivedBytes}/${expectedContentLength} bytes`);
  });
  (req as any).on('close', () => {
    // The 'close' event fires if the client aborts the connection early.
    console.log(`[process-images] Connection closed early – received ${receivedBytes}/${expectedContentLength} bytes`);
  });

  const uploadHandler = upload.array('images');

  uploadHandler(req as any, res as any, async (err: any) => {
    if ((req as any).aborted) {
      console.warn('[process-images] Client aborted upload; skipping processing.');
      return;
    }
    if (err) {
      // Persist detailed debug information so we can inspect it later.
      await saveDebugInfo({
        at: 'multer_error',
        expectedContentLength,
        receivedBytes,
        headers: req.headers,
        error: {
          message: err.message,
          code: err.code,
          field: err.field,
          stack: err.stack,
        },
      }).catch(() => {/* ignore fs issues while responding */});

      console.error('Multer error:', {
        message: err.message,
        code: err.code,
        field: err.field,
        stack: err.stack,
        expectedContentLength,
        receivedBytes,
      });
      let errorMessage = 'Failed to process images';
      let errorDetails = 'Unknown error';

      if (err instanceof multer.MulterError) {
        errorDetails = `${err.code}: ${err.message}`;
        if (err.code === 'LIMIT_FILE_SIZE') {
          errorMessage = 'Uploaded file is too large';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          errorMessage = 'Too many files uploaded';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          errorMessage = `Unexpected file field: ${err.field}`;
        }
      } else if (err instanceof Error) {
        errorDetails = err.message;
        if (err.message.includes('File too large')) {
          errorMessage = 'Uploaded file is too large';
        } else if (err.message.includes('Too many files')) {
          errorMessage = 'Too many files uploaded';
        }
      }

      return res.status(500).json({
        error: errorMessage,
        details: errorDetails,
      });
    }

    try {
      console.log('Multer processing completed successfully.');
      const files = (req as any).files;
      const originalPdfName = (req as any).body?.originalPdfName;

      console.log('Multer parsing results:', {
        files: files?.length || 0,
        bodyKeys: Object.keys((req as any).body || {}),
        originalPdfName,
      });

      if (!files || files.length === 0) {
        console.error('No files received by multer.');
        return res.status(400).json({ error: 'No image files uploaded' });
      }

      console.log(`Processing ${files.length} images from: ${originalPdfName || 'uploaded files'}`);
      
      // The rest of the processing logic remains the same
      const tempDir = `/tmp/${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const outputFolder = path.join(tempDir, 'output');
      
      await fs.mkdir(tempDir, { recursive: true });
      await fs.mkdir(outputFolder, { recursive: true });
      
      // If using memoryStorage (no file.path), write buffers to tempDir first
      const imageAbsolutePaths: string[] = [];
      for (const f of files) {
        if (f.path) {
          imageAbsolutePaths.push(f.path);
        } else if (f.buffer) {
          // write buffer to file in tempDir
          const safeName = path.basename(f.originalname || 'upload');
          const targetPath = path.join(tempDir, safeName);
          await fs.writeFile(targetPath, f.buffer);
          imageAbsolutePaths.push(targetPath);
        }
      }

      console.log('Starting Gemini processing...');
      const geminiOut = await processImagesWithGemini(imageAbsolutePaths, outputFolder);

      const artworkData = await Promise.all(
        geminiOut.artworkData.map(async (artwork: ArtworkData) => {
          if (artwork.croppedImagePath) {
            try {
              const imageBuffer = await fs.readFile(artwork.croppedImagePath);
              const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
              return { ...artwork, croppedImageUrl: base64Image };
            } catch (readError) {
              console.warn(`Failed to read cropped image: ${artwork.croppedImagePath}`);
              return artwork;
            }
          }
          return artwork;
        })
      );

      res.json({
        success: true,
        message: `Successfully processed ${files.length} images`,
        shipmentDetails: geminiOut.shipmentDetails,
        artworkData: artworkData,
      });

      // Also clean up files we wrote (if any)
      for (const imgPath of imageAbsolutePaths) {
        await fs.rm(imgPath, { force: true }).catch(cleanupError => {
          console.warn(`Failed to clean up temp image file: ${imgPath}`, cleanupError);
        });
      }

      await fs.rm(tempDir, { recursive: true, force: true }).catch(cleanupError => {
        console.warn('Failed to clean up temporary files:', cleanupError);
      });

    } catch (error) {
      console.error('Error during image processing pipeline:', error);
      res.status(500).json({ 
        error: 'Failed to process images',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

// Vercel configuration to handle larger requests
export const config = {
  api: {
    bodyParser: false, // Let multer handle the body parsing
    responseLimit: false,
  },
  maxDuration: 300, // 5 minutes timeout
}; 
