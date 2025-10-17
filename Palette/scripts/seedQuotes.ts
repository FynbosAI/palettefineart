import { createClient } from '@supabase/supabase-js';
import { Database } from '../src/lib/supabase/types';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.development.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

type QuoteType = Database['public']['Enums']['quote_type'];
type QuoteStatus = Database['public']['Enums']['quote_status'];
type BidStatus = Database['public']['Enums']['bid_status'];
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
  console.log('💰 Starting Palette Quotes Seeding Script...\n');

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

  // Step 3: Ensure sample locations exist (reuse from seedShipments)
  console.log('\n📍 Ensuring sample locations exist...');
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
    },
    {
      id: '20000000-0000-0000-0000-000000000005',
      name: 'National Gallery Storage',
      address_full: 'Trafalgar Square, London WC2N 5DN, United Kingdom',
      contact_name: 'Elizabeth Turner',
      contact_phone: '+44 20 7747 2885',
      contact_email: 'storage@nationalgallery.org.uk'
    },
    {
      id: '20000000-0000-0000-0000-000000000006',
      name: 'Uffizi Gallery Logistics',
      address_full: 'Piazzale degli Uffizi, 6, 50122 Firenze FI, Italy',
      contact_name: 'Marco Rossi',
      contact_phone: '+39 055 294883',
      contact_email: 'logistics@uffizi.it'
    }
  ];

  for (const location of locations) {
    const { error } = await supabase
      .from('locations')
      .upsert(location, { onConflict: 'id' });
    
    if (error && !error.message.includes('duplicate')) {
      console.log(`⚠️ Location ${location.name} might already exist`);
    } else {
      console.log(`✅ Ensured location exists: ${location.name}`);
    }
  }

  // Step 4: Create/ensure logistics partners exist
  console.log('\n🚚 Creating/ensuring logistics partners exist...');
  const logisticsPartners = [
    {
      id: '30000000-0000-0000-0000-000000000001',
      name: 'Crown Fine Art',
      abbreviation: 'CFA',
      brand_color: '#8412ff',
      contact_email: 'contact@crownfineart.com',
      contact_phone: '+44 20 7793 4200',
      contact_name: 'Richard Crown',
      website: 'https://crownfineart.com',
      specialties: ['fine_art', 'sculptures', 'paintings'],
      regions: ['europe', 'north_america'],
      active: true
    },
    {
      id: '30000000-0000-0000-0000-000000000002',
      name: 'DHL Fine Art',
      abbreviation: 'DHL',
      brand_color: '#ff0000',
      contact_email: 'fineart@dhl.com',
      contact_phone: '+49 228 182 0',
      contact_name: 'Klaus Weber',
      website: 'https://dhl.com/fineart',
      specialties: ['fine_art', 'international', 'express'],
      regions: ['global'],
      active: true
    },
    {
      id: '30000000-0000-0000-0000-000000000003',
      name: 'Gander & White',
      abbreviation: 'G&W',
      brand_color: '#0dab71',
      contact_email: 'info@ganderwhite.com',
      contact_phone: '+44 20 7354 4700',
      contact_name: 'Amanda White',
      website: 'https://ganderwhite.com',
      specialties: ['fine_art', 'antiques', 'conservation'],
      regions: ['europe', 'asia'],
      active: true
    },
    {
      id: '30000000-0000-0000-0000-000000000004',
      name: 'UPS Capital',
      abbreviation: 'UPS',
      brand_color: '#E9932D',
      contact_email: 'capital@ups.com',
      contact_phone: '+1 404 828 6000',
      contact_name: 'Michael Brown',
      website: 'https://upscapital.com',
      specialties: ['logistics', 'insurance', 'tracking'],
      regions: ['north_america', 'europe'],
      active: true
    },
    {
      id: '30000000-0000-0000-0000-000000000005',
      name: 'FedEx Art Services',
      abbreviation: 'FDX',
      brand_color: '#2378da',
      contact_email: 'art@fedex.com',
      contact_phone: '+1 901 818 7500',
      contact_name: 'Jennifer Davis',
      website: 'https://fedex.com/art',
      specialties: ['fine_art', 'express', 'customs'],
      regions: ['global'],
      active: true
    },
    {
      id: '30000000-0000-0000-0000-000000000006',
      name: 'Martinspeed',
      abbreviation: 'MSP',
      brand_color: '#1a365d',
      contact_email: 'enquiries@martinspeed.com',
      contact_phone: '+44 20 8861 4411',
      contact_name: 'David Martin',
      website: 'https://martinspeed.com',
      specialties: ['fine_art', 'museums', 'exhibitions'],
      regions: ['europe', 'north_america'],
      active: true
    }
  ];

  for (const partner of logisticsPartners) {
    const { error } = await supabase
      .from('logistics_partners')
      .upsert(partner, { onConflict: 'id' });
    
    if (error && !error.message.includes('duplicate')) {
      console.log(`⚠️ Logistics partner ${partner.name} might already exist`);
    } else {
      console.log(`✅ Ensured logistics partner exists: ${partner.name}`);
    }
  }

  // Step 5: Get some existing shipments to link to quotes (optional)
  console.log('\n📦 Finding existing shipments to link with quotes...');
  const { data: existingShipments } = await supabase
    .from('shipments')
    .select('id, code, name')
    .eq('owner_org_id', tateBranchOrgId)
    .limit(3);

  console.log(`✅ Found ${existingShipments?.length || 0} existing shipments to link`);

  // Step 6: Create sample quotes with varying statuses and types
  console.log('\n💰 Creating sample quotes...');
  
  const quotesData = [
    {
      title: 'Impressionist Masters Transport Request',
      type: 'requested' as QuoteType,
      status: 'active' as QuoteStatus,
      route: 'Paris → London',
      origin_id: locations[2].id, // Louvre
      destination_id: locations[0].id, // Tate Modern
      target_date: '2025-02-15',
      target_date_start: '2025-02-15',
      target_date_end: '2025-02-15',
      value: 15000000,
      description: 'Transport of three Monet paintings and two Renoir works for the "French Impressionism Today" exhibition. Requires climate-controlled transport, comprehensive insurance, and white-glove handling.',
      requirements: {
        climate_controlled: true,
        security_level: 'maximum',
        insurance_required: true,
        special_handling: ['white_glove', 'art_handlers'],
        customs_support: true
      },
      shipment_id: existingShipments?.[0]?.id || null,
      bids: [
        {
          logistics_partner_id: logisticsPartners[0].id, // Crown Fine Art
          amount: 4500,
          status: 'pending' as BidStatus,
          notes: 'Full white-glove service with certified art handlers. Climate-controlled vehicle throughout journey.',
          estimated_transit_time: '2 days',
          insurance_included: true,
          special_services: ['white_glove', 'climate_control', 'art_handlers'],
          valid_until: '2025-01-31T23:59:59Z'
        },
        {
          logistics_partner_id: logisticsPartners[1].id, // DHL Fine Art
          amount: 5200,
          status: 'pending' as BidStatus,
          notes: 'Express international service with full tracking and insurance coverage.',
          estimated_transit_time: '1 day',
          insurance_included: true,
          special_services: ['express', 'tracking', 'insurance'],
          valid_until: '2025-01-30T23:59:59Z'
        },
        {
          logistics_partner_id: logisticsPartners[2].id, // Gander & White
          amount: 4200,
          status: 'pending' as BidStatus,
          notes: 'Specialist fine art transport with conservation expertise. Preferred partner for major museums.',
          estimated_transit_time: '2 days',
          insurance_included: true,
          special_services: ['conservation', 'museum_specialist', 'custom_crating'],
          valid_until: '2025-02-01T23:59:59Z'
        }
      ]
    },
    {
      title: 'Contemporary Sculpture Auction Transport',
      type: 'auction' as QuoteType,
      status: 'completed' as QuoteStatus,
      route: 'New York → London',
      origin_id: locations[1].id, // MoMA
      destination_id: locations[0].id, // Tate Modern
      target_date: '2024-12-20',
      target_date_start: '2024-12-18',
      target_date_end: '2024-12-22',
      value: 2800000,
      description: 'Transport of winning auction lot: large-scale contemporary sculptures by Anish Kapoor. Requires specialized rigging and oversized transport capabilities.',
      requirements: {
        oversized_transport: true,
        rigging_required: true,
        security_level: 'high',
        insurance_required: true
      },
      shipment_id: existingShipments?.[1]?.id || null,
      bids: [
        {
          logistics_partner_id: logisticsPartners[0].id, // Crown Fine Art
          amount: 8900,
          status: 'accepted' as BidStatus,
          notes: 'Specialized rigging team and oversized transport vehicle. Successfully completed.',
          estimated_transit_time: '5 days',
          insurance_included: true,
          special_services: ['rigging', 'oversized', 'specialized_team'],
          valid_until: '2024-12-15T23:59:59Z'
        },
        {
          logistics_partner_id: logisticsPartners[3].id, // UPS Capital
          amount: 9500,
          status: 'rejected' as BidStatus,
          notes: 'Standard logistics service with insurance coverage.',
          estimated_transit_time: '7 days',
          insurance_included: true,
          special_services: ['insurance', 'tracking'],
          valid_until: '2024-12-15T23:59:59Z'
        }
      ]
    },
    {
      title: 'Photography Collection Exchange',
      type: 'requested' as QuoteType,
      status: 'draft' as QuoteStatus,
      route: 'Florence → London',
      origin_id: locations[5].id, // Uffizi
      destination_id: locations[4].id, // National Gallery
      target_date: '2025-03-10',
      target_date_start: '2025-03-10',
      target_date_end: '2025-03-10',
      value: 650000,
      description: 'Exchange program: 20th century photography collection. Requires UV protection, humidity control, and acid-free packaging.',
      requirements: {
        uv_protection: true,
        humidity_control: true,
        acid_free_packaging: true,
        temperature_monitoring: true
      },
      shipment_id: null,
      bids: [
        {
          logistics_partner_id: logisticsPartners[2].id, // Gander & White
          amount: 1850,
          status: 'pending' as BidStatus,
          notes: 'Specialized photography transport with conservation-grade packaging.',
          estimated_transit_time: '3 days',
          insurance_included: true,
          special_services: ['photography_specialist', 'conservation_packaging', 'climate_control'],
          valid_until: '2025-02-28T23:59:59Z'
        }
      ]
    },
    {
      title: 'Ancient Artifacts Loan Program',
      type: 'auction' as QuoteType,
      status: 'active' as QuoteStatus,
      route: 'Bilbao → New York',
      origin_id: locations[3].id, // Guggenheim Bilbao
      destination_id: locations[1].id, // MoMA
      target_date: '2025-01-25',
      target_date_start: '2025-01-23',
      target_date_end: '2025-01-27',
      value: 4200000,
      description: 'International loan of ancient Mediterranean artifacts. Requires customs expertise, archaeological handling protocols, and maximum security.',
      requirements: {
        customs_expertise: true,
        archaeological_protocols: true,
        security_level: 'maximum',
        documentation_support: true
      },
      shipment_id: existingShipments?.[2]?.id || null,
      bids: [
        {
          logistics_partner_id: logisticsPartners[1].id, // DHL Fine Art
          amount: 7200,
          status: 'pending' as BidStatus,
          notes: 'International expertise with customs clearance and archaeological handling.',
          estimated_transit_time: '4 days',
          insurance_included: true,
          special_services: ['customs_expertise', 'archaeological', 'international'],
          valid_until: '2025-01-20T23:59:59Z'
        },
        {
          logistics_partner_id: logisticsPartners[4].id, // FedEx Art
          amount: 6800,
          status: 'pending' as BidStatus,
          notes: 'Global art services with express delivery and full documentation support.',
          estimated_transit_time: '3 days',
          insurance_included: true,
          special_services: ['express', 'documentation', 'global_network'],
          valid_until: '2025-01-18T23:59:59Z'
        },
        {
          logistics_partner_id: logisticsPartners[5].id, // Martinspeed
          amount: 6950,
          status: 'pending' as BidStatus,
          notes: 'Museum specialists with extensive experience in ancient artifacts transport.',
          estimated_transit_time: '4 days',
          insurance_included: true,
          special_services: ['museum_specialist', 'ancient_artifacts', 'security'],
          valid_until: '2025-01-22T23:59:59Z'
        }
      ]
    },
    {
      title: 'Modern Art Fair Transport',
      type: 'requested' as QuoteType,
      status: 'cancelled' as QuoteStatus,
      route: 'London → Paris',
      origin_id: locations[0].id, // Tate Modern
      destination_id: locations[2].id, // Louvre
      target_date: '2024-11-15',
      target_date_start: '2024-11-15',
      target_date_end: '2024-11-15',
      value: 1200000,
      description: 'Cancelled: Transport for modern art fair participation. Multiple medium-sized contemporary works.',
      requirements: {
        multiple_works: true,
        fair_logistics: true,
        setup_support: true
      },
      shipment_id: null,
      bids: [
        {
          logistics_partner_id: logisticsPartners[0].id, // Crown Fine Art
          amount: 3200,
          status: 'withdrawn' as BidStatus,
          notes: 'Bid withdrawn due to event cancellation.',
          estimated_transit_time: '1 day',
          insurance_included: true,
          special_services: ['fair_logistics', 'setup_support'],
          valid_until: '2024-11-10T23:59:59Z'
        }
      ]
    },
    {
      title: 'Digital Art Installation Transport',
      type: 'auction' as QuoteType,
      status: 'active' as QuoteStatus,
      route: 'London → Florence',
      origin_id: locations[4].id, // National Gallery
      destination_id: locations[5].id, // Uffizi
      target_date: '2025-02-28',
      target_date_start: '2025-02-25',
      target_date_end: '2025-03-03',
      value: 850000,
      description: 'Transport of digital art installation including LED panels, projection equipment, and computer hardware. Requires technical expertise and anti-static handling.',
      requirements: {
        technical_equipment: true,
        anti_static: true,
        power_requirements: true,
        setup_support: true
      },
      shipment_id: null,
      bids: [
        {
          logistics_partner_id: logisticsPartners[3].id, // UPS Capital
          amount: 4100,
          status: 'pending' as BidStatus,
          notes: 'Technical equipment specialists with anti-static handling protocols.',
          estimated_transit_time: '3 days',
          insurance_included: true,
          special_services: ['technical_equipment', 'anti_static', 'setup_support'],
          valid_until: '2025-02-25T23:59:59Z'
        },
        {
          logistics_partner_id: logisticsPartners[4].id, // FedEx Art
          amount: 3850,
          status: 'pending' as BidStatus,
          notes: 'Express service with technical handling capabilities.',
          estimated_transit_time: '2 days',
          insurance_included: true,
          special_services: ['express', 'technical', 'installation_support'],
          valid_until: '2025-02-26T23:59:59Z'
        }
      ]
    }
  ];

  let createdQuotesCount = 0;
  let skippedQuotesCount = 0;
  let createdBidsCount = 0;

  for (const quote of quotesData) {
    // Check if quote already exists
    const { data: existingQuote } = await supabase
      .from('quotes')
      .select('id')
      .eq('title', quote.title)
      .eq('owner_org_id', tateBranchOrgId)
      .single();

    if (existingQuote) {
      console.log(`⏭️ Skipping existing quote: ${quote.title}`);
      skippedQuotesCount++;
      continue;
    }

    // Create quote
    const { data: newQuote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        title: quote.title,
        type: quote.type,
        status: quote.status,
        route: quote.route,
        origin_id: quote.origin_id,
        destination_id: quote.destination_id,
        target_date: quote.target_date,
        target_date_start: quote.target_date_start,
        target_date_end: quote.target_date_end,
        value: quote.value,
        description: quote.description,
        requirements: quote.requirements,
        owner_org_id: tateBranchOrgId,
        shipment_id: quote.shipment_id
      })
      .select()
      .single();

    if (quoteError) {
      console.error(`❌ Error creating quote ${quote.title}:`, quoteError.message);
      continue;
    }

    console.log(`✅ Created quote: ${quote.title}`);
    createdQuotesCount++;

    // Create bids for this quote
    for (const bid of quote.bids) {
      const { error: bidError } = await supabase
        .from('bids')
        .insert({
          quote_id: newQuote.id,
          logistics_partner_id: bid.logistics_partner_id,
          amount: bid.amount,
          status: bid.status,
          notes: bid.notes,
          estimated_transit_time: bid.estimated_transit_time,
          insurance_included: bid.insurance_included,
          special_services: bid.special_services,
          valid_until: bid.valid_until
        });

      if (bidError) {
        console.error(`  ❌ Error creating bid:`, bidError.message);
      } else {
        console.log(`  💰 Created bid: ${bid.amount} (${bid.status})`);
        createdBidsCount++;
      }
    }
  }

  // Summary
  console.log('\n🎉 Quotes seeding completed!');
  console.log(`✅ Created: ${createdQuotesCount} quotes`);
  console.log(`⏭️ Skipped: ${skippedQuotesCount} quotes (already existed)`);
  console.log(`💰 Created: ${createdBidsCount} bids`);
  console.log(`🚚 Ensured: ${logisticsPartners.length} logistics partners exist`);
  console.log('\n🌐 You can now log into the app as admin@tate.org.uk to view the quotes!');
  console.log('💡 Navigate to the Quotes tab to see all the dummy data with bids and logistics partners.');

  // Sign out
  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error('💥 Script failed:', error);
  process.exit(1);
}); 
