-- ============================================================================
-- Rollback Migration: Dynamic Bid/Shipment Changes
-- Version: 001_rollback
-- Date: 2025-08-09
-- Description: Safely rolls back all changes from 001_dynamic_bid_shipment_changes.sql
-- ============================================================================

-- IMPORTANT: Review data loss implications before running this rollback
-- Any data in new columns/tables will be lost

BEGIN;

-- ============================================================================
-- PHASE 1: SKIPPED - RLS policies not created in main migration
-- ============================================================================
-- No RLS policies to remove as they were not created

-- ============================================================================
-- PHASE 2: REMOVE FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Remove business logic functions
DROP FUNCTION IF EXISTS cancel_shipment(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS confirm_bid(uuid) CASCADE;
DROP FUNCTION IF EXISTS approve_change_request(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS verify_migration() CASCADE;
DROP FUNCTION IF EXISTS set_primary_carbon_calculation(uuid) CASCADE;

-- Remove validation and trigger functions
DROP FUNCTION IF EXISTS validate_change_request_proposal() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================================================
-- PHASE 3: BACKUP DATA (Optional - uncomment if you want to preserve data)
-- ============================================================================

/*
-- Create backup tables to preserve data before rollback
CREATE TABLE IF NOT EXISTS _backup_shipment_change_requests AS 
SELECT * FROM shipment_change_requests;

CREATE TABLE IF NOT EXISTS _backup_shipments_cancelled AS 
SELECT id, cancelled_at, cancelled_by, cancellation_reason 
FROM shipments 
WHERE cancelled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS _backup_bids_confirmation AS 
SELECT id, needs_confirmation_at, confirmed_at, revision, shortlisted_by, shortlisted_at 
FROM bids 
WHERE needs_confirmation_at IS NOT NULL OR confirmed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS _backup_audit_log AS 
SELECT * FROM audit_log;
*/

-- ============================================================================
-- PHASE 4: DROP TABLES
-- ============================================================================

DROP TABLE IF EXISTS shipment_change_requests CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS carbon_calculations CASCADE;
DROP TABLE IF EXISTS carbon_calculation_variables CASCADE;

-- ============================================================================
-- PHASE 5: REMOVE COLUMNS FROM EXISTING TABLES
-- ============================================================================

-- Remove columns from shipments table
ALTER TABLE shipments 
DROP CONSTRAINT IF EXISTS check_cancellation_fields;

ALTER TABLE shipments 
DROP COLUMN IF EXISTS cancelled_at CASCADE,
DROP COLUMN IF EXISTS cancelled_by CASCADE,
DROP COLUMN IF EXISTS cancellation_reason CASCADE;

-- Remove columns from bids table
ALTER TABLE bids 
DROP COLUMN IF EXISTS needs_confirmation_at CASCADE,
DROP COLUMN IF EXISTS confirmed_at CASCADE,
DROP COLUMN IF EXISTS revision CASCADE,
DROP COLUMN IF EXISTS shortlisted_by CASCADE,
DROP COLUMN IF EXISTS shortlisted_at CASCADE,
DROP COLUMN IF EXISTS primary_carbon_calculation_id CASCADE;

-- Remove carbon reference columns from other tables
ALTER TABLE shipments
DROP COLUMN IF EXISTS primary_carbon_calculation_id CASCADE;

ALTER TABLE quotes
DROP COLUMN IF EXISTS primary_carbon_calculation_id CASCADE;

-- ============================================================================
-- PHASE 6: RESTORE ORIGINAL CONSTRAINTS
-- ============================================================================

-- Remove the partial unique index
DROP INDEX IF EXISTS shipments_quote_id_active_unique;

-- Restore the original unique constraint (only if no duplicates exist)
DO $$
BEGIN
    -- Check if we can safely add the unique constraint
    IF NOT EXISTS (
        SELECT quote_id, COUNT(*) 
        FROM shipments 
        GROUP BY quote_id 
        HAVING COUNT(*) > 1
    ) THEN
        ALTER TABLE shipments 
        ADD CONSTRAINT shipments_quote_id_key UNIQUE (quote_id);
    ELSE
        RAISE NOTICE 'Cannot restore unique constraint on shipments.quote_id due to duplicates';
    END IF;
END $$;

-- ============================================================================
-- PHASE 7: REMOVE INDEXES
-- ============================================================================

-- Remove performance indexes that were added
DROP INDEX IF EXISTS idx_shipments_logistics_partner_id;
DROP INDEX IF EXISTS idx_bids_logistics_partner_id;
DROP INDEX IF EXISTS idx_bids_quote_id;
DROP INDEX IF EXISTS idx_quotes_owner_org_id;
DROP INDEX IF EXISTS idx_change_requests_shipment_id;
DROP INDEX IF EXISTS idx_change_requests_status;
DROP INDEX IF EXISTS idx_change_requests_initiated_by;
DROP INDEX IF EXISTS idx_bids_needs_confirmation;
DROP INDEX IF EXISTS idx_shipments_cancelled;
DROP INDEX IF EXISTS idx_audit_log_record;
DROP INDEX IF EXISTS idx_audit_log_user;

-- Remove carbon-related indexes
DROP INDEX IF EXISTS idx_carbon_primary_shipment;
DROP INDEX IF EXISTS idx_carbon_primary_quote;
DROP INDEX IF EXISTS idx_carbon_primary_bid;
DROP INDEX IF EXISTS idx_carbon_calc_shipment;
DROP INDEX IF EXISTS idx_carbon_calc_quote;
DROP INDEX IF EXISTS idx_carbon_calc_bid;
DROP INDEX IF EXISTS idx_carbon_calc_primary;

-- ============================================================================
-- PHASE 8: REMOVE CUSTOM TYPES
-- ============================================================================

-- Remove custom enum types (this will fail if still in use)
DROP TYPE IF EXISTS change_request_type CASCADE;
DROP TYPE IF EXISTS change_request_status CASCADE;

-- Note: We CANNOT remove values from existing enum types (bid_status, shipment_status)
-- The added values ('needs_confirmation', 'pending_approval') will remain

-- ============================================================================
-- PHASE 9: SKIPPED - PERMISSIONS (Not granted in main migration)
-- ============================================================================

-- No permissions to revoke as they were not granted

-- ============================================================================
-- PHASE 10: VERIFICATION
-- ============================================================================

-- Create rollback verification function
CREATE OR REPLACE FUNCTION verify_rollback()
RETURNS TABLE (
    check_name text,
    status text,
    details text
) AS $$
BEGIN
    -- Check if table was removed
    RETURN QUERY
    SELECT 
        'shipment_change_requests removed'::text,
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'shipment_change_requests'
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Table removal check'::text;
    
    -- Check if columns were removed from bids
    RETURN QUERY
    SELECT 
        'bids columns removed'::text,
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bids' 
            AND column_name IN ('needs_confirmation_at', 'confirmed_at', 'revision')
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Columns removed from bids table'::text;
    
    -- Check if columns were removed from shipments
    RETURN QUERY
    SELECT 
        'shipments columns removed'::text,
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'shipments' 
            AND column_name IN ('cancelled_at', 'cancelled_by', 'cancellation_reason')
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Columns removed from shipments table'::text;
    
    -- Check if functions were removed
    RETURN QUERY
    SELECT 
        'functions removed'::text,
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname IN ('cancel_shipment', 'confirm_bid', 'approve_change_request')
        ) THEN 'PASS' ELSE 'FAIL' END::text,
        'Business logic functions removed'::text;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- POST-ROLLBACK VERIFICATION
-- ============================================================================

-- Run this after rollback to verify success:
-- SELECT * FROM verify_rollback();

-- Clean up verification function after checking:
-- DROP FUNCTION verify_rollback();

-- ============================================================================
-- DATA RECOVERY (if backup was created)
-- ============================================================================

/*
-- If you created backup tables and need to reference the data:
-- SELECT * FROM _backup_shipment_change_requests;
-- SELECT * FROM _backup_shipments_cancelled;
-- SELECT * FROM _backup_bids_confirmation;
-- SELECT * FROM _backup_audit_log;

-- Clean up backup tables when no longer needed:
-- DROP TABLE IF EXISTS _backup_shipment_change_requests;
-- DROP TABLE IF EXISTS _backup_shipments_cancelled;
-- DROP TABLE IF EXISTS _backup_bids_confirmation;
-- DROP TABLE IF EXISTS _backup_audit_log;
*/