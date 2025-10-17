-- ============================================================================
-- Migration: Dynamic Bid/Shipment Changes Implementation
-- Version: 001
-- Date: 2025-08-09
-- Description: Implements shipment change requests, bid confirmations, 
--              shipment cancellation workflows, and carbon calculation storage
-- 
-- PostgreSQL Compatibility: 
--   - Minimum version: PostgreSQL 12 (Supabase default is 15+)
--   - Uses gen_random_uuid() (built-in since PostgreSQL 13, extension before)
--   - Compatible with Supabase's PostgreSQL implementation
-- ============================================================================

-- Start transaction for atomic migration
BEGIN;

-- Ensure UUID generation is available (for PostgreSQL < 13)
-- Supabase has this by default, but including for completeness
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Alternative: CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PHASE 1: ENUM TYPE UPDATES
-- ============================================================================

-- First, let's check what enum values currently exist (for debugging)
DO $$ 
DECLARE
    v_shipment_statuses text;
    v_bid_statuses text;
BEGIN
    -- Get current shipment_status values
    SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder) 
    INTO v_shipment_statuses
    FROM pg_enum 
    WHERE enumtypid = 'shipment_status'::regtype;
    
    -- Get current bid_status values
    SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder)
    INTO v_bid_statuses
    FROM pg_enum 
    WHERE enumtypid = 'bid_status'::regtype;
    
    -- Log current values (will appear in migration output)
    RAISE NOTICE 'Current shipment_status values: %', COALESCE(v_shipment_statuses, 'none');
    RAISE NOTICE 'Current bid_status values: %', COALESCE(v_bid_statuses, 'none');
END $$;

-- Add new status values to existing enums (PostgreSQL 9.1+)
DO $$ 
BEGIN
    -- Check if 'needs_confirmation' exists in bid_status
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'needs_confirmation' AND enumtypid = 'bid_status'::regtype) THEN
        ALTER TYPE bid_status ADD VALUE 'needs_confirmation';
    END IF;
    
    -- Check if 'pending_approval' exists in shipment_status
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_approval' AND enumtypid = 'shipment_status'::regtype) THEN
        ALTER TYPE shipment_status ADD VALUE 'pending_approval';
    END IF;
    
    -- Check if 'cancelled' exists in shipment_status (it should, but let's be safe)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cancelled' AND enumtypid = 'shipment_status'::regtype) THEN
        ALTER TYPE shipment_status ADD VALUE 'cancelled';
    END IF;
END $$;

-- Create new enum for change request types
DO $$ BEGIN
    CREATE TYPE change_request_type AS ENUM ('scope', 'withdrawal', 'cancellation');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create new enum for change request status
DO $$ BEGIN
    CREATE TYPE change_request_status AS ENUM ('pending', 'approved', 'declined', 'countered', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- PHASE 2: ADD COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add columns to bids table
ALTER TABLE bids 
ADD COLUMN IF NOT EXISTS needs_confirmation_at timestamptz,
ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
ADD COLUMN IF NOT EXISTS revision integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS shortlisted_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS shortlisted_at timestamptz;

-- Add columns to shipments table
ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Add check constraint for cancellation logic
ALTER TABLE shipments
ADD CONSTRAINT check_cancellation_fields 
CHECK (
    (cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL) OR
    (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL)
);

-- ============================================================================
-- PHASE 3: FIX UNIQUE CONSTRAINT ON SHIPMENTS
-- ============================================================================

-- Drop the existing unique constraint that prevents re-awarding
ALTER TABLE shipments 
DROP CONSTRAINT IF EXISTS shipments_quote_id_key;

-- Create partial unique index that allows multiple cancelled shipments
-- Note: Only using 'cancelled' as 'withdrawn' may not exist in shipment_status enum
CREATE UNIQUE INDEX IF NOT EXISTS shipments_quote_id_active_unique 
ON shipments(quote_id) 
WHERE status != 'cancelled';

-- ============================================================================
-- PHASE 4: CREATE SHIPMENT_CHANGE_REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS shipment_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    initiated_by uuid NOT NULL REFERENCES auth.users(id),
    change_type change_request_type NOT NULL,
    proposal jsonb,
    proposed_amount numeric(10,2),
    proposed_ship_date date,
    proposed_delivery_date date,
    notes text,
    status change_request_status NOT NULL DEFAULT 'pending',
    responded_by uuid REFERENCES auth.users(id),
    responded_at timestamptz,
    response_notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Ensure response fields are set together
    CONSTRAINT check_response_fields CHECK (
        (responded_by IS NULL AND responded_at IS NULL) OR
        (responded_by IS NOT NULL AND responded_at IS NOT NULL)
    ),
    
    -- Ensure proposed dates are logical
    CONSTRAINT check_proposed_dates CHECK (
        proposed_ship_date IS NULL OR 
        proposed_delivery_date IS NULL OR 
        proposed_ship_date < proposed_delivery_date
    ),
    
    -- Ensure proposed amount is positive
    CONSTRAINT check_proposed_amount CHECK (
        proposed_amount IS NULL OR proposed_amount > 0
    )
);

-- ============================================================================
-- PHASE 5: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for foreign keys (critical for join performance)
CREATE INDEX IF NOT EXISTS idx_shipments_logistics_partner_id 
ON shipments(logistics_partner_id);

CREATE INDEX IF NOT EXISTS idx_bids_logistics_partner_id 
ON bids(logistics_partner_id);

CREATE INDEX IF NOT EXISTS idx_bids_quote_id 
ON bids(quote_id);

CREATE INDEX IF NOT EXISTS idx_quotes_owner_org_id 
ON quotes(owner_org_id);

-- Indexes for new change requests table
CREATE INDEX IF NOT EXISTS idx_change_requests_shipment_id 
ON shipment_change_requests(shipment_id);

CREATE INDEX IF NOT EXISTS idx_change_requests_status 
ON shipment_change_requests(status) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_change_requests_initiated_by 
ON shipment_change_requests(initiated_by);

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_bids_needs_confirmation 
ON bids(needs_confirmation_at) 
WHERE needs_confirmation_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_cancelled 
ON shipments(cancelled_at) 
WHERE cancelled_at IS NOT NULL;

-- ============================================================================
-- PHASE 6: CREATE VALIDATION FUNCTION FOR JSONB PROPOSAL
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_change_request_proposal()
RETURNS trigger AS $$
BEGIN
    -- Only validate if proposal is not null
    IF NEW.proposal IS NOT NULL THEN
        -- Check for required fields based on change_type
        IF NEW.change_type = 'scope' THEN
            IF NOT (NEW.proposal ? 'modified_fields' AND 
                    NEW.proposal ? 'reason') THEN
                RAISE EXCEPTION 'Scope change proposal must include modified_fields and reason';
            END IF;
        ELSIF NEW.change_type = 'withdrawal' THEN
            IF NOT (NEW.proposal ? 'withdrawal_reason' AND
                    NEW.proposal ? 'replacement_partner_id') THEN
                RAISE EXCEPTION 'Withdrawal proposal must include withdrawal_reason and replacement_partner_id';
            END IF;
        END IF;
        
        -- Ensure proposal doesn't contain SQL or script tags (basic XSS prevention)
        IF NEW.proposal::text ~* '<script|javascript:|on\w+\s*=|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+SET' THEN
            RAISE EXCEPTION 'Invalid content detected in proposal';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply validation trigger
CREATE TRIGGER validate_proposal_before_insert
BEFORE INSERT OR UPDATE ON shipment_change_requests
FOR EACH ROW EXECUTE FUNCTION validate_change_request_proposal();

-- ============================================================================
-- PHASE 7: CREATE UPDATE TIMESTAMP TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to shipment_change_requests
CREATE TRIGGER update_shipment_change_requests_updated_at
BEFORE UPDATE ON shipment_change_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PHASE 8: SKIPPED - RLS POLICIES (Will be handled separately)
-- ============================================================================
-- RLS policies will be implemented in a separate migration as requested

-- ============================================================================
-- PHASE 9: HELPER FUNCTIONS FOR BUSINESS LOGIC
-- ============================================================================

-- Function to handle shipment cancellation
CREATE OR REPLACE FUNCTION cancel_shipment(
    p_shipment_id uuid,
    p_reason text
)
RETURNS void AS $$
BEGIN
    UPDATE shipments
    SET 
        status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = auth.uid(),
        cancellation_reason = p_reason,
        updated_at = now()
    WHERE id = p_shipment_id
    AND status != 'cancelled';  -- Only prevent if already cancelled
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shipment cannot be cancelled or not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to confirm a bid
CREATE OR REPLACE FUNCTION confirm_bid(
    p_bid_id uuid
)
RETURNS void AS $$
BEGIN
    UPDATE bids
    SET 
        status = 'submitted',
        confirmed_at = now(),
        needs_confirmation_at = NULL,
        updated_at = now()
    WHERE id = p_bid_id
    AND status = 'needs_confirmation';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bid not found or not in needs_confirmation status';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve change request and update shipment
CREATE OR REPLACE FUNCTION approve_change_request(
    p_request_id uuid,
    p_response_notes text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_request record;
BEGIN
    -- Get the change request
    SELECT * INTO v_request
    FROM shipment_change_requests
    WHERE id = p_request_id
    AND status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Change request not found or not pending';
    END IF;
    
    -- Update the change request
    UPDATE shipment_change_requests
    SET 
        status = 'approved',
        responded_by = auth.uid(),
        responded_at = now(),
        response_notes = p_response_notes,
        updated_at = now()
    WHERE id = p_request_id;
    
    -- Apply changes to shipment if scope change
    IF v_request.change_type = 'scope' THEN
        UPDATE shipments
        SET 
            amount = COALESCE(v_request.proposed_amount, amount),
            ship_date = COALESCE(v_request.proposed_ship_date, ship_date),
            estimated_arrival = COALESCE(v_request.proposed_delivery_date, estimated_arrival),
            updated_at = now()
        WHERE id = v_request.shipment_id;
    END IF;
    
    -- Handle withdrawal
    IF v_request.change_type = 'withdrawal' THEN
        -- Set shipment back to pending to allow re-awarding
        UPDATE shipments
        SET 
            status = 'pending_approval',
            logistics_partner_id = NULL,
            updated_at = now()
        WHERE id = v_request.shipment_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PHASE 10: AUDIT LOG TABLE (OPTIONAL BUT RECOMMENDED)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL,
    old_values jsonb,
    new_values jsonb,
    user_id uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record 
ON audit_log(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_user 
ON audit_log(user_id);

-- ============================================================================
-- PHASE 10B: CARBON CALCULATION TABLES
-- ============================================================================

-- Table to store all carbon calculation outputs from CarbonCare API
CREATE TABLE IF NOT EXISTS carbon_calculations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References (one of these should be set)
    shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
    quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
    bid_id uuid REFERENCES bids(id) ON DELETE CASCADE,
    
    -- Distance from CarbonCare
    distance_km numeric(10,2),  -- Shipment/KM
    distance_unit text DEFAULT 'km',  -- Shipment/KM/@Unit
    
    -- Emissions from CarbonCare (Shipment/Emissions)
    emissions_tot numeric(10,2),  -- TOT (kg CO2 total)
    emissions_ops numeric(10,2),  -- OPS (kg CO2 operations)
    emissions_ene numeric(10,2),  -- ENE (kg CO2 energy)
    emissions_tot_ei numeric(10,2),  -- TOT_EI (g CO2 per tonne-km)
    emissions_tkm numeric(10,2),  -- TKM (tonne-kilometres)
    
    -- Compensation
    compensation_chf numeric(10,2),  -- Compensation (CHF)
    
    -- CarbonCare metadata
    carboncare_shipment_id text,  -- Shipment/@Id
    carboncare_db_id integer,  -- Shipment/DbId
    carboncare_report_url text,  -- Shipment/ReportUrl
    
    -- Status from CarbonCare
    status_is_error boolean DEFAULT false,  -- Shipment/Status/IsError
    status_error_code integer,  -- Shipment/Status/ErrorCode
    status_error_message text,  -- Shipment/Status/ErrorMessage
    
    -- Raw API response (for any additional fields or future changes)
    api_response jsonb,  -- Complete API response
    api_request jsonb,   -- What we sent to API
    
    -- Tracking
    is_primary boolean DEFAULT false,  -- Which calculation is displayed
    calculated_at timestamptz DEFAULT now(),
    calculated_by uuid REFERENCES auth.users(id),
    
    -- Ensure it belongs to something
    CONSTRAINT must_reference_something 
        CHECK (shipment_id IS NOT NULL OR quote_id IS NOT NULL OR bid_id IS NOT NULL)
);

-- Create unique partial indexes for primary constraint per entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_carbon_primary_shipment 
ON carbon_calculations(shipment_id) 
WHERE is_primary = true AND shipment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_carbon_primary_quote 
ON carbon_calculations(quote_id) 
WHERE is_primary = true AND quote_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_carbon_primary_bid 
ON carbon_calculations(bid_id) 
WHERE is_primary = true AND bid_id IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_carbon_calc_shipment ON carbon_calculations(shipment_id);
CREATE INDEX IF NOT EXISTS idx_carbon_calc_quote ON carbon_calculations(quote_id);
CREATE INDEX IF NOT EXISTS idx_carbon_calc_bid ON carbon_calculations(bid_id);
CREATE INDEX IF NOT EXISTS idx_carbon_calc_primary ON carbon_calculations(is_primary) WHERE is_primary = true;

-- Lookup table for understanding carbon variables
CREATE TABLE IF NOT EXISTS carbon_calculation_variables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variable_name text UNIQUE NOT NULL,  -- 'co2_wtw', 'co2_ttw', etc.
    display_name text NOT NULL,          -- 'Well-to-Wheel Emissions'
    description text,                     -- Detailed explanation
    unit text NOT NULL,                   -- 'kg CO2', 'kg CO2/km'
    category text,                        -- 'emissions', 'distance', 'efficiency'
    calculation_formula text,             -- How it's calculated
    standard_reference text,              -- Which standard defines this
    is_displayed boolean DEFAULT false,   -- Show in UI?
    display_order integer,
    created_at timestamptz DEFAULT now()
);

-- Add reference columns to existing tables
ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS primary_carbon_calculation_id uuid REFERENCES carbon_calculations(id);

ALTER TABLE bids
ADD COLUMN IF NOT EXISTS primary_carbon_calculation_id uuid REFERENCES carbon_calculations(id);

ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS primary_carbon_calculation_id uuid REFERENCES carbon_calculations(id);

-- Function to set primary carbon calculation and sync display value
CREATE OR REPLACE FUNCTION set_primary_carbon_calculation(
    p_calculation_id uuid
)
RETURNS void AS $$
DECLARE
    v_calc record;
BEGIN
    -- Get the calculation
    SELECT * INTO v_calc FROM carbon_calculations WHERE id = p_calculation_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Carbon calculation not found';
    END IF;
    
    -- Handle shipment calculations
    IF v_calc.shipment_id IS NOT NULL THEN
        -- Clear other primary flags
        UPDATE carbon_calculations 
        SET is_primary = false 
        WHERE shipment_id = v_calc.shipment_id AND id != p_calculation_id;
        
        -- Update display value and reference (using emissions_tot from CarbonCare)
        UPDATE shipments 
        SET carbon_estimate = v_calc.emissions_tot,
            primary_carbon_calculation_id = p_calculation_id,
            updated_at = now()
        WHERE id = v_calc.shipment_id;
    END IF;
    
    -- Handle bid calculations
    IF v_calc.bid_id IS NOT NULL THEN
        -- Clear other primary flags
        UPDATE carbon_calculations 
        SET is_primary = false 
        WHERE bid_id = v_calc.bid_id AND id != p_calculation_id;
        
        -- Update display value and reference (using emissions_tot from CarbonCare)
        UPDATE bids 
        SET co2_estimate = v_calc.emissions_tot,
            primary_carbon_calculation_id = p_calculation_id,
            updated_at = now()
        WHERE id = v_calc.bid_id;
    END IF;
    
    -- Handle quote calculations
    IF v_calc.quote_id IS NOT NULL THEN
        -- Clear other primary flags
        UPDATE carbon_calculations 
        SET is_primary = false 
        WHERE quote_id = v_calc.quote_id AND id != p_calculation_id;
        
        -- Update reference
        UPDATE quotes 
        SET primary_carbon_calculation_id = p_calculation_id,
            updated_at = now()
        WHERE id = v_calc.quote_id;
    END IF;
    
    -- Set this calculation as primary
    UPDATE carbon_calculations 
    SET is_primary = true 
    WHERE id = p_calculation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert CarbonCare variable definitions
INSERT INTO carbon_calculation_variables (variable_name, display_name, unit, category, description, display_order) VALUES
('distance_km', 'Distance', 'km', 'distance', 'Total shipment distance in kilometers', 1),
('emissions_tot', 'Total Emissions', 'kg CO₂', 'emissions', 'Total CO₂ emissions for the shipment', 2),
('emissions_ops', 'Operations Emissions', 'kg CO₂', 'emissions', 'CO₂ emissions from operations', 3),
('emissions_ene', 'Energy Emissions', 'kg CO₂', 'emissions', 'CO₂ emissions from energy consumption', 4),
('emissions_tot_ei', 'Emission Intensity', 'g CO₂/tonne-km', 'efficiency', 'Grams of CO₂ per tonne-kilometre', 5),
('emissions_tkm', 'Tonne-Kilometres', 'tonne-km', 'efficiency', 'Transport work measured in tonne-kilometres', 6),
('compensation_chf', 'Compensation Cost', 'CHF', 'offset', 'Cost to compensate emissions in Swiss Francs', 7),
('carboncare_shipment_id', 'CarbonCare ID', 'text', 'metadata', 'Unique identifier from CarbonCare system', 8),
('carboncare_db_id', 'Database ID', 'number', 'metadata', 'CarbonCare database record ID', 9),
('carboncare_report_url', 'Report URL', 'URL', 'metadata', 'Link to detailed CarbonCare report', 10),
('status_is_error', 'Error Status', 'boolean', 'status', 'Whether calculation encountered an error', 11),
('status_error_code', 'Error Code', 'number', 'status', 'CarbonCare error code if applicable', 12),
('status_error_message', 'Error Message', 'text', 'status', 'Description of any calculation error', 13)
ON CONFLICT (variable_name) DO NOTHING;

-- ============================================================================
-- PHASE 11: SKIPPED - PERMISSIONS (Will be handled with RLS separately)
-- ============================================================================
-- Permissions will be granted along with RLS policies in a separate migration

-- ============================================================================
-- PHASE 12: DATA VALIDATION QUERIES (RUN AFTER MIGRATION)
-- ============================================================================

-- Create a verification function
CREATE OR REPLACE FUNCTION verify_migration()
RETURNS TABLE (
    check_name text,
    status text,
    details text
) AS $$
BEGIN
    -- Check if new table exists
    RETURN QUERY
    SELECT 
        'shipment_change_requests table'::text,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'shipment_change_requests'
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Table creation check'::text;
    
    -- Check if new columns exist in bids
    RETURN QUERY
    SELECT 
        'bids new columns'::text,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bids' 
            AND column_name IN ('needs_confirmation_at', 'confirmed_at', 'revision')
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Columns added to bids table'::text;
    
    -- Check if new columns exist in shipments
    RETURN QUERY
    SELECT 
        'shipments new columns'::text,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'shipments' 
            AND column_name IN ('cancelled_at', 'cancelled_by', 'cancellation_reason')
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Columns added to shipments table'::text;
    
    -- Check if unique constraint is fixed
    RETURN QUERY
    SELECT 
        'shipments unique constraint'::text,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'shipments_quote_id_active_unique'
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Partial unique index created'::text;
    
    -- Check if indexes exist
    RETURN QUERY
    SELECT 
        'Performance indexes'::text,
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_change_requests_shipment_id'
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Indexes created for performance'::text;
    
    -- Check if carbon tables exist
    RETURN QUERY
    SELECT 
        'carbon_calculations table'::text,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'carbon_calculations'
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Carbon calculations table created'::text;
    
    -- Check if carbon variables table exists
    RETURN QUERY
    SELECT 
        'carbon_calculation_variables table'::text,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'carbon_calculation_variables'
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Carbon variables lookup table created'::text;
    
    -- Check if carbon reference columns added
    RETURN QUERY
    SELECT 
        'carbon reference columns'::text,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'shipments' 
            AND column_name = 'primary_carbon_calculation_id'
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Carbon calculation references added'::text;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Run this after migration to verify success:
-- SELECT * FROM verify_migration();

-- ============================================================================
-- ROLLBACK SCRIPT (Save separately as 001_rollback.sql)
-- ============================================================================
/*
BEGIN;

-- Remove policies
DROP POLICY IF EXISTS "Partners view own change requests" ON shipment_change_requests;
DROP POLICY IF EXISTS "Clients view their shipment change requests" ON shipment_change_requests;
DROP POLICY IF EXISTS "Partners create change requests" ON shipment_change_requests;
DROP POLICY IF EXISTS "Clients respond to change requests" ON shipment_change_requests;

-- Remove functions
DROP FUNCTION IF EXISTS cancel_shipment CASCADE;
DROP FUNCTION IF EXISTS confirm_bid CASCADE;
DROP FUNCTION IF EXISTS approve_change_request CASCADE;
DROP FUNCTION IF EXISTS verify_migration CASCADE;
DROP FUNCTION IF EXISTS validate_change_request_proposal CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- Remove table
DROP TABLE IF EXISTS shipment_change_requests CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;

-- Remove columns from shipments
ALTER TABLE shipments 
DROP COLUMN IF EXISTS cancelled_at,
DROP COLUMN IF EXISTS cancelled_by,
DROP COLUMN IF EXISTS cancellation_reason;

-- Remove columns from bids
ALTER TABLE bids 
DROP COLUMN IF EXISTS needs_confirmation_at,
DROP COLUMN IF EXISTS confirmed_at,
DROP COLUMN IF EXISTS revision,
DROP COLUMN IF EXISTS shortlisted_by,
DROP COLUMN IF EXISTS shortlisted_at;

-- Restore original unique constraint
DROP INDEX IF EXISTS shipments_quote_id_active_unique;
ALTER TABLE shipments ADD CONSTRAINT shipments_quote_id_key UNIQUE (quote_id);

-- Remove custom types
DROP TYPE IF EXISTS change_request_type CASCADE;
DROP TYPE IF EXISTS change_request_status CASCADE;

-- Note: Cannot remove enum values once added

COMMIT;
*/