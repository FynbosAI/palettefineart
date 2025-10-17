-- First, let's check what already exists in your database
-- Run these queries to understand current state:

-- Check existing tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('quote_artworks', 'audit_log', 'quote_shipment_map', 'quote_audit_events');

-- Check existing columns on artworks table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'artworks'
AND column_name IN ('quote_id', 'quote_artwork_id', 'verified_condition', 'verified_at', 'verified_by');

-- Check existing columns on quotes table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'quotes'
AND column_name IN ('submitted_at', 'submitted_by', 'locked_at', 'cancelled_at', 'cancelled_by', 'cancellation_reason');

-- Check existing columns on shipments table  
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'shipments'
AND column_name IN ('quote_id', 'is_consolidated', 'consolidation_notes', 'parent_shipment_id');

-- Check existing columns on bids table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'bids'
AND column_name IN ('accepted_at', 'accepted_by');

-- Check existing constraints
SELECT constraint_name, table_name 
FROM information_schema.table_constraints 
WHERE constraint_schema = 'public' 
AND constraint_name IN ('unique_bid_per_partner_per_quote', 'artworks_single_parent_check');

-- Check existing functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('accept_bid', 'accept_bid_with_compliance', 'consolidate_quotes_to_shipment', 'create_audit_log');