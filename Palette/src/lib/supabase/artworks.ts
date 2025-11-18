import { ShipmentService } from './shipments';
import { LocationService } from './locations';
import { Database } from './types';
type ShipmentInsert = Database['public']['Tables']['shipments']['Insert'];
type ArtworkInsert = Database['public']['Tables']['artworks']['Insert'];

export interface ProcessedArtwork {
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
  weight: string;
  crating: string;
  specialRequirements: {
    lightSensitive: boolean;
    temperatureSensitive: boolean;
    humiditySensitive: boolean;
  };
}

export interface ShipmentDetails {
  origin: string;
  destination: string;
  arrivalDate: string;
}

export class ArtworkService {
  // Create a complete shipment with locations and artworks
  static async createShipmentWithArtworks(
    shipmentData: {
      name: string;
      code: string;
      origin: string;
      destination: string;
      estimatedArrival?: string;
      ownerOrgId: string;
    },
    artworks: ProcessedArtwork[]
  ) {
    try {
      // 1. Create or find origin location
      const originLocation = await LocationService.findOrCreateLocation(
        shipmentData.origin,
        shipmentData.origin,
        shipmentData.ownerOrgId
      );

      // 2. Create or find destination location
      const destinationLocation = await LocationService.findOrCreateLocation(
        shipmentData.destination,
        shipmentData.destination,
        shipmentData.ownerOrgId
      );

      // 3. Create the shipment
      const shipmentInsert: ShipmentInsert = {
        code: shipmentData.code,
        name: shipmentData.name,
        status: 'checking',
        estimated_arrival: shipmentData.estimatedArrival || null,
        origin_id: originLocation.id,
        destination_id: destinationLocation.id,
        owner_org_id: shipmentData.ownerOrgId,
      };

      const { data: shipment, error: shipmentError } = await ShipmentService.createShipment(shipmentInsert);

      if (shipmentError || !shipment) {
        throw new Error(`Failed to create shipment: ${shipmentError?.message}`);
      }

      // 4. Create all artworks for this shipment
      const createdArtworks = [];
      for (const artwork of artworks) {
        const artworkData = {
          name: artwork.artworkName,
          artist_name: artwork.artistName || null,
          year_completed: artwork.year ? parseInt(artwork.year) : null,
          medium: artwork.medium || null,
          dimensions: artwork.dimensions || null,
          declared_value: artwork.declaredValue ? parseFloat(artwork.declaredValue.replace(/[^0-9.-]+/g, '')) : null,
          description: artwork.description || null,
          special_requirements: artwork.specialRequirements || null,
        };
        
        const { data: createdArtwork, error: artworkError } = await ShipmentService.addArtwork(
          shipment.id,
          artworkData
        );

        if (artworkError) {
          console.error(`Failed to create artwork ${artwork.artworkName}:`, artworkError);
          // Continue with other artworks even if one fails
        } else if (createdArtwork) {
          createdArtworks.push(createdArtwork);
        }
      }

      // 5. Add initial tracking event
      await ShipmentService.addTrackingEvent(shipment.id, {
        status: 'checking',
        location: shipmentData.origin,
        notes: 'Shipment created and artwork details processed'
      });

      return {
        shipment,
        artworks: createdArtworks,
        error: null
      };

    } catch (error) {
      console.error('Error creating shipment with artworks:', error);
      return {
        shipment: null,
        artworks: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Generate unique shipment code
  static generateShipmentCode(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `SH-${timestamp}-${random}`.toUpperCase();
  }

  // Parse declared value from string to number
  static parseValue(valueString: string): number | null {
    if (!valueString) return null;
    
    // Remove currency symbols and commas
    const cleaned = valueString.replace(/[^0-9.-]+/g, '');
    const parsed = parseFloat(cleaned);
    
    return isNaN(parsed) ? null : parsed;
  }
} 
