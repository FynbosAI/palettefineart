// Shared types previously from legacy store
export interface GeminiArtwork {
  id: string;
  artworkName: string;
  artistName: string;
  year: string;
  medium: string;
  dimensions: string;
  description: string;
  locationCreated: string;
  declaredValue: string;
  currentCustomsStatus: string;
  croppedImageUrl: string | null;
  imageBlob?: Blob | null;         // Temporary blob storage for upload
  imageStorageUrl?: string | null;  // Final Supabase Storage URL
  imageStoragePath?: string | null; // Storage object path (server-side value)
  imagePreviewUrl?: string | null;  // Short-lived signed URL for immediate viewing
  imagePreviewExpiresAt?: number | null; // epoch ms when preview URL expires
  crating: string;
  specialRequirements: {
    lightSensitive: boolean;
    temperatureSensitive: boolean;
    humiditySensitive: boolean;
  };
}

export interface DeliverySpecificsDetails {
  deliveryRequirements: Set<string>;
  packingRequirements: string;
  accessAtDelivery: Set<string>;
  safetySecurityRequirements?: Set<string>;
  conditionCheckRequirements?: Set<string>;
}

export interface ExtractedData {
  originalFileName: string;
  artworks: number;
  error: string | null;
} 
