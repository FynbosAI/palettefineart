import { createClient } from '@supabase/supabase-js';
import { Database } from '../src/lib/supabase/types';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.development.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@tate.org.uk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing required environment variables');
  console.log('Please ensure .env.development.local contains:');
  console.log('VITE_SUPABASE_URL=your_supabase_url');
  console.log('VITE_SUPABASE_ANON_KEY=your_anon_key');
  console.log('ADMIN_EMAIL=admin@tate.org.uk');
  console.log('ADMIN_PASSWORD=test123');
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

type ShipmentStatus = Database['public']['Tables']['shipments']['Row']['status'];
type TransportMethod = Database['public']['Tables']['shipments']['Row']['transport_method'];
type InsuranceType = Database['public']['Tables']['shipments']['Row']['insurance_type'];
type SecurityLevel = Database['public']['Tables']['shipments']['Row']['security_level'];
type CreateOrganizationWithAdminResult = {
  company_org_id: string;
  branch_org_id: string;
};

function isCreateOrganizationWithAdminResult(value: unknown): value is CreateOrganizationWithAdminResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.company_org_id === 'string' && typeof candidate.branch_org_id === 'string';
}

async function main() {
  console.log('🎨 Starting Palette Shipment Seeding Script...\n');

  // Step 1: Authenticate
  console.log('🔐 Authenticating as admin user...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  if (authError) {
    console.error('❌ Authentication failed:', authError.message);
    process.exit(1);
  }

  console.log('✅ Authenticated successfully');
  const userId = authData.user.id;

  // Step 2: Find or create Tate Modern organization
  console.log('\n🏛️ Finding/creating Tate Modern organization...');
  let { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, parent_org_id, branch_name')
    .eq('name', 'Tate Modern');

  let tateBranchOrgId: string | null = null;
  let tateCompanyOrgId: string | null = null;

  if (orgError) {
    console.error('❌ Error querying organizations:', orgError.message);
    process.exit(1);
  }

  if (orgs && orgs.length > 0) {
    const existingBranch = orgs.find((org) => org.parent_org_id !== null);
    const existingCompany = orgs.find((org) => org.parent_org_id === null);

    if (existingBranch) {
      tateBranchOrgId = existingBranch.id;
      tateCompanyOrgId = existingBranch.parent_org_id as string | null;
      console.log('✅ Found existing Tate Modern branch organization:', existingBranch.id);
    }

    if (!tateCompanyOrgId && existingCompany) {
      tateCompanyOrgId = existingCompany.id;
    }

    if (tateCompanyOrgId) {
      console.log('✅ Associated Tate Modern company organization:', tateCompanyOrgId);
    }
  } else {
    console.log('🆕 Creating new Tate Modern organization...');
    const { data: createResult, error: createError } = await supabase.rpc('create_organization_with_admin', {
      _org_name: 'Tate Modern',
      _user_id: userId
    });

    if (createError) {
      console.error('❌ Error creating organization:', createError.message);
      process.exit(1);
    }

    if (!isCreateOrganizationWithAdminResult(createResult)) {
      console.error('❌ Unexpected response creating organization:', createResult);
      process.exit(1);
    }

    tateBranchOrgId = createResult.branch_org_id;
    tateCompanyOrgId = createResult.company_org_id;
    console.log('✅ Created Tate Modern company organization:', tateCompanyOrgId);
    console.log('✅ Created Tate Modern primary branch organization:', tateBranchOrgId);
  }

  if (!tateBranchOrgId) {
    console.error('❌ Unable to resolve Tate Modern branch organization ID');
    process.exit(1);
  }

  // Step 3: Create sample locations
  console.log('\n📍 Creating sample locations...');
  const locations = [
    {
      id: '20000000-0000-0000-0000-000000000001',
      name: 'Tate Modern Loading Dock',
      address_full: 'Bankside, London SE1 9TG, United Kingdom',
      contact_name: 'James Mitchell',
      contact_phone: '+44 20 7887 8888',
      contact_email: 'logistics@tate.org.uk'
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      name: 'MoMA Shipping Department',
      address_full: '11 West 53rd Street, New York, NY 10019, USA',
      contact_name: 'Sarah Chen',
      contact_phone: '+1 212 708 9400',
      contact_email: 'shipping@moma.org'
    },
    {
      id: '20000000-0000-0000-0000-000000000003',
      name: 'Louvre Conservation Lab',
      address_full: 'Rue de Rivoli, 75001 Paris, France',
      contact_name: 'Marie Dubois',
      contact_phone: '+33 1 40 20 50 50',
      contact_email: 'conservation@louvre.fr'
    },
    {
      id: '20000000-0000-0000-0000-000000000004',
      name: 'Guggenheim Bilbao Receiving',
      address_full: 'Abandoibarra Etorb., 2, 48009 Bilbao, Bizkaia, Spain',
      contact_name: 'Carlos Rodriguez',
      contact_phone: '+34 944 35 90 80',
      contact_email: 'receiving@guggenheim-bilbao.eus'
    }
  ];

  for (const location of locations) {
    const { error } = await supabase
      .from('locations')
      .upsert(location, { onConflict: 'id' });
    
    if (error) {
      console.log(`⚠️ Location ${location.name} might already exist`);
    } else {
      console.log(`✅ Created/updated location: ${location.name}`);
    }
  }

  // Step 4: Create sample shipments with artworks and tracking
  console.log('\n🚛 Creating sample shipments...');
  
  const shipmentData = [
    {
      code: 'TM-2024-001',
      name: 'Contemporary British Art Exhibition',
      status: 'delivered' as ShipmentStatus,
      ship_date: '2024-01-15',
      estimated_arrival: '2024-01-18',
      transport_method: 'ground' as TransportMethod,
      insurance_type: 'comprehensive' as InsuranceType,
      security_level: 'high' as SecurityLevel,
      origin_id: locations[0].id, // Tate Modern
      destination_id: locations[1].id, // MoMA
      artworks: [
        {
          name: 'Urban Fragments',
          artist_name: 'David Hockney',
          year_completed: 2023,
          medium: 'Oil on canvas',
          dimensions: '152 x 203 cm',
          declared_value: 2500000,
          description: 'Large-scale contemporary landscape depicting urban London scenes'
        },
        {
          name: 'Digital Reflection',
          artist_name: 'Anish Kapoor',
          year_completed: 2022,
          medium: 'Stainless steel and pigment',
          dimensions: '300 x 200 x 150 cm',
          declared_value: 3200000,
          description: 'Interactive sculptural installation with mirror finish'
        }
      ],
      tracking_events: [
        { status: 'checking' as ShipmentStatus, location: 'Tate Modern', event_time: '2024-01-10T09:00:00Z', notes: 'Initial condition report completed' },
        { status: 'pending' as ShipmentStatus, location: 'Tate Modern', event_time: '2024-01-12T14:30:00Z', notes: 'Customs documentation prepared' },
        { status: 'in_transit' as ShipmentStatus, location: 'Heathrow Airport', event_time: '2024-01-15T11:00:00Z', notes: 'Departed London via BA flight' },
        { status: 'delivered' as ShipmentStatus, location: 'MoMA', event_time: '2024-01-18T16:45:00Z', notes: 'Successfully delivered and unpacked' }
      ]
    },
    {
      code: 'TM-2024-002',
      name: 'Impressionist Masters Exchange',
      status: 'in_transit' as ShipmentStatus,
      ship_date: '2024-12-20',
      estimated_arrival: '2024-12-23',
      transport_method: 'air' as TransportMethod,
      insurance_type: 'comprehensive' as InsuranceType,
      security_level: 'maximum' as SecurityLevel,
      origin_id: locations[2].id, // Louvre
      destination_id: locations[0].id, // Tate Modern
      artworks: [
        {
          name: 'Water Lilies Study',
          artist_name: 'Claude Monet',
          year_completed: 1919,
          medium: 'Oil on canvas',
          dimensions: '89 x 130 cm',
          declared_value: 15000000,
          description: 'Rare preparatory study for the famous Water Lilies series'
        }
      ],
      tracking_events: [
        { status: 'checking' as ShipmentStatus, location: 'Louvre', event_time: '2024-12-18T10:00:00Z', notes: 'Conservation team inspection completed' },
        { status: 'pending' as ShipmentStatus, location: 'Louvre', event_time: '2024-12-19T15:00:00Z', notes: 'Climate-controlled crating completed' },
        { status: 'in_transit' as ShipmentStatus, location: 'Charles de Gaulle Airport', event_time: '2024-12-20T13:30:00Z', notes: 'In transit to London' }
      ]
    },
    {
      code: 'TM-2024-003',
      name: 'Modern Sculpture Collection',
      status: 'pending' as ShipmentStatus,
      ship_date: '2024-12-28',
      estimated_arrival: '2025-01-02',
      transport_method: 'ground' as TransportMethod,
      insurance_type: 'basic' as InsuranceType,
      security_level: 'standard' as SecurityLevel,
      origin_id: locations[0].id, // Tate Modern
      destination_id: locations[3].id, // Guggenheim Bilbao
      artworks: [
        {
          name: 'Abstract Form VII',
          artist_name: 'Barbara Hepworth',
          year_completed: 1965,
          medium: 'Bronze',
          dimensions: '180 x 90 x 75 cm',
          declared_value: 1200000,
          description: 'Monumental bronze sculpture from the artist\'s mature period'
        },
        {
          name: 'Geometric Progression',
          artist_name: 'Anthony Caro',
          year_completed: 1971,
          medium: 'Painted steel',
          dimensions: '250 x 120 x 100 cm',
          declared_value: 800000,
          description: 'Large-scale minimalist steel construction'
        }
      ],
      tracking_events: [
        { status: 'checking' as ShipmentStatus, location: 'Tate Modern', event_time: '2024-12-22T11:00:00Z', notes: 'Structural integrity assessment in progress' }
      ]
    },
    {
      code: 'TM-2024-004',
      name: 'Photography Exhibition Loan',
      status: 'artwork_collected' as ShipmentStatus,
      ship_date: '2024-12-25',
      estimated_arrival: '2024-12-30',
      transport_method: 'air' as TransportMethod,
      insurance_type: 'comprehensive' as InsuranceType,
      security_level: 'high' as SecurityLevel,
      origin_id: locations[1].id, // MoMA
      destination_id: locations[0].id, // Tate Modern
      artworks: [
        {
          name: 'Migrant Mother',
          artist_name: 'Dorothea Lange',
          year_completed: 1936,
          medium: 'Gelatin silver print',
          dimensions: '28 x 22 cm',
          declared_value: 500000,
          description: 'Iconic Depression-era photograph, vintage print'
        },
        {
          name: 'Moonrise, Hernandez',
          artist_name: 'Ansel Adams',
          year_completed: 1941,
          medium: 'Gelatin silver print',
          dimensions: '40 x 50 cm',
          declared_value: 800000,
          description: 'Master print from Adams\' New Mexico series'
        }
      ],
      tracking_events: [
        { status: 'checking' as ShipmentStatus, location: 'MoMA', event_time: '2024-12-20T09:00:00Z', notes: 'Photography conservation review completed' },
        { status: 'pending' as ShipmentStatus, location: 'MoMA', event_time: '2024-12-22T14:00:00Z', notes: 'UV-protective packaging applied' },
        { status: 'artwork_collected' as ShipmentStatus, location: 'MoMA', event_time: '2024-12-25T10:30:00Z', notes: 'Courier collection completed' }
      ]
    },
    {
      code: 'TM-2024-005',
      name: 'Textile Arts Revival',
      status: 'security_check' as ShipmentStatus,
      ship_date: '2024-12-26',
      estimated_arrival: '2024-12-29',
      transport_method: 'ground' as TransportMethod,
      insurance_type: 'basic' as InsuranceType,
      security_level: 'standard' as SecurityLevel,
      origin_id: locations[3].id, // Guggenheim Bilbao
      destination_id: locations[0].id, // Tate Modern
      artworks: [
        {
          name: 'Woven Landscape #12',
          artist_name: 'Anni Albers',
          year_completed: 1954,
          medium: 'Cotton and silk',
          dimensions: '120 x 80 cm',
          declared_value: 300000,
          description: 'Bauhaus-influenced textile design with geometric patterns'
        }
      ],
      tracking_events: [
        { status: 'checking' as ShipmentStatus, location: 'Guggenheim Bilbao', event_time: '2024-12-23T12:00:00Z', notes: 'Textile condition assessment complete' },
        { status: 'pending' as ShipmentStatus, location: 'Guggenheim Bilbao', event_time: '2024-12-24T16:00:00Z', notes: 'Acid-free packaging prepared' },
        { status: 'in_transit' as ShipmentStatus, location: 'Border Control', event_time: '2024-12-26T08:00:00Z', notes: 'Crossed Spanish-French border' },
        { status: 'security_check' as ShipmentStatus, location: 'Dover Port', event_time: '2024-12-26T20:15:00Z', notes: 'UK customs inspection in progress' }
      ]
    },
    {
      code: 'TM-2024-006',
      name: 'Digital Media Installation',
      status: 'checking' as ShipmentStatus,
      ship_date: null,
      estimated_arrival: null,
      transport_method: null,
      insurance_type: 'comprehensive' as InsuranceType,
      security_level: 'high' as SecurityLevel,
      origin_id: locations[0].id, // Tate Modern
      destination_id: locations[1].id, // MoMA
      artworks: [
        {
          name: 'Data Streams',
          artist_name: 'Rafael Lozano-Hemmer',
          year_completed: 2023,
          medium: 'LED displays, computer hardware',
          dimensions: '400 x 300 x 50 cm',
          declared_value: 750000,
          description: 'Interactive digital installation responding to visitor movement'
        }
      ],
      tracking_events: [
        { status: 'checking' as ShipmentStatus, location: 'Tate Modern', event_time: '2024-12-26T14:00:00Z', notes: 'Technical equipment testing in progress' }
      ]
    }
  ];

  let createdCount = 0;
  let skippedCount = 0;

  for (const shipment of shipmentData) {
    // Check if shipment already exists
    const { data: existing } = await supabase
      .from('shipments')
      .select('id')
      .eq('code', shipment.code)
      .single();

    if (existing) {
      console.log(`⏭️ Skipping existing shipment: ${shipment.code}`);
      skippedCount++;
      continue;
    }

    // Create shipment
    const { data: newShipment, error: shipmentError } = await supabase
      .from('shipments')
      .insert({
        code: shipment.code,
        name: shipment.name,
        status: shipment.status,
        ship_date: shipment.ship_date,
        estimated_arrival: shipment.estimated_arrival,
        transport_method: shipment.transport_method,
        insurance_type: shipment.insurance_type,
        security_level: shipment.security_level,
        origin_id: shipment.origin_id,
        destination_id: shipment.destination_id,
        owner_org_id: tateBranchOrgId
      })
      .select()
      .single();

    if (shipmentError) {
      console.error(`❌ Error creating shipment ${shipment.code}:`, shipmentError.message);
      continue;
    }

    console.log(`✅ Created shipment: ${shipment.code}`);

    // Create artworks for this shipment
    for (const artwork of shipment.artworks) {
      const { error: artworkError } = await supabase
        .from('artworks')
        .insert({
          shipment_id: newShipment.id,
          ...artwork
        });

      if (artworkError) {
        console.error(`  ❌ Error creating artwork ${artwork.name}:`, artworkError.message);
      } else {
        console.log(`  🎨 Created artwork: ${artwork.name}`);
      }
    }

    // Create tracking events for this shipment
    for (const event of shipment.tracking_events) {
      const { error: trackingError } = await supabase
        .from('tracking_events')
        .insert({
          shipment_id: newShipment.id,
          ...event
        });

      if (trackingError) {
        console.error(`  ❌ Error creating tracking event:`, trackingError.message);
      } else {
        console.log(`  📍 Created tracking event: ${event.status} at ${event.location}`);
      }
    }

    createdCount++;
  }

  // Summary
  console.log('\n🎉 Seeding completed!');
  console.log(`✅ Created: ${createdCount} shipments`);
  console.log(`⏭️ Skipped: ${skippedCount} shipments (already existed)`);
  console.log('\n🌐 You can now log into the app as admin@tate.org.uk to view the shipments!');

  // Sign out
  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error('💥 Script failed:', error);
  process.exit(1);
}); 
