-- ============================================================================
-- Migration Verification Queries
-- Run these to confirm the migration completed successfully
-- ============================================================================

-- 1. Run the built-in verification function
SELECT * FROM verify_migration();

-- 2. Check that all new tables exist
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_name IN ('shipment_change_requests', 'carbon_calculations', 'carbon_calculation_variables', 'audit_log')
AND table_schema = 'public'
ORDER BY table_name;

-- 3. Verify new columns were added
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'shipments' 
AND column_name IN ('cancelled_at', 'cancelled_by', 'cancellation_reason', 'primary_carbon_calculation_id')
AND table_schema = 'public'
UNION ALL
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'bids'
AND column_name IN ('needs_confirmation_at', 'confirmed_at', 'revision', 'shortlisted_by', 'shortlisted_at', 'primary_carbon_calculation_id')
AND table_schema = 'public'
ORDER BY column_name;

-- 4. Check that helper functions exist
SELECT 
    proname as function_name,
    pronargs as arg_count
FROM pg_proc
WHERE proname IN ('cancel_shipment', 'confirm_bid', 'approve_change_request', 'set_primary_carbon_calculation')
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;

-- 5. Verify carbon calculation variables were inserted
SELECT 
    variable_name,
    display_name,
    unit,
    category
FROM carbon_calculation_variables
ORDER BY display_order
LIMIT 5;

-- 6. Check enum values were added
SELECT 
    t.typname as enum_name,
    string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN ('bid_status', 'shipment_status', 'change_request_type', 'change_request_status')
GROUP BY t.typname
ORDER BY t.typname;