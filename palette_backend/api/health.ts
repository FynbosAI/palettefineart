import { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../src/utils/cors.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Palette Backend API is running'
  });
} 
