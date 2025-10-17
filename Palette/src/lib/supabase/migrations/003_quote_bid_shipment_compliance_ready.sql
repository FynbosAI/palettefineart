-- Migration: Enhanced Quote → Bid → Shipment Workflow with Compliance & Consolidation Support
-- Description: This migration builds on the previous improvements and adds:
--   1. Separate quote_artworks table for immutable quote history (SOC2 compliance)
--   2. Audit tables for complete change tracking
--   3. Quote-shipment mapping for future consolidation support
--   4. Enhanced audit trail capabilities

-- =====================================================
-- STEP 1: Create quote_artworks table (immutable quote records)
-- =====================================================

-- This separate table ensures quote data remains unchanged after submission
-- Critical for SOC2 compliance and audit trails
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
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    -- Make immutable after quote submission
    locked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES auth.users(id),
    CONSTRAINT quote_artworks_quote_id_fkey FOREIGN KEY (quote_id) 
        REFERENCES quotes(id) ON DELETE RESTRICT
);

-- Index for performance
CREATE INDEX idx_quote_artworks_quote_id ON quote_artworks(quote_id);
CREATE INDEX idx_quote_artworks_locked ON quote_artworks(locked_at) WHERE locked_at IS NOT NULL;

-- =====================================================
-- STEP 2: Create quote_shipment_map for consolidation support
-- =====================================================

-- Supports future scenarios:
-- 1. Multiple quotes → one consolidated shipment
-- 2. One quote → multiple partial shipments
-- 3. Complex relationship tracking
CREATE TABLE quote_shipment_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
    bid_id UUID REFERENCES bids(id),  -- Which bid led to this shipment
    relationship_type TEXT NOT NULL DEFAULT 'primary' 
        CHECK (relationship_type IN ('primary', 'consolidated', 'split', 'partial')),
    -- For partial shipments, track which artworks were included
    included_artwork_ids UUID[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(quote_id, shipment_id)
);

-- Indexes for performance
CREATE INDEX idx_quote_shipment_map_quote ON quote_shipment_map(quote_id);
CREATE INDEX idx_quote_shipment_map_shipment ON quote_shipment_map(shipment_id);
CREATE INDEX idx_quote_shipment_map_type ON quote_shipment_map(relationship_type);

-- =====================================================
-- STEP 3: Create comprehensive audit tables
-- =====================================================

-- Generic audit log for SOC2 compliance
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
    -- Add index for efficient querying
    CHECK (
        (action = 'INSERT' AND old_values IS NULL AND new_values IS NOT NULL) OR
        (action = 'UPDATE' AND old_values IS NOT NULL AND new_values IS NOT NULL) OR
        (action = 'DELETE' AND old_values IS NOT NULL AND new_values IS NULL)
    )
);

-- Indexes for audit queries
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- Specific audit table for quote changes (high-level business events)
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
    timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quote_audit_events_quote ON quote_audit_events(quote_id);
CREATE INDEX idx_quote_audit_events_type ON quote_audit_events(event_type);

-- =====================================================
-- STEP 4: Update artworks table for shipment phase
-- =====================================================

-- Add reference to original quote artwork for traceability
ALTER TABLE artworks 
ADD COLUMN quote_artwork_id UUID REFERENCES quote_artworks(id),
ADD COLUMN verified_condition TEXT,
ADD COLUMN verified_at TIMESTAMPTZ,
ADD COLUMN verified_by UUID REFERENCES auth.users(id);

-- =====================================================
-- STEP 5: Update existing tables for better compliance
-- =====================================================

-- Add audit fields to quotes
ALTER TABLE quotes
ADD COLUMN submitted_at TIMESTAMPTZ,
ADD COLUMN submitted_by UUID REFERENCES auth.users(id),
ADD COLUMN locked_at TIMESTAMPTZ,
ADD COLUMN cancelled_at TIMESTAMPTZ,
ADD COLUMN cancelled_by UUID REFERENCES auth.users(id),
ADD COLUMN cancellation_reason TEXT;

-- Add consolidation fields to shipments
ALTER TABLE shipments
ADD COLUMN is_consolidated BOOLEAN DEFAULT false,
ADD COLUMN consolidation_notes TEXT,
ADD COLUMN parent_shipment_id UUID REFERENCES shipments(id);

-- Add accepted_by for audit trail
ALTER TABLE bids
ADD COLUMN accepted_by UUID REFERENCES auth.users(id);

-- =====================================================
-- STEP 6: Create audit trigger function
-- =====================================================

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

-- =====================================================
-- STEP 7: Apply audit triggers to critical tables
-- =====================================================

-- Apply to quotes table
CREATE TRIGGER quotes_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON quotes
FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- Apply to bids table
CREATE TRIGGER bids_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON bids
FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- Apply to shipments table
CREATE TRIGGER shipments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON shipments
FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- Apply to quote_artworks table
CREATE TRIGGER quote_artworks_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON quote_artworks
FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- =====================================================
-- STEP 8: Enhanced accept_bid function with compliance
-- =====================================================

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
    -- Start transaction block for consistency
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
        qa.id,  -- Reference to original quote artwork
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

    -- Track artwork mapping for audit
    SELECT jsonb_agg(jsonb_build_object(
        'quote_artwork_id', qa.id,
        'shipment_artwork_id', a.id
    )) INTO v_artwork_mappings
    FROM quote_artworks qa
    JOIN artworks a ON a.quote_artwork_id = qa.id
    WHERE qa.quote_id = p_quote_id
    AND a.shipment_id = v_shipment_id;

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

    -- Record high-level audit event
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
            'partner_name', v_bid_record.partner_name,
            'artwork_mappings', v_artwork_mappings
        ),
        auth.uid(),
        v_quote_record.owner_org_id
    );

    -- Record shipment creation event
    INSERT INTO quote_audit_events (
        quote_id,
        event_type,
        event_data,
        user_id,
        organization_id
    ) VALUES (
        p_quote_id,
        'shipment_created',
        jsonb_build_object(
            'shipment_id', v_shipment_id,
            'shipment_code', v_shipment_code,
            'from_bid_id', p_bid_id
        ),
        auth.uid(),
        v_quote_record.owner_org_id
    );

    RETURN v_shipment_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION accept_bid_with_compliance(UUID, UUID) TO authenticated;

-- =====================================================
-- STEP 9: RLS Policies for new tables
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE quote_artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_shipment_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_audit_events ENABLE ROW LEVEL SECURITY;

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
    -- Partners can view if invited or open auction
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
    AND locked_at IS NULL  -- Can't modify after locking
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

-- Audit log policies (restricted access)
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
-- STEP 10: Helper functions for consolidation
-- =====================================================

-- Function to consolidate multiple quotes into one shipment
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
           LPAD(nextval('shipment_code_seq')::TEXT, 4, '0')
    INTO v_shipment_code;
    
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

-- =====================================================
-- STEP 11: Create sequence for shipment codes
-- =====================================================

CREATE SEQUENCE IF NOT EXISTS shipment_code_seq;

-- =====================================================
-- STEP 12: Add data retention policy support
-- =====================================================

-- Add retention metadata to audit tables
ALTER TABLE audit_log 
ADD COLUMN retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 years');

ALTER TABLE quote_audit_events 
ADD COLUMN retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 years');

-- Create index for retention management
CREATE INDEX idx_audit_log_retention ON audit_log(retention_until) 
WHERE retention_until IS NOT NULL;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- This enhanced migration provides:
-- 1. Immutable quote history via quote_artworks table
-- 2. Complete audit trail for SOC2 compliance
-- 3. Support for future consolidation workflows
-- 4. Flexible quote-to-shipment mapping
-- 5. Comprehensive change tracking
-- 6. Data retention policy support