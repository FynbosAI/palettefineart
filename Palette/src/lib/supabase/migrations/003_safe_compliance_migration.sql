-- Safe Migration: Enhanced Quote → Bid → Shipment Workflow with Compliance & Consolidation Support
-- This version checks for existing objects before creating them

-- =====================================================
-- STEP 1: Create quote_artworks table if it doesn't exist
-- =====================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_schema = 'public' 
                   AND table_name = 'quote_artworks') THEN
        CREATE TABLE quote_artworks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
            name TEXT NOT NULL,
            artist_name TEXT,
            year_completed INTEGER,
            medium TEXT,
            dimensions TEXT,
            weight TEXT,
            declared_value NUMERIC,
            crating TEXT,
            description TEXT,
            image_url TEXT,
            tariff_code TEXT,
            country_of_origin TEXT,
            export_license_required BOOLEAN DEFAULT false,
            special_requirements JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            created_by UUID REFERENCES auth.users(id),
            locked_at TIMESTAMPTZ,
            locked_by UUID REFERENCES auth.users(id)
        );
        
        CREATE INDEX idx_quote_artworks_quote_id ON quote_artworks(quote_id);
        CREATE INDEX idx_quote_artworks_locked ON quote_artworks(locked_at) WHERE locked_at IS NOT NULL;
    END IF;
END $$;

-- =====================================================
-- STEP 2: Create quote_shipment_map if it doesn't exist
-- =====================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_schema = 'public' 
                   AND table_name = 'quote_shipment_map') THEN
        CREATE TABLE quote_shipment_map (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
            shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
            bid_id UUID REFERENCES bids(id),
            relationship_type TEXT NOT NULL DEFAULT 'primary' 
                CHECK (relationship_type IN ('primary', 'consolidated', 'split', 'partial')),
            included_artwork_ids UUID[] DEFAULT '{}',
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            created_by UUID REFERENCES auth.users(id),
            UNIQUE(quote_id, shipment_id)
        );
        
        CREATE INDEX idx_quote_shipment_map_quote ON quote_shipment_map(quote_id);
        CREATE INDEX idx_quote_shipment_map_shipment ON quote_shipment_map(shipment_id);
        CREATE INDEX idx_quote_shipment_map_type ON quote_shipment_map(relationship_type);
    END IF;
END $$;

-- =====================================================
-- STEP 3: Create audit tables if they don't exist
-- =====================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_schema = 'public' 
                   AND table_name = 'audit_log') THEN
        CREATE TABLE audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            table_name TEXT NOT NULL,
            record_id UUID NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
            old_values JSONB,
            new_values JSONB,
            changed_fields TEXT[],
            user_id UUID REFERENCES auth.users(id),
            user_ip INET,
            user_agent TEXT,
            session_id TEXT,
            timestamp TIMESTAMPTZ DEFAULT now(),
            retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 years'),
            CHECK (
                (action = 'INSERT' AND old_values IS NULL AND new_values IS NOT NULL) OR
                (action = 'UPDATE' AND old_values IS NOT NULL AND new_values IS NOT NULL) OR
                (action = 'DELETE' AND old_values IS NOT NULL AND new_values IS NULL)
            )
        );
        
        CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
        CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
        CREATE INDEX idx_audit_log_user ON audit_log(user_id);
        CREATE INDEX idx_audit_log_action ON audit_log(action);
        CREATE INDEX idx_audit_log_retention ON audit_log(retention_until) WHERE retention_until IS NOT NULL;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_schema = 'public' 
                   AND table_name = 'quote_audit_events') THEN
        CREATE TABLE quote_audit_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
            event_type TEXT NOT NULL CHECK (event_type IN (
                'created', 'submitted', 'artwork_added', 'artwork_removed', 
                'bid_received', 'bid_accepted', 'shipment_created', 'cancelled'
            )),
            event_data JSONB,
            user_id UUID REFERENCES auth.users(id),
            organization_id UUID REFERENCES organizations(id),
            timestamp TIMESTAMPTZ DEFAULT now(),
            retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 years')
        );
        
        CREATE INDEX idx_quote_audit_events_quote ON quote_audit_events(quote_id);
        CREATE INDEX idx_quote_audit_events_type ON quote_audit_events(event_type);
    END IF;
END $$;

-- =====================================================
-- STEP 4: Add columns to existing tables (if they don't exist)
-- =====================================================

-- Add columns to artworks table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'artworks' AND column_name = 'quote_id') THEN
        ALTER TABLE artworks ADD COLUMN quote_id UUID REFERENCES quotes(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'artworks' AND column_name = 'quote_artwork_id') THEN
        ALTER TABLE artworks ADD COLUMN quote_artwork_id UUID REFERENCES quote_artworks(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'artworks' AND column_name = 'verified_condition') THEN
        ALTER TABLE artworks ADD COLUMN verified_condition TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'artworks' AND column_name = 'verified_at') THEN
        ALTER TABLE artworks ADD COLUMN verified_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'artworks' AND column_name = 'verified_by') THEN
        ALTER TABLE artworks ADD COLUMN verified_by UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Add constraint to artworks if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'artworks_single_parent_check') THEN
        ALTER TABLE artworks
        ADD CONSTRAINT artworks_single_parent_check CHECK (
            (quote_id IS NOT NULL AND shipment_id IS NULL) 
            OR 
            (quote_id IS NULL AND shipment_id IS NOT NULL)
        );
    END IF;
END $$;

-- Create index for artworks.quote_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                   WHERE tablename = 'artworks' AND indexname = 'idx_artworks_quote_id') THEN
        CREATE INDEX idx_artworks_quote_id ON artworks(quote_id);
    END IF;
END $$;

-- Add columns to quotes table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quotes' AND column_name = 'submitted_at') THEN
        ALTER TABLE quotes ADD COLUMN submitted_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quotes' AND column_name = 'submitted_by') THEN
        ALTER TABLE quotes ADD COLUMN submitted_by UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quotes' AND column_name = 'locked_at') THEN
        ALTER TABLE quotes ADD COLUMN locked_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quotes' AND column_name = 'cancelled_at') THEN
        ALTER TABLE quotes ADD COLUMN cancelled_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quotes' AND column_name = 'cancelled_by') THEN
        ALTER TABLE quotes ADD COLUMN cancelled_by UUID REFERENCES auth.users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'quotes' AND column_name = 'cancellation_reason') THEN
        ALTER TABLE quotes ADD COLUMN cancellation_reason TEXT;
    END IF;
END $$;

-- Add columns to shipments table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'shipments' AND column_name = 'quote_id') THEN
        ALTER TABLE shipments ADD COLUMN quote_id UUID UNIQUE REFERENCES quotes(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'shipments' AND column_name = 'is_consolidated') THEN
        ALTER TABLE shipments ADD COLUMN is_consolidated BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'shipments' AND column_name = 'consolidation_notes') THEN
        ALTER TABLE shipments ADD COLUMN consolidation_notes TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'shipments' AND column_name = 'parent_shipment_id') THEN
        ALTER TABLE shipments ADD COLUMN parent_shipment_id UUID REFERENCES shipments(id);
    END IF;
END $$;

-- Create index for shipments.quote_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                   WHERE tablename = 'shipments' AND indexname = 'idx_shipments_quote_id') THEN
        CREATE INDEX idx_shipments_quote_id ON shipments(quote_id);
    END IF;
END $$;

-- Add columns to bids table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bids' AND column_name = 'accepted_at') THEN
        ALTER TABLE bids ADD COLUMN accepted_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bids' AND column_name = 'accepted_by') THEN
        ALTER TABLE bids ADD COLUMN accepted_by UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Add unique constraint to bids if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'unique_bid_per_partner_per_quote') THEN
        ALTER TABLE bids
        ADD CONSTRAINT unique_bid_per_partner_per_quote 
        UNIQUE (quote_id, logistics_partner_id);
    END IF;
END $$;

-- =====================================================
-- STEP 5: Create or replace functions
-- =====================================================

-- Drop existing functions if they exist (to replace them)
DROP FUNCTION IF EXISTS create_audit_log() CASCADE;
DROP FUNCTION IF EXISTS accept_bid_with_compliance(UUID, UUID);
DROP FUNCTION IF EXISTS consolidate_quotes_to_shipment(UUID[], UUID);
DROP FUNCTION IF EXISTS update_quote_value() CASCADE;

-- Create audit trigger function
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    changed_fields TEXT[];
    old_jsonb JSONB;
    new_jsonb JSONB;
BEGIN
    -- Convert records to JSONB
    IF TG_OP = 'DELETE' THEN
        old_jsonb := to_jsonb(OLD);
        new_jsonb := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        old_jsonb := NULL;
        new_jsonb := to_jsonb(NEW);
    ELSE -- UPDATE
        old_jsonb := to_jsonb(OLD);
        new_jsonb := to_jsonb(NEW);
        
        -- Calculate changed fields
        SELECT array_agg(key) INTO changed_fields
        FROM jsonb_each(old_jsonb) o
        FULL OUTER JOIN jsonb_each(new_jsonb) n ON o.key = n.key
        WHERE o.value IS DISTINCT FROM n.value;
    END IF;
    
    -- Insert audit log
    INSERT INTO audit_log (
        table_name,
        record_id,
        action,
        old_values,
        new_values,
        changed_fields,
        user_id,
        timestamp
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        old_jsonb,
        new_jsonb,
        changed_fields,
        auth.uid(),
        now()
    );
    
    -- Return appropriate value
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create enhanced accept_bid function
CREATE OR REPLACE FUNCTION accept_bid_with_compliance(
    p_quote_id UUID,
    p_bid_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shipment_id UUID;
    v_quote_record RECORD;
    v_bid_record RECORD;
    v_shipment_code TEXT;
    v_artwork_mappings JSONB = '[]'::JSONB;
BEGIN
    -- Validate inputs
    IF p_quote_id IS NULL OR p_bid_id IS NULL THEN
        RAISE EXCEPTION 'Quote ID and Bid ID are required';
    END IF;

    -- Lock the quote for update
    SELECT * INTO v_quote_record
    FROM quotes
    WHERE id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found';
    END IF;

    -- Verify quote is in correct state
    IF v_quote_record.status != 'active' THEN
        RAISE EXCEPTION 'Quote must be active to accept bids';
    END IF;

    -- Lock and verify the bid
    SELECT b.*, lp.name as partner_name 
    INTO v_bid_record
    FROM bids b
    JOIN logistics_partners lp ON lp.id = b.logistics_partner_id
    WHERE b.id = p_bid_id 
    AND b.quote_id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found or does not belong to this quote';
    END IF;

    -- Verify bid is submitted (not draft)
    IF v_bid_record.is_draft = true THEN
        RAISE EXCEPTION 'Cannot accept a draft bid';
    END IF;

    -- Lock quote artworks
    UPDATE quote_artworks 
    SET locked_at = NOW(), locked_by = auth.uid()
    WHERE quote_id = p_quote_id AND locked_at IS NULL;

    -- Generate shipment code
    SELECT 'SHP-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || 
           LPAD((COALESCE(MAX(REGEXP_REPLACE(code, '^SHP-\d{4}-', '')::INT), 0) + 1)::TEXT, 4, '0')
    INTO v_shipment_code
    FROM shipments 
    WHERE code ~ '^SHP-\d{4}-\d{4}$';

    -- Create the shipment
    INSERT INTO shipments (
        id,
        code,
        name,
        status,
        origin_id,
        destination_id,
        owner_org_id,
        logistics_partner_id,
        quote_id,
        total_value,
        client_reference,
        delivery_requirements,
        packing_requirements,
        access_requirements,
        safety_security_requirements,
        condition_check_requirements,
        created_at,
        updated_at
    )
    SELECT 
        gen_random_uuid(),
        v_shipment_code,
        'Shipment for ' || v_quote_record.title,
        'checking'::shipment_status,
        v_quote_record.origin_id,
        v_quote_record.destination_id,
        v_quote_record.owner_org_id,
        v_bid_record.logistics_partner_id,
        p_quote_id,
        v_quote_record.value,
        v_quote_record.client_reference,
        COALESCE((v_quote_record.delivery_specifics->>'requirements')::text[], ARRAY[]::text[]),
        COALESCE(v_quote_record.requirements->>'packing', ''),
        COALESCE((v_quote_record.requirements->>'access')::text[], ARRAY[]::text[]),
        COALESCE((v_quote_record.requirements->>'safety_security')::text[], ARRAY[]::text[]),
        COALESCE((v_quote_record.requirements->>'condition_check')::text[], ARRAY[]::text[]),
        NOW(),
        NOW()
    RETURNING id INTO v_shipment_id;

    -- Create quote-shipment mapping
    INSERT INTO quote_shipment_map (
        quote_id,
        shipment_id,
        bid_id,
        relationship_type,
        created_by
    ) VALUES (
        p_quote_id,
        v_shipment_id,
        p_bid_id,
        'primary',
        auth.uid()
    );

    -- Copy artworks from quote to shipment
    INSERT INTO artworks (
        shipment_id,
        quote_artwork_id,
        name,
        artist_name,
        year_completed,
        medium,
        dimensions,
        weight,
        declared_value,
        crating,
        description,
        image_url,
        tariff_code,
        country_of_origin,
        export_license_required,
        special_requirements,
        created_at
    )
    SELECT 
        v_shipment_id,
        qa.id,
        qa.name,
        qa.artist_name,
        qa.year_completed,
        qa.medium,
        qa.dimensions,
        qa.weight,
        qa.declared_value,
        qa.crating,
        qa.description,
        qa.image_url,
        qa.tariff_code,
        qa.country_of_origin,
        qa.export_license_required,
        qa.special_requirements,
        NOW()
    FROM quote_artworks qa
    WHERE qa.quote_id = p_quote_id;

    -- Update the winning bid
    UPDATE bids 
    SET 
        status = 'accepted'::bid_status,
        accepted_at = NOW(),
        accepted_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_bid_id;

    -- Reject all other bids
    UPDATE bids 
    SET 
        status = 'rejected'::bid_status,
        rejection_reason = 'Another bid was accepted',
        rejected_at = NOW(),
        updated_at = NOW()
    WHERE quote_id = p_quote_id 
    AND id != p_bid_id
    AND status NOT IN ('accepted', 'rejected');

    -- Close and lock the quote
    UPDATE quotes 
    SET 
        status = 'closed'::quote_status,
        shipment_id = v_shipment_id,
        locked_at = NOW(),
        updated_at = NOW()
    WHERE id = p_quote_id;

    -- Record audit event
    INSERT INTO quote_audit_events (
        quote_id,
        event_type,
        event_data,
        user_id,
        organization_id
    ) VALUES (
        p_quote_id,
        'bid_accepted',
        jsonb_build_object(
            'bid_id', p_bid_id,
            'shipment_id', v_shipment_id,
            'shipment_code', v_shipment_code,
            'winning_amount', v_bid_record.amount,
            'partner_name', v_bid_record.partner_name
        ),
        auth.uid(),
        v_quote_record.owner_org_id
    );

    RETURN v_shipment_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION accept_bid_with_compliance(UUID, UUID) TO authenticated;

-- Create consolidation function
CREATE OR REPLACE FUNCTION consolidate_quotes_to_shipment(
    p_quote_ids UUID[],
    p_primary_bid_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shipment_id UUID;
    v_shipment_code TEXT;
    v_total_value NUMERIC = 0;
    v_quote_count INT;
BEGIN
    -- Validate input
    v_quote_count := array_length(p_quote_ids, 1);
    IF v_quote_count < 2 THEN
        RAISE EXCEPTION 'Consolidation requires at least 2 quotes';
    END IF;
    
    -- Verify all quotes are eligible
    IF EXISTS (
        SELECT 1 FROM quotes 
        WHERE id = ANY(p_quote_ids) 
        AND status != 'active'
    ) THEN
        RAISE EXCEPTION 'All quotes must be active for consolidation';
    END IF;
    
    -- Calculate total value
    SELECT SUM(value) INTO v_total_value
    FROM quotes WHERE id = ANY(p_quote_ids);
    
    -- Generate consolidated shipment code
    SELECT 'SHP-CONSOL-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || 
           LPAD((COALESCE(MAX(REGEXP_REPLACE(code, '^SHP-CONSOL-\d{4}-', '')::INT), 0) + 1)::TEXT, 4, '0')
    INTO v_shipment_code
    FROM shipments 
    WHERE code ~ '^SHP-CONSOL-\d{4}-\d{4}$';
    
    -- Create consolidated shipment
    INSERT INTO shipments (
        id, code, name, status, is_consolidated,
        total_value, consolidation_notes,
        owner_org_id, logistics_partner_id,
        created_at, updated_at
    )
    SELECT 
        gen_random_uuid(),
        v_shipment_code,
        'Consolidated Shipment (' || v_quote_count || ' quotes)',
        'checking'::shipment_status,
        true,
        v_total_value,
        'Consolidated from ' || v_quote_count || ' quotes',
        q.owner_org_id,
        b.logistics_partner_id,
        NOW(), NOW()
    FROM quotes q
    JOIN bids b ON b.id = p_primary_bid_id
    WHERE q.id = p_quote_ids[1]
    RETURNING id INTO v_shipment_id;
    
    -- Create mappings for all quotes
    INSERT INTO quote_shipment_map (
        quote_id, shipment_id, bid_id, relationship_type
    )
    SELECT 
        quote_id,
        v_shipment_id,
        CASE WHEN quote_id = (
            SELECT quote_id FROM bids WHERE id = p_primary_bid_id
        ) THEN p_primary_bid_id ELSE NULL END,
        'consolidated'
    FROM unnest(p_quote_ids) AS quote_id;
    
    -- Copy all artworks from all quotes
    INSERT INTO artworks (
        shipment_id, quote_artwork_id, name, artist_name,
        declared_value, created_at
    )
    SELECT 
        v_shipment_id, qa.id, qa.name, qa.artist_name,
        qa.declared_value, NOW()
    FROM quote_artworks qa
    WHERE qa.quote_id = ANY(p_quote_ids);
    
    -- Update all quotes
    UPDATE quotes 
    SET status = 'closed', locked_at = NOW()
    WHERE id = ANY(p_quote_ids);
    
    -- Accept primary bid, reject others
    UPDATE bids 
    SET 
        status = CASE 
            WHEN id = p_primary_bid_id THEN 'accepted'::bid_status
            ELSE 'rejected'::bid_status 
        END,
        accepted_at = CASE WHEN id = p_primary_bid_id THEN NOW() ELSE NULL END,
        rejected_at = CASE WHEN id != p_primary_bid_id THEN NOW() ELSE NULL END,
        rejection_reason = CASE 
            WHEN id != p_primary_bid_id THEN 'Consolidated with another shipment' 
            ELSE NULL 
        END
    WHERE quote_id = ANY(p_quote_ids);
    
    RETURN v_shipment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION consolidate_quotes_to_shipment(UUID[], UUID) TO authenticated;

-- Create trigger to update quote value
CREATE OR REPLACE FUNCTION update_quote_value()
RETURNS TRIGGER AS $$
BEGIN
    -- Update quote value when artworks are added/updated/deleted
    IF NEW.quote_id IS NOT NULL THEN
        UPDATE quotes 
        SET value = (
            SELECT COALESCE(SUM(declared_value), 0)
            FROM quote_artworks
            WHERE quote_id = NEW.quote_id
        )
        WHERE id = NEW.quote_id;
    END IF;
    
    -- Handle deletion or movement from quote
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.quote_id IS NOT NULL AND OLD.quote_id != COALESCE(NEW.quote_id, '00000000-0000-0000-0000-000000000000')) THEN
        UPDATE quotes 
        SET value = (
            SELECT COALESCE(SUM(declared_value), 0)
            FROM quote_artworks
            WHERE quote_id = OLD.quote_id
        )
        WHERE id = OLD.quote_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 6: Create triggers (drop and recreate to ensure they're up to date)
-- =====================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS quotes_audit_trigger ON quotes;
DROP TRIGGER IF EXISTS bids_audit_trigger ON bids;
DROP TRIGGER IF EXISTS shipments_audit_trigger ON shipments;
DROP TRIGGER IF EXISTS quote_artworks_audit_trigger ON quote_artworks;
DROP TRIGGER IF EXISTS update_quote_value_on_artwork_change ON quote_artworks;

-- Create audit triggers
CREATE TRIGGER quotes_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON quotes
FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER bids_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON bids
FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER shipments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON shipments
FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER quote_artworks_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON quote_artworks
FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- Create trigger for quote value updates
CREATE TRIGGER update_quote_value_on_artwork_change
AFTER INSERT OR UPDATE OR DELETE ON quote_artworks
FOR EACH ROW
EXECUTE FUNCTION update_quote_value();

-- =====================================================
-- STEP 7: Enable RLS on new tables
-- =====================================================

ALTER TABLE quote_artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_shipment_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_audit_events ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 8: Create RLS policies (drop existing first)
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view quote artworks for their quotes" ON quote_artworks;
DROP POLICY IF EXISTS "Users can manage quote artworks for their quotes" ON quote_artworks;
DROP POLICY IF EXISTS "Users can view their quote-shipment mappings" ON quote_shipment_map;
DROP POLICY IF EXISTS "Only admins can view audit logs" ON audit_log;
DROP POLICY IF EXISTS "Users can view quote audit events for their org" ON quote_audit_events;

-- Quote artworks policies
CREATE POLICY "Users can view quote artworks for their quotes"
ON quote_artworks FOR SELECT
USING (
    quote_id IN (
        SELECT id FROM quotes
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid()
        )
    )
    OR
    quote_id IN (
        SELECT qi.quote_id 
        FROM quote_invites qi
        JOIN logistics_partners lp ON lp.id = qi.logistics_partner_id
        JOIN memberships m ON m.org_id = lp.org_id
        WHERE m.user_id = auth.uid()
    )
    OR
    quote_id IN (
        SELECT id FROM quotes 
        WHERE type = 'auction' AND status = 'active'
    )
);

CREATE POLICY "Users can manage quote artworks for their quotes"
ON quote_artworks FOR ALL
USING (
    quote_id IN (
        SELECT id FROM quotes
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('editor', 'admin')
        )
    )
    AND locked_at IS NULL
);

-- Quote shipment map policies
CREATE POLICY "Users can view their quote-shipment mappings"
ON quote_shipment_map FOR SELECT
USING (
    quote_id IN (
        SELECT id FROM quotes
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships WHERE user_id = auth.uid()
        )
    )
    OR
    shipment_id IN (
        SELECT id FROM shipments
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships WHERE user_id = auth.uid()
        )
        OR logistics_partner_id IN (
            SELECT lp.id FROM logistics_partners lp
            JOIN memberships m ON m.org_id = lp.org_id
            WHERE m.user_id = auth.uid()
        )
    )
);

-- Audit log policies
CREATE POLICY "Only admins can view audit logs"
ON audit_log FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM memberships
        WHERE user_id = auth.uid()
        AND role = 'admin'
    )
);

CREATE POLICY "Users can view quote audit events for their org"
ON quote_audit_events FOR SELECT
USING (
    organization_id IN (
        SELECT org_id FROM memberships 
        WHERE user_id = auth.uid()
    )
);

-- =====================================================
-- STEP 9: Update RLS policies for artworks (if needed)
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Org members read artworks" ON artworks;
DROP POLICY IF EXISTS "Org editors insert artworks" ON artworks;
DROP POLICY IF EXISTS "Org editors update artworks" ON artworks;
DROP POLICY IF EXISTS "Org editors delete artworks" ON artworks;

-- Create new RLS policy for reading artworks (includes quote access)
CREATE POLICY "Org members read artworks" ON artworks
FOR SELECT USING (
    (shipment_id IS NOT NULL AND shipment_id IN (
        SELECT id FROM shipments
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid()
        )
    ))
    OR
    (quote_id IS NOT NULL AND quote_id IN (
        SELECT id FROM quotes
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid()
        )
    ))
    OR
    (quote_id IS NOT NULL AND quote_id IN (
        SELECT qi.quote_id 
        FROM quote_invites qi
        JOIN logistics_partners lp ON lp.id = qi.logistics_partner_id
        JOIN memberships m ON m.org_id = lp.org_id
        WHERE m.user_id = auth.uid()
    ))
    OR
    (quote_id IS NOT NULL AND quote_id IN (
        SELECT id FROM quotes 
        WHERE type = 'auction' AND status = 'active'
    ))
);

-- Create policy for inserting artworks
CREATE POLICY "Org editors insert artworks" ON artworks
FOR INSERT WITH CHECK (
    (shipment_id IS NOT NULL AND shipment_id IN (
        SELECT id FROM shipments
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('editor', 'admin')
        )
    ))
    OR
    (quote_id IS NOT NULL AND quote_id IN (
        SELECT id FROM quotes
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('editor', 'admin')
        )
    ))
);

-- Create policy for updating artworks
CREATE POLICY "Org editors update artworks" ON artworks
FOR UPDATE USING (
    (shipment_id IS NOT NULL AND shipment_id IN (
        SELECT id FROM shipments
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('editor', 'admin')
        )
    ))
    OR
    (quote_id IS NOT NULL AND quote_id IN (
        SELECT id FROM quotes
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('editor', 'admin')
        )
    ))
);

-- Create policy for deleting artworks
CREATE POLICY "Org editors delete artworks" ON artworks
FOR DELETE USING (
    (shipment_id IS NOT NULL AND shipment_id IN (
        SELECT id FROM shipments
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('editor', 'admin')
        )
    ))
    OR
    (quote_id IS NOT NULL AND quote_id IN (
        SELECT id FROM quotes
        WHERE owner_org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('editor', 'admin')
        )
    ))
);

-- =====================================================
-- STEP 10: Create helpful view
-- =====================================================

CREATE OR REPLACE VIEW quotes_with_counts AS
SELECT 
    q.*,
    COUNT(DISTINCT qa.id) as artwork_count,
    COUNT(DISTINCT b.id) as bid_count,
    COUNT(DISTINCT CASE WHEN b.is_draft = false THEN b.id END) as submitted_bid_count
FROM quotes q
LEFT JOIN quote_artworks qa ON qa.quote_id = q.id
LEFT JOIN bids b ON b.quote_id = q.id
GROUP BY q.id;

-- Grant access to the view
GRANT SELECT ON quotes_with_counts TO authenticated;

-- =====================================================
-- STEP 11: Create sequence if it doesn't exist
-- =====================================================

CREATE SEQUENCE IF NOT EXISTS shipment_code_seq;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify the migration
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'New tables created: quote_artworks, quote_shipment_map, audit_log, quote_audit_events';
    RAISE NOTICE 'Enhanced columns added to: artworks, quotes, shipments, bids';
    RAISE NOTICE 'Functions created: accept_bid_with_compliance, consolidate_quotes_to_shipment';
    RAISE NOTICE 'Audit logging enabled on critical tables';
END $$;